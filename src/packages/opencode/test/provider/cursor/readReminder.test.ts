import { afterAll, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { rejectEchoedReadReminder } from "@/provider/cursor/protocol/editRemap.js"
import type { ParsedExecRequest } from "@/provider/cursor/protocol/execParse.js"
import { buildTypedExecResult } from "@/provider/cursor/protocol/execResult.js"

// Real instruction files: the echo guard only counts reminders that quote a file that exists.
const repo = mkdtempSync(path.join(tmpdir(), "read-reminder-repo-"))
afterAll(() => rmSync(repo, { recursive: true, force: true }))
for (const [dir, text] of [
  ["sub", "Use tabs.\n"],
  ["other", "Use spaces.\n"],
]) {
  mkdirSync(path.join(repo, dir!))
  writeFileSync(path.join(repo, dir!, "AGENTS.md"), text!)
}

// Shape tool/read.ts emits for a file under a folder with its own AGENTS.md.
const output = [
  "<path>/repo/sub/a.ts</path>",
  "<type>file</type>",
  "<content>",
  "1: const a = 1",
  "",
  "(End of file - total 1 lines)",
  "</content>",
  "",
  "<system-reminder>",
  `Instructions from: ${path.join(repo, "sub", "AGENTS.md")}`,
  "Use tabs.",
  "</system-reminder>",
].join("\n")

test("nested AGENTS.md reminder survives Cursor read_result conversion", () => {
  const result = buildTypedExecResult("read_result", output, undefined, "read", { path: "/repo/sub/a.ts" }) as {
    success: { content: string }
  }
  expect(result.success.content).toStartWith("const a = 1\n\n<system-reminder>\n")
  expect(result.success.content).toContain("Use tabs.\n</system-reminder>")
})

test("nested AGENTS.md reminder survives Cursor mcp read conversion as its own item", () => {
  const result = buildTypedExecResult("mcp_result", output, undefined, "read") as {
    success: { content: { text: { text: string } }[] }
  }
  const items = result.success.content.map((item) => item.text.text)
  expect(items[0]).toBe("const a = 1")
  expect(items.some((text) => text.includes("Use tabs."))).toBe(true)
})

// The native read content above carries the reminder; a model writing that content back whole used to
// put the reminder into the file.
test("a whole-file write echoing the read reminder is refused, even with lines after it", () => {
  const echoed = (
    buildTypedExecResult("read_result", output, undefined, "read", { path: "/repo/sub/a.ts" }) as {
      success: { content: string }
    }
  ).success.content
  const parsed = (toolName: string, args: Record<string, unknown>) =>
    ({ id: 1, execId: "e", resultField: "write_result", toolName, args }) as ParsedExecRequest
  const write = parsed("write", { filePath: "/repo/sub/a.ts", content: echoed })
  rejectEchoedReadReminder(write)
  expect(write.localError).toContain("NO FILE CHANGE WAS MADE")

  const patchText = [
    "*** Begin Patch",
    "*** Add File: /repo/sub/a.ts",
    ...echoed.split("\n").map((l) => `+${l}`),
    "*** End Patch",
  ]
  const patch = parsed("apply_patch", { patchText: patchText.join("\n") })
  rejectEchoedReadReminder(patch)
  expect(patch.localError).toContain("NO FILE CHANGE WAS MADE")

  // What a live Cursor model did: pasted the read back, reminder included, then appended a line.
  const appended = parsed("write", { filePath: "/repo/sub/a.ts", content: `${echoed}\ndone\n` })
  rejectEchoedReadReminder(appended)
  expect(appended.localError).toContain("NO FILE CHANGE WAS MADE")

  const mentioned = parsed("write", { filePath: "/repo/x.ts", content: 'const tag = "<system-reminder>"\n' })
  rejectEchoedReadReminder(mentioned)
  expect(mentioned.localError).toBeUndefined()

  // A file that already holds such a block stays writable.
  const dir = mkdtempSync(path.join(tmpdir(), "read-reminder-"))
  try {
    const fixture = path.join(dir, "transcript.txt")
    writeFileSync(fixture, `${echoed}\n`)
    const rewrite = parsed("write", { filePath: fixture, content: `changed\n${echoed}\n` })
    rejectEchoedReadReminder(rewrite)
    expect(rewrite.localError).toBeUndefined()

    // That exception covers only its own file; CRLF and trailing blank lines do not hide an echo.
    const plus = (body: string) => body.split("\n").map((l) => `+${l}`)
    const twoFiles = parsed("apply_patch", {
      patchText: [
        "*** Begin Patch",
        `*** Add File: ${fixture}`,
        ...plus(echoed),
        `*** Add File: ${path.join(dir, "new.ts")}`,
        ...plus(`${echoed}\n\n`),
        "*** End Patch",
      ].join("\n"),
    })
    rejectEchoedReadReminder(twoFiles)
    expect(twoFiles.localError).toContain("new.ts")
    const crlf = parsed("write", { filePath: path.join(dir, "crlf.ts"), content: echoed.replaceAll("\n", "\r\n") })
    rejectEchoedReadReminder(crlf)
    expect(crlf.localError).toContain("NO FILE CHANGE WAS MADE")

    // An edit inserting it, a second new block behind one the file has, and an indented patch header.
    const edit = parsed("edit", { filePath: path.join(dir, "e.ts"), oldString: "a", newString: `a\n${echoed}` })
    rejectEchoedReadReminder(edit)
    expect(edit.localError).toContain("NO FILE CHANGE WAS MADE")
    const other = echoed.replace(path.join(repo, "sub"), path.join(repo, "other")).replace("Use tabs.", "Use spaces.")
    const second = parsed("write", { filePath: fixture, content: `${echoed}\n${other}\n` })
    rejectEchoedReadReminder(second)
    expect(second.localError).toContain("NO FILE CHANGE WAS MADE")
    const indented = parsed("apply_patch", {
      patchText: [
        "*** Begin Patch",
        `  *** Add File: ${path.join(dir, "i.ts")}`,
        ...plus(echoed),
        "*** End Patch",
      ].join("\n"),
    })
    rejectEchoedReadReminder(indented)
    expect(indented.localError).toContain("NO FILE CHANGE WAS MADE")

    // A `*** Move to:` line does not end the file's section.
    const moved = parsed("apply_patch", {
      patchText: [
        "*** Begin Patch",
        `*** Update File: ${path.join(dir, "m.ts")}`,
        `*** Move to: ${path.join(dir, "n.ts")}`,
        "@@",
        "-a",
        ...plus(echoed),
        "*** End Patch",
      ].join("\n"),
    })
    rejectEchoedReadReminder(moved)
    expect(moved.localError).toContain("NO FILE CHANGE WAS MADE")

    // A reminder whose AGENTS.md was edited after the read still counts.
    const edited = parsed("write", {
      filePath: path.join(dir, "edited.ts"),
      content: echoed.replace("Use tabs.", "Use tabs (old text)."),
    })
    rejectEchoedReadReminder(edited)
    expect(edited.localError).toContain("NO FILE CHANGE WAS MADE")

    // A new file quoting a reminder the read tool could not have produced (made-up path) stays writable.
    const madeUp = echoed.replace(path.join(repo, "sub", "AGENTS.md"), "/nowhere/AGENTS.md")
    const fixtureFile = parsed("write", { filePath: path.join(dir, "fixture.txt"), content: `${madeUp}\n` })
    rejectEchoedReadReminder(fixtureFile)
    expect(fixtureFile.localError).toBeUndefined()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
