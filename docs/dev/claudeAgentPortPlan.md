# Claude Agent provider port plan

Status 2026-10-30: implemented (Phases 1-5); Phase 6 live check is the user's. Changes from the plan below:
- Fork lineage lives in Claude Agent storage (`forks/<id>`, written only when the source has a Claude record), not
  session metadata: metadata is public API and forks must copy it unchanged.
- No separate status toast: `/connect` waits (up to 5 minutes) until `claude` reports a signed-in account, and chat
  errors carry Claude Code's own message.
- Tool error flags: v1 error results already reach the model as `error-text`, so only stopped calls (interrupt,
  permission or question rejection) are marked, in `message-v2.ts`.
- Tests: upstream's tests live in `test/plugin/provider/claude-agent/` (same layout, so relative imports match); oc's
  end-to-end scenarios are `test/provider/claude-agent/fakeModel.test.ts`.

Goal: port upstream OpenCode 2's Claude Agent provider (`claude-agent`) into oc so it behaves
like upstream does. The existing `claude-code` provider and every oc Claude feature keep working
unchanged.

Decisions (user, 2026-10-30):
- Match upstream first. Account pool, failover, usage meters, auto-resume, warm-up and
  `claudeSettings` stay `claude-code` only. Extending them is a later, separate step.
- Upstream files stay near-verbatim in one folder. A thin oc adapter sits beside them, so later
  upstream fixes apply by diff.
- This overrides the `UPSTREAM-SYNC.md` "never reintroduce V2" rule for this one feature only. The
  V2 engine is still not brought in. Only the provider code moves, rewired onto the v1 loop.

## Upstream source

- Spec: `upstream/dev:specs/v2/claude-agent-provider.md` (Draft). This is the behavior contract.
- Code: `upstream/dev:packages/core/src/plugin/provider/claude-agent/` (33 files, 2360 lines).
- Tests: `upstream/dev:packages/core/test/plugin/provider/claude-agent/`, which includes the
  fake-`claude` runner (`lib/fake-claude.ts`) and replayed JSONL recordings.
- Commits: `f29e281` (provider), `ef3a7f1` (drop the `/login` hint from errors). `8505041` is the
  desktop/web app connect guide: not ported, see Phase 5.
- Baseline at planning time: `upstream/dev` = `173f6c6`. Record the ported SHA in the folder README.

## How it works

`ClaudeAgentLanguageModel.Model` is an AI SDK `LanguageModelV3`, the same interface as oc's
`claudeCodeLanguageModel.ts`. Each `doStream` call:
1. Looks up or starts one long-running `claude` per session through the Agent SDK.
2. Decides how to sync history: continue, catch-up, changed (copy Claude's session at the last
   matching point), or fresh.
3. Exposes the offered tools to Claude as an in-process MCP server (`mcp__opencode__*`).
   Claude's own built-in tools are off.
4. When Claude calls a tool, the hooks hold the call and the stream emits a `tool-call` and ends
   the step. oc runs the tool the same way it would for any model. The next `doStream` call
   delivers the result to the held call, and Claude's turn continues.

So the v1 loop needs no new tool path. It is the same flow as any API model, which is the opposite
of `claude-code`'s `providerExecuted` host tools.

## Layout

`src/packages/opencode/src/provider/claude-agent/`
- `upstream/`: upstream files copied as-is, keeping their folder structure (`claude/`,
  `language-model/`, `sync/`, `tools/`). The only allowed edits are import paths and marked
  `// oc:` lines.
- `adapter/`: oc-only code that replaces upstream's V2 glue.
- `README.md`: ported SHA, list of changed upstream lines, how to re-sync.

### Copy near-verbatim (`upstream/`)

| Files | Import fixes |
|---|---|
| `language-model/*` (7 files) | `@opencode/schema/provider` `Provider.ID.claudeAgent` becomes a local `CLAUDE_AGENT_PROVIDER_ID` |
| `claude/{agent-sdk,sdk,fork,probe,query-options,session,sessions,status}.ts` | none expected |
| `claude/io.ts` | `which` from `util/which.js` becomes `Bun.which` (oc has no `which` util) |
| `sync/*` (5 files), `tools/*` (5 files) | none expected |
| `claude/agent-sdk.workerd.ts` | skip: oc has no workerd build |

### Replaced by `adapter/`

| Upstream (V2) | oc adapter / v1 change |
|---|---|
| `index.ts` plugin `define`, environment/workspace skip | `adapter/index.ts`: one `ClaudeSessions.registry()` per instance, attached in an Effect scope. Disposed on instance dispose, like `claude-code`'s session manager |
| `ctx.storage` (catalog, session records) | JSON files under `Global.Path.data/claude-agent/` (`models.json`, `sessions.json`). Implements `SessionRecord.Storage` |
| `provider.ts` catalog, price source, `ctx.provider.transform` | `adapter/models.ts` plus a `custom()` loader and model injection in `provider/provider.ts`, the same pattern as `ClaudeCodeModels` (`provider.ts:1682`). npm id `@opencode-ai/claude-agent` added to the bundled-provider map (`provider.ts:263`) |
| `aisdk.ts` `ctx.aisdk.hook("sdk")` | The bundled-provider factory returns `{ languageModel: id => new Model(id, deps, connectionEnv(options)) }` |
| `integration.ts` login method and status | Phase 5: connect-dialog entry plus a status toast |
| `session.ts` hooks: `model.request`, `context`, `retry` | v1 edits, see below |
| `instructions.ts` keyed instruction sources | v1 edits, see below |
| Idle event subscription | Subscribe to `SessionStatus.Event.Idle` (`session/status.ts:43`) and call `sessions.idle(sessionID)` |

## v1 touch points

Every change is gated on `providerID === "claude-agent"`. Other providers must produce
byte-identical requests.

1. **System prompt** (`session/prompt.ts:1654`, `session/llm/request.ts:80`)
   - For `claude-agent`, skip `sys.environment(model)` and `instruction.base()`: Claude Code
     writes its own environment and prompt. Keep instructions, MCP instructions and skills.
   - In `request.ts`, put the agent's own prompt (`agent.prompt ?? ""`) in
     `options.claudeCodeAgent` and the joined instruction parts in
     `options.claudeCodeInstructions` under `providerOptions["claude-agent"]`. Run this after
     `experimental.chat.system.transform`, so plugin parts are included.
   - This replaces upstream's keyed `instructions` metadata. v1 has no keyed sources, so dropping
     date/environment happens at the source instead of by key.
   - `SystemPrompt.provider(model)` stays out: Claude Code's preset replaces it, as upstream does.
2. **Request kind headers** (`request.ts`, header block at line 239)
   - `x-opencode-claude-agent-kind`:
     - `primary`: normal turns from `prompt.ts`.
     - `compaction`: `agent.name === "compaction"`.
     - `generate`: `/btw` (`sideQuestion.ts`), session summary.
     - Any other value (title, `small`): utility.
   - `x-opencode-session-id` is already sent (`request.ts:241`).
   - `x-opencode-claude-agent-fork-source`: see item 6.
3. **Output limit**: for `claude-agent`, leave `maxOutputTokens` undefined unless the
   model/agent config sets one. This ports upstream's `context` hook `delete maxTokens`.
   Compaction keeps oc's summary budget.
4. **Tool error flags** (`session/message-v2.ts`, around 345-376 and 633-667): when converting
   messages for `claude-agent`, add `providerOptions["claude-agent"] = { toolError, toolAborted }`
   to error tool results. `toolAborted` covers interrupted tools and permission rejections.
   `tools/result.ts:102` reads these.
5. **No retry**: in `session/retry.ts` / `processor.ts`, never retry `claude-agent` errors. Claude
   Code retries itself, and a turn replay would repeat billing errors.
6. **Fork lineage**: v1 `Session.fork` (`session/session.ts:741`) does not record its source.
   Store it in session metadata (`ocForkSource`, excluded like `ocAutoRename`) and send it as the
   fork header on primary requests. Without this, forks still work but start Claude fresh with a
   full checkpoint. That is functionally fine but costs more cache.
7. **Idle**: wire item from the adapter table above.

## Dependencies

- `@anthropic-ai/claude-agent-sdk@0.3.301`: optional peer plus dev dependency, loaded lazily
  (`claude/sdk.ts`), same as upstream.
- `@modelcontextprotocol/server@2.3.1`: new, kept so `tools/server.ts` stays verbatim. oc
  already ships `@modelcontextprotocol/sdk@1.29.0` (patched); the two coexist.
- Check: `bun build --compile` bundles the SDK JS but not its bundled `claude` binary (about
  270 MB). Installer size must not grow by that.
- Claude Code 2.1.248+ is needed (`verbatimPrompts`). Surface a clear error from the probe on
  older versions.
- Effect: upstream uses 4.0.6, oc uses 4.0.0-beta.83. The APIs upstream uses (`Effect.fn`,
  `Semaphore.makeUnsafe`, `forkDetach`, `timeoutOrElse`, `uninterruptibleMask`,
  `SubscriptionRef`) exist in beta.83. Typecheck will confirm signatures.

## Phases

1. **Scaffold**
   - Copy `upstream/`, fix imports, add deps, write the README.
   - Typecheck only.
2. **Adapter core**
   - Storage, registry lifecycle, bundled-provider factory, model catalog (probe on startup when
     the saved catalog is empty).
   - Provider shows in the model list once `claude` is logged in.
3. **v1 touch points 1-7**
   - Each gated on provider id. Confirm other providers' requests are unchanged with a
     before/after snapshot probe on `LLMRequestPrep.prepare`.
4. **Tests**
   - Port `fake-claude.ts`, the recordings and the provider tests, adapted to drive v1's loop
     (`session/prompt.ts`) instead of the V2 runner.
   - Keep only tests that guard behavior: sync decisions, held-tool continuation,
     interrupt/abort, fork, error mapping, usage.
   - No real tokens.
5. **Connect UX** (TUI, replaces `integration.ts` and app commit `8505041`)
   - `/connect` entry "Claude Agent - Claude Code login (`claude auth login`)" that records the
     choice.
   - Status toast for "not installed" (setup URL), "not logged in", or a probe failure.
   - Re-probe on connect.
6. **Live check** (user-run)
   - Real `claude` login: chat, tools with permission prompts, interrupt, undo/edit, switching
     Claude to/from another model, compaction, `/btw`, title, fork.
   - Then a `claude-code` regression pass with `docs/dev/claudeTestFlow.md`.

## Coexistence

- Separate ids (`claude-agent`/`claude-code`), data folders, processes and session records.
  Nothing is shared.
- `isClaudeCodeProvider()` must stay false for `claude-agent`, so none of `claude-code`'s special
  paths (host tools, steering, failover, account pool) apply to it.
- Both providers spawn the same `claude` binary.
  - `claude-agent` uses the default login (`~/.claude`), or `OPENCODE_CLAUDE_PATH` for the binary.
  - `claude-agent` turns off settings files, CLAUDE.md, hooks, skills and memory through the SDK
    options. That does not touch `claude-code`'s config dirs.
- Sidebar usage meters are per provider id, so `claude-agent` shows no plan usage (as upstream).

## Risks / open items

- Upstream is a Draft with three commits on day one. Expect follow-up fixes and re-sync from the
  README's SHA.
- oc features never tested with a held-tool model: mid-turn steering (oc's queue delivers as a
  new turn, which matches upstream), Context limit handoff, Alt+Q queue, scheduled resume,
  subagent cards. Phase 4/6 must cover them.
- v1 runs several tool calls from one step in parallel. Claude emits them one at a time
  (`readOnlyHint: false`), so a step should never hold more than one call. Verify with a
  recording.
- Price source: oc's models.dev lookup must resolve `anthropic`/`amazon-bedrock`/`google-vertex`/
  `azure` model ids the way `toModel` expects.
- Branding: upstream uses the name "Claude Agent" per the SDK guidelines. Keep it.
- SCOPE.md: record "Claude Agent provider: port (in progress)".
