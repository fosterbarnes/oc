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
- The separate "Loading plugins…" spinner at the bottom no longer shows during startup.

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
