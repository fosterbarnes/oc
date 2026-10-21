import { describe, expect, test } from "bun:test"
import type { Part } from "@opencode-ai/sdk/v2"
import {
  attachmentLabel,
  deduplicateImageParts,
  expandTrackedPastedText,
  promptFromParts,
  stripPromptPartIDs,
  typedSlashCommands,
} from "../../src/prompt/part"

describe("prompt part", () => {
  test("strips persisted IDs from reused parts", () => {
    expect(
      stripPromptPartIDs({
        id: "prt_old",
        sessionID: "ses_old",
        messageID: "msg_old",
        type: "file" as const,
        mime: "image/png",
        filename: "tiny.png",
        url: "data:image/png;base64,abc",
      }),
    ).toEqual({
      type: "file",
      mime: "image/png",
      filename: "tiny.png",
      url: "data:image/png;base64,abc",
    })
  })

  test("rebuilds a command message as the typed prompt", () => {
    const ids = { sessionID: "ses_old", messageID: "msg_old" }
    const parts = [
      {
        ...ids,
        id: "prt_text",
        type: "text",
        text: "[/spit is active: ...]\n\nTemplate\n\nfix it",
        metadata: { ocCommands: ["spit"], ocCommandArguments: "fix it" },
      },
      { ...ids, id: "prt_note", type: "text", text: "hidden", synthetic: true },
      { ...ids, id: "prt_file", type: "file", mime: "text/plain", filename: "a.ts", url: "file:///a.ts" },
    ] as Part[]
    expect(promptFromParts(parts)).toEqual({
      input: "/spit fix it",
      parts: [{ type: "file", mime: "text/plain", filename: "a.ts", url: "file:///a.ts" }],
    })
  })

  test("preserves wide characters around pasted text", () => {
    const marker = "[Pasted ~3 lines]"
    const prefix = "你好你好\n"

    expect(
      expandTrackedPastedText(prefix + marker + "\n阿斯顿法国红酒看来", [
        {
          start: Bun.stringWidth("你好你好") + 1,
          end: Bun.stringWidth("你好你好") + 1 + Bun.stringWidth(marker),
          text: "public:\n\tvoid ExecuteTask();\nprivate:",
        },
      ]),
    ).toBe("你好你好\npublic:\n\tvoid ExecuteTask();\nprivate:\n阿斯顿法国红酒看来")
  })

  test("only expands the tracked placeholder occurrence", () => {
    const marker = "[Pasted ~3 lines]"
    const prefix = `keep ${marker} then `

    expect(
      expandTrackedPastedText(prefix + marker + " tail", [
        {
          start: Bun.stringWidth(prefix),
          end: Bun.stringWidth(prefix + marker),
          text: "alpha\nbeta\ngamma",
        },
      ]),
    ).toBe(`keep ${marker} then alpha\nbeta\ngamma tail`)
  })

  test("finds commands in typed text only and keeps pasted text verbatim", () => {
    const marker = "[Pasted ~2 lines]"
    const prefix = "/spit 你好 "
    const commands = typedSlashCommands(
      `${prefix}${marker} /think`,
      [
        {
          start: Bun.stringWidth(prefix),
          end: Bun.stringWidth(prefix + marker),
          text: "notes: run /imp now $&\n",
        },
      ],
      [{ name: "spit" }, { name: "think" }, { name: "imp" }],
    )
    expect(commands).toEqual({ names: ["spit", "think"], arguments: "你好 notes: run /imp now $&\n" })
  })
})

describe("prompt attachments", () => {
  const image = (url: string, label: string, filename = "clipboard") => ({
    type: "file" as const,
    mime: "image/png",
    filename,
    url,
    source: { type: "file" as const, path: filename, text: { start: 0, end: label.length, value: label } },
  })

  test("reuses labels for identical image data", () => {
    const parts = [image("data:image/png;base64,AAA", "[Image 1]")]
    expect(attachmentLabel(parts, { mime: "image/png", url: "data:image/png;base64,AAA", filename: "clipboard" })).toBe(
      "[Image 1]",
    )
    expect(attachmentLabel(parts, { mime: "image/png", url: "data:image/png;base64,BBB", filename: "clipboard" })).toBe(
      "[Image 2]",
    )
  })

  test("does not reuse a label when the filename differs", () => {
    const parts = [image("data:image/png;base64,AAA", "[Image 1]", "one.png")]
    expect(attachmentLabel(parts, { mime: "image/png", url: "data:image/png;base64,AAA", filename: "two.png" })).toBe(
      "[Image 2]",
    )
  })

  test("numbers PDFs independently and never repeats a removed number", () => {
    const parts = [image("data:image/png;base64,BBB", "[Image 2]")]
    expect(attachmentLabel(parts, { mime: "application/pdf", url: "data:application/pdf;base64,CCC" })).toBe("[PDF 1]")
    expect(attachmentLabel(parts, { mime: "image/png", url: "data:image/png;base64,CCC" })).toBe("[Image 3]")
  })

  test("sends a repeated image once and keeps other parts", () => {
    const first = image("data:image/png;base64,AAA", "[Image 1]")
    const second = image("data:image/png;base64,BBB", "[Image 2]")
    const pdf = { type: "file" as const, mime: "application/pdf", url: "data:application/pdf;base64,CCC" }
    const parts = [first, pdf, second, { ...first, source: { ...first.source } }, pdf]
    expect(deduplicateImageParts(parts)).toEqual([first, pdf, second, pdf])
  })
})
