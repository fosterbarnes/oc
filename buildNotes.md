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
- Kept histories verbatim: archive1 (2026-08-20 through 09-09), archive2 (09-09 through 09-15), archive3 (09-15 through 09-28), archive4 (1144 lines), archive5 (1019 lines through v0.2.65), archive6 (1127 lines through v0.2.87), archive7 (1176 lines, v0.2.88 through v0.2.120, committed e4d73d1). Earlier hashes and detailed summaries remain in archives. Never edit archives.
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
- Added `.scripts/test.ps1` v0.2.88 (package/file/name/category/all/list/dry-run selection, generated-output guards, CmdletBinding rejects misspelled options) plus `.scripts/tests/testRunner.tests.ps1`.
- Added sidebar name clipping with trailing `...` and hover marquee v0.2.89 (`clipEnd`, shared timer); OpenTUI native `truncate` puts ellipsis mid-text and `<text>` never fires onSizeChange, so measure a `<box>`. Risk: widths use `.length`, not display width.
- Changed `/rename` toast to name the winning model v0.2.90 (`SessionPrompt.rename` returns `{ session, model? }`; HttpApi schema and legacy SDK regenerated).
- Fixed Claude "Start fresh" v0.2.91: question pending map is per-instance; `askFreshConversation` posts `/question/ask?directory=<turn.cwd>`. Risk: other `getOpencodeClient()` callers still target the last-booted instance directory.
- Added theme `backgroundToast` v0.2.92-94 (defaults to backgroundPanel; drac theme dusty purple `#423B52`; plugin TuiThemeCurrent and run-mode theme carry it). Added Knight Rider scanner under the intro logo v0.2.93 (`introCellsAt(tick)`, `OC_INTRO_FRAME` handoff); intro ignores `animations_enabled`.
- Added fresh-conversation catch-up v0.2.95: `resumeBlock` leads a new Claude conversation in an existing chat with bounded last exchange and session_read hint; full history paste stays forbidden.
- Added native command markers v0.2.96-97 (off by default, global `markers.json`, inline/window/afterTurn modes, per-command ask via `Permission.ask`, fence-aware, edit guard on markers.json). Background-marker experiment (v0.2.103) abandoned and reverted: no token savings, wake turns missed cache. Names with `-` fail the NAME regex and are skipped.
- Added slash-menu favorites v0.2.98 (Ctrl+F, KV `slash.favorites`, U+2B29 marker, favorites-first only on empty query); session `/` menu flows inline above the prompt v0.2.99 (Yoga needs `"auto"`, not undefined, to clear offsets).
- Upgraded OpenTUI 0.5.14 / SolidJS 1.9.12 v0.2.100 for word/line selection; copy keeps highlight; message/tool actions moved off selectable text. Re-derive Solid patch offsets per version, never shift old ones.
- Added default-off `todos` config v0.2.101 (registry drops todowrite; Claude TodoWrite/Task* disabled with it) and palette toggle. Added multi-command slash composition v0.2.102 (`additionalCommands`, labeled blocks, shared `slashTriggerIndex`).
- Added oc palette toggles: bgRun on/off v0.2.104 (writes allow/deny for bgRun/bgStatus/bgKill), sidebar position right/top/left/bottom (WIP) v0.2.106, keybind layout oc/opencode v0.2.107 (`keybind_preset`, `keybindPreset.ts`, generated `docs/keybinds.md` checked by prePush; live switch re-registers prompt input keys v0.2.108), Update Claude Code v0.2.119 (`claude update`; output read on `close`).
- Added `/work` and `/done` worktree sessions v0.2.105 (`Git.worktree.merge`: snapshot via write-tree/commit-tree, squash merge, rollback on conflict; `projectCopy.merge` endpoint). Risk: Claude subprocess cwd after move untested; Windows locks can fail forced remove.
- Fixed revive mark to show the build that came back v0.2.107 (session view rewrites newest unsent mark once). Added sidebar Plugins section v0.2.109 (`GET /plugin`, `Plugin.Service.status()`).
- Added Claude Code verification harness v0.2.110-120: `TestLLMServer` Anthropic `/v1/messages` SSE fake, `chat-fixture.ts` (`openChat`, `claudeEnv`, `outsideProfile` at `C:\ocTestTmp`, `expectIsolated`), fake-model scenarios for every claudeTestFlow step, opt-in WezTerm pane TUI checks (`OC_TUI_PANE=1`), opt-in real-model run via `.scripts\claudeRealFlow.ps1` (`-Step7`, `-SwitchModel`; token saved DPAPI, agents never read it) with `flowReport.ts` reports (gitignored).
- Fixed Claude provider bugs found by the harness: abandoned turn output dropped after interrupt (`turnAbandoned`), exchange hash includes position so identical replies still rewind, usage taken from message_delta, error text shown once.
- Added Claude catalog Haiku 5.5 v0.2.119 (base card only: config loader drops `cost.tiers`, prompts >100K under-report 5x); Sonnet 5 corrected to $2/$10; Sonnet 5.5 cache read 0.1.
- Fixed test isolation v0.2.119-120: WezTerm overlays HKCU OPENCODE_DB on panes (isolation vars go in test config `set_environment_variables`; ~71 old test sessions remain in real DB, user deferred); `hostEnv()` drops inherited CLAUDE*/ANTHROPIC* at every spawn site, `extendEnv: false`.
- MISTAKE: PowerShell HOME is read-only; use testHome. Never reconstruct plan paths. Parallel proxy edits can reject after applying. Bare Bun uses 5s; use --timeout 30000. Git Bash /tmp and URL pathname fail on Windows. Never overwrite existing tests without Read; renderer tests were restored after accidental replacement. Re-run affected checks after final edits, not before reporting.
- MISTAKE: deleting applied migrations breaks guard; inspect shipped DB first. Fiber.join in interrupt cleanup can hang; await Exit before propagation. V2-named routes are live; grep TUI client.v2 calls before cutting. Do not call force-kill safe cancellation; cancellation must be explicit. Session paint claims remain unconfirmed and should not be revived.
- MISTAKE: Python/heredoc shell edits mangled CRLF/backslashes/raw ESC; edit project files through file tools. Claude host-env probes must unset host CLAUDE* variables. Native features never call personal PowerShell build scripts. Missing native feature config needs explicit first-run choice, not hidden commands. Cross-path markers belong at shared trigger.
- MISTAKE: `taskkill /T` and PID-only process trees reached unrelated processes; pane cleanup anchors on CIM creation time and compares CIM to CIM. Quoting a bare `$#` marker in an explanation triggered it; mention markers as `\$#name`. Check which list a screenshot shows before editing.
- MISTAKE: one `Bun.file` object caches `exists()` (Bun 1.4.1); step 7 reported a real deletion as failed in three real runs. Use a fresh BunFile per check. When a tool reports success and the check disagrees, verify the check first.
- MISTAKE: `Start-Job`/backgrounding inside a PowerShell tool call dies with the call's shell; run each oc subagent as its own `run_in_background` call (oc-subagent skill). An oc reinstall kills running `opencode run` subagents (exit -1).

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
- Local `.scripts/test.ps1` runs chosen checks; misspelled options fail instead of running everything.
- Sidebar names clip with "..." and scroll on hover. `/rename` names the model that wrote the title. Toasts use a theme color, and a Knight Rider scanner runs under the startup logo.
- Claude "Start fresh" works and the new conversation sees your last exchange. Esc no longer leaks a cut-off reply, undo always rewinds Claude, token counts are right, and refusals show once.
- Command markers let agents run your preset commands from `markers.json` (off by default). Slash menu supports favorites (Ctrl+F), composing several commands (`/spit /think`), and stays above the chat. Mouse selection handles words and lines.
- Todos are off by default with a palette toggle. The oc palette also has bgRun, sidebar position, keybind layout (oc or opencode keys, documented in `docs/keybinds.md`), and Update Claude Code.
- `/work` moves a session into a git worktree and `/done` squash-merges it back. The sidebar lists plugins and their load status, and the revive mark shows the version that came back.
- Claude Haiku 5.5 is in the model list; Sonnet 5 and 5.5 prices are corrected. Every step of the Claude test flow runs automatically against a fake model, with on-screen TUI checks and an opt-in real-model run that writes a report.

# Historical entries (newest first)

---

## 2026-10-08 (~19:21) - v0.2.128 - Time tool cleanup and Claude proxy verification - GPT-6.1 Sol, default reasoning; Pass

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Pass; completed
- Version: 0.2.128
- Fixed new time tool's star import to use exported `Tool`; corrected example weekday.
- Added fake-model scenario exercising default Claude proxy selection, native time execution, and formatted timestamp returned to the model. Passed: 1 scenario, 6 assertions.
- Verification: user confirmed live time tool works and package typecheck plus both automatic-rename scenarios pass. Kept revision already bumped once this session.
- Reviewed session's time tool, proxy wiring, formatting test, and six SDK request typing fixes; no functional defect found in reviewed changes.

### User
Time tool
- Added an automated Claude Code check that calls the native time tool and confirms its timestamp reaches the model.
- Confirmed the tool works in the running application and the earlier test typing errors are resolved.

---

## 2026-10-08 (~19:13) - v0.2.128 - Explicit SDK response typing in rename tests - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.128
- Fixed six SDK calls in `test/provider/claude-code/fake-model.test.ts` and `test/session/autoRenameBootstrap.test.ts`: request-level `throwOnError: true` infers required response data, addressing seven recorded optional-data diagnostics. Kept client configuration and scenario behavior.
- Verification: edited bootstrap scenario passed (1 test, 4 assertions); edited Claude automatic-rename scenario passed against the real CLI and fake model (1 test, 12 assertions; 19 other scenarios filtered out).
- Kept generated SDK and unrelated pending time-tool changes untouched. Package typecheck not run under the only-edited-checks rule; next user-requested pre-push must confirm diagnostics are cleared.

### User
Tests
- Automatic-rename tests now declare their HTTP error behavior in each affected request so the SDK can correctly type successful responses.
- Both affected scenarios passed, including Claude session renaming and restart.

---

## 2026-10-08 (~03:05) - v0.2.127 - Native time tool - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation from `timeToolPlan.md`; completed
- Version: 0.2.127
- Added `src/tool/time.ts` (`TimeTool`, `formatTime`): zero-arg `time` tool, reads `DateTime.nowAsDate`, returns `YYYY-MM-DD Ddd HH:MM ±HH:MM` (~12 tokens). No permission ask. Registered in `tool/registry.ts` built-ins.
- Added Claude Code proxy def `time` (`proxy-tool-defs.ts`), `PROXY_DEF_OPENCODE_TOOL.time` (`proxy-tool-selection.ts`), and `"time"` in `DEFAULT_PROXY_TOOL_NAMES` (`types.ts`).
- Kept live time out of the system prompt: changing it each turn would break prompt caching. `Today's date` in `session/system.ts` unchanged.
- Risk: the user's `opencode.jsonc` sets `proxyTools` explicitly (`["Task", "Question", "run_after_turn"]`), which overrides the default; `time` must be added there to reach Claude Code sessions.
- Verification: `test/tool/time.test.ts` (new) and `test/provider/claude-code/proxy-mcp.test.ts` (default list updated) pass, 65/65. No fake-model scenario added; the proxy-mcp routing test covers the generic forward path. Not built or installed.

### User
Tools
- Agents can call a new `time` tool to see your current local date, time, and time zone offset, at very low token cost.
- In Claude Code sessions it appears as `mcp__opencode_proxy__time` once `time` is in your `proxyTools` list.

---

## 2026-10-08 (~02:56) - v0.2.126 - Automatic first-prompt oc session names - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation from `autoRenamePlan.md`; completed
- Version: 0.2.126
- Added pending `metadata.ocAutoRename` on resident/CLI bootstrap; explicit bootstrap `--title` opts out. Added client-only `OC_AUTO_RENAME` on attach/stable/palette launches; Home session creation sends pending metadata under that hint.
- Added `SessionPrompt.startTitle`: claims attempted state inside owning legacy loop before scoped, SessionWork-tracked rename; synthetic bootstrap/revive/shell messages do not count. Reused real-user predicate and internal `/rename` agent, cleanup, model/variant/fallback chain. Unmarked sessions keep native title generation.
- Added automatic rename history snapshot and expected-title guards before model request/save; manual rename remains unconditional. Failures log without failing the conversation; consumed state prevents later prompts/restart retries.
- Changed `Session.fork`: excludes only ocAutoRename from copied metadata. Updated FORK.md behavior and marked plan implemented.
- Verification: `bun test test/session/autoRename.test.ts test/session/autoRenameBootstrap.test.ts --timeout 30000`: 10 pass, 40 assertions. Targeted `fake-model.test.ts` scenario: 1 pass, 12 assertions; real Claude CLI against TestLLMServer, reply overlap and server restart. Targeted `OC_TUI_PANE=1 tui-pane.test.ts` scenario: 1 pass, 4 assertions; isolated headless WezTerm Home title updates once. `git diff --check` passed. No build/install or broad typecheck ran; installed launch paths remain user acceptance.
- MISTAKE: first service-test root omitted EventV2Bridge, used directly by update-event assertion; 8 passed, 1 failed. Added bridge node to test root; rerun all new service/bootstrap checks passed. Expose directly yielded services in LayerNode test roots, not only transitive dependencies.
- Tooling: bgShell unavailable; independent checks ran in detached pwsh processes with scratch logs/exit files under approved temp/opencode directory.

### User
Session names
- New oc sessions automatically use `/rename` after the first real prompt, alongside the reply.
- Titles include the folder and task description; later prompts and reopening the session keep the name.
- Manual names are preserved, and a failed naming attempt leaves `/rename` available to try again.
- All 12 targeted checks passed, including Claude and on-screen TUI checks.

---

## 2026-10-08 (~02:42) - v0.2.125 - Live context usage during Claude Code turns - Claude Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Claude Opus 5.5; low reasoning; Implementation (imp) from `liveContextPlan.md`; completed
- Version: 0.2.125
- Cause: Claude Code runs the whole agent loop as one AI SDK step; usage only reached `assistantMessage.tokens` at the final `finish`, so footer `usage()` (`tui/.../prompt/index.tsx`) and sidebar Context stayed empty (first turn) or stale all turn.
- Added `LLMEvent.usage` (`UsageUpdate`, tag `usage`) in `llm/src/schema/events.ts`: interim usage of a running step.
- Added `ClaudeTurn.reportLiveUsage` (`provider/claude-code/turn-stream.ts`): after each main-thread `message_delta`/`assistant` line, enqueues `raw` chunk `{ claudeCodeUsage }` in AI SDK flat usage shape. Skips `parent_tool_use_id` subagent lines.
- `session/llm.ts`: `includeRawChunks` also on for `isClaudeCodeProvider`.
- `session/llm/ai-sdk.ts` `raw`: maps `claudeCodeUsage` to `LLMEvent.usage`; Copilot handling kept.
- `session/processor.ts` `usage` case: sets tokens via `Session.getUsage`, `updateMessage`; no cost (step-finish adds it once), no parts/snapshot/overflow.
- Added fake-model test `live context: tokens update before the turn finishes` (holds 2nd call with `reply().wait`, polls messages mid-turn).
- Verification: `bun run typecheck` in `packages/opencode` and `packages/llm` clean; full `fake-model.test.ts` 19 pass. Pane check not added.
- MISTAKE: first test draft used `reply().text().usage()` without `.stop()`; fake then sends zero final usage. Use `.stop()` (as `llm.text` does) for scripted final replies.
- TODO: cost still updates only at turn end (would need per-call pricing).

### User
Claude Code context display
- The context token count and % in the prompt footer and sidebar now update while a Claude Code turn is still running, instead of staying empty or showing the previous turn.
- Cost still updates when the turn finishes.

---

## 2026-10-08 (~02:26) - v0.2.124 - Token-lean agent push - Claude Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Claude Opus 5.5; low reasoning; Implementation; completed
- Version: 0.2.124
- Added `.scripts/agentPush.ps1`: `-Context` dumps branch, status, new `buildNotes.md` lines, last 10 subjects, last message; default mode validates `buildNotes.txt` (changed, `v<version>`, blank line, body), runs `prePush.ps1` then `push.ps1` in-process (closeOut no-op), output captured and last 40 lines shown only on failure, then prints hash/message/files.
- Rewrote user-level `~/.opencode/commands/agent-push.md` and `~/.claude/skills/agent-push/SKILL.md` bodies: 3 calls with agentPush.ps1, 3-call fallback for repos without it, no skill reload, no script reads, write message once, no dry run. Last run took ~12 calls.
- Updated `AGENTS.md` buildNotes.txt section with agentPush.ps1.
- Kept husky pre-push typecheck (turbo cache hit after prePush).
- Verification: ran `-Context` (ok); default mode failed correctly for unchanged notes, wrong version line, missing blank line (temp edits restored). Real push path not run; first live `/agent-push` is the check.

### User
agent push
- `/agent-push` now takes about 3 tool calls instead of about 12, with quiet check output unless something fails.

---

## 2026-10-08 (~02:15) - v0.2.123 - Enable completion after agent push - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.123
- Fixed user-level `C:\Users\user\.opencode\commands\agent-push.md`: added turn-scoped `session_complete: allow`; default deny previously hid completion on push turns.
- Updated `src/packages/opencode/src/tool/session-complete.txt`: successful agent-push with required checks passed qualifies for completion; failed pushes do not.
- Verification: read back command frontmatter and existing success-only final step; matched `/imp` permission pattern and traced command permissions into turn tools. No tests or build run for declarative permission/text changes. Command hot reload applies to the next invocation; tool wording requires a rebuilt runtime.

### User
Session completion
- Successful `/agent-push` runs can now mark the session complete; failed checks or pushes leave it open.
- Completion instructions now explicitly cover push closeout.

---

## 2026-10-08 (~02:11) - v0.2.122 - Verify sidebar refinements for push - GPT-6.1 Sol, default reasoning; Agent push

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Agent push; verification passed
- Version: 0.2.122
- Prepared buildNotes.txt covering final Minimal prefixes/inline reasoning, palette shortcuts, border/selection fixes, cleanup, and concurrent oc-palette-entry skill.
- Verification: HeaderButton renderer checks 5 pass, 25 assertions. Background prePush exit 0: 27/27 typechecks (26 cached), keybind docs check, code count 519,318. git diff --check passed.
- Tooling: background pwsh process used because bgShell tools unavailable; scratch stdout/stderr and exit file confirmed success.

### User
Verification
- Sidebar refinements passed five focused renderer checks and all pre-push checks.

---

## 2026-10-08 (~02:09) - v0.2.122 - Review and clean up sidebar controls - GPT-6.1 Sol, default reasoning; Cleanup

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Cleanup; completed, session-scoped
- Version: 0.2.122
- Reviewed session-owned style schema/resolution/persistence, palette picker, sidebar wiring, HeaderButton, and regression checks against e4d73d1. No major issue found; trial styles and bracket width machinery absent from live code.
- Changed labels to Command Palette and oc Palette. Consolidated repeated style comparison into outlinedButtons and expanded long JSX calls for readability; config description now covers all sidebar buttons.
- Fixed long-model inline layout: secondary reasoning button does not shrink; model clips first. Added narrow inline model/reasoning regression.
- Verification: seven targeted config/renderer checks passed, 32 assertions; scoped git diff --check passed. No build or typecheck run; complete sidebar dispatch/persistence remains installed acceptance, not covered by isolated HeaderButton tests. Kept once-per-session revision bump.

### User
Sidebar cleanup
- Palette buttons now read Command Palette and oc Palette.
- Long model names no longer squeeze the reasoning control; reviewed button behavior and removed redundant style comparisons.
- All seven targeted checks passed; no larger redesign was needed.

---

## 2026-10-08 (~02:07) - v0.2.122 - Distinguish primary and secondary Minimal controls - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.122
- Changed Minimal primary prefix to >; secondary inline reasoning uses >> through HeaderButton.secondary. Outline stays unchanged.
- Verification: HeaderButton renderer checks 5 pass, 22 assertions; updated primary/inline prefix assertions. Kept once-per-session revision bump.

### User
Sidebar
- Minimal rows start with >; reasoning beside the model starts with >>.

---

## 2026-10-08 (~02:06) - v0.2.122 - Disable selection on sidebar buttons - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.122
- Set selectable=false on HeaderButton label and Minimal prefix; covers session, both palettes, model, and reasoning in both styles.
- Verification: HeaderButton renderer checks 5 pass, 22 assertions. Double-clicks activate buttons without selecting labels/prefix; neighboring ordinary text remains selectable. Kept once-per-session revision bump.

### User
Sidebar
- Double-clicking sidebar buttons no longer highlights their text.

---

## 2026-10-08 (~02:03) - v0.2.122 - Add sidebar command palette button - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.122
- Added command palette HeaderButton between Switch Session and oc palette; dispatches existing command.palette.show to open unfiltered palette.
- Verification: inspected existing command handler; one-line wiring change, no tests or build run. Kept once-per-session revision bump.

### User
Sidebar
- Click command palette above oc palette to open all commands.

---

## 2026-10-08 (~02:02) - v0.2.122 - Add sidebar oc palette button - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.122
- Added oc palette HeaderButton immediately below Switch Session; dispatches existing oc.settings_palette command, which opens CommandPaletteDialog filtered to oc.
- Verification: inspected existing command handler; one-line wiring change, no tests or build run. Kept once-per-session revision bump.

### User
Sidebar
- Click oc palette below Switch Session to open the command palette's oc section.

---

## 2026-10-08 (~02:02) - v0.2.122 - Put Minimal reasoning beside model - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.122
- Grouped model and reasoning in row for Minimal, column for Outline. Minimal HeaderButton uses auto width and can shrink; retains separate hover/click handlers.
- Verification: HeaderButton renderer checks 3 pass, 15 assertions; inline model/reasoning geometry and independent mouse clicks added to existing hover/style/narrow-layout checks. Kept once-per-session revision bump.

### User
Sidebar
- Minimal now shows model and reasoning on the same line, each separately clickable.

---

## 2026-10-08 (~02:00) - v0.2.122 - Use double-chevron Minimal controls - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.122
- Changed Minimal prefix to >> and removed closing brackets, shared longest-label width calculation, minimalWidth prop, and text-region growth. Kept explicit empty border sides for hover safety.
- Verification: HeaderButton renderer checks 2 pass, 12 assertions; hover, clicks, style switching, aligned prefixes, and narrow-sidebar single-line clipping. Kept once-per-session revision bump.

### User
Sidebar
- Minimal controls now use >> before each label instead of brackets.

---

## 2026-10-08 (~01:57) - v0.2.122 - Align Minimal closing brackets - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.122
- Added shared minimalButtonWidth from longest visible control label using Bun.stringWidth plus four bracket/padding cells; all Minimal controls share width and align closing brackets.
- HeaderButton caps width at sidebar width and grows text region to reserve closing bracket. Outline stays full-width.
- Verification: renderer checks 2 pass, 10 assertions; hover geometry, style switching, clicks, aligned brackets, and narrow-sidebar clipping checked. Kept once-per-session revision bump.

### User
Sidebar
- Minimal buttons align their closing brackets using the longest visible label.

---

## 2026-10-08 (~01:55) - v0.2.122 - Keep Minimal buttons borderless on hover - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.122
- Fixed HeaderButton: Minimal uses explicit empty border sides, not false. OpenTUI BoxRenderable.borderColor calls initializeBorder, which turns false into true and adds Yoga border rows.
- Moved shared production HeaderButton into sidebar-tools/headerButton.tsx for direct renderer testing; hover signal now belongs to each button.
- Verification: headerButton renderer regression passed, seven assertions; real mouse enter/leave/click and Outline-to-Minimal switching preserve single-line geometry. No build or push run. Kept once-per-session revision bump.
- MISTAKE: supplied reactive borderColor with border=false and assumed disabled borders stayed disabled; verify renderer setters and hover geometry, not only config decoding.

### User
Sidebar
- Minimal buttons stay on one line when hovered, including after switching from Outline.

---

## 2026-10-08 (~01:49) - v0.2.122 - Add oc palette entry skill - Claude Opus 5.5, low effort; Agent

### Agent
- Meta: Claude Opus 5.5; low effort; Agent; completed
- Version: 0.2.122 (not bumped: skill doc only, no code change)
- Added `.opencode/skills/oc-palette-entry/SKILL.md`: how to add `category: "oc"` entries to `appCommands` in `packages/tui/src/app.tsx`; oc section only unless user asks otherwise.
- Verification: temp `oc.tmp_skill_probe` entry with `slashName` added to `appCommands`, `bun run typecheck` in `packages/tui` exit 0, entry removed; worktree diff empty.

### User
Skills
- New `oc-palette-entry` skill teaches agents how to add commands to the oc section of the command palette; no UI change.

---

## 2026-10-08 (~01:46) - v0.2.122 - Verify sidebar and session changes for push - GPT-6.1 Sol, default reasoning; Agent push

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Agent push; verification passed
- Version: 0.2.122
- Prepared buildNotes.txt covering final Sidebar styles, automatic root-session status, command turn permissions, and notes rotation since e4d73d1.
- Verification: opencode prompt/task targeted checks 6 pass, 19 assertions; TUI sidebar config checks 2 pass, 7 assertions. Background prePush exit 0: 27/27 typechecks (24 cached), keybind docs check, code count 519,148. git diff --check passed.
- User confirmed installed button appearance and style picker across revive iterations.
- Tooling: bgShell tools unavailable; ran prePush in separate pwsh process with scratch stdout/stderr and recorded exit code.

### User
Verification
- Sidebar and session changes passed eight targeted checks and all pre-push checks.

---

## 2026-10-08 (~01:41) - v0.2.122 - Clean up sidebar style experiments - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.122
- Reviewed session diff across TUI config, palette, HeaderButton, and config tests. Removed unused labeled-layout wrapper; button remains full-width and non-shrinking.
- Made resolved sidebar_button_style required; removed redundant component default/style accessor. Consolidated repeated hover color expressions.
- Removed obsolete trial-name assertions; retained accepted-values, invalid-value, default, live switching, and input-immutability checks.
- Verification: two targeted sidebar style tests passed, seven assertions; searched renderer for discarded style remnants. No build or live layout check run. Kept once-per-session revision bump.

### User
Sidebar
- Cleaned up the button-style experiments, keeping Outline and Minimal with the same controls and hover behavior.

---

## 2026-10-08 (~01:39) - v0.2.122 - Left-align Outline button text - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.122
- Changed HeaderButton justifyContent to flex-start; Outline text now left-aligned with existing inner padding.
- Verification: inspected shared layout; cosmetic one-line change, no tests or build run. Kept once-per-session revision bump.

### User
Sidebar
- Outline button text now aligns left.

---

## 2026-10-08 (~01:37) - v0.2.122 - Keep Outline and Minimal button styles - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.122
- Reduced oc picker to Outline (existing outlined config value) and Minimal (minimal, default). Removed labeled/brackets schema choices and label column.
- Minimal uses left-aligned compact [ value ] on one non-wrapping row per control; Outline retains square border and centered text.
- Verification: two targeted sidebar style tests passed, ten assertions. Current user tui.json uses outlined and stays valid. Kept once-per-session revision bump.

### User
Sidebar
- Sidebar button style now offers only Outline and Minimal; Minimal fits each button on a single line.

---

## 2026-10-08 (~01:35) - v0.2.122 - Remove selector button style - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.122
- Removed selectors from TUI schema and oc palette; removed shared HeaderButton indicators and selector background branch. Remaining styles: brackets, outlined, labeled.
- Verification: two targeted sidebar style tests passed, nine assertions. Confirmed user tui.json selects labeled, so removal does not invalidate current saved config. Kept once-per-session revision bump.

### User
Sidebar
- Removed Selectors from the sidebar button style picker; Brackets, Outlined, and Labeled remain.

---

## 2026-10-08 (~01:33) - v0.2.122 - Square sidebar button corners - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.122
- Changed shared HeaderButton borderStyle from rounded to single; outlined and selector buttons now use square corners.
- Verification: confirmed single in installed OpenTUI BorderStyle definition; cosmetic-only change, no tests or build run. Kept once-per-session revision bump.

### User
Sidebar
- Sidebar buttons now use flat rectangular outlines with square corners.

---

## 2026-10-08 (~01:31) - v0.2.122 - Reduce sidebar button hover highlight - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.122
- Removed HeaderButton hover background change across all four styles; text, indicator, brackets, and outline use hover color. Selector base background stays constant.
- Verification: inspected shared render path; cosmetic-only change, no tests or build run. Kept once-per-session revision bump.

### User
Sidebar
- Hovering sidebar buttons now changes only the text and outline color, without the background glow.

---

## 2026-10-08 (~01:29) - v0.2.122 - Live sidebar button style picker - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.122
- Added oc palette Sidebar button style and /sidebarButtonStyle; picks all four styles, applies immediately through TuiConfig signal, saves sidebar_button_style in global TUI config.
- Reused keybind persistence as persistTuiSetting; preserves JSONC comments and jsonc-over-json precedence. Save errors explicitly report live-only application.
- Verification: two sidebar style config tests passed, nine assertions; live palette/visual check not run. Revision already bumped once this session; concurrent session advanced version to 0.2.122.

### User
Sidebar
- Choose Sidebar button style in the oc palette to compare all four styles immediately and save your selection.

---

## 2026-10-08 (~01:28) - v0.2.122 - Automatic session in-progress, /imp-scoped completion - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low; Implementation (/imp of plan `~/.config/opencode/plans/2026-10-08-session-status-auto.md`); completed
- Version: 0.2.122
- Added `SessionPrompt.prompt`: non-`noReply` prompt on root session (no `parentID`) calls `setSessionInProgress(true)`; reopens complete/failed with zero tokens
- Removed `session_in_progress` tool (+ `.txt`, registry entry, agent defaults `session_in_progress`/`session_reopen`, TUI reopen title). Kept config schema keys `session_in_progress`/`session_reopen` in `core/v1/config/permission.ts` so existing configs decode; TODO remove with SDK regen if wanted
- Changed `session_complete` default `ask` -> `deny` (`agent/agent.ts`); denied tools are hidden from the model (`llm/request.ts resolveTools`)
- Added command frontmatter `permission` (`ConfigCommandV1.Info`, `allow|deny` only); `Command.Info` carries it server-side only (TS type, not public schema)
- Added `TurnInput.turnTools` (internal): `command()` stores permission as user message `tools` without persisting to session; `runLoop` merges `lastUser.tools` into a per-turn ruleset used by `SessionTools.resolve` and `handle.process`
- Note: before this, command `permission:` frontmatter (imp.md, spit.md) was silently ignored
- Changed `session-complete.txt`: call only when main implementation goal delivered and required checks passed
- Changed user file `~/.opencode/commands/imp.md`: `doom_loop: ask` -> `session_complete: allow` (`ask` no longer decodes in command permission)
- Verification: new `prompt.test.ts` tests "prompt reopens a complete session..." and "command permission applies to its own turn only" pass; `task.test.ts` 33 pass, 1 fail `description sorts subagents...` timeout (also fails on stashed baseline); tsgo clean in opencode/core/tui; `client` generate produced no diff
- MISTAKE: ran `git stash` to check baseline while user/other-session changes were in the worktree (buildNotes.md); pop restored them, but never stash shared worktrees: use a `git worktree` instead
- Note: concurrent session edits in `tui/src/config/index.tsx`, `sidebar-tools.tsx`, `tui/test/config.test.tsx` left untouched

### User
Session status
- Sending a prompt now automatically marks the session in progress, including reopening a session that was complete or failed.
- Only `/imp` can mark a session complete, and only when its main implementation goal is done; other agents no longer see the completion tool.
- The agent tool for marking a session in progress was removed since oc now does it automatically.

Commands
- `permission:` in a command file's frontmatter now works and applies only to that command's turn; values must be `allow` or `deny`.

---

## 2026-10-08 (~01:27) - v0.2.121 - Sidebar button style comparison - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.121
- Added TuiConfig.Info.sidebar_button_style: brackets (default), outlined, selectors, labeled.
- Replaced sidebar session/model/reasoning text actions with shared HeaderButton; rounded borders for outlined/selectors, labels for labeled, full-control hover backgrounds. Preserved session/model picker and reasoning-cycle handlers; reasoning indicator uses ↻.
- Verification: new config validation test passed (1 test, 5 assertions); no build or live visual comparison run. User comparison remains required for terminal layout and mouse hit areas.

### User
Sidebar
- Session, model, and effort controls now have four selectable button styles in tui.json.
- Brackets are the default; outlined, selectors, and labeled styles are available for comparison.

---

## 2026-10-08 (~01:12) - v0.2.120 - Rotate buildNotes.md to archive7 - Opus 5.5, medium reasoning; Agent

### Agent
- Meta: Opus 5.5; medium; Agent; completed. Notes-only rotation after commit e4d73d1; no version bump.
- Version: 0.2.120
- Moved 1176-line `buildNotes.md` verbatim to `buildNotes.archive7.md` (SHA-256 checked before/after). Fresh file keeps human rules and agent header verbatim; Cumulative Summary now also covers v0.2.88 through v0.2.120.
- Verification: header lines compared against archive7 lines 1-60; archive unchanged.

### User
Notes
- Older history (v0.2.88 to v0.2.120) moved to `buildNotes.archive7.md`; this file starts fresh with an updated summary. No app change.
