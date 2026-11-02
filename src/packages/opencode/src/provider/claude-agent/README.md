# Claude Agent provider (`claude-agent`)

Port of upstream OpenCode 2's Claude Agent provider onto oc's v1 session loop. It runs the user's own `claude`
through Anthropic's Agent SDK as an ordinary model: Claude Code's built-in tools are off, Claude gets oc's tools as
an in-process MCP server, and oc runs every call (permissions included). Behavior contract:
`upstream/dev:specs/v2/claude-agent-provider.md`. It is separate from oc's `claude-code` provider; nothing is shared.

Ported from upstream `dev` at `173f6c6` (provider `f29e281`, login-hint fix `ef3a7f1`).

## Layout

- `upstream/`: upstream's `packages/core/src/plugin/provider/claude-agent/` files, unchanged except lines marked
  `// oc`. Left out: `index.ts`, `aisdk.ts`, `integration.ts`, `provider.ts`, `session.ts`, `instructions.ts`
  (V2 plugin glue) and `claude/agent-sdk.workerd.ts`.
- `id.ts`: stands in for `@opencode/schema/provider`.
- `storage.ts`: upstream's plugin storage, as JSON files under `<data>/claude-agent/`.
- `catalog.ts`: upstream `provider.ts`'s saved model list, prices and model shape, as v1 `Provider.Info`.
- `runtime.ts`: upstream `index.ts`/`aisdk.ts`: one runtime per instance directory, the language model factory,
  idle timers and `/connect`.
- Tests: `test/plugin/provider/claude-agent/` (upstream's, imports rewritten; `plugin.test.ts` left out) and
  `test/provider/claude-agent/fakeModel.test.ts` (oc's end-to-end scenarios).

## `// oc` edits in `upstream/`

- `claude/io.ts`: `which` uses `Bun.which` plus `cliCommand`, so a Windows npm `.cmd` shim maps to `claude.exe`.
- `claude/probe.ts`: `Schema.TaggedErrorClass` (oc's Effect beta name for `Schema.TaggedError`).
- `claude/session.ts`: casts the prompt `ReadableStream` to `AsyncIterable` for oc's DOM lib types.
- `language-model/*`, `tools/result.ts`: `Provider` imports from `../../id.js`.

## Where v1 replaces V2 hooks

| Upstream                                        | oc                                                                                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `provider.ts` catalog, `ctx.provider.transform` | `catalog.ts`; injected into provider state and the `/provider` list                                                    |
| `aisdk.ts` SDK hook                             | `claude-agent` custom loader `getModel` in `provider/provider.ts`                                                      |
| `integration.ts` login method                   | `plugin/claude-agent.ts` (auto OAuth method that waits for `claude auth login`)                                        |
| `model.request` hook (kind and fork headers)    | `session/llm/request.ts` (`claudeAgentKind`, `forkSourceID` from `Session.FORK_SOURCE_METADATA_KEY`)                   |
| `context` hook (`maxTokens`, tool error flags)  | `request.ts` (`claudeAgentMaxOutput`); `message-v2.ts` marks stopped tool results                                      |
| `retry` hook                                    | `session/retry.ts`                                                                                                     |
| `instructions.ts` keyed sources                 | `prompt.ts`/`sideQuestion.ts` leave out environment and base prompt; `request.ts` passes agent prompt and instructions |
| execution events, idle                          | `session/status.ts` calls `ClaudeAgentRuntime.idle`                                                                    |

Known difference: a model list that changes after connecting (a new Claude Code version) shows on the next
provider load, not live.

## Re-sync

1. `git fetch upstream`, then `git diff 173f6c6 upstream/dev -- packages/core/src/plugin/provider/claude-agent packages/core/test/plugin/provider/claude-agent specs/v2/claude-agent-provider.md`.
2. Apply changes to `upstream/` and the tests, keeping the `// oc` lines. Changes to the left-out glue files map to
   the table above.
3. Update the SHA here, then run `bun test test/plugin/provider/claude-agent test/provider/claude-agent` from
   `packages/opencode`.
