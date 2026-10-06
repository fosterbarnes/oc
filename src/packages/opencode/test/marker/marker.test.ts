import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { MarkersFile } from "@opencode-ai/core/util/markers-file"
import { Marker } from "../../src/marker/marker"

const bun = process.execPath
const inline = (code: string, extra: Partial<Marker.Command> = {}): Marker.Command => ({
  run: [bun, "-e", code],
  mode: "inline",
  ask: false,
  timeout: 30,
  ...extra,
})

async function config(contents: unknown) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "markers-"))
  const file = path.join(dir, "markers.json")
  await fs.writeFile(file, typeof contents === "string" ? contents : JSON.stringify(contents))
  return file
}

describe("Marker.find", () => {
  test("only bare marker lines outside code fences count, once each", () => {
    const text = [
      "intro",
      "$#build",
      "$#build  ",
      "\\$#test",
      "run $#test now",
      " $#test",
      "```",
      "$#fenced",
      "```",
      "$#second\r",
    ].join("\n")
    expect(Marker.find(text)).toEqual(["build", "second"])
  })

  test("replace swaps known markers and keeps everything else", () => {
    const text = "a\r\n$#build\r\n$#unknown\r\n```\n$#build\n```"
    const out = Marker.replace(text, new Map([["build", "built"]]))
    expect(out).toBe("a\r\nbuilt\r\n$#unknown\r\n```\n$#build\n```")
  })
})

describe("Marker.read", () => {
  test("missing, invalid, or disabled files mean the feature is off", async () => {
    expect(await Marker.read(path.join(os.tmpdir(), "no-such-markers.json"))).toBeUndefined()
    expect(await Marker.read(await config("{ not json"))).toBeUndefined()
    expect(await Marker.read(await config({ commands: { a: { run: ["x"], mode: "inline" } } }))).toBeUndefined()
  })

  test("validates commands and applies the global ask default", async () => {
    const file = await config(
      [
        "// alpha warning comment",
        JSON.stringify({
          enabled: true,
          ask: true,
          commands: {
            build: { run: ["pwsh", "-File", "b.ps1"], mode: "window", description: "Build" },
            quiet: { run: ["x"], mode: "inline", ask: false, timeout: 5 },
            badMode: { run: ["x"], mode: "shell" },
            badRun: { run: "x", mode: "inline" },
            "bad-name": { run: ["x"], mode: "inline" },
          },
        }),
      ].join("\n"),
    )
    const result = await Marker.read(file)
    expect(Object.keys(result!.commands)).toEqual(["build", "quiet"])
    expect(result!.commands.build).toMatchObject({ ask: true, timeout: 30, description: "Build" })
    expect(result!.commands.quiet).toMatchObject({ ask: false, timeout: 5 })
  })
})

describe("Marker.prompt", () => {
  test("lists commands only when some are enabled", () => {
    expect(Marker.prompt(undefined)).toBeUndefined()
    expect(Marker.prompt({ commands: {} })).toBeUndefined()
    const text = Marker.prompt({
      commands: { build: { run: ["x"], mode: "window", description: "Build oc", ask: false, timeout: 30 } },
    })!
    expect(text).toContain("- build (window): Build oc")
    expect(text).toContain("\\$#name")
    expect(Marker.find(text)).toEqual([])
  })
})

describe("MarkersFile.setMarkersEnabled", () => {
  test("creates the warning template off, then flips enabled keeping comments and commands", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "markers-toggle-"))
    const file = path.join(dir, "markers.json")
    expect(MarkersFile.markersEnabled(file)).toBe(false)
    MarkersFile.setMarkersEnabled(false, file)
    expect(await fs.readFile(file, "utf8")).toContain("ALPHA")
    await fs.writeFile(
      file,
      (await fs.readFile(file, "utf8")).replace('"commands": {}', '"commands": { "a": { "run": ["x"], "mode": "inline" } }'),
    )
    MarkersFile.setMarkersEnabled(true, file)
    expect(MarkersFile.markersEnabled(file)).toBe(true)
    expect(Object.keys((await Marker.read(file))!.commands)).toEqual(["a"])
    expect(await fs.readFile(file, "utf8")).toContain("ALPHA")
  })
})

describe("Marker.run", () => {
  test("inline output replaces the line; failures and timeouts are reported", async () => {
    expect(await Marker.run("hi", inline("console.log('hello')"), "ses_test")).toBe("hello")
    expect(await Marker.run("quiet", inline("void 0"), "ses_test")).toBe("quiet: done")
    expect(await Marker.run("bad", inline("console.error('boom'); process.exit(3)"), "ses_test")).toBe(
      "bad: exit 3: boom",
    )
    expect(await Marker.run("slow", inline("setTimeout(() => {}, 10000)", { timeout: 0.2 }), "ses_test")).toBe(
      "slow: timed out after 0.2s",
    )
    expect(await Marker.run("missing", inline("", { run: [path.join(os.tmpdir(), "no-such.exe")] }), "ses_test")).toStartWith(
      "missing: failed to start",
    )
  })

  test("window args run the argument list in a kept-open pwsh", () => {
    const args = Marker.windowArgs({ run: ["C:\\a b\\x.ps1", "it's"], mode: "window", ask: false, timeout: 30 })
    expect(args.slice(0, 3)).toEqual(["-NoExit", "-NoProfile", "-EncodedCommand"])
    expect(Buffer.from(args[3], "base64").toString("utf16le")).toBe("& 'C:\\a b\\x.ps1' 'it''s'")
  })

  test("afterTurn commands wait for flush", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "markers-after-"))
    const marker = path.join(dir, "ran.txt")
    const command = inline(`require("fs").writeFileSync(${JSON.stringify(marker)}, "ok")`, { mode: "afterTurn" })
    expect(await Marker.queue("later", command, "ses_after")).toBe("later: runs after this turn")
    Marker.flush("ses_other")
    await Bun.sleep(300)
    expect(await Bun.file(marker).exists()).toBe(false)
    Marker.flush("ses_after")
    for (let i = 0; i < 100 && !(await Bun.file(marker).exists()); i++) await Bun.sleep(100)
    expect(await Bun.file(marker).exists()).toBe(true)
  }, 20_000)
})
