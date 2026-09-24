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

- `buildNotes.archive1.md`: 2026-08-20 through 2026-09-09 (1023 lines). `buildNotes.archive2.md`: 2026-09-09 through 2026-09-15 (682 lines; SHA256 `15BF8525C5DD8367654E679F4FB15CC58B0268F2A5C1063B84A4F62BF2E2B869`). Do not edit archives.

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

# Historical entries (newest first)

---

## 2026-09-24 (~03:55) - restore Luna agents to OpenAI GPT-6 - GPT-5.6 Luna, Thinking; Implementation

### Agent
- Meta: GPT-5.6 Luna; Thinking; Implementation; completed
- Updated `~/.config/opencode/oc.json`, global Luna agent entries, and eight architect/redteam agent files to `openai/gpt-6-luna`.
- Removed incomplete Poe SDK experiment from `packages/opencode/src/plugin/poe.ts`, `plugin/index.ts`, and `provider/transform.ts`; deleted temporary SDK probe.
- Kept pre-existing dependency, Cursor, and other worktree edits untouched.
- MISTAKE: Earlier Poe entry described `poe/gpt-5.4` as the active Luna route. Corrected active session and agent routes to OpenAI GPT-6 Luna, which was live-tested.
- Verification: `opencode models openai` lists `openai/gpt-6-luna`; live `opencode run --model openai/gpt-6-luna` returned `LUNA6_OK`; `git diff --check` passed.

### User
Providers
- Default sessions and Luna agents use the working OpenAI GPT-6 Luna model; Poe remains separate.

---

## 2026-09-24 (~01:10) - make Poe model routing usable - GPT-5.6 Luna, Thinking; Implementation

### Agent
- Meta: GPT-5.6 Luna; Thinking; Implementation; completed
- Changed active `~/.config/opencode` session and Luna agent references to `poe/gpt-5.4`.
- Removed manually configured GPT-5.6 Poe IDs after live Poe returned 404 for all three names.
- Kept generic OpenAI-compatible transport and Cursor provider unchanged.
- Verification: `opencode auth list`; `opencode models poe`; live `opencode run --model poe/gpt-5.4` returned `POE_OK`.
- ERROR: Poe live `/v1/models` does not expose `GPT-5.6-Luna`, `GPT-5.6-Terra`, or `GPT-5.6-Sol`; stale local entries produced Poe 404 responses.

### User
Providers
- Poe is now the active session and Luna-agent provider through the live `gpt-5.4` model, with no Cursor integration changes.

---

## 2026-09-23 (~20:43) - harden question terminal races - GPT-5.6 Luna, Thinking; Implementation

### Agent
- Meta: GPT-5.6 Luna; Thinking; Implementation; completed
- Fixed V2 question terminal-state race: remove pending request before publishing reply/rejection so concurrent cancellation cannot emit a contradictory terminal event.
- Reviewed only pending-question changes from this session; preserved unrelated worktree changes.
- Verification: core question/tool tests 8 pass; core typecheck passes; `git diff --check` passes.

### User
Session recovery
- Hardened interrupted question cleanup so one prompt cannot finish twice during a race between answering and aborting.

---

## 2026-09-23 (~20:41) - clear pending questions on interrupted sessions - GPT-5.6 Luna, Thinking; Implementation

### Agent
- Meta: GPT-5.6 Luna; Thinking; Implementation; completed
- Added session-scoped question cancellation to legacy and V2 question services.
- Published `question.rejected` and failed pending deferreds during abort, interruption, processor cleanup, and V2 runner finalization.
- Added TUI cleanup for errored question tool parts when rejection events are missed.
- Verification: legacy question tests 15 pass; core question/tool tests 8 pass; TUI sync tests 11 pass; opencode, core, and TUI typechecks pass; `git diff --check` passed.
- ERROR: TUI sync test logs an existing provider bootstrap HTTP 500 while all 11 tests still pass.

### User
Session recovery
- Interrupted question prompts now reject cleanly, notify the UI, and release Cursor-backed sessions instead of leaving them queued.
- Stale question prompts are removed when their tool part is finalized as an error.

---

## 2026-09-23 (~15:46) - update OpenCode component dependencies - GPT-5.6 Luna, Thinking; Go

### Agent
- Meta: GPT-5.6 Luna; Thinking; Go; completed
- Updated global `@opencode-ai/plugin` from `1.18.4` to `1.18.32` and `~/.opencode` from `1.18.30` to `1.18.32`.
- Updated global `opencode-command-inject` config from `1.3.0` to `1.3.1`; package fetched into the OpenCode cache.
- Refreshed both dependency directories with `bun install`.
- Verification: resolved plugin manifests report `1.18.32`; `opencode debug config` completed and lists `opencode-command-inject@1.3.1`.
- ERROR: `opencode plugin opencode-command-inject@1.3.1 --global` reported no recognized plugin entrypoint, but normal config resolution fetched the package successfully.

### User
Dependency update
- Updated the selected OpenCode plugin dependencies and command-inject version; restart OpenCode to load them.

---

## 2026-09-23 (~15:23) - sync Cursor model catalog tiers - GPT-5.6 Luna, Thinking; Implementation

### Agent
- Meta: GPT-5.6 Luna; Thinking; Implementation; completed
- Added generalized Cursor context-tier materialization for live variants, including Grok 4.7 base, Fast, 500k, and 500k Fast entries with exact wire tuples.
- Added generated Cursor pricing/context/capability tooling, fixture inputs, coverage validation, and current metadata for Grok 4.7 and Claude Opus 5.5.
- Kept legacy `-fast` and `-1m` pricing behavior; arbitrary generated tier keys now resolve directly without collapsing 500k rates into the 1M nested cost.
- Verification: focused Cursor tests (22 pass), live `generate:pricing`, `generate:pricing:check`, `check:pricing` (12 covered), `bun typecheck`, Prettier checks, and `git diff --check` passed.
- Preserved unrelated README, package, TUI, plan-execute, and lockfile worktree changes.

### User
Providers
- Cursor's model picker can now expose live multi-tier models such as Grok 4.7 with correct context limits, Fast variants, wire parameters, and pricing; Claude Opus 5.5 metadata is included.

---

## 2026-09-23 (~15:13) - expose the exact plan path during write handoff - GPT-5.6 Luna, Thinking; Implementation

### Agent
- Meta: GPT-5.6 Luna; Thinking; Implementation; completed
- Changed `packages/opencode/src/tool/write.ts` to include the canonical absolute filepath in successful write output.
- Updated `C:\Users\user\.config\opencode\prompts\sp.md` to require forwarding that returned path unchanged to `plan_execute`.
- Verification: `bun test test/tool/plan-execute.test.ts` passed with 7 tests; `git diff --check` passed. Prettier reports an existing warning in `src/tool/write.ts`.

### User
SuperPlan++ execution
- SuperPlan++ now receives the exact path created by the plan-writing tool instead of reconstructing a plan filename.

---

## 2026-09-23 (~05:20) - require the exact planner plan path - GPT-5.6 Luna, Thinking; Debug

### Agent
- Meta: GPT-5.6 Luna; Thinking; Debug; completed
- Fixed `packages/opencode/src/tool/plan-execute.ts` so `plan_execute` requires an absolute `planPath`, verifies the exact file exists, and passes that path unchanged to both Go execution modes.
- Removed the unsafe `Session.plan(...)` filename reconstruction that generated paths from session timestamps and slugs.
- Updated `C:\Users\user\.config\opencode\prompts\sp.md` to require the exact written path in the tool call.
- Added regression coverage for exact path forwarding and missing-plan rejection in `packages/opencode/test/tool/plan-execute.test.ts`.
- Verification: `bun test test/tool/plan-execute.test.ts` (7 pass), `bun typecheck`, `bunx prettier --check src/tool/plan-execute.ts test/tool/plan-execute.test.ts`, and `git diff --check` passed.
- MISTAKE: The previous execution implementation reconstructed the plan path with `Session.plan(...)` instead of carrying the planner-created path; execution must never invent a plan filename.
- MISTAKE: The first regression-test fixture path was one directory short; corrected it before final verification.

### User
SuperPlan++ execution
- Go now receives the exact plan file created by SuperPlan++ and refuses to run when that file is missing or the path is not absolute.

---

## 2026-09-23 (~04:41) - restore branched Go execution - GPT-5.6 Luna, Thinking; Implementation

### Agent
- Meta: GPT-5.6 Luna; Thinking; Implementation; completed
- Restored `This session` execution in `packages/opencode/src/tool/plan-execute.ts` by appending a synthetic Go message with the planner's model and context.
- Restored `New session` execution with selected model and reasoning variant, creating and background-prompting a separate Go session.
- Updated `C:\Users\user\.config\opencode\prompts\sp.md` and `go.md` for explicit `go <plan-path>` execution without the removed handoff block.
- Added focused tests for both execution paths and conditional reasoning selection.
- Verification: `bun test test/tool/plan-execute.test.ts` (6 pass), `bun typecheck`, `bunx prettier --check src/tool/plan-execute.ts test/tool/plan-execute.test.ts`, and `git diff --check` passed.

### User
SuperPlan++
- Approved plans can now execute in the current session with inherited context or dispatch to a new Go session with the questionnaire-selected model and reasoning.

---

## 2026-09-23 (~04:34) - add execution location questionnaire branch - GPT-5.6 Luna, Thinking; Implementation

### Agent
- Meta: GPT-5.6 Luna; Thinking; Implementation; completed
- Added `This session` and `New session` branching to `packages/opencode/src/tool/plan-execute.ts`.
- Kept model and conditional reasoning questions limited to `New session`; `This session` records immediately without execution.
- Updated `packages/opencode/test/tool/plan-execute.test.ts` for both questionnaire paths.
- Verification: `bun test test/tool/plan-execute.test.ts`, `bun typecheck`, `bunx prettier --check src/tool/plan-execute.ts test/tool/plan-execute.test.ts`, and `git diff --check` passed.

### User
SuperPlan++
- The questionnaire now asks whether execution should use `This session` or `New session` before asking for new-session model choices.

---

## 2026-09-23 (~04:25) - remove SuperPlan++ auto-execution handoff - GPT-5.6 Luna, Thinking; Implementation

### Agent
- Meta: GPT-5.6 Luna; Thinking; Implementation; completed
- Changed `packages/opencode/src/tool/plan-execute.ts` to retain the existing questionnaire and model/variant options while recording selections without starting Go or creating sessions.
- Removed the SuperPlan++ execution-handoff contract and fallback instructions from `C:\Users\user\.config\opencode\prompts\sp.md`.
- Replaced handoff tests with questionnaire-only coverage in `packages/opencode/test/tool/plan-execute.test.ts`.
- Verification: `bun test test/tool/plan-execute.test.ts`, `bun typecheck`, `bunx prettier --check src/tool/plan-execute.ts test/tool/plan-execute.test.ts`, and `git diff --check` passed.

### User
SuperPlan++
- The questionnaire remains available, but its answers no longer trigger automatic Go execution or an execution handoff.

---

## 2026-09-22 (~22:10) - cleanup SuperPlan++ Go handoff - Cursor Grok 4.6, Thinking; Go

### Agent
- Cleaned `plan-execute.ts`: typed `sessionPrompt()` helper, shared model ref for create/prompt, dropped extra Truncate/PlanExecuteTool annotations.
- Cleaned `plan-execute.test.ts`: Effect harness, `run()` helper, dispose only around instance tests.
- Verification: `bun test test/tool/plan-execute.test.ts` 6 pass; prettier check ok; `bun typecheck` ok.

### User
SuperPlan++
- Same Go handoff behavior; just tidier internals. Still rebuild/restart before live Yes/No.

---

## 2026-09-22 (~21:53) - SuperPlan++ Go handoff new root session - Cursor Grok 4.6, Thinking; Go

### Agent
- Changed `packages/opencode/src/tool/plan-execute.ts`: Yes still asks model/variant, then creates a root `Go` session in the active directory and backgrounds `SessionPrompt.prompt` with exact text `go <absolute plan path>`.
- Stopped writing synthetic Go user/text parts into the planner session. Tool metadata now includes the new `sessionID`.
- Loaded `SessionPrompt` at execute time (not tool init). Init-time require cycles `ToolRegistry` <-> `SessionPrompt` and breaks AppRuntime.
- Extended `packages/opencode/test/tool/plan-execute.test.ts`: inherited model/variant handoff; declined Yes/No still creates no session.
- Verification: `bun test test/tool/plan-execute.test.ts` 6 pass; `bunx prettier --check` on those two files ok; `bun typecheck` ok (no `local.tsx:188` this run). Live SuperPlan++ Yes/No questionnaire not exercised.
- Kept `plan.ts`, `registry.ts`, CLI tool display, agents, prompts, session plugin, and unrelated dirty worktree files unchanged.

### User
SuperPlan++
- Approving automatic Go now starts a separate Go session in the same folder instead of continuing inside the planner chat.
- Rebuild/restart OpenCode before trying Yes, No, inherit, and a reasoning model from SuperPlan++.

---

## 2026-09-22 (~01:50) - align OpenTUI with isolated upstream 0.4.5 - Cursor Grok 4.6, Thinking; Go

### Agent
- Rollback SHA: `d29935d` (`pre opentui downgrade`). HEAD at start: `bc38fc8`. Isolated `UPSTREAM\opencode` stayed clean.
- Aligned root catalog `@opentui/core|keymap|solid` to `0.4.5` and plugin peers to `>=0.4.5` via `bun run script/upgrade-opentui.ts 0.4.5`.
- Removed `patchedDependencies` `@opentui/core@0.5.8` and deleted `patches/@opentui%2Fcore@0.5.8.patch`.
- Deleted patch-only `packages/tui/test/opentui-resume.test.ts`. Kept fork TUI source (`terminal-win32.ts`, text coercion) unchanged.
- Regenerated `bun.lock` to OpenTUI `0.4.5` (all platform packages) and `bun-ffi-structs@0.2.4`. Lock also reordered existing `@ai-sdk/openai-compatible@2.0.41` patch map entry; no other dep churn.
- Updated live OpenTUI wording in `README.md` and `README.oc.md`. Paint, key, and `/editor` resume stay unconfirmed until user smoke after rebuild.
- Verification: `bun install --frozen-lockfile` ok; `packages/tui` and `packages/plugin` `bun typecheck` ok (no `local.tsx:188` this run); `packages/tui` `bun test test/terminal-win32.test.ts` 2 pass; `git diff --check` only LF/CRLF warnings; deleted patch/test paths `$false`. Remaining `0.5.8` in `bun.lock` is unrelated `yaml-language-server/request-light@0.5.8`.
- Risk: unpatched `renderer.resume()` may throw on Windows raw-mode after `/editor`.
- Note: no build/install; user must rebuild and restart before live TUI check.

### User
OpenTUI
- OC now uses the same OpenTUI 0.4.5 packages as isolated upstream, without the old resume patch.
- Rebuild and restart before testing a normal launch, palette typing, `/editor` return, and large-chat scroll. Paint, key, and resume issues are not marked fixed yet.

---

## 2026-09-22 (~00:54) - fix Windows clipboard PowerShell script - gpt-5.6-luna, Thinking; Build

### Agent
- Fixed `packages/tui/src/clipboard.ts`: keep `Where-Object` expressions intact when joining the PowerShell script; previous semicolons caused parser errors and silently returned no clipboard content.
- Strengthened `packages/tui/test/clipboard.test.ts` against malformed filter construction.
- Verification: live Windows clipboard reader returned the copied image path; focused clipboard/local-attachment tests passed (10); `bun typecheck` passed.
- ERROR: first live PowerShell probe was invalid because the outer shell expanded `$` variables; reran with correct quoting before isolating the source script error.

### User
Clipboard
- Windows image pasting now reaches OC's existing attachment path instead of failing in the clipboard reader.
- Rebuild and restart OC before retesting; no build or install was run here.

---

## 2026-09-22 (~current) - add Poe GPT-5.6 models - GPT-5.6 Luna, Thinking; Go

### Agent
- Added global `provider.poe` config in `C:\Users\user\.config\opencode\opencode.jsonc` with the Poe OpenAI-compatible endpoint.
- Added `GPT-5.6-Luna`, `GPT-5.6-Terra`, and `GPT-5.6-Sol` with requested display names; kept existing providers and models unchanged.
- Verification: `opencode auth list` shows Poe OAuth; fresh `opencode models poe` lists all three exact IDs; config read-back confirms endpoint, package, and names.
- Restarted through a fresh CLI process for catalog verification; interactive `/models` remains for the user's already-running TUI after restart.

### User
Providers
- Poe now exposes GPT-5.6 Luna, Terra, and Sol in the model picker after restarting OpenCode.

---

## 2026-09-21 (~23:56) - Windows image clipboard paths - gpt-5.6-luna, Thinking; Build

### Agent
- Changed `packages/tui/src/clipboard.ts`: prefer usable Windows image file-drop paths; save image-only clipboard pixels to process-scoped temporary PNG; preserve text fallback.
- Added focused `packages/tui/test/clipboard.test.ts` coverage for file paths, temporary PNG paths, ordering, safe output paths, and text fallback.
- Kept prompt integration, WezTerm source/configuration, generated files, and unrelated worktree changes unchanged.
- Verification: focused clipboard/local-attachment tests passed (10); `bun typecheck` passed in `packages/tui`; `git diff --check` passed with existing line-ending warnings.
- Manual WezTerm clipboard smoke check remains for the user after rebuilding/restarting OC; no build or install was run.

### User
Clipboard
- Windows image pastes now use an existing image file when available, or a temporary PNG when the clipboard contains pixels only, while ordinary text pastes remain unchanged.

---

## 2026-09-21 (~19:54) - set up global Jev MCP tool - gpt-5.6-luna, Thinking; Plan

### Agent
- Registered global `jev` MCP entry in `C:\Users\user\.config\opencode\opencode.json`.
- Kept the TypeSafe key in the launching PowerShell environment; config contains no secret.
- Installed verified `jev-code` checkout at `C:\Users\user\Apps\jev-code`; no `oc` source changes.
- Verification: `oc mcp list` reported `jev connected`; user confirmed the live TypeSafe request succeeded; config has no token or temp path.
- Note: npm package lookup returned HTTP 404; setup uses the GitHub checkout. Upstream Windows/CRLF check failures remain isolated to that checkout.

### User
Providers
- Jev is available globally in `oc` as a structured decision tool through the TypeSafe API; it does not appear in `/models`.
- No UI change.

---

## 2026-09-21 (~19:36) - disable stock plan agent from user config - gpt-5.6-luna, Thinking; Go

### Agent
- Fixed `C:\Users\user\.config\opencode\opencode.jsonc`: changed the stock `plan` agent key from `disabled` to `disable`.
- Added focused coverage for built-in `plan` removal and separate `hidden` addressability in `packages/opencode/test/agent/agent.test.ts`.
- Verification: focused agent tests passed: 45 pass; `git diff --check` passed; `bun typecheck` remains blocked by the known unrelated `test/plugin/cursor.test.ts:16` cast error.

### User
Agents
- The stock Plan agent is now disabled through the active configuration key, while `hidden` remains a separate option that does not remove an agent from backend resolution.

---

## 2026-09-21 (~current) - disable Cursor native plan mode - gpt-5.6-luna, Thinking; Go

### Agent
- Changed `resolveCreatePlanBridge` to acknowledge Cursor CreatePlan requests without staging, persisting, or opening an approval gate.
- Kept SwitchMode plan/spec rejection and leave-plan behavior unchanged.
- Verification: focused Cursor provider tests passed: 17 pass; `bun typecheck` reports the known unrelated `test/plugin/cursor.test.ts:16` cast error.

### User
Providers
- Cursor-backed sessions no longer expose or activate native plan-mode requests; ordinary OpenCode planning agents remain unchanged.

---

## 2026-09-18 (~current) - Cursor compaction rebase token - grok-4.6; Go

### Agent
- Changed `resolveTurnConversationReset`: take `allowTools`; no-tool turns do not delete the post-compaction rebase token
- Changed `CursorSession.postCompactionRebase`: true when compaction or token still pending after resolve
- Verification: `bun test ./test/provider/cursor.test.ts ./test/plugin/cursor.test.ts` 18 pass

### User
Providers
- After Cursor compact, a title or other no-tool job cannot steal the one-time rebase. The next real tool-using turn still starts a fresh Cursor conversation from the summary.

---

## 2026-09-18 (~current) - Cursor compaction host reset flag - grok-4.6; Go

### Agent
- Added `applyCursorCompactionOption` in `session/llm/request.ts`: sets `opencodeCompaction` for cursor + agent compaction before `chat.params`
- Added `isCursorCompactionTurn`: nested or flat providerOptions; `startSession` no longer uses `isCompactionSession`
- Removed unused `compaction-marker.ts`; kept plugin `chat.params` as redundant write
- Verification: `bun test ./test/provider/cursor.test.ts ./test/plugin/cursor.test.ts` 17 pass

### User
Providers
- OpenCode Cursor compact now always starts a new Cursor conversation, then rebases the next turn from the summary, even if the old OpenCode 2 compaction marker is missing.

---

## 2026-09-18 (~current) - Cursor seed host preamble on empty catalog - grok-4.6; Go

### Agent
- Changed `buildOpenCodeInteractionGuidance`: non-compaction empty tool catalogs still return the seven-sentence OpenCode host vs Cursor-provider block; catalog/tool-list bullets stay gated on `names.size > 0`; compaction still `undefined`
- Kept `startSession` `systemPrompt: conversationState ? undefined : systemPrompt`; no `task.ts` change
- Verification: `bun test test/provider/cursor.test.ts` 12 pass

### User
Providers
- Cursor conversation seeds keep the OpenCode host preamble even when the first Run has no tools. Checkpointed continuations still omit system prompt.

---

## 2026-09-18 (~current) - Cursor provider host-identity injection - grok-4.6; Go

### Agent
- Changed `buildOpenCodeInteractionGuidance`: lead with OpenCode host vs Cursor-provider split (not Cursor IDE; child `task` is OpenCode; Cursor protocol only when child model is this native Cursor provider)
- Added focused test in `test/provider/cursor.test.ts`
- Kept later remap / no-SwitchMode-to-plan lines unchanged; compaction still skips guidance

### User
Providers
- Cursor-model turns now state that the host is OpenCode and that child tasks are OpenCode sessions, not Cursor IDE.

---

## 2026-09-18 (~current) - make Select a project open TUI palette (Image 2) - muse-spark-1.2-contributor, Thinking; Build

### Agent
- Changed `packages/opencode/src/cli/cmd/oc.ts`: removed `autocomplete` clack picker for `--palette`; palette now spawns `opencode --palette` TUI directly via `Bun.spawn` with inherit stdio, `app.tsx:824` dispatches `oc.new_session` DialogSelect (dark modal Image 2) instead of gold full-screen list Image 1
- Removed unused `import { autocomplete, isCancel } from "@clack/prompts"` and `listHomeDirs`/`dirsPromise` from palette path; kept `resolvePaletteLaunch` validation and non-palette `bootstrap`+`attach` unchanged
- Verification: `grep autocomplete` 0 hits in `oc.ts`, `bun test ./test/cli/command-loader.test.ts ./test/cli/oc.test.ts` 21 pass, `dotnet build` in sibling `octray` 0 warnings 0 errors, `octray` now resolves `opencode.exe` for palette
- Note: user must rebuild `oc.exe`/`opencode.exe` (`.scripts\build.ps1` or `buildDebug.ps1 -SkipInstall` then install with `-NoBuild` after closing TUI) before `oc --palette "New session (oc)"` shows Image 2

### User
Launch
- Select a project now opens the real opencode palette instead of the intermediate full-screen list.

---

## 2026-09-18 (~current) - stop managed processes before install build - gpt-5.6-luna, Thinking; Build

### Agent
- Fixed `.scripts\install.ps1`: move existing managed-process shutdown before the build so `ocdebug.exe` cannot lock the build cleanup path
- Kept process names and 30-second exit wait unchanged; installer still owns the stop behavior
- Verification: PowerShell parser passed; focused diff check passed; installer was not run
- ERROR: `install.ps1 -h` is unsupported by its existing parameter declaration; no installer mutation was performed during verification

### User
Build and install
- The installer now stops managed OpenCode processes before rebuilding, preventing locked debug binaries from breaking cleanup.

## 2026-09-18 (~current) - searchable fast project picker - gpt-5.6-luna, Thinking; Build

### Agent
- Changed `packages/opencode/src/cli/cmd/oc.ts`: use `@clack/prompts.autocomplete` with a search placeholder; preserve cancellation, bootstrap, and attach flow
- Kept `octray` launcher unchanged; picker behavior belongs in the `oc` fork
- Verification: `bun typecheck` passed; focused CLI tests passed 21/21; `.scripts\buildDebug.ps1 -SkipInstall` passed on Bun 1.4.1
- Manual built-binary check: typing `octray` narrowed the picker to one match; Enter selected it and entered the attached TUI
- ERROR: source `bun run src/index.ts oc launch --palette ...` attach reached a missing `react` package in `packages/tui`; built binary attach check passed

### User
Launch
- Select a project now supports typing a phrase or project name to filter the list before selecting.

## 2026-09-18 (~current) - oc --palette fast launch picker - Cursor Grok 4.6; Go

### Agent
- Added `--palette` to `VALUE_OPTIONS` and `LaunchCommand`; `oc.exe --palette "New session (oc)"` maps to `oc launch --palette ...` (`command-loader.ts`)
- Added `OcConfig.PALETTE_NEW_SESSION_OC`, `resolvePaletteLaunch`, `listHomeDirs`; unknown titles fail loud; `--palette` + target rejected
- Changed launch: intro + `startServer` + clack homeDir select + `session bootstrap` + attach (no worker TUI)
- Fixed `startIntro` stop: full `\x1b[0m\x1b[?25h\x1b[2J\x1b[H`; old frame-only wipe left a black bar over the picker
- Note: TUI `listOcHomeDirs` stays sync in `app.tsx`; keep sort aligned with `OcConfig.listHomeDirs`
- Verification: `bun test test/cli/command-loader.test.ts test/cli/oc.test.ts` 21 pass
- Note: user must rebuild/install `oc.exe`; agents must not run install scripts

### User
Launch
- `oc --palette "New session (oc)"` shows the intro, then a project list, then attaches to the resident server. The leftover black bar over the list is cleared.

---

## 2026-09-17 (~current) - restore ponytail npm plugin - grok-4.6; Go

### Agent
- Changed `~\.config\opencode\opencode.jsonc` `"plugin"`: added unpinned `@dietrichgebert/ponytail` npm spec; kept sessions.js + other npm plugins; did not list a directory; did not add a `~\.opencode\plugins\` wrapper
- Note: cache already has `@dietrichgebert/ponytail` 4.10.0 under `~\.cache\opencode\packages\`; previous removal was because the spec toasted when the package was missing, not because the plugin is forbidden
- Kept Session bombs rule: npm/file specs only, never a plugins folder in `"plugin"`

### User
Config
- Ponytail is back as a normal npm plugin. Restart OpenCode if `/ponytail` is missing after this jsonc edit. The TUI paint bug is unrelated.

---

## 2026-09-17 (~current) - prevent session bombs (plugin list + instructions) - grok-4.6; Go

### Agent
- Changed `~\.config\opencode\opencode.jsonc` `"plugin"`: removed `fork-chat.ts` (auto-discovery from `~\.opencode\plugins\`); removed `@dietrichgebert/ponytail`; kept `opencode-sessions.js` file spec + npm `opencode-command-inject@1.3.0`, `opencode-ascii@0.1.8`, `opencode-notify@0.3.1`, `opencode-planner@latest`, `opencode-pty@0.3.6`
- Added `principles.md` `## Session bombs`; added same short reminder to `agents/Debug.md`, `Debug-a.md`, `DebugAgent+.md`
- Kept `C:\Users\user\.opencode\plugins\fork-chat.ts` on disk; did not edit `fork-chat.ts`, TUI paint probes, persist cap, or `publishPluginError`
- Note: TUI paint still broken; this pass only stops `bad plugin spec -> toast -> dump into chat -> fork copies it`
- Plan: `~\.config\opencode\plans\2026-09-17-prevent-session-bombs.md`; paint plan stays frozen at `~\.config\opencode\plans\2026-09-17-debug-geometry-overlay.md`

### User
Config
- Local fork-chat loads from the plugins folder by itself; it is no longer listed in jsonc. Dead ponytail plugin is gone. Agents must file long plugin/TUI dumps instead of pasting them into keeper chats. OpenCode paint is not fixed.

---

## 2026-09-17 (~current) - trim duplicated buildNotes procedure from project MDs - muse-spark-1.2-contributor, Thinking; Build

### Agent
- Trimmed `AGENTS.md:10-13` Build notes from 4 bullets to 1 pointer to skills `base/build-notes`/`base/build-notes-archive`; kept `buildNotes.txt`/`.md/` guard
- Trimmed `buildNotes.md:14-59` procedural duplication: removed `## Entry format (working example)` code fence, `## Archive Rotation` 10 bullets, `### Cumulative Summary Shape`; replaced with skill pointers (net -39 lines, 577->538); skills now under `skills/base/`
- Kept `## Agent Note Language`, `### MISTAKES - NEVER REPEAT`, `### Project invariants`, human rules, `Cumulative Summary` data; no archive modified
- Verification: `git diff --check` clean (LF/CRLF warnings only), `git status` 2 MDs modified, read-back confirmed pointers

### User
Docs
- Session history docs now point to the shared skills instead of repeating the full procedure in each file
- Build notes stay newest-first and rotate the same way, just with less duplicated text

---

## 2026-09-16 (~23:36) - close lifecycle reconnect investigation - GPT-5.6 Luna; Debug

### Agent
- Closed `2026-09-16-debug-main-prompt-pty.md` after user-confirmed successful `ocDebug` lifecycle session with no freeze and meaningful recovery changes.
- Reviewed scoped TUI, PTY, launcher, and server changes; preserved unrelated worktree modifications.
- Verified focused suites, package typechecks, and `git diff --check`; retained documented `/status` 404 and typecheck-baseline notes.
- Confirmed active source contains no temporary diagnostic markers; archived plan collision-safely.

### User
- Lifecycle reconnect investigation is closed after the successful debug session and final cleanup review.

## 2026-09-16 (~22:31) - strengthen lifecycle prompt-focus verification - GPT-5.6 Luna; Debug

### Agent
- Corrected `packages/tui/test/app-lifecycle.test.tsx`: inspect only `TextareaRenderable` instances, assert renderer focus ownership, and use production-matched Kitty keyboard input for deliberate text.
- Verified focused TUI lifecycle, sync, SDK, core PTY, launcher, and websocket suites; all passed with documented platform skips.
- Verified TUI, core, and OpenCode typechecks plus `git diff --check`; no temporary debug markers remain in active files.
- Kept production source and unrelated worktree changes unchanged; debug binary was not rebuilt or installed.

### User
- Lifecycle recovery coverage now directly checks that the recovered main prompt owns focus and accepts deliberate input without automatic prompt replay.

## 2026-09-16 (~22:13) - lifecycle reconnect corrective pass - GPT-5.6 Luna; Go; Plan

### Agent
- Fixed restart recovery gating: disposal and replacement reconnect are both required before bootstrap recovery completes.
- Added reactive post-bind prompt focus with in-tree, modal-safe, destroyed-renderable, and stale-timer guards; preserved no automatic prompt replay.
- Isolated resident server state tests to temporary directories; retained live defaults in production helpers.
- Verified TUI, core, and opencode typechecks; focused lifecycle, sync, SDK, PTY, restart, websocket, and CLI suites passed; Windows live PTY cases skipped by platform.
- ERROR: `packages/opencode/test/server/httpapi-listen.test.ts` has one pre-existing `/status` expectation returning 404; this test file contains unrelated worktree changes and was not modified.
- Kept unrelated worktree changes untouched. Plan retained because one named verification remains blocked.

### User
- Reconnect recovery now waits for the replacement connection, restores the current session prompt safely, preserves palette behavior, and avoids resubmitting prompts.
- Resident-state tests no longer touch the live server-state file.

## 2026-09-16 (~current) - lifecycle reconnect recovery blocked at review - GPT-5.6 Luna; Go-a; Plan

### Agent
- Implemented approved G1-G3 lifecycle changes for TUI recovery, resident server identity, and PTY replay/teardown ordering.
- Verified TUI, core, server, and opencode typechecks; focused lifecycle, PTY, restart, and websocket suites passed; Windows live PTY cases skipped by platform.
- Ran approved G4 review; blocked on recovery epoch gating, explicit post-bind prompt focus/input coverage, and tests mutating live resident state.
- Kept unrelated app, desktop, documentation, and existing worktree changes untouched; no new corrective edits retained after review blockers were identified.

### User
- Lifecycle recovery changes are implemented, but final review found three blockers that need clarification before corrective work can safely continue.

---

## 2026-09-16 (~20:23) - import all debug config assets - GPT-5.6 Luna; Go

### Agent
- Meta: GPT-5.6 Luna; executed `2026-09-16-debug-import-production-settings.md`; no build or install.
- Added recursive allowlisted sync in `packages/core/src/debug-config.ts` for agent, prompt, command, mode, plugin, skill, tool, and theme assets; preserved debug port normalization and overwrite behavior.
- Added `packages/core/test/debug-config.test.ts` coverage for all supported directory names, nested files, preservation, replacement, and import reporting.
- Verified focused core checks (2 pass), core typecheck, Prettier, and `git diff --check`.
- Kept shared `~/.opencode` content, plans, archives, package metadata, and unrelated worktree changes untouched.

### User

Debug configuration
- Import production settings into debug now brings custom agents and their prompt files, plus commands, modes, plugins, skills, tools, and themes.
- Existing debug-only settings remain protected during startup seeding; explicit import still overwrites matching settings and keeps port `4097`.

---

## 2026-09-16 (~current) - remove open computer use - GPT-5.6 Luna; Build

### Agent
- Removed global OpenCode MCP entry from `C:\Users\user\.config\opencode\opencode.json`.
- Uninstalled global `@opensymph/open-computer-use@1.2.0`; bundled launcher and Codex plugin removed with package.
- Verified no separate OpenCode, Codex, Claude, or Gemini plugin registration remained.

### User
- Open Computer Use is disabled in OpenCode and uninstalled from the global npm tools.

---

## 2026-09-16 (~current) - make ocdebug a native isolated launcher - GPT-5.6 Luna; Go

### Agent
- Removed profile `opencode` alias and `ocdebug` wrapper; PATH-native executables now own command resolution.
- Added `@opencode-ai/core/debug-config`: seeds missing production user config/authentication into debug, supports explicit overwrite, and forces debug server port `4097`.
- Fixed TUI OC settings to read debug config paths and preserve debug identity when persisting settings.
- Added debug-only command-palette import with restart guidance; documented native session export/import in `SCRIPTS.md`.
- Added focused debug config and native routing coverage.
- Verified core debug-config test, OpenCode command-loader/config tests (`14 pass`), core/OpenCode/TUI typechecks, Prettier, and `git diff --check`.
- ERROR: first concurrent OpenCode focused test run hit an `afterEach` timeout; isolated config tests and the combined rerun passed. Profile smoke check resolved all four commands as applications but emitted the profile's existing noninteractive cursor-position error during `clear`.

### User
- `ocdebug` now runs directly from PATH like `oc`, with separate runtime data and port `4097`.
- Debug starts with copied production settings when missing and can overwrite them from the command palette; restart debug afterward.
- Production sessions can be copied with `opencode export` and `ocdebug import`.

---

## 2026-09-16 (~02:55) - remove web and desktop packages - GPT-5.6 Luna; Plan

### Agent
- Removed `packages/app`, `packages/desktop`, embedded UI serving, `opencode web`, Electron release wiring, desktop Nix outputs, and obsolete download routes.
- Preserved CLI, TUI, headless API, `RuntimeFlags.client`, `OPENCODE_CLIENT`, documentation site, console, SDKs, and shared session UI types.
- Regenerated `bun.lock` with Bun 1.3.14 after removing the workspace and Electron dependency subgraphs; fixed the root `package.json` trailing comma encountered during the first build.
- Verified `bun install` via `bunx --package=bun@1.3.14 bun install --frozen-lockfile --no-progress`, OpenCode/session-ui typechecks, session-ui tests (83), translation tests (15 with a temporary root-safe Bun config), help snapshots (33), CLI build, and `git diff --check`.
- ERROR: Nix hash regeneration was unavailable because `nix` is not installed on Windows. Remaining localized translation files still contain historical `opencode web`/desktop wording; English documentation and localized `web.mdx` pages were updated or removed as scoped.

### User
Removal
- The repository no longer builds or publishes the browser UI and Electron desktop application, while CLI, TUI, API, docs, SDK, console, and shared session functionality remain.

---

## 2026-09-16 (~current) - record terminal PTY hang in oc17 - GPT-5.6 Luna

### Agent
- Blocked session `oc17`: agent ended on `-WAITING FOR PTY-` while work remained incomplete.
- ERROR: User reported that the session remains live but accepts no typing after the marker; the command palette remains accessible. This is an input-state/PTy handling failure, not an absent or dead session.
- TODO: Investigate why `-WAITING FOR PTY-` can leave the live session's main input unusable while command-palette input still works.

### User
- Session `oc17` remained live but the main input became unusable at `-WAITING FOR PTY-`; the command palette still worked. This is a serious agent termination and PTY input-state problem to investigate later.

---

## 2026-09-16 (~01:18) - fix TUI persistence error formatting - GPT-5.6 Luna

### Agent
- Fixed `packages/tui/src/context/local.tsx`: reused `errorMessage` for session agent/model persistence failures; handles generated empty `BadRequest` and nested `NotFoundError` shapes.
- Verified `bun run typecheck` in `packages/tui` and workspace `bun turbo typecheck`: 30 packages successful.

### User
- Session agent and model save failures now show readable error messages without blocking the pre-push typecheck.

---

## 2026-09-16 (~00:33) - align custom feature inventory - GPT-5.6 Luna, Go; Plan

### Agent
- Meta: Executed `2026-09-16-align-custom-feature-list.md`; documentation-only inventory alignment.
- Changed `Custom Feature List.md`: refreshed review date, evidence paths, caveats, statuses, numbering, and three wired capabilities.
- Added Everything Search MCP lifecycle, configurable sidebar usage providers, and persistent debug logging rows.
- Recounted 42 active rows: 12 Done, 10 High, 20 Medium, 0 Low; corrected the plan's inaccurate projected counts from the final table.
- Verified full-file review, 42 status rows, exact status counts, isolated target status, and `git diff --check` with no target whitespace errors.
- Kept source, tests, generated files, configuration, and unrelated worktree changes unchanged.

### User
- Feature inventory now matches the current fork more closely, including wired user-level integrations and explicit live-evidence caveats.
- Remaining provider authentication, installed-runtime, picker, restart, and lifecycle checks stay visible instead of being marked complete.

---

## 2026-09-16 (~current) - configure OC launch directories - GPT-5.6 Luna, Go

### Agent
- Added persisted `ocDir` setting; retained existing `homeDir` as the relative-project root.
- Updated native launch resolution: bare `oc` uses `ocDir`, relative targets use `homeDir`, and absolute targets remain direct.
- Added validated `OC directory` command-palette prompt beside existing OC settings; `homeDir` validation now shares the same directory resolver.
- Verified 17 focused CLI/config checks, Prettier, and `git diff --check`; typecheck reports only documented baseline `packages/tui/src/context/local.tsx:188`.
- Manually reviewed source registration for both OC settings; did not restart the active host to load the modified TUI binary.

### User
- Bare `oc` and relative project launches now use separate configurable directories, with both settings available in the OC command palette.

---

## 2026-09-15 (~current) - use configured OC home for relative targets - GPT-5.6 Luna, Go

### Agent
- Fixed `packages/opencode/src/cli/cmd/oc.ts`: omitted targets use the invoking directory; supplied relative targets use configured `homeDir`; absolute targets remain absolute.
- Passed launcher `settings.homeDir` into `resolveTargetDirectory` without changing native bootstrap, attach, model, agent, or rename flow.
- Updated `packages/opencode/test/cli/oc.test.ts` for distinct cwd, configured home, and absolute-path cases.
- Verified 11 focused CLI tests, Prettier, and `git diff --check`; typecheck reports only the documented baseline at `packages/tui/src/context/local.tsx:188`.

### User
- `oc` now opens `C:\Users\user`, `oc something` opens `C:\Users\user\Documents\GitHub\something`, and absolute paths are used directly.

---

## 2026-09-15 (~current) - document known typecheck baseline - GPT-5.6 Luna

### Agent
- Added `AGENTS.md` verification policy for the existing `packages/tui/src/context/local.tsx:188` generated SDK error-type diagnostic.
- Unrelated plans may report, but not block on, this unchanged diagnostic; new failures or touched error paths still block.

### User
- Future unrelated work will not be blocked by the same known typecheck error.

---

## 2026-09-15 (~current) - launch OC from invoking directory - GPT-5.6 Luna, Go

### Agent
- Changed `packages/opencode/src/cli/cmd/oc.ts`: resolve omitted and relative targets from `process.cwd()`; preserve absolute targets.
- Changed `packages/opencode/src/cli/command-loader.ts`: route explicit `oc oc` through native `oc launch`.
- Added resolver and command-loader regression tests; reused native bootstrap and attach flow.
- Verified focused CLI tests: 11 pass; session bootstrap tests: 2 pass; Prettier and `git diff --check` pass.
- MISTAKE: initial resolver test omitted `test` import; corrected before focused tests passed.
- ERROR: `bun typecheck` remains blocked by pre-existing `packages/tui/src/context/local.tsx:188` TS2339; no new error reported in changed files.

### User
CLI launch
- Running `oc` now opens the project at the invoking directory.
- Running `oc <path>` creates and attaches a new project session, including absolute paths and the `oc oc` target.
- Typecheck still has an unrelated existing TUI error.

---

## 2026-09-16 (~current) - fix hard-link verification predicate - GPT-5.6 Luna

### Agent
- Fixed `.scripts\install.ps1`: negate array `-match` result instead of using array `-notmatch`; `fsutil` output now accepts valid links when unrelated lines are present.
- Verified installed `opencode.exe`, `oc.exe`, and `occ.exe` share the same hard-link set; PowerShell parse and predicate checks passed.
- Kept installer execution unrun because it stops the active OpenCode host; user can rerun with `-NoBuild` after exiting OpenCode.

### User
- The installer now accepts correctly created `oc.exe` and `occ.exe` hard links instead of failing during its final verification.

---

## 2026-09-16 (~current) - guard OpenTUI resume input restoration - GPT-5.6 Sol, Go

### Agent
- Added pinned `@opentui/core@0.5.8` Bun patch: resume tolerates `setRawMode(true)` failure and continues stdin listener restoration in Bun and Node bundles.
- Added `packages/tui/test/opentui-resume.test.ts`; test fails without patch and passes with patch.
- Verified 9 focused TUI tests, Prettier, `git diff --check`, and safe debug build with `ocdebug --version` basic check.
- ERROR: TUI typecheck remains blocked by pre-existing `packages/tui/src/context/local.tsx:188` TS2339; no new-file type error reported.
- Kept original Windows freeze causality unconfirmed; live R0-R3 terminal checks not run.
- Accepted pre-existing typecheck failure as unrelated baseline by user direction; archived execution plan.

### User
Windows TUI
- Returning from a suspended renderer can no longer leave input detached when Windows temporarily rejects raw-mode restoration.
- A focused regression test covers the recovery path; the original field freeze still needs a live reproduction to confirm causality.

---

## 2026-09-15 (~current) - separate safe builds from self-install - GPT-5.6 Luna, Go

### Agent
- Added agent-safe `.scripts\build.ps1` production-plus-debug output and `.scripts\buildDebug.ps1` debug-only output; both leave `C:\Users\user\Apps\opencode` untouched.
- Added real debug artifact mode in `packages\opencode\script\build.ts` under `dist\opencode-debug-windows-x64\bin\ocdebug.exe` with targeted cleanup.
- Added inherited OpenCode process guards to canonical and sync installers, removed silent build-failure returns, and routed legacy `.install.ps1` through canonical installers.
- Documented the agent build/install handoff in `AGENTS.md` and `SCRIPTS.md`.
- Verification: 14 focused tests passed; PowerShell parsing passed for 7 scripts; production and debug builds passed with Bun 1.4.1-canary.1; debug-only `--version` passed; installer guards refused before process or file mutation; `git diff --check` passed with existing LF/CRLF warnings.
- ERROR: `packages\opencode` typecheck remains blocked by the pre-existing `packages\tui\src\context\local.tsx:188` error. Initial dependency-install build path stalled; the debug build completed with `-SkipInstall`. User manually installed the production/debug artifacts.

### User
- Agents can build safely, then hand installation to the user from a fresh PowerShell with `-NoBuild`.

---

## 2026-09-15 (~current) - verify fresh SuperPlan capability contract - GPT-5.6 Luna, Thinking; Go

### Agent
- Meta: GPT-5.6 Luna; completed fresh-session verification for `2026-09-15-plan-mode-tool-contract.md` and the retained handoff plan.
- Verified fresh `superPlan++` read-only probe: `read`, `glob`, `grep`, `bash`/`Get-ChildItem`, exact tool reporting, no plan mutation, and no confirmation question.
- Verified fresh `superPlan-a` probe: `read`, `glob`, `grep`, `bash`/`ls`, `list_mcp_resources`, one background `sp-scout` task (`ses_f58723067ffej3Y0wke6AdONGa`) completed read-only, no plan mutation.
- Verified fresh `superPlan++` write probe created and edited only `2026-09-15-fresh-plan-write-smoke.md`; exact archive move then passed with source absent and destination present.
- Kept source/config/repository changes limited to the intended prompt, agent, and `buildNotes.md` files; `git diff --check` passed with existing Git line-ending warnings.

### User
- Fresh SuperPlan++ and SuperPlan-a sessions now use the explicit read-only capability contract and report their exact tools.
- Plan creation, editing, and collision-safe archival work in a fresh session without modifying repository files.

---

## 2026-09-15 (~current) - define strict SuperPlan capability contract - GPT-5.6 Luna, Thinking; Go

### Agent
- Meta: GPT-5.6 Luna; executed `2026-09-15-plan-mode-tool-contract.md`; agent-permission and prompt configuration.
- Changed `C:\Users\user\.config\opencode\agents\superPlan++.md` and `superPlan-a.md`: explicit plan-root/archive-root `write`/`edit`, read-only bash allowlist, mutation denies, planning skill allowlist, and exact archive exceptions.
- Changed `C:\Users\user\.config\opencode\prompts\sp.md` and `sp-a.md`: literal direct-tool, bash, plan-mutation, discovery, MCP, and background-task contracts.
- Verified permission/prompt assertions, Go handoff compatibility, disposable archive success, collision refusal, cleanup, and `git diff --check`.
- ERROR: Fresh-session probes remain pending because restarting the active OpenCode host would terminate this execution; retained both agent-created plans and did not archive this plan.

### User
- SuperPlan modes now have a written strict read-only research contract with broad reads and web research, plus only Markdown plan creation, editing, and archival exceptions.
- A fresh OpenCode restart is still required before live permission and prompt probes.

---

## 2026-09-15 (~current) - make SuperPlan handoffs deterministic - GPT-5.6 Luna, Thinking; Go

### Agent
- Meta: GPT-5.6 Luna; executed `2026-09-15-explicit-superplan-handoff.md`; prompt/configuration change.
- Changed `C:\Users\user\.config\opencode\prompts\sp.md` and `sp-a.md`: material-decision questions only; tool and permission availability is stated from the effective catalog; handoff format is mandatory; plan creation and archive mechanics are explicit.
- Kept `go.md`, `go-a.md`, both SuperPlan agent definitions, and unrelated worktree changes unchanged.
- Verified prompt assertions, executor-field compatibility, plan-only permissions, effective paths, disposable handoff archive move, and `git diff --check`.
- ERROR: Could not restart the active OpenCode host without terminating this execution; fresh-start prompt reload remains pending. Kept the agent-created plan active and did not archive it.

### User
- SuperPlan now has a fixed handoff contract and explicit plan creation/archive rules, while Go remains a flexible handoff consumer.
- OpenCode must be restarted before the new prompt behavior is exercised in a fresh session.

---

## 2026-09-15 (~23:15) - remove Windows process-tree supervisor - GPT-5.6 Luna, Thinking; Go

### Agent
- Meta: Recovered and completed `oc - scrap supervisor (fork #1)` execution handoff.
- Removed fork-only `opencode-process-tree.exe` runtime, native source/build files, packaging, CI, signing, and installer wiring.
- Restored `packages/core` direct `cross-spawn` execution with hidden Windows `taskkill /pid ... /T /F` cleanup; retained descendant, concurrent-tree, and additional-FD coverage.
- Replaced installed binaries with the direct-spawn build; verified installed and packaged hashes match.
- Removed stale `C:\Users\user\Apps\opencode\opencode-process-tree.exe` and empty native helper output directories.
- Verified 27 spawner tests, 24 process tests, 11 OpenCode process tests, core typecheck, supervisor-reference scan, helper absence, supervisor-scope Prettier, and `git diff --check`.
- ERROR: OpenCode typecheck remains blocked by pre-existing `packages/tui/src/context/local.tsx:188` union-narrowing error; unrelated worktree change preserved.
- Kept unrelated ripgrep, grep, `.gitignore`, `buildNotes.md`, and `.scripts/grepbench` changes untouched.

### User
- OpenCode no longer ships or installs the fork-only Windows process-tree supervisor.
- Windows child processes use the native OpenCode spawning path, while the resident server behavior remains unchanged.
- The execution plan remains open because the package-wide OpenCode typecheck still has an unrelated existing TUI error.

---

## 2026-09-15 (~19:12) - reserve automatic Luna routing for Tier 3 - GPT-5.6 Luna, Thinking; Go

### Agent
- Meta: GPT-5.6 Luna; executed `2026-09-15-luna-tier-routing.md`; prompt/configuration-only change.
- Changed `C:\Users\user\.config\opencode\prompts\sp-a.md`: removed automatic Tier 1/2 Luna planning paths; kept Tier 3 and explicit manual requests.
- Changed `C:\Users\user\.config\opencode\prompts\go-a.md`: removed automatic Tier 2 Luna implementation/review paths; kept Tier 3 and explicit manual requests.
- Kept Luna aliases, permissions, provider definitions, and `oc.json:8` session default unchanged.
- Verified routing assertions, prompt readability, retained alias permissions, and unchanged session-model content.
- MISTAKE: initial readability check incorrectly expected frontmatter in prompt-body files; corrected to path/content assertions before closeout.

### User
Agent routing
- Automatic planning and execution delegation now reserves Luna for Tier 3 work.
- You can still request any defined Luna alias manually at any tier.
- The existing Luna session default was left unchanged.

---

## 2026-09-15 (~09:33) - restore smart PTY shell selection - GPT-5.6 Luna, Thinking; Go

### Agent
- Meta: GPT-5.6 Luna; completed agent-created PTY restoration plan.
- Changed `C:\Users\user\.config\opencode\principles.md`: selected `pty_spawn` for long-running, interactive, and independent work; kept synchronous `bash` for short dependent commands.
- Changed `C:\Users\user\.config\opencode\prompts\go.md`: preserved single-threaded plan ownership while allowing same-turn independent PTY sessions.
- Verified `opencode-pty@0.3.6`, cached package, `pwsh` shell, and `permission.bash: allow`.
- Verified two same-turn PTY sessions with `pty_list`, `notifyOnExit`, and `pty_read`; both exited 0 with expected output.
- Verified synchronous `bash` working-directory inspection and `git diff --check`; only existing LF/CRLF warnings appeared.
- Kept unrelated repository changes untouched; no source, test, dependency, or plugin changes.

### User
- Long-running and independent shell work can use concurrent PowerShell sessions again, while short dependent commands remain synchronous.

## 2026-09-15 (~05:25) - complete Everything MCP sort alias plan - GPT-5.6 Luna, Thinking; Go

### Agent
- Meta: GPT-5.6 Luna; accepted upstream quality baseline per user.
- Kept local `mcp-everything-search` checkout, version `0.2.2`, exact `mcp==1.1.2` lock, and case-insensitive aliases normalized to canonical numeric Everything sort values.
- Kept `~/.config/opencode/opencode.jsonc` on the local `uv run --locked` command with existing SDK environment.
- Verified `uv lock --check`, 23 package tests, schema/model inspection, MCP stdio calls for alias `name`, numeric `14`, and omitted sort, and `packages/opencode` MCP tests (2 passed).
- Accepted three upstream Ruff findings and 16 Pyright errors plus two warnings without unrelated cleanup.
- Closeout: archive move pending final path verification.

### User
- The local Everything Search fix is complete and uses a reproducible locked checkout.
- Existing upstream lint and typing findings were accepted as baseline and were not changed.

---

## 2026-09-15 (~current) - local Everything MCP sort aliases - GPT-5.6 Luna, Thinking; Go

### Agent
- Meta: GPT-5.6 Luna; single-threaded plan execution.
- Added local `mcp-everything-search` checkout with case-insensitive sort aliases; numeric Everything SDK values remain canonical.
- Pinned package version `0.2.2` and `mcp==1.1.2`; regenerated `uv.lock`.
- Changed `~/.config/opencode/opencode.jsonc` to launch the checkout through `uv run --locked`; retained `EVERYTHING_SDK_PATH`.
- Verified `uv lock --check`, `uv run --locked pytest` (23 passed), targeted schema/model checks, MCP stdio calls for alias `name`, numeric `14`, and omitted sort (100 results each), and `packages/opencode` MCP tests (2 passed).
- ERROR: full package Ruff fails on three pre-existing unused imports/exception-variable findings.
- ERROR: package Pyright fails on 16 pre-existing typing errors and 2 warnings across upstream platform, provider, and server code.
- ERROR: OpenCode root test command is blocked by the repository root-test guard; package-directory rerun passed.
- Blocked: plan retained and not archived until the package lint/type baseline is resolved or explicitly accepted.

### User
- Everything Search now has a local locked configuration that accepts friendly sort labels while preserving numeric sorting.
- The requested runtime checks passed, but the plan remains open because the upstream package's full Ruff and Pyright checks are not clean.

---

## 2026-09-15 (~04:52) - verify Everything Search contract - GPT-5.6 Luna, Thinking; Build

### Agent
- Meta: GPT-5.6 Luna; live MCP verification and guidance correction.
- Verified `everything-search.search` against the live Windows index with default sorting, `sort_by: 1`, `sort_by: 3`, `sort_by: 13`, path matching, bounded results, and an empty match.
- Fixed shared `principles.md` guidance: document numeric Windows `sort_by` enum and prohibit string labels such as `name` and `path`.
- Kept OpenCode source unchanged; the reported failure was invalid input, not daemon or SDK failure.
- ERROR: initial focused test run hit a transient 10-second global cleanup timeout; rerun with the repository `--timeout 30000` setting passed.

### User
- Everything Search is working and returned indexed files from the live Windows installation.
- Agents now have the numeric sort mapping, so they will not retry with unsupported labels such as `name`.

---

## 2026-09-15 (~03:36) - newest-first buildNotes insert - Cursor Grok 4.6, Thinking; Agent

### Agent
- Meta: User-ordered notes-layout apply after SuperPlan `2026-09-15-buildnotes-newest-first.md`.
- Changed `buildNotes.md` layout: rules/summaries then `# Historical entries (newest first)`; insert under that heading; do not append at EOF.
- Changed MISTAKES from APPEND ONLY to INSERT ONLY at the historical heading.
- Added `AGENTS.md` Build notes section; retuned `UPSTREAM-SYNC.md` verification to insert newest-first.
- Kept archives and `buildNotes.txt` unchanged.

### User
Project notes
- New session notes now go at the top of the history section, right under the historical-entries heading.
- Agents can start reading the latest work at that same heading instead of scrolling to the end of the file.

---

## 2026-09-15 (~03:26) - archive and compact buildNotes.md - Cursor Grok 4.6, Thinking; Plan

### Agent
- Meta: User-ordered archive rotation (file-length compact); not a source/product change.
- Copied active `buildNotes.md` verbatim to `buildNotes.archive2.md` (SHA256 match `15BF8525...`); left `buildNotes.archive1.md` untouched.
- Wrote fresh `buildNotes.md` with human rules, archive-rotation contract, OC invariants, and cumulative Agent/User summaries covering archive1+archive2.
- Kept `buildNotes.txt` unchanged. No commit/push/build.

### User
Project notes
- Older session history now lives in `buildNotes.archive1.md` and `buildNotes.archive2.md`.
- The live notes file is short again and starts with the archive rules so the next overflow can rotate to `buildNotes.archive3.md`.
