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
