import { expect, test } from "bun:test"
import { buildTypedExecResult } from "@/provider/cursor/protocol/execResult.js"

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
  "Instructions from: /repo/sub/AGENTS.md",
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
