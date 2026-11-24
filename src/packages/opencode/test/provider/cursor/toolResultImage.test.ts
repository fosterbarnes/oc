import { describe, expect, test } from "bun:test"
import { extractCursorHistoryImages } from "@/provider/cursor/imageInput.js"
import { extractTrailingToolResults } from "@/provider/cursor/prompt.js"

// 1x1 PNG. AI SDK 6 maps OpenCode's tool `media` image attachment to `image-data`.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
const prompt = [
  { role: "user", content: [{ type: "text", text: "look at shot.png" }] },
  {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "cursor_sess_1",
        toolName: "read",
        output: {
          type: "content",
          value: [
            { type: "text", text: "Image read successfully" },
            { type: "image-data", data: PNG, mediaType: "image/png" },
          ],
        },
      },
    ],
  },
] as never

describe("cursor tool-result images", () => {
  test("read image is attached on a fresh Run", async () => {
    const out = await extractCursorHistoryImages(prompt, { supportsImages: true })
    expect(out.images).toHaveLength(1)
    expect(out.images[0]!.mimeType).toBe("image/png")
  })

  test("held-open continuation tells the model the image is not inline", () => {
    const [result] = extractTrailingToolResults(prompt)
    expect(result?.output).toContain("Image read successfully")
    expect(result?.output).toContain("image/png attachment")
  })
})
