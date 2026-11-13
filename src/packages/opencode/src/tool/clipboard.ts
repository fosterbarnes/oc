import { Effect, Schema } from "effect"
import { writeNative } from "@opencode-ai/core/util/clipboard"
import { Tool } from "./tool"

export const Parameters = Schema.Struct({
  text: Schema.String.annotate({ description: "Exact text to place on the user's clipboard." }),
})

// Keeps the macOS `osascript -e` argument and the TUI's OSC 52 copy within safe sizes.
const MAX_BYTES = 64 * 1024

// Copies on the server's machine and reports the real result, so the copy does not depend on a TUI
// being open. The TUI viewing the session also sends OSC 52 (`tui/src/routes/session/index.tsx`),
// which reaches the user's terminal when oc runs over SSH.
export const ClipboardTool = Tool.define(
  "clipboard",
  Effect.gen(function* () {
    return {
      description:
        "Put text on the user's clipboard so they can paste it. Use when the user asks you to copy something, or when you hand them text they must paste elsewhere (a command, a config snippet, a message). Do not use for ordinary answers or code you are writing to files. Pass only the text to paste: a wrapping code fence and trailing newlines are removed.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const text = clean(params.text)
          if (!text.trim()) throw new Error("Clipboard text must not be empty")
          if (Buffer.byteLength(text) > MAX_BYTES) {
            throw new Error("Clipboard text is over 64 KB; write it to a file instead")
          }
          yield* ctx.ask({ permission: "clipboard", patterns: ["*"], always: ["*"], metadata: {} })
          yield* Effect.tryPromise({
            try: () => writeNative(text),
            catch: (error) => new Error(`Could not copy to the clipboard: ${(error as Error).message}`),
          })
          const lines = text.split("\n").length
          return {
            title: "Copied to clipboard",
            output: `Copied ${lines} line${lines === 1 ? "" : "s"} (${text.length} characters) to the user's clipboard. The user sees it in the tool row; do not repeat the text.`,
            metadata: { text },
          }
        }).pipe(Effect.orDie),
    }
  }),
)

// A whole-text code fence would paste the backticks. A trailing newline makes a pasted command run
// at once in shells without bracketed paste. Text with more than one block keeps its fences:
// unwrapping the outer pair would leave the inner ones half-open.
function clean(text: string) {
  const fenced = /^\s*```[^\n]*\n([\s\S]*?)\n?```\s*$/.exec(text)
  const inner = fenced && !/^\s*```/m.test(fenced[1]) ? fenced[1] : text
  return inner.replace(/[\r\n]+$/, "")
}
