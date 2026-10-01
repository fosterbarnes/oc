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
- ERROR / baseline: TUI local.tsx:188 generated BadRequest lacks message; full tests have unrelated event/session-bootstrap/plugin failures; two Instruction.system tests discover home AGENTS.md. Live provider/terminal checks often require user installation.
- Latest archive4 sessions removed Poe assets/dependency and simplified revision file; current source and README remain authoritative for other work. Historical entries and detailed fixes preserved in archive4.

## User
- Local scripts build, check, run, install and sync this fork. Upstream changes are reviewed against a separate checkout. Agents do not run live installers.
- The footer displays the maintenance version. Model choices, custom agents, settings, project selection and sessions have native persistent controls.
- Production and debug use separate resident servers and settings. Debug can import production settings; startup and reconnect avoid replaying prompts.
- Browser providers and native Cursor run through packaged helpers. Poe, the browser UI and Electron desktop app were removed.
- Sidebar scripts, provider usage, Everything Search and Windows clipboard integration are built in. Questions respect dialogs and recover after reconnecting.
- The database refuses migrations from an incompatible build. SuperPlan remains read-only, and execution uses the exact approved plan path.

# Historical entries (newest first)

---

## 2026-09-30 (~17:31) - r22 - Add revive scripts and agent-triggered restart - Claude Opus 5.5, low effort; Build

### Agent
- Meta: Claude Opus 5.5; low effort; Build; completed, user confirmed /revive works
- Added `.scripts/revive.ps1`: elevated copy runs `safeShutdown.exe` and exits; non-admin copy starts it with `-Verb RunAs -Wait`, then opens `Desktop\occ.lnk` so WezTerm stays unelevated (FancyZones cannot snap elevated windows)
- Added `.scripts/reviveAndInstall.ps1`: same flow, runs `install.ps1 @args` between shutdown and reopen; hardcoded install path because pwshXer exes run a temp copy of the script (`$PSScriptRoot` is `%TEMP%\pwshXer`)
- Kept `revive.exe`/`reviveAndInstall.exe` as pwshXer wrappers; they pass args through. Rebuild them after editing the `.ps1`
- Added user-level `~\.config\opencode\plugins\runAfterTurn.ts`: `runAfterTurn({ exe, args })` queues per session and spawns detached on `session.idle`
- Added user commands `~\.opencode\commands\revive.md` and `revive-&-install.md`; both only queue their exe (no agent-side build)
- Added `~\.config\opencode\tuiPlugins\hardRevive.ts` (registered in `tui.json` `plugin`): `/hard-revive` and `/hard-revive-&-install` palette commands spawn the exes directly, no agent turn. Kept out of `plugins/` because the server scans that folder
- Added permission rule to `runAfterTurn` description: revive exes need the /revive command or user approval
- Fixed `/revive-&-install` hang at build.ts `bun install`: empty `HKCU\Environment\BUN_INSTALL` (reloaded by WezTerm) makes bun install spin forever. Deleted the value; `requireBunForCompile` in `.scripts/scriptHelper.ps1` now removes an empty `BUN_INSTALL` before any build
- ERROR: `[Environment]::SetEnvironmentVariable('BUN_INSTALL', $null, 'User')` did not delete the empty value; `reg delete` did
- Risk: `install.ps1` `assertExternalInstall` reads inherited `OPENCODE_PID`; passes only because the host is dead by then
- MISTAKE: `IsInRole('Administrator')` checked a nonexistent group and relaunched forever; use `IsInRole(544)`
- MISTAKE: first plugin/skill/command design was overbuilt; keep agent hooks to one generic run-after-turn tool
- Added native `run_after_turn` tool (`packages/opencode/src/tool/run-after-turn.ts`, registered in `tool/registry.ts`): asks permission `run_after_turn` (default allow), queues per session, spawns detached on `session.status` idle via `EventV2Bridge.listen`; spawn `error` is logged, not thrown. Not `CrossSpawnSpawner`: it kills children on scope release
- Added native `/hard-revive` and `/hard-revive-&-install` in `packages/tui/src/app.tsx` (`hardReviveCommands`), reading oc.json `revive.exe` / `revive.installExe` (type in `config/oc.ts`); hidden when unset, toast on spawn error
- Added `test/tool/run-after-turn.test.ts` (idle-gated spawn, other-session idle ignored, missing exe does not crash)
- Set user `oc.json` `revive` paths; added revive rule to `principles.md`; README row added
- Gated `run_after_turn`: user `opencode.jsonc` sets `run_after_turn` `"*": "ask"` with `.scripts\revive*.exe` allowed (global and repeated after `build`'s `"*": "allow"`, since rules are last-match); tool description and `principles.md` say other uses need the user's explicit approval. Checked with `Permission.evaluate`: revive exes allow, other exe ask
- Done after install: renamed `runAfterTurn` to `run_after_turn` in `~\.opencode\commands\revive*.md`, drop `tuiPlugins/hardRevive.ts` from `tui.json`, delete `plugins\runAfterTurn.ts` and `tuiPlugins\` (deferred so the installed build keeps working until then)
- ERROR: a detached `pwsh` (DETACHED_PROCESS, no console) exits 0 without running its command; queue console apps that open their own window
- Verification (native): `bun test test/tool/run-after-turn.test.ts` 2 pass; `test/tool/registry.test.ts` 15 pass; `bun typecheck` clean in opencode and tui; `.scripts\build.ps1` passed; user confirmed live after install
- Verification: user ran `/revive` successfully; plugin compiled with `bun build`; `/revive-&-install` not confirmed

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

## 2026-09-30 (~16:02) - r20 - Graceful sidebar installer shutdown - GPT-6.1 Sol, reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; reasoning; Implementation; script checks passed; live install not run
- Added `.scripts/lib/stopResidents.ps1`: resident-state credentials, paginated global session directories, session abort and idle wait, global shutdown and process exit wait; failures abort before force-stop.
- Refused unmanaged CLI runs/servers; kept sendoff explicit process exit for sidebar NoExit launcher.
- Updated elevated installer and SCRIPTS.md; kept existing build/install path and no WezTerm reopening.
- Verification: read-only InspectOnly authenticated to production and found current active session; PowerShell parser and targeted diff checks passed. Cancellation/shutdown/install remain user live checks.
- Rotated prior 1144-line buildNotes.md verbatim to archive4; incremented revision 0.2.19 to 0.2.20.
- MISTAKE: earlier agent called force-kill safe cancellation and edited during read-only discussion; cancellation now explicit and no installer executed by this agent.

### User
Installation
- The sidebar installer cancels resident agent runs and waits for server shutdown before closing OpenCode and WezTerm.
- If graceful cancellation or shutdown fails, installation stops instead of force-killing active runs.
- The sendoff still closes its launch window, and installation does not reopen WezTerm.

---
