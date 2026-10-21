import type { ModelMessage, Tool } from "ai"
import { Hash } from "@opencode-ai/core/util/hash"

// Opt-in log of which prompt part broke the provider's cache prefix between requests of a session.
// Cursor keeps its own diagnostics (provider/cursor/pump.ts); Claude Code builds its own prompt.

interface Entry {
  readonly label: string
  readonly hash: string
}

export interface Snapshot {
  readonly settings: string
  readonly tools: ReadonlyArray<Entry>
  readonly system: ReadonlyArray<Entry>
  readonly messages: ReadonlyArray<Entry>
}

export type Comparison =
  | { readonly status: "initial" }
  | { readonly status: "stable"; readonly messages: number }
  | { readonly status: "append-only"; readonly previousMessages: number; readonly currentMessages: number }
  | {
      readonly status: "changed"
      readonly component: "settings" | "tools" | "system" | "messages"
      readonly index: number
      readonly label: string
    }

const hash = (value: unknown) => Hash.sha256(JSON.stringify(value) ?? "").slice(0, 16)

/** Settings exclude the output limit: it is fitted per request and is not part of the cached prefix. */
export function snapshot(input: {
  readonly providerID: string
  readonly modelID: string
  readonly system: ReadonlyArray<string>
  readonly messages: ReadonlyArray<ModelMessage>
  readonly tools: Record<string, Tool>
  readonly params: { readonly temperature?: number; readonly topP?: number; readonly topK?: number }
  readonly options: Record<string, unknown>
  readonly toolChoice?: string
}): Snapshot {
  return {
    settings: hash({
      provider: input.providerID,
      model: input.modelID,
      temperature: input.params.temperature,
      topP: input.params.topP,
      topK: input.params.topK,
      options: input.options,
      toolChoice: input.toolChoice,
    }),
    tools: Object.entries(input.tools).map(([name, tool]) => ({
      label: name,
      hash: hash({
        description: tool.description,
        schema: (tool.inputSchema as { jsonSchema?: unknown } | undefined)?.jsonSchema,
      }),
    })),
    system: input.system.map((part, index) => ({ label: `system[${index}]`, hash: hash(part) })),
    messages: input.messages.map((message, index) => ({ label: `${message.role}[${index}]`, hash: hash(message) })),
  }
}

export function compare(previous: Snapshot | undefined, current: Snapshot): Comparison {
  if (!previous) return { status: "initial" }
  if (previous.settings !== current.settings)
    return { status: "changed", component: "settings", index: 0, label: "model settings" }
  const tools = firstChange(previous.tools, current.tools, false)
  if (tools) return { status: "changed", component: "tools", ...tools }
  const system = firstChange(previous.system, current.system, false)
  if (system) return { status: "changed", component: "system", ...system }
  const messages = firstChange(previous.messages, current.messages, true)
  if (messages) return { status: "changed", component: "messages", ...messages }
  if (previous.messages.length === current.messages.length)
    return { status: "stable", messages: current.messages.length }
  return {
    status: "append-only",
    previousMessages: previous.messages.length,
    currentMessages: current.messages.length,
  }
}

function firstChange(previous: ReadonlyArray<Entry>, current: ReadonlyArray<Entry>, allowAppend: boolean) {
  const index = previous.findIndex((entry, index) => entry.hash !== current[index]?.hash)
  if (index >= 0) return { index, label: current[index]?.label ?? previous[index]?.label ?? `entry[${index}]` }
  if (current.length === previous.length || (allowAppend && current.length > previous.length)) return
  return { index: previous.length, label: current[previous.length]?.label ?? `entry[${previous.length}]` }
}

export * as PromptCacheDiagnostics from "./promptCacheDiagnostics"
