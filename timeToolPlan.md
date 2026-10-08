# Plan: native `time` tool

## Goal

Agents can read the user's current local time for the fewest tokens possible.

## Decision

A zero-argument native tool `time` that reads the OS clock when called and returns one line:

```
2026-10-08 Wed 14:32 -05:00
```

About 12 output tokens, plus a 1-line description and an empty schema (about 25 tokens of tool
definition per request, cached with the rest of the tool list).

Why not a "stored value":
- The OS clock is already the accurate stored value. Reading `new Date()` costs nothing, so no
  cache, timer, or state is needed.
- Putting the live time in the system prompt (`session/system.ts:89` already has
  `Today's date`) would change the prompt every turn and break prompt caching for everything
  after it. Keep the date there (stable per day); the tool covers time of day.

Rejected alternative: inject a time line into every user message. Cache-safe (appended at the
end) but costs tokens on every turn whether the agent needs it or not. Only revisit if agents
fail to call the tool when they should.

## Steps

1. `src/packages/opencode/src/tool/time.ts` + `time.txt`
   - Model after `tool/run-after-turn.ts` (`Tool.define`, `Schema.Struct({})`), minus events
     and permission ask: reading the clock needs no approval.
   - Format locally, no dependency:
     `YYYY-MM-DD Ddd HH:MM ±HH:MM` from `getFullYear/getMonth/getDate/getDay/getHours/getMinutes`
     and `getTimezoneOffset()` (sign inverted: offset 300 means `-05:00`).
   - `title`: the same string. `metadata: {}`.
   - `time.txt`: `Returns the user's current local date, time, and UTC offset.`
2. `tool/registry.ts`: import `TimeTool`, `yield*` it next to `runAfterTurn` (~:121), and add it
   to the built-in list wherever `runAfterTurn` is listed. Check the agent permission defaults
   so `time` is allowed for every agent, including read-only/plan agents.
3. Claude Code provider (Claude Code has no clock tool, so this is the path that matters most
   in this harness):
   - `provider/claude-code/proxy-tool-defs.ts` (~:388): add a def
     `{ name: "time", description: "User's current local date, time, and UTC offset.",
       inputSchema: { type: "object", properties: {} } }`.
   - `provider/claude-code/proxy-tool-selection.ts:43` `PROXY_DEF_OPENCODE_TOOL`: add
     `time: "time"`. Also add to the name map at ~:48 if that map gates static defs.
   - `provider/claude-code/types.ts:372` `DEFAULT_PROXY_TOOL_NAMES`: add `"time"` if static
     defs are only offered when listed there. Trace how `run_after_turn` flows from def to
     opencode execution and mirror it exactly; do not add a new route.
   - Do not add it to `READ_ONLY_DENIED_PROXY_TOOLS` (`permission-presets.ts:83`).
4. Prompt hint (optional, one line): if the Claude Code proxy injects a tool guide listing
   `mcp__opencode_proxy__*` tools, add `time` there in the same terse style. Skip otherwise; the
   tool description is enough.

## Checks

- Unit: `packages/opencode/test/tool/time.test.ts`: execute the tool, assert output matches
  `/^\d{4}-\d{2}-\d{2} (Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d{2}:\d{2} [+-]\d{2}:\d{2}$/` and the date
  part equals the local date of `new Date()`. Run only this file from `packages/opencode`.
- Fake-model scenario (AGENTS.md: every new Claude-provider feature gets one): extend
  `test/provider/claude-code/fake-model.test.ts` with a case where `TestLLMServer` calls
  `mcp__opencode_proxy__time` and the result string matches the regex above.
- No pane check: the TUI shows it as a normal tool call.
- Live check for the user after build/install: ask an agent "what time is it?" in both a native
  provider session and a Claude Code session; it should call `time` once and answer correctly.

## Finish

- Bump `.version/version` revision, `build-notes` entry, `FORK.md` line for the new tool.
- Do not build or install; tell the user to run the installer with `-NoBuild` after
  `.scripts\build.ps1`.
