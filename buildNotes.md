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
- Kept histories verbatim: archive1 (2026-08-20 through 09-09), archive2 (09-09 through 09-15), archive3 (09-15 through 09-28), archive4 (previous active file, 1144 lines). Earlier archive hashes and detailed cumulative summaries remain in archive4. Never edit archives.
- Added local PowerShell build/check/run/install/push/update/sync scripts; isolated upstream checkout; fail-closed content-level three-way apply; build/install split; installer stops managed processes before building and recreates hard links.
- Changed `.version/version` to one X.Y.Z line, final component revision; maintenance display separate from package version. Archive4 r19 records migration; old push second-line reset corrected in current scripts.
- Added session bootstrap, global session listing, complete/failed flags, persisted model overrides; lazy CLI startup; command-palette ordering; model hiding; slash commands anywhere; friendly agent names and Tab order.
- Added native OC configuration, resident server lifecycle/shutdown/restart and auto-start; reconnect waits for disposal/replacement without replay; stale launcher records no longer trigger unnecessary waits.
- Added isolated ocdebug port 4097; first-run production config/assets seeding and import; bare oc and relative targets use separately configurable directories; project picker opens TUI palette.
- Added built-in browser providers through Agentify/Edge; native Cursor provider and proxy; lazy packaging beside executable; tool cancellation, SSRF/symlink/git credential protections; context tiers and pricing; compaction and empty-tool handling; disabled native Cursor plan mode.
- Removed browser UI/Electron packages, process-tree helper, and Poe integration. Windows child processes use normal spawn plus hidden process-tree termination; avoid Bun 1.4.0 Windows TUI FFI runtime.
- Added instructionsByModel with model-glob files/base prompts; custom agents under plural agents directory; model CLI precedence and per-session overrides; disabled stock plan agent using disable key.
- Kept SuperPlan read-only capability contract and exact absolute planPath through execution; Go/Go-a split, explicit execution routing; background subagent option. Never reconstruct plan filenames.
- Added sidebar scripts/configuration, weekly usage provider selection and Claude OAuth usage; Everything auto-start/reconnect; image clipboard file-drop/temp PNG handling; WezTerm GUI executable mapped to sibling CLI executable.
- Fixed question cancellation/publish race, dialog key ownership, pending question/permission reload on reconnect; server exit still rejects pending questions.
- Added DB unknown-migration refusal after stock OpenCode 2.0.6 changed shared database; restore backup and isolate stock build data. Local sqlite3 3.22 cannot DROP COLUMN.
- Kept upstream ports for Gemini thinking defaults, Bedrock tool-result images, GPT-6 Codex allowlist and debug credential redaction; working Luna route openai/gpt-6-luna; Poe GPT-5.6 routes failed.
- MISTAKE: PowerShell HOME read-only; use testHome and verify filesystem isolation. Never reconstruct plan paths. Parallel proxy edits can report rejection despite applying; issue edits one at a time.
- ERROR / baseline: `bun typecheck` clean in opencode and tui as of v0.2.23 (old local.tsx:188 diagnostic gone); full tests have unrelated event/session-bootstrap/plugin failures; two Instruction.system tests discover home AGENTS.md. Live provider/terminal checks often require user installation.
- Latest archive4 sessions removed Poe assets/dependency and simplified revision file; current source and README remain authoritative for other work. Historical entries and detailed fixes preserved in archive4.
- Removed (2026-09-30 doc cleanup): r20 entry (`.scripts/lib/stopResidents.ps1`, sidebar elevated installer/sendoff) superseded by r21 `safeShutdown.ps1`; v0.2.22 plugin-era bullets (`plugins/runAfterTurn.ts`, `tuiPlugins/hardRevive.ts`) superseded by native `run_after_turn` and `/hard-revive`. Deleted `Custom Feature List.md`.
- MISTAKE (r20): agent called force-kill "safe cancellation" and edited during read-only discussion; cancellation must be explicit and agents never run installers.

## User
- Local scripts build, check, run, install and sync this fork. Upstream changes are reviewed against a separate checkout. Agents do not run live installers.
- The footer displays the maintenance version. Model choices, custom agents, settings, project selection and sessions have native persistent controls.
- Production and debug use separate resident servers and settings. Debug can import production settings; startup and reconnect avoid replaying prompts.
- Browser providers and native Cursor run through packaged helpers. Poe, the browser UI and Electron desktop app were removed.
- Sidebar scripts, provider usage, Everything Search and Windows clipboard integration are built in. Questions respect dialogs and recover after reconnecting.
- The database refuses migrations from an incompatible build. SuperPlan remains read-only, and execution uses the exact approved plan path.

# Historical entries (newest first)

---

## 2026-10-01 (~23:28) - v0.2.63 - Fix all baseline test failures - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed; same session as previous entry, revision not bumped again
- Version: 0.2.63
- Fixed `opencode/test/provider/claude-code/unattended-replay.test.ts`: assertions passed; `rmSync` hit EBUSY because the fake CLI still held its cwd. Now `await deleteActiveProcessAndWait(sessionKey(...))` before cleanup, matching `silent-turn.test.ts`.
- Fixed `opencode/test/cli/acp/lifecycle.test.ts` "stdin EOF exits cleanly": exit wait 5 s -> 20 s; cold subprocess boot passes 5 s under full-suite load (passes alone in 5 s). Line also exists upstream; small conflict risk.
- Fixed `core/test/npm-config.test.ts`: `C:\Users\user` has `package.json`, so npm's project-root walk-up from `%TEMP%` read the home `.npmrc`. Added `project(npmrc)` helper writing `package.json` + `.npmrc`. Source `npm-config.ts` unchanged (correct npm behavior).
- Fixed `tui/test/runtime.test.tsx`: expected `~/project`; `abbreviateHome` uses `path.sep`, so expect `"~" + path.sep + "project"`.
- Removed `tui/test/debug-temp-frame.test.tsx`, `debug-temp-spooky-repro.test.tsx`, `debug-temp-spooky2.test.tsx` (user approved): self-labeled temporary repros reading a hard-coded `%TEMP%\opencode-debug`; caused unhandled errors between tests.
- Changed `AGENTS.md` `### Known failures`: list cleared.
- Checked fork provider tests (claude-code 42 files, cursor 11): 625 pass, 47 s total, cover fork-only code; kept all.
- Verification: unattended-replay 3/3 pass; acp lifecycle file 6 pass; npm-config 5 pass; tui full suite 321 pass, 0 fail, 18 s; `bun typecheck` clean in core, opencode, schema, tui. Full core/opencode suites not rerun (opencode ~19 min; ask user).

### User
Tests
- Every test failure from the baseline run is fixed, so a red result now means something actually broke.
- Removed three leftover debug test files from the TUI package.
- No app behavior or UI change; only tests changed.

---

## 2026-10-01 (~23:20) - v0.2.63 - Agent check budget and test baseline - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.63
- Cause: agents looped 20 min full suites at session end; every package except client fails at baseline, so agents chased unrelated failures; global principles mandated a full suite on every finish.
- Added `AGENTS.md` Testing: `--timeout 30000` rule, `### Check budget` (full suite only after user yes in chat; scoped checks free; 2-attempt stop rule), `### Known failures` baseline.
- Changed `~/.config/opencode/principles.md` Verification cadence: no full suite without asking; added stop rule.
- Fixed `packages/schema/test/contract-hygiene.test.ts`, `v1-isolation.test.ts`: `new URL(...).pathname` gave `/C:/...` ENOENT on Windows; now `${import.meta.dir}/../src`.
- Baseline timings (2026-10-01): opencode 18.8 min (4437 pass, 2 fail), core 2.2 min (5 fail), tui 18 s (4 fail), schema/client under 1 s.
- TODO: delete stray tracked `packages/tui/test/debug-temp-*.test.tsx` (commit 2f5a5cd, not upstream) with user approval; investigate core NpmConfig registry failures.
- Verification: schema `bun test` 15 pass, 0 fail. Full baseline run of core, schema, opencode, tui, client done before fix.

### User
Agent workflow
- Agents must now ask you before running any full test suite, with the packages, reason, and expected time.
- Agents stop and report after two failed fix attempts on the same check instead of looping.
- Known pre-existing test failures are listed in AGENTS.md so agents ignore them.
- Two schema tests that always failed on Windows now pass. No UI change.

---

## 2026-10-01 (~22:51) - v0.2.62 - Safe-shutdown and revive session cleanup pass - Claude Opus 5.5, low effort; Pass

### Agent
- Meta: Claude Opus 5.5; low effort; Pass; completed; scoped to v0.2.46-v0.2.60 safe-shutdown/revive work
- Version: 0.2.62
- Removed revive timing probes now that diagnosis is done: `OcConfig.stopServer` `requestMs`/`exitMs` return fields, `ServerShutdown.prepare` `server shutdown prepared` log and timers.
- Trimmed `test/server/httpapi-global.test.ts` layer to `SessionWork` + `InstanceStore` (dropped Database, EventV2, SessionProjector, SessionExecution leftovers from v0.2.46; `prepare` no longer touches V2).
- Reviewed, kept: `SessionWork` gate + 30s detached-close timeout; graceful `stopServer` with SIGKILL fallback; `shutdownAll` close-windows-first order; `launchDetached` (exe/.ps1); TUI WezTerm kill; revive scripts; `setReviveConsolePosition.ps1`; parallel `PreviousCommand` startup; kept-unused `cancelled_seq` migration (required by live DB).
- Kept (not ours): untracked `.scripts/desktop.ini` (Explorer metadata).
- Verification: `httpapi-global`, `shutdown`, `config/oc` tests 21 pass. Typecheck skipped per user.

### User
Cleanup
- Removed temporary timing measurements from shutdown now that revive is fast; no behavior change.

---

## 2026-10-01 (~23:10) - v0.2.61 - Intro reads stdin so Windows resizes arrive - Claude Opus 5.5, low effort; Debug

### Agent
- Meta: Claude Opus 5.5; low effort; Debug; completed
- Version: 0.2.61
- ERROR: v0.2.60 polling never saw FancyZones resize. Confirmed live (Bun probe in `wezterm-gui start`): without stdin reads, `getWindowSize()` and `stdout.columns` stay 80x24 for 6s after the snap and no `resize` event fires; with `stdin.setRawMode(true)` + `resume()` they report 238x89 within 200ms and `resize` fires. Root cause: Bun/libuv on Windows only refreshes console size while the TTY is being read; the cached size is what `getWindowSize` returns.
- Changed `packages/opencode/src/cli/intro.ts`: when stdin is a TTY, intro holds it in raw mode and resumes it (keys discarded); `stop` sets raw off and pauses before the attach TUI spawns. Kept the per-tick size check.
- Verification: opencode `bun typecheck` clean. Live harness (source `startIntro`) in WezTerm: snapped window fully black with logo centered; maximize mid-intro redrew clean and centered; after stop `isRaw=false paused=true`. `.scripts\build.ps1` run. Not yet verified via installed `occ.lnk` + TUI handoff.

### User
Startup
- The startup animation now fills and re-centers after the window is snapped into place, and when resized during startup.

---

## 2026-10-01 (~22:42) - v0.2.60 - Intro polls console size each tick - Claude Opus 5.5, low effort; Debug

### Agent
- Meta: Claude Opus 5.5; low effort; Debug; completed
- Version: 0.2.60
- ERROR: v0.2.59 `SIGWINCH` intro resize also never fired live. User clue: started when `occ.lnk` switched to `occ.exe` directly (v0.2.53). Cause: Bun on Windows reports console resizes only while stdin is being read (opentui reads stdin; previously `pwsh` hosted occ). The intro never reads stdin, so neither stdout `resize` nor `SIGWINCH` arrives.
- Changed `packages/opencode/src/cli/intro.ts`: each 15ms tick calls `stdout.getWindowSize()`; on change, re-center, clear, repaint painted columns. Ticks continue after the animation finishes until `stopIntro`, so late resizes still redraw. No listeners.
- Risk: if Bun's `getWindowSize()` returns a cached size, this also fails; next step would be reading stdin (raw) during the intro.
- Verification: opencode `bun typecheck` clean. Not run live.

### User
Startup
- The startup animation checks the window size continuously, so it fills and re-centers after the window is snapped into place.

---

## 2026-10-01 (~22:40) - v0.2.59 - Intro resize via SIGWINCH - Claude Opus 5.5, low effort; Debug

### Agent
- Meta: Claude Opus 5.5; low effort; Debug; completed
- Version: 0.2.59
- ERROR: v0.2.58 intro `stdout.on("resize")` never fired live (Bun on Windows); intro stayed in the initial small box after FancyZones resize.
- Changed `packages/opencode/src/cli/intro.ts`: listen on `process.on("SIGWINCH")` and read `stdout.columns`/`rows`, matching opentui's renderer (`sigwinchHandler` in `@opentui/core` chunk), which resizes correctly in the live TUI. Redraw clears and repaints painted columns at the new center; listener removed on stop.
- MISTAKE: v0.2.58 shipped an unverified Windows resize path. Tried to verify `getWindowSize` in a `start`-spawned console; Bun did not start there (3 attempts), so no evidence either way. Prefer the mechanism a working component already uses.
- Verification: opencode `bun typecheck` clean. Not run live.

### User
Startup
- Second attempt at making the startup animation fill the window after it is snapped into place.

---

## 2026-10-01 (~22:35) - v0.2.58 - Intro animation follows window resizes - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.58
- Fixed `packages/opencode/src/cli/intro.ts` `startIntro`: center/row were computed once and the black clear covered only the initial size, so a FancyZones resize after launch left the intro in a small black box. Cause surfaced because v0.2.53 `occ.lnk` runs `occ.exe` directly (no ~3.3s pwsh profile before first paint). Added `layout()` + stdout `resize` listener: recompute, clear, repaint painted columns; removed on stop.
- Verification: opencode `bun typecheck` clean; no intro tests exist. Not run live.

### User
Startup
- The startup animation now fills and re-centers in the whole window when the window is resized or snapped into place.

---

## 2026-10-01 (~22:29) - v0.2.57 - Revive runs .ps1 directly, no compiled wrappers - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed; supersedes v0.2.56 centering block
- Version: 0.2.57
- Added `packages/core/src/util/launch-detached.ts` `launchDetached(file, args)`: exe -> detached spawn; `.ps1` -> `cmd /d /c start "<script basename>" pwsh -NoProfile -File "<file>" "<args>"` (windowsVerbatimArguments; `start` gives a new visible console outside WezTerm). Returns unref'd child.
- Changed TUI `reviveCommands` and `run_after_turn` to use it; tool text/param now say exe or `.ps1`. Fixed README limit note: detached `pwsh` no longer an issue for `.ps1`.
- Changed `oc.json` `revive.exe`/`installExe` to `.scripts/revive.ps1`/`reviveAndInstall.ps1` (keys unchanged). Removed `revive.exe`/`reviveAndInstall.exe` pwsh72exe wrappers; scripts now use `$PSScriptRoot` (no temp copy). Removed v0.2.56 Add-Type centering block.
- Added `.scripts/setReviveConsolePosition.ps1`: one-time, measures its own conhost window and writes centered `WindowPosition` to `HKCU\Console\revive` and `HKCU\Console\reviveAndInstall` (conhost applies per-title settings; zero runtime cost). Ran it via `launchDetached`: saved 1236,692.
- Updated `SCRIPTS.md` revive rows (removed safeShutdown/pwshXer rows).
- MISTAKE: first live probe of the `.ps1` path used `bun -e` with Windows paths in a template literal; escapes mangled the path and looked like a launcher failure. Use a `.ts` file with `String.raw` for Windows-path probes.
- Verification: core/opencode/tui `bun typecheck` clean; `test/tool/run-after-turn.test.ts` 2 pass; `launchDetached` `.ps1` path verified end to end (setup script ran in a new console and wrote both registry values). `/revive` not run live.

### User
Revive
- `/revive` and `/revive-no-install` run the PowerShell scripts directly; the compiled `.exe` wrappers are gone, so editing a script takes effect immediately.
- The revive console window opens centered, using a saved Windows console setting instead of code that runs each time.
- Agents' run-after-turn tool can now queue `.ps1` scripts as well as programs.

---

## 2026-10-01 (~22:21) - v0.2.56 - Center the revive install console - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.56
- Added centering block at top of `.scripts/reviveAndInstall.ps1`: minimal `Add-Type` (`Revive.Win`: GetConsoleWindow, SetProcessDpiAwarenessContext(-4 = per-monitor v2), GetSystemMetrics, GetWindowRect, MoveWindow), true screen center instead of profile `cntr` hardcoded coords. No profile load. Rebuilt `reviveAndInstall.exe`.
- Verification: parser clean; block run alone in a new `pwsh -NoProfile` console, 768ms total including pwsh start, no errors. Not run via live `/revive`.

### User
Revive
- The `/revive` install window now opens centered on screen.

---

## 2026-10-01 (~22:18) - v0.2.55 - Revive closes WezTerm immediately - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.55
- Measured v0.2.54 live revive: downtime ~2.8s (shutdown prepared 22:15:35.301, WezTerm 36.528, server 36.738, attach 38.116). User confirmed Defender exclusion for `Apps\opencode` and `dist` is in place.
- Changed `packages/tui/src/app.tsx` `reviveCommands` run: after spawning the detached revive exe, `taskkill /F /IM wezterm-gui.exe` (win32). Window closes at once; revive helper (own pwsh72exe console) does build/shutdown/install in background. `shutdownAll` still kills WezTerm too (harmless no-op by then). TODO comment shared with `shutdownAll` for oc-only windows.
- Risk: if `/revive` build fails, no oc window remains; the revive console shows the error.
- Verification: tui `bun typecheck` clean. Not run live.

### User
Revive
- `/revive` and `/revive-no-install` close WezTerm right away; shutdown, build, and install continue in the background before oc reopens.

---

## 2026-10-01 (~22:14) - v0.2.54 - Start resident server alongside revive relaunch - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.54
- Measured v0.2.53 live revive: downtime ~12s -> ~4.9s (shutdown prepared 22:11:40.126, WezTerm 40.797, occ 41.079, server process 44.605, attach 44.974). 3.5s inside occ before server exists.
- Measured warm: closed-port health fetch 2ms (not a cost); `pwsh` Start-Process hop 1.17s; `oc config get` 0.5s; `session previous` 0.65s (parallel since v0.2.53, off critical path). Remainder suspected first-run Defender scan of new exe; exclusion state unknown (Get-MpPreference needs admin).
- Changed `.scripts/revive.ps1`, `reviveAndInstall.ps1`: `Start-Process oc.exe oc server start -WindowStyle Hidden` before `Invoke-Item occ.lnk`, so the resident spawn hop overlaps WezTerm/occ startup; occ joins via `startServer` lock + reuse. Rebuilt both pwsh72exe wrappers.
- Kept `spawnResident` pwsh hop: libuv children sit in a KILL_ON_JOB_CLOSE job and Bun/Node hops cannot escape it; only non-libuv creator (Start-Process) gives a hidden console outside the job. TODO: direct `CreateProcessW` (CREATE_NEW_CONSOLE|CREATE_BREAKAWAY_FROM_JOB, SW_HIDE) via `bun:ffi` once Windows FFI pointer crash (AGENTS.md, Bun 1.4.0) is confirmed fixed.
- Decided chunk B (native `oc --revive`) low value now: the wrapper's pwsh start happens before shutdown, not during downtime.
- Verification: scripts reviewed; not run live.

### User
Revive
- `/revive` starts the oc server at the same time as the new WezTerm window, instead of waiting for oc to start it, cutting about a second more off the restart.

---

## 2026-10-01 (~22:09) - v0.2.53 - Cut revive relaunch gaps - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed; revive speed, from timing probe
- Version: 0.2.53
- Measured (`%TEMP%\reviveTiming.log` + process CreationDate): shutdown 0.6s, copy 0.2s, install `--version`/`config get` checks 3.3s, `pwsh -NoExit` profile load 3.3s, `occ` pre-server 3.6s, server boot+attach 0.4s. Server `/global/shutdown` itself ~0.15s.
- Removed 6 post-install exe runs from `.scripts/install.ps1` (each ~0.55s, Defender first-run scan suspected). Removed timing probe lines; restored `reviveAndInstall.ps1` and rebuilt its pwsh72exe wrapper.
- Changed `Desktop\occ.lnk` args to `start --cwd "C:\Users\user" -- C:\Users\user\Apps\opencode\occ.exe` (no pwsh/profile; tab closes when occ exits). Backup `%TEMP%\occ.lnk.bak`. Profile env vars moved to User scope by user.
- Changed `cli/cmd/oc.ts` `PreviousCommand`: `OcConfig.read`, `session previous` subprocess, and `startServer` now run via `Promise.all` instead of serially.
- Kept: user deleted `.scripts/safeShutdown.ps1`/`.exe` (not agent).
- TODO: resident server `pwsh` `Start-Process` hop (`config/oc.ts` spawnResident, ~0.7s); `session previous` still spawns a full second process; chunk B native `oc --revive`.
- Verification: opencode `bun typecheck` clean; `oc` + `command-loader` tests 22 pass. Not run live.

### User
Revive and launch
- `/revive` no longer runs six check commands after installing, saving about 3 seconds.
- The `occ` desktop shortcut starts oc directly instead of through PowerShell, saving about 3 seconds on every launch; the tab now closes when oc exits.
- `occ` starts the server while it looks up your last session, instead of one after the other.

---

## 2026-10-01 (~22:00) - v0.2.52 - Faster revive: build first, close windows first, shutdown timings - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed; revive speed chunk A
- Version: 0.2.52
- Changed `.scripts/reviveAndInstall.ps1`: `build.ps1` runs first while oc is still up, then `oc.exe --shutdown-all`, then `install.ps1 -NoBuild @args`, then `occ.lnk`. Downtime is shutdown + copy + relaunch. `install.ps1`'s `assertExternalInstall` passes because the host pid is dead by then; `build.ps1` `closeOut` only sleeps when it is the `-File` target. Rebuilt `reviveAndInstall.exe` (pwsh72exe, console, noprofile).
- Changed `OcConfig.shutdownAll` order: read resident pids, `taskkill /F /IM wezterm-gui.exe`, force-kill non-server oc pids, then graceful `stopServer` both residents in parallel, then kill leftovers. Removes the "Unable to connect" screen gap.
- Added timings: `stopServer` returns `requestMs` (POST `/global/shutdown`) and `exitMs` (wait for exit); `ServerShutdown.prepare` logs `server shutdown prepared` with `workCloseMs`/`disposeMs`. Printed by `--shutdown-all` JSON in the revive console.
- TODO: chunk B native `oc --revive [--install]` (TUI spawns directly; install from new `dist\opencode.exe`; relaunch `wezterm-gui start -- occ.exe`, no pwsh). User env vars from profile to be moved to User scope by user (commands given). Chunk C: fix slow step shown by timings.
- Verification: opencode `bun typecheck` clean; `oc`, `command-loader`, `shutdown`, `httpapi-global` tests 30 pass. Not run live.

### User
Revive
- `/revive` now builds before closing oc, so oc is only down for the install and restart instead of the whole build.
- WezTerm windows close right away instead of showing an "Unable to connect" error while the servers stop.
- The revive console now prints how long each server took to shut down, so the slow part can be found.

---

## 2026-10-01 (~21:50) - v0.2.51 - Revive kills all WezTerm windows - Claude Opus 5.5, low effort; Debug

### Agent
- Meta: Claude Opus 5.5; low effort; Debug; completed (band-aid per user)
- Version: 0.2.51
- ERROR: v0.2.50 pre-stop parent-chain snapshot still left the oc WezTerm window open on live `/revive`. Root cause not investigated (user chose band-aid); suspect oc's process chain does not lead back to `wezterm-gui.exe` (e.g. hidden `Start-Process` hops).
- Removed `snapshotOcProcesses`/`weztermAncestor` (CIM parent walk). Added `ocProcessIds()` via `tasklist /FO CSV /NH` (no pwsh startup). `shutdownAll` now stops servers, force-kills other oc pids, then `taskkill /F /IM wezterm-gui.exe`. TODO comment left in `shutdownAll` to restore oc-only window closing.
- Verification: opencode `bun typecheck` clean; `test/config/oc.test.ts` + `test/cli/command-loader.test.ts` 22 pass. Not run live.

### User
Revive
- `/revive` now closes every WezTerm window so the old oc window reliably goes away; closing only oc windows is a later fix.

---

## 2026-10-01 (~21:48) - v0.2.50 - Close oc WezTerm windows on revive - Claude Opus 5.5, low effort; Debug

### Agent
- Meta: Claude Opus 5.5; low effort; Debug; completed
- Version: 0.2.50
- Fixed `OcConfig.shutdownAll`: WezTerm windows hosting oc stayed open after `/revive`. Cause: TUIs exit by themselves once their server stops ("Unable to connect"), so the post-stop snapshot found no oc processes and no WezTerm ancestors. Now snapshots windows before stopping servers, snapshots oc processes after, then force-kills both.
- Refactored `killOcProcesses` into `snapshotOcProcesses()` (returns `ours`, `windows`) + `forceKill(pids)`; `stopServer` killTuis path uses them.
- Verification: opencode `bun typecheck` clean; `test/config/oc.test.ts` + `test/cli/command-loader.test.ts` 22 pass. Not run live.

### User
Revive
- The WezTerm windows that were running oc now close during `/revive` instead of staying open with an error.

---

## 2026-10-01 (~21:43) - v0.2.49 - Revive uses oc --shutdown-all, no elevation - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed; safe-shutdown chunk 3
- Version: 0.2.49
- Changed `.scripts/revive.ps1` and `reviveAndInstall.ps1`: run `C:\Users\user\Apps\opencode\oc.exe --shutdown-all` in-process, exit on nonzero, then install (install variant) and open `Desktop\occ.lnk`. Removed admin check, `-Verb RunAs` self-relaunch, `safeShutdown.exe`, and profile `launch`/`waitFor` dependencies. FancyZones concern gone: nothing runs elevated.
- Kept: `oc.exe` exits before `install.ps1`, so the installed binary is not locked during replacement.
- Rebuilt `revive.exe`/`reviveAndInstall.exe` with `pwsh72exe.Cli create` (pwsh 7, visible console per user, `-noprofile`, no admin); old wrappers backed up to `%TEMP%/reviveExeOld`. CLI needs forward-slash `-script` paths (backslashes gave "script was not found").
- TODO: `safeShutdown.ps1`/`.exe` now unused; delete after live sign-off.
- Verification: script content reviewed only; not executed (would kill host session).

### User
Revive
- `/revive` and `/revive-no-install` no longer ask for admin rights and use oc's own shutdown instead of the old safe-shutdown script.

---

## 2026-10-01 (~21:41) - v0.2.48 - Graceful kill-server and oc --shutdown-all - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed; safe-shutdown chunk 2 of plan (supervisor command)
- Version: 0.2.48
- Changed `config/oc.ts` `stopServer`: POST `/global/shutdown` with the directory's `oc-server.secret` (35s timeout), wait 5s for exit, SIGKILL fallback, throw if still alive. Fixes v0.2.47 TODO: `--kill-server` no longer hard-kills first.
- Replaced `killTuiProcesses` with `killOcProcesses(closeWindows)`: one `Get-CimInstance Win32_Process` snapshot (pid, parent, name), `taskkill /F /PID` per oc binary except self. Names mirror `safeShutdown.ps1`. `--kill-server` keeps windows open.
- Added `OcConfig.shutdownAll` + `oc --shutdown-all`: stops `state\opencode` and `state\opencode-debug` residents in parallel, then kills `wezterm-gui.exe` ancestors of oc processes and the oc processes. No elevation. No `taskkill /T`: a revive helper descends from the TUI being replaced.
- Updated `cli/command-loader.ts` flag routing and `cli/cmd/oc.ts` flag exclusivity check.
- Risk: WezTerm may host several windows in one `wezterm-gui` process; killing it closes all of them, including plain shell windows. User accepted; revisit if it bites.
- TODO: next chunk swaps `revive.ps1`/`reviveAndInstall.ps1` from elevated `safeShutdown.exe` to `oc --shutdown-all`.
- Verification: opencode `bun typecheck` clean; `test/config/oc.test.ts` + `test/cli/command-loader.test.ts` 22 pass. `--shutdown-all` not run live (would kill the host session).

### User
Shutdown
- `oc --kill-server` now asks the server to stop running work and exit cleanly, and only force-stops it if it hangs.
- New `oc --shutdown-all` stops both the normal and debug servers, closes every oc process, and closes the WezTerm windows running oc, without needing admin rights.

---

## 2026-10-01 (~21:26) - v0.2.47 - Trim safe shutdown to the legacy path - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed cleanup of v0.2.46
- Version: 0.2.47
- Removed v0.2.46 V2 durable prompt cancellation: `session.next.prompt.cancelled`, `Admitted.cancelledSeq`, `SessionInput.cancelPending`/`projectCancelled`, projector/updater hooks, pending-query filters. User direction: V2 inbox unused by TUI; do not prep for V2. Legacy queued prompts are in-memory, so they already drop on exit.
- Removed `SessionWork` wrapping from V2 `session.ts` prompt and `execution/local.ts`; reverted those files to HEAD. `server.ts` group now `[SessionV2.node, SessionWork.node]`.
- Changed `server/shutdown.ts` `prepare`: close `SessionWork` -> dispose instances. `close` is uninterruptible, so await it from a `forkDetach` fiber with a 30s `timeoutOrElse` warning; a stuck tool cannot hang exit.
- Changed `/global/restart` to use the cached `prepareShutdown` too.
- Fixed command-template `` !`cmd` `` substitution: spawn/run failure yields "" again (old `nothrow`) instead of `orDie`.
- Kept migration `20261002003418_sessionInputCancellation` and nullable `session_input.cancelled_seq` as unused schema: the live DB already applied it, and `DatabaseMigration.apply` refuses unknown ids. Regenerated schema via `bun script/migration.ts --name`, then renamed the file back to the original id. MISTAKE: first deleted the migration; check `migration` table in the live DB before removing any shipped migration.
- Regenerated Client and legacy SDK types; remaining Client diff is pre-existing `sessionInProgress | null` drift. Updated tests: `shutdown.test.ts` drops pending-input checks; Schema manifest counts 58/89/89/35.
- TODO: `--kill-server` (`OcConfig.stopServer`) still SIGTERMs the pid (hard kill on Windows) and skips graceful shutdown; route through `/global/shutdown` in the `oc safe-shutdown` chunk.
- Verification: core `migration.ts --check` clean; core/opencode/schema/client `bun typecheck` clean; core `session-work` + `session-prompt` 26 pass; opencode `shutdown`, `httpapi-global`, `event-manifest` 10 pass; schema `event-manifest` 2 pass.

### User
Safe shutdown
- Shut Down and Restart now stop running agent work before the server exits, and give up waiting after 30 seconds.
- The database column added in the previous version stays but is unused, so already-updated databases keep working.
- A failing shell command inside a custom command template inserts empty text again instead of failing the prompt.

---

## 2026-10-01 (~21:09) - v0.2.46 - Native server-side safe shutdown - GPT-6.1 Sol, effort not exposed; Implementation

### Agent
- Meta: GPT-6.1 Sol; effort not exposed; Implementation; completed server-side chunk
- Version: 0.2.46
- Added Core `session/work.ts` process-local scoped admission/cancellation boundary; shared by V2 admission/execution and legacy prompt, command, shell, subagent prompt operations, and run-state execution. Closing rejects new work and awaits interrupted-work cleanup, including atomic admissions already underway.
- Added `server/shutdown.ts` preparation: close work boundary, join remaining V2 coordinator owners, cancel durable pending inputs, dispose instances. `/global/shutdown` coalesces preparation before scheduling existing process-exit controller; server graph exposes shared execution/work services.
- Added `session.next.prompt.cancelled`, `Admitted.cancelledSeq`, `session_input.cancelled_seq`, projection and pending-query filters. Retained retry identities; cancelled inputs cannot promote or wake on exact retry; cancellation survives event replay. Added generated migration `20261002003418_sessionInputCancellation`.
- Moved command-template shell substitutions onto existing scoped `ChildProcessSpawner`; shutdown now terminates and awaits these subprocesses. Preserved stdout substitution and nonzero-exit handling.
- Updated public-event manifest assertions, generated Client/legacy SDK types, and README resident-server behavior. External supervisor/script migration remains a later chunk; existing restart/auto-start controls are integration points, not shutdown design authority.
- Verification: Core, opencode, Schema, Client `bun typecheck` clean; migration `--check` clean; Client and legacy SDK regeneration succeeded; diff whitespace check clean. No application build, install, or live host shutdown.
- Verification: final opencode legacy/native shutdown + manifest tests 57 pass, 14 skip (`--timeout 15000`); Core full suite 1111 pass, 10 skip, 5 unrelated npm-config failures; Client suite 16 pass; Schema final suite 13 pass, 2 unrelated Windows URL-path failures. Tests cover atomic admission, concurrent boundary closure, durable cancellation/replay/retry, legacy cleanup ordering, HTTP preparation, and real command-template subprocess termination.
- ERROR (unrelated): Core `test/npm-config.test.ts` has five registry/.npmrc assertions failing. Schema `contract-hygiene`/`v1-isolation` filesystem scans use URL pathname `/C:/...`, causing ENOENT. Full opencode suite stalled in LSP tests after CLI/bootstrap timeouts and LSP EPIPE errors; cancelled own test worker. Logs: `C:\Users\user\AppData\Local\Temp\bgShell\ses_f0612ac9cffeDJyL06SCLq376X\` jobs `bg_31a0bbc29d`, `bg_982727a94a`, `bg_6dec251679`.
- ERROR: legacy LLM-loop test exceeded default 5-second test timeout; isolated retry and final affected-file run passed with 15-second limit. Event-manifest expectations corrected for new cancellation event and previously stale Schema counts/position.
- MISTAKE: initial boundary used `Fiber.join` inside interruption cleanup, re-interrupting a finishing child and hanging atomic-admission test. Fixed: await child Exit, then propagate outside interruption cleanup.
- MISTAKE: initial test cleanup used unsupported Effect v4 `Effect.try` thunk form. Fixed `{ try, catch }` form after typecheck/test exposed it; verify installed Effect API before use.

### User
Safe shutdown
- Server shutdown now blocks new session work, waits for active-work cancellation, cancels pending prompts, and closes project resources before scheduling exit.
- Cancelled pending prompts stay cancelled after retries and history replay.
- Command-template shell processes are stopped as part of shutdown.

---

## 2026-10-01 (~19:59) - v0.2.45 - Rename tui slash label to oc - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.45
- Changed TUI-local slash label `:(tui)` -> `:(oc)` in `tui/src/component/prompt/autocomplete.tsx` `commands` memo; internal `kind` stays `"tui"` (color unchanged, purple)
- Verification: `bun typecheck` in `packages/tui` clean

### User
Slash menu
- Built-in actions such as `/skills` and `/new` now show `:(oc)` instead of `:(tui)`.

---

## 2026-10-01 (~19:57) - v0.2.44 - Single rebuild and parse cache for hot reload - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.44
- Fixes the two v0.2.43 leftovers (duplicate rebuild/toast on concurrent reads; double parse at startup)
- Added `Fingerprint.reloading(state, read)` in `src/util/fingerprint.ts`: per-directory `Semaphore.makeUnsafe(1)` around compare + `InstanceState.invalidate`; second reader waits, sees matching fingerprint, skips rebuild. Replaces duplicated `current()` bodies in `command/index.ts` and `skill/index.ts`
- Added `Fingerprint.memo<T>()`: per-file cache keyed by path, reused while mtime+size stamp unchanged. Used by `ConfigCommand.load` (wraps `parse`) and skill `load` (wraps markdown parse). Startup second pass and every rebuild now only re-parse changed files
- Note: lock nesting is one-way (Command lock -> Skill lock via `skill.fingerprint()`/`skill.all()`); Skill never calls Command, so no deadlock. Keep it that way
- Note: still-broken files re-toast on each rebuild (cached failure result is replayed); unchanged behavior
- Changed `Fingerprint.of`: missing file now signs as `path:missing`
- Verification: concurrent-read case added to `hot reloads skill files...` test; `test/skill`, `test/config`, `test/session/system.test.ts`, `test/agent` 345 pass; `test/session/prompt*` 47 pass; `bun typecheck` clean

### User
Hot reload
- Editing a command or skill file now re-reads only that file instead of all of them.
- When several parts of oc check for changes at the same moment, the list is rebuilt once and any warning shows once.

---

## 2026-10-01 (~19:53) - v0.2.43 - Pass over hot reload and slash menu work - Claude Opus 5.5, low effort; Pass

### Agent
- Meta: Claude Opus 5.5; low effort; Pass; completed
- Version: 0.2.43
- Reviewed v0.2.35-v0.2.42 diff (command/skill hot reload, `util/fingerprint.ts`, slash labels and colors)
- Fixed `tui/src/context/sync.tsx` `refreshCommands`: failed `command.list` no longer blanks the slash menu (`if (x.data)` instead of `x.data ?? []`); matters now that it runs on every `/` open
- Risk: `Command.current()` / `Skill.current()` can both invalidate when two fibers read during the same change; worst case is a duplicate rebuild and duplicate toast. Left as is
- Note: startup parses command files twice (Config load for `config.command` snapshot, then `Command` init via `Config.commands()`); cheap, kept for `debug config` fidelity
- Verification: `bun typecheck` in `packages/tui` clean

### User
Slash menu
- If oc briefly cannot reach its server when you open `/`, the menu keeps its current entries instead of going empty.

---

## 2026-10-01 (~19:51) - v0.2.42 - Peach for skill slash entries - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.42
- Changed `kindColor` skill color in `tui/src/component/prompt/autocomplete.tsx`: `theme.success` (green, user disliked) -> `theme.syntaxNumber` (drac: fosterPeach `#ef9f76`); user picked peach over blue (`primary`, close to teal) and red (`error`)
- Note: status tokens exhausted; syntaxNumber is a non-status token so other themes may map it to a less distinct hue
- Verification: `bun typecheck` in `packages/tui` clean; visual check left to user

### User
Slash menu
- Skills in the `/` menu are now peach instead of green.

---

## 2026-10-01 (~19:49) - v0.2.41 - Swap slash entry colors - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.41
- Changed `kindColor` in `tui/src/component/prompt/autocomplete.tsx` per user: tui `theme.secondary` (purple), command `theme.warning` (yellow), mcp `theme.info` (teal), skill `theme.success` (green, agent pick: only remaining distinct status hue that is not red/error)
- Verification: `bun typecheck` in `packages/tui` clean; visual check left to user

### User
Slash menu
- New colors: TUI actions purple, your commands yellow, MCP prompts teal, and skills green.

---

## 2026-10-01 (~19:27) - v0.2.40 - Color slash entries by kind - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.40
- Added `kind?: "tui" | "command" | "mcp" | "skill"` to `AutocompleteOption` (`tui/src/component/prompt/autocomplete.tsx`); set in `commands` memo (TUI slashes `tui`, server commands `serverCommand.source`)
- Added `kindColor` in `Autocomplete`: tui `theme.info`, command `theme.success`, mcp `theme.warning`, skill `theme.secondary`, else `theme.text`; whole `display` text colored. Selected row keeps `selectedForeground`; description stays `textMuted`
- Note: theme tokens, not hex, so colors follow the active theme. User theme `drac` (`~/.config/opencode/themes/drac.json`) maps them to fosterTeal, fosterGreen, fosterYellow, fosterMauve: distinct. Built-in system theme maps info and accent both to cyan, primary also cyan; avoided primary/accent for that reason
- TODO: user may switch to coloring only the `:(kind)` label instead of the whole entry
- Verification: `bun typecheck` in `packages/tui` clean; visual check left to user

### User
Slash menu
- Each `/` entry is colored by where it comes from: TUI actions teal, your commands green, MCP prompts yellow, and skills mauve (in the drac theme).
- The highlighted row and the descriptions keep their usual colors.

---

## 2026-10-01 (~19:24) - v0.2.39 - TUI label in slash menu - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.39
- Changed `tui/src/component/prompt/autocomplete.tsx` `commands` memo: TUI-local slashes from `useCommandSlashes()` get `:(tui)` appended to `display` at the call site; `keymap` hook left generic (autocomplete is its only caller)
- Note: labels live only in `display`; `onSelect` dispatches the keymap command or inserts `/name `, so labels never reach the prompt. `expandDirectory` uses `display` only for `@` paths
- Verification: `bun typecheck` in `packages/tui` clean; no TUI test covers the slash list

### User
Slash menu
- Built-in TUI actions such as `/skills` and `/new` now show a `:(tui)` label, so every `/` entry shows where it comes from.

---

## 2026-10-01 (~19:23) - v0.2.38 - Source labels in slash menu - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.38
- Changed `tui/src/component/prompt/autocomplete.tsx` `commands` memo: label is `:(${source})` for every server command, giving `:(command)`, `:(mcp)`, `:(skill)`; no label when `source` is absent
- Note: `Command.Info.source` literals are exactly `command | mcp | skill` (`opencode/src/command/index.ts:32`); built-ins `init`/`review` are `command`. TUI-local slashes (`slashes()`, e.g. `/skills`) are not server commands and stay unlabeled
- Verification: `bun typecheck` in `packages/tui` clean; no TUI test covers the slash list

### User
Slash menu
- Every server slash entry now shows where it comes from: `/name:(command)`, `/name:(mcp)`, or `/name:(skill)`.
- Built-in TUI actions such as `/skills` stay unlabeled.

---

## 2026-10-01 (~19:19) - v0.2.37 - Show skills in slash menu - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.37
- Changed `tui/src/component/prompt/autocomplete.tsx` `commands` memo: removed upstream `source === "skill"` skip; skills now listed with `:skill` label (same pattern as `:mcp`)
- Note: user tested v0.2.36 by typing `/demo` and saw nothing; cause was this upstream filter, not hot reload (server had loaded the skill)
- Note: `Command` init skips a skill whose name matches an existing command, so commands win name clashes
- Verification: `bun typecheck` in `packages/tui` clean; no TUI test covers the slash list

### User
Skills
- Skills now appear in the `/` menu with a `:skill` label, so `/demo` shows a newly added skill right away.

---

## 2026-10-01 (~19:14) - v0.2.36 - Hot reload for skills - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.36
- Follows v0.2.35 command hot reload; same fingerprint-on-read pattern
- Added `src/util/fingerprint.ts` (`Fingerprint.scan(roots)`, `Fingerprint.of(files)`); `config/command.ts` now uses it (dropped own glob/stat code)
- Changed `skill/index.ts`: `discovered` InstanceState now holds roots (`{dir, pattern, dot}`), resolved once; URL skills pulled once there, later only rescanned from cache dirs (no re-pull)
- Changed `skill/index.ts` `state`: scans roots, fingerprints, parses via `load()`; `get/require/all/dirs/available` go through `current()` which invalidates state on fingerprint mismatch
- Added module `lastGood` Map in skill: YAML parse error or invalid frontmatter keeps previous version; toast `Invalid skill file` (replaced old `Session.Event.Error` publish). Files that never had valid frontmatter still skip quietly (no toast spam for foreign SKILL.md files)
- Added `Skill.Interface.fingerprint()`; `Command` signature = command files + skill fingerprint so `/` menu tracks skill add/remove
- Changed skill load order: `Promise.all` preserves scan order, so duplicate-name override is now deterministic (last root wins)
- Kept `skills.paths`/`skills.urls` config edits out of scope (need restart), per user
- Risk: `Agent` caches `skill.dirs()` for permission allowlist (`agent/agent.ts:103`); a brand-new skill folder's extra files may prompt for read permission until restart
- Note: `test/tool/skill.test.ts` "execute returns skill content block with files" runs ~5s against bun's 5s default timeout; flaky with or without this change (timed HEAD vs change: same 6.4-6.6s file runs)
- Verification: new test `hot reloads skill files and keeps the last good version` in `test/skill/skill.test.ts`; `test/skill`, `test/config`, `test/session/system.test.ts`, `test/agent` 345 pass; `bun typecheck` clean. Full suite skipped per user

### User
Skills
- Adding, editing, or deleting a skill's `SKILL.md` now takes effect the next time a skill is used or you open the `/` menu, with no restart.
- If an edited skill file breaks, oc keeps the last working version and shows a warning toast instead of an error in the chat.
- Changing `skills.paths` or `skills.urls` in `opencode.jsonc` still needs a restart.

---

## 2026-10-01 (~19:00) - v0.2.35 - Hot reload for command files - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.35
- Added hot reload for `{command,commands}/**/*.md` in all config dirs (global `~/.config/opencode`, `~/.opencode`, project `.opencode`, `OPENCODE_CONFIG_DIR`)
- Changed `config/command.ts` `load(dir)`: returns `{ commands, diagnostics }`; no longer throws `InvalidError` on bad file; module `lastGood` Map (path -> last valid command) serves previous version while file is broken; a new broken file is skipped
- Added `ConfigCommand.fingerprint(dirs)`: sorted `path:mtimeMs:size` of matching files
- Added `Config.commands()`: `State.commandLayers` records command sources in startup merge order (inline `command` records from every `merge()` plus managed prefs, dir strings for file commands); folds them with dir rescans so precedence matches startup. `Config.get().command` stays the startup snapshot
- Changed `Command` service: state holds fingerprint; `get`/`list` recompute fingerprint and `InstanceState.invalidate` on mismatch; init reads `config.commands()` instead of `cfg.command`; publishes `TuiEvent.ToastShow` warning per diagnostic; added `EventV2Bridge.node` dep
- Added TUI `sync.refreshCommands()`; autocomplete `show("/")` calls it, so slash menu refetches on open (no watcher, no new event, no SDK regen)
- Kept skills out of scope; separate loader (`Skill.all()`), same fingerprint pattern applies later
- Note: `ConfigMarkdown.parse` is lenient on bad YAML; schema-invalid frontmatter (e.g. `subtask: not-a-boolean`) is what triggers diagnostics
- Updated `test/fixture/config.ts` with default `commands()` derived from `get`
- Verification: new test `commands() rescans command files and keeps the last good version` in `test/config/config.test.ts`; `test/config`, command and prompt tests 309 pass; `bun typecheck` clean in `packages/opencode` and `packages/tui`. Full suite cancelled at user request (known issues, slow)
- MISTAKE: `bunx prettier --write` reformatted unrelated hunks in `sync.tsx` and `config.test.ts`; reverted. Do not run bunx prettier across whole files; check diff for unrelated hunks after formatting

### User
Commands
- Adding or editing a file in `~/.opencode/commands` (or any other commands folder) now takes effect the next time you type `/`, with no restart or reinstall.
- Deleted command files disappear from the slash menu the same way.
- If an edited command file has invalid settings, oc keeps using the last working version and shows a warning toast naming the file.
- A broken command file no longer stops oc from starting; it is skipped with a warning.

---

## 2026-10-01 (~18:43) - v0.2.34 - Rename revive command pairs - GPT-6 Luna; Implementation

### Agent
- Meta: GPT-6 Luna; Implementation; completed
- Version: 0.2.34
- Renamed agent-turn commands to `/agent-revive-no-install` and `/agent-revive`; mapped no-install to `revive.exe`, install to `reviveAndInstall.exe`.
- Renamed immediate TUI commands to `/revive-no-install` and `/revive`; updated IDs, titles, README, config comment, and permission guidance.
- Verification: command-file listing, source grep, and `git diff --check`; typecheck skipped for slash-name changes.

### User
Commands
- The no-install commands now use `-no-install`, while `/agent-revive` and `/revive` run the install variant.

---

## 2026-10-01 (~18:38) - v0.2.33 - Rename revive commands - GPT-6 Luna; Implementation

### Agent
- Meta: GPT-6 Luna; Implementation; completed
- Version: 0.2.33
- Renamed agent-turn slash commands to `/agent-revive` and `/agent-revive-&-install` in user commands.
- Renamed immediate TUI commands to `/revive` and `/revive-&-install`; updated command IDs, titles, README, config comment, and permission guidance.
- Verification: command-file listing and source grep; `git diff --check` passed. Typecheck skipped for slash-name-only changes.

### User
Commands
- Agent-turn restart commands are now `/agent-revive` and `/agent-revive-&-install`; immediate restart commands are now `/revive` and `/revive-&-install`.

---

## 2026-10-01 (~18:09) - v0.2.32 - Stack dialog footer shortcuts - GPT-6.1 Sol; Implementation

### Agent
- Meta: GPT-6.1 Sol; Implementation; completed
- Version: 0.2.32
- Changed `packages/tui/src/ui/dialog-select.tsx` footer actions and hints: title above shortcut, non-shrinking blocks, unwrapped text; footer groups wrap with row gaps.
- Kept existing action click/focus behavior and unrelated worktree edits.
- Shortened session footer labels in `dialog-session-list.tsx` to pin, delete, complete, failed, rename, in progress; toggle behavior preserved. Follow-up label-only edit, no additional tests run.
- Replaced pinned session numeric gutters with accent-colored `◆`; busy spinner retains priority and quick-switch bindings remain unchanged.
- Added accent-colored Pinned filter after All; click and Ctrl+S cycling filter local pin membership, including search. Pinned is excluded from server status queries.
- Verification follow-up: TUI typecheck and 8 dialog-session-list query tests passed.
- Reordered filter tabs and Ctrl+S cycle to All, Unmarked, In Progress, Pinned, Complete, Failed.
- Reordered session footer actions and Tab navigation to rename, delete, pin, complete, failed, in progress.
- Reviewed session-owned changes; reused `local.session.isPinned`, updated picker tests for six-tab cycle, active chip styling and diamond gutters; added live unpin filtering and stacked footer alignment assertions.
- Verification cleanup: 15 focused tests passed; final TUI typecheck and diff whitespace check passed. Full TUI suite: 320 pass, 3 skip, 4 fail, 3 errors.
- ERROR / unrelated suite baseline: runtime home-path test expects Unix separator on Windows; three debug-temp tests require missing external `opencode-debug/msg22-text.md`. Left those files unchanged. Full run log: `C:\Users\user\AppData\Local\Temp\bgShell\ses_f0680295effebtpzH3DnZnEFnQ\bg_cc03da15b5\err.log`.
- Verification: TUI `bun typecheck` and `git diff --check` passed; terminal resize and interaction checks left to user. No build or install run.

### User
Dialog footer
- Actions now show their shortcut underneath and move to another row when space runs out.
- Session actions use short labels: pin, delete, complete, failed, rename, in progress.
- Pinned sessions show a purple diamond instead of a slot number.
- Added a Pinned tab to show only pinned sessions.

---

## 2026-10-01 (~22:10) - v0.2.31 - Fix session list Ctrl+D delete never confirming - Sonnet 5.5; Debug

### Agent
- Meta: Sonnet 5.5; Debug; completed
- Version: 0.2.31
- Fixed: `DialogSessionList` confirm title read `useCommandShortcut("session.delete")` (keymap-registered bindings) inside `options()`. Arming rebuilt options, `selected()` got a new identity, `DialogSelect` `useBindings` disposed/re-registered its layer, the hint went empty, options rebuilt again: loop left `session.delete` unregistered, so the second Ctrl+D hit the Search input.
- Changed: `deleteHint` now reads static `tuiConfig.keybinds.get("session.delete")` (string or `stringifyKeyStroke`).
- Verified on ocdebug (run-1790891861433): two `session.delete` triggers (execute false then true), delete result without error, one `useBindings` rebuild after arming (was ~80 in ~640ms), no keymap errors. Click-outside on the command palette hid it correctly.
- Removed: all DEBUG_TEMP_SESSION_DELETE probes (`debug-temp-session-delete.ts`, edits in dialog-select, dialog, prompt, session-list).
- Not reproduced: reported click-to-chat leak with picker open; never captured in logs.
- Verification: TUI `bun typecheck` passed.

### User
Sessions
- Ctrl+D twice in the session list now deletes the selected session, and the confirm row shows up without a delay.

---

## 2026-10-01 (~17:13) - v0.2.30 - Search above session status selector - GPT-6.1 Sol, default; Implementation

### Agent
- Meta: GPT-6.1 Sol; default; Implementation; completed
- Version: 0.2.30
- Added optional `DialogSelect.filterFooter` beneath search; moved `DialogSessionList` status selector from title into slot.
- Kept search focus, status filtering, mouse handlers, and keybindings unchanged.
- Added padded solid-background status buttons; selected button uses primary background and contrasting foreground instead of brackets.
- Changed status button colors to marker colors: success for Complete, error for Failed, text for In progress, textMuted for neutral choices; inactive backgrounds blend 20% marker color into panel, active backgrounds use full color.
- Increased inactive tint to 65% after user feedback; contrasting text applies to both states, active remains full color and bold.
- Reverted uniform 13-column status button width at user request; labels return to dynamic widths.
- Verification: TUI `bun typecheck` passed; `git diff --check` passed. Layout-only change; no new tests or build. Live layout check remains user-run.

### User
Sessions
- Search now appears above the session status selector.
- Session status choices now have separate clickable backgrounds and a highlighted selection.
- Status buttons use muted and active variants of their session marker colors.

---

## 2026-10-01 (~03:39) - v0.2.29 - Consistency cleanup for session in-progress mark - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low effort; Implementation; completed
- Version: 0.2.29 (same session as previous entry; no second bump)
- Fixed "In progress" -> "in progress" in `packages/tui/src/routes/session/index.tsx` command title and `session_in_progress_toggle` description in `packages/tui/src/config/keybind.ts`.
- Moved `"dialog.session.status.cycle"` keybind next to the other `"dialog.*"` entries in `keybind.ts`.
- Changed `sessionInProgress` to `Schema.optional(Schema.Boolean)` in `packages/schema/src/session.ts` and `v1/session.ts`, matching `sessionComplete`/`sessionFailed`; generated SDK types already read `sessionInProgress?: boolean`.
- Kept explicit return type on `sessionPrompt()` in `packages/opencode/src/tool/plan-execute.ts`: may break a circular inference through the dynamic `@/session/prompt` import; confirm with tomorrow's typecheck before removing.
- Verification: grep checks only; typecheck and tests skipped per user.

### User
Cleanup
- The in-progress command and keybind labels now use "in progress" in lowercase.

---

## 2026-10-01 (~03:38) - v0.2.29 - Cleanup pass on uncommitted changes - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low effort; Implementation; completed
- Version: 0.2.29
- Moved rename fallback models to module constant `RENAME_FALLBACKS` in `packages/opencode/src/session/prompt.ts`; wrapped `catchDefect`/`tapError` lines under 100 chars.
- Refactored `packages/tui/src/component/dialog-session-list.tsx`: complete/failed/in-progress toggles share `toggleMark(sessionID, mark)`.
- Kept rename failing when every model fails: `test/session/rename-fallback.test.ts` asserts that exit.
- Verification: `bun test test/session/rename-fallback.test.ts` (14 pass), tui `bun test test/component/dialog-session-list.test.ts` (7 pass), isolated tsc check of computed-key update payload. Full typecheck skipped per user.

### User
Cleanup
- No behavior change; rename fallback models and session mark toggles are simpler to maintain.

---

## 2026-10-01 (~03:26) - v0.2.28 - Session picker status filter - Grok 4.7, thinking; Implementation

### Agent
- Meta: Grok 4.7; thinking; Implementation; completed
- Version: 0.2.28
- Added all-projects picker status filter in `packages/tui/src/component/dialog-session-list.tsx`: All, Unmarked, In progress, Complete, Failed. Ctrl+S cycles. Choice is local and resets when the picker opens again.
- Added optional `status` on the experimental global session list. SQL applies it before order and limit.
- Registered the cycle command on the same dialog key layer as row actions (`dialog-select.tsx` `commands` / `commandBindings`). A separate layer left Complete/Failed inactive.
- Kept row-action keys registered when the footer hides them, so an empty list ignores those keys instead of dropping the binding.
- `moveTo` ignores indexes outside the current list.
- Verification: opencode `global-session-list` + `httpapi-experimental` pass; tui dialog-session-list, marker-action, and status-filter tests pass (14). `bun typecheck` clean in opencode and tui. `bun run migration --check` in core reported no pending schema change. `git diff --check` clean aside from existing CRLF warnings. Full package suites not re-run. Live picker check not run.
- Note: filter cycle lives on the dialog layer, not a second `useBindings` layer. A parent modal layer shadowed row shortcuts.

### User
Session list
- The all-projects session picker can show All, Unmarked, In progress, Complete, or Failed. Click a choice or press Ctrl+S. Search text stays put.
- The filter starts on All every time the picker opens. It is not saved.
- Pinned and current sessions follow the same filter. An empty match says "No matching sessions" and does not change the open session.
- In progress is still the manual "-" marker from the earlier change.

---

## 2026-10-01 (~03:26) - v0.2.27 - Rename falls back when Muse fails - Grok 4.7, n/a; Implementation

### Agent
- Meta: Grok 4.7; Implementation; completed. User skipped typecheck and the full package suite.
- Version: 0.2.27
- Changed `SessionPrompt.rename` in `packages/opencode/src/session/prompt.ts`: attempts are the configured rename model (default Muse low), then `opencode/mimo-v2.6-flash-free` with no variant, then `openai/gpt-6-luna` at medium. Same model id is not tried twice. Lookup failure, stream failure, empty cleaned title, and known `Provider.InitError` defects advance. Interrupt and other defects stop the chain. Title is written once, only after a cleaned title succeeds.
- Added `packages/opencode/test/session/rename-fallback.test.ts` with 14 service cases.
- Catalog: cached `models.json` lists MiMo V2.6 Flash Free at zero input, output, and cache-read cost with no reasoning options; GPT-6 Luna effort values include medium.
- Verification: `bun test test/session/rename-fallback.test.ts --timeout 30000` from `packages/opencode`: 14 pass. Typecheck skipped by user. Full package suite stopped by user and is not a result.
- Note: unpinned rename still picks the small model, or the conversation model, before those two fallbacks.

### User
Rename
- `/rename` tries Muse first. If that fails, it tries the free MiMo Flash model, then GPT-6 Luna at medium effort.
- A new title is saved only when a model returns a usable title. Partial text from a failed attempt is discarded.
- If all three fail, the old title stays and rename reports failure.
- Cancelling rename does not continue to another model.

---

## 2026-10-01 (~02:22) - v0.2.26 - Phased SuperPlan execution, Cursor max-mode fix, test isolation fixes - Opus 5.5, low; Implementation

### Agent
- Meta: Opus 5.5; low; Implementation (imp after spit); completed
- Version: 0.2.26
- Added `planShape`/`locationOptions`/`requirePlanFile`/`startGoSession` in `src/tool/plan-execute.ts`. `plan_execute` reads plan frontmatter (`size`, `phases`) and offers This session, New session, Phase sessions (`go <plan> mode=sessions phase=1`), Conductor + sub-agents (`go <plan> mode=conductor [executor=<general-*>]`, "Phase Executors" question).
- Added `plan_next_phase` (`src/tool/plan-next-phase.ts`): starts next phase in new Go session with current session model. Added `plan_closeout` (`src/tool/plan-closeout.ts`): moves plan to sibling `archive/`, refuses overwrite, rejects plans not directly in a `plans` dir. Both registered in `registry.ts`, default-deny in `agent.ts`.
- Note: `startGoSession`/`sessionPrompt` need explicit return types; inference is circular through prompt -> registry -> plan-execute (TS7023).
- Changed config (outside repo): `~/.config/opencode/prompts/sp.md` rewritten (sizing table, phase blocks with file allowlist/done-when/out-of-scope, Progress/Parked, no archive steps or tool logs); `prompts/go.md` rewritten (modes, red-flag stops, phase-scoped reading, `plan_closeout`); `agents/Go.md` allows `task`, `plan_next_phase`, `plan_closeout`; `superPlan++.md` archive perms removed.
- Moved Go-a, superPlan-a, `go-a.md`, `sp-a.md`, `goa`/`spa` commands (`.opencode` + `.claude`) to `~/.config/opencode/archive/agentA/`. Renamed `prompts/sp-{architect,scout,redteam}.md` to `{architect,scout,redteam}.md`; updated 11 `agents/sub/*` prompt refs.
- Fixed Cursor max mode (`src/provider/cursor/models.ts`, `model-config.ts`, `language-model.ts`): every menu entry carries `cursorMaxMode` (false base, true long-context); `resolveVariantMaxMode` order = exact catalog variant `isDefaultMax`, entry flag, generic hint only when nothing picked. Removed `paramsImplyMaxMode` (v0.1.4 made any context param imply max; base 200k/256k picks billed as max when catalog missing). Long-context names end `(Max)`.
- Fixed `opencode run` duplicate error records (`src/cli/cmd/run.ts`): failed prompt publishes `session.error` and rejects request; `errorReported` + `reportRequestError` emit only first.
- Fixed tests: event manifest count 89 (fork-only `tui.command.execute.targeted`); `tui.test.ts`/`v2-compat.test.ts` use `{ git: true }` so `.opencode` walk-up stops at project (Windows temp under real home leaked `~/.opencode/plugins/fork-chat.ts`); listen test requests real `/global/health` (fork has no `/status`); compression below-threshold uses `/global/health` (fork `/config` includes built-in providers, about 10 KB); shell workdir-variants test pins cmd; snapshot race test writes relative path (Git Bash mangled backslash path).
- Verification: `bun typecheck` clean; `bun test --timeout 30000` from `packages/opencode`: 4417 pass, 0 fail, 69 skip, 1 todo. Live `/sp` phased run and Cursor menu not checked; needs rebuild by user.
- MISTAKE: ran bare `bun test` (5 s default timeout) and reported LSP/session-bootstrap timeouts as failures. Use `bun test --timeout 30000` (package `test` script) for full runs.
- ERROR: running tests from Git Bash sets `SHELL`, which changes shell-tool path semantics; tests touching shell paths must pin a shell or avoid absolute Windows paths.

### User
SuperPlan and Go
- Plans are now sized and split into phases, each with its own file list and a check that proves it works.
- The "run this plan" questions now offer running each phase in its own session, or a coordinator that hands each phase to a fresh sub-agent.
- Go keeps going between phases and only stops to ask when something is actually wrong.
- Finished plans are archived by a tool instead of a long manual procedure.
- The old Go-a and SuperPlan-a agents were moved to an archive folder.

Cursor
- Bigger-context Cursor models are labeled "(Max)" in the model list.
- Normal Cursor models can no longer be silently billed as max mode when the model catalog has not loaded.

CLI
- `opencode run --format json` prints one error record instead of two when a prompt is rejected.

---

## 2026-10-01 (~01:03) - v0.2.25 - Correct local binary provider version - GPT-6.1 Sol, low; Implementation

### Agent
- Meta: GPT-6.1 Sol; low; Implementation; completed
- Version: 0.2.25
- Fixed `packages/opencode/script/build.ts`: local preview binaries embed `pkg.version` as runtime version and Bun default HTTP user agent; explicit release versions retain `Script.version`.
- Kept maintenance display version, preview channel, and artifact metadata unchanged; shared build covers production/debug.
- Verified recorded upstream baseline `5cd8e68` declares `1.18.29`; benchmark runtime logged `0.0.0-main-202610010454` and Zen minimum-version failures.
- Verification: `bun typecheck` passed in packages/opencode; `git diff --check` passed. Build/install and live Zen retry not run; user-driven verification remains.

### User
Providers
- Local builds now identify their incorporated upstream version to providers while retaining OC's own display version.
- Rebuild and install, then retry one blocked free model to confirm Zen accepts the corrected version.

---

## 2026-09-30 (~20:52) - v0.2.24 - Stale documentation cleanup - Claude Opus 5.5, low effort; Cleanup

### Agent
- Meta: Claude Opus 5.5; low effort; Cleanup (fpcmd, 3 read-only audit sub-agents); completed
- Version: 0.2.24
- Removed `Custom Feature List.md`, `task_plan.md`, `findings.md` (user approved); dropped their references
- Fixed `.scripts/syncAndInstall.ps1` `ParentRemote` and `scriptHelper.ps1` `$ghRepo`: `fosterbarnes/opencode` -> `fosterbarnes/oc`. Origin check at syncAndInstall.ps1:420 would throw on the renamed repo; pushRelease targeted the old name
- Fixed AGENTS.md: default branch `main` (not `dev`); `requireBunForCompile` callers include buildDebug/.runDebug; root test guard wording; removed stale `local.tsx:188` typecheck baseline (opencode and tui typecheck clean)
- Fixed SCRIPTS.md/UPSTREAM-SYNC.md: no script bumps `.version/version` (agent does, per AGENTS.md Revision); added revive rows; `README.oc.md` -> `README.OG.md`; Tracking table lives in README.OG.md
- Fixed README.md: level counts 19/21/22/3 = 65; resident server row notes Windows `Start-Process` hop; script list matches `.scripts`; review date. README.OG.md: removed 21 dead localized README links; row now removed/gone (deleted v0.1.5)
- Rewrote buildNotes history (user ordered): removed r20 entry and v0.2.22 plugin-era bullets (superseded); summary records what was removed
- Kept: `run_after_turn` stays detached (user choice); README caveat stays. Upstream-owned docs (packages/*, specs/) not audited
- TODO (unclear, not changed): README L175 says hidden `taskkill` windows but `killTuiProcesses` `Bun.spawnSync` has no `windowsHide`; undocumented `-SkipInstall` on build scripts, `syncAndInstall -SelfCheck`
- Verification: PowerShell parse of both edited scripts 0 errors; `bun typecheck` clean in tui; no em dashes in edited docs

### User
Docs
- Project docs now match the current code: branch name, scripts, versioning, feature counts, and the background server launch.
- Removed three outdated planning and inventory files.
Scripts
- The upstream sync and release scripts now point at the renamed `fosterbarnes/oc` repository, so the sync no longer refuses to run.

---

## 2026-09-30 (~20:42) - v0.2.23 - Stop console window flashes from the resident server - Claude Opus 5.5, low effort; Debug

### Agent
- Meta: Claude Opus 5.5; low effort; Debug; completed, user confirmed live
- Version: 0.2.23
- Fixed root cause of console flashes: resident server spawned with `detached: true` = libuv `DETACHED_PROCESS` (no console; `CREATE_NO_WINDOW` ignored), so every console child of the server (cmd/claude --version, reg query, MCP node/uv, rg, cmd taskkill on Esc, shell tools) got a new visible conhost
- Added `spawnResident` in `packages/opencode/src/config/oc.ts`: on win32 runs hidden non-detached `pwsh -Command Start-Process ... -WindowStyle Hidden`; server gets its own hidden console, children inherit it. Exe/args passed via `OC_SPAWN_EXE`/`OC_SPAWN_ARGS` env, removed before Start-Process. Resolves on pwsh exit 0. Non-win32 keeps detached spawn
- Changed `ensureResidentServer` spawn and `restartProcess` in `src/cli/cmd/serve.ts` to use `spawnResident`; `stopAndExit` now awaits restart spawn before `process.exit` (pwsh is in the server's job and would be killed)
- Kept: non-detached spawn alone is NOT a fix: libuv puts non-detached children in a KILL_ON_JOB_CLOSE job, so the server would die with oc.exe. Start-Process grandchild escapes via the job's SILENT_BREAKAWAY_OK
- Verification: `bun typecheck` clean; process log of real shortcut launch traced flashes to server children; stand-in server via current detached spawn showed visible `cmd.exe` window on screen (computer use), via `spawnResident` showed none, outlived launcher, env passed, child had no own conhost
- MISTAKE: first attempted fix (drop `detached` on win32) would have killed the resident server on oc exit; check libuv job semantics before changing Windows spawn flags
- Risk: WezTerm config (wezFig) also spawns `wsl.exe -l -v` x2, `powershell.exe` wezCord check, `node.exe` on startup; not changed

### User
Windows
- The background server no longer makes console windows flash on startup, on Esc cancel, or when tools and MCP servers run.
- Rebuild and reinstall with `-NoBuild` to get the fix; the server still keeps running after you close WezTerm.

---

## 2026-09-30 (~17:31) - v0.2.22 - Add revive scripts and agent-triggered restart - Claude Opus 5.5, low effort; Build

### Agent
- Meta: Claude Opus 5.5; low effort; Build; completed, user confirmed /revive works
- Version: 0.2.22
- Added `.scripts/revive.ps1`: elevated copy runs `safeShutdown.exe` and exits; non-admin copy starts it with `-Verb RunAs -Wait`, then opens `Desktop\occ.lnk` so WezTerm stays unelevated (FancyZones cannot snap elevated windows)
- Added `.scripts/reviveAndInstall.ps1`: same flow, runs `install.ps1 @args` between shutdown and reopen; hardcoded install path because pwshXer exes run a temp copy of the script (`$PSScriptRoot` is `%TEMP%\pwshXer`)
- Kept `revive.exe`/`reviveAndInstall.exe` as pwshXer wrappers; they pass args through. Rebuild them after editing the `.ps1`
- Added user commands `~\.opencode\commands\revive.md` and `revive-&-install.md`; both only call `run_after_turn` with their exe (no agent-side build)
- Fixed `/revive-&-install` hang at build.ts `bun install`: empty `HKCU\Environment\BUN_INSTALL` (reloaded by WezTerm) makes bun install spin forever. Deleted the value; `requireBunForCompile` in `.scripts/scriptHelper.ps1` now removes an empty `BUN_INSTALL` before any build
- ERROR: `[Environment]::SetEnvironmentVariable('BUN_INSTALL', $null, 'User')` did not delete the empty value; `reg delete` did
- Risk: `install.ps1` `assertExternalInstall` reads inherited `OPENCODE_PID`; passes only because the host is dead by then
- MISTAKE: `IsInRole('Administrator')` checked a nonexistent group and relaunched forever; use `IsInRole(544)`
- MISTAKE: first plugin/skill/command design (user-level plugins, since removed) was overbuilt; keep agent hooks to one generic run-after-turn tool
- Added native `run_after_turn` tool (`packages/opencode/src/tool/run-after-turn.ts`, registered in `tool/registry.ts`): asks permission `run_after_turn` (default allow), queues per session, spawns detached on `session.status` idle via `EventV2Bridge.listen`; spawn `error` is logged, not thrown. Not `CrossSpawnSpawner`: it kills children on scope release
- Added native `/hard-revive` and `/hard-revive-&-install` in `packages/tui/src/app.tsx` (`hardReviveCommands`), reading oc.json `revive.exe` / `revive.installExe` (type in `config/oc.ts`); hidden when unset, toast on spawn error
- Added `test/tool/run-after-turn.test.ts` (idle-gated spawn, other-session idle ignored, missing exe does not crash)
- Set user `oc.json` `revive` paths; added revive rule to `principles.md`; README row added
- Gated `run_after_turn`: user `opencode.jsonc` sets `run_after_turn` `"*": "ask"` with `.scripts\revive*.exe` allowed (global and repeated after `build`'s `"*": "allow"`, since rules are last-match); tool description and `principles.md` say other uses need the user's explicit approval. Checked with `Permission.evaluate`: revive exes allow, other exe ask
- ERROR: a detached `pwsh` (DETACHED_PROCESS, no console) exits 0 without running its command; queue console apps that open their own window
- Verification: `bun test test/tool/run-after-turn.test.ts` 2 pass; `test/tool/registry.test.ts` 15 pass; `bun typecheck` clean in opencode and tui; `.scripts\build.ps1` passed; user confirmed `/revive` live after install; `/revive-&-install` not confirmed

### User
Scripts
- `revive` restarts OpenCode and WezTerm with one UAC prompt, and WezTerm reopens as a normal window FancyZones can snap.
- `reviveAndInstall` does the same but installs the new build before reopening.
- Builds no longer hang forever when a blank `BUN_INSTALL` environment variable is present.
Agents
- `/revive` and `/revive-&-install` let an agent restart (or build and install) oc after it finishes its reply.
- `/hard-revive` and `/hard-revive-&-install` restart (or install) right away without sending anything to the model.
- These are now built into oc: the paths live in `oc.json` under `revive`, and agents get a built-in `run_after_turn` tool.

---

## 2026-09-30 (~16:18) - r21 - Add safe OpenCode shutdown - GPT-6 Luna, n/a; Implementation

### Agent
- Meta: GPT-6 Luna; n/a; Implementation; complete
- Added `.scripts/safeShutdown.ps1`: cancel resident sessions, request API shutdown, force-stop all detected OpenCode binaries and repo dev runners, verify none remain; admin-only; `-WhatIf` preview.
- Kept `safeShutdown.ps1` standalone; removed session-added sendoff/elevated installer and helper files; left existing installers unchanged.
- Added WezTerm termination after successful OpenCode shutdown; unmanaged processes no longer block graceful attempts.
- Updated `SCRIPTS.md`; bumped `.version/version` to `0.2.21`.
- Verification: PowerShell parse and `git diff --check`; resident API inspection read-only. Could not run `safeShutdown -WhatIf` because current shell is not elevated; did not run destructive shutdown.

### User
Local scripts
- `safeShutdown.ps1` attempts graceful cancellation and shutdown, then force-stops detected OpenCode processes and confirms they are gone.
- `safeShutdown.ps1` also closes WezTerm after OpenCode processes are confirmed stopped.

---
