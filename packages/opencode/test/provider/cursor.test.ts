import { describe, expect, test } from "bun:test"
import { createCursor } from "@/provider/cursor"
import { resolveAgentOrigin } from "@/provider/cursor/transport/connect"
import { mapCursorArgsToOpencode } from "@/provider/cursor/protocol/tools"

describe("native Cursor provider", () => {
  test("creates a language model without starting the proxy", () => {
    const sdk = createCursor({ name: "cursor", accessToken: "token" })
    expect(sdk.languageModel("gpt-4o").provider).toBe("cursor")
  })

  test("accepts only Cursor agent origins", () => {
    expect(resolveAgentOrigin("https://agentn.us.api5.cursor.sh")).toBe("https://agentn.us.api5.cursor.sh")
    expect(() => resolveAgentOrigin("https://example.com")).toThrow()
  })

  test("maps native delete to the host shell", () => {
    const mapped = mapCursorArgsToOpencode("bash", { path: "C:\\temp\\file.txt" }, "delete_args")
    expect(mapped.toolName).toBe("bash")
    expect(mapped.args.command).toContain(process.platform === "win32" ? "Remove-Item -LiteralPath" : "rm -f --")
  })
})
