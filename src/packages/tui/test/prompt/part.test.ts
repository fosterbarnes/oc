import { describe, expect, test } from "bun:test"
import type { Part } from "@opencode-ai/sdk/v2"
import { expandTrackedPastedText, promptFromParts, stripPromptPartIDs, typedSlashCommands } from "../../src/prompt/part"

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
