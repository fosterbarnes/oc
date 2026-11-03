import type { AssistantMessage, Message, Part } from "@opencode-ai/sdk/v2"
import { commandUse } from "../../prompt/slash"

// Built-in `/prompt` (`Command.Default.PROMPT` in opencode/src/command/index.ts).
const HANDOFF_COMMAND = "prompt"

// Reply text of the newest finished `/prompt` turn, also when composed (`/spit /prompt`). A turn spans every
// assistant step answering one user message; aborted, failed, or still-running turns return nothing.
export function handoffTurn(messages: readonly Message[], parts: (messageID: string) => readonly Part[]) {
  const last = messages.findLast((message): message is AssistantMessage => message.role === "assistant")
  if (!last?.time.completed || last.error || !last.finish || ["tool-calls", "unknown"].includes(last.finish)) return
  const requested = parts(last.parentID).some(
    (part) => part.type === "text" && commandUse(part)?.names.includes(HANDOFF_COMMAND),
  )
  if (!requested) return
  const text = messages
    .filter((message) => message.role === "assistant" && message.parentID === last.parentID)
    .flatMap((message) => parts(message.id).flatMap((part) => (part.type === "text" ? [part.text] : [])))
    .join("\n")
  return { id: last.id, text }
}

// Body of the last top-level fenced block tagged `text`, else of the last top-level block. Fences follow
// CommonMark: a closing fence repeats the opening character at least as many times with nothing after it,
// so shorter fences inside the prompt stay part of it. An unclosed block is a cut-off prompt: nothing.
export function handoffText(text: string) {
  const blocks: { info: string; body: string }[] = []
  let open: { char: string; size: number; indent: number; info: string; lines: string[] } | undefined
  for (const line of text.split(/\r?\n/)) {
    const fence = line.match(/^( {0,3})(`{3,}|~{3,})(.*)$/)
    if (open) {
      if (fence && fence[2][0] === open.char && fence[2].length >= open.size && !fence[3].trim()) {
        blocks.push({ info: open.info, body: open.lines.join("\n") })
        open = undefined
        continue
      }
      open.lines.push(line.replace(new RegExp(`^ {0,${open.indent}}`), ""))
      continue
    }
    // A backtick fence's info string cannot contain backticks (that is inline code).
    if (!fence || (fence[2][0] === "`" && fence[3].includes("`"))) continue
    open = {
      char: fence[2][0],
      size: fence[2].length,
      indent: fence[1].length,
      info: fence[3].trim().split(/\s+/)[0],
      lines: [],
    }
  }
  const block = blocks.findLast((item) => item.info === "text") ?? blocks.at(-1)
  return block?.body
}
