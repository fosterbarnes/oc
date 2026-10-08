# Plan: live context usage while a Claude Code turn runs

## Symptom

Screenshot `C:\Users\user\Downloads\wezterm-gui_b6JS7L8WgY.png`: during a long Claude Code
provider turn, the prompt footer's right side shows `tab agents  ctrl+p commands` instead of
`<tokens> (<pct>) . $cost`, and the sidebar shows `Context 0 tokens 0% used $0.00 spent`.

## Root cause (verified)

- Footer: `src/packages/tui/src/component/prompt/index.tsx:270` `usage()` takes the last assistant
  message with `tokens.output > 0`; if none, the `<Match when={true}>` at ~1819 shows the agent
  hints. Sidebar context uses the same message tokens.
- The Claude Code provider runs the whole agentic loop (many API calls + tools) inside ONE AI SDK
  stream. `provider/claude-code/turn-stream.ts` keeps per-call usage in `this.lastCall`
  (updated at :516 on `message_delta`, :657 on `assistant` lines) but only emits it in the single
  `finish` at the end (:961, :1187).
- `session/processor.ts:493` `step-finish` is the only place that writes
  `assistantMessage.tokens` + `updateMessage`. So tokens stay 0 until the whole turn ends.
- First turn of a session: no prior message, so footer and sidebar are empty for the full run
  (minutes). Later turns: they show the previous turn's stale numbers.

## Fix (smallest correct, uses an existing path)

Emit interim usage from the provider as a raw chunk and apply it in the processor. A raw-chunk
path already exists for Copilot (`session/llm.ts:337` `includeRawChunks`,
`session/llm/ai-sdk.ts:277` `case "raw"`).

1. `provider/claude-code/turn-stream.ts`: after `this.lastCall` is updated (both :516 and :657,
   top-level calls only, i.e. not `parent_tool_use_id` subagent calls), enqueue
   `{ type: "raw", rawValue: { claudeCodeUsage: toUsage(contextUsage(this.lastCall)) } }`.
   Reuse `toUsage`/`contextUsage` from `./usage.js` so numbers match the final `finish`.
   Check `StreamWriter` (:211) has or gets a plain `enqueue` for this.
2. `session/llm.ts:337`: also set `includeRawChunks` when the model is the Claude Code provider
   (match how that provider id is detected elsewhere; do not string-guess).
3. `session/llm/ai-sdk.ts:277`: if `rawValue.claudeCodeUsage` is present, return a new
   `LLMEvent.usage({ usage })` (add the event to the LLMEvent schema next to step-finish).
   Keep the Copilot line as is.
4. `session/processor.ts`: add `case "usage"`: compute
   `Session.getUsage({ model: ctx.model, usage: value.usage })`, set
   `ctx.assistantMessage.tokens = usage.tokens` (do NOT add cost: the final step-finish adds it,
   adding here would double count), then `session.updateMessage(ctx.assistantMessage)`.
   No step parts, no snapshot, no overflow check (Claude Code compacts itself).
5. Rate: one event per internal API call (message_delta), which is naturally low. No throttle.

Cost stays `$0.00`/hidden until the turn ends; context tokens and % update live. That is the
reported problem. Live cost would need per-call pricing and is out of scope.

## Checks

- Fake-model scenario (AGENTS.md: every Claude-provider feature gets one): extend
  `test/provider/claude-code/fake-model.test.ts` with a turn that makes 2+ model calls via
  `TestLLMServer`; assert the assistant message has `tokens.output > 0` before the turn's final
  `finish` (subscribe to message updates), and final tokens equal the last call's usage.
- Pane check (`tui-pane.test.ts`, `OC_TUI_PANE=1`): during a slow fake turn, footer shows a token
  count, not `agents`.
- Live check for the user: start a fresh session on Claude Code, send a prompt that runs tools;
  footer right side and sidebar Context should show tokens within a few seconds.

## Risks

- `Session.getUsage` input shape: confirm it accepts the provider's usage object without
  `providerMetadata`.
- Subagent (`parent_tool_use_id`) calls must not overwrite the main context number.
- `EventV2`/sync: `updateMessage` already runs per step for other providers; no schema change.
