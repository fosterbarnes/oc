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

See skill `base/build-notes-archive` for trigger (>1000 lines), verbatim rename to buildNotes.archiveN.md, and fresh-file shape.

## Agent Note Language

- Keep `### Agent` notes dense, factual, and written for the next agent.
- Use short, agent-forward vocabulary: `Added`, `Fixed`, `Removed`, `Moved`, `Changed`, `Kept`, `Blocked`, `TODO`, `Risk`, `Note`, `MISTAKE`, and `ERROR`.
- Omit articles and filler words when meaning stays clear: `Fixed null path crash; early return` is preferred over `Fixed the crash caused by a null path by returning early`.
- Keep one idea per bullet.
- Include file, type, method, cause, result, invariant, or risk only when useful for future work.
- Do not shorten away information needed to continue safely.
- Use `MISTAKE:` for an agent-caused mistake, process violation, or incorrect change. Make it explicit and explain the prevention rule.
- Use `ERROR:` for an observed product, build, runtime, or tooling failure that is not necessarily caused by the agent.
- Keep the `Meta` line compact: model, mode, phase, and status.
- Follow `Meta` with a `Version` line holding the project's current version (`none` when the project has no version file). The heading carries the same value: `## <date> - v<version> - <title> - <model>...`.
- Keep `### User` notes in normal plain English. Do not use grug shorthand in User notes.

Example compact Agent notes:

```md
### Agent
- Meta: GPT-5.6 Luna; build; completed
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
- Default branch is `main` (`dev` is the UPSTREAM checkout). Do not ship `opencode.exe` compiled with Bun 1.4.0 (`bun:ffi` TUI crash).
- Do not treat empty tool lists as compaction. Protect local `.scripts`, `.version`, `AGENTS.md`, `SCRIPTS.md`, `buildNotes.md`, `UPSTREAM-SYNC.md`, `CONTEXT.md`, TUI display-version, and custom declaration fixes during upstream apply.
- Installer may stop running `opencode` processes; do not kill them from other agent work. Live install often blocked while `C:\Users\user\Apps\opencode\opencode.exe` is in use.

# Cumulative Summary

## Agent
- Kept histories verbatim: archive1 (2026-08-20 through 09-09), archive2 (09-09 through 09-15), archive3 (09-15 through 09-28), archive4 (previous active file, 1144 lines), archive5 (1019 lines through v0.2.65). Earlier hashes and detailed cumulative summaries remain in archive4. Never edit archives.
- Added local PowerShell build/check/run/install/push/update/sync scripts; isolated upstream checkout; fail-closed content-level three-way apply; build/install split; installer stops managed processes before building and recreates hard links.
- Changed `.version/version` to one X.Y.Z line, final component revision; maintenance display separate from package version. Archive4 r19 records migration; old push second-line reset corrected in current scripts.
- Added session bootstrap, global session listing, complete/failed/in-progress flags, persisted model overrides; lazy CLI startup; command-palette ordering; model hiding; slash commands anywhere; friendly agent names and Tab order.
- Added native OC configuration, resident server lifecycle/shutdown/restart and auto-start; reconnect waits for disposal/replacement without replay; stale launcher records no longer trigger unnecessary waits.
- Added isolated ocdebug port 4097; first-run production config/assets seeding and import; bare oc and relative targets use separately configurable directories; project picker opens TUI palette.
- Added built-in browser providers through Agentify/Edge; native Cursor provider and proxy; lazy packaging beside executable; tool cancellation, SSRF/symlink/git credential protections; context tiers and pricing; compaction and empty-tool handling; disabled native Cursor plan mode.
- Removed browser UI/Electron packages, process-tree helper, and Poe integration. Windows child processes use normal spawn plus hidden process-tree termination; avoid Bun 1.4.0 Windows TUI FFI runtime.
- Added instructionsByModel with model-glob files/base prompts; custom agents under plural agents directory; model CLI precedence and per-session overrides; disabled stock plan agent using disable key.
- Kept SuperPlan read-only capability contract and exact absolute planPath through execution; phased Go execution, plan_next_phase and plan_closeout; optional coordinator/subagents. Archived Go-a/SuperPlan-a profiles. Explicit return types prevent prompt/registry/plan-execute circular inference.
- Added sidebar scripts/configuration, weekly usage provider selection and Claude OAuth usage; Everything auto-start/reconnect; image clipboard file-drop/temp PNG handling; WezTerm GUI executable mapped to sibling CLI executable.
- Fixed question cancellation/publish race, dialog key ownership, pending question/permission reload on reconnect; server exit still rejects pending questions.
- Added DB unknown-migration refusal after stock OpenCode 2.0.6 changed shared database; restore backup and isolate stock build data. Local sqlite3 3.22 cannot DROP COLUMN.
- Kept upstream ports for Gemini thinking defaults, Bedrock tool-result images, GPT-6 Codex allowlist and debug credential redaction; working Luna route openai/gpt-6-luna; Poe GPT-5.6 routes failed.
- Fixed resident Windows console flashes via hidden Start-Process spawn escaping libuv job lifetime. Keep pwsh hop until native FFI path is verified; dropping detached alone kills resident with launcher.
- Added native run_after_turn and immediate revive controls. Revive paths now `.ps1` in `revive.path`/`installPath`; launchDetached gives scripts visible consoles. Generic tool default allow; user permissions ask except approved revive scripts. Claude Code proxy currently lacks tool exposure, deferred.
- Changed revive: build before downtime, shutdown-all closes WezTerm first, stopServer asks for graceful shutdown then force-kills if needed; resident startup overlaps relaunch, previous-session lookup runs in parallel. Revive closes ALL WezTerm windows, oc-only closing deferred. Console centering uses saved HKCU settings.
- Kept SessionWork admission/cancellation gate and detached 30s shutdown timeout; removed timing probes. Removed old safeShutdown and compiled revive wrappers; empty BUN_INSTALL cleanup prevents install hangs. Never run installers from agents.
- Fixed intro resize: raw-mode stdin reads let Bun refresh cached console dimensions; intro polls each tick and restores input on stop. Live standalone check passed, installed TUI handoff unverified.
- Added command/skill hot reload using fingerprints, serialized rebuild, per-file parse cache, last-good fallback/toasts; slash menu retains data on failed refresh. Config path/URL changes still need restart; new skill-folder permissions may need restart. Keep Command -> Skill lock order one-way.
- Changed slash labels to :(oc), :(command), :(mcp), :(skill); colors purple/yellow/teal/peach. Labels only affect display. Commands win skill name collisions.
- Added session status filter, local Pinned filter and diamond gutters, stacked/wrapping footer shortcuts. Cycle All/Unmarked/In Progress/Pinned/Complete/Failed; actions rename/delete/pin/complete/failed/in-progress. Fixed Ctrl+D delete registration loop by reading static keybind hints.
- Fixed rename: configured model -> free MiMo Flash -> Luna medium; preserve cancellation, save only successful cleaned title, fail if every candidate fails. Fixed duplicate CLI JSON errors and Cursor base models accidentally selecting max billing; long-context entries labeled (Max).
- Fixed local build runtime/provider version to incorporated upstream pkg.version; maintenance version remains separate. Release builds keep Script.version.
- Removed stale custom docs; script GitHub target now fosterbarnes/oc; README.md defines fork and README.OG.md native state. Removed unsupported debug-paint issue claims. Historical authorized removals documented in archive5.
- Removed V2 execution engine in v0.2.65: SessionExecution, runner, coordinator, Context Epochs, execution endpoints, sdk-next, associated tests, CLI V2 shell-merge machinery. Legacy owns all execution; retained SessionV2 reads/create/model-agent switching, shared bus/projector/work/store/location services and TUI /api routes.
- Kept session.next schemas/projector handlers/input and V2 tables for historical import/sync replay; EventV2.replay fails on unknown durable types. Keep shipped cancellation migration/unused cancelled_seq. Revisit execution migration only if upstream deprecates legacy.
- Verification baseline v0.2.63: all 13 known failures fixed; tui/schema full suites clean; core/opencode fixes checked by file. Full suites need explicit user yes (opencode ~19m, core ~2m, smaller packages <30s); scoped checks/typecheck allowed, stop after two failed fix attempts.
- Verification v0.2.65: six package typechecks clean, 234 scoped tests pass; route coverage 202 pass/0 fail/0 extra, 5 fork routes missing coverage predating removal. User reports reinstall complete; lockfile drops sdk-next.
- MISTAKE: PowerShell HOME read-only; use testHome. Never reconstruct plan paths. Parallel proxy edits can reject despite applying. Bare bun test uses 5s; always --timeout 30000. Avoid whole-file prettier changes. Git Bash /tmp and URL pathname paths fail with Windows Bun.
- MISTAKE: deleting applied migrations breaks guard; inspect shipped DB state first. Fiber.join in interrupt cleanup can hang; await Exit before propagation. V2-named routes are live; grep TUI client.v2 calls before cutting.
- MISTAKE (r20): agent called force-kill safe cancellation and edited during read-only discussion. Cancellation must be explicit. Revive/safe-shutdown plugin-era work superseded by native tools.

## User
- Local scripts build, check, run, install and sync this fork against a separate upstream checkout. Agents do not run live installers.
- Session controls persist model choices and status marks; the picker supports status/pinned filters and compact wrapping action footers.
- Production and debug have separate resident servers and settings. Shutdown cancels active work; startup/reconnect do not replay prompts.
- Browser providers and Cursor use packaged helpers. Bigger-context Cursor models are marked Max, and ordinary models retain ordinary billing.
- Command and skill edits reload without restarting, and invalid edits retain the last working version. Slash entries show their source and distinct colors.
- Plans support phase-by-phase sessions and optional coordinating agents; completed plans archive through a tool. Rename uses fallback models without overwriting a title on failure.
- Revive runs PowerShell scripts directly, builds before closing the app, and starts the server alongside relaunch. It currently closes every WezTerm window.
- Startup animation follows window resizes. Live installed handoff remains a user check.
- Sidebar scripts, provider usage, Everything Search and clipboard integration are native. Questions recover after reconnecting.
- The database refuses incompatible migrations; applied migrations and historical event contracts remain available.
- Legacy sessions remain the only execution runtime. The unused V2 engine is removed, while shared infrastructure and the TUI's read/model-switch APIs stay.

# Historical entries (newest first)

---

## 2026-10-03 (~15:28) - v0.2.79 - Tab title: plain ■ agent marker, no "OC |" prefix - Claude Opus 5.5, low effort; Agent

### Agent
- Meta: Claude Opus 5.5; low effort; Agent; completed
- Version: 0.2.79 (uncommitted with the CI parity fixes)
- Changed `packages/tui/src/app.tsx` title effect: prefix is a plain `■ ` (U+25A0 text glyph) instead of the nearest emoji square; removed the `OC | ` prefix from session and plugin titles. WezTerm still gets `oc_agent_color` and colors the square.
- Removed `packages/tui/src/util/terminalTab.ts` (`nearestAgentSquare`) and its test; moved the renderer escape test into the existing `packages/tui/test/util/renderer.test.ts` (3 tests).
- MISTAKE: the overnight "typecheck 27/27" ran before the httpapi scenarios and the launchDetached change, so the user's pre-push hook caught 2 tsc errors (`Effect.addFinalizer` Scope requirement in the PUT /debug-logging scenario; `revive.test.ts` env union after `detached: false`). Fixed: exerciser sets `OPENCODE_DEBUG_LOGGING_PATH` once in `environment.ts`, scenario has no finalizer; test reads env through a `Record<string, string | undefined>`. Re-ran full typecheck 27/27, revive 12/12, httpapi coverage 207/0 missing. Prevention: re-run typecheck after the last edit, before reporting.
- MISTAKE: first wrote `renderer.test.ts` with the Write tool without checking it existed, dropping its 2 existing tests; caught at session close and restored. Prevention: check `git ls-files` / Read before Write on any test path.
- Updated `v0.3.0.md` with a "Current state" section: what is pushed vs uncommitted, CI billing block, ordered next steps, live-check table, known limitations, known CI failures.
- Updated wezFig `wezterm.lua` `format-tab-title`: strips the leading `■ `, redraws it in `oc_agent_color`; removed its now-unneeded `oc | ` strip. wezFig build notes appended.
- Updated `v0.3.0.md` item 5 (table, implementation, snippet) and README row.
- Verification: `bun test test/util/renderer.test.ts` 1/1; tui `tsc --noEmit` clean. WezTerm config not reloaded or live-checked.

### User
Terminal tab
- The tab title now starts with a plain ■ (colored per agent in WezTerm) and no longer has the "OC |" prefix.

---

## 2026-10-03 (~06:54) - v0.2.79 - CI check: billing blocked runs; local CI parity fixes (launchDetached hop, generated SDK, httpapi scenarios, Windows test paths) - Claude Opus 5.5, low effort; Agent

### Agent
- Meta: Claude Opus 5.5; low effort; Agent; user asleep, full suites authorized; completed
- Version: 0.2.79
- ERROR (not code): every v0.2.78 GitHub job was "not started because recent account payments have failed or your spending limit needs to be increased". No cloud results exist for v0.2.78. User must fix Billing & plans, then re-run.
- Ran CI equivalents locally (Windows): `bun run typecheck --continue=always` 27/27; generate (client `check:generated`, sdk build + openapi); all `test.yml` unit packages; providers; `test:httpapi`. Baseline = v0.2.76 cloud run (logs saved in session scratch).
- Fixed launchDetached (`core/src/util/launch-detached.ts`): Windows pwsh hop was spawned `detached: true`; a DETACHED_PROCESS pwsh has no console and its Start-Process silently runs nothing. Hop now `detached: false` (same as `spawnResident`). This broke `run_after_turn` (test "queued exe never ran") and would have broken built-in `/revive-no-install` (11c). Verified argv round-trip incl. quotes, spaces, trailing backslash.
- Fixed generated drift (pre-existing, baseline failed too): regenerated `packages/sdk/js/src/v2/gen/types.gen.ts` (`session_in_progress`, `session_reopen` permissions) and `packages/sdk/openapi.json` (`/debug-logging` etc.).
- Fixed httpapi coverage (pre-existing): added exerciser scenarios for GET/PUT `/debug-logging` (isolated state path), POST `/question/ask` (invalid body 400), POST `/session/{id}/rename`, POST `/tui/execute-targeted-command`. Coverage and auth: 207 pass, 0 missing.
- Fixed tests for item 9 default `["Task", "run_after_turn"]`: `proxy-task.test.ts` (2), `startup-diagnostics.test.ts` (1).
- Fixed Windows-only test assumptions (pre-existing): `httpapi-codegen` write tests use `join()` for expected paths; fixture test uses `import.meta.dir` and normalizes CRLF. Guarded Windows-only tui tests on other platforms: `editor.test.ts` drive-path resolve, `open-sidebar.test.ts` clip.exe.
- Verification: all unit packages pass locally on Windows: core 963, tui 366, opencode 4459 pass + 5 new failures (fixed; those files re-run 89 pass / 2 skip), httpapi-codegen 66/66, all others green; typecheck 27/27. httpapi effect mode: 205 pass, 2 fail (`POST /pty`, `/api/pty` 500) Windows-local only; no pty code touched this session; CI runs httpapi on Ubuntu where it passed in baseline.
- Known CI failures not fixed (need a Linux run, no WSL distro here): tui ubuntu Cursor `state.vscdb` tests (2), core ubuntu pty stale/duplicate replay (2), opencode ubuntu/windows baseline fails (17/14, e.g. LSP interop timeouts, describeSpawnCwd, opencode run json). None of the 14 baseline Windows opencode failures reproduced locally.
- Risk: running tests/exerciser from `packages/opencode` writes an untracked `packages/opencode/config.json` (`{}` or `$schema` only). Deleted both times; source not found yet. TODO: find the test writing to cwd.

### User
CI
- The v0.2.78 GitHub Actions never ran: GitHub blocked them for a failed payment or spending limit. Fix Billing & plans, then re-run the workflows.
- Locally, typecheck, generated-file checks, and the unit suites now pass on Windows; the remaining known failures are Linux-only or Windows pty in the HTTP exerciser.

Revive and run after turn
- Fixed a bug where programs started "detached" on Windows (run_after_turn targets and the new built-in revive helper) silently never launched.

---

## 2026-10-03 (~06:10) - v0.2.78 - pwsh 7 is a required dependency; revert Windows PowerShell fallbacks - Claude Opus 5.5, low effort; Agent

### Agent
- Meta: Claude Opus 5.5; low effort; Agent; completed
- Version: 0.2.78
- Decision (user): PowerShell 7 (`pwsh`) is a required project dependency. Do not add Windows PowerShell 5.1 fallbacks. Recorded in `v0.3.0.md` audience rules.
- Reverted to `pwsh`: `config/oc.ts` `spawnResident` hop and `ocProcesses` CIM listing; `core/src/util/launch-detached.ts` Start-Process hop and `.ps1` start; sidebar `helpers.ts` defaults and `script-runner.ts` wt path (removed `POWERSHELL_EXECUTABLE`); tests updated. Supersedes the "MISTAKE" note in the previous entry.
- ERROR (not oc): user saw "'claude' is not recognized" on a Claude Code turn at 6:07 AM. Cause: Claude Code's npm auto-update rewrote `%APPDATA%\npm\claude*` at 6:07:42-46, the same minute. `claude --version` (2.1.288) resolves afterwards; retry the turn.
- Verification: opencode config/ledger/revive 34/34; tui open-sidebar 71 pass + 2 existing skips; `tsc --noEmit` clean in tui, opencode, core.

### User
Dependencies
- oc uses PowerShell 7 (`pwsh`) on Windows again everywhere; it is now an explicit requirement.

Claude Code
- The "claude is not recognized" error was Claude Code updating itself at that moment; retrying the turn works.

---

## 2026-10-03 (~06:03) - v0.2.78 - v0.3.0 waves 2-5: sidebar state, usage freshness, sub-agents, tab identifier, restored questions, scoped revive, Windows out of the box - Claude Opus 5.5, low effort; Agent (orchestrator)

### Agent
- Meta: Claude Opus 5.5; low effort; Agent orchestrating headless `oc run` workers (Sol 6.1 low/medium, free Muse, Composer, Grok 4.6 low); user away, ran without approvals per user; completed
- Version: 0.2.78
- Item 2: `sidebar-tools.tsx` model/reasoning rows read `local.model.current()` / `local.model.variant.current()`; removed `MODEL_STATE_PATH`, model.json readers, 500 ms poll, fs.watch, 50 ms reread. Reasoning row shows `default` when the model has variants; `onMouseUp` like the other rows.
- Item 3: `usage.ts` `usageProviderForModel` (`claude-code-<account>` -> claude-code), `shouldRefreshUsageProvider` (45 s), `updateUsageSnapshot` (keep last good, mark stale); Claude probe returns `source: "cache"` + file mtime. `sidebar-tools.tsx` per-provider `refreshUsage(providers)`, refresh on assistant `message.updated` completion and on session select (>60 s), dims stale/cached rows. No TUI tooltip pattern, so no hover age.
- Item 4: `feature-plugins/sidebar/subagents.tsx` (order 350): running + recently finished children (2 min or next root turn); aborts are not "failed". Plugin API `TuiState.session.children` / `agentLabel` (+ `adapters.tsx`, test fixture).
- Item 5: `util/terminalTab.ts` `nearestAgentSquare`; app.tsx title effect prefixes the square, OSC 9;4 progress (error only if the last assistant turn failed, not aborts or the sticky failed mark), WezTerm `SetUserVar=oc_agent_color`; `util/renderer.ts` `writeTerminalEscape` via OpenTUI `writeOut`, clears on destroy; kv toggle `terminal_tab_agent_enabled`. WezTerm Lua snippet lives in `v0.3.0.md` item 5.
- Item 6: `context/sync.tsx` `refreshPrompts` per session directory on session open/reconnect with revision guards; `restoredQuestion` rebuilds only when session idle, lists fetched cleanly, error is exactly "The user dismissed this question" or part `running`; dismissal keyed by messageID+callID; parent shows only its own restored question. `question.tsx` restored answers go out as `promptAsync` follow-up with `questionAnswerText` (copy of `tool/question.ts:30-36` format; keep in sync); live reply/reject awaited with toasts. Claude Code proxy: no deadline for `question`.
- Item 8: `config/tuiLedger.ts` per-PID records in `<state>/oc-tuis`, written by `Tui.run` (non-fatal) and removed on exit; `shutdownAll` / `stopServer` scope to this instance (resolved executable identity across oc/occ/opencode hard links, one CIM listing via `powershell.exe`, 5 s start tolerance), `wezterm cli kill-pane` for panes; removed both `taskkill /IM wezterm-gui.exe`; production leaves ocdebug alone.
- Item 11b: `script-runner.ts` `windowsTerminalArgs` / `windowsTerminalScriptArgs` (wt.exe tab/window/split, probe, native fallback); `helpers.ts` `scriptTerminals` / `resolveScriptTerminal`; neutral picker labels.
- Item 11c: `config/revive.ts` + `oc --revive <context>`; `/revive-no-install` always available (revive.path still overrides): helper shuts down this instance, starts server, reopens in the same terminal kind via `launchDetached` (Start-Process, Normal window); wt `-w new`; Home revive returns Home; falls back to a console when wt/wezterm is not on PATH (checked before shutdown). `spawnResident` uses `powershell.exe`.
- Item 11d: agentify Edge/Chrome path detection from env vars; Everything hint once per process as info; `POWERSHELL_EXECUTABLE` (pwsh else powershell) for script defaults, wt path, and `.ps1` launches in `launch-detached.ts`.
- README: 4 rows added, 7 updated, counts 16 done / 25 high / 21 medium (62).
- Verification: core terminal 5/5; opencode config/ledger/revive/claude-code proxy/agentify 147/147; tui editor/open-sidebar/usage-freshness/subagents/terminalTab/sync-questions/question-restored 114 pass + 2 existing Windows skips; `tsc --noEmit` clean in tui, opencode, core, plugin. Grok reviews per item + final cross-item review; findings fixed or recorded. Not built or installed; all live checks pending.
- Risk: first revive after upgrade may leave pre-ledger TUIs open; force-killed TUI cannot clear its tab progress ring; process-listing failure leaves TUIs open (server still stops); a question answered in a second TUI can show restored here until reload; plugins and sub-agent rows do not see restored questions.
- MISTAKE: Sol workers wrote `pwsh` into shipped paths (process lister, launcher) despite the Windows-out-of-the-box goal. Prevention: worker prompts must state "stock Windows has only `powershell.exe`".

### User
Sidebar
- The model and reasoning rows now always match the session you are looking at, and clicking reasoning updates it right away.
- Usage numbers refresh shortly after you use a provider and when you switch sessions; old or cached numbers are dimmed instead of looking current.
- A new Sub-agents section shows running and just-finished sub-agents; click one to open it.

Terminal tab
- The tab title starts with a colored square for the current agent, and Windows Terminal (and WezTerm) show a progress ring while the agent works; turn it off with "Disable tab agent square and status".

Questions
- If you close oc while an agent is asking a question, reopening the session shows the question again; answering continues the agent.

Revive and shutdown
- `/revive-no-install` works without any setup and reopens oc in the same kind of terminal; revive and `--shutdown-all` now close only this oc's windows and leave ocdebug and your other terminals alone.

Windows out of the box
- Script launch offers tab, window, and split placements in Windows Terminal too; other terminals launch scripts normally.
- oc no longer needs PowerShell 7 or WezTerm, finds Edge or Chrome for ChatGPT/Claude Web, and shows the Everything search hint only once.

---

## 2026-10-03 (~05:03) - v0.2.77 - v0.3.0 plan, Wave 0 scouting, Wave 1 (terminal helper, run_after_turn proxy, intro background, per-type editor) - Claude Opus 5.5, low effort; Agent (orchestrator)

### Agent
- Meta: Claude Opus 5.5; low effort; Agent orchestrating headless `oc run` workers (Sol 6.1 low, free Muse, Composer, Grok 4.6 low); completed
- Version: 0.2.77
- Added `v0.3.0.md` (repo root): milestone plan, 11 items with status/feature/implementation/refs, Windows-out-of-the-box capability-tier rule, orchestration section (worker flags, roster, patterns, waves, wave log). Work toward 0.3.0 ships as 0.2.x revisions.
- Wave 0 (read-only): Composer + free Muse re-verified plan refs; Grok confirmed item 2/3 causes (reasoning row reads global `model.json`; only Claude usage silently serves cache), traced item 6 (likely `occ` attaches with home `--dir` so `question.list` hits the wrong instance; startup-only fetch), traced item 8 (WezTerm killed twice: `app.tsx:359` + `config/oc.ts:420`; `shutdownAll` also stops ocdebug and any `opencode.exe`).
- Added `packages/core/src/util/terminal.ts` `detectTerminal(env)` -> `{ kind: wezterm | windows-terminal | generic, paneID? }` + `test/util/terminal.test.ts` (item 11a). Not wired yet; items 5, 8, 11b consume it.
- Added `run_after_turn` Claude Code proxy tool: `proxy-tool-defs.ts` def (exe, args), `proxy-tool-selection.ts` map, `types.ts` `DEFAULT_PROXY_TOOL_NAMES`, read-only preset denies it; tests extended (item 9). An explicit `proxyTools` override must list it.
- Added oc.json `intro.background` (`terminal` default | `black`): `startIntro(mode)` uses `\x1b[49m` unless black; `cli/cmd/oc.ts` reads settings before the intro (item 10).
- Changed `openEditedWith` to string or `{ ".ext": editor, default }` map: `resolveEditorForFile(filePath, setting, env)` in `tui/src/editor.ts`; plugin `TuiConfigView` type updated (item 7).
- Fixed worker output: item 7 tests mutated `process.env`; resolver now takes `env`. Removed redundant `?? "terminal"` at intro call sites.
- Worker tooling (scratch only): `worker.ps1` + `summarize.ps1`. `oc run -f` is an array flag; put the message positional before `-f` or it is read as a file.
- Verification: `bun test` terminal 5/5 (core), editor 8/8 (tui), config/oc 13/13 + claude-code proxy-mcp/permission-presets/subagent-hint 110/110 (opencode); `tsc --noEmit` clean in tui, opencode, core, plugin. Grok full-diff review: no bugs. Not built or installed; live checks pending.
- ERROR: Python heredoc wrote `\r` into `v0.3.0.md` (`.scripts\revive.ps1` became CR). Fixed. Do not write backslash paths through Python string literals; use the Edit tool.
- TODO: user's `~/.config/opencode/opencode.jsonc` `proxyTools: ["Task", "Question"]` hides `run_after_turn`; needs the user's OK to add it.

### User
Planning
- Added `v0.3.0.md`, the roadmap for v0.3.0 with every item's status, design, and code references.

Editor
- `openEditedWith` in tui.json can now be a map, for example `{ "default": "code", ".md": "typora" }`, to open each file type in its own editor.

Startup
- The startup animation now draws over your normal terminal background; set `"intro": { "background": "black" }` in oc.json for the old black look.

Claude Code
- Claude Code sessions can now use `run_after_turn`, so `/agent-revive` can work there once `run_after_turn` is listed in your `proxyTools` setting.

Under the hood
- Added a shared terminal detector (WezTerm, Windows Terminal, other) for upcoming tab and revive work; no UI change yet.

---

## 2026-10-03 (~04:14) - v0.2.76 - Avoid reusing the previous push message - GPT-6 Luna; default; Agent

### Agent
- Meta: GPT-6 Luna; default; Agent; completed
- Version: 0.2.76
- Fixed `.scripts/push.ps1`: supplied message wins; use `buildNotes.txt` only when changed since HEAD or untracked, preventing reuse of the prior commit message.
- Updated `AGENTS.md` and `SCRIPTS.md` to document message precedence and changed-file behavior.
- Verification: not run; no script checks edited or introduced in this session.

### User
Scripts
- Push messages now come from a newly changed `buildNotes.txt` only when no message is supplied, so the previous push's message is not reused.

---

## 2026-10-03 (~04:08) - v0.2.76 - push.ps1 reads buildNotes.txt; agent-push skill - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.76 (same session as entries below; no second bump)
- Changed `.scripts/push.ps1` to base `SCRIPTS.md` convention: commit subject/body from repo-root `buildNotes.txt` (line 1, blank line, body), positional or prompted subject as fallback, `-DryRun`/`-n` prints commands only. Kept oc specifics: `UPSTREAM` excluded from `git add`, `closeOut 3`, no browser open (oc helper has no `openUrl`).
- Added `$buildNotes` to `.scripts/scriptHelper.ps1`.
- Changed `AGENTS.md`: replaced "Do not edit buildNotes.txt" with a `buildNotes.txt` section; agents write it when preparing a push (`agent-push`), commit-message format defined there. `SCRIPTS.md` push rows updated.
- Note: older buildNotes.md lines (MISTAKES list, project invariants) still say agents never edit `buildNotes.txt`; insert-only file, so not edited. `AGENTS.md` now governs.
- Added user-level: `~/.claude/skills/agent-push/SKILL.md` (message to buildNotes.txt, focused checks, prePush, push -DryRun, push); `principles.md` push and buildNotes.txt rules now name the `agent-push` exception.
- Verification: `push.ps1 -DryRun` with no file (fallback subject), with a valid `buildNotes.txt` (subject + body), and with a non-blank line 2 (throws). Temporary `buildNotes.txt` removed. First real push via `agent-push`: `97f3b63`.
- Fixed (pass after that push): committed `buildNotes.txt` kept the pushed message, and base order let the file beat a passed message, so a later manual `push.ps1 "msg"` would reuse it. Now a passed message wins, and the file is used only when `git diff HEAD` shows it changed (or it is untracked); otherwise prompt. Dry-run checked: unchanged file (throws, no prompt in dry run), passed message, edited file.

### User
Scripts
- push.ps1 now takes the commit message from buildNotes.txt (first line is the title, then a blank line, then the description), like the base template, and has a -DryRun option.
- The new agent-push skill writes that message, runs quick checks and prePush, then pushes.

---

## 2026-10-03 (~03:52) - v0.2.76 - Live Claude Code probing: unmapped tools, background wake-ups - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.76 (same session as entries below; no second bump)
- Method: temporary `OC_CC_PROBE` tap in `spawnClaudeProcess` (args, env names, system prompt, stdin, stdout, stderr per spawn), oc run from source (`bun run src/index.ts run|serve`) with isolated `XDG_DATA_HOME`, 8 Sonnet 5.5 prompts. Probe removed after.
- Fixed `turn-stream.ts` tool-call emit: `dynamic: mapped.executed`. AI SDK 6 `doParseToolCall` keeps a `providerExecuted && dynamic` call with no registry entry under its own name; before, `experimental_repairToolCall` in `session/llm.ts` turned every unmapped CLI tool (Monitor, WebFetch, ScheduleWakeup, Cron*, Skill...) into an `invalid` row. Kept PowerShell's explicit `bash` mapping from the entry below: it still routes PowerShell to oc's shell renderer instead of a generic row.
- Added autonomous-turn wake: when the CLI emits `system/init` with no oc turn listening (background task finished after the turn ended; Claude wakes itself), `requestWakeTurn` (`session-manager.ts`) posts `prompt_async` with a synthetic `WAKE_PROMPT_TEXT` part using the last turn's `wakeTarget` (session, directory, provider, oc model, agent, variant). The turn carrying the marker skips the in-flight interrupt and stdin write, and feeds buffered lines from that `init` on through `onLine` so tool calls and text render live. A normal turn clears `autonomousTurn` and interrupts as before; a stale wake short-circuits in `claude-code-language-model.ts` (`stale-wake`).
- Added `modelId`/`variant` to `resolveTurnContext` for the wake prompt.
- Added `test/provider/claude-code/autonomous-turn.test.ts`: fake CLI wakes after turn 1; asserts wake post body and that turn 2 streams "Woke." without any stdin write.
- Live results: wake turn opened 150ms after CLI init, showed Read + reply; marker never reached CLI stdin (1 stdin write total). Interrupt mid-`ping` aborted cleanly, follow-up turn healthy. Server restart: respawn used `--resume`, Claude remembered prior turn.
- Note: Claude Code refuses a standalone foreground `Start-Sleep N`; use `ping -n N 127.0.0.1` for long-running probes.
- MISTAKE: `XDG_DATA_HOME` alone did not isolate the source runs: the user env sets absolute `OPENCODE_DB` (`~\.local\share\opencode\opencode.db`), which `Database.path()` (`core/src/database/database.ts`) prefers. 4 harness test sessions (dir `...scratchpad/proj`) landed in the real DB. No schema change, so no migration risk. For isolated runs set `OPENCODE_DB` too.
- Live TUI check by user (sessions base17-19, installed build): PowerShell + Bash rows normal; WebFetch/Monitor rows normal; background follow-up woke on its own with synthetic marker hidden.
- MISTAKE: one `turn-stream.ts` import edit done via Python through Bash right after adding the Edit/Write rule to principles.md. Use the Edit tool for project files.
- Risk: `bufferUnattendedLine` cap (500 lines) could drop an autonomous turn's `init` if the wake turn is slow; then the attach turn waits on live lines only.
- Verification: `bun test test/provider/claude-code` 532 tests, 0 fail, 9 skip; `tsc --noEmit` clean for `provider/claude-code`. Not checked in the TUI (needs user build/install).

### User
Claude Code provider
- Claude Code tools oc has no name for (Monitor, WebFetch, ScheduleWakeup and others) now show as normal tool rows instead of red "invalid" rows.
- When Claude starts a background command and it finishes after Claude's turn ended, Claude's follow-up now appears right away, like in a normal Claude Code terminal, instead of showing up under your next message.

---

## 2026-10-03 (~03:30) - v0.2.76 - Claude Code no longer runs in essential-traffic mode - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.76 (same session as PowerShell display entry below; no second bump)
- Removed `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` from `CLI_HYGIENE_ENV_VARS` (`provider/claude-code/cli-version.ts`); list is now `DISABLE_AUTOUPDATER` only, which already pins the CLI version.
- Cause: measured `claude` stream-json init (2.1.285) in a clean env (desktop `CLAUDE*` vars unset) with vs without the var. With it the CLI loses `Monitor`, `PushNotification`, `DesignSync`, claude.ai MCP connectors (Claude Docs), skills design/design-sync, slash advisor/ultrareview/skill-doctor/import/design*, and sets `analytics_disabled`/`product_feedback_disabled`. Binary also skips the `[Bootstrap]` fetch (`additional_model_options`).
- Note: user env/profile/settings do not set the var, so oc was the only source.
- Note: scratchpad dir, `Artifact*`, `SendUserFile`, `ListSkills`/`SearchPlugins` etc. are host-gated by `CLAUDE_CODE_ENTRYPOINT` (`claude-desktop`, `claude-vscode`), absent for `cli`/`sdk-*`, so plain terminal `claude` lacks them too. Not spoofing the entrypoint. `strictMcpConfig: true` in opencode.jsonc still blocks claude.ai connectors.
- MISTAKE: first probe ran inside the desktop app and inherited its `CLAUDE_CODE_ENTRYPOINT=claude-desktop`, so it wrongly credited the traffic var with scratchpad/Artifact loss. Probe CLI behavior with host `CLAUDE*` vars unset.
- Note: `disallowedToolFlags` maps proxied `task` to `Agent`, `Task`, `TaskOutput`; oc agents use oc's bgRun/bgStatus instead. Background bash via `run_in_background` is rare in oc (5 calls / 173 sessions). Not changed.
- Updated `test/provider/claude-code/spawn-env.test.ts` hygiene tests to the one-var list and assert the traffic var stays unset.
- Verification: `bun test test/provider/claude-code/spawn-env.test.ts` 10 pass. Full oc spawn not checked (needs user build/install).

### User
Claude Code provider
- Claude inside oc now gets the same tools as Claude Code run in a terminal, including Monitor for watching background work and push notifications.
- oc still stops the Claude CLI from updating itself mid-session.

---

## 2026-10-03 (~03:20) - v0.2.76 - PowerShell calls display as bash; read-only blocks PowerShell - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.76
- Follows v0.2.75 (`CLAUDE_CODE_USE_POWERSHELL_TOOL`). Live check sessions ses_eff5f93afffeJyYvosWd1cL0Dy / ses_eff5f69a7ffeJUk1WAxKHSnoCV: CLI had PowerShell, ran pwsh 7.6.6, Write kept literal `\x1b`. But oc rendered every PowerShell call as `invalid` ("Model tried to call unavailable tool 'PowerShell'"), output still present.
- Fixed `mapTool` (`provider/claude-code/tool-mapping.ts`): `PowerShell` -> oc `bash` row, provider-executed; `mapToolInput` shares Bash case.
- Fixed `READ_ONLY_DISALLOWED_CLI_TOOLS` (`permission-presets.ts`): added `PowerShell`. Risk closed: read-only preset on CLI without `--restricted` would have left PowerShell able to mutate.
- Checked: no other src code in `provider/claude-code` keys on "Bash" (`proxy-tool-selection.ts` already pairs Bash+PowerShell).
- Verification: `bun test test/provider/claude-code/tool-mapping.test.ts test/provider/claude-code/permission-presets.test.ts` 32 pass (new PowerShell mapping test; read-only test now lists PowerShell). Live oc display not rechecked (needs user build/install).

### User
Claude Code provider
- PowerShell commands Claude runs inside oc now show as normal shell rows instead of red "invalid" tool rows.
- The read-only permission preset now blocks PowerShell as well as Bash.

---

## 2026-10-03 (~03:12) - v0.2.75 - Claude Code gets the PowerShell tool on Windows - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.75
- Added `claudeSpawnEnv` (`provider/claude-code/spawn-env.ts`): `CLAUDE_CODE_USE_POWERSHELL_TOOL ??= "1"` on win32. CLI 2.1.285 gates PowerShell behind this preview var; desktop app enables it. Without it oc spawns had `Shell: bash` only.
- Cause: oc Claude did 53% of file edits via shell (heredoc/sed/python) vs 28% in desktop (all `~/.claude/projects` transcripts). Git Bash quoting layers turned `\x1b` into raw ESC in wezterm.lua (session ses_eff6f6454ffeGE1S03pCXIjC4V); Edit then could not match the byte.
- Added principles.md (`~/.config/opencode`) Work rule: edit project files with Edit/Write, not shell writes. CLAUDE.md loads it in both harnesses, so no oc appended-prompt change.
- Note: `NATIVE_TOOLS_BY_HOST_TOOL.bash` already maps to Bash+PowerShell, so oc agent bash denial still disables PowerShell.
- Note: checked other recurring oc tool errors: proxy edit rejections/"Could not find oldString" (proxy edit no longer default; `DEFAULT_PROXY_TOOL_NAMES = ["Task"]`) and "Unknown skill: build-notes" (all recent Skill calls succeed). Both historical; no change.
- Verification: `bun test test/provider/claude-code/spawn-env.test.ts` 11 pass (new PowerShell test included). First run showed one unnamed beforeEach/afterEach hook timeout that did not reproduce. Live CLI check (`claude -p` stream-json init, haiku): var=1 lists Bash+PowerShell, var=0 Bash only. Full oc spawn not checked (needs user build/install).

### User
Claude Code provider
- On Windows, Claude inside oc now gets the PowerShell tool like the Claude desktop app, so it no longer has to edit files through Git Bash quoting.
- Set `CLAUDE_CODE_USE_POWERSHELL_TOOL=0` in your shell to turn it off.
- Your global principles now tell agents to use Edit/Write for project files instead of shell writes.

---

## 2026-10-03 (~03:04) - v0.2.74 - Home launch bound to Ctrl+Enter - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed, live TUI unverified
- Version: 0.2.74
- Changed `prompt_submit_background` default `f7` -> `ctrl+return` in `packages/tui/src/config/keybind.ts`. User decision: F7 removed entirely, Ctrl+Enter is the bind.
- Removed `prompt.submit.background` from the untargeted `prompt.palette` gather in `prompt/index.tsx`; added a Home-only `useBindings` layer targeted at the prompt textarea so Ctrl+Enter beats managed-textarea `input.newline` (which still lists `ctrl+return` for sessions).
- Rewrote `packages/tui/test/cli/tui/prompt-background.test.tsx`: focused textarea + real `registerOpencodeKeymap`; Ctrl+Enter runs command on Home without inserting text, inserts newline when disabled (session).
- Added WezTerm key in `wezFig/wezterm.lua` (outside repo): CTRL+Enter -> `SendString '\x1b[13;5u'` (CSI-u), same pattern as existing Ctrl+M entry, so modifier survives Win10 ConPTY.
- Verification: `bun test ./test/cli/tui/prompt-background.test.tsx` 2 pass; `tsc --noEmit` in packages/tui clean. Not built or installed.
- MISTAKE: Python text-mode writes on Windows converted LF files to CRLF and a `\\x1b` heredoc wrote a raw ESC byte; fixed with `sed 's/\r$//'` and an explicit `chr(92)`. Edit text files with the Edit tool, not Python, on this machine.

### User
Prompt
- On Home, Ctrl+Enter sends the prompt to a new session and keeps you on Home; F7 no longer does this.
- Inside a session, Ctrl+Enter still adds a newline.
- WezTerm now sends a distinct Ctrl+Enter code so the TUI can tell it apart from Enter.

---

## 2026-10-03 (~03:00) - v0.2.73 - Clean Home launch debug tests - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed
- Version: 0.2.73
- Kept F7 `prompt_submit_background` / command `prompt.submit.background` / stayHome submit path.
- Removed source-slicing diagnostic tests (`Bun.Transpiler` / `new Function` extract of prompt/index.tsx). Replaced with two wiring checks: default F7 bind, F7 fires on Home and not in a session.
- Verification: `bun test ./test/cli/tui/prompt-background.test.tsx --timeout 30000` in packages/tui; 2 pass. Live install still user-only.

### User
Home launch
- F7 is unchanged. Diagnostic extract tests are gone. Next agent should pick up from a handoff, not re-debug the bind.

---

## 2026-10-03 (~02:30) - v0.2.72 - Fix TUI tsc build errors - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed
- Version: 0.2.72
- Changed Home launch keybind to `prompt_submit_background` + CommandMap `prompt.submit.background`; matches other prompt_* keys. tui.json override is `prompt_submit_background`.
- Fixed `DialogMoveSession` directory resource typing: Solid `createResource` inferred `{}`, so tsc failed on `filter`/`find`/`spread`. Typed resource as `ProjectDirectory[]` and guarded `directoryData`.
- Verification: `bunx tsc --noEmit` in packages/tui clean; `bun test ./test/cli/tui/prompt-background.test.tsx --timeout 30000` 3 pass. `bun turbo typecheck` was already clean (tsgo).

### User
Build
- tsc no longer fails on the move-session directory list. F7 still sends a Home prompt to a new session; configure it in tui.json as `prompt_submit_background`.

---

## 2026-10-02 (~16:45) - v0.2.71 - Diagnose Home F7 launch - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed
- Version: 0.2.71
- Root cause: `prompt.submit.background` was a leftover Ctrl+Enter textarea `target`/`focus-within` layer; F7 never joined `prompt.palette` gather. Submit path itself was fine. Prior session tests used kitty-only `pressKey("F7")` and required focus, so they could not catch CSI/unfocused Home.
- Fixed: register F7 on the untargeted Home `prompt.palette` layer; removed dedicated target binding. Command still no-ops off Home.
- Added prompt-background tests: lookup cmd/key, palette gather, kitty F7, CSI F7 without kitty, unfocused Home dispatch, session no-op, `dispatchCommand`.
- Verification: `bun test ./test/cli/tui/prompt-background.test.tsx --timeout 30000` in packages/tui; 3 pass, 0 fail, 25 assertions. Live ocDebug/install not run.
- TODO: user must install/restart ocdebug to pick this up; previous F7/Ctrl+Enter/F6 changes were source-only.

### User
Home F7
- F7 was bound only while the Home prompt box owned keyboard focus, so it often did nothing even when the command existed.
- It is now a normal Home command. After install, Ctrl+P "Send prompt and stay on Home" and F7 should both launch without leaving Home.

---

## 2026-10-02 (~16:18) - v0.2.70 - Use F7 for Home prompt launch - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed
- Version: 0.2.70
- Changed `prompt.submit.background` default F6 -> F7 at user request; F6 belongs to another app. Updated same-session shortcut assertions and emitted function keys.
- Verification: `bun test ./test/cli/tui/prompt-background.test.tsx --timeout 30000` in packages/tui; 2 pass, 0 fail, 19 assertions. Build/install and RustDesk behavior not tested.
- Kept revision 0.2.70; already bumped once in this session.

### User
Home shortcut
- Press F7 to send your Home prompt to a new session and remain on Home.

---

## 2026-10-02 (~16:14) - v0.2.70 - Use F6 for Home prompt launch - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed
- Version: 0.2.70
- Changed `prompt.submit.background` default from Ctrl+Enter to F6 after user reported RustDesk shortcut failure and requested no Control modifier. No default F6 conflict found in TUI keybindings.
- Updated same-session regression checks: F6 launches only focused Home prompt; F6 in session does not submit, Ctrl+Enter remains newline.
- Verification: `bun test ./test/cli/tui/prompt-background.test.tsx --timeout 30000` in packages/tui; 2 pass, 0 fail, 19 assertions. RustDesk behavior/build/install not tested.
- MISTAKE: mockInput.pressKey requires uppercase F6 symbolic key; lowercase f6 did not emit function key. Corrected after reading mock key definitions.
- Kept revision 0.2.70; already bumped once in this session.

### User
Home shortcut
- Press F6 to send your Home prompt to a new session and remain on Home; no modifier key is required.

---

## 2026-10-02 (~16:10) - v0.2.70 - Review Home prompt launch changes - GPT-6.1 Sol, effort not exposed; Cleanup

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Cleanup; completed
- Version: 0.2.70
- Reviewed only same-session Home submission action, target binding, shared-submit option, toast, regression checks, and revision/notes; no introduced runtime defect found.
- Hardened prompt-background.test.tsx source extraction: normalize CRLF, fail explicitly when production blocks disappear, execute production action rather than stand-in callback, check unfocused prompt cannot launch.
- Verification: `bun test ./test/cli/tui/prompt-background.test.tsx --timeout 30000` in packages/tui; 2 pass, 0 fail, 18 assertions. Live terminal/build/install deferred to user.
- Kept revision 0.2.70; already bumped once in this session.

### User
Scoped cleanup
- Reviewed the Home launch feature and strengthened its checks for Windows line endings, the actual Ctrl+Enter action, and prompt focus.

---

## 2026-10-02 (~16:01) - v0.2.70 - Send prompts while staying on Home - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed
- Version: 0.2.70
- Added Home-only `prompt.submit.background` action, default Ctrl+Enter; focused target binding overrides newline only on Home.
- Changed shared Prompt submission to accept stayHome; reuses session creation/send/history/guard, skips navigation, clears and focuses input, shows Started new session toast.
- Added prompt-background.test.tsx: executes production submission functions and mounts production binding with real keymap/textarea; checks distinct sessions, normal navigation, draft retention on creation failure, and session-screen newline.
- Verification: `bun test ./test/cli/tui/prompt-background.test.tsx --timeout 30000` in packages/tui; 2 pass, 0 fail. Build/install and live terminal shortcut deferred to user.
- MISTAKE: keybinding test first used mockInput.pressKey("return"), which did not emit Enter; corrected to pressEnter({ ctrl: true }).

### User
Home prompt
- Ctrl+Enter starts a new session from Home and leaves the cleared prompt focused for your next task, with a brief confirmation toast.
- Enter still opens the new session. Ctrl+Enter inside a session still inserts a newline.

---

## 2026-10-02 (~15:30) - v0.2.69 - Fix session tool error types - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed
- Version: 0.2.69
- Fixed three session.get calls in session-complete.ts and session-in-progress.ts with Effect.orDie; matches existing session-tail tool and Tool.Def.execute error-free contract.
- ERROR: user push blocked by opencode typecheck; new lookups leaked typed NotFoundError into tool execution.
- Verification: inspected tool contract and existing session-tail boundary; no new tests, local automated checks not run under project policy. Push hook remains user verification.

### User
Push fix
- Fixed the session-marking type mismatch that blocked the pre-push hook.

---

## 2026-10-02 (~15:12) - v0.2.68 - Agent session marking approvals - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed
- Version: 0.2.68
- Added `session_in_progress` tool and registry entry; ordinary marking defaults allow, complete/failed reopening uses separate `session_reopen` permission default ask. Re-reads after reopening approval and preserves a newer mark.
- Changed `session_complete` default deny to ask; already-complete calls return without another approval. Kept failed-tool policy.
- Added typed config permission keys, completion/reopening prompt titles, agent-facing usage descriptions, and README session-mark behavior.
- Added eight session-marking integration cases with real permission requests/replies; updated obsolete default-deny assertion. Reused existing setters and persistence; no migration or API endpoint changes.
- Verification: eight new session-marking cases and the changed completion-default case run in `packages/opencode/test/tool/task.test.ts`; 9 pass, 0 fail. Existing suites, typechecks, and builds not run. Installed permission UI remains user verification.
- MISTAKE: race test initially asserted an `Exit` wrapper although its fiber returned the tool result directly; corrected assertion and reran all nine selected cases.

### User
Session marks
- Agents can mark sessions in progress without approval by default. Completing a session or reopening a complete/failed session asks permission, with existing Allow once / Allow always / Reject choices.
- Permission prompts describe the proposed change. Repeating an already-complete mark does not ask again.

---

## 2026-10-02 (~14:44) - v0.2.67 - Simplify agent verification guidance - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed
- Version: 0.2.67 (docs-only; no revision bump)
- Replaced AGENTS.md check budgets, timings, full-suite approval, local typecheck mandates, and stale failure baseline with newly-added-tests-only policy. Updated UPSTREAM-SYNC.md verification.
- Updated global oc AGENTS.md, principles.md, Go/SuperPlan prompts, and verify skill: existing tests and automated checks belong to GitHub on push; project policy overrides older plans and generic skills.
- Supersedes cumulative verification budget above and home notes dated 2026-10-01 (~23:35); historical entries preserved.
- Verification: read guidance and GitHub test workflow; docs-only, no tests added or automated checks run.
- Reviewed session edits; removed unsupported claim in verify skill that builds are delegated to GitHub. Kept build permissions under existing project rules.

### User
Agent guidance
- Agents now run only newly added tests and leave existing tests, type checks, and other automated checks to GitHub when you push. Removed timing budgets and approval prompts; no UI change.

---

## 2026-10-02 (~03:06) - v0.2.67 - Review and clean up cloud workflows - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed
- Version: 0.2.67 (revision already bumped once this session)
- Fixed review/opencode cancellation: moved concurrency into authorized command jobs so ordinary comments cannot cancel active agents.
- Removed duplicate Node setup from test jobs; shared setup-bun already installs Node 24.
- Removed enterprise integration tests from matrix at user's request; Storage only supports credentialed S3/R2 and fresh runners lacked adapter configuration. Kept enterprise in whole-repository typechecking. Remaining 22 test workspaces run on Linux/Windows.
- MISTAKE: earlier whole-repository matrix added enterprise storage suites without checking infrastructure prerequisites; prior no-custom-secrets claim did not cover those suites. Read integration dependencies before adding CI jobs.
- Verification: root typecheck dry run confirmed 35 workspaces and 27 executable typechecks; actionlint 1.7.12, five-workflow Prettier check, and git diff --check passed. Cloud execution remains unverified until push; no local full suites run.

### User
GitHub Actions
- Ordinary comments no longer cancel active GitHub agent jobs, and tests no longer set up Node twice.
- Removed enterprise storage integration jobs as requested; enterprise code remains included in whole-repository typechecking.

---

## 2026-10-02 (~03:01) - v0.2.67 - Expand cloud checks to whole repository - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed
- Version: 0.2.67 (revision already bumped once this session)
- Removed typecheck package filters; root typecheck script runs every workspace with --continue=always.
- Added console/app, console/core, console/function, enterprise, function, session-ui, stats/core to Linux/Windows test matrix. Covers 23 test workspaces including two Node provider suites.
- Verification: actionlint 1.7.12 and git diff --check passed. Local full suites not run; cloud execution awaits push.

### User
GitHub Actions
- Cloud checks now include whole-repository typechecking and all identified package test suites, including retained upstream packages.

---

## 2026-10-02 (~02:58) - v0.2.67 - Automate OC cloud verification - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed
- Version: 0.2.67 (revision already bumped once this session)
- Changed test/typecheck/generate triggers to main pushes, main-targeted PRs, and manual dispatch; GitHub-hosted runners replace Blacksmith; cancel superseded runs.
- Added independent Linux/Windows test jobs for cli, client, codemode, core, effect-drizzle-sqlite, http-recorder, httpapi-codegen, llm, opencode, protocol, schema, sdk/js, tui, ui; Bun timeout 30000. Separate Node-script provider jobs cover Agentify/Cursor; Linux HttpApi gates remain independent.
- Scoped typecheck to opencode/cli/client dependency closures; dry run confirms 17 existing typecheck commands, including shared ui required by tui. Excluded hosted console/stats/enterprise products.
- Changed generate to read-only client/legacy SDK/OpenAPI drift checks; removed GitHub App credentials, whole-repo formatting, commits, and pushes. Generated untracked files also fail verification.
- Changed on-demand review/opencode to Ubuntu hosted runners, per-thread concurrency, credential checks; restricted /oc callers to OWNER/MEMBER/COLLABORATOR; review prompt follows repository rules. Existing model choices retained.
- Verification: actionlint 1.7.12 passed for all five workflows (optional shellcheck/pyflakes disabled); Prettier check and git diff --check passed; Turbo typecheck dry run passed. No local full suites or generation builds run; first pushed CI run remains live validation.
- Required: add OPENCODE_API_KEY repository secret for /review and /oc only; automatic verification needs no custom secrets.

### User
GitHub Actions
- Pushes to main now automatically run OC package tests on Windows/Linux, typechecking, and generated-code checks using GitHub cloud runners.
- Test packages report independently, and generated-code checks report stale files instead of pushing changes.
- GitHub review and agent commands remain on demand and require an API-key repository secret.

---

## 2026-10-02 (~02:47) - v0.2.67 - Remove upstream-only workflows - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed
- Version: 0.2.67
- Removed 21 workflows: close-issues, close-prs, compliance-close, duplicate-issues, pr-management, pr-standards, triage, deploy, unlock, publish, publish-github-action, release-github-action, publish-vscode, containers, notify-discord, docs-update, docs-locale-sync, stats, nix-eval, nix-hashes, storybook.
- Kept generate, opencode, review, test, typecheck workflows.
- Verification: directory read confirms exactly five workflows remain; git diff --check passed. Tests not run for workflow deletion.

### User
GitHub Actions
- Removed the 21 inherited workflows identified as unnecessary for this fork. Five workflows remain.

---

## 2026-10-02 (~02:08) - v0.2.66 - README leftover notes only - Grok 4.6, effort not exposed; Implementation

### Agent
- Meta: Grok 4.6; effort not exposed; Implementation; completed
- Version: 0.2.66 (docs-only; revision not bumped)
- Kept Claude Code row, Cursor SKUs, Luna/SuperGo routing, hide Plan, cheap/hard delegate, and no-desktop row.
- Folded plugin `displayVersion` into the footer display-version row; dropped the duplicate high row.
- Reworded markdown agent row to skip-bad-files + `opencode agent validate` (stock already loads the folders). Broadened session marks to complete/failed/in progress/pin.
- Stripped What's left archaeology: ChatGPT packaging overlap, dropped picker, `local.tsx` lint TODO, debug-session/`/status` 404, process-tree already-retired note.
- Counts: ~done~ 18, high 18, medium 22, low 0, CRITICAL 0, total 58.

### User
Docs
- README cleanup dropped leftover notes and one duplicate display-version row. Claude, Cursor SKUs, and daily agent routing stay.

---

## 2026-10-02 (~02:04) - v0.2.66 - README OpenTUI row cleanup - Grok 4.6, effort not exposed; Implementation

### Agent
- Meta: Grok 4.6; effort not exposed; Implementation; completed
- Version: 0.2.66 (docs-only; revision not bumped)
- Removed `README.md` section 6 CRITICAL rows (session paint death, WezTerm letter-key death), the OpenTUI 0.4.5 match row, and session-bomb hygiene. Retired the OpenTUI raw-mode resume patch. Native renderer notes stay in `README.OG.md` (no pointer back to README).
- Reworded text-node crash (actual `patch-text-node.ts` coerce), Crow (`CROW_SESSION_HANDLE` / callback URL, no Tailscale), and bgShell (sibling plugin, no absolute path).
- Counts: ~done~ 18, high 19, medium 22, low 0, CRITICAL 0, total 59.

### User
Docs
- README no longer treats unconfirmed OpenTUI paint/key death, matching stock 0.4.5, or the removed `/editor` resume patch as oc product rows. Crow and the text-node crash row now match the code.

---

## 2026-10-02 (~02:00) - v0.2.66 - Drop README v1 revert memo - Grok 4.6, effort not exposed; Implementation

### Agent
- Meta: Grok 4.6; effort not exposed; Implementation; completed
- Version: 0.2.66 (docs-only; revision not bumped)
- Removed `README.md` duplicate CRITICAL restatement and the "100% gone on stable / v1" revert memo (classic Go TUI columns, dummy-text notes, process-tree closer). Those were session archaeology; this checkout has no Go TUI (only `.scripts/grepbench`).
- Kept section 6 CRITICAL rows and counts (~done~ 18, high 22, medium 22, CRITICAL 2, total 64). Dropped "See the revert section." Pointed the OpenTUI 0.4.5 row at section 6.
- Changed Last reviewed to 2026-10-02.

### User
Docs
- README no longer restates the paint/key CRITICAL items or argues about reverting OpenTUI to a Go v1 TUI. The two CRITICAL rows in section 6 stay until a later pass.

---

## 2026-10-02 (~01:51) - v0.2.66 - Test response header merging - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed follow-up
- Version: 0.2.66 (same session; no second revision bump)
- Fixed `tui/test/fixture/tui-sdk.ts` json helper: native Headers handles objects, Headers instances and pairs; supplies JSON content type only when absent; preserves caller input.
- Added one regression test covering header shapes, content type, response status/body and input preservation.
- Verification: fixture regression, SDK context and TUI data tests: 11 pass, 0 fail, --timeout 30000; TUI bun typecheck and git diff --check passed.
- Deferred model/variant persistence rejection review in README at user request; no model runtime changes. GitHub tool header-array weakness remains dormant in current callers.

### User
Test helper
- Fixed custom header handling in the TUI test response helper with a small native Headers change.
- Focused tests and the TUI typecheck pass. No application runtime change.

---

## 2026-10-02 (~01:44) - v0.2.66 - Remove lint from prePush - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed follow-up
- Version: 0.2.66 (same session; no second revision bump)
- Removed Oxlint invocation from `.scripts/prePush.ps1` at user request; retained Turbo typecheck and code-count refresh. Updated `SCRIPTS.md`.
- Verification: PowerShell syntax parse and git diff --check passed; counter refreshed successfully. Full prePush not run.

### User
Pre-push
- Pre-push now runs typecheck and refreshes the README code table without the Oxlint warning output.

---

## 2026-10-02 (~01:35) - v0.2.66 - README language table - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed follow-up
- Version: 0.2.66 (same session; no second revision bump)
- Updated `countCode.ps1`: replace only linked number; preserve user's Progress placement and count wording.
- Added README Markdown language table from same scc JSON, with Files/Lines/Blanks/Comments/Code and totals; replace only code-count marker contents.
- Documented editable wording/placement and required markers in `SCRIPTS.md`.
- Verification: counter ran twice; README/report hashes stable; manual wording retained; LF/CRLF number-only replacement checks and git diff --check passed. Full prePush not run.

### User
README
- Added the full language breakdown under Progress, keeping your wording and placement.
- Count refresh now preserves surrounding text and updates only the number and generated table.

---

## 2026-10-02 (~01:27) - v0.2.66 - README code count - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed
- Version: 0.2.66
- Added `.scripts/countCode.ps1`: scc JSON Code sum updates exactly one README link; tabular report at root `scc.txt`.
- Counts maintained source/tests/scripts, including inherited source; honors ignore files; excludes UPSTREAM, dependencies, builds and generated client directories.
- Updated `prePush.ps1`: refresh count after lint/typecheck; documented standalone command and scope in `SCRIPTS.md`.
- Verification: counter ran successfully with scc 3.7.0; 511,608 code lines; repeated output stable; LF/CRLF replacement checks, prePush syntax parse and git diff --check passed. Full prePush not run (root-wide typecheck requires user approval).

### User
Code count
- README now links to a language breakdown showing 511,608 code lines, excluding blanks and comments.
- Run `.\.scripts\countCode.ps1` independently, or use prePush to refresh the count after its checks pass.

---

## 2026-10-02 (~00:24) - v0.2.65 - V2 removal follow-up cleanup - GPT-6.1 Sol, effort not exposed; Pass

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Pass; completed targeted stale-wiring cleanup
- Version: 0.2.65 (same session as engine removal; no second revision bump)
- Reviewed engine removal runtime diffs, retained TUI session API calls, removed-symbol references and lockfile. Earlier revive changes excluded.
- Fixed `core/package.json`: removed explicit export pointing to deleted `session/runner/index.ts`.
- Fixed `schema/AGENTS.md`: replaced deleted sdk-next surface guidance with Protocol/Client and legacy execution ownership.
- Confirmed `bun.lock` no longer lists sdk-next after user reinstall. No references to removed engine symbols found in packages after export cleanup.
- Verification: core `bun typecheck` passed; opencode session-data, entry.body, httpapi-session and public-openapi files: 61 pass, 0 fail, --timeout 30000. Full suites not run; installed feature interactions not independently checked.
- Rotated previous 1019-line active notes verbatim to `buildNotes.archive5.md`; retained human rules and cumulative history from archives 1-5.

### User
Cleanup
- Removed a package export pointing at the deleted V2 runner and corrected stale agent guidance. No UI change.
- Reinstall updated the lockfile; focused checks pass. Model switching, shell output, move-session and reference autocomplete remain live user checks.

---
