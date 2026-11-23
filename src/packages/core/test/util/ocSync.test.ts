import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Global } from "../../src/global"
import { OcItems } from "../../src/util/ocItems"
import { OcSync } from "../../src/util/ocSync"

// Every machine must pick the same winner, and an unsynced local edit that loses must be reported.
describe("decide", () => {
  const remote = (at: number, hash = "r", deleted = false): OcSync.ManifestEntry => ({
    id: "skill:config:a",
    hash,
    at,
    tags: [],
    ...(deleted ? { deleted: true as const } : {}),
  })
  const local = (at: number, hash = "l", base?: string) => ({ hash, at, tags: [], base })

  test("newer remote wins, older is ignored, equal hash is the same", () => {
    expect(OcSync.decide(local(1, "l", "l"), remote(2), [])).toBe("take")
    expect(OcSync.decide(local(3, "l", "l"), remote(2), [])).toBe("skip")
    expect(OcSync.decide(local(1, "r"), remote(2, "r"), [])).toBe("same")
  })

  test("equal times break the same way on both machines", () => {
    expect(OcSync.decide(local(5, "a", "a"), remote(5, "b"), [])).toBe("take")
    expect(OcSync.decide(local(5, "b", "b"), remote(5, "a"), [])).toBe("skip")
  })

  test("a newer remote over an unsynced local edit is a conflict", () => {
    expect(OcSync.decide(local(1, "l", "old"), remote(2), [])).toBe("conflict")
  })

  test("missing locally: take an item, ignore a tombstone", () => {
    expect(OcSync.decide(undefined, remote(1), [])).toBe("take")
    expect(OcSync.decide(undefined, remote(1, "", true), [])).toBe("skip")
  })

  test("excluded by prefix or by a tag on either side", () => {
    expect(OcSync.decide(undefined, remote(1), ["skill:"])).toBe("skip")
    expect(OcSync.decide({ ...local(1), tags: ["windows"] }, remote(2), ["tag:windows"])).toBe("skip")
  })

  test("machine-only oc keys are skipped even when the remote is newer", () => {
    const entry = (id: string): OcSync.ManifestEntry => ({ id, hash: "r", at: 2, tags: [] })
    expect(OcSync.decide(local(1, "l", "l"), entry("oc:claudeAccountNames"), [])).toBe("skip")
    expect(OcSync.decide(undefined, entry("oc:claudeAccountNames"), [])).toBe("skip")
    expect(OcSync.decide(local(1, "l", "l"), entry("oc:claudeAccounts"), [])).toBe("take")
  })
})

// Scans and pulls against temp config, home, and state folders. `applyPulled` with no entries runs a
// fresh rescan and writes state.json.
describe("on disk", () => {
  let root = ""
  const saved = { config: "", state: "", home: undefined as string | undefined }
  const commands = () => path.join(Global.Path.config, "commands")
  const peer = { ip: "127.0.0.1", name: "peer" }
  const rescan = () => OcSync.applyPulled(peer, [], new Map(), [])
  const state = async () =>
    JSON.parse(await fs.readFile(path.join(Global.Path.state, "sync", "state.json"), "utf8")) as Record<
      string,
      { deleted?: true }
    >

  beforeEach(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "oc-sync-disk-")))
    saved.config = Global.Path.config
    saved.state = Global.Path.state
    saved.home = process.env.OPENCODE_TEST_HOME
    Global.Path.config = path.join(root, "config")
    Global.Path.state = path.join(root, "state")
    process.env.OPENCODE_TEST_HOME = root
    await fs.mkdir(path.join(commands(), "locked"), { recursive: true })
    await fs.writeFile(path.join(commands(), "top.md"), "top")
    await fs.writeFile(path.join(commands(), "locked", "inner.md"), "inner")
  })

  afterEach(async () => {
    await fs.chmod(path.join(commands(), "locked"), 0o755).catch(() => undefined)
    Global.Path.config = saved.config
    Global.Path.state = saved.state
    if (saved.home === undefined) delete process.env.OPENCODE_TEST_HOME
    else process.env.OPENCODE_TEST_HOME = saved.home
    await fs.rm(root, { recursive: true, force: true })
  })

  test.skipIf(process.platform === "win32")("an unreadable subfolder leaves no tombstone", async () => {
    await rescan()
    expect((await state())["command:config:commands/locked/inner.md"]).toBeDefined()
    await fs.chmod(path.join(commands(), "locked"), 0o000)
    await rescan()
    expect((await state())["command:config:commands/locked/inner.md"]?.deleted).toBeUndefined()
  })

  test.skipIf(process.platform === "win32")("a dangling link leaves no tombstone", async () => {
    await rescan()
    await fs.rm(path.join(commands(), "top.md"))
    await fs.symlink(path.join(root, "missing.md"), path.join(commands(), "top.md"))
    await rescan()
    expect((await state())["command:config:commands/top.md"]?.deleted).toBeUndefined()
  })

  // F4: a folder swapped for a link is held: no tombstone, off the manifest, and a peer's change or
  // tombstone for it is skipped, so nothing is written through the link.
  test("a held item keeps its state, leaves the manifest, and survives a pull", async () => {
    const id = "command:config:commands/locked/inner.md"
    await rescan()
    const outside = path.join(root, "outside")
    await fs.mkdir(outside)
    await fs.writeFile(path.join(outside, "inner.md"), "private")
    await fs.rm(path.join(commands(), "locked"), { recursive: true })
    await fs.symlink(outside, path.join(commands(), "locked"), "junction")
    const before = (await state())[id]
    await rescan()
    expect((await state())[id]).toEqual(before)
    expect((await OcSync.manifest()).entries.map((entry) => entry.id)).not.toContain(id)
    const at = Date.now() + 1000
    const incoming: OcItems.Item = {
      kind: "files",
      id: "command:config:commands/locked/new.md",
      category: "command",
      label: "new.md",
      code: false,
      root: "config",
      files: [{ path: "commands/locked/new.md", text: "x" }],
    }
    const result = await OcSync.applyPulled(
      peer,
      [
        { id, hash: "", at, tags: [], deleted: true },
        { id: incoming.id, hash: "n", at, tags: [] },
      ],
      new Map([[incoming.id, incoming]]),
      [],
    )
    expect(result.applied).toEqual([])
    expect(await fs.readdir(outside)).toEqual(["inner.md"])
    expect((await state())[id]).toEqual(before)
  })

  test("a removed folder becomes a tombstone", async () => {
    await rescan()
    await fs.rm(commands(), { recursive: true })
    await rescan()
    expect((await state())["command:config:commands/top.md"]?.deleted).toBe(true)
  })

  test("an item whose body disagrees with the manifest is dropped", async () => {
    const entry = (id: string): OcSync.ManifestEntry => ({ id, hash: `h-${id}`, at: Date.now() + 1000, tags: [] })
    const item = (id: string, root: OcItems.Root, file: string, category: OcItems.Category = "command") => ({
      kind: "files" as const,
      id,
      category,
      label: file,
      code: false,
      root,
      files: [{ path: file, text: "peer" }],
    })
    const ids = {
      root: "command:config:commands/root.md",
      body: "command:config:commands/body.md",
      tagged: "code:config:scripts/tagged.ps1",
      good: "command:config:commands/good.md",
    }
    const fetched = new Map<string, OcItems.Item>([
      [ids.root, item(ids.root, "legacy", "commands/root.md")],
      [ids.body, item("command:config:commands/other.md", "config", "commands/other.md")],
      [ids.tagged, item(ids.tagged, "config", "scripts/tagged.ps1", "code")],
      [ids.good, item(ids.good, "config", "commands/good.md")],
    ])
    const result = await OcSync.applyPulled(peer, Object.values(ids).map(entry), fetched, ["tag:windows"])
    expect(result.applied).toEqual([ids.good])
    expect(await fs.readFile(path.join(commands(), "good.md"), "utf8")).toBe("peer")
    const written = await Promise.all(
      [
        path.join(root, ".opencode", "commands", "root.md"),
        path.join(commands(), "other.md"),
        path.join(commands(), "body.md"),
        path.join(Global.Path.config, "scripts", "tagged.ps1"),
      ].map((file) => fs.exists(file)),
    )
    expect(written).toEqual([false, false, false, false])
  })
})
