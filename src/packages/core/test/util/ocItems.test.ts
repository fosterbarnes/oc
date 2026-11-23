import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Global } from "../../src/global"
import { OcItems } from "../../src/util/ocItems"

// Inline credentials must never leave the serving machine, and the importer must keep its own.
describe("secrets", () => {
  test("redact hides inline keys and keeps references", () => {
    const value = {
      options: { apiKey: "sk-live", baseURL: "https://x" },
      headers: { Authorization: "Bearer abc" },
      env: { apiKey: "{env:KEY}", token: "{file:~/.key}" },
    }
    expect(OcItems.redact(value)).toEqual({
      options: { apiKey: OcItems.REDACTED, baseURL: "https://x" },
      headers: { Authorization: OcItems.REDACTED },
      env: { apiKey: "{env:KEY}", token: "{file:~/.key}" },
    })
  })

  test("restoreRedacted keeps the local value or drops the key", () => {
    const peer = { options: { apiKey: OcItems.REDACTED, baseURL: "u" }, other: { token: OcItems.REDACTED } }
    expect(OcItems.restoreRedacted(peer, { options: { apiKey: "sk-local" } })).toEqual({
      options: { apiKey: "sk-local", baseURL: "u" },
      other: {},
    })
  })

  test("toWire redacts a top-level secret scalar and fromWire restores the local one", () => {
    const item = (value: string): OcItems.Item => ({
      kind: "key",
      id: "oc:githubToken",
      category: "oc",
      label: "githubToken",
      code: false,
      file: "oc",
      path: ["githubToken"],
      value,
    })
    const wire = OcItems.toWire(item("ghp_secret"))
    expect(wire.kind === "key" && wire.value).toBe(OcItems.REDACTED)
    const restored = OcItems.fromWire(wire, item("ghp_local"))
    expect(restored.kind === "key" && restored.value).toBe("ghp_local")
  })
})

describe("rewriteHome", () => {
  test("maps every Windows form to forward slashes", () => {
    const from = "C:\\Users\\Foster"
    expect(OcItems.rewriteHome('"C:\\\\Users\\\\Foster\\\\a\\\\b.md"', from, "/Users/foster")).toBe(
      '"/Users/foster/a/b.md"',
    )
    expect(OcItems.rewriteHome("see c:/users/foster/x y", from, "/Users/foster")).toBe("see /Users/foster/x y")
    expect(OcItems.rewriteHome("/home/fb/.config", "/home/fb", from)).toBe("C:/Users/Foster/.config")
  })

  test("leaves a longer folder name with the same prefix alone", () => {
    expect(OcItems.rewriteHome("C:\\Users\\FosterX\\a", "C:\\Users\\Foster", "/Users/foster")).toBe(
      "C:\\Users\\FosterX\\a",
    )
  })
})

// Sync exclusions: re-including one item inside an excluded group must not re-include its siblings.
describe("exclude tree", () => {
  const item = (id: string): OcItems.Item => {
    const [category, root, label] = id.split(":")
    return {
      kind: "files",
      id,
      category: category as OcItems.Category,
      label,
      code: false,
      root: root as OcItems.Root,
      files: [],
    }
  }
  const items = ["skill:config:a/one", "skill:config:a/two", "skill:config:b", "skill:legacy:c"].map(item)
  const nodes = OcItems.tree(items)
  const excludedIds = (exclude: string[]) =>
    items.filter((entry) => OcItems.excluded(entry.id, [], exclude)).map((entry) => entry.id)

  test("including a leaf under an excluded category brings back only that leaf", () => {
    const category = nodes.find((node) => node.key === "skill:")!
    const leaf = nodes.find((node) => node.key === "skill:config:a/one")!
    const exclude = OcItems.includeNode(OcItems.excludeNode([], category), leaf, nodes)
    expect(excludedIds(exclude)).toEqual(["skill:config:a/two", "skill:config:b", "skill:legacy:c"])
  })

  test("an item key does not cover a longer id with the same start", () => {
    expect(OcItems.excluded("tui:theme_mode", [], ["tui:theme"])).toBe(false)
    expect(OcItems.excluded("tui:theme", [], ["tui:theme"])).toBe(true)
  })
})

// Config folder names differ per machine, so claudeAccountNames stays here; the email-keyed claudeAccounts syncs.
describe("machine-only oc keys", () => {
  test("machineOnly holds for claudeAccountNames and not for synced keys", () => {
    expect(OcItems.machineOnly("oc:claudeAccountNames")).toBe(true)
    expect(OcItems.machineOnly("oc:mirror")).toBe(true)
    expect(OcItems.machineOnly("oc:mirror.hosts")).toBe(true)
    expect(OcItems.machineOnly("oc:claudeAccounts")).toBe(false)
    expect(OcItems.machineOnly("opencode:provider.x")).toBe(false)
  })

  describe("collect", () => {
    let root = ""
    let savedConfig = ""
    let savedHome: string | undefined

    beforeEach(async () => {
      root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "oc-items-collect-")))
      savedConfig = Global.Path.config
      savedHome = process.env.OPENCODE_TEST_HOME
      Global.Path.config = path.join(root, "config")
      process.env.OPENCODE_TEST_HOME = root
      await fs.mkdir(Global.Path.config, { recursive: true })
      await fs.writeFile(
        path.join(Global.Path.config, "oc.json"),
        JSON.stringify({
          claudeAccounts: { "a@example.invalid": { enabled: true } },
          claudeAccountNames: { a: "Work" },
        }),
      )
    })

    afterEach(async () => {
      Global.Path.config = savedConfig
      if (savedHome === undefined) delete process.env.OPENCODE_TEST_HOME
      else process.env.OPENCODE_TEST_HOME = savedHome
      await fs.rm(root, { recursive: true, force: true })
    })

    test("produces claudeAccounts but not claudeAccountNames", async () => {
      const ids = (await OcItems.collect()).items.map((item) => item.id)
      expect(ids).toContain("oc:claudeAccounts")
      expect(ids).not.toContain("oc:claudeAccountNames")
    })
  })
})

// A folder or entry the scan cannot read must not look like a deletion; a removed one must.
describe("collect and apply on disk", () => {
  let root = ""
  let savedConfig = ""
  let savedHome: string | undefined
  const commands = () => path.join(Global.Path.config, "commands")

  beforeEach(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "oc-items-disk-")))
    savedConfig = Global.Path.config
    savedHome = process.env.OPENCODE_TEST_HOME
    Global.Path.config = path.join(root, "config")
    process.env.OPENCODE_TEST_HOME = root
    await fs.mkdir(commands(), { recursive: true })
    await fs.writeFile(path.join(commands(), "top.md"), "top")
  })

  afterEach(async () => {
    await fs.chmod(path.join(commands(), "locked"), 0o755).catch(() => undefined)
    Global.Path.config = savedConfig
    if (savedHome === undefined) delete process.env.OPENCODE_TEST_HOME
    else process.env.OPENCODE_TEST_HOME = savedHome
    await fs.rm(root, { recursive: true, force: true })
  })

  test.skipIf(process.platform === "win32")("an unreadable subfolder marks its category partial", async () => {
    await fs.mkdir(path.join(commands(), "locked"))
    await fs.writeFile(path.join(commands(), "locked", "inner.md"), "inner")
    await fs.chmod(path.join(commands(), "locked"), 0o000)
    const collected = await OcItems.collect()
    expect(collected.partial.has("command:config")).toBe(true)
    expect(collected.items.map((item) => item.id)).toContain("command:config:commands/top.md")
  })

  // F4 changed this on purpose: a link is held (never followed), no longer a partial category.
  test.skipIf(process.platform === "win32")("a dangling link is held, not partial", async () => {
    await fs.symlink(path.join(root, "missing.md"), path.join(commands(), "link.md"))
    const collected = await OcItems.collect()
    expect(collected.held.get("command:config:commands/link.md")).toBe("link")
    expect(collected.partial.size).toBe(0)
  })

  // F4: nothing behind a link, shortcut, or Finder alias is read; a held file holds its whole skill.
  test("links, linked folders, shortcuts, and aliases are held, not collected", async () => {
    const config = Global.Path.config
    const outside = path.join(root, "outside")
    await fs.mkdir(outside)
    await fs.writeFile(path.join(outside, "secret.md"), "private")
    await fs.symlink(outside, path.join(commands(), "linked"), "junction")
    await fs.mkdir(path.join(config, "prompts"))
    await fs.writeFile(path.join(config, "prompts", "site.url"), "[InternetShortcut]")
    await fs.writeFile(path.join(config, "prompts", "alias"), Buffer.from("book\0\0\0\0mark\0\0", "latin1"))
    await fs.writeFile(path.join(config, "prompts", "bookmarks.md"), "book notes")
    await fs.mkdir(path.join(config, "skills", "mixed"), { recursive: true })
    await fs.writeFile(path.join(config, "skills", "mixed", "SKILL.md"), "skill")
    await fs.symlink(outside, path.join(config, "skills", "mixed", "refs"), "junction")
    // iCloud stubs stand for the evicted file, so the real item is held.
    await fs.writeFile(path.join(config, "prompts", ".evicted.md.icloud"), "stub")
    await fs.mkdir(path.join(config, "skills", "cloud"))
    await fs.writeFile(path.join(config, "skills", "cloud", ".SKILL.md.icloud"), "stub")
    const collected = await OcItems.collect()
    const ids = collected.items.map((item) => item.id)
    expect(ids).toContain("command:config:commands/top.md")
    expect(ids).toContain("prompt:config:prompts/bookmarks.md")
    expect(ids.filter((id) => /secret|site|alias|mixed/.test(id))).toEqual([])
    expect(Object.fromEntries(collected.held)).toEqual({
      "command:config:commands/linked": "link",
      "prompt:config:prompts/site.url": "shortcut",
      "prompt:config:prompts/alias": "Finder alias",
      "skill:config:mixed": "link",
      "prompt:config:prompts/evicted.md": "cloud placeholder",
      "skill:config:cloud": "cloud placeholder",
    })
    expect(OcItems.isHeld("command:config:commands/linked/secret.md", collected.held)).toBe(true)
    expect(OcItems.isHeld("command:config:commands/linkedX.md", collected.held)).toBe(false)
  })

  test("a linked top folder holds its whole category", async () => {
    const outside = path.join(root, "outside")
    await fs.mkdir(path.join(outside, "a"), { recursive: true })
    await fs.writeFile(path.join(outside, "a", "SKILL.md"), "skill")
    await fs.symlink(outside, path.join(Global.Path.config, "skills"), "junction")
    const collected = await OcItems.collect()
    expect(collected.items.some((item) => item.category === "skill")).toBe(false)
    expect(OcItems.isHeld("skill:config:a", collected.held)).toBe(true)
  })

  test("a removed folder is gone, not partial", async () => {
    expect((await OcItems.collect()).items.map((item) => item.id)).toContain("command:config:commands/top.md")
    await fs.rm(commands(), { recursive: true })
    const collected = await OcItems.collect()
    expect(collected.items.map((item) => item.id)).not.toContain("command:config:commands/top.md")
    expect(collected.partial.size).toBe(0)
  })

  const command = (file: string): OcItems.Item => ({
    kind: "files",
    id: `command:config:commands/${file}`,
    category: "command",
    label: file,
    code: false,
    root: "config",
    files: [{ path: `commands/${file}`, text: "new" }],
  })

  test.skipIf(process.platform === "win32")(
    "apply refuses a link that resolves outside the allowed roots",
    async () => {
      await fs.mkdir(path.join(root, "outside"))
      await fs.writeFile(path.join(root, "outside", "x.md"), "old")
      await fs.symlink(path.join(root, "outside", "x.md"), path.join(commands(), "x.md"))
      await expect(OcItems.apply([command("x.md")], { backupRoot: path.join(root, "backups") })).rejects.toThrow(
        /Refusing to write .*x\.md/,
      )
      expect(await fs.readFile(path.join(root, "outside", "x.md"), "utf8")).toBe("old")
      expect((await fs.lstat(path.join(commands(), "x.md"))).isSymbolicLink()).toBe(true)
    },
  )

  test.skipIf(process.platform === "win32")("apply writes through a link into a Claude skills folder", async () => {
    const skill = path.join(root, ".claude", "skills", "s", "SKILL.md")
    await fs.mkdir(path.dirname(skill), { recursive: true })
    await fs.writeFile(skill, "old")
    await fs.symlink(skill, path.join(commands(), "y.md"))
    await OcItems.apply([command("y.md")], { backupRoot: path.join(root, "backups") })
    expect(await fs.readFile(skill, "utf8")).toBe("new")
    expect((await fs.lstat(path.join(commands(), "y.md"))).isSymbolicLink()).toBe(true)
  })
})
