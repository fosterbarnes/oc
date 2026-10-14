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
- Keep `### User` notes in normal plain English. Do not use grug shorthand.

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
- Kept histories verbatim: archive1 (2026-08-20 through 09-09), archive2 (09-09 through 09-15), archive3 (09-15 through 09-28), archive4 (1144 lines), archive5 (1019 lines through v0.2.65), archive6 (1127 lines through v0.2.87). Earlier hashes and detailed summaries remain in archives. Never edit archives.
- Added local PowerShell build/check/run/install/push/update/sync scripts; isolated upstream checkout; fail-closed content-level three-way apply; build/install split; installer stops managed processes before building and recreates hard links.
- Changed maintenance version to one X.Y.Z line, final component revision; display separate from upstream package version. Current workspace relocation places version at `src/.version/version`; older root-path notes predate v0.2.83. Release builds keep Script.version; local runtime/provider version uses incorporated upstream pkg.version.
- Added session bootstrap, global session listing, complete/failed/in-progress flags, persisted model overrides; lazy CLI startup; command-palette ordering; model hiding; slash commands anywhere; friendly agent names and Tab order.
- Added native OC configuration, resident lifecycle/restart/auto-start; reconnect waits for disposal/replacement without replay; stale launcher records no longer cause unnecessary waits.
- Added isolated ocdebug port 4097; first-run production config/assets seeding and import; bare oc and relative targets have separately configurable directories; project picker opens TUI palette.
- Added browser providers through Agentify/Edge, native Cursor provider/proxy, lazy helper packaging, cancellation, SSRF/symlink/git credential protections, context tiers/pricing, compaction/empty-tool handling; disabled native Cursor plan mode. Ordinary Cursor models retain ordinary billing; long-context entries marked Max.
- Removed browser UI/Electron packages, process-tree helper, Poe integration. Windows children use normal spawn plus hidden process-tree termination. Avoid Bun 1.4.0 Windows TUI FFI runtime.
- Added instructionsByModel model-glob prompts, agents under plural directory, model CLI precedence and session overrides; disabled stock plan agent through disable key.
- Kept SuperPlan read-only contract and exact absolute planPath; phased Go execution, plan_next_phase, plan_closeout, optional coordinator/subagents. Archived Go-a/SuperPlan-a profiles. Explicit return types prevent prompt/registry/plan-execute inference cycles.
- Added sidebar scripts/configuration, weekly provider usage and Claude OAuth usage, Everything auto-start/reconnect, clipboard file-drop/temp PNG, WezTerm GUI mapped to sibling CLI executable.
- Fixed question cancellation/publish race and dialog key ownership; pending permissions/questions reload on reconnect; server exit still rejects pending questions.
- Added DB unknown-migration refusal after stock 2.0.6 changed shared DB; restore backup and isolate stock data. Local sqlite3 3.22 cannot DROP COLUMN.
- Kept Gemini thinking defaults, Bedrock tool-result images, GPT-6 Codex allowlist, credential redaction; working openai/gpt-6-luna. Poe Luna routes failed.
- Fixed resident console flashes through hidden pwsh Start-Process hop escaping libuv lifetime. Keep hop until native FFI verified; dropping detached alone kills resident with launcher.
- Added native run_after_turn; `.ps1` targets get visible consoles. Generic permission default allow; user asks except approved revive targets. Claude Code now exposes run_after_turn through default proxy tools; explicit proxyTools overrides must include it.
- Kept SessionWork admission/cancellation gate and detached 30s shutdown timeout; removed timing probes, old safeShutdown and compiled revive wrappers. Empty BUN_INSTALL cleanup prevents install hangs. Never run installers from agents.
- Added command/skill fingerprint hot reload, serialized rebuild, per-file cache, last-good fallback/toasts; slash menu keeps prior data on failed refresh. Config path/URL and new skill-folder permissions may need restart. Keep Command -> Skill lock order one-way.
- Changed slash labels to :(oc), :(command), :(mcp), :(skill), colors purple/yellow/teal/peach; display only. Commands win skill-name collisions.
- Added status/pinned session filters, diamond gutters, wrapping action shortcuts. Fixed Ctrl+D registration loop through static hints. Rename tries configured model, free MiMo Flash, Luna medium; preserves cancellation and saves only successful cleaned title. Fixed duplicate CLI JSON errors.
- Removed stale custom docs; script GitHub target fosterbarnes/oc. `FORK.md` now defines fork, `README.md` public landing page, `README.OG.md` native state. Code count updates single README link/table markers and `scc.txt`; prePush keeps typecheck/count only, no lint. Push supplied subject wins; buildNotes.txt used only when changed since HEAD, else prompt. agent-push explicitly authorizes message/write/push for that invocation only; AGENTS.md governs older notes prohibiting it.
- Removed V2 execution engine v0.2.65: execution/runner/coordinator/Context Epochs/endpoints/sdk-next/associated tests/CLI shell-merge machinery. Legacy owns execution; retained SessionV2 reads/create/model-agent switching, shared bus/projector/work/store/location services, TUI /api routes. Removed stale core runner export and lockfile workspace.
- Kept session.next schemas/projector/input/V2 tables for historical import/sync replay; EventV2.replay rejects unknown durable types. Keep shipped cancellation migration and unused cancelled_seq. Revisit engine migration only if upstream deprecates legacy.
- Added session marking approvals v0.2.68: ordinary in-progress allowed; completion and reopening marked sessions ask separately; re-read after approval preserves newer marks. Fixed typed NotFoundError leakage with Effect.orDie at tool boundary.
- Added Home-only prompt_submit_background/stayHome launch, now Ctrl+Enter v0.2.74; session Ctrl+Enter remains newline. WezTerm sends CSI-u; Home target binding beats textarea newline. F6/F7 iterations superseded. Fixed DialogMoveSession resource typing; removed source-slicing diagnostics for real keymap checks.
- Added Claude Code Windows PowerShell preview tool, mapped PowerShell to bash rows, denied it in read-only presets. Removed DISABLE_NONESSENTIAL_TRAFFIC; kept DISABLE_AUTOUPDATER. Host-only desktop tools remain host-gated; strictMcpConfig blocks claude.ai connectors.
- Fixed unmapped Claude tools with dynamic provider-executed events; autonomous-turn wake posts synthetic prompt_async from last target, streams buffered init without new stdin, normal turn interrupts. Live wake/interrupt/resume checked. Risk: 500-line unattended buffer can drop init if slow. For isolated source runs set OPENCODE_DB as well as XDG_DATA_HOME; absolute user OPENCODE_DB otherwise wins.
- Added v0.3.0 milestone roadmap. Editor config supports per-extension map. Sidebar model/reasoning reads session state instead of model.json polling; usage retains last good with stale/cache dimming and timed/post-completion refresh. Added running/recent sub-agent rows; aborts not failures.
- Added terminal detector, Windows Terminal script placement, agent-colored plain square tab title, OSC progress, WezTerm user var. Renderer writes through OpenTUI; clears on destroy; force-killed TUI cannot clear progress. Removed emoji nearest-square helper; preserved existing renderer tests.
- Added restored-question per-directory/revision guards, idle-only recovery, message+call dismissal, promptAsync follow-up using tool/question answer format; keep duplicate format in sync. Parent shows own restored questions; plugin/sub-agent rows not included. Another TUI answer may remain visible until reload.
- Added per-instance TUI ledger/CIM process scoping; shutdown leaves ocdebug/other terminals alone. PowerShell 7 required v0.2.78; Windows PowerShell fallbacks reverted by user decision. First post-ledger upgrade may leave old TUIs open; process-list failure leaves TUIs open.
- Fixed launchDetached pwsh hop v0.2.79: detached false; DETACHED_PROCESS left Start-Process unable to launch. Verified quoted/spaced/trailing-backslash arguments. Added native hard revive supervisor/worker pipeline, log, pre-shutdown build, rename-running-exe install/alias relink/rollback, old-runtime recovery on failure, scoped terminal reopen.
- Changed revive first run to existing source/download folder/restart only; choice saved. Native build config now `{source, debug}`; calls build.ts directly, never personal .scripts. No auto-pull on later revives. WezTerm reopen uses wezterm-gui to avoid lingering console. Terminal-restart/install edge cases remain live checks from archive6.
- Added trigger-time revive marker for both TUI commands, synthetic noReply text and persisted divider, preserves agent/model/variant. Home/run_after_turn revives write none. Marker shows oc and upstream versions; sidebar `oc vX ∙ OG vY`. Older metadata.version test markers render undefined.
- Moved workspace into src v0.2.83; root keeps docs/config/scripts. Updated scripts, CI paths, husky, root asset references, sync ParentPrefix/root exceptions, native revive WORKSPACE. Sync had 13 upstream overlaps including setup-bun; no unrelated apply. Run Bun from src/packages, never repository root.
- Fixed intro handoff v0.2.84-87: server-side bootstrap removes second CLI; shared compact oc art, intro enters alternate screen; root-level IntroLogo renders before gating providers and hides when app ready. Theme wait reduced to 100ms. Temporary startup trace removed. User confirmed installed v0.2.87 has no gap; apparent recurrence was old production v0.2.86. Revive banner intentionally reports pre-install version.
- Verification baseline: v0.2.63 thirteen known failures fixed; v0.2.65 six package typechecks, 234 scoped tests, route coverage 202 clean with five pre-existing missing routes. v0.2.79 local Windows typecheck 27/27, unit suites green after scoped fixes, client/SDK generation clean, HttpApi coverage/auth 207 clean. Windows HttpApi Effect POST /pty and /api/pty still fail locally; no PTY fix claimed. Known Linux Cursor state.vscdb and PTY replay failures plus cloud opencode baseline failures remain in archive6; do not relist without new evidence.
- Fixed v0.2.79 generated SDK permissions/OpenAPI drift, HttpApi debug-logging/question/rename/targeted-command coverage, default-proxy assertions, Windows codegen paths/CRLF, platform-specific TUI guards. Risk: opencode tests/exerciser may write cwd config.json; source unknown, investigate before removing unfamiliar files.
- Removed inherited workflows in v0.2.67, added replacement cloud checks, then removed remaining five in v0.2.88 after private-repo Actions billing blocked execution. Local test.ps1 now owns manually selected verification; broader suites user-driven. Older cloud-delegation/timing-budget notes superseded by current AGENTS.md.
- MISTAKE: PowerShell HOME is read-only; use testHome. Never reconstruct plan paths. Parallel proxy edits can reject after applying. Bare Bun uses 5s; use --timeout 30000. Git Bash /tmp and URL pathname fail on Windows. Never overwrite existing tests without Read; renderer tests were restored after accidental replacement. Re-run affected checks after final edits, not before reporting.
- MISTAKE: deleting applied migrations breaks guard; inspect shipped DB first. Fiber.join in interrupt cleanup can hang; await Exit before propagation. V2-named routes are live; grep TUI client.v2 calls before cutting. Do not call force-kill safe cancellation; cancellation must be explicit. Session paint claims remain unconfirmed and should not be revived.
- MISTAKE: Python/heredoc shell edits mangled CRLF/backslashes/raw ESC; edit project files through file tools. Claude host-env probes must unset host CLAUDE* variables. Native features never call personal PowerShell build scripts. Missing native feature config needs explicit first-run choice, not hidden commands. Cross-path markers belong at shared trigger.

## User
- Local scripts build, run, install, sync, and manually check the fork against a separate upstream checkout. Cloud workflows are removed; agents never run live installers.
- Production and debug use separate servers/settings. Shutdown targets this instance; reconnect never replays prompts. The database refuses incompatible migrations and keeps historical event contracts.
- Session controls persist model choices/marks and ask for completing or reopening marked sessions. Picker supports status/pinned filters and compact action shortcuts. Home Ctrl+Enter starts a session while keeping Home; in-session it adds a newline.
- Browser/Cursor providers use packaged helpers and mark bigger contexts Max. Claude Code shows PowerShell and unmapped tools normally, supports queued-after-turn launches and background follow-up wakes.
- Commands/skills reload with last-good fallback and source labels. Plans support phased execution and archive through a tool; rename uses model fallbacks without overwriting titles on failure.
- Sidebar model/reasoning follows the session, usage refreshes and marks stale data, and sub-agent rows show running/recent children. Tabs use a plain agent-colored square and progress. Editor choice can vary by extension; Windows Terminal script placements are supported.
- Questions recover when reopening idle sessions. Legacy sessions are the only execution runtime; shared reads/model-switching APIs stay.
- Native revive builds from the chosen source, optionally debug too, before restarting this instance's terminal. It has explicit first-run source choices, no automatic later pull, install rollback, logs, and a persisted marker preserving agent/model. Scripts remain personal/manual tools.
- Startup uses compact oc art and a seamless installed v0.2.87 intro-to-TUI handoff; temporary diagnostics are removed. Workspace lives in src; public README and FORK.md serve separate purposes.
- prePush runs typecheck and updates the language count without lint. Push messages prefer an explicit subject or newly edited buildNotes.txt, never silently reuse the previous message.

# Historical entries (newest first)

---

## 2026-10-08 (~01:09) - v0.2.120 - Final pass on the Claude flow verification work - Opus 5.5, medium reasoning; Pass

### Agent
- Meta: Opus 5.5; medium; Pass; completed. Review split across 6 read-only Grok 4.6 low oc subagents (4, then 2 reruns), every finding checked against the code before acting.
- Version: 0.2.120
- ERROR: the user's oc reinstall (opencode.exe written 01:05:02) killed two subagent runs (exit -1, no error event); reran them as smaller tasks. First blamed scope size; wrong.
- Fixed `updateClaudeCode` (tui app.tsx): read output on `close` (stdio drained), one toast when spawn errors, quote a spaced cliPath only when `shell` (Windows).
- Fixed `claudeRealFlow.ps1`: report path printed in `finally` (failing runs still write one); only a report newer than the run counts, else throws (skipped flow).
- Fixed pane compact check: post-compact reply now unique (`AFTER-COMPACT`); the old wait matched the summary text itself.
- Fixed fake checks: step 3 asserts the last message is the assistant's; token and API-error scenarios now call `expectIsolated`; round-trip scenario uses `fixture.` instead of destructuring; `runClaude` env filter now also drops `CLAUDECODE` (kept separate from `hostEnv`, which keeps the OAuth token).
- Fixed stale `openChat` comment (proxyTools/todos). Removed `export` from `FlowBlockedError` (unused outside).
- Rejected findings: `claudeTestFlow.md` is the manual flow, not stale; `new Set(null)` is valid; `hostEnv` needs no `BASH_ENV` (`claudeEnv` blanks it for every claude spawn); transcript JSON lines are complete after the turn.
- Added `/claudeFlowReport-*.md` to `.gitignore`. Deleted `claudeFlowHandoff.md` and `claudeFlowRemainderHandoff.md` (user choice; content lives here). `.opencode/plans/claudeFlowReportChecks.md` still names them as history.
- Updated `oc-subagent` skill (`~/.claude/skills`): one self-contained background call per subagent, single-quoted here-string prompt, never background inside a call.
- Kept: README.md diff is the user's own writing; untouched.
- Verification: 5 edited fake scenarios + pane compact pass; flowReport 6 pass; opencode and tui typecheck clean; script parses.

### User
Command palette
- Update Claude Code shows exactly one toast with the full last line of the update, also when it fails.

Testing
- `claudeRealFlow.ps1` now always prints this run's report, even when the run fails, and says so when no report was written.
- Real-model report files are no longer offered for commit, and the two handoff notes are gone.

---

## 2026-10-08 (~00:58) - v0.2.119 - Claude flow step 7 failure was a harness false alarm - Opus 5.5, medium reasoning; Debug

### Agent
- Meta: Opus 5.5; medium; Debug; completed. User asked the agent to run the step-7 real checks; ran `claudeRealFlow.ps1 -Step7` via `Start-Process pwsh -UseNewEnvironment` (clean env, script read the saved token; agent never saw it). 4 runs, about $0.25 total.
- Fixed `switchModelStep` (real-model.test.ts): reused one `Bun.file` for before/after `exists()`; Bun 1.4.1 caches that answer on the object, so a real deletion read "present". Fresh BunFile per check. Classified: harness bug (a), not model, not oc. Reports 202610080413, 0453, 0455 step 7 FAILs were false.
- Added: when the deletion check fails, the CLI transcript's `toolUseResult` for the step goes to Oddities (`cliToolResults`); oddity cells now 600 chars.
- Fixed report name collisions: stamp now includes seconds (two step-7 runs in one minute overwrote).
- Changed fake restart+switch scenario to the real command shape (quoted absolute path, `-Force`).
- Observed: Haiku 4.5 first ran `rm C:\...` unquoted in Git Bash (backslashes stripped, exit 1), then `Remove-Item`; Haiku 5.5 read the file, then `Remove-Item -LiteralPath`. Both deleted it. Step 7 CLI cost: Haiku 4.5 $0.0175, Haiku 5.5 $0.0051.
- Ruled out with fake runs: restart+switch path, PowerShell tool, real command shape, `turnStats`.
- Verification: real step 7 passes 2/2 on Haiku 4.5 and Haiku 5.5 (report 202610080457, overwritten by the 5.5 run); fake scenario passes; flowReport 6 pass; typecheck clean.
- MISTAKE: earlier entry's "likely model behavior" guess was wrong; the evidence (tool completed, file present) pointed at the check itself. Rule: when a tool reports success and the check disagrees, verify the check first.

### User
Claude test flow
- Step 7 (switch model, delete the file) passes on both Haiku 4.5 and Haiku 5.5; the earlier failures were a bug in the test's file check, not in oc.
- Report files now include seconds in their names, so two quick runs no longer overwrite each other.

---

## 2026-10-08 (~00:49) - v0.2.119 - Update Claude Code from the oc command palette - Opus 5.5, medium reasoning; Implementation

### Agent
- Meta: Opus 5.5; medium; Implementation; completed
- Version: 0.2.119 (same session as the entry below; one bump per session)
- Added `oc.update_claude_code` ("Update Claude Code", slash `/updateClaudeCode`) to the `oc` palette section in `tui/src/app.tsx`, with `updateClaudeCode(cliPath, toast)` next to `persistOcConfig`. Runs `<cliPath> update` (provider `claude-code.options.cliPath`, else `claude`), shell on Windows for npm's `.cmd` shim; toasts progress, then the CLI's last output line, or the failure with exit code.
- Kept: no server-side change. Live `claude` children keep their binary until respawn. `detectCliVersion` caches per process, so version-gated flags follow the old version until oc restarts (all gates <= 2.1.263 today, so no effect now).
- Risk: on Windows, npm replacing `claude.exe` while an oc chat's `claude` process runs may fail (file in use); the error toast shows npm's message. Not exercised.
- Verification: tui typecheck clean. No pane check: it would run a real `claude update` on the user's install. Live check is the user's.

### User
Command palette
- The `oc` section has a new "Update Claude Code" command (also `/updateClaudeCode`) that updates the Claude Code CLI and shows the result in a toast.
- Chats that are already running keep the old Claude Code until their process restarts; new ones use the update.

---

## 2026-10-08 (~00:44) - v0.2.119 - Haiku 5.5 in the Claude catalog, pane DB leak fixed, step 7 diagnostics - Opus 5.5, medium reasoning; Implementation

### Agent
- Meta: Opus 5.5; medium; Implementation; completed. Took over as leader from Sol/grok sessions; grok review fork held no review (copied history only).
- Version: 0.2.119
- Added `claude-haiku-5-5` to `models.ts` (1M/128K, reasoning, $0.10/$0.50, cache 0.01/0.125, `0.1×`). Base card only: config-path loader (`provider.ts` ~1557, also upstream) drops `cost.tiers`, so >100K prompts under-report 5x. User chose base-only.
- Fixed Sonnet 5 price: was $3/$15 (`3×`), CLI `tier_2_10` says $2/$10 (`2×`). Sonnet 5.5 cache read 0.2 -> 0.1 (halved at Haiku 5.5 launch, 2026-10-07).
- ERROR: pane suite wrote ~71 sessions into the user's real `opencode.db`. Cause: WezTerm `get_base_env` overlays `HKCU\Environment` (holds `OPENCODE_DB`) on every pane env. Fixed: `openPane` writes isolation vars to `set_environment_variables`; hello test asserts the fixture DB has a session. Leaked sessions left in place (user's choice).
- Added `hostEnv()` in `test/lib/cli-process.ts`: drops inherited `CLAUDE*`/`ANTHROPIC*` (keeps `CLAUDE_CODE_OAUTH_TOKEN`) at all spawn sites; `spawn` now `extendEnv: false`. Run from Claude Desktop, the entrypoint var added a background status request to the fake.
- Added `toolSummary` (flowReport.ts); step 7 deletion detail now shows before/after and each tool's command and result. Shared `switchModelStep`/`reportOnExit` in real-model.test.ts.
- Added `OC_REAL_ONLY=7` step-7-only real run (setup turn, restart, switch) and `OC_REAL_SWITCH_MODEL_ID`; defaults now Sonnet 5.5 / Haiku 5.5. `claudeRealFlow.ps1`: `-Step7`, `-SwitchModel`; token check on Haiku 5.5.
- Added fake scenario: restart, switch to Haiku 5.5, delete with PowerShell tool (Bash off Windows). Passes, so oc's restart+switch+shell path works; real step 7 failure (report 202610080413, Haiku 4.5) still unclassified, likely model behavior.
- Risk: installed CLI 2.1.288 has no Haiku 5.5 catalog entry; 2.1.294 (2026-10-08) likely does. Not verified.
- Verification: config-models + bridge 37 pass; flowReport 6 pass; fake-model 18 (17 + round trip rerun after env fix); pane 8 pass, real-DB leak count unchanged (71); acp lifecycle 6 and run-process 13 pass (shared harness); typecheck clean.
- MISTAKE: a debug-line restore copied from the wrong backup path; caught by grep, line removed, file confirmed identical to backup. Prevention: restore from the exact path used to back up, then check.

### User
Models
- Claude Haiku 5.5 is now in the Claude Code model list, priced at $0.10/$0.50 per million tokens and labeled 0.1×.
- Claude Sonnet 5 now shows its real price ($2/$10, 2×) instead of $3/$15, and Sonnet 5.5's cache reads cost $0.10 per million.
- Haiku 5.5 costs for prompts over 100K tokens show 5x too low, because oc's config does not carry price tiers yet.

Testing
- The TUI pane checks no longer save test chats into your real oc history.
- `.scripts\claudeRealFlow.ps1 -Step7` runs only the model-switch and file-delete step, for a few cents; `-SwitchModel` picks the model.
- The real flow now defaults to Sonnet 5.5 with a switch to Haiku 5.5, and the report says exactly which tool tried to delete the file and what happened.

---

## 2026-10-07 (~22:29) - v0.2.118 - Verify Claude flow stopping and cost accounting with fake runs - GPT-6.1 Sol, reasoning effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; reasoning effort not exposed; Implementation; completed
- Version: 0.2.118
- Added shared test-only `test/provider/claude-code/flowReport.ts`; real flow and fake scenarios use identical step runner, accounting, and Markdown writer. No test registration, auth reads, or process launch on import.
- Fixed refusal timing: checked prompts retain responses before detecting auth/usage rejection; stop before revert or follow-up. Compaction summary checked before follow-up. Dedicated blocked request row preserves earlier independent failures; child refusals checked at step completion.
- Fixed failure-path accounting: retain each prompt response before deletion, merge current SDK messages by ID, count latest version once even if body fails. Failed collection produces unavailable row and explicit error, preserving original failure; otherwise fails the step.
- ERROR: CLI `total_cost_usd` footer accumulates across turns AND survives server restart with the conversation. Previous v0.2.117 description as whole-turn cost was incorrect. User approved delta accounting; per-session ledger subtracts rounded cumulative observations, includes reverted spend, and resynchronizes without guessing after missing/decreased counters. Missing cost is unavailable/partial, not zero; known spend >$0.25 still flagged.
- Added 5 fast report checks and 3 fake report scenarios: refused step 5 does not revert or admit 6-8; reverted usage survives later failure; cumulative spend, compaction gaps, restart, and collection failures. Existing interrupt scenario now exercises checked prompts. Fake footer stats enabled explicitly without real mode.
- Negative evidence: baseline shared implementation failed stop timing, reverted-token retention, missing-cost rendering, deduplication, and case-insensitive refusal checks before repairs. Restart scenario exposed incorrect process-scoped cost baseline; fixed ledger to follow session instead.
- ERROR: pane verification twice failed cleanup after a child exited between CIM recheck and `Stop-Process`. User approved harness fix: tolerate only `NoProcessFoundForGivenId` with a confirming absent CIM lookup; other errors/reused IDs propagate. Added deterministic exited-child regression. Existing mux identity/tree checks kept.
- Verification: report + fake suites 22 pass / 164 expects (~228s); final pane suite 8 pass / 24 expects (~137s); final `bun run typecheck` exit 0. No live test-owned process candidates in scoped command-line inspection. No real-model run, saved-token access, oc build/install, commit, or push.
- Kept archive rotation deferred until user's commit, per handoff decision. Plan `.opencode/plans/claudeFlowReportChecks.md` completed; real-model steps 5-8 remain user acceptance.

### User
Claude flow reports
- Usage-limit and login refusals stop the flow immediately, before later prompts or revert actions.
- Tokens spent on reverted messages are retained even when a later operation fails.
- Cost estimates use changes in Claude's cumulative total instead of counting earlier spend repeatedly.
- Missing accounting is clearly marked unavailable or partial rather than shown as free.

Testing
- Fake runs verify the same reporting code used by the real flow, with no real tokens.
- Pane cleanup handles a test process exiting naturally while preserving its ownership checks.

---

## 2026-10-07 (~21:25) - v0.2.117 - Triage of real-model report 202610080054: token counts, duplicate error, usage-limit stop - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed
- Version: 0.2.117
- Report `claudeFlowReport-202610080054.md` (sonnet-4-5): steps 0-4 all pass. ERROR: 5-hour usage window ran out during step 5; steps 5-8 failures are Claude refusals, not oc. oc cost total $0.154 (step 0 $0.087 = first-turn cache write 23k; rest $0.01-0.03). Nothing expensive. Risk: those costs are last-call only, so step 1 (~10 calls) is understated.
- Fixed `turn-stream.ts` `message_delta`: numeric `usage` counts now merge into `lastCall`. Before, oc stored message_start's usage (output ~1-6 tokens; report showed output 3-6 for long replies). Fake scenario "claudeTestFlow tokens..." fails before, passes after.
- Fixed `turn-stream.ts` result handling: failed result's `result` text skipped when the turn already showed it (CLI sends API errors/usage limits as synthetic assistant reply AND result text). Report step 7 showed "You've hit your session limit" twice. Fake scenario "an API error the CLI reports twice shows once" + pane check of same name; both fail before, pass after.
- Changed `real-model.test.ts`: `BLOCKED` regex (auth 401/403, `out of usage`, `hit your X limit`) checked after every step, not only step 0; marks that step's failed checks `blocked`, adds oddity, stops the run. Report now has a `CLI cost` column (from `turnStats` footer, enabled for real runs via `chatConfig(..., { turnStats })`), a CLI cost total, and an `expensive:` oddity above $0.25 per step. Not run against the real model (user-triggered).
- ERROR (harness): fake step 7 failed under the Cursor/OpenCode agent shell: its `BASH_ENV` wrapper ran in front of the CLI's Bash tool (`rm` never ran; output `Select-String: command not found`). Fixed: `claudeEnv` sets `BASH_ENV: ""`. Not seen from a plain PowerShell.
- MISTAKE: piping `git show HEAD:file | Set-Content` in PowerShell dropped newlines (file broke, restored from copy). Use `git stash push -- <file>` / `git stash pop` to test pre-fix behaviour.
- Verification: fake-model 14 pass; tui-pane 7 pass (`OC_TUI_PANE=1`); `bun run typecheck` clean.

### User
Claude Code provider
- Token counts for each turn are now correct; before, output tokens showed as a handful even for long replies.
- When Claude refuses a request (usage limit, bad login), the message now appears once instead of twice.

Testing
- The real-model run now stops at the first usage-limit or login refusal and marks those checks "blocked", and the report shows Claude Code's own cost per step.

---

## 2026-10-07 (~20:45) - v0.2.116 - Safe token check before the real-model Claude flow - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed
- Version: 0.2.116
- ERROR: first user real-model run (`claudeFlowReport-202610080040.md`) failed every step on `401 Invalid bearer token`; screenshot shows `CLAUDE_CODE_OAUTH_TOKEN='<token>'` literally. A well-formed fake token gets a different message ("OAuth access token is invalid"), consistent with the literal placeholder. Report is useless; user may delete it.
- Added `.scripts/claudeRealFlow.ps1`: token from shell var, then DPAPI-saved copy (`%LOCALAPPDATA%\oc\claudeFlowToken`), then clipboard (whitespace stripped: setup-token wraps the token over two lines; clipboard blanked after), then `Read-Host -MaskInput`. Shape check `sk-ant-oat\d+-...`, refuses inside a Claude session or with `ANTHROPIC_BASE_URL/AUTH_TOKEN/API_KEY` set. One Haiku `claude -p --output-format json` in a temp `CLAUDE_CONFIG_DIR` proves login; saves token only after it passes. Then runs `real-model.test.ts` with `OC_REAL_MODEL=1`, restores env (`withEnv`), prints the newest report. Flags: `-CheckOnly`, `-NewToken`, `-Forget`, `-Model`.
- Verification: in a child pwsh: inside-Claude refusal, `<token>` rejected by shape (7 characters), well-formed fake token rejected by Anthropic 401 ($0); no saved file, no `ocTokenCheck-*` temp left. User then ran `-CheckOnly` with a real token: "Token OK (the prompt, check cost $0.0165)".
- Fixed: script no longer dot-sources `scriptHelper.ps1` (its `Set-Location $srcRoot` left the user's shell in `src`); caller's location now unchanged (checked).
- Fixed `real-model.test.ts` soft checks: step 0 now fails the run on an auth error (`Failed to authenticate` / `API Error: 401|403`), so the report stops there instead of 8 more steps of noise; step 4 "summary under Compacted" fails when the summary message has an error or starts with "Error during compaction"; step 7 "ocToolCheck.txt deleted" requires the file to exist before the step. Verified: `bun run typecheck` exit 0, file still skips without `OC_REAL_MODEL`. Not run against the real model (user-triggered).

### User
Testing
- New `.scripts\claudeRealFlow.ps1` checks your Claude token with one tiny request before the real-model flow, so a bad paste fails in seconds instead of producing a useless report.
- The token is never shown or put in your command history; once it passes it is saved encrypted for your Windows account so later runs need no paste.

---

## 2026-10-07 (~20:34) - v0.2.115 - Pane test cleanup anchored to its own mux server; Claude test tidy-up - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed (review-and-tidy pass)
- Version: 0.2.115
- Fixed `tui-pane.test.ts` Windows cleanup gap: root was found by PID alone at cleanup time, so a mux server that exited early with its PID reused would anchor the walk on an unrelated process. Now records the mux server's CIM creation time (`ToFileTimeUtc`) at spawn; cleanup requires the same identity before walking descendants (child created no earlier than its live parent, identity rechecked before each `Stop-Process`, CIM compared to CIM).
- Changed: mux server itself stopped via `server.proc.kill()` (Bun's process handle, PID-reuse-proof), not `Stop-Process`. Identity missing/changed, early mux exit, or script error: descendants left, release throws naming bun/claude as possibly still running.
- Added `powershell(script)` (EncodedCommand, `$ErrorActionPreference='Stop'`, nothrow) and `cimProcess(pid)` helpers in the pane test; acquire never throws after spawn, so release always runs.
- Added `chatConfig(llmUrl)` to `chat-fixture.ts`; `openChat` and pane test share it (removed duplicated proxyTools/todos config and double `testProviderConfig` call).
- Reviewed diff: production `session-manager.ts`/`session-sync.ts` import nothing from tests; no dead code or stale comments found in `llm-server.ts`/`cli-process.ts`.
- Added AGENTS.md Testing bullets: pane opt-in/launch/socket/160 cols/two-press Esc/`OPENCODE_DB`, cleanup rule, habit (fake-model scenario per Claude-provider feature, pane check when TUI output changes). Fixed stale "that file's `claudeEnv`" reference to `chat-fixture.ts`.
- Updated `claudeFlowHandoff.md`: stale Plan bullet now records the built harness; cleanup review; version and entry counts.
- Note: loud-failure path checked only by a read-only probe (missing PID -> pwsh exit 1 -> empty identity); not forced in a pane run.
- Verification: pane suite (`OC_TUI_PANE=1`) 6 pass / 20 expects (~120s); fake-model 12 pass / 93 expects (~141s); `bun run typecheck` exit 0. After each run, only pre-existing `claude.exe` 31260 (this session's host) remained; no test bun/claude/mux; `C:\ocTestTmp` absent. No real-model run, build, install, commit, or push.

### User
Claude Code testing
- The on-screen TUI checks now only stop processes they can prove they started, and fail loudly instead of guessing if they cannot.
- Project rules now describe how to run the TUI checks safely and say every new Claude feature needs a fake-model check.
- No change to oc itself.

---

## 2026-10-07 (~20:07) - v0.2.114 - Claude provider TUI pane targets verified - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.114
- Added five target tests to `test/provider/claude-code/tui-pane.test.ts`: Esc interrupt/clean next reply, question keys/answer delivery, todo sidebar, `/compact` divider, genuine rewind notice after `/undo` with identical replies. Kept original round-trip spike.
- Verified lone `\x1b` reaches TUI; first press shows "again to interrupt", second within 5s aborts by design. Screen shows "interrupted"; next reply excludes abandoned text. Fake-model TUI evidence for v0.2.110 `turnAbandoned`; real-model check pending.
- Verified v0.2.111 rewind notice through TUI `/undo`; no product fix needed this session.
- Changed pane fixture to `todos: true`, Question proxy, 160 columns; sidebar auto-hides at <=120. Todo assertions inspect rightmost 42 columns, not chat tool rows.
- Fixed Windows cleanup: snapshot live mux descendants, filter parent creation times, recheck CIM identity before stopping each leaf-first. Removed pane-only cleanup that left Claude holding cwd after hanging streams. Catch full timeout causes for screen diagnostics.
- MISTAKE: intermediate `taskkill /T` followed reused parent PIDs into unrelated test/shell processes; interrupted concurrent verification. Removed PID-only tree termination; reran both suites afterward.
- ERROR: comparing Get-Process.StartTime to lower-precision CIM CreationDate skipped termination and hung cleanup. Compare CIM creation times to CIM creation times. Stopped test-owned tree and reran successfully.
- Updated `claudeFlowHandoff.md`: target evidence, two-Esc behavior, cleanup lessons, 8 earlier entries plus this session. Open user decisions unchanged.
- Verification: pane suite 6 pass / 20 expects (~136s); fake-model suite 12 pass / 93 expects (~166s); `bun run typecheck` exit 0. No test mux/bun/claude processes or `C:\ocTestTmp` after completed runs. No real-model run, build, install, commit, or push.

### User
Claude Code testing
- Five new checks drive oc's real TUI against the fake model and verify interruption, question answers, todos, compaction, and provider notices on screen.
- Esc is a two-press action: the first press asks for confirmation, and the second interrupts.
- Test cleanup now stops its own child processes reliably without following reused process IDs into unrelated processes.
- No change to oc's provider behavior or your personal configuration.

---

## 2026-10-07 (~19:46) - v0.2.113 - TUI checks through a WezTerm pane (spike) and a skill-leak test fix - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed (spike approved by user via question form)
- Version: 0.2.113
- No `claudeFlowReport-*.md` yet; real-model run still pending, nothing to triage.
- Added `test/provider/claude-code/tui-pane.test.ts` (opt-in `OC_TUI_PANE=1`, skips without `wezterm-mux-server` or `claude`): test-owned headless `wezterm-mux-server --config-file` with `unix_domains` socket under `C:\ocTestTmp`; first pane runs `bun run --cwd packages/opencode src/index.ts <project>`; env = `isolatedEnv` + `claudeEnv` + file `OPENCODE_DB`, panes inherit it. `type` = `send-text --no-paste`; `waitFor` polls `get-text`, error carries the screen. `exit_behavior='Hold'` keeps crashes readable. Cleanup kills panes, then server.
- Exported `isolatedEnv` from `test/lib/cli-process.ts`.
- Fixed `fake-model.test.ts` "oc's claude-code provider round-trips a tool call": ran `opencode run` in bare fixture home (no git), skill walk reached real `~/.agents/skills/jev`, `expectIsolated` failed. Now `initRepo(home/work)` + `--dir`. This is the v0.2.110 "not reproduced under `opencode run`" leak.
- ERROR: bun must start in `packages/opencode` (bunfig preload for Solid JSX); from the project cwd oc dies with "Cannot find package 'react'".
- ERROR: oc sessions can inherit a dead GUI's `WEZTERM_UNIX_SOCKET` (`gui-sock-13932`); `wezterm cli` then auto-spawns `wezterm-mux-server --daemonize` and hangs. Use `--no-auto-start` and an explicit socket; drop `WEZTERM_PANE`.
- MISTAKE: ran `wezterm cli list` without `--no-auto-start`, which spawned a stray mux server (PID 25348). Stopped it and confirmed gone. Rule: always `--no-auto-start`.
- TODO: per-target pane checks (notices, Compacted divider, todo panel, question form, Esc interrupted); lone `\x1b` with kitty keyboard unverified.
- Verification: `tui-pane.test.ts` 1 pass (~16s, no leftover mux/bun/claude processes or `C:\ocTestTmp`); `fake-model.test.ts` 12 pass; `session-sync.test.ts` 4 pass; `bun run typecheck` clean.

### User
Claude Code testing
- A new opt-in check opens oc's real TUI in a hidden WezTerm pane, types a message, and confirms the fake model's reply shows on screen, without touching your WezTerm window or real database.
- A fake-model check that sometimes picked up your personal `jev` skill now runs in its own isolated project folder.
- No app or UI change.

---

## 2026-10-07 (~19:21) - v0.2.112 - Opt-in real-model run of the Claude test flow with a report - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed (real run not done: user-triggered only)
- Version: 0.2.112
- Added `test/provider/claude-code/real-model.test.ts`: skipped unless `OC_REAL_MODEL=1`. One chat through claudeTestFlow steps 0-8 on the real model (`OC_REAL_MODEL_ID`, default `claude-sonnet-4-5`; step 7 switches to `claude-haiku-4-5`). Soft checks per step; writes `claudeFlowReport-<yyyymmddhhmm>.md` at repo root (checks, tokens in/out/cache read/write, cost, seconds, oddities: notices, unexpected message errors, harness failures). Only harness failures fail the test; report written in a finalizer, so partial runs still report.
- Auth: user chose `claude setup-token` -> `CLAUDE_CODE_OAUTH_TOKEN`; temp `CLAUDE_CONFIG_DIR` under `C:\ocTestTmp`, real `~/.claude` untouched. `requireRealAuth` throws when the token is missing or `ANTHROPIC_BASE_URL`/`AUTH_TOKEN`/`API_KEY` are set.
- Decided against copying `~/.claude/.credentials.json`: OAuth refresh in the copy may invalidate the real login (unconfirmed, avoided).
- Kept step 1 without the flow's skill (1.6) and MCP (1.7) items; isolated home has neither. Step 1 answers the question "No" via `question.reply`; step 3 aborts after 2 tool rows; step 6 kills serve and resumes.
- Moved `openChat`, `claudeEnv`, `initRepo`, `outsideProfile`, `expectIsolated` to `chat-fixture.ts` (shared). `openChat` gained `real` and `modelID`; `claudeEnv(dir, llmUrl?)` omits fake URL/key when no URL.
- Note: fake `/v1/messages` reports 0 usage unless scripted, so token columns are 0 against the fake.
- Risk: run from a plain PowerShell; host `CLAUDE_*` vars from a Claude session would reach the child.
- TODO: user real run; maybe gitignore `claudeFlowReport-*.md`; WezTerm pane TUI checks.
- Verification: dry run of a scratch copy pointed at the fake (all 9 steps ran, report written, `C:\ocTestTmp` removed; scratch file and report deleted). Default run skips (1 skip). `fake-model.test.ts` 12 pass / 93 expects; `session-sync.test.ts` 4 pass; `bun run typecheck` exit 0. No real-model run.

### User
Testing
- A new opt-in test runs your whole Claude test flow against the real Claude model and writes a pass/fail report with token and cost numbers to the repo root.
- It only runs when you set `OC_REAL_MODEL=1` and a `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`; normal test runs skip it.
- No change to oc itself.

---

## 2026-10-07 (~19:12) - v0.2.112 - Claude test flow step 0 (CLAUDE.md reaches Claude) now automatic - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed (task 1 of 2; task 2 `OC_REAL_MODEL` design awaits user)
- Version: 0.2.112
- Added step 0 scenario to `test/provider/claude-code/fake-model.test.ts` (12 total): user CLAUDE.md at `<root>/claude/CLAUDE.md` (CLAUDE_CONFIG_DIR) and project `<root>/work/CLAUDE.md`; asserts both rule texts in request 1 and `expectIsolated` (real profile files absent).
- Added `outsideProfile` scoped temp root: Windows `C:\ocTestTmp\oc-*` (user approved this path 2026-10-07), parent removed when empty; else `os.tmpdir()`.
- Changed `claudeEnv`: sets `CLAUDE_CODE_DISABLE_CLAUDE_MDS` only when dir is under `os.homedir()`; outside the profile the CLI's parent-folder CLAUDE.md walk stays on.
- Changed `openChat(fixture, { resume?, root? })`: `root` holds `work` and Claude config dir; oc data/DB stay in fixture home.
- ERROR: cleanup EBUSY on `<root>/work`. Cause: serve finalizer `p.kill()` kills only bun; its `claude` child keeps project cwd ~0.5s. Bun `fs.rm` ignores `maxRetries`. Fixed with Effect retry 100ms x 50.
- Note: Claude Code reads user memory from `CLAUDE_CONFIG_DIR/CLAUDE.md` (confirmed by this scenario).
- Note: drive root `C:\` has no CLAUDE.md/AGENTS.md; keep it that way or step 0 will see extra files.
- Verification: `fake-model.test.ts` 12 pass, 93 expects (~120s); `session-sync.test.ts` 4 pass; `bun run typecheck` exit 0; `C:\ocTestTmp` absent after run. No real-model run.

### User
Testing
- The first step of your Claude test flow (your CLAUDE.md instructions reach Claude) now runs automatically against the fake model.
- That check uses a temporary `C:\ocTestTmp` folder during the run and deletes it afterward.
- No change to oc itself.

---

## 2026-10-07 (~18:54) - v0.2.111 - Revert now rewinds Claude even when replies repeat; flow steps 4-8 as fake-model scenarios - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed
- Version: 0.2.111
- Fixed `session-sync.ts`: exchange hashes are now `<position>:<hash>` (position = finished exchanges oc showed before it; `exchangePosition` map set in `syncClaudeSession` on a new exchange, read by `currentExchangeHash`). Before: a revert of a turn whose reply text equaled the previous reply ("noted", "noted") left oc's latest hash equal to the CLI's newest anchor, so no rewind and Claude kept the reverted message. Drift from anything else (compaction window, plugin pruning) still only skips the rewind.
- Risk: anchors saved in `claude-code/sessions.json` by older builds have no position, so the first revert after upgrading does not rewind (logs "no shared exchange"). New anchors are written from the next turn on.
- Added scenarios to `test/provider/claude-code/fake-model.test.ts` (11 total):
  - step 4 compact: `session.summarize`; asserts the summary request carries the codeword, next turn carries the summary, summary is the `summary` assistant message text, no "no conversation to compact".
  - step 5 revert: identical replies, `session.revert` on the second user message; asserts next request has no OSPREY-12, "Claude conversation rewound" notice, TodoWrite mirrored into `session.todo`. Failed before the fix.
  - step 6 restart: kill serve, reopen same session on a new serve; asserts history is real user/assistant/user (resumed, not a catch-up), no "conversation lost".
  - step 7 switch: second prompt on `claude-opus-4-5` variant `low`; Bash `rm` deletes the file; request models sonnet, opus, opus; codeword carried.
  - step 8 cache: two identical turns; system, tools, and message prefix of request 2 equal request 1 with `cache_control` stripped.
- Changed `openChat`: `todos: true` (opt-in config; without it oc disallows Claude's TodoWrite/Task* too), `OPENCODE_DB` file in fixture home (preload sets `:memory:`, which lost the session on restart), optional `resume` session id, returns `server`, `prompt(text, { modelID, variant })`.
- Found: user's shell has `OPENCODE_DB` = real `~\.local\share\opencode\opencode.db`; test preload overrides it to `:memory:` and the scenario now sets a fixture path, so the real DB is not touched.
- Found: user's `opencode.jsonc` has no `todos` key, so flow step 1.5/5 todo checks cannot pass live unless todos are enabled.
- TODO: step 0 still blocked (needs non-profile temp root); `OC_REAL_MODEL=1` report mode; WezTerm pane TUI checks.
- Verification: `fake-model.test.ts` 11 pass, 88 expects (~118s), no leftover `claude.exe`; `session-sync.test.ts` + `get-claude-user-message.test.ts` 23 pass; `bun run typecheck` exit 0. Negative-checked the revert fix (same scenario failed with OSPREY-12 still in history). Not live-checked in the TUI.

### User
Claude chats
- Undoing a message now always rewinds Claude's memory, even when Claude gave the same short reply ("Noted.") before and after it.
- The first undo after installing this build may not rewind Claude, because older saved chats lack the new position info.

Testing
- The rest of your Claude test flow now runs automatically against the fake model: compact, revert, restarting oc, switching model and effort, and a cache-friendliness check.
- Note: todo lists from Claude only show in oc when `"todos": true` is set, and your config does not set it.

---

## 2026-10-07 (~18:41) - v0.2.110 - Interrupted Claude replies no longer leak into the next turn; more flow scenarios - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed (same session as v0.2.110, no second bump)
- Version: 0.2.110
- Fixed `session-manager.ts`: added `ActiveProcess.turnAbandoned`, set in `interruptTurn` after the interrupt write, cleared in `settleTurn`. The stdout `rl` handler drops lines that arrive with no listener while it is set (read before `noteTurnLine` so the abandoned turn's own `result` is dropped too). Before: after Esc, the CLI's cut-off assistant text arrived with no listener, went to `unattendedLines`, and `replayUnattendedOutput` printed it at the start of the next turn's reply (claudeTestFlow step 3 "no leftover summary text"). Unattended output of non-interrupted turns (MCP client gave up, autonomous wake) still buffers and replays.
- Added scenarios to `test/provider/claude-code/fake-model.test.ts` (shared `openChat`: serve, git-inited `work`, `proxyTools: ["Task", "Question"]` like the user's config):
  - step 2 subagents: `mcp__opencode_proxy__task_batch` with two explore tasks; children routed by `pushMatch` on a token in their last message; each child reply `wait`s on `llm.wait(3)`, so it only finishes if both children call the model at once. Negative-checked (`wait(4)` hangs and fails). Asserts both results in one tool result, 2 child sessions.
  - step 1.8 question: proxied `question` tool, test polls `sdk.question.list`, replies `[["No"]]`; asserts `"Should I delete ocToolCheck.txt?"="No"` in the tool result Claude got.
  - step 3 interrupt: Read, then a reply that streams text and hangs; `session.abort` after 2 calls, then a new prompt. Asserts aborted message is `MessageAbortedError`, next request still has codeword and Read result, next reply is only the new text. Failed before the fix.
- Changed `TestLLMServer` `messages()`: returns `message_start` as head and the rest as tail, so `Reply.wait` holds content back (before, all lines were in head and `wait` held nothing).
- TODO: flow steps 4-8 (compact, revert, restart, model switch, cache); step 0 still blocked (needs non-profile temp root).
- Verification: `fake-model.test.ts` 6 pass (~46s); `unattended-replay`, `autonomous-turn`, `process-lifecycle`, `session-manager` tests 31 pass; `bun run typecheck` exit 0. Not live-checked in the TUI.

### User
Claude chats
- Pressing Esc mid-reply and then sending a new message no longer shows the cut-off reply's text at the start of the next answer.

Testing
- Three more steps of your Claude test flow now run automatically against the fake model: two subagents at once, Claude's question answered through oc's question form, and interrupting a reply then continuing the chat.

---

## 2026-10-07 (~00:12) - v0.2.110 - claudeTestFlow steps 1-2 as a fake-model scenario - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed (step 3 of agent-driven verification; same session as v0.2.110, no second bump)
- Version: 0.2.110
- Added flow case to `test/provider/claude-code/fake-model.test.ts`: `opencode.serve()` + `@opencode-ai/sdk/v2` client, `session.create` then two `session.prompt` turns on `claude-code/claude-sonnet-4-5`. Turn 1 scripts Write, Edit, Read, Bash; turn 2 asks the codeword. Asserts file on disk edited, 6 model calls, each tool result reaches the next call, turn 2 continues the same Claude conversation, CLI cwd = session directory, last text part, no "conversation lost", oc tool rows `write`/`edit`/`read`/`bash` completed.
- Fixed `TestLLMServer` Anthropic encoder: tool_use ids now `toolu_N` from a per-server counter. `Reply` numbers tools from `call_1` in every reply; the CLI dropped repeated-id history entries, so later tool results never reached the model. OpenAI paths unchanged (`processor-effect.test.ts` expects `call_1`).
- Fixed leak: CLI walks every parent of its cwd for CLAUDE.md (git repo or not; probed 2.1.288), and Windows temp is under the profile, so real `C:\Users\user\.claude\CLAUDE.md` reached requests. `claudeEnv` sets `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`.
- Fixed leak: under `serve`, oc's skill walk (`src/skill/index.ts` `.up` to worktree) found real `~/.agents/skills/jev` (seen as `oc:jev` in the CLI skill list). Flow case runs in a git-inited `work` subfolder. Not reproduced under `opencode run`; cause not traced.
- Added `expectIsolated(inputs)`: fails on real CLAUDE.md/AGENTS.md paths or real `~/.agents|.claude/skills` names as `oc:<name>:`. Negative-checked both leaks (removed the fix, saw the failure, restored).
- Found: git-init at the fixture home made each turn ~20s (snapshot scans `.cache/bun` transpiler cache in that home); subfolder fixes it. Test artifact, not a product slowdown.
- Added AGENTS.md Testing bullet on the Windows leak and the helpers to reuse.
- Risk: step 0 of claudeTestFlow (CLAUDE.md reaches Claude) cannot run under `CLAUDE_CODE_DISABLE_CLAUDE_MDS`; needs a different isolation (for example a project-level CLAUDE.md with a non-profile temp root).
- TODO: next flow steps (parallel subagents via proxy Task, question form, interrupt, compact, revert, restart, model switch); `OC_REAL_MODEL=1` report mode.
- Verification: `bun test test/provider/claude-code/fake-model.test.ts` 3 pass, 25 expects, ~21s; `bun run typecheck` exit 0. Scratch probes and dumps deleted, `Test-Path` False.

### User
Testing
- The first two steps of your Claude test flow now run automatically against the fake model: one chat, two messages, file write, edit, read, a shell command, and the codeword remembered on the second message.
- Fixed the fake model reusing the same tool id, which made Claude lose later tool results in multi-tool turns.
- Fixed the tests picking up your real `~/.claude/CLAUDE.md` and your personal skills; a check now fails if that ever happens again.

---

## 2026-10-06 (~23:52) - v0.2.110 - oc's Claude provider runs against the fake model - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed (step 2 of agent-driven verification; same session as v0.2.110 spike, no second bump)
- Version: 0.2.110
- Added `cliIt.live` case to `test/provider/claude-code/fake-model.test.ts`: `opencode run --model claude-code/claude-sonnet-4-5` in the CLI fixture's isolated home (`XDG_*`, `OPENCODE_CONFIG_CONTENT`, `OPENCODE_PURE`); built-in `ClaudeCodePlugin` still loads (only `OPENCODE_DISABLE_DEFAULT_PLUGINS` drops it) and spawns real `claude` against `TestLLMServer`. Asserts exit 0, final text, exactly 2 model calls (no title or side spawn consumed a scripted reply), tool result round trip, no unknown side requests.
- Added `claudeEnv()` shared by both cases: `ANTHROPIC_BASE_URL`, dummy key, temp `CLAUDE_CONFIG_DIR`, `DISABLE_AUTOUPDATER`, `USERPROFILE` (Windows `os.homedir()`; fixture sets only `HOME`, so `skill-plugin.ts`/`mcp-bridge.ts` would read real `~/.claude`/`~/.config`).
- Kept `opencode run` rather than `serve` for this step: same in-process server path, one call. `serve` + HTTP comes with step 3 (multi-turn).
- Risk: fixture uses `extendEnv: true`, so shell `ANTHROPIC_AUTH_TOKEN`/`CLAUDE_CODE_*` still reach the child; forced `ANTHROPIC_BASE_URL` keeps any real credential off api.anthropic.com.
- TODO: step 3 (claudeTestFlow.md steps 1-2 over `opencode.serve()` HTTP API).
- Verification: `bun test test/provider/claude-code/fake-model.test.ts` 2 pass, 10 expects (~10s); `bun run typecheck` exit 0.

### User
Testing
- A test now runs oc itself with the Claude provider against the fake model, so a full oc-to-Claude-to-tool-and-back turn is checked with no login and no tokens.
- That test keeps your real oc database, `~/.claude`, and home-folder settings out of the run.

---

## 2026-10-06 (~23:47) - v0.2.110 - Fake Anthropic model for Claude Code CLI checks - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed (step 1 spike of agent-driven verification)
- Version: 0.2.110
- Added `messages()` + `messageBlock()` in `test/lib/llm-server.ts`: Anthropic `/v1/messages` SSE (message_start, content blocks for text/thinking/tool_use, input_json_delta, signature_delta, message_delta stop_reason tool_use|end_turn, message_stop) from the same `Reply` flow; `eventLine` adds the `event:` name the Anthropic SDK dispatches on; no `[DONE]`.
- Changed `TestLLMServer.handle` to share one `sendAs` per mode; `reset` stays chat-only (as before, responses never supported it).
- Added catch-all `*` `/*` route that records `misses` (field was declared but never filled) and returns 404.
- Added `test/provider/claude-code/fake-model.test.ts`: real `claude -p` (2.1.288) against the fake via `ANTHROPIC_BASE_URL`, dummy `ANTHROPIC_API_KEY`, temp `CLAUDE_CONFIG_DIR`, shell `ANTHROPIC_*`/`CLAUDE_*` stripped; scripts thinking + Read tool + text; asserts result text, tool_result round trip, no unknown side requests. Skips without a CLI.
- Found: CLI side requests are only `HEAD /api/hello` (404 is fine); main call is `POST /v1/messages?beta=true`, stream true, 30 tools. Dummy key accepted. Tool ids `call_N` (no `toolu_` prefix) accepted.
- Added AGENTS.md Testing rule: agents may run fake-model scenarios unprompted; real-model runs user-triggered.
- TODO: step 2 (`opencode.serve()` + `CLAUDE_CONFIG_DIR` isolation for oc's Claude provider), step 3 (claudeTestFlow.md steps 1-2 as an HTTP-driven scenario). Later: rest of flow, `OC_REAL_MODEL=1` report mode, scenario-per-feature habit, WezTerm pane TUI checks.
- Verification: `bun test test/provider/claude-code/fake-model.test.ts` 1 pass; `bun test test/cli/run/run-process.test.ts` 13 pass; `bun run typecheck` exit 0.

### User
Testing
- The real Claude Code CLI can now run against a scripted fake model in tests, with no login and no tokens used.
- A new test proves a Claude turn can think, read a file with a tool, and reply, all inside a temporary folder that leaves your real `~/.claude` alone.
- Agents are now allowed to run these fake-model tests on their own; real-model runs still only happen when you start them.

---

## 2026-10-06 (~23:26) - v0.2.109 - Plugins section in the sidebar - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed, not live-checked
- Version: 0.2.109
- Added `Plugin.Status` schema and `Plugin.Service.status()` in `opencode/src/plugin/index.ts`: per-spec map filled from loader `missing` (no_entry), `error` (failed), `applyPlugin` success/failure; internal plugins recorded by function name minus `(Auth)Plugin`. Codex arrow wrapped as named `CodexPlugin` for that.
- Added `GET /plugin` (`plugin.status`) to instance HttpApi group + handler; regenerated legacy SDK (`client.plugin.status()`, `PluginStatus` type).
- Added `tui/src/feature-plugins/sidebar/plugins.tsx` (order 250, after MCP): merges server status with `api.plugins.list()` on `target`; TUI internals excluded; built-ins on one muted line; collapsed unless a plugin failed (open signal unset until clicked).
- Updated test fakes in `test/session/tools.test.ts`, `test/tool/registry.test.ts` with `status`.
- Added FORK.md row "Plugins in the sidebar" (low).
- Risk: server status is read once per TUI mount; failure on install stage uses spec as target, so it will not merge with a TUI half.
- Verification: `tsc --noEmit` clean in opencode and tui; `bun test` on the two edited test files: 21 pass. No live TUI check.

### User
Sidebar
- New "Plugins" section under MCP lists every plugin from `opencode.jsonc` and `tui.json` with its version and whether its server and/or TUI part loaded.
- Failed plugins show their error in red, and the section opens itself when anything failed; otherwise it stays collapsed as "Plugins (N)".
- Built-in plugins (Codex, Copilot, Cursor, and others) are listed on one muted line at the bottom.

---

## 2026-10-06 (~23:16) - v0.2.108 - Pass: live layout switch also updates prompt editing keys - Opus 5.5, low reasoning; Pass

### Agent
- Meta: Opus 5.5; low reasoning; Pass over this session's keybind layout + revive mark work; completed
- Version: 0.2.108 (bumped from 0.2.107 at user request to test the revive restamp; confirmed live: mark showed v0.2.108)
- Fixed: `registerOpencodeKeymap` (`packages/tui/src/keymap.tsx`) registered the textarea `input` layer once, so the palette layout switch left prompt editing keys (`ctrl+a`, `ctrl+d` delete, `ctrl+shift+up/down`, `left`) on the old layout until restart. Now wrapped in `createRoot` + `createRenderEffect` so it re-registers when `config.keybinds` changes.
- Reviewed, no change: preset resolution, jsonc persistence, keybind docs generator/check, revive restamp effect (verified live by user).
- Verification: tui typecheck clean; config/keymap/prompt-background tests 21 pass. Live layout switch in prompt not run.

### User
Keybinds
- Switching keybind layout from `ctrl+o` now also updates typing keys in the prompt right away, not only after a restart.

---

## 2026-10-06 (~23:11) - v0.2.107 - Revive mark shows the build that came back - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed
- Version: 0.2.107 (same session; not bumped again)
- Fixed: revive mark versions came from the old build (`mark()` in `reviveCommands`, app.tsx runs before exit), so after an install it showed the previous version (seen: "oc v0.2.106" after installing 0.2.107).
- Added `packages/tui/src/util/revive.ts` (`reviveVersions`, `reviveText`); `mark()` uses them.
- Added effect in `routes/session/index.tsx`: when the newest message is a user message with a revive part whose `metadata.versions` differs, `sdk.client.part.update` rewrites text + metadata. Older marks in history are left as is. Stops after one update (versions then match).
- Verification: `bun run typecheck` in packages/tui clean. No test (needs live server + session sync). Live check not run.

### User
Revive
- After a revive that installs a new build, the `[oc revived at ...]` line now shows the new version instead of the old one.

---

## 2026-10-06 (~23:06) - v0.2.107 - Keybind layout switch in oc palette - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed
- Version: 0.2.107 (same session as the preset entry below; not bumped again)
- Changed `TuiConfig.resolve` (`packages/tui/src/config/index.tsx`): builds both layouts up front (`resolveKeybinds`), `keybinds`/`keybind_preset` are getters over a solid signal, added `setKeybindPreset`. `useBindings` (`@opentui/keymap/solid`) re-registers inside `createEffect`, so the switch is live.
- Added command `oc.keybind_preset` ("Keybind layout", `/keybindLayout`, category oc) in `app.tsx`; `persistKeybindPreset` writes `keybind_preset` to global `tui.jsonc` or `tui.json` with jsonc-parser `modify`/`applyEdits`.
- Added `jsonc-parser` 3.3.1 to `packages/tui/package.json` (same version as core/opencode); `bun install` added one bun.lock line.
- Risk: a project-level tui.json `keybind_preset` overrides the saved global value on next start.
- Verification: tui config/keymap/prompt-background tests 21 pass; `bun run typecheck` clean in tui and opencode; keybind docs `--check` exit 0. Live palette check not run.

### User
Keybinds
- `ctrl+o` now has **Keybind layout** to switch between the oc and opencode layouts; it takes effect at once and is remembered.

---

## 2026-10-06 (~23:01) - v0.2.107 - Keybind layouts (oc / opencode) and keybind docs - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation (from spit plan `.opencode/plans/keybindPresets.md`); completed
- Version: 0.2.107
- Reverted `app_exit`, `input_move_up/down` in `packages/tui/src/config/keybind.ts` to upstream values; keybind.ts now differs from upstream only by oc-added commands (+ existing `selection_copy_mode` swap).
- Added `packages/tui/src/config/keybindPreset.ts` (`TuiKeybindPreset.oc`, `Names`): user's tui.json layout minus `ctrl+c` exit; replaced leader keys kept alongside (`ctrl+m,<leader>m`, `ctrl+s,<leader>l`, `ctrl+b,<leader>down`).
- Added `keybind_preset` (`oc` | `opencode`) to `TuiConfig.Info`; `resolve` spreads preset then user `keybinds`.
- Kept `ctrl+d`: preset drops it from `input_delete`/`stash_delete`; session list dialog bindings use `priority: 1` (`ui/dialog-select.tsx`) so delete wins there.
- Added `packages/tui/script/keybindDocs.ts` (writes tables between markers in `docs/keybinds.md`; `--check` exits 1 if stale) and `docs/keybinds.md` hand-written intro. `.scripts/prePush.ps1` runs the check.
- Moved app_exit no-ctrl+c assertion from `test/terminal-win32.test.ts` to preset test in `test/config.test.tsx`.
- Kept: oc-added defaults colliding with upstream in other scopes (`ctrl+return` newline vs background submit, `ctrl+n`, `ctrl+f`, `shift+up/down`) unchanged; pre-existing behavior.
- Updated README keys section, FORK.md row "Keybind layouts".
- TODO user: delete `keybinds` block from `~/.config/opencode/tui.json` (its `app_exit: ctrl+c,<leader>q` re-enables ctrl+c quit).
- Verification: `bun test` config, terminal-win32, prompt-background, keymap (22 pass); `bun run typecheck` in packages/tui clean; generator write + `--check` exit 0. Live TUI check not run.

### User
Keybinds
- oc now has two key layouts: `oc` (default, your layout) and `opencode` (stock OpenCode keys), chosen with `"keybind_preset"` in `tui.json`.
- In the oc layout `ctrl+m` opens models, `ctrl+s` sessions, `ctrl+d` cycles the variant, and `ctrl+c` clears the prompt instead of quitting.
- The opencode leader keys (`ctrl+x m`, `ctrl+x l`) still work in the oc layout.
- New `docs/keybinds.md` lists every key for both layouts and stays in sync automatically.

---

## 2026-10-06 (~22:27) - v0.2.106 - Sidebar top position toggle - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed, unverified
- Version: 0.2.106
- Added kv `sidebar_position` ("right" | "top") and palette command `session.sidebar.position` in `tui/src/routes/session/index.tsx`; top mode switches the session root box to column, renders `Sidebar` first, skips the narrow-overlay path, and no longer subtracts 42 from `contentWidth`.
- Changed `sidebarVisible` auto rule: top mode shows even when not `wide()`.
- Added `horizontal` prop to `Sidebar` (`sidebar.tsx`): full width, maxHeight 12, content box row + wrap, footer row. Vertical scrollbar hidden in horizontal mode (track clashed with message scrollbar, user screenshot).
- Moved: toggle from Session command `session.sidebar.position` to oc settings command `oc.sidebar_position` ("Sidebar position", right/top select, `/sidebarPosition`) in `app.tsx`; session view reads the same kv key.
- Added: positions `left` and `bottom`; command titled "Sidebar position (WIP)". Left renders before messages on wide terminals; narrow left falls back to the right-aligned overlay. Bottom renders the horizontal bar after the messages/prompt.
- Cleaned: `index.tsx` placement collapsed to `sidebarLeading` memo (top, wide left) + one trailing Switch; narrow-left overlay now opens on the left (`alignItems` flex-start). `sidebar.tsx` horizontal: rowGap 1 between wrapped rows, no scrollbar padding, footer gap 3 to match sections. `bunx tsc --noEmit -p .` in `packages/tui`: exit 0.
- TODO: `SidebarTools` fragment sections and the `sidebar_content` slot still stack plugin outputs in one column; give sections fixed widths if the bar looks cramped.
- Verification: skipped; `tsc` unavailable in this worktree (no node_modules). Needs live check.

### User
Sidebar
- The command palette has a new "Move sidebar to top" / "Move sidebar to right" toggle, and the choice is remembered.
- At the top, the sidebar becomes a horizontal bar of at most 12 rows that scrolls when its content is taller.

---

## 2026-10-06 (~22:18) - v0.2.105 - /work and /done session worktrees - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed
- Version: 0.2.105
- Added `/work` (`session.work`) in `tui/src/component/prompt/index.tsx`: `usePromptMove.work()` runs the existing new-copy move flow with `workFrom` = session directory, so `ProjectCopy` git_worktree creates `<parent>\<repo>.work-<generated name>` (detached HEAD) and the session moves there.
- Added `/done` (`session.work.done`): `usePromptMove.done()` calls new `v2.projectCopy.merge`, moves the session back via extracted `moveTo`, then `projectCopy.remove` with force. Failure leaves the session in the copy and shows a toast.
- Added `Git.worktree.merge` (core `git.ts`): refuses if main has tracked changes, snapshots the copy with `add -A` + `write-tree` + `commit-tree` (no hooks), runs `merge --squash` in main, and rolls back with `reset --merge` on failure. `WorktreeError.operation` gains `merge`.
- Added `ProjectCopy.merge` (core `project/copy.ts`; only `git_worktree` copies), `ProjectCopy.MergeInput` (schema), the `projectCopy.merge` endpoint (protocol + server handler), and regenerated `packages/client` and the legacy JS SDK.
- Kept: the old `opencode/src/worktree` service is unused by this feature; the TUI move flow already uses `ProjectCopy`.
- Risk: the Claude Code subprocess cwd after a move is untested; Windows file locks can make the forced remove fail after a successful merge (changes are staged in main already; delete the copy from /move).
- Verification: `tsgo --noEmit` in core, protocol, server, tui passed; new core `git.test.ts` merge test plus the existing worktree test pass. No live TUI run.

### User
Sessions
- `/work` moves the current session into a git worktree next to the repo (for example `GitHub\oc.work-<name>`), so the agent's edits stay out of your real checkout.
- `/done` squash-merges everything from that worktree into your real checkout as staged, uncommitted changes, moves the session back, and deletes the worktree.
- `/done` refuses if your real checkout has uncommitted changes, and if the merge conflicts it changes nothing and keeps the session in the worktree.

---

## 2026-10-06 (~22:02) - v0.2.104 - bgRun on/off toggle in the oc palette - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed
- Version: 0.2.104. Skipped 0.2.103 because the user's installed build is labeled 0.2.103 and has the reverted bg-marker code, so reusing the number would hide which build is which.
- Added palette entry `oc.bgrun` "bgRun tool" (`/bgRun`, category oc) in `tui/src/app.tsx` after `oc.markers`: on/off `DialogSelect`; writes global `permission.bgRun`, `bgStatus`, `bgKill` = `allow`/`deny` together through `sdk.client.global.config.update` (`patchJsonc` keeps comments in `opencode.jsonc`). Current state is read from merged `sync.data.config.permission`; a string `permission` counts as on.
- On/off state is read from `bgRun` only.
- Risk: `Permission.disabled` hides the tool only when the last matching rule is a `*` deny; an agent profile with its own `bgRun`/`*` allow after the global rules would keep it visible. Global config update reloads config, which can interrupt active sessions on this server (same as the todos toggle).
- Verification: `bun typecheck` clean in tui. No live check (needs user build).

### User
oc settings
- New "bgRun tool" toggle in the oc section of the command palette (or `/bgRun`) turns the background-job tool on or off for agents.
- Off hides bgRun, bgStatus, and bgKill from agents entirely.

---

## 2026-10-06 (~21:59) - v0.2.102 - Background markers abandoned and reverted - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed (revert)
- Version: 0.2.102 (the 0.2.103 bump below was undone; no net code change this session)
- Removed: everything in the two v0.2.103 entries below (`bg` mode, `args`, `pointer`, batching, `Marker.setWake` in `prompt.ts`, `EffectBridge` in `processor.ts`, template comment, tests). `git checkout` restored `marker.ts`, `processor.ts`, `prompt.ts`, `markers-file.ts`, `marker.test.ts`, and `.version/version` to HEAD. Markers are back to v0.2.97-v0.2.102 behavior (inline / window / afterTurn).
- Reason: user judged the token savings not worth pursuing. Live tests: answers right, no savings vs bash; wake turns often missed the prompt cache. Plan marked ABANDONED: `~/.config/opencode/plans/2026-10-06-marker-bg-pointers.md`.
- Kept: `~/.config/opencode/markers.json` stray-`}` fix. Removed test markers (`timeBg`, `gitLogBg`, `diskBg`) and the bg/args header comments. Deleted the scratch script `plans/markerTokens.ts`.
- Risk: markers.json names `build-oc`, `buildDebug-oc`, `prePush-oc` fail the `NAME` regex (no `-`) and are silently skipped.
- Not done: the requested TUI shell-mode toggle and bash blocking, which the user cancelled mid-discovery.
- Verification: `bun test test/marker/marker.test.ts` 9 pass on reverted code; `git status` shows only `buildNotes.md` modified.

### User
Agent commands
- The background-marker experiment was removed. Command markers work exactly as before.
- Your markers.json keeps the bracket fix, and the test commands were removed.
- Commands with a `-` in their name (like `build-oc`) are still ignored; rename them (for example `buildOc`) if you want them to work.

---

## 2026-10-06 (~21:53) - v0.2.103 - Batch bg marker pointers and tighten pointer content - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed (follow-up to the v0.2.103 entry below, same session, no extra bump)
- Version: 0.2.103
- Live results (user build, 4 sessions via `~/.config/opencode/plans/markerTokens.ts`): bg markers worked and answers were correct, but saved no tokens. 3 of 5 wake turns had `cache.read = 0` (full uncached context). Two pointers 0.4 s apart gave 2 wake turns. git log pointer tail and error matches (commit text "fail") were useless. Agents ran the same command through bash next to the marker.
- Added `deliver` in `marker.ts`: per-session 1.5 s sliding batch (`BATCH_MS`); pointers that finish together are joined into one wake message.
- Changed `pointer`: shows first 2 + `...` + last 3 lines when more than 5 lines; error-line matches only when exit is not 0.
- Changed marker prompt: use the marker instead of running the same command through a tool; after bg markers end the reply and wait for the pointer.
- TODO: cause of wake-turn cache misses still unknown (possibly a request less than 1 s after the previous one, before the provider stores the cache). Re-measure after this batch change. Busy-session wake is still not live-tested (the test 3 pointer arrived after the reply ended).
- Verification: `bun test test/marker/marker.test.ts` 13 pass (new: batching, pointer head/tail, no matches on exit 0); `bun typecheck` clean in opencode.

### User
Agent commands
- Background commands that finish at the same time now report back in one message, so the agent answers once.
- The result summary now shows the first and last lines of output, and only lists error lines when the command failed.
- Agents are told to use a marker instead of also running the same command themselves, and to wait for the result before answering.

---

## 2026-10-06 (~20:57) - v0.2.103 - Background command markers with short pointer messages - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed
- Version: 0.2.103
- Plan: `~/.config/opencode/plans/2026-10-06-marker-bg-pointers.md` (Progress has deviations).
- Added `marker.ts` mode `bg`: `runBg` spawns with stdout+stderr to one fd at `Global.Path.log/markers/<session>/<name>-<id>.log`; on exit builds `pointer()` (status line, last 3 lines, up to 5 `error|fail|exception` lines numbered, 160 chars/line, 600 total) and calls `done`. bg default timeout 600 s (inline stays 30 s).
- Added `args: true` per command: `LINE` regex now captures `name args...`; `find` returns keys (full marker body), new `parse(key)` splits name + args (`"quoted"` or whitespace words, no shell). Args on a command without `args` -> `name: takes no arguments`.
- Added wake path: `Marker.setWake/wake` registry; `SessionPrompt` layer registers a handler calling `prompt()` with a synthetic text part and the assistant's agent (model from `currentModel`). `processor.runMarkers` now takes agent, makes an `EffectBridge`, and forks `Marker.wake` from the bg exit callback. Busy loop picks the message up via `ensureRunning`; idle session restarts.
- Updated marker agent prompt (bg, args, "trust pointer, grep log, never read whole log") and the markers.json template comment in `core/src/util/markers-file.ts`.
- Changed user `~/.config/opencode/markers.json`: fixed extra trailing `}`, added `timeBg`, updated header comments.
- Risk: markers.json names `build-oc`, `buildDebug-oc`, `prePush-oc` fail `NAME` (`-` not allowed) and are silently skipped. Not renamed (user file).
- Risk: wake in a session that is busy relies on `ensureRunning` joining the running loop; not live-tested. No pointer batching for many bg runs finishing together.
- Verification: `bun test test/marker/marker.test.ts` 12 pass (new: args parse, pointer format/cap, bg log + pointer); `test/session/processor` 17 pass; `bun typecheck` clean in opencode and core. No live check (needs user build).

### User
Agent commands
- Markers have a new `bg` mode that runs a command in the background and saves its output to a log file.
- When a background command finishes, the agent gets a short message with the exit code, the last few lines, any error lines, and the log path, so it does not have to read the whole output.
- A command with `"args": true` lets the agent add words after the marker name, passed straight to the program without a shell.
- Your markers.json had a stray `}` that is now fixed, and a `timeBg` test command was added.
- Commands with a `-` in their name (like `build-oc`) are ignored; rename them (for example `buildOc`) to make them work.

---

## 2026-10-06 (~19:38) - v0.2.102 - Compose slash commands and finish picker recovery - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed, installed acceptance pending
- Version: 0.2.102
- Added legacy SessionPrompt.CommandInput.additionalCommands and generated SDK field; TUI submits command names with remaining user request instead of concatenating later templates into primary arguments. Authoritative registry snapshot resolves ordered unique definitions; validates missing names and secondary agent/model/subtask routing before expansion. Primary routing/plugin/event identity retained.
- Composed original command bodies in labeled user-level blocks for one prompt turn; shared arguments independently expand each template. Preserved single-command append behavior, shell expansion, and existing attachment resolution. No current Protocol/packages/server contract changed.
- Fixed cursor-local picker completion and Escape through shared slashTriggerIndex: fresh text/cursor offsets prevent stale Unicode/multiline ranges. Open menu retargets on replacement; invalid triggers close without deleting text. Completion moves past existing space and closes rather than reopening the same token. Later pickers exclude native TUI actions.
- Added rejected-command toast/draft recovery and exact-token extraction with ordered deduplication and preserved whitespace/unknown paths. Updated existing FORK.md palette row. Archived completed plan at `.opencode/plans/archive/slashCommandComposition.md`; Grok source-grounded diagnosis and corrected offset arithmetic retained.
- Verification: final `bun test --timeout 30000 test/component/slashMenuLayout.test.tsx test/prompt/slash.test.ts` from `src/packages/tui`: 3 pass, 0 fail, 56 assertions. Real Autocomplete renderer covers multi-token selection, Unicode/multiline cursor completion, open-buffer replacement, unchanged Escape assertion, backspace/reopen, layout/scrolling, Home and mention modes.
- Verification: final `bun test --timeout 30000 test/session/prompt.test.ts --test-name-pattern "slash composition"` from `src/packages/opencode`: 3 pass, 61 filtered, 0 fail, 37 assertions. Actual model input covers ordering, deduplication, shared placeholders, shell expansion, primary model/variant, single-command behavior, and validation before shell side effects.
- Regenerated legacy SDK earlier through canonical `packages/sdk/js/script/build.ts`: generation and included SDK TypeScript compilation succeeded. Preserved concurrent todo-capability output; no oc build/install/push or broader checks run.
- Coverage limit: production extraction and server model delivery checked separately; no full Prompt mount, lazy MCP-specific regression, or installed model-adherence acceptance claimed. User live check: pick `/spit`, then `/think`, submit concrete issue, confirm discussion plus plan and no implementation.
- MISTAKE: initial renderer used pressKey("tab"), inserting literal text; replaced with dedicated key methods. Fuzzy-ranking assumption replaced with unique partial query. Server fixture names spit/think collided with global user commands; use unique names. Initial work stopped at verification limit, then resumed with user authorization; do not weaken assertions to bypass failure.

### User
Slash command combinations
- `/spit /think` combines both instructions into one agent turn, with your request kept separate.
- Picking another slash command preserves earlier commands and surrounding text.
- Completion and Escape now work after multiline or Unicode input without leaving command fragments.
- All six focused checks passed; installed discussion-and-plan behavior remains a live check after rebuilding.

---

## 2026-10-06 (~19:32) - v0.2.101 - Default-off todos and palette toggle - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed, installed acceptance pending
- Version: 0.2.101
- Added optional native config `todos`; only true enables. `ToolRegistry.all()` filters exact `todowrite` from built-in/custom entries before model permission filtering. Explicit agent allow cannot bypass disabled capability; enabled capability retains existing permissions.
- Added reactive `oc.todos.toggle` in full/oc palettes through `tui/src/todos.ts`. Confirmed global SDK patch preserves normal config precedence; pending guard waits for successful global-disposal bootstrap, including SSE-before-PATCH-response ordering. Unchanged global defaults refresh directly and report project overrides. Cancel/write errors preserve effective state.
- Disabled Claude TodoWrite/TaskCreate/TaskUpdate/TaskGet/TaskList when v1 host omits todowrite; skipped saved-task reads and synthetic mirrors. Existing catalog hash already retires old enabled process; no new lifecycle mechanism. Kept v2 host dialect behavior, dispatch tools, Cursor plan paths, stored lists, and transcript rows. Cursor advertisement guard verified unchanged.
- Gated built-in todo sidebar on same reactive config; documented scope/reload behavior in FORK.md. Plan `.opencode/plans/ses_eecb91537ffeIWQKJRaJofI9a9.md` records implementation and installed acceptance.
- Verification: from `src/packages/opencode`, `bun test --timeout 30000 test/tool/registry.test.ts test/config/config.test.ts test/provider/claude-code/subagent-hint.test.ts test/provider/claude-code/fundamental-tools.test.ts test/provider/cursor.test.ts --test-name-pattern "todo capability|todo native tools|native tools follow|disabled todos|TodoWrite calls|task tool turns|oc-only proxies execute|todo display updates"`: 14 pass, 177 filtered, 0 fail, 79 Bun assertions plus node assertions.
- Verification: from `src/packages/tui`, final `bun test --timeout 30000 test/todos.test.tsx`: 1 pass, 0 fail, 26 assertions. Mounted production command, both palettes, SDK/sync, and confirmation with real renderer; covered cancel, save failure, duplicate guard, reload-before-response, confirmation-time unrelated reload, project override/no-op, and another TUI's config event.
- Generated clients with `bun run generate` from `src/packages/client` (no tracked output changes). Regenerated legacy SDK through isolated temp adaptation of canonical generator; added `Config.todos`, preserved concurrent agent's additionalCommands output. Skipped SDK tsc/dist build tail; no builds, installs, broader checks, or pushes run.
- Coverage limit: registry test exercises real registry plus existing permission helper, not a complete remote model request. Sidebar condition, installed persistence, real Claude CLI flags, and Cursor service behavior still need user's installed acceptance.
- MISTAKE: first isolated SDK attempt expected another agent's transient openapi.json, which disappeared during their regeneration; second used replacement text containing `$\`` and JavaScript expanded the replacement prefix, producing invalid scratch code. Corrected optional preservation and callback replacement; final generation passed without touching shared OpenAPI path. Use callback replacement for generated shell template strings.
- MISTAKE: issued invalid noop Task call; tool rejected unknown agent type and no subagent ran. Do not call Task without user/rules authorization or a real assignment.

### User
Todos
- Todos are disabled by default, including for agents that explicitly allow the todo tool.
- Enable todos or Disable todos is available in the command palette's oc category and persists the global preference.
- Disabling hides the sidebar list and stops todo tools and provider mirroring without deleting saved lists.
- The toggle confirms a configuration reload; project settings can override the global default.
- All 15 focused checks passed. Rebuild/install, then confirm the toggle and persistence in the installed TUI.

---

## 2026-10-06 (~19:05) - v0.2.100 - Word and line mouse selection - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed, installed acceptance pending
- Version: 0.2.100
- Upgraded matched OpenTUI core/keymap/Solid to 0.5.14 for native double-click words, triple-click logical lines, and granularity-aware dragging. Upgraded SolidJS to required 1.9.12; migrated cleanup patch, removed transition hunk now provided upstream. Lockfile changes limited to dependency graph.
- Fixed shared selection copy: retains highlight, serializes native clipboard writes per service, checks public MouseEvent.isDragging for automatic release copying, intercepts selection Ctrl+C/Escape in both modes. Dialogs reuse shared policy; outside click dismisses retained selection correctly.
- Moved user-message dialog action to visible Actions control; expand/collapse to explicit tool controls; block file actions to headers/Open file; inline tool actions to icon. Kept bodies selectable and explicit links/path controls nonselectable. Triple-click selects logical lines, not linguistic sentences.
- Added focused real-renderer coverage: native words/wrapped lines/word dragging/repeat timeout, root copy helpers, both modes, modal copy/dismissal, prompt replacement, streaming Markdown, wide/combining Unicode, production InlineToolRow body/action separation, clipboard ordering/errors, all six patched Solid runtime files' syntax and reentrant cleanup.
- Verification: `bun test --timeout 30000 test/component/textSelection.test.tsx` from `src/packages/tui`: 5 pass, 0 fail, 92 assertions. Dependency installation completed with lifecycle scripts disabled. No broader checks, builds, installs, or pushes run.
- Push verification: focused selection checks passed again (5 tests, 92 assertions); `.scripts/prePush.ps1` passed 27/27 typecheck tasks (17 cached) and refreshed README/scc.txt to 516,043 code lines.
- Coverage limit: root fixture exercises production helpers/registration, not full App. Full Session/UserMessage/BlockTool and full prompt paste-placeholder transform remain live checks; installed resize/scroll/streaming interaction needs acceptance. Plan `.opencode/plans/textSelection.md` records execution and pending acceptance.
- MISTAKE: stale Solid patch offsets inserted cleanup statements into unrelated code despite successful dependency installation. Corrected version-specific offsets; syntax checks now cover all six patched files. Do not migrate Bun patches by changing package version alone.
- MISTAKE: fixture accessed KV before async mount and used binding `run` instead of `cmd`; corrected readiness wait and actual keymap API before final passing run.

### User
Text selection
- Double-click selects a word, triple-click selects a wrapped logical line, and dragging can extend by whole words or lines.
- Copying keeps the highlight visible; Ctrl+C copies and Escape clears selection in either copy mode.
- Message actions and tool controls are separate from selectable text so the first click does not interrupt selection.
- Focused renderer checks passed. Rebuild/install and confirm the gestures and new controls in WezTerm.

---

## 2026-10-06 (~18:40) - v0.2.99 - Keep chat above the slash menu - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed, installed acceptance pending
- Version: 0.2.99
- Moved single `Autocomplete` before prompt anchor; session `/` uses normal flex flow so chat viewport shrinks above menu. Kept Home `/` and session `@` as overlays; hidden prompt hides menu. No server or session-route changes.
- Capped inline menu including favorites footer at one third of terminal height; retained ten-option maximum and one-row no-match result; suppressed footer when budget only fits one option row.
- Fixed overlay tracker to include anchor-parent coordinates; parent can move while anchor stays at same screen position. Reused existing 50ms timer.
- ERROR: installed OpenTUI `updateYogaPosition` ignores undefined edges; inline top/left must use `"auto"` to clear old overlay offsets.
- MISTAKE: initial regression used `pressKey("escape")`, which sends literal text. Replaced with `pressEscape()` and explicit Kitty keyboard test mode; failure was test input, not a confirmed production Escape defect. Renderer pass-count wait also did not wait for async provider mount; reused existing fixture wait helper.
- Added real `Autocomplete` renderer regression with actual context providers and existing SDK transport fixtures. Covered geometry, appended completion, filtering/no matches, Escape/restored space, manual scroll preservation, short-terminal resize, Home/mention overlays, and hidden prompt.
- Verification: `bun test --timeout 30000 test/component/slashMenuLayout.test.tsx` from `src/packages/tui`: 1 pass, 0 fail, 37 assertions. No broader checks, build, install, or push run for this fix. Earlier agent-push stopped at failed check.
- Push verification: focused renderer check passed again (1 test, 37 assertions); `.scripts/prePush.ps1` passed 27/27 typecheck tasks (26 cached) and refreshed README/scc.txt to 515,743 code lines.
- Coverage limit: bounded chat/dock fixture mounts production autocomplete, not full session route or prompt; installed streaming/sidebar/favorites appearance remains user live check. Plan `.opencode/plans/ses_eecb7836dffe9C8pfxuxyhDYEQ.md` records prior stop and resolution.

### User
Slash-menu layout
- Opening `/` in a session leaves the latest agent output visible above the menu instead of covering it.
- The chat area restores when the menu closes, and reading older messages does not force a jump to the bottom.
- The menu is shorter on small terminals; Home and mention pickers retain their overlay layout.
- The focused renderer check passed; installed appearance still needs a live check after rebuilding.

---

## 2026-10-06 (~18:08) - v0.2.98 - Scoped slash-favorites review and cleanup - GPT-6.1 Sol, effort not exposed; Cleanup

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Cleanup; completed, session-scoped
- Version: 0.2.98; retained once-per-session revision bump
- Reviewed session-owned slash favorite identities, KV reads/writes, targeted keyboard layer, ordering, marker/footer layout, caller integration, tests, and documentation. No confirmed functional defect found; unrelated sidebar changes excluded.
- Simplified `orderSlashFavorites`: stable favorites-first partition replaces redundant second alphabetical sort; `commands` already sorts input. Updated test to use caller's alphabetical order; added empty/all-favorite checks. Kept U+2B29 indicator and fuzzy-search path.
- Verification: `bun test --timeout 30000 test/component/autocomplete.test.ts test/keymap.test.tsx --test-name-pattern "slash favorite|native slash favorite"` from `src/packages/tui`: 3 pass, 2 filtered out, 0 fail, 14 assertions.
- Push verification: same focused checks passed again (3 tests, 14 assertions); `.scripts/prePush.ps1` passed 27/27 typecheck tasks (26 cached) and refreshed README/scc.txt to 515,518 code lines.
- Coverage limit: keyboard check exercises real keymap/textarea with a test handler, not full `Autocomplete`; toggle selection retention and disk reload remain live checks. No build run. Shared KV inter-instance behavior predates session and was not changed.

### User
Slash-favorites cleanup
- Favorites now reuse the menu's existing alphabetical order instead of sorting twice.
- Scoped checks passed; no confirmed functional bug was found.
- The full live check remains: toggle a favorite twice, confirm the highlight stays on it, then restart and confirm a saved favorite remains.

---

## 2026-10-06 (~18:05) - v0.2.98 - Smaller solid diamond for slash favorites - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed
- Version: 0.2.98; retained once-per-session revision bump
- Changed slash favorite marker from U+25C6 to small black diamond U+2B29 (`⬩`) at user request; updated FORK.md wording. Supersedes solid-diamond glyph choice below.
- Verification: literal-only replacement; no checks introduced or run. Installed glyph size depends on terminal font; appearance pending rebuild.

### User
Slash-menu favorites
- Favorites now use the smaller solid diamond (`⬩`).

---

## 2026-10-06 (~18:03) - v0.2.98 - Solid diamond for slash favorites - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed
- Version: 0.2.98; retained once-per-session revision bump
- Changed slash favorite marker from hollow diamond U+25C7 to solid diamond U+25C6; user found installed hollow glyph odd. Updated FORK.md wording; supersedes hollow-diamond choice below.
- Verification: literal-only replacement; no checks introduced or run. Installed solid-diamond appearance pending rebuild.

### User
Slash-menu favorites
- Favorites now use a solid diamond (`◆`).

---

## 2026-10-06 (~18:01) - v0.2.98 - Hollow diamond for slash favorites - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed
- Version: 0.2.98; retained once-per-session revision bump
- Changed slash favorite marker in `tui/src/component/prompt/autocomplete.tsx` from star U+2605 to hollow diamond U+25C7 at user request; updated FORK.md wording. Follows slash-favorites entry below.
- Verification: inspected literal replacement; no checks introduced or run for glyph-only change. Installed appearance pending rebuild.

### User
Slash-menu favorites
- Favorites now use a hollow diamond (`◇`) instead of a star.

---

## 2026-10-06 (~17:57) - v0.2.98 - Favorite slash-menu skills and commands - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed, live check pending
- Version: 0.2.98
- Added `prompt.autocomplete.favorite` (Ctrl+F) in TUI keybind definitions; targeted priority-1 slash-only layer consumes key before textarea cursor movement.
- Added `favoriteKey` to autocomplete entries: server source/name, native registered command ID through `useCommandSlashes`. All slash entry kinds supported; display padding/labels/aliases do not define identity.
- Added `slash.favorites` in existing KV state; starred gutter, configured shortcut favorite/unfavorite footer, alphabetical favorites first on empty slash query, unchanged fuzzy search path. Toggle keeps highlighted entry and scroll position via `moveTo` after reordering; missing entries retain saved keys.
- Updated FORK.md keys/palette row. Preserved unrelated `.config/openSidebar.json` edits.
- Verification: `bun test --timeout 30000 test/component/autocomplete.test.ts test/keymap.test.tsx` from `src/packages/tui`: 5 pass, 0 fail, 14 assertions. Covered ordering/deduplication/source-specific identity and actual keyboard ownership against textarea cursor movement. Build, typecheck, installed appearance, toggle selection retention, and restart persistence not run.
- MISTAKE: identity test initially put `namespace` on keymap layer; API expects command namespace. Moved field to command and reran targeted checks successfully.

### User
Slash-menu favorites
- Press Ctrl+F on a skill, command, MCP prompt, or oc action in the `/` menu to favorite or unfavorite it without running it.
- Favorites show a star and appear first when you type just `/`; typed search keeps its existing ranking.
- Favorites are saved across projects and restarts, with a favorite/unfavorite shortcut hint in the menu.
- After rebuilding, check that toggling keeps the same entry highlighted and that favorites remain after restarting oc.

---

## 2026-10-06 (~09:10) - v0.2.97 - Personal WezTerm zoom commands - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed, scoped review clean
- Version: 0.2.97
- Added personal `/zoom-in` and `/zoom-out` outside repository: `~/.config/opencode/tuiPlugins/weztermZoom.ts`, loaded by global `tui.json`; renderer emits unique OSC 1337 `oc_font_zoom` requests. WezFig `wezterm.lua` handles requests through native font-size actions.
- Recorded shared-file work in `C:\Users\user\buildNotes.md` and WezFig history. No oc runtime code changed; no revision bump. Plan: `.opencode/plans/ses_eeec0c98cffew7sbU36z7ke5Ir.md`.
- Verification: personal plugin check passed (1 test, 14 assertions); user confirmed live zoom after 09:06 restart. Scoped cleanup review found no actionable defects. Separate Home/session, multi-window, and keyboard-reset checks not individually reported.
- Push verification: `bun test --timeout 30000 test/marker/marker.test.ts test/agent/agent.test.ts` from `src/packages/opencode`: 55 pass, 0 fail, 149 assertions.
- Pre-push verification: `.scripts/prePush.ps1` passed, 27/27 typecheck tasks (24 cached); refreshed README code-count table and `scc.txt` to 515,348 code lines.

### User
Terminal text size
- Personal `/zoom-in` and `/zoom-out` commands now change WezTerm text size directly without an AI reply.
- This uses personal configuration outside the oc repository and was confirmed working live.

---

## 2026-10-06 (~02:22) - v0.2.97 - Command markers are now a native, off-by-default oc feature - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed (picked up after previous Opus hit the Claude Code 5-hour limit mid-plan)
- Version: 0.2.97
- Plan: `~/.config/opencode/plans/2026-10-06-tokenless-markers.md` (both phases done; Progress has deviations). Replaces the v0.2.96 proof of concept below.
- Added `core/src/util/markers-file.ts`: `markersFile()` = `Global.Path.config/markers.json` (global-only by design), `MARKERS_WARNING`, `markersEnabled`, `setMarkersEnabled` (regex-flips `"enabled"` in place so `//` comments and commands survive; creates warning template, off, if missing).
- Added `opencode/src/marker/marker.ts`: `read` (needs `enabled: true`; validates name `^[A-Za-z]\w*$`, `run` string array, `mode` inline|window|afterTurn; per-command `ask` overrides top-level `ask`; `timeout` default 30 s), fence-aware `find`/`replace` (exact line `$#name`, trailing spaces ok, CRLF kept, deduped), `run` (inline: `Bun.spawn` argv, no shell, last 4000 chars; window: Windows `launchDetached("pwsh", -NoExit -EncodedCommand)` visible; non-Windows returns "window mode is Windows-only"), `queue`/`flush` for afterTurn, `prompt(config)`, `log` to `Global.Path.log/markers.log` (failures logged to console, never fail the reply).
- Changed `session/processor.ts`: `runMarkers` at `text-end` before `experimental.text.complete` (fast path: skip unless text has `$#`); `ask` uses `Permission.ask` permission `marker`, pattern/always = name, `ruleset: []` so markers.json decides, not agent `*: allow`; reject -> `name: denied`. Layer listens for `SessionStatus` idle -> `Marker.flush`. Removed stale `no-self-assign` lint comment (assignment kept).
- Changed `session/prompt.ts`: marker prompt pushed to `system` for native providers; for Claude Code appended to the agent prompt (only prompt CC receives). Absent when disabled or no valid commands.
- Changed `agent/agent.ts`: last-applied edit `ask` for `markers.json`, `*/<configdir>/markers.json`, `<configdir>/markers.json`, only on agents where edit would otherwise be `allow` (plan agent keeps deny).
- Added TUI palette `oc.markers` "Command markers (alpha)" (`/markers`) in `tui/src/app.tsx`: on/off select; turning on shows `DialogConfirm` with `MARKERS_WARNING`; toast shows file path.
- Removed proof of concept: `.opencode/plugins/dollarHash.ts`, `.opencode/dollarHash/`, AGENTS.md `$#` section (AGENTS.md content back to pre-v0.2.96).
- Added FORK.md row "Command markers (alpha)" (medium); counts medium 22, total 63.
- Added `~/.config/opencode/markers.json` with user permission: `enabled: false`, `testCommand` (inline pwsh timestamp), `build`/`test` (window, `.ps1` path as `run[0]` so the kept-open pwsh runs it directly, like the proof of concept). `helloScript` dropped (script deleted). Checked: file reads as off; with enabled flipped on a temp copy, 3 commands parse and `testCommand` returns `markers ok <timestamp>`.
- Risk: shell tools can write markers.json (edit guard covers edit/write/apply_patch only). Answering "always" on any edit prompt approves `*`, which also covers markers.json. An `ask: true` marker blocks the reply stream until answered.
- Verification: from `packages/opencode`, `bun test --timeout 30000 test/marker/marker.test.ts test/agent/agent.test.ts test/session/processor test/tool/run-after-turn.test.ts` 74 pass; `test/session/prompt` 47 pass, 14 skip. `bun typecheck` clean in opencode, tui, core. Full suite skipped at user request. No processor-level marker test (no text-end harness); live check pending user build.
- ERROR: background shell launch for the full suite failed ("OpenCode did not return a valid background shell process id"); user then asked to skip it.

### User
Agent commands
- Command markers are now built into oc, off by default, and work in every session, not just ones started in the oc folder.
- Your commands live in `~/.config/opencode/markers.json`; each one can run inline, open a PowerShell window, or run after the reply finishes.
- Turn the feature on from the command palette ("Command markers (alpha)"), which shows an alpha warning first, or by editing the file.
- Each command can ask permission before it runs, with a default for all commands in the same file.
- Agents are told which commands you have, and they must ask before changing the file.
- The old test plugin and its `AGENTS.md` instructions are gone.

---

## 2026-10-06 (~01:08) - v0.2.96 - `$#` markers run preset commands without a tool call - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed (proof of concept)
- Version: 0.2.96
- Added `.opencode/plugins/dollarHash.ts`: `experimental.text.complete` hook (`session/processor.ts` text-end) matches assistant lines exactly `$#name` (`/^\$#(\w+)[ \t]*$/gm`), runs `COMMANDS[name]` via `input.$` + `pwsh -NoProfile -NonInteractive`, replaces the line with stdout (or `exit N: stderr`). Only table names run; unknown names stay as text. Names: `testCommand` (hidden, read-only `Get-Date`), `helloScript` (visible, runs `.opencode/dollarHash/helloScript.ps1` via `& '<path>'`, path from `import.meta.dir`; prints path, pid, time).
- Added per-command `hidden` flag: `hidden: false` launches `Start-Process pwsh -NoExit -EncodedCommand <base64 UTF-16LE>` (no nested quoting), returns immediately, line becomes `<name>: opened in a new window`. Output stays in that window, not the chat.
- Added `build` (visible, `.scripts\build.ps1`) and `test` (visible, `.scripts\test.ps1 -Category unit`) markers; paths from `ROOT = import.meta.dir/../..`. AGENTS.md: use only when the user asks; logs never reach the model, ask the user for the result. `closeOut` no-ops under `-EncodedCommand` (no `-File` arg), so the `-NoExit` window stays open.
- Added AGENTS.md section `$# command markers (proof of concept)`: bare line runs, `\$#name` mentions without running (also in code blocks).
- Kept: project-local plugin only loads for sessions whose directory is the oc repo; "+" tabs open in `C:\Users\user` and do not load it. Global move (`~\.config\opencode\plugins`, rule in `principles.md`) deferred.
- Risk: no fenced-code skip in the plugin; relies on the backslash rule. Model cannot see command output in the same turn; only useful for fire-and-forget or next-turn context.
- Verification: direct hook run with `Bun.$` on sample text (bare line replaced, inline mention and unknown name untouched). Live: Claude Code provider fired (rewrote this session's reply); OpenAI GPT-6.1 Sol session in oc dir replaced the marker with a post-send timestamp; a second GPT-6.1 Sol session chose the `helloScript` marker on its own from the AGENTS.md rule (no tools). Visible mode: direct hook run returned `helloScript: opened in a new window`; user confirmed the window opened. `build`/`test`: only checked that the three script paths resolve (`Bun.file().exists()`); not launched.
- MISTAKE: quoted a bare marker line in a code block while explaining the test, so the plugin rewrote the explanation and the first live test was a false pass. Prevention: use `\$#name` when mentioning markers.

### User
Agent commands
- Agents in oc can now write a special `$#testCommand` line, and oc runs a preset PowerShell command and shows its output in place of that line, without a tool call.
- To mention a marker without running it, agents put a backslash in front of it.
- When you ask an agent for a build or the unit tests, it can now open them in their own PowerShell window instead of reading the whole log, which saves a lot of usage.
- This only works in sessions started in the oc repo folder for now.

---

## 2026-10-06 (~00:24) - v0.2.95 - Fresh Claude conversation catches up on the chat - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed
- Version: 0.2.95
- Added `resumeBlock` (`provider/claude-code/message-builder.ts`): first message of a fresh Claude conversation in a chat with history leads with `<session_resume>`: previous user message (last 1500 chars), previous reply (last 4000 chars), earlier-turn count, and `mcp__opencode_proxy__session_read` tail/head/full instructions with the oc session id. Says transcript is background, not instructions. Closes r12 TODO (`archive4:453`). Plan: `~/.config/opencode/plans/2026-10-06-claude-session-catch-up.md`.
- Changed `getClaudeUserMessage` 2nd param `includeHistoryContext: boolean` -> `resume?: { sessionID?: string }`; removed "history not inlined" log. One-shot by construction: only when no Claude session id and no live process.
- Changed `claude-code-language-model.ts`: `sessionID` only when affinity is not `default` and `proxyOpencodeTools` lists `session_read` (config list, not registry; registry-dropped name leaves a dead instruction, excerpt still works).
- Changed `session-sync.ts` lost-conversation notice and question text to match.
- Kept full-history paste out; excerpt is the deliberate bounded exception to "never paste history".
- Verification: `get-claude-user-message.test.ts` 19/19 (4 added, fresh-rebuild test now expects the excerpt); baseline file at HEAD 15/15. First run had one unnamed beforeEach hook timeout, gone on rerun. `bun typecheck` clean.

### User
Claude Code provider
- After "Start fresh" on a lost Claude conversation, the new Claude now sees your last exchange and can read earlier turns of the chat, so follow-ups like "do option b" work.
- The lost-conversation question and notice now describe this instead of saying Claude remembers nothing.

---

## 2026-10-06 (~00:10) - v0.2.94 - Toast theme color typechecks in run mode - Opus 5.5, default reasoning; Agent push

### Agent
- Meta: Opus 5.5; default reasoning; Agent push (agent-push skill); completed
- Version: 0.2.94
- Fixed typecheck errors from v0.2.92 `backgroundToast`: added `backgroundToast` to plugin `TuiThemeCurrent` (`plugin/src/tui.ts`); `opencode/src/cli/cmd/run/theme.ts` `ThemeJson` makes it optional and `resolveTheme` defaults it to `backgroundPanel` (same as tui resolver); added it to `test/fixture/tui-plugin.ts`.
- Verification: tui `bun test test/logo.test.ts test/theme.test.ts` 12 pass; `.scripts\prePush.ps1` passed (turbo typecheck 27/27, code count refreshed).

### User
Themes
- No visible change; plugins reading the current theme now also get the toast background color.

---

## 2026-10-05 (~23:36) - v0.2.93 - Knight Rider scanner in the startup intro - Opus 5.5, default reasoning; Implementation

### Agent
- Meta: Opus 5.5; default reasoning; Implementation (after /spit design: scanner row under logo, oc purple, first pass merged with reveal); completed
- Version: 0.2.93
- Added `tui/src/ui/scanner.ts`: dependency-free `getScannerState`/`calculateColorIndex` (moved verbatim from `ui/spinner.ts`) plus `scannerTrail` and `scannerFade` (extracted from `deriveTrailColors`/`createKnightRiderTrail`). `spinner.ts` imports them; prompt scanner output unchanged. Launcher must not load `@opentui/core`, hence the split.
- Added `introCellsAt(tick)` + `INTRO_TICK_MS` (15ms) in `tui/src/logo.ts`: whole intro as a pure function of tick. Reveal shows column <= tick; scanner row under logo (logo width, 9 cells) uses prompt look (trail from `scannerTrail`, inactive 0.6 alpha fading to 0.3) with solid hex precomputed over black interior. First forward pass rides reveal edge; end hold = columns right of scanner, so it ends with the reveal; later steps every 3 ticks (45ms). `IntroCell` changed from `kind` to `fg`/`bg` hex (no `bg` = terminal background).
- Changed `opencode/src/cli/intro.ts`: paints `introCellsAt` diffs per tick; resize clears and repaints current frame. Stop now returns last painted tick; removed duplicated geometry code (`expandTabs`, `blank`).
- Changed `cli/cmd/oc.ts`: `attach` takes `introFrame`, passes `OC_INTRO_FRAME` env to the attach TUI; both `stopIntro(false)` call sites pass it. Revive re-attach passes none.
- Changed `tui/src/component/intro-logo.tsx`: tick signal starts at `OC_INTRO_FRAME` (else fully revealed, as before), 15ms interval until `hideIntroLogo`, `Index` rendering so only changed scanner spans update.
- Removed `StartupLoading` mount (and now-unused `useTuiStartup` use) from `tui/src/app.tsx`: it showed only while the intro was up. Kept upstream `component/startup-loading.tsx` unused to avoid sync churn.
- Added `tui/test/logo.test.ts`: reveal per tick, head on reveal edge for first pass, later bouncing, non-scanner cells unchanged.
- Verification: `bun test test/logo.test.ts` (tui) 3 pass; tui `tsgo --noEmit` clean; printed sample frames to confirm layout. opencode typecheck: only pre-existing errors in `cli/cmd/run/theme.ts` (`backgroundToast` missing from `SharedSyntaxTheme`, from the v0.2.92 toast work). Live launcher/TUI handoff not run; needs user check.
- Risk: intro ignores `animations_enabled` (KV provider mounts below `IntroLogo`; launcher cannot read it).

### User
Startup intro
- A purple Knight Rider scanner now runs under the oc logo while oc starts.
- Its first sweep moves with the frame as the frame draws in, then it bounces until oc is ready.
- The animation continues where it left off when the launcher hands over to the TUI.
- The separate "Loading plugins..." spinner at the bottom no longer shows during startup.

---

## 2026-10-05 (~23:23) - v0.2.92 - Theme-controlled toast background - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.92; retained once-per-session revision bump.
- Added optional `backgroundToast` to TUI theme colors; resolver defaults omitted value to `backgroundPanel` and supports existing color references and dark/light variants.
- Changed Toast to use theme color; removed fixed purple from shared UI.
- Changed active custom theme `C:\Users\user\.config\opencode\themes\drac.json`: `backgroundToast` is dusty purple `#423B52`.
- Verification: new targeted theme-resolution test passed, 1 pass, 0 fail; covers both mode defaults, color reference, and dark/light override. No build run.

### User
Toast appearance
- Toast backgrounds are now theme-controlled. Your drac theme keeps dusty purple; other themes can choose their own toast color.

---

### Toast color selection follow-up (v0.2.92)

### Agent
- Changed `src/packages/tui/src/ui/toast.tsx`: replaced variant tint with user-selected dusty purple `#423B52`; removed unused tint import.
- Verification: no tests or build run for static color change.

### User
Toast appearance
- Selected dusty purple for toast backgrounds; status-colored borders remain.

---

## 2026-10-05 (~23:17) - v0.2.92 - Tint toast backgrounds - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.92
- Changed `src/packages/tui/src/ui/toast.tsx`: reused theme `tint` with 15% variant color over panel background; retained side borders and text colors.
- Verification: inspected toast diff and existing tint implementation; no checks introduced or run for this styling-only change. Live appearance needs user verification.

### User
Toast appearance
- Toast backgrounds now have a subtle tint matching their border color so they stand out from panels.

---

## 2026-10-05 (~23:16) - v0.2.91 - Claude "Start fresh" answer reaches the waiting question - Opus 5.5, low reasoning; Debug

### Agent
- Meta: Opus 5.5; low reasoning; Debug; completed
- Version: 0.2.91
- ERROR: "Start fresh" did nothing. Log: `asking id=que_10f31b536001...` then 4x `reply for unknown request` for the same id. `Question` pending map is per-instance (`InstanceState`); the claude-code plugin's shared client (`setOpencodeClient`, module-global) is bound to whichever instance booted last (`C:\Users\user` under the `oc` launcher), so `/question/ask` registered there while the TUI replied with the session's directory.
- Fixed `askFreshConversation` (`provider/claude-code/session-sync.ts`): takes the `TurnContext`, posts `/question/ask?directory=<turn.cwd>`, same routing as `requestWakeTurn`.
- Risk: other `getOpencodeClient()` callers (toast, `session.get`, `session.status`, `tool.list`, `mcp.status`) still use the last-booted instance's directory; not changed.
- Verification: none run. No existing check covers the raw client ask (session-sync tests have no client, so ask returns undefined).

### User
Claude Code provider
- Choosing "Start fresh" (or "Cancel") on the "Claude conversation is gone" question now works instead of leaving the chat stuck.

---

## 2026-10-05 (~17:46) - v0.2.90 - /rename toast shows the model that wrote the title - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed
- Version: 0.2.90
- Changed `SessionPrompt.rename` (`opencode/src/session/prompt.ts`) to return `{ session, model? }`; `model` is `providerID/modelID` of the attempt that won (fallbacks included), absent on the early no-user/no-agent return.
- Changed `session.rename` HttpApi success schema (`groups/session.ts`) to that struct; regenerated legacy SDK (`sdk/js/src/v2/gen/types.gen.ts`). `packages/client` generate produced no diff.
- Updated TUI `session.rename.auto` (`tui/src/routes/session/index.tsx`) to read `result.data.session.title` and append `\nModel used: <model>` to both "Renamed" and "Title unchanged" toasts.
- Verification: `test/session/rename-fallback.test.ts` 14 pass, with new assertion that `model` equals the last attempted model; tsc on opencode and tui showed no errors in touched files.

### User
Session rename
- The `/rename` toast now shows the model that generated the title on a second line, including when a fallback model was used.

---

## 2026-10-05 (~17:30) - v0.2.89 - Sidebar script and file names clip with ... and scroll on hover - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed
- Version: 0.2.89
- Added in `sidebar-tools.tsx`: `clipEnd(text, width)` (trailing `...`), shared marquee (`marqueeOffset` signal, single `marqueeTimer`, 150 ms ticks, 3-tick start pause, 6-tick end pause, loops; cleared in `onCleanup`).
- Changed script and file tree rows: each `<box>` row keeps a `nameWidth` signal from `onSizeChange` (script: width - 4; tree: width - 4 - depth*2). Name text `wrapMode="none"`, rendered via `clipEnd`, hovered name sliced by `marqueeOffset`. Script row was a bare `<text>`; now `<box>` wrapping `<text>`.
- Kept: OpenTUI 0.4.5 native `truncate` puts the ellipsis mid-text; do not use it here.
- Kept: OpenTUI `TextBufferRenderable.onResize` overrides `Renderable.onResize` without super, so `onSizeChange` never fires on `<text>`; measure a `<box>`.
- MISTAKE: first pass changed only the file tree; the wrapping row user reported was in scripts. Check which list a screenshot shows before editing.
- Risk: widths use `.length`, not display width; wide chars (CJK/emoji) clip/scroll slightly off.
- Verification: `bunx tsc --noEmit` in `packages/tui` reported no errors in `sidebar-tools.tsx`. User confirmed clipping and hover scroll live.

### User
Sidebar files
- Long script, file and folder names in the sidebar stay on one line and end in "..." instead of wrapping.
- Hovering a cut-off name scrolls it so you can read the whole name, then it resets when the mouse leaves.

---

## 2026-10-05 (~17:29) - v0.2.88 - Review local test runner and reject misspelled options - GPT-6.1 Sol, reasoning; Cleanup

### Agent
- Meta: GPT-6.1 Sol; reasoning; Cleanup; completed, session-scoped
- Version: 0.2.88
- Reviewed only session workflow removal, local runner/check, documentation/rules, revision, and notes rotation. No major design issue found; full generation/Linux execution remain unverified.
- Fixed `.scripts/test.ps1` basic argument binding: reproduced `-Package schema -Fiel missing.test.ts -DryRun` silently selecting the whole package. Added CmdletBinding so unknown options fail before execution.
- Added regression in `.scripts/tests/testRunner.tests.ps1` for misspelled -Fiel rejection.
- Verification: targeted runner check passed (one Node test, three Bun tests, selection/guards/restoration/native failure assertions); git diff --check passed; workflow directory empty. No full suites/build/generation run.
- Kept revision 0.2.88; already incremented once in this session. Preserved unrelated worktree changes.

### User
Runner cleanup
- Misspelled test-runner options now fail immediately instead of silently running a broader package suite.
- Scoped review found no major issue; targeted checks passed.

---

## 2026-10-05 (~17:23) - v0.2.88 - Replace cloud workflows with local test runner - GPT-6.1 Sol, reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; reasoning; Implementation; completed
- Version: 0.2.88
- Removed `.github/workflows/{test,typecheck,generate,opencode,review}.yml` per user; no active cloud workflows remain.
- Added `.scripts/test.ps1`: 20 Bun packages, two Node providers, HttpApi gates, whole-workspace typecheck, client/SDK/OpenAPI generation checks; package/file/name/category/all/list/help/dry-run selection.
- Kept sequential fail-fast execution, native exit-code checks, installed tools/dependencies only, exact package-relative file paths, caller directory/environment restoration. Reused scriptHelper native command/closeOut.
- Guarded generated outputs against staged/unstaged/untracked edits; post-checks cover tracked/untracked drift using root-correct src paths. Generation writes outputs and compiles legacy SDK; never resets edits.
- Added `.scripts/tests/testRunner.tests.ps1`: selection/dedup/argument checks, real Node/Bun execution, native error propagation, environment/directory restoration, dirty-output protection with self-owned marker cleanup.
- Updated SCRIPTS.md usage/categories; user approved AGENTS.md replacing obsolete cloud-delegation rule.
- ERROR: latest pushed e74b1b57 Actions jobs blocked before execution by account billing/quota annotation; private repository confirmed. No test failure established from those runs. Prior v0.2.79 notes record same block.
- Verification: targeted runner check passed on Windows (one Node test, three Bun tests); invalid-regex failure deliberately asserted. git diff --check passed. Full suites, typecheck, HttpApi, generation, and Linux execution not run.
- Rotated 1127-line prior active notes verbatim to buildNotes.archive6.md; SHA-256 verified unchanged. Incremented actual workspace version file `src/.version/version` once.

### User
Local checks
- GitHub cloud workflows are removed; run tests locally using `.scripts/test.ps1` for a package, file, test-name filter, category, or all checks.
- Use `-List` to see choices and `-DryRun` to inspect commands; generation checks require clean output paths and leave resulting changes visible.
- Targeted runner verification passed; full suites remain yours to run when needed.

---
