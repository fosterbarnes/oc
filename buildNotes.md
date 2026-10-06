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
