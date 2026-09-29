# RULES FOR AGENTS - WRITTEN BY HUMAN. NEVER MESS WITH THIS SECTION

1. You may not delete previous sections that are not yours
2. Insert new session notes immediately under `# Historical entries (newest first)`. Newest entries stay on top. Do not append at the end of this file.
3. You should date and time the notes
4. Reference previous notes and other relevant sections
5. Make sure mistakes and errors are EXTRA highlighted, so we never make the same mistake twice
6. NEVER, EVER, EVER, UNDER ANY CIRCUMSTANCES DELETE ANYTHING FROM THIS FILE

# AGENT NOTES BEGIN HERE - THIS IS WHERE YOU WRITE

File layout: rules and summaries above; historical session entries below, newest first. Agents add each new entry at the top of that historical section so the insert line and the start-reading line stay the same.

## Entry format

Use skills `base/build-notes` (insert) and `base/build-notes-archive` (rotation) for heading, Agent/User shape, and StrReplace method.

## Archive Rotation

See skill `base/build-notes-archive` for trigger (>1000 lines), verbatim rename to `buildNotes.archiveN.md`, and fresh-file shape.

## Agent Note Language

- Keep `### Agent` notes dense, factual, and written for the next agent.
- Use short, agent-forward vocabulary: `Added`, `Fixed`, `Removed`, `Moved`, `Changed`, `Kept`, `Blocked`, `TODO`, `Risk`, `Note`, `MISTAKE`, and `ERROR`.
- Omit articles and filler words when meaning stays clear: `Fixed null path crash; early return` is preferred over `Fixed the crash caused by a null path by returning early`.
- Keep one idea per bullet.
- Include file, type, method, cause, result, invariant, or risk only when useful for future work.
- Do not shorten away information needed to continue safely.
- Use `MISTAKE:` for an agent-caused mistake, process violation, or incorrect change. Make it explicit and explain the prevention rule.
- Use `ERROR:` for an observed product, build, runtime, or tooling failure that is not necessarily caused by the agent.
- Keep the `Meta` line compact. Include model, mode, and token estimate only when useful.
- Keep `### User` notes in normal plain English. Do not use grug shorthand in User notes.

Example compact Agent notes:

```md
### Agent
- Meta: GPT-5.6 Luna; build; tokens est
- Fixed `Thing::run`: null path crash; early return
- Added `Parser::read`: shared by A/B; removes dupes
- Kept `LegacyMode`: external callers depend on it
- MISTAKE: edited release notes; agents must paste release text in chat only
```

### MISTAKES - NEVER REPEAT
- Agents have wiped buildNotes files in other repos. INSERT ONLY during normal work: add a new entry immediately under `# Historical entries (newest first)`. Never truncate, overwrite, rewrite, compact, or append at EOF. Never use the Write tool on an existing `buildNotes.md` unless the user explicitly orders a one-time migration. The documented archive rotation is the approved migration when the line threshold is exceeded.
- NO EM DASHES (U+2014) anywhere. Use `-` or `:`.
- Do not edit `buildNotes.txt` from agent sessions; paste release notes in chat for the user.
- Do not create `.md/buildNotes.md`, `.md/.buildNotes.md`, or `.md/buildNotes.txt`. Agent history and user release notes are root `buildNotes.md` and root `buildNotes.txt`.

### Project invariants (do not regress)
- Isolated upstream lives at `UPSTREAM\opencode`; custom source stays in the parent checkout. Sync via `UPSTREAM-SYNC.md` / `.scripts\syncAndInstall.ps1`; no unrelated-history merge; do not commit/push unless asked.
- Version SoT is `.version\version` (maintenance display only; do not bump OpenCode package version). Agents never edit `buildNotes.txt`.
- Default branch is `dev`. Do not ship `opencode.exe` compiled with Bun 1.4.0 (`bun:ffi` TUI crash).
- Do not treat empty tool lists as compaction. Protect local `.scripts`, `.version`, `AGENTS.md`, `SCRIPTS.md`, `buildNotes.md`, `UPSTREAM-SYNC.md`, `CONTEXT.md`, TUI display-version, and custom declaration fixes during upstream apply.
- Installer may stop running `opencode` processes; do not kill them from other agent work. Live install often blocked while `C:\Users\user\Apps\opencode\opencode.exe` is in use.

# Cumulative Summary

- `buildNotes.archive1.md`: 2026-08-20 through 2026-09-09 (1023 lines). `buildNotes.archive2.md`: 2026-09-09 through 2026-09-15 (682 lines; SHA256 `15BF8525C5DD8367654E679F4FB15CC58B0268F2A5C1063B84A4F62BF2E2B869`). `buildNotes.archive3.md`: 2026-09-15 through 2026-09-28 (1266 lines; SHA256 `65820561A15D46323D2156CAAC9825FA9A84F43038A9A26E50887F6F92918A1F`). Do not edit archives.

## Agent
- Added local `.scripts` (build/check/run/install/push/updateUpstream/syncAndInstall), `.install.ps1`, `.version\version`, `UPSTREAM-SYNC.md`; `-Release` sets `OPENCODE_RELEASE`; install builds by default (`-NoBuild`/`-nb`); timestamped `.bak`; fail-closed dirty parent.
- Added isolated `UPSTREAM\opencode` refresh; content-level three-way apply; persist SHA in `.scripts\upstream-sync.state.json`; bump last `.version\version` number on successful apply that advances `dev`.
- Embedded maintenance version in compiled TUI footer via optional `TuiApp.displayVersion`; CLI `OPENCODE_VERSION` unchanged.
- Added `resolveCurrentModel`; CLI model before agent/recent; validate stored per-agent models; optional `TuiState.currentModel`.
- Removed 100ms `GetConsoleMode` poll (`win32InstallCtrlCGuard`); Bun 1.4.0 `bun:ffi` still unsafe to ship.
- Added native session bootstrap CLI; global `/experimental/session` list; `mergeSessionList` keeps attached/hydrated sessions; ignore workspace `query.directory` on global list.
- Added `sessionComplete` / `sessionFailed` (mutual exclusive, preserve `time.updated`); tools default-deny; TUI toggles `ctrl+shift+return` / `ctrl+shift+backspace`.
- Lazy CLI command loader: TUI path loads TUI only; `--version` ~153ms to ~37ms.
- Added `ctrl+shift+up/down` input aliases.
- Added built-in Agentify: `packages/agentify-runtime` Node+Edge CDP; `agentify.ts` lazy supervisor; `agentify/chatgpt-web` then `agentify/claude-web`; empty `api.url` caused Invalid URL, placeholder `http://127.0.0.1/v1`; compiled runtime beside `process.execPath`; copy runtime in `build.ts` / `install.ps1`; one window per affinity; single-attempt send.
- Added `ServerLifecycle`, `/global/shutdown` `/global/restart`, TUI confirm palette; `install.ps1` waits for `opencode` exit.
- Added `server.startOnWindowsUserStart`; folded standalone `oc.config.json` into `~/.config/opencode/oc.json`; native intro column sweep in `cli/intro.ts`.
- Native Cursor provider under `packages/opencode/src/provider/cursor` (0.6.2 then 0.6.7 catalog/pricing/Fast, SSRF/symlink/git-cred hardening, agent.v1 shell/git_diff, lazy Node HTTP/2 proxy); tools=[] must not wait forever for catalogs; do not infer compact from empty tools.
- Folded openSidebar into native TUI; WezTerm: map `wezterm-gui.exe` to sibling `wezterm.exe`.
- Assistant timestamps: `time.created` while running, `time.completed` after; date+time before duration.
- Agent config: `tab_order`, `{file:}` prompt includes, `display_name` / TUI `local.agent.label`; Markdown agents under `~/.config/opencode/agents\` (plural).
- SuperPlan planning-only perms (edit only under `~\.config\opencode\plans\`); `rg` + Everything MCP; archive completed plans to `plans\archive\`; split `sp.md`/`sp-a.md`/`go.md`/`go-a.md`; Go-a Tier 2/3 only; no Luna Max/`xhigh` (Luna `openai/gpt-5.6-luna` `variant: high`).
- Session model: `model.json` per-session override, not global `ignoreAgentModels`; failed switch must not update local selection.
- Sidebar: idle-coalesced usage refresh; `usageProviders` picker (Codex/Cursor/Go/OpenRouter default on).
- `oc config set/get` nested under one Yargs `config` command.
- SuperPlan+ : parallel `task` with `background: true`; `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true`.
- Windows spawn: hide cancellation without extra `cmd`; V2 Bash `Shell.args` + `Shell.preferred`; process-tree helper `opencode-process-tree.exe` (protocol 1, x64/arm64); no `CREATE_NO_WINDOW` for Git (MSYS2 conhost); attach parent console + `SW_HIDE`; no AllocConsole (unhides on job kill); inherit parent console else `CREATE_NO_WINDOW`. Installed helper SHA256 `0615E5AEC4F21B67F0CA2F37D7B81705A68549688DF5B5D3A10303F947C43543`.
- Everything MCP: Windows auto-start `EVERYTHING_EXE_PATH` or installed paths, `-first-instance -startup`, reconnect, no shutdown ownership.
- Debug logging: channel-aware, 20 MB rotate, `/debug-logging`, palette toggle.
- SSE: clear `headerTimeout` when headers resolve; `enabled_providers: []` is empty allowlist / `NoProvidersError`.
- ERROR / remaining: `packages/tui/src/context/local.tsx:188` has blocked OpenCode typecheck in some sessions; live Cursor/ChatGPT/Everything/no-flash smoke often pending; install often blocked by running `opencode.exe`; Everything recovery and process-tree no-flash plans unarchived; full `bun test` has unrelated event-manifest/session-bootstrap/plugin failures.
- Checkout path is `C:\Users\user\Documents\GitHub\oc`.
- Archive3 (2026-09-15 to 09-28):
- Changed buildNotes layout to newest-first under `# Historical entries`; procedure lives in skills `base/build-notes` / `base/build-notes-archive`.
- Everything MCP: local `mcp-everything-search` checkout 0.2.2 via `uv run --locked`, `mcp==1.1.2`; case-insensitive sort aliases map to numeric `sort_by`; upstream Ruff/Pyright findings accepted as baseline.
- Removed process-tree supervisor (`opencode-process-tree.exe`); back to `cross-spawn` + hidden `taskkill /T /F`.
- Build/install split: agents may run `.scripts\build.ps1` / `buildDebug.ps1` only; user installs with `-NoBuild`. Installer stops managed processes before build; fixed hard-link verification predicate.
- `ocdebug`: native isolated launcher, port 4097, seeds/imports production config and assets (`core/debug-config.ts`); palette import.
- `oc` launch: bare `oc` uses `ocDir`, relative targets use `homeDir`, absolute direct; `oc --palette "New session (oc)"` spawns TUI palette (`oc.ts`).
- Removed `packages/app`, `packages/desktop`, `opencode web`, Electron wiring.
- OpenTUI aligned to upstream 0.4.5; removed 0.5.8 resume patch. Risk: `renderer.resume()` may throw after `/editor` on Windows.
- Lifecycle reconnect: recovery waits for disposal + replacement connection; post-bind prompt focus; no prompt replay. Resident server state written by launcher-managed `serve`; stale record no longer causes 10 s wait.
- SuperPlan/Go: strict read-only capability contract; `plan_execute` requires absolute exact `planPath` (never reconstruct via `Session.plan`); `This session` / `New session` branches; `write` returns canonical path. `SessionPrompt` loaded at execute time (init-time require cycle with `ToolRegistry`). Automatic Luna routing only Tier 3.
- Cursor native provider: host-identity preamble even with empty tool catalog; compaction sets `opencodeCompaction` in `request.ts` (`applyCursorCompactionOption`); no-tool turns keep rebase token; native plan mode disabled (`resolveCreatePlanBridge`); context-tier catalog/pricing generation (Grok 4.7 tiers, Opus 5.5).
- Stock `plan` agent disabled via `disable` key (not `disabled`).
- Questions: session-scoped cancellation publishes `question.rejected`; pending removed before publish (race); TUI question mode yields to dialogs; question + permission lists reload on bootstrap/reconnect. Risk: server exit still rejects pending questions.
- Windows clipboard: image file-drop paths or temp PNG; PowerShell `Where-Object` join fix.
- Providers: `openai/gpt-6-luna` is the working Luna route (Poe GPT-5.6 ids 404). Upstream ports: debug config redacts credentials; Gemini thinking defaults; Bedrock tool-result images limited; Codex OAuth allowlist GPT-6.
- Command palette: `command_palette.order` config map (V1/V2 schema, SDK regenerated); OC settings order.
- TUI: model picker hide (`ctrl+h`, `hidden[]` in `model.json`, `dialog.push`); `/command` anywhere in the prompt (first runs, later templates prefix args).
- Claude usage sidebar: reads `~/.claude/.credentials.json` token, GETs undocumented `api.anthropic.com/api/oauth/usage`; never refreshes the token; one combined row after Codex. Status-line snapshot approach removed (headless CLI never runs statusLine).
- DB: `DatabaseMigration.apply` refuses unknown migration ids (stock OpenCode 2.0.6 migrated shared `opencode.db` 2026-09-27; repaired from backups). Local sqlite3 3.22 has no `DROP COLUMN`.
- Config: `instructionsByModel` (glob `providerID/modelID` -> files or `{ base }`); `Instruction.system(model)` / `base(model)`; base fills `agent.prompt` only when unset. Wired in user config (`claude-code/*`, `cursor/*`).
- MISTAKE: PowerShell `$HOME` is read-only; use `$testHome` and verify isolation before filesystem tests.
- MISTAKE: never reconstruct plan filenames; carry the exact path.
- ERROR: opencode proxy reported a second parallel edit as rejected while applying it (B1, plan `2026-09-28-claude-oc-bridge.md` step 7); send oc edits one at a time.
- ERROR: 2 `Instruction.system` tests fail locally because temp dirs sit under `C:\Users\user` and findUp reaches the home `AGENTS.md`.

## User
Local tooling
- Scripts can build, check, run, install, and sync this OpenCode fork from PowerShell. Install rebuilds unless you pass `-nb`. Upstream updates go through a separate checkout, then a careful apply into this fork.

Version and settings
- The TUI footer shows the fork maintenance version. A model you pass at start beats saved agent defaults until you change it in the session. Per-session model picks persist. OC settings live in OpenCode's own config, not a separate wrapper file.

Sessions and startup
- You can start a project session without calling a model. Sessions from every project show in one list. Complete and failed marks stay visible without archiving. Startup loads fewer CLI commands, so version checks are faster.

Providers
- ChatGPT Web and Claude Web are built-in browser models that start Edge on first use. Cursor is an optional native provider. Server shutdown/restart and Windows auto-start live in the command palette.

Agents and sidebar
- Custom agents load from the plural `agents` folder, can share prompt files, and can show friendly names and a Tab order. SuperPlan stays read/search/plan-only. SuperGo has separate Go and Go-a prompts. The sidebar can pick which weekly usage providers to show, and Everything Search can be started automatically on Windows.

Windows
- Hidden Git and shell work tries to avoid extra console windows. A process-tree helper ships beside `opencode.exe`. Installing a new build stops running OpenCode first.

Since 2026-09-15 (archive3)
- The process-tree helper is gone; Windows child processes use the normal spawn path again.
- Agents can build but never install; you install from a fresh PowerShell with `-NoBuild`.
- `ocdebug` runs as its own isolated app on port 4097 and can import your production settings.
- Bare `oc` and relative project launches use separate configurable folders, and the project picker opens the real TUI palette.
- The browser UI and Electron desktop app were removed.
- SuperPlan stays read-only, and approved plans run in this session or a new Go session using the exact plan file.
- Cursor sessions handle compaction, empty tool lists, and plan mode more reliably, and show newer tiered models with correct pricing.
- Questions no longer steal keys from dialogs, clean up when interrupted, and reappear after reconnecting.
- Windows image pasting works, including screenshots with no file.
- The model picker can hide models, `/commands` work anywhere in a message, and the command palette order is configurable.
- The sidebar shows Claude usage from your Claude Code login.
- oc refuses to start on a database migrated by a different OpenCode build instead of failing later.
- A new `instructionsByModel` setting can load instruction files and a base prompt per model, once the new build is installed.

# Historical entries (newest first)

---

## 2026-09-29 (~02:58) - Remove Claude Code proxy fallback - GPT-6 Luna, n/a; Implementation

### Agent
- Meta: GPT-6 Luna; n/a; Implementation; completed
- Removed the Claude Code between-turn tool boundary, result matching, and late-result recovery paths; in-stream proxy execution is now the only path
- Reject proxy calls without a turn executor immediately; retained controller-closed rejection and pending-call release on abort
- Deleted `proxy-results.ts`, unused broker channel/emission state, `settleSessionRunState`, and related lifecycle tests
- Kept `skipResultForIds` for CLI-executed tool results; kept question forms, account failover, fallback chain, and interactive transport
- Verification: `bun typecheck` passed; Claude Code tests 605 pass, 6 skipped, 53 fail; baseline 624 pass, 6 skipped, 65 fail; no new failures

### User
Claude Code
- Proxy tools now execute within the active stream; calls without an executor are rejected immediately instead of being deferred to another turn.

---

## 2026-09-29 (~02:24) - Claude Code: one permission path through oc - Opus 5.5, low; Implementation

### Agent
- Meta: Opus 5.5; low; Implementation; steps 1-3 of `~\.config\opencode\plans\2026-09-29-claude-code-one-permission-path.md` done, step 5 live checks pending
- Removed direct MCP bridge (`bridgeOpencodeMcp`, `proxyOpencodeMcpTools: false`) and `controlRequestBehavior`/`controlRequestToolBehaviors`/`controlRequestDenyMessage` (subagents); `can_use_tool` always denies and warns (`control-request.ts`); non-proxy MCP servers warn via `cli-events.ts`
- Added failed/unavailable MCP servers left out per spawn with warning (`warnUnavailableMcpServers`, `mergeOpencodeMcp` runtime overlay)
- Added denial path: `session/llm.ts` host executor maps `PermissionV1.RejectedError`/`Question.RejectedError` to `{ output: "Denied by user.", denied }` (`HostToolResult.denied` in `shared.ts`); `runProxyCallInStream` emits `denied` as the isError tool-result value so the processor's instanceof check sets `ctx.blocked`; `endDeniedTurn` interrupts the CLI and finishes the stream once per turn
- Risk: MCP call id is a UUID, not Claude's `tool_use_id`; first proxied `tool_result` echo after a denial ends the turn, 1 s backstop
- Updated `proxy-mcp.test.ts` bridged case: opencode MCP servers never reach `--mcp-config`
- Verification: `bun typecheck` clean; `proxy-mcp.test.ts` 63/0; full `test/provider/claude-code` 623 pass / 66 fail, all seen failures are `#!/bin/sh` fake CLIs/wrappers not executable on Windows; no clean baseline (dir untracked)

### User
Claude Code permissions
- oc's `permission` rules now decide every Claude Code tool call, including MCP tools; Claude's own permission prompts are always refused.
- Denying a Claude Code tool call stops the turn immediately and shows it as blocked, so Claude cannot retry or work around the denial.
- MCP servers that failed to connect are skipped with a log warning instead of being handed to Claude directly.

---

## 2026-09-29 (~01:29) - park unused Claude Code extras - Opus 5.5, low; Implementation

### Agent
- Meta: Opus 5.5; low; Implementation; completed, install pending for live pass
- Parked (commented out with `TODO: parked extra`, code kept) in `provider/claude-code/index.ts`: `failoverAccounts`, `expandAccountProviders` call, `planModeQuestion` (forced false), `interactive*` options (forced `interactive: false`)
- Parked fallback chain at its single wiring point `runModelChain` in `claude-code-language-model.ts` (`chain = []`); config/agent parsing left intact
- Skipped 6 `account-failover.test.ts` tests that build through `createClaudeCode` with the same TODO
- Removed stray empty files `packages/opencode/process.exit(3)` and `packages/opencode/{}`
- Kept phase 3 step 2 (broker/drain removal) until after live pass, per native-claude-code plan
- Verification: `bun typecheck` clean; claude-code suite 638 pass / 71 fail before test skips (baseline 627/79); `account-failover.test.ts` 24 pass / 6 skip / 0 fail. Remaining failures are pre-existing Windows wrapper/CLI tests

### User
Claude Code
- Multiple accounts with failover, the fallback model chain, the plan-mode question form, and the interactive terminal mode are switched off; their code stays in place for later.
- Removed two stray empty files from the project.

---

## 2026-09-29 (~01:11) - make OpenCode-only Claude tools consistent - GPT-6 Luna, n/a; Implementation

### Agent
- Meta: GPT-6 Luna; n/a; Implementation; strict config and source guidance updated, user rebuild pending
- Updated `provider/claude-code/prompts.ts`: todo and ToolSearch guidance follows live proxy/disallow lists
- Updated `provider/claude-code/tool-mapping.ts`: skip `SendMessage` alongside other Claude-internal tools to avoid invalid OpenCode rows
- Added regression coverage for strict todo guidance and internal tool filtering
- Verification: focused tests 38/38; `bun typecheck` passed; `opencode debug config` passed; strict CLI smoke with saved config used only `grep`, `read`, `session_list`, `session_info`, and `skill`

### User
Claude Code tools
- Claude now uses only configured OpenCode proxy tools for actions, including OpenCode skills and todos; native CLI actions and direct MCP connections are disabled.
- Notes reserve native-tool support for future per-tool review and parity testing.

---

## 2026-09-28 (~23:38) - keep Claude agent listing inside CLI - GPT-6 Sol, n/a; Implementation

### Agent
- Meta: GPT-6 Sol; n/a; Implementation; code verified, installed check pending
- Fixed `provider/claude-code/tool-mapping.ts`: `ListAgents` is CLI-internal; skip projecting it as an unavailable OpenCode tool. CLI still handles the call and response.
- Added mapping regression in `test/provider/claude-code/tool-mapping.test.ts`.
- Verification: mapping tests 14/14, `packages/opencode` `bun typecheck` passed. Existing fake-CLI stream suite fails on Windows with EBUSY removing temporary CLI directories (11 failures); no new case kept there.
- ERROR: Prior `InvalidTool` fix cannot address this path: Claude CLI executes `ListAgents` and provider incorrectly projects its call to the host.

### User
Claude Code tools
- Claude can list live agents without OpenCode showing a misleading invalid-tool row; session-history tools remain available separately.

---

## 2026-09-28 (~23:15) - fail unavailable tool calls explicitly - GPT-6 Luna, mode unreported; Implementation

### Agent
- Meta: GPT-6 Luna; mode unreported; Implementation; completed
- Changed `packages/opencode/src/tool/invalid.ts`: unavailable tool calls now fail with an explicit not-executed error instead of returning a normal success result
- Added regression coverage in `packages/opencode/test/tool/tool-define.test.ts`
- Verification: focused tool test 6/6; LLM and processor tests 47/47; `bun typecheck` passed in `packages/opencode`
- ERROR: repo-wide `git diff --check` reports an unrelated trailing blank line at `buildNotes.md:497`; left untouched

### User
Claude Code tools
- OpenCode now marks unavailable tool calls as failures so Claude is less likely to report that a rejected call succeeded.

---

## 2026-09-28 (~22:12) - Remove TUI paint probes - GPT-6 Luna, n/a; Implementation

### Agent
- Meta: GPT-6 Luna; n/a; Implementation; code complete, installed terminal checks pending
- Removed paint, geometry, and key probes from `packages/tui/src/routes/session/index.tsx`; restored normal sticky scrolling and user, assistant-text, and tool rendering
- Kept unrelated compaction-divider work and `%TEMP%\opencode-debug\geometry-spooky-forks.log`
- Verification: TUI `bun typecheck` passed; `debugTemp|DEBUG_TEMP` source scan clean; `git diff --check` passed
- TODO: user to install debug build and run terminal checks from plan; spooky-session work deferred

### User
TUI
- Removed debug-only transcript and paint probes so ocdebug sessions render user messages, assistant text, and tools normally again.
- Installed scroll and keyboard checks remain pending; the geometry log is kept.

---

## 2026-09-28 (~22:04) - Inventory OC custom features - GPT-6 Luna, n/a; Agent

### Agent
- Meta: GPT-6 Luna; n/a; Agent; inventory completed
- Added categorized feature inventory and completion levels at `~/.config/opencode/plans/2026-09-28-custom-feature-inventory.md`
- Forkscope: isolated upstream has Claude Code instruction/skill compatibility, not oc's bundled provider/tool bridge
- Rated new Claude Code in-stream tool bridge medium pending installed/live checks
- Verification: read back plan file; no code checks applicable

### User
Project inventory
- Added a categorized, user-facing list of active custom features, their completion levels, retired work, and Claude Code integration scope.

---

## 2026-09-28 (~21:47) - Route Claude Code tools through oc - GPT-6 Sol, n/a; Implementation

### Agent
- Meta: GPT-6 Sol; n/a; Implementation; code complete, live install not run
- Added default Read/Glob/Grep proxy definitions and model-tool filtering; disabled corresponding Claude built-ins when proxied
- Enabled oc MCP tool proxy by default with explicit false override; uncovered servers retain direct bridge
- Scoped `hostToolExecutors` to active stream; MCP executions await visible tool part before running
- Verified AI SDK normalizes provider `result` to `output` and `isError` to `tool-error`; no adapter change needed
- Verification: `bun typecheck` passed; focused proxy and permission tests passed (14); full proxy fixture run had pre-existing Windows fake-CLI argv timeout, unrelated full `llm.test.ts` had two timeout/request failures; no build or live TUI run

### User
Claude Code tools
- Read, Glob, Grep and connected oc MCP tools now run through oc by default, so their calls can use oc permissions and appear as tool entries in the TUI.
- Tool execution stops using a stale session executor after its turn ends.

---

## 2026-09-28 (~21:34) - Simplify favorite move action checks - GPT-6 Luna, n/a; Implementation

### Agent
- Meta: GPT-6 Luna; n/a; Implementation; completed
- Consolidated model favorite position lookup in `DialogModel`; guarded move handlers against non-model options
- Verification: TUI typecheck, 14 focused tests, and `git diff --check` passed

### User
Model picker
- Favorite move actions use one shared position lookup and ignore non-model entries safely.

---

## 2026-09-28 (~21:29) - Fix model dialog startup crash - GPT-6 Luna, n/a; Implementation

### Agent
- Meta: GPT-6 Luna; n/a; Implementation; completed
- Fixed `DialogSelect`: action visibility evaluated `selected()` before its memo existed; declared selection-dependent action memos after selection
- Added regression coverage for dialog actions with selection-aware visibility
- Verification: TUI typecheck and focused dialog/model tests passed; `git diff --check` clean
- ERROR: First Shift+Up/Down integration crashed when opening the model dialog; regression reproduced and fixed

### User
Model picker
- Fixed the crash when opening the model picker.

---

## 2026-09-28 (~21:23) - Reorder model favorites - GPT-6 Luna, n/a; Implementation

### Agent
- Meta: GPT-6 Luna; n/a; Implementation; completed
- Added Shift+Up/Down model picker actions to reorder favorite models; order persists in `model.json` and drives favorite cycling
- Kept selection on the moved model; actions hide during search and outside Favorites
- Verification: TUI typecheck and focused local model / command palette tests passed (13 tests)

### User
Model picker
- Favorite models can now be reordered with Shift+Up and Shift+Down; the order also controls favorite cycling.

---

## 2026-09-28 (~21:18) - Run Claude Code CommonJS scripts with Node on Windows - GPT-6 Luna, n/a; Implementation

### Agent
- Meta: GPT-6 Luna; n/a; Implementation; completed
- Fixed Windows `.cjs` CLI execution via `cliCommand` across stream, generate, version, and help probes; avoids opening fake CLI scripts in file associations such as Notepad++
- Added `cli-executable.test.ts` for platform-specific command selection
- Verification: focused helper test passed; `bun typecheck` passed. `silent-turn.test.ts` still fails with Windows `EBUSY` deleting temp working directories while child processes are active

### User
Claude Code tests
- Windows now runs `.cjs` test CLIs through Node instead of opening each script in Notepad++.

---

## 2026-09-28 (~20:01) - Claude Code spawns enable native todo tools - Opus 5.5, low; Go

### Agent
- Meta: Opus 5.5; low; Go; completed
- Fixed root cause of ccTest2 empty todo panel: CLI 2.1.283 `nB()` gates TaskCreate/TaskUpdate to interactive or legacy models (sonnet-4-6, haiku-4-5, ...) unless `CLAUDE_CODE_ENABLE_TODO_TOOLS` is true. The prompts.ts note alone could not help.
- Added `env.CLAUDE_CODE_ENABLE_TODO_TOOLS ??= "1"` in `claudeSpawnEnv` (session-manager.ts); shell value wins.
- Verification: `claude -p --model claude-opus-5-5` answered "yes" for TaskCreate with the var, "No" without. `bun test test/provider/claude-code`: 627 pass / 79 fail, failures are Windows-incompatible (0700, wrapper, symlink, PATH casing) or mocked-CLI timing tests, none env-related. Not rerun on a clean tree.
- TODO: real-session retest (ccTest3) after user install.

### User
Claude Code provider
- Claude Code sessions now get Claude's todo tools, so todo lists show in OpenCode's todo panel for newer models too.

---

## 2026-09-28 (~19:48) - Claude Code tool note stops hiding native todo tools - Opus 5.5, low; Go

### Agent
- Meta: Opus 5.5; low; Go; completed
- Fixed `buildToolEnvironmentNote` in `provider/claude-code/prompts.ts`: "Tools not listed... do not search" narrowed to proxy tools. It blocked ToolSearch for deferred native TaskCreate/TaskUpdate, so ccTest #7 reported no todo tool.
- Added always-on todo bullet: TaskCreate/TaskUpdate drive opencode's todo panel; "todowrite" means them.
- Updated `test/provider/claude-code/subagent-hint.test.ts`: asserts new wording; subagent-absent check keys on `### Subagents` (TaskCreate now always present).
- Verification: subagent-hint.test.ts 23/23. Full `test/provider/claude-code/` has 79 fails in account/wrapper tests, unrelated to prompts; not investigated.
- TODO: rerun ccTest #7 with original wording; #4/#5 need bash `ask` to exercise permission prompts.

### User
Claude Code provider
- Claude Code models can now use their todo list, and it shows in oc's todo panel.

---

## 2026-09-28 (~18:08) - Claude Code runs oc tools in-stream (Phase 3 step 1) - Opus 5.5, low; Go

### Agent
- Meta: Opus 5.5; low; Go; Phase 3 step 1 done, not built or installed
- Reviewed session base6 (`ses_f15f8d768ffeiT5cGBc2HBKdTj`): phases 1-2 tools, parallel, resume, compaction OK; interrupt untested
- Added `hostToolExecutors` in `provider/claude-code/shared.ts`; `session/llm.ts` registers one per Claude Code stream that has tools
- Added `SessionProcessor.Handle.toolPartReady`; `session/tools.ts` awaits it only with `experimental_context.awaitToolPart`
- Added `runProxyCallInStream` in `claude-code-language-model.ts`: providerExecuted call/result in the same stream, MCP request answered immediately, `task_batch` fan-out kept; `inStreamCalls` suspends the 60 s result-fallback watchdog
- Kept broker/drain path as the no-executor fallback until step 2 deletes it
- Risk: permission denial now reaches Claude as a tool error; oc does not set `ctx.blocked`
- Verification: `bun typecheck` clean; new `tools.test.ts` ordering test passes; claude-code suite 627/79 = baseline; `compaction.test.ts` "publishes compacted event on continue" times out, only touched by a no-op fake field, pre-existing status unconfirmed
- Plan: `C:\Users\user\.config\opencode\plans\2026-09-28-native-claude-code.md`

### User
Claude Code provider
- Claude Code tool calls like edit, write and bash now run inside the same reply instead of ending the step and starting a new message.
- Tools wait until their entry is visible before running, so permission prompts no longer appear ahead of the tool they belong to.

---

## 2026-09-28 (~17:48) - Native Claude Code provider, deferred-feature cut - Opus 5.5, low; Go

### Agent
- Meta: Opus 5.5; low; Go (plan `~\.config\opencode\plans\2026-09-28-native-claude-code.md` deferred-feature cut); completed for isolated features, not built or installed
- Removed fast-mode reporting (`provider/claude-code/fast-mode.ts`, two `reportFastModeState` calls). Kept fast model ids and `--settings {"fastMode":true}` spawn
- Removed `/btw` + side question (`btw-command.ts`, `side-question.ts`), `command.execute.before` hook, aside sink, `dispatchSideQuestionResponse` in session-manager line router, `cliSupportsSideQuestion`
- Removed doctor (`doctor.ts`) and its command registration
- Removed skill bridge (`skill-bridge.ts`, `skillBridgeSpawn`, `registerBundledSkillPath`, `bridgeOpencodeSkills`/`bridgeSkipNativeSkills` pass-through)
- Changed `message-builder.ts` `filterSideQuestionHistory` -> `stripPluginHistory`; strips `▌` plugin notes + failover form only
- Changed `startup-diagnostics.ts`: `plugin` field = oc `InstallationVersion`; removed `package.json` reader `pluginVersion()`
- Kept `ActiveProcess.asideTransport`: session-manager uses `.interactive` to choose control path; goes with interactive transport
- Kept (moved to phase 3): plan-mode question form, accounts + failover, fallback chain, interactive transport. All are in stream/tool-call paths phase 3 rewrites
- Removed tests for cut features (btw-command, side-question, doctor, skill-bridge, fast-mode reporter, `/btw` history cases, pluginVersion)
- Verification: `bun typecheck` clean; claude-code suite 627/706 pass, zero oc-only failures vs original plugin baseline; `cursor.test.ts` + `transform.test.ts` 603 pass

### User
Claude Code
- Removed the unused `/btw` side-question command and the `/claude-code-doctor` command.
- Removed the opt-in skill bridge and the fast-mode downgrade warning; fast models themselves still work.

---

## 2026-09-28 (~17:35) - Native Claude Code provider, phase 2 typed session state - Opus 5.5, low; Go

### Agent
- Meta: Opus 5.5; low; Go (plan `~\.config\opencode\plans\2026-09-28-native-claude-code.md` phase 2); completed, not built or installed
- ERROR: `request.ts` sent `opencodeCompactionBoundary` to Cursor only (05:09 review fix), so Claude Code `compactionBoundaryChanged` never fired; post-compaction fresh start was dead. Fixed
- MISTAKE: 05:09 fix restricted a host option by provider without checking which providers read it. Grep the option key across `src/provider/*` before narrowing it
- Added `provider/claude-code/shared.ts`: `CLAUDE_CODE_PROVIDER_ID`, `CLAUDE_CODE_SESSION_OPTION`, `CLAUDE_CODE_AGENT_OPTION`, `isClaudeCodeProvider` (covers `claude-code-<account>`), re-export `COMPACTION_BOUNDARY_OPTION`
- Changed `session/llm/request.ts` `prepare`: writes session id, agent name, compaction boundary for Claude Code providers
- Changed `call-options.ts`: typed `hostOption`; `resolveSessionAffinity`/`resolveOpencodeAgent` take `(providerOptions, providerKey)`; removed header fallbacks and `as any`
- Removed `chat.params` hook from `provider/claude-code/index.ts`
- Kept `compactionBoundaryChanged` map: provider must remember which boundary its CLI transcript saw
- Changed tests: `session-affinity.test.ts` now host round trip (prepare -> providerOptions -> readers); removed chat.params tests (`index-hooks`, `proxy-task`); `process-lifecycle` uses provider option
- Verification: `bun typecheck` clean; `cursor.test.ts` + `transform.test.ts` 603 pass; round trip 5 pass; claude-code suite oc-only failures = 4 packaging tests + full-run-only flake `a turn with an answer gets no note` (passes alone in oc and plugin)

### User
Claude Code
- After a compaction, Claude Code starts fresh from the summary again instead of resuming its old, pre-compaction conversation.
- oc now tells Claude Code which session and agent a request belongs to directly, instead of through a plugin hook.

---

## 2026-09-28 (~17:26) - Native Claude Code provider, phase 1 lift - Opus 5.5, low; Go

### Agent
- Meta: Opus 5.5; low; Go (plan `C:\Users\user\.config\opencode\plans\2026-09-28-native-claude-code.md` phase 1); completed, not built or installed
- Added `packages/opencode/src/provider/claude-code/`: plugin `src` copied verbatim except `v2.ts`, `v2-client.ts`, `opencode-v2-types.ts`, `cleanup-stale.ts`, `bun-terminal.d.ts`
- ERROR: plugin `bun-terminal.d.ts` `declare global` redeclared `Bun`; broke typing across all of oc. Removed; oc has real Bun types (`Bun.Subprocess`)
- Changed `index.ts`: npm `@opencode-ai/claude-code`; `claudeCodeServer` + `ClaudeCodePlugin = ... as unknown as Plugin` (WIP cast until `opencode-types.ts` shims go); no V2 default export
- Changed `models.ts` npm id; `generateId` from `ai` (no new dep)
- Added `provider.ts` `BUNDLED_PROVIDERS`: `@opencode-ai/claude-code` + legacy `@khalilgharbaoui/opencode-claude-code-plugin`
- Added `ClaudeCodePlugin` to `plugin/index.ts` `internalPlugins`
- Changed `config.ts` `isLegacyCursorPlugin` -> `isFoldedPlugin`, `migrateLegacyCursorPlugins` -> `migrateFoldedPlugins`; also matches `opencode-claude-code-plugin`, so the user's `file:///...` plugin entry is stripped from `opencode.jsonc` on next start
- Kept deferred features dormant (accounts, fallback, `/btw`, doctor, skill bridge, fast mode, PTY transport); cut them in a dedicated step. `claude-session-bun.ts` uses `terminal?.` only to compile
- Added 47 ported tests in `test/provider/claude-code/`, `// @ts-nocheck` + WIP (plugin never typechecked tests)
- Risk: `plugin/index.ts` imports the full provider statically; same startup cost as the old file plugin
- Verification: `bun typecheck` (packages/opencode) clean. `bun test test/provider/claude-code` 723/823 pass; original plugin under bun 727/823. Only oc-only failures: 4 packaging tests (bundled skill dir, package.json version), expected
- ERROR: pre-existing Windows failures: fake `claude` CLIs are `#!/usr/bin/env node` scripts; Windows cannot exec them. Plugin's own `tsx --test` fails same files (45/93 sampled)

### User
Claude Code
- Claude Code now ships inside oc instead of loading as a separate plugin; models, options, and behavior are unchanged.
- On first start, oc removes the old `opencode-claude-code-plugin` entry from `opencode.jsonc` automatically.
- Existing `provider.claude-code.options` settings keep working as before.

---

## 2026-09-28 (~05:09) - Review fixes for pending-request sort and boundary option - Opus 5.5, low; Implementation

### Agent
- Meta: Opus 5.5; low; Implementation; completed after review of uncommitted diff
- Fixed `groupBySession` in packages/tui/src/context/sync.tsx: code-point sort to match `search()` `<` comparison (was `localeCompare`).
- Fixed packages/opencode/src/session/llm/request.ts: `COMPACTION_BOUNDARY_OPTION` sent only for Cursor; openai-compatible SDKs spread unknown provider options into the request body.
- Kept mid-text `/command` detection in prompt (user choice).
- TODO: `owned` lock conflict in run-state.ts still dies as a defect; a typed busy error needs prompt route error types plus SDK regen (user deferred).
- Verification: `bun typecheck` clean in packages/opencode and packages/tui; tests not run.

### User
Sessions
- Questions and permission prompts restored after a reconnect now update reliably instead of occasionally duplicating.
- Non-Cursor providers no longer receive an internal compaction field in their requests.

---

## 2026-09-28 (~05:00) - Claude weekly usage cache - Opus 5.5, low; Debug

### Agent
- Meta: Opus 5.5; low; Debug; completed
- Fixed `probeClaudeCodeUsage` (`tui/.../sidebar-tools/usage.ts`): cause was expired OAuth token between Claude Code runs (only refreshed on send) plus rate-limited `/api/oauth/usage`. Now caches last good raw response to `~\.cache\opencode\claude-usage.json` and returns it on any live failure. `ok:false` only when no credentials or no cache
- Added `claudeWindow` reset handling: cached window whose `resets_at` passed reports 0%, reset null
- Added `claudeUsageCachePath` option; test uses temp cache and covers cache fallback, post-reset zero, missing login
- Verification: Claude usage test passes; `bun typecheck` in `packages/tui` clean
- MISTAKE: edits reported as rejected sometimes still applied, causing a duplicate option field. Re-read file state after a rejected edit before retrying

### User
Sidebar
- Claude weekly usage now shows the last known percentages at startup and between messages instead of "unavailable".
- It only shows "unavailable" when Claude Code is not logged in or has never reported usage.

---

## 2026-09-28 (~04:47) - oc stable standalone runtime - Opus 5.5, low; Implementation

### Agent
- Meta: Opus 5.5; low; Implementation; completed. Plan: `~\.config\opencode\plans\2026-09-28-oc-stable.md`
- Added `oc stable [target] [--portable]` (`cli/cmd/oc.ts` StableCommand): spawns `opencode.exe <dir>` with `OC_STABLE=1`; forwards sessionModel/sessionAgent. Uses in-process worker TUI, no port, no attach
- Added `index.ts` arg gate: `OC_STABLE=1` skips `withExecutableDefault`/`withOcLaunchDefault` (these rewrite bare TUI to `oc launch`/`oc previous`, i.e. attach). `oc.exe stable ...` maps to `oc stable ...`
- Changed plan: `--portable` sets `OPENCODE_DB=ocPortable.db` rather than a separate `XDG_DATA_HOME`, because `auth.json`/`mcp-auth.json` live in the data dir and a separate data dir would drop provider auth
- Added cross-process session lock in `session/run-state.ts` `owned()`: wraps ensureRunning/startShell work in `Flock.acquire("session:<id>", timeoutMs 0, staleMs 15s)`; conflict dies with "Session is running in another oc instance". Applies to resident and stable (both directions). Lock only held while work runs; viewing unaffected
- Hid palette `server.shutdown`/`server.restart` and added footer `stable` label when `OC_STABLE=1` (`tui/app.tsx`, `routes/session/footer.tsx`)
- Risk: refusal surfaces as defect via promptAsync `Cause.pretty` (may include stack). Plugins/MCP spawn duplicate copies per stable window. `OC_STABLE` is inherited by child processes (New oc session from a stable window opens stable)
- Verification: `bun typecheck` clean in `packages/opencode` and `packages/tui`; `command-loader`, `runner`, `session/prompt` tests pass. Not manually run (build/install is user-driven). No dedicated lock test

### User
Launcher
- New `oc stable [folder]` opens a session that runs entirely inside that window and closes with it, without touching the background server.
- `oc stable --portable` uses its own separate session list while keeping your provider logins.
- If a session is already running in another oc window or the server, sending a prompt to it from the other one is refused.
- Stable windows show `stable` in the footer and hide the server Restart / Shut Down commands.

---

## 2026-09-28 (~04:40) - Compaction divider shows summary model - Opus 5.5, low; Implementation

### Agent
- Meta: Opus 5.5; low; Implementation; plan `2026-09-28-luna-compaction-fresh-resume.md` step 6 done, plan complete
- Added `summary` memo in `UserMessage` (`packages/tui/src/routes/session/index.tsx`): finds assistant reply with `summary` and `parentID` = compaction message; divider title `Compacted . <modelID> <variant>`, falls back to ` Compaction ` while pending
- Verification: `packages/tui` `bun typecheck` clean (known `local.tsx:188` baseline not reported); visual check not run (needs install)

### User
Compaction
- The compaction divider shows which model and effort wrote the summary, such as `Compacted . gpt-6-luna medium`.

---

## 2026-09-28 (~04:34) - Claude compaction reset and instruction test isolation - Opus 5.5, low; Implementation

### Agent
- Meta: Opus 5.5; low; Implementation; step 5 of `2026-09-28-luna-compaction-fresh-resume.md` done, step 6 (TUI divider label) still TODO
- Fixed 2 `Instruction.system` tests (`test/session/instruction.test.ts`): filter rules to the temp dirs, same pattern as the `instructionsByModel` test; resolves the archived ERROR about home `AGENTS.md`
- Added plugin `compactionBoundaryChanged` (`opencode-claude-code-plugin/src/call-options.ts`): in-memory per-session-key map of `opencodeCompactionBoundary`, cap 256
- Changed plugin `doGenerate` + `doStream` new-conversation check (`claude-code-language-model.ts`): non-compaction turn with new boundary drops Claude session id, process, and compression summary, so the next spawn replays post-compaction history without `--resume`
- Kept `instructionsByModel`: already wired in `opencode.jsonc` (`claude-code/*`, `cursor/*`); the Agent summary line "Not yet wired" is stale
- Verification: `instruction.test.ts` 10 pass; plugin `test-compaction-model.ts` new boundary test passes; plugin `bunx tsc --noEmit` clean; live Claude compaction not exercised (needs install)
- ERROR: plugin test "system prompt file is written 0600" fails on Windows (mode 0o666), unrelated to this change
- MISTAKE: used `git stash push -- src` in the plugin for a baseline, briefly stashing user's uncommitted plugin changes; restored by pop. Use a worktree, never stash

### User
Compaction
- Claude sessions now start a fresh Claude conversation from the summary after compaction, even when another model wrote the summary.

Tests
- Instruction tests no longer fail when run from a folder under your home directory.

---

## 2026-09-28 (~04:25) - Luna compaction with provider reset - Opus 5.5, low; Implementation

### Agent
- Meta: Opus 5.5; low; Implementation; core + Cursor done, Claude plugin and TUI label pending
- Added `agent.compaction` = `openai/gpt-6-luna` `medium` in `~\.config\opencode\opencode.jsonc`
- Fixed compaction variant: `compaction.ts` stamp and `llm/request.ts` lookup use the compaction agent's own `variant` when it pins a model; session variant otherwise
- Added `LLM.StreamInput.compactionBoundary` (summary message id from `prompt.ts` filtered history) -> `opencodeCompactionBoundary` provider option (`COMPACTION_BOUNDARY_OPTION` in `provider/cursor/shared.ts`)
- Added Cursor `resolveTurnConversationReset` `boundary`: new id rebases once; needed because non-Cursor compaction never arms `postCompactionRebase`. In-memory map; restart rebases once per compacted session
- TODO: Claude plugin reset on boundary change (plan `~\.config\opencode\plans\2026-09-28-luna-compaction-fresh-resume.md` step 5); TUI divider model label (step 6)
- Verification: `bun typecheck` clean; `test/provider/cursor.test.ts` 18 pass incl. new boundary test; `test/session/compaction.test.ts` "publishes compacted event on continue" times out with and without these changes (pre-existing)
- MISTAKE: baseline comparison used `git stash -- src`, which briefly stashed user's uncommitted `instruction.ts`/`prompt.ts`; restored by pop. Use a worktree for baselines

### User
Compaction
- Every session now compacts using GPT-6 Luna at medium effort, then continues on the model you were using.
- Cursor sessions start a fresh Cursor conversation from the summary after compaction, even when another model wrote it.

---

## 2026-09-28 (~03:30) - Rotate buildNotes to archive3 - Opus 5.5, low; Agent

### Agent
- Meta: Opus 5.5; low; Agent; user-approved rotation at 1266 lines
- Moved `buildNotes.md` verbatim to `buildNotes.archive3.md` (SHA256 `65820561...`); archives 1-2 untouched
- Rebuilt fresh file: human rules, intro, language, invariants, and archive1-2 summary copied verbatim; added archive3 Agent/User summary
- Verification: destination absent before move; source absent after; header lines 1-110 copied from archive

### User
Project notes
- History through 2026-09-28 now lives in `buildNotes.archive3.md`, and the live notes file is short again.

