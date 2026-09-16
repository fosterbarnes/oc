# RULES FOR AGENTS - WRITTEN BY HUMAN. NEVER MESS WITH THIS SECTION

1. You may not delete previous sections that are not yours
2. Insert new session notes immediately under `# Historical entries (newest first)`. Newest entries stay on top. Do not append at the end of this file.
3. You should date and time the notes
4. Reference previous notes and other relevant sections
5. Make sure mistakes and errors are EXTRA highlighted, so we never make the same mistake twice
6. NEVER, EVER, EVER, UNDER ANY CIRCUMSTANCES DELETE ANYTHING FROM THIS FILE

# AGENT NOTES BEGIN HERE - THIS IS WHERE YOU WRITE

File layout: rules and summaries above; historical session entries below, newest first. Agents add each new entry at the top of that historical section so the insert line and the start-reading line stay the same.

## Entry format (working example)

Copy this shape for every session that changes the repo. Agent workflow rules live in `AGENTS.md`.

```

---

## YYYY-MM-DD (~HH:MM) - short plain-English title - Model name, Thinking; Plan

### Agent
- Meta: one-line session context (model / effort / mode / tokens est)
- Verb-led bullets with file/type/method names, root cause as a clause, invariants

### User
Category label
- Plain-language what changed for someone using the app
```

## Archive Rotation

- The active `buildNotes.md` is the working history file.
- When the entire active file exceeds 1,000 lines, archive it before adding more session history. Count every line: human rules, summaries, entries, blank lines, and separators.
- Rename the complete file unchanged to the next available archive name: `buildNotes.archive1.md`, then `buildNotes.archive2.md`, then `buildNotes.archive3.md`, and so on.
- Find the highest existing archive number and use the next number. Do not reuse a missing number.
- Never delete, truncate, overwrite, or compact an archive. The archive must preserve the previous active file verbatim.
- Create a fresh `buildNotes.md` with the human rules, a cumulative summary, then `# Historical entries (newest first)` and session entries newest-first under that heading.
- The cumulative summary must cover all previous archives, not only the newest archive.
- Include both a compact `## Agent` summary and a normal plain-English `## User` summary.
- Do not impose a fixed maximum size on the cumulative summary. Keep it as compact as possible without losing information needed for future work.
- Read only the active `buildNotes.md` by default. Start reading historical entries at `# Historical entries (newest first)`. Read archived files when the active summary lacks required context.

### Cumulative Summary Shape

```md
# Cumulative Summary

## Agent
- Added `Thing::run`: shared path handling; removes duplicate logic
- Fixed null path crash: early return at boundary
- Kept `LegacyMode`: external callers depend on it

## User
- Startup now handles missing paths without crashing
- Shared path handling removes duplicate behavior
```

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
