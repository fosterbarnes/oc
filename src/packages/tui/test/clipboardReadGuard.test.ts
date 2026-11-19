import { expect, test } from "bun:test"
import { KeyEvent, PasteEvent } from "@opentui/core"
import { Glob } from "bun"
import path from "node:path"
import { read } from "../src/clipboard"

// oc reads the OS clipboard only on the user's paste, in one place: src/clipboard.ts `read`. An upstream
// sync could add another reader silently, so any read form elsewhere fails here.
const PACKAGES = path.resolve(import.meta.dir, "../..")
const ALLOWED = "tui/src/clipboard.ts"
const READS = [
  /\bpbpaste\b/,
  /Get-Clipboard/,
  /\bGetText\(/,
  /\bGetImage\(/,
  /GetFileDropList/,
  /\bwl-paste\b/,
  /\bxclip\b[^\n]*["']-o["']/,
  /the clipboard as\b/,
  /clipboardy\.read/,
  /navigator\.clipboard\.read/,
  /createHostClipboard/,
]

test("only src/clipboard.ts reads the OS clipboard", async () => {
  const hits = []
  for (const dir of ["tui/src", "opencode/src", "core/src"]) {
    for await (const file of new Glob("**/*.{ts,tsx}").scan(path.join(PACKAGES, dir))) {
      const relative = `${dir}/${file}`
      if (relative === ALLOWED) continue
      const text = await Bun.file(path.join(PACKAGES, relative)).text()
      hits.push(...READS.filter((pattern) => pattern.test(text)).map((pattern) => `${relative}: ${pattern}`))
    }
  }
  expect(hits).toEqual([])
})

const host = async () => ({ data: "secret", mime: "text/plain" })

test("a command dispatched by name reads nothing", async () => {
  // Shape of @opentui/keymap createSyntheticCommandEvent, used by keymap.dispatchCommand without a key.
  const synthetic = new KeyEvent({
    name: "command",
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    sequence: "",
    number: false,
    raw: "",
    eventType: "press",
    source: "raw",
  })
  expect(await read(synthetic, { os: "darwin", host })).toBeUndefined()
  expect(await read(undefined as never, { os: "darwin", host })).toBeUndefined()
})

test("a key press or bracketed paste reads", async () => {
  const key = new KeyEvent({
    name: "v",
    ctrl: true,
    meta: false,
    shift: false,
    option: false,
    sequence: "\x16",
    number: false,
    raw: "\x16",
    eventType: "press",
    source: "raw",
  })
  expect(await read(key, { os: "darwin", host })).toEqual({ data: "secret", mime: "text/plain" })
  expect(await read(new PasteEvent(new Uint8Array()), { os: "darwin", host })).toEqual({
    data: "secret",
    mime: "text/plain",
  })
})
