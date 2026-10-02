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
