import { isRecord } from "@opencode-ai/tui/util/record"

export * from "@opencode-ai/tui/util/record"

export function asRecord(value: unknown) {
  return isRecord(value) ? value : undefined
}
