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
- Isolated upstream lives at `UPSTREAM\opencode`; custom source stays in the parent checkout. Port upstream fixes by hand per `UPSTREAM-SYNC.md`; no unrelated-history merge; do not commit/push unless asked.
- Version SoT is `.version\version` (maintenance display only; do not bump OpenCode package version). Agents never edit `buildNotes.txt`.
- Default branch is `main` (`v1` is the UPSTREAM checkout). Do not ship `opencode.exe` compiled with Bun 1.4.0 (`bun:ffi` TUI crash).
- Do not treat empty tool lists as compaction. Protect local `.scripts`, `.version`, `AGENTS.md`, `SCRIPTS.md`, `buildNotes.md`, `UPSTREAM-SYNC.md`, `CONTEXT.md`, TUI display-version, and custom declaration fixes during upstream apply.
- Installer may stop running `opencode` processes; do not kill them from other agent work. Live install often blocked while `C:\Users\user\Apps\opencode\opencode.exe` is in use.

# Cumulative Summary

## Agent
- Kept histories verbatim: archive1 (2026-08-20 through 09-09), archive2 (09-09 through 09-15), archive3 (09-15 through 09-28), archive4 (1144 lines), archive5 (1019 lines through v0.2.65), archive6 (1127 lines through v0.2.87), archive7 (1176 lines, v0.2.88 through v0.2.120, committed e4d73d1), archive8 (1152 lines, v0.2.120 through v0.2.148). Archive8 retains the previous cumulative summary plus complete later entries, earlier hashes, checks, and risks. Never edit archives.
- Added PowerShell build/check/run/install/sync/update/push scripts; isolated upstream checkout; fail-closed content-level three-way apply; build/install split; installer stops managed processes before rebuilding/relinking. Parent source never receives upstream-only edits. Agents never run installers.
- Moved Bun workspace into `src` v0.2.83; root keeps docs/config/scripts. Sync maps parent prefixes/root exceptions; native revive uses WORKSPACE. Run Bun from src/package dirs, not repo root. Maintenance version is `src/.version/version`; local runtime/provider version still uses incorporated upstream pkg.version, release builds Script.version.
- Added v0.2.140 random two-word camelCase versionTag from `.res/yapBot.json`, cryptographic word selection through scriptHelper; bumpVersion increments patch and tag, `-RerollTag` tag only. Sync bumps also roll tag. Tag is scripts-only, not TUI; release titles/download asset names include tag, git release tag stays vX.Y.Z. Never hand-edit version/tag.
- Added bootstrap, global session list, persistent model/agent overrides, complete/failed/in-progress marks, pinned/status filters, diamond gutters, wrapping action shortcuts; fixed static Ctrl+D hints. Legacy prompt auto-marks root sessions in progress; completion tool defaults deny and command turns explicitly allow it. Retained old permission schema keys for decoding after in-progress/reopen tools were removed.
- Added native resident lifecycle/restart/auto-start, reconnect waits for disposal/replacement without replay, stale launcher records ignored. Start-at-sign-in config still has no reader registering startup. `oc single` replaces stable, shares sessions with no resident server, configurable launcher mode, portable DB and explicit session/Home carry through revive. Single tab prefix is agent-colored circle instead of square.
- Fixed single-mode cross-process lock defects to HTTP 409; launch palette respects single/portable; bootstrap parses last stdout line despite plugins. Worker drains SessionWork before disposal. Single revive never shutdownAll, leaves hosting shell/tab/resident untouched, installs with alias rollback, acknowledges cleanup before build, recovers prior runtime on failure. Windows leftovers require live CIM creation identities and exclude unrelated terminal/oc/helper subtrees; never PID-only/tree kills. Unknown ownership leaves processes alive. Shell submission still discards refusal response; console-X SIGHUP behavior unverified.
- Added native revive supervisor/worker, pre-shutdown build, logs, rename-running-exe install/alias relink/rollback, old-runtime recovery, scoped terminal reopen. First use chooses source/download and debug; no automatic pulls later, no personal build scripts. WezTerm uses wezterm-gui to avoid persistent console. Trigger-time synthetic noReply marks preserve agent/model; newest unsent mark rewritten to returned version. Home/run_after_turn revives write none; older marker metadata.version can render undefined.
- Fixed resident console flashes with hidden pwsh Start-Process hop, detached false (DETACHED_PROCESS blocks launch); dropping hop kills resident. Scoped TUI ledger avoids shutting other instances. PowerShell 7 required. Safe local builds never touch installed executables; build/install user driven.
- Added ocdebug port 4097, production config/assets first-run seeding, separate bare-oc/relative-target folders, palette project picker, lazy startup, shared compact intro/overlay and Knight Rider scanner (`introCellsAt(tick)`, `OC_INTRO_FRAME` handoff). Intro animation ignores animations_enabled. Installed v0.2.87 intro transition confirmed seamless; apparent recurrence was old runtime.
- Added Cursor native provider/proxy, lazy helper packaging, cancellation, SSRF/symlink/git credential protections, context tiers/pricing, Max long-context models; disabled Cursor plan mode. Removed browser UI/Electron/Poe and, v0.2.141, agentify ChatGPT Web/Claude Web plus helper packaging/tests; leftover installed helper/state left for user. Old web sessions report ModelNotFoundError. Windows children use hidden process-tree handling; avoid Bun 1.4.0 FFI.
- Added model-glob instructionsByModel, plural agent folders, model CLI precedence/session override, disabled stock plan; Gemini thinking, Bedrock tool images, GPT-6 Codex allowlist, credential redaction retained. Claude Haiku 5.5 added; Sonnet 5 $2/$10, Sonnet 5.5 cache read 0.1. Config drops cost.tiers, so Haiku >100K usage under-reports 5x. Poe Luna failed; openai/gpt-6-luna works.
- Kept SuperPlan read-only/exact absolute planPath, phased Go execution/plan_next_phase/plan_closeout, optional coordinator/subagents; archived Go-a/SuperPlan-a. Explicit return types prevent prompt/registry/plan-execute inference cycles. Paint debug remains frozen in its designated plan; do not resurrect probes.
- Added command/skill fingerprint hot reload, serialized rebuild/per-file cache/last-good toasts; slash menu retains old data on failed refresh. Keep Command -> Skill lock direction. Source labels :(oc)/(command)/(mcp)/(skill) purple/yellow/teal/peach; commands win collisions. New config URLs/paths or skill permission changes may require restart.
- Added slash favorites Ctrl+F, favorites-first for empty query, inline above-prompt menu (Yoga auto clears offsets), composed commands and shared slashTriggerIndex. Added default-off todos and oc toggles for bgRun, sidebar position WIP, keybind preset, Claude Code update via close. Keybind changes live re-register prompt inputs; documented keybinds checked by prePush.
- Added command permissions through existing structured schema, ordered rules saved on user message for that turn only; propagated through subtasks/compaction/tools/markers/interpolation. Shared edit path checks cover Windows absolute/relative paths, junctions, alternate streams, prior approvals, patch rename destinations. `/spit` permits global-plan Markdown only and denies execution/delegation. Claude restricted turns use oc proxies; ordinary turns restore native tools. Subtask/compaction propagation traced, not independently exercised.
- Added native command markers (default off) from global markers.json, inline/window/afterTurn, per-command Permission.ask, fence-aware and edit guard. Inline output enters reply (last 4000 chars); hyphenated names fail NAME regex. Background-marker experiment reverted (wake cache misses/no savings). Markers only npm/file plugin specs; plugin folders auto-discover and must never be listed as directory plugin specs. Do not fork poisoned palette-debug sessions.
- Added native run_after_turn, visible consoles for .ps1, generic allow with user approval except revive commands; default Claude proxy list includes it, explicit proxyTools lists must include it. Added native time tool returning local YYYY-MM-DD Ddd HH:MM offset through DateTime; live clock omitted from system prompt to preserve cache, date unchanged. Explicit proxyTools must include time. Fake CLI scenario and user live check passed.
- Fixed Claude Start-fresh question with turn cwd, per-instance pending map; other default getOpencodeClient callers still use last booted directory. Fresh catch-up leads with bounded resumeBlock/last exchange and session_read hint, never full history paste. Added unmapped provider tool events and Windows PowerShell display/read-only rules; DISABLE_AUTOUPDATER retained, DISABLE_NONESSENTIAL_TRAFFIC removed, host-gated desktop tools and strictMcpConfig retained.
- Fixed Claude interrupt abandonment, hash-by-position rewind, message_delta usage, single error/refusal rendering, synthetic prompt_async autonomous wake with buffered init; next ordinary turn interrupts. Wake buffer has 500-line drop risk. Interim main-thread raw usage updates SessionProcessor tokens/footer/sidebar during turn; subagent usage excluded, cost only at finish. A pane check for live usage was not added.
- Added Claude account pool (`accounts` config dirs, default ~/.claude), sticky account until limit, reset deadlines (1h when unknown), all-limited stays put with notice. Persisted account in process/session records. Cross-account sync retires old CLI conversation without Start-fresh question and uses resumeBlock. In-turn rejected limit waits for result, drops rejected output, spawns next with bounded reply/tool-log catch-up; marks each limit to bound switching. Native CLI env drops token vars when selecting account. Working memory beyond reply/tool log is lost, non-CLI proxy results only named; no real-limit acceptance check.
- Added sidebar Usage menu with per-provider limits, full absolute/relative resets, inert stat rows, settings/sign-in; entire Usage block opens menu. One session-only used/remaining toggle. Claude pool shows per-account hour/week percents and hourly reset times, signed-out/expired reasons; live-source/newest fetch prevents one cached account dimming pool. All-unreadable pool still generic Unavailable. Labels trail percent (`%h`, `%w`, `%m`, `%api`); sub-day h omits hour count. Optional Claude OAuth meter/terms risk documented, removal user-owned.
- Added sidebar Outline/Minimal live saved picker, shared HeaderButton, palette shortcuts, separate model/reasoning clicks. Final Minimal primary > and secondary >> inline; no brackets/label-column/selector variants. Outline square left-aligned. Minimal explicit empty borders preserve hover geometry; text/outline only hover, controls not selectable. Long model clips before reasoning. Name clips trailing ... and hover marquee; widths use .length, not display width. OpenTUI 0.5.14/Solid 1.9.12 word/line selection; clickable rows/user messages/actions are unselectable and left-click works despite other highlights.
- Added terminal detector, Windows Terminal script placement, agent-colored tab title, OSC progress/WezTerm user var through renderer; cleanup on destroy, force kills cannot clear progress. Removed nearest-square emoji helper, retained renderer tests. Theme backgroundToast defaults panel; drac dusty purple #423B52, plugin/current/run-mode carry it.
- Fixed question cancel/publish race, dialog key ownership, reconnect reload; server exit rejects pending asks. Restored questions use per-directory/revision guards, idle-only recovery, message+call dismissal and promptAsync answer format; parent excludes subagent/plugin questions, another TUI's answer may stay until reload. Home Ctrl+Enter sends while staying Home, in-session newline; WezTerm CSI-u required, <=120 sidebar hides. Session creation now ignores repeat Enter while bootstrap runs and retries after failure. Home palette entry/Ctrl+Shift+H replaces native New session label.
- Added optional subagent terminal tabs v0.2.148: `subagent_tabs.click` inline|tab, auto_open false default; live saved oc palette `/subagentTabs`, session_child_tabs configurable binding, direct-child new-time guard, mark before spawn. WezTerm/WT attach uses correct launcher/cwd/session/server URL. Single runtime cannot attach, shows inline warning; on-demand HTTP server rejected because unauthenticated. Server password in process args, WT window 0 most-recent, parent server exit disconnects tabs; installed acceptance pending.
- Added `/work` dirty-state copy and `/done` unstaged merge using temporary index/write-tree/commit-tree/base config; preserves parent real index/staged/unstaged/untracked, explicit-base merge-tree incl nested copies, committed edits and deletions. `ignore-space-at-eol` handles EOF/CRLF. Conflicts write markers only in copy, prompt agent with paths, stay there until `/done` repeated. Session project ID used, not launch project. Dispose before removal, dependency install process warnings. User live /done passed; Claude cwd after move, Windows locks, sidebar copied absolute roots remain risks.
- Added sidebar plugin statuses GET /plugin/Plugin.Service.status. `FORK.md` living fork definition, README.OG native state, public README expanded 15-section guide/FAQ/writeup; preserved user TODOs and code count markers/link. CONTRIBUTING/SECURITY/issues/PR docs fork-aware; wiki and shorter README drafts in global plans pending user bootstrap, LICENSE/team/root-doc cleanup/screenshots deferred. Plan inventories record `/done` wording, POSIX login hint, unused oc.json keys.
- Removed V2 execution engine v0.2.65: legacy SessionPrompt/Processor/RunState owns runtime. Keep SessionV2 reads/model-agent endpoints, SessionProjector, EventV2/Bridge, Work/Store, location services and TUI /api routes. Keep historical session.next schemas/projectors/input tables/cancel migrations for durable replay; no migration deletion, unknown EventV2 types kill replay. sdk/v2 means legacy SDK client, not engine.
- Added DB unknown-migration refusal after stock 2.0.6 changed shared DB: identify incompatible build logs, restore backup, separate XDG_DATA_HOME. Local sqlite3 3.22 lacks DROP COLUMN. SessionWork admission/cancel gate and detached 30s shutdown retained; removed timing probes/safeShutdown/compiled revive wrappers. Empty BUN_INSTALL cleanup avoids install hangs.
- Added `.scripts/test.ps1` user-driven selections/list/dry-run/options validation/generated guards, runner PowerShell tests. Removed all workflows v0.2.88 after private Actions billing. prePush typechecks/count/keybind docs, no lint; code-count README single scc link/markers. Push subject explicit/new buildNotes.txt only; unchanged prompts. agentPush -Context validates version+tag, runs prePush/push in process, output on failure; only explicit agent-push permits publish/message write. Real-model script requires typed yes before token read/spend incl CheckOnly, no bypass; agents never set OC_REAL_MODEL or read saved DPAPI token.
- Added TestLLMServer Anthropic SSE/fake Claude CLI scenarios and opt-in headless WezTerm panes, flow reports; no real tokens. Use chat-fixture claudeEnv/initRepo/outsideProfile/expectIsolated, CLAUDE_CODE_DISABLE_CLAUDE_MDS, isolated OPENCODE_DB plus XDG dirs; Windows HKCU OPENCODE_DB overlays panes so test config must set isolation. hostEnv strips inherited CLAUDE*/ANTHROPIC* and extendEnv false. About 71 old leaked real-DB sessions user-deferred. Pane cleanup compares CIM to CIM and creation-ordered verified descendants; --no-auto-start and explicit socket required.
- Fixed Windows logon temp leak v0.2.148: 1162 opencode-test folders/~548k entries made ProfSvc temp walk take 80-120s; user-approved cleanup completed. `OPENCODE_DISABLE_CONFIG_INSTALL` test preload flag blocks detached plugin npm installs recreating deleted dirs; fixture clean retries for 10s and throws on leak. Three scoped files 153 pass, no new folders. Preload data cleanup still gives up silently after 30 EBUSY retries on win32; revisit if test-data dirs recur.
- Verification baseline: archive6 records v0.2.63 thirteen fixed failures, v0.2.65 six package typechecks/234 tests/202 route coverage with five missing pre-existing, v0.2.79 27 typechecks and scoped tests/codegen/207 auth coverage. Windows Effect HTTP POST /pty and /api/pty fail; Linux Cursor state.vscdb and PTY replay baseline remain. v0.2.122 push passed 27 typechecks. v0.2.133 middleware optional success response typing fixed in v0.2.142 (5 tests/typecheck). v0.2.147 retained-sidebar plugin expectation and h labels fixed (79 tests). Older subagent-hint extra time tool and task descriptions timeout baseline remain archive8. Do not rerun unrelated checks/relist old failures.
- MISTAKE: shell Python/heredoc edits mangled CRLF/backslashes/ESC; use file tools. PowerShell HOME readonly, use testHome. Never reconstruct plan paths, overwrite unread tests, stash shared user work, or remove unknown config.json test artifacts. SDK request throwOnError must be declared per call for required data inference. Expose directly yielded test services in node roots. Fake final reply requires stop(), Bun.file exists() caches per object, use fresh BunFile for changing state. Test fixture home bun cache slows Git; initRepo project subdir.
- MISTAKE: denied task/empty proxy lists still need Claude native-subagent/oc-skill hint. Claude under oc uses native task, not shell opencode run or desktop oc-subagent. Bad unquoted YAML colon silently dropped entire general agent family; fixed user config/debug, restart required. Start-Job dies with shell; use harness background tool (unavailable in some sessions, record fallback). Installer kills opencode-run subagents. Never bypass real-spend guard through fresh env. Fork copies poisoned toast history. Read list identity before screenshot-driven edits; escape marker mentions. Re-run affected checks after final edits.

## User
- oc has resident and single-window modes, separate debug settings, safe revive/recovery, portable sessions, model choices, session filtering/marks, and compatible-database protection. A message marks work in progress; implementation and successful agent-push turns can mark it complete.
- Sessions name themselves once from the first real prompt alongside the reply; manual names survive, failed naming leaves `/rename` available, forks drop the pending marker. `/rename` identifies its winning model. Home Ctrl+Enter sends while staying Home; Home shortcut is Ctrl+Shift+H.
- Commands and skills reload automatically, slash menu stays above the prompt with favorites/composition, permissions apply only to the command turn, and preset command markers support inline output, windows, or after-turn execution.
- Cursor models include Max long-context options. ChatGPT Web/Claude Web are removed. Claude Code supports fresh catch-up, native subagents/oc skills, interrupt/undo, live context counts, account failover, and native PowerShell/proxy tools; cost updates at turn end.
- Usage menu shows limits and full reset dates, separate Claude accounts and login reasons, with a used/remaining toggle. Sidebar controls have Outline/Minimal styles, palette buttons, clipped names and inline reasoning. Clickable chat items do not text-select; ordinary text does.
- Subagents can open in WezTerm or Windows Terminal tabs through saved palette settings; this requires the resident server. Plugin statuses, theme-aware toasts, startup scanner, agent-colored tabs, and progress indicators are available.
- `/work` copies current staged, unstaged, and untracked work without changing the parent; `/done` brings changes back unstaged. Whitespace differences merge; real conflicts stay in the copy for the agent to resolve, including nested copies.
- README/CONTRIBUTING/SECURITY describe this fork; wiki drafts await bootstrap. Version bumps generate a random two-word release/commit name. Builds and installs remain user-driven; local checks are selectable, cloud workflows removed, and real Claude checks always ask before spending.
- Fake-model and pane checks isolate user data and do not spend model usage. Tests no longer download plugins or leave hundreds of thousands of temp files slowing Windows logon; cleanup failures now fail visibly.

# Historical entries (newest first)

---

## 2026-10-12 (~17:54) - v0.2.162 variationsHedio - Post-review fixes for the fork-wide pass - Claude Opus 5.5, default reasoning; Implementation

### Agent
- Meta: Claude Opus 5.5; default reasoning; Implementation via subagents; completed
- Version: 0.2.162 (no bump: same session as the v0.2.162 entry below)
- Review: 4 read-only reviewers; findings in `~/.config/opencode/plans/forkReview/postReview.md`
- Fixed `permission/index.ts` `disabled()`: turn ruleset also filtered, so `*: allow` never unhides `session_complete`/`session_failed`
- Fixed `session/processor.ts:137` marker `command.ask`: gets only rules with permission exactly `marker`; default `*: allow` still prompts, explicit `marker: allow` skips
- Fixed `provider/cursor/languageModel.ts`: continuation abort now closes the Run and stops the frame pump
- Fixed `tui/src/app.tsx` file-loaded palette hotkeys: keymap conflict check matches interactive capture (`keymap.parseKeySequence`)
- Changed `tui/.../sidebar.tsx:27` top/bottom cap: `max(8, floor(height/2))`, 24-row ceiling removed
- Reverted rename side effects: `export.ts:168` label `session-directory`; `session-ui` `data-scope="apply-patch"` (upstream file)
- Removed `showThinking` stub, `SCRIPT_OWN_PANE` env, `/claude-code-doctor` comment, root `.tmp_*.py` and `.diff-review.txt`
- Fixed docs: FORK.md auto-resume toggle and sidebar size, `sidebar-tools` links, stale claims in the entry below, stale test usage comments
- Removed oc.json `reasoningEffort` (user request): `createReasoningDefault`, `oc.reasoning_effort` palette entry and keybind, `oc.ts` key, schema command id, README rows; variant = session pick > model pick > model default
- Fixed `tui/src/util/persistence.ts` `writeJsonAtomic`: writes to one path run in order (Windows EPERM when renames overlap); snapshot taken at call time
- Fixed `test/cli/oc.test.ts`: dropped `defaultSubagent*` (never oc.json keys) and `serverStartOnWindowsUserStart` (would register a real sign-in entry; startup refuses under inline config); 11 pass
- Fixed `config/oc.ts` regression from this session: `listOcProcesses` catch restored (null = no snapshot); `stopServer` sends the authenticated graceful shutdown without a snapshot and refuses only on a known identity mismatch (forced kill still needs identity); `shutdownAll` skips ledger removal when the second snapshot fails
- Fixed stale tests in `test/config/oc.test.ts`: restart window is 120s (deliberate, covers 35s graceful stop); `executablePath` maps only `occ` -> `oc` (since entry at line ~326)
- Verification: `config/oc.test.ts` + `cli/oc.test.ts` + `cli/launcherSafety.test.ts` 47 pass 0 fail; opencode typecheck exit 0
- Kept PID fallback in `config/oc.ts` `isPidAlive`: win32-strict version broke revive waits that only have a bare PID; kills are already identity-gated
- Verification: typecheck opencode + tui exit 0; `permissionSessionMarks.test.ts` 3 pass; `processor-effect.test.ts` 19 pass; `cursor.test.ts` 21 pass; `hotkeyValidate.test.ts` 17 pass; `openSidebar.test.ts` 74 pass 2 skip
- ERROR: `test/cli/oc.test.ts:60` (config set serverStartOnWindowsUserStart exits 1) and `test/config/revive.test.ts:157` (TuiLedger.select empty) fail; not confirmed pre-existing
- TODO: `buildNotes.txt` still v0.2.161; rewrite at push
- Fixed `session/scheduledResume.ts` lock timeout: skips locked mutations; `takeDue` returns no claims and keeps queued resumes for next poll; counts/cap logic unchanged. Added held-lock regression; 18 pass, 0 fail.
- Fixed lost bookkeeping on lock timeout: `retry`/`noteFired`/`noteUserIntervened` return whether the lock was taken; `fireEntry` writes them through `persist` (up to 10 tries, 1s apart, past the 30s stale-lock window). `scheduledResume.test.ts` 18 pass; opencode typecheck exit 0.
- Fixed `provider/cursor/protocol/generateImage.ts` containment: root equality stays inside; exact `..`, parent traversal and absolute escapes stay outside; realpath handling kept. Target is a file path; root itself remains a directory, not a writable image file. Mapping tests 2 pass, 0 fail.
- Fixed `provider/cursor/protocol/gitDiff.ts` target validation: returns checked realpath; callers convert to git pathspecs or read file contents. Added in-workspace junction/symlink regression; 22 pass, 0 fail.
- Fixed `plugin/cursor.ts` session deletion: removes cached directory through new `sessionDirectory.ts` removal function (necessary supporting file outside handoff's named list); deletion preserves other sessions. Plugin tests 3 pass, 0 fail; provider tests included in combined 66 pass, 0 fail run.
- Fixed `.scripts/installDebug.ps1`: timestamped backup, newest-three retention, restore on copy or validation failure. Parse PASS; installer never run. Fixed in review: uses `debugBackup-*` so its pruning cannot delete `install.ps1`'s full `backup-*` sets.
- Verification (2026-10-12 ~18:15, GPT-6.1 Sol): five targeted files 66 pass, 0 fail; opencode `bun run typecheck` exit 0. bgShell unavailable; used built-in shell. Kept version 0.2.162 variationsHedio; Part 2 checks remain user-owned.
- ERROR: separate scheduler run hit Windows EPERM at temp-file rename in existing stale-lock test (17 pass, 1 fail); immediate rerun without code changes 18 pass, 0 fail. Combined run also passed; no rename fix included.

### User
Permissions
- Session complete/failed tools stay hidden unless allowed by name, even with a catch-all allow.
- Marker commands still ask before running unless you add an explicit `marker` allow rule.

Cursor and TUI
- Stopping a Cursor reply mid-tool now stops it cleanly.
- Palette hotkeys from your config file are rejected with a toast if they clash with an existing keybind.
- Sidebar top/bottom sections can grow to half the terminal height.

---

## 2026-10-12 (~16:37) - v0.2.162 variationsHedio - Fork-wide review: bug fixes, unfinished features, dead code, style, camelCase renames - Claude Opus 5.5, default reasoning; Implementation

### Agent
- Meta: Claude Opus 5.5; default reasoning; spitS review then impS; 10 review + 10 impl subagents (Sonnet, Haiku, 2 Sol, Grok, Muse, Composer); completed
- Version: 0.2.162 variationsHedio
- Plan + raw reports: `C:\Users\user\.config\opencode\plans\forkReview\` (`plan.md`, per-area reports, `impB4.md`, `renameMap.txt`)
- Fixed Claude provider: limit-text failover only on error results; no switch after abort; resume only after limit failure; pinned reset time; pending switch on exit without result; null version probe not cached, cross-spawn probe; session pins pruned; respawn keeps wake fields; default-account detection case/env aware
- Fixed Cursor: relay h2 streams require control token (parent keeps token); stopCursorProxy awaits exit; per-pump abort; stream-start leak; git-diff realpath/homedir/ref rules; generate-image realpath; auth poll abort; `-1m` pricing; drain timeout fails. Unsupported execs reply typed errors and keep pumping; Windows background shell refused; `maxMode` option removed from thinking.ts
- Fixed session: scheduled resume retries with backoff (busy/load/prompt failure), lockfile around store RMW, `cancel` keeps counts, `PUT session/resume/state` takes `prompt`; plan tools `ctx.ask`; `*: allow` no longer un-hides session marks; busy -> 409; tool flags merge into session permission; markers use merged ruleset; exclusive mark patch
- Fixed launcher: no PID-only kills (CIM creation + exe identity, refuse when unproven); restart marked before stop, health fails while draining; startup lock kept while launcher alive; detached-launch quoting; revive keeps directory; worker logs faults; removed scratch/empty finally/occc TODO
- Fixed TUI: script pins/favorites reactive; scrollbar default only when unset; Cursor reset date; left-button gating; dialog timer cleanup; Win32 clipboard image mime; single `accounts` entry uses pool probe
- Finished sidebar top/bottom (height cap, backdrop close, WIP label gone) and palette hotkeys (alt mods, full conflict scan, hard modifier rule, prompt/dialog gating, invalid key toast, capture priority, serialized `persistTuiSetting`)
- Reworked desktop updaters into one runner/parser (`OCERR:` line), shared `Get-MsixIdentity`, one `runVersionedCliUpdate`; host pins, signer checks, version match, CLI timeout, confirmed-version install
- Scripts: Bun guard rejects all 1.4.0; install timestamped backup + restore (newest 3); `-SkipInstall` -> `-SkipBunInstall` on install.ps1; installDebug/.runDebug/revive/setReviveConsolePosition/test.ps1 fixes; SCRIPTS.md rows. Core: launchDetached quoting, debugConfig skip existing, log rotate ENOENT race
- Removed legacy Claude `account` bash wrapper; ~21 dead symbols (list in session); `SCRIPT_OWN_PANE` env var from script runner (nothing read it)
- Style: prettier (120) + em dash removal on ~290 fork-only files; renamed 174 fork-only kebab files to camelCase (dirs unchanged; map in plan folder); docs/scripts updated
- FORK.md: auto-resume row, sign-in startup, meter averaging, installer backup, Cursor git_diff, palette hotkeys; level counts recounted
- Kept (rejected findings): push.ps1 `-Force`/`Trim`, installer name-wide stop, marker `ask` default false, device-id MachineGuid parse
- MISTAKE: style subagent replaced the `.` and em dash characters inside string literals and edited upstream `routes/session/index.tsx`; caught by `inline-tool-wrap` snapshot test, restored. Rule: glyph/dash cleanup touches comments only, never literals; never upstream files
- Risk: claude-code `persistSessions`/`persistPool` last-writer-wins across oc + native opencode not fixed; per-hash skill plugin dir race open
- Risk: old windows lack new identity stamps; launcher cleanup refuses them until closed
- ERROR (pre-existing, not this session): `test/cli/run/footer.view.test.tsx` 2 fails + `runtime.boot.test.ts` keymap fallback (earlier keybind work); 4 claude-code tests expect proxy lists without `time` (time is in HEAD defaults); `spawn-env.test.ts` PATH vs Path; `oc.test.ts` `serverStartOnWindowsUserStart` fails and would write real HKCU Run if it passed
- Verification: `bun run typecheck` 27/27; targeted tests pass (account-pool 17, cursor + scheduledResume + launcherSafety 156, tui updaters/hotkeys 48, inline-tool-wrap 17, core util 34, cursor-runtime node 9); `.ps1` parse checks clean. Provider unit run 649 pass / 6 fail (all classified above). No build, no install, no live checks

### User
Fixes across the fork
- Claude accounts no longer switch just because a reply mentions a usage limit, and auto-resume after a limit reset no longer silently drops.
- The Cursor helper now requires its private token for every request, and cancelling a Cursor reply stops it promptly.
- oc never force-stops a process unless it can prove it is the same process it started.
- Desktop and CLI harness updates show the real error message and refuse to install a different version than the one you confirmed.
Finished features
- Top/bottom sidebar positions are complete: no 12-row cap, and clicking outside the narrow overlay closes it.
- Palette hotkeys validate keys, catch conflicts with built-in keys, and do not fire while typing.
- The installer keeps a timestamped backup and restores it if install fails.
Cleanup
- Unused code and the old bash-only Claude account wrapper were removed; fork files were reformatted and renamed to camelCase. No UI change from the cleanup itself.

---

## 2026-10-12 (~01:45) - v0.2.161 forsenplsMoly - Manage third-party harness updates - GPT-6 Luna, reasoning unspecified; Agent

### Agent
- Meta: GPT-6 Luna; reasoning unspecified; Agent; completed
- Version: v0.2.161 forsenplsMoly
- Added Manage Third Party Harnesses palette submenu for Claude Code, Cursor and Codex CLIs, and Windows desktop updaters for Claude, Cursor and ChatGPT
- Added CLI resolution/version reporting and desktop update checks with package identity/signature validation before in-place installation
- Added `docs/wezterm.md`; README now documents terminal capabilities and WezTerm tab-color setup; updated `FORK.md` feature inventory
- Cleared default keybindings for model, reasoning, agent, and home-directory preference commands
- Verification: targeted opencode tests 43 passed; targeted tui tests 72 passed; `git diff --check` passed

### User
Third-party harness updates
- Manage Third Party Harnesses groups updates for installed Claude Code, Cursor and Codex CLIs, plus Claude, Cursor and ChatGPT Desktop on Windows.
- Desktop updates check the installed version and ask before closing and updating the application.

Terminal
- README documents terminal feature differences and recommends WezTerm; `docs/wezterm.md` explains colored agent tab setup.

---

## 2026-10-12 (~01:36) - v0.2.161 forsenplsMoly - Switch Claude account from the palette - Sonnet 5.5, default reasoning; Implementation

### Agent
- Meta: Sonnet 5.5; default reasoning; Implementation; completed
- Version: v0.2.161 forsenplsMoly
- Added `poolState` and `setCurrentAccount` in provider/claude-code/accounts.ts (manual pick clears that account's limit mark, persists the pool file)
- Added `GET/PUT /session/claude-account` in httpapi groups/session.ts and handlers/session.ts (pool ids from `provider["claude-code"].options.accounts`); TUI reaches it through raw transport like `resume`, no client regenerate
- Added `sdk.claudeAccount` in tui context/sdk.tsx and the `claude.account` palette command ("Switch Claude account", slash `/claude-account`) in tui app.tsx, shown only with 2+ pool accounts
- Added test "a manual pick sticks..." in test/provider/claude-code/account-pool.test.ts
- Verification: ran that test (pass); `tsc --noEmit` printed nothing for opencode and tui; TUI dialog and endpoint not exercised live

### User
Provider
- New "Switch Claude account" palette command lists your pooled Claude accounts, marks the active one and shows limit reset times; picking one makes it the account for new turns.
- Sessions restart their Claude context on the next turn after a switch.

---


## 2026-10-12 (~01:03) - v0.2.160 timewChatgpt - Label Claude usage accounts - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.160 timewChatgpt
- Changed `src/packages/tui/src/routes/session/sidebar-tools/usage.ts` `formatClaudeUsageRows`: each readable account gets paired hourly/weekly windows labeled Claude:, Claude2:, Claude3:, etc.; reused existing reset alignment/wrapping; spacing separates accounts and wrapped rows retain labels.
- Changed `src/packages/tui/src/routes/session/sidebar-tools/sidebar-tools.tsx`: row label metadata gives numbered labels the existing freshness color.
- Updated `src/packages/tui/test/cli/tui/usage-freshness.test.ts`: per-account values/resets, numbering, remaining mode, wrapping, spacing, idle dashes, unknown windows, and one-readable-account behavior.
- Verification: `bun test test/cli/tui/usage-freshness.test.ts --only-failures` in tui: 31 pass, 0 fail. Live sidebar not run; build/install user-owned.

### User
Usage sidebar
- Extra Claude accounts now show Claude2:, Claude3:, etc., with each account's hourly and weekly usage together.
- Labels stay visible when a narrow sidebar wraps the usage windows.

---

## 2026-10-11 (~22:44) - v0.2.159 disrespectingWidely - Auto-resume after Claude usage reset - Muse Spark 1.3, default reasoning; Implementation

### Agent
- Meta: Muse Spark 1.3; default reasoning; Implementation; completed
- Version: 0.2.159 disrespectingWidely
- Added `src/packages/opencode/src/session/scheduled-resume.ts`: file-backed scheduler under Global.Path.data (`scheduled-resume.json`), enabled flag default false, one entry per session, startup overdue drain, five-fire cap, cancel; `fireEntry` claims before prompt, skips busy sessions and sessions with newer user messages, drops unreadable sessions.
- Added turn-stream hook (`provider/claude-code/turn-stream.ts` `maybeScheduleResume`): schedules at earliest pool reset plus one minute when turn ends with all accounts limited; no-op for compaction, aborted, cancelled, or non-session turns. Added `earliestLimitedUntil` export in `provider/claude-code/accounts.ts`.
- Added API `GET/PUT /session/resume/state` and `POST /session/resume/cancel` (groups/session.ts, handlers/session.ts); poll loop forks into app scope at handler setup. TUI uses raw transport (`tui/src/context/sdk.tsx` `resume` helper), no SDK regen needed.
- Added TUI palette commands in `tui/src/app.tsx`: state-reflecting auto-resume toggle and "Scheduled resumes" list with local fire time; selecting an entry cancels it.
- Fixed: Effect v4 beta has no `Effect.catchAll`; scheduler uses `Effect.catch` plus `Effect.catchDefect` on loop-survival paths.
- Verification: `bun test test/session/scheduled-resume.test.ts` 11 pass; `bun run typecheck` clean in opencode and tui. Not run live.
- TODO: live check needs a real all-accounts-limited turn with the toggle on; confirm the resume prompt posts after reset and the palette toggle reflects state.

### User
Auto-resume after usage reset
- A new palette toggle enables automatic resume after Claude usage limits reset; it stays off until you turn it on.
- When every Claude account hits its limit, the session is scheduled to continue on its own after the reset time.
- "Scheduled resumes" in the palette lists pending auto-resumes with their times; picking one cancels it.
- The resume is skipped if you already sent a message or the session is busy, and it stops after five automatic resumes in a row.

---

## 2026-10-11 (~22:12) - v0.2.158 bangHahah - Clearer /done close-out wording - Claude Sonnet 5.5, low reasoning; Agent

### Agent
- Meta: Claude Sonnet 5.5; low reasoning; Agent; completed
- Version: 0.2.158 bangHahah
- Investigated: /work then /done merge worked (copy removed, changes unstaged on main); flaws were toast wording and the agent handing checks to the user after `work_done`.
- Changed: `/done` queued toast in tui/component/prompt/move.tsx now reads "Closing out: work merges into the parent repo when this turn ends".
- Changed: `work_done` tool output (tool/work-done.ts) tells the agent the merge is automatic, to reply with one summary line, and not to ask the user to run anything.
- Changed: `/work` synthetic reminder (session/work-handoff.ts) tells the agent to run needed checks itself before finishing; merge success toast duration 5000 -> 8000 ms.
- Verification: `bun run typecheck` clean in opencode and tui; `bun test test/session/work-handoff.test.ts` 5 pass; `bun test test/provider/claude-code/fake-model.test.ts` 29 pass. Not run live.
- TODO: Claude Code session loses earlier context after the post-merge restart; not traced. `oc.work-generate-short-2-3` sibling dir may be a stale copy.

### User
Work close-out
- The `/done` message now says the work will merge into the parent repo when the turn ends.
- The agent is told to run its own checks and finish with one line instead of asking you to run them.
- The "Work merged" confirmation stays on screen longer.

---

## 2026-10-11 (~21:49) - v0.2.158 bangHahah - Report compacted size after /compact - Claude Sonnet 5.5, low reasoning; Agent

### Agent
- Meta: Claude Sonnet 5.5; low reasoning; Agent; completed
- Version: 0.2.158 bangHahah
- Fixed: `/compact` turns make no model call, so the finish event carried zero usage and the context meter never updated. `ClaudeTurn` (provider/claude-code/turn-stream.ts) now keeps `post_tokens` from the `compact_boundary` message (`parseCompactBoundary`) and reports it as the finish usage when the turn is a compaction with no model call.
- Added: assertion in test/provider/claude-code/fundamental-tools.test.ts that the compaction finish reports 10 output tokens.
- Verification: `bun test test/provider/claude-code/fundamental-tools.test.ts` 14 pass, 0 fail; `bun run typecheck` clean. Not run live.

### User
Context meter
- After running `/compact` with the Claude Code provider, the context meter now shows the compacted size instead of staying at the old value.

---

## 2026-10-11 (~21:36) - v0.2.157 discoloredDebt - Pass on native split: palette launch loop - Claude Opus 5.5, low reasoning; Pass

### Agent
- Meta: Claude Opus 5.5; low reasoning; Pass; completed
- Version: 0.2.157
- Fixed: `oc launch --palette` (cli/cmd/oc.ts) spawned `oc.exe --palette`, which the launch rewrite turned back into `oc launch` (spawn loop, was masked by OC_SINGLE). Now spawns the sibling native `opencode.exe` via `Revive.nativeExecutable`.
- Fixed: stale `oc single` comment in session/run-state.ts; SCRIPTS.md duplicate `.run.ps1` row and build.ps1 row.
- Kept: native writes oc-tuis ledger (scoped by executable); native revive stop-ack in tui.ts.
- Verified live by user: installed `oc.exe`/`opencode.exe` now distinct after second revive. First revive hard-linked both to the oc build (old running code).
- Verification: tsgo --noEmit opencode clean.

### User
Launcher
- `oc launch --palette "<entry>"` opens that palette entry in a native opencode window instead of looping.

---

## 2026-10-11 (~21:10) - v0.2.157 discoloredDebt - Split oc and native opencode binaries; remove oc single - Claude Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low; Implementation; completed. Plan: `nativeSplitPlan.md`
- Version: 0.2.157
- Added `Global.native` (`core/src/global.ts`): build define `OPENCODE_FLAVOR` ('oc'|'native'), `OC_FLAVOR` env for bun dev. Only gate for resident-server needs
- Changed `resolveExecutablePath`: only `occ` -> `oc`; oc build is now `oc.exe`, so resident server/attach/ledger run as oc.exe and never match native `opencode.exe`
- `build.ts`: variants production (`oc`), native (`opencode-native-*/bin/opencode.exe`), debug; flags `--oc-only`, `--native-only` (keep rest of dist); `--oc-only` honors `--with-debug`
- `index.ts`: native skips launcher rewrites; `oc` loader errors in native (skipped for --help)
- Removed `oc single`, `--single`/`--portable` on launch/previous, `mode` key, `OC_SINGLE` everywhere (tui.ts, app.tsx, footer label, startup scrub now `OC_FLAVOR`)
- Revive: `single`/`portable` -> `native` in ReviveContext/RestartContext; `Revive.nativeExecutable`; `reopenCommand` native = `opencode.exe <dir> [--session]`, env `OC_FLAVOR`; buildSteps outputs native exe file (shares oc's cursor-runtime). Native TUI hands off to sibling `oc.exe oc --revive` with `OC_FLAVOR=oc`; ignores inherited `OC_SUPERVISOR_PID`
- Scripts: `build.ps1 -Oc|-Native`, `install.ps1 -Oc|-Native` (removes each name before copy to break old opencode.exe hard links, relinks occ->oc, verifies opencode.exe has one link), `.install.ps1` passthrough, `.run.ps1` defaults to `oc launch`, `-Native`
- Updated user `oc.json` `executable` -> `Apps\opencode\oc.exe` (already exists as old hard link)
- Docs: README, FORK row "Native opencode binary", SCRIPTS, AGENTS rule
- Verification: `tsgo --noEmit` opencode/tui/core clean; revive.test.ts + command-loader 29 pass; core global.test.ts 4 pass. No build/install run
- Risk: first install must be full (not `-Native`): old oc.exe resolves to opencode.exe for server. External refs to opencode.exe as oc server (tray, shortcuts) need checking. wt `new-tab` env passthrough for bun-dev native revive unverified

### User
oc and opencode
- oc now installs two programs from the same source: `oc`/`occ` with the background server, and `opencode`, which runs every oc feature in its own window like stock OpenCode.
- `oc single`, `--single`, `--portable`, and the `mode` setting are gone; use `opencode` instead.
- `/revive` from an `opencode` window reopens `opencode`.
- `build.ps1` and `install.ps1` take `-Oc` or `-Native` to handle one program; `.run.ps1` opens oc by default and `-Native` runs the opencode flavor.

---

## 2026-10-11 (~20:33) - v0.2.156 - Show "-" for idle Claude 5-hour windows - Claude Opus 5.5, default reasoning; Implementation

### Agent
- Meta: Claude Opus 5.5 (impS orchestrator) + general-composer-2.5 subagent; default reasoning; Implementation; completed
- Version: 0.2.156
- Added: `formatClaudeUsageRows` `cell` (src/packages/tui/src/routes/session/sidebar-tools/usage.ts) maps hourly (`h`) window with `usedPercent === 0` and null reset to `"-"`. Cause: Claude API returns `resets_at: null` until first message opens a 5h window; also covers locally expired windows. Weekly null reset stays blank; non-zero percent without reset stays blank; null percent stays "reset unavailable".
- MISTAKE: first pass used `"not started"`; mixed pooled case overflowed sidebar width and wrapped into extra rows. Rule: keep reset-slot placeholders 1-2 chars so pooled rows never wrap.
- Updated tests in src/packages/tui/test/cli/tui/usage-freshness.test.ts: "Claude hourly 0% without a reset shows a dash" and "Claude pooled hourly dash and mixed reset slots" pin single, both-idle, mixed (default and width 40, one row), and non-zero-no-reset rows.
- Verification: `bun test test/cli/tui/usage-freshness.test.ts` 31 pass, 0 fail. Sidebar not run live after the dash change.

### User
Usage sidebar
- When a Claude account has no 5-hour window running yet, the sidebar shows "-" under its 0%h instead of a blank line.
- With several Claude accounts, idle ones show "-" in their slot while active ones keep their reset time, all on one row.

---

## 2026-10-11 (~17:39) - v0.2.156 crudFlick - Keep Claude usage visible after resets without messages - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation via Muse Spark 1.3 high subagent; completed
- Version: 0.2.156 crudFlick
- Fixed `src/packages/tui/src/routes/session/sidebar-tools/usage.ts`: parse Claude hourly/weekly independently; partial live responses keep known disk/memory siblings; genuine unknowns remain null instead of fabricated zero. Pool averages exclude unknown windows.
- Added `projectClaudeUsage` and explicit `updateClaudeSnapshot`; sidebar uses existing minute clock to expire known deadlines without waiting for next message/probe. Usage menu shares projection. Generic provider snapshot updater unchanged.
- Changed Claude date formatting: known percentages without next reset date leave blank slots; retained h/w labels, alignment, pooled rows and used/remaining toggle. Menu distinguishes cached readings and reset-derived zero.
- Preserved raw cache siblings and per-window reading times in `_fetchedAt` cache metadata; partial writes cannot make old sibling readings newly fetched after restart. Existing cache files use file mtime. Cached account fallback preserves source/age.
- Kept OAuth metadata GET/cache path; no automatic prompts, model calls, credential refresh/rotation, additional timers or account-switching changes. Preserved concurrent sidebar toggle/clipping and unrelated work.
- Verification: parent reran `bun test test/cli/tui/usage-freshness.test.ts` in `src/packages/tui`: 30 pass, 0 fail, 166 assertions; `bun test test/feature-plugins/open-sidebar.test.ts --test-name-pattern "reads Claude Code usage"`: 1 pass, 74 filtered, 0 fail. Scoped diff whitespace check passed. bgShell unavailable; short checks used built-in shell. No broader checks/build/install/live TUI run.
- Risk: reset-derived 0% expires old window locally, cannot measure new usage from other devices; menu labels inference. Live acceptance: leave Claude idle across deadline; hourly clears within minute, weekly remains, missing next-reset slot stays blank.
- Note: network/computer restart interrupted worker; resumed persisted edits and reran checks. File tool left one LF-only boundary in usage-freshness test; Git attributes normalize CRLF, no broad worktree normalization performed.

### User
Claude usage
- Known hourly and weekly percentages stay visible when a reset date is missing or a usage refresh returns only part of the data.
- Passed windows update locally without sending Claude a message, and missing next-reset dates leave blank spaces.
- Cached readings remain identified as last-known, including after a restart; genuinely unknown percentages still show unavailable.
- After rebuilding and installing, leave Claude idle through a five-hour reset and confirm the hourly reading clears while weekly usage remains visible.

---

## 2026-10-11 (~17:28) - v0.2.155 unplayableBarbara - Stabilize sidebar script and file clipping - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation via Muse Spark 1.3 high subagent; completed
- Version: 0.2.155 unplayableBarbara
- Fixed `sidebar-tools.tsx` refresh churn: all script/tree setters reconcile fresh snapshots against prior rows; equivalent rows retain object identity and measured clipping widths instead of remounting on `message.updated`.
- Added `helpers.ts` reconciliation keyed by file path or package-script name and tree relative/full path; compare all current script launch settings and tree fields so changed targets replace stale rows. Kept actual refreshes and existing pin sorting.
- Changed shared `clipEnd`: unmeasured rows render empty instead of flashing full paths; budgets below three cells cannot overflow with an ellipsis.
- Added `test/component/sidebarRows.test.tsx`: equivalent snapshot retention, changed launch/tree fields, distinct script kinds and roots, add/delete/reorder, narrow clipping, repeated refresh frame stability and resizing.
- Verification: `bun test test/component/sidebarRows.test.tsx` from `src/packages/tui`: 5 pass, 0 fail, 64 assertions. Render fixture uses production helpers and matching row geometry, not full `SidebarTools`; live sidebar, pin sorting UI and marquee not exercised. No build/install or broader checks.
- Preserved pending sidebar toggle/usage edits and unrelated work. Network restart interrupted review; resumed against persisted patch and reran final check.
- Note: edited helper/test files remain LF on disk; repository attributes normalize CRLF on checkout. File tools offered no line-ending normalization control.

### User
Sidebar
- Script and file rows keep their clipping stable when the same list refreshes during a response.
- Real script settings and file-list changes still update, and extremely narrow rows stay within their text budget.
- After rebuilding and installing, check the scripts list during an active response, then resize the sidebar and hover a long script name.

---

## 2026-10-11 (~08:25) - v0.2.154 truerPseu - Correction: handoff summary keeps deny-all via CLI-conversation continuity fix - Muse Spark 1.3, default reasoning; Implementation

### Agent
- Meta: Muse Spark 1.3; default reasoning; Implementation; completed
- Version: 0.2.154 truerPseu
- Corrects the previous entry: the read-only summary permission was a workaround and is reverted; deny-all is restored.
- Root cause was two-layered. Fixed `isTitleRequest` (title.ts) was necessary but not sufficient: with deny-all restored, the summary turn hung (empty assistant shell, zero model calls, 180s/240s timeouts) because a tool-less turn gets a fresh `no-tools::` CLI key with prior conversation, so `syncClaudeSession` stalls in `askFreshConversation` waiting for an operator answer.
- Fixed continuity in turn-context.ts following the compaction precedent: a tool-less turn under a real session agent now shares the chat's `tools::` conversation key (`continuesChat`), so the summary resumes the live CLI conversation (hashes match, no rewind, no question). Naming agents (title/rename/project-copy-name) and compaction keep exact prior behavior; genuine loss still asks.
- Added `isNamingAgent` (title.ts) plus continuity unit tests (title.test.ts: tool-less build shares `tools::` key, title stays `no-tools::`, compaction unchanged).
- Verification: title/handoff/overflow/v2-compat `54 pass / 0 fail`; typecheck clean for all touched files (remaining errors pre-existing work-handoff/work-done WIP); fake-model manual handoff and auto-threshold handoff `1 pass` each with deny-all, real summary, continued child response, no /compact (12-13s, warm resume).
- TODO: live Cursor acceptance remains user-side (no Cursor live harness; Cursor coverage unit-only plus shared overLimit/handoff tests).

### User
Handoff summary permissions
- The work-preservation summary now runs fully locked down again while still reaching the live conversation, so follow-up sessions continue correctly.
- Live Cursor acceptance still to do in a real Cursor session.

---

## 2026-10-11 (~08:19) - v0.2.154 truerPseu - Context-limit handoff corrections: title-detection fix, permission carryover, live auto-threshold coverage - Muse Spark 1.3, default reasoning; Implementation

### Agent
- Meta: Muse Spark 1.3; default reasoning; Implementation; completed
- Version: 0.2.154 truerPseu
- Fixed Claude title stub swallowing the handoff summary: `isTitleRequest` (provider/claude-code/title.ts) now keys on naming agents (title/rename/project-copy-name), so a tool-less session-agent turn reaches the model. Added provider/claude-code/title.test.ts (6 tests).
- Restored read-only SUMMARY_PERMISSION after live proof deny-all stalls: a tool-less summary turn lands on a fresh CLI conversation key and hangs in the fresh-conversation confirmation gate (session-sync.ts `askFreshConversation`) with zero model calls. Deny `*` plus allow read/glob/grep keeps the turn on the parent conversation; mutations stay denied, prompt still says no tools.
- Fixed `handoff.finish` to carry the original command-turn permission into the child kickoff (was session permission); moved child kickoff into the prompt loop (removes prompt/handoff layer cycle); `canAutoHandoff` needs 2 non-summary assistant turns (autonomous chains allowed, summary-only loops blocked); removed unused kickoff flag; strict TUI token parsing.
- Verification: title/handoff/overflow/v2-compat `51 pass / 0 fail`; core config `17 pass / 0 fail`; fake-model manual handoff and auto-threshold handoff `1 pass` each with continued child response and no /compact; typecheck clean for all feature files (remaining errors pre-existing in work-handoff/work-done WIP); TUI pane check not run (OC_TUI_PANE unset).
- ERROR: deny-all summary turn hangs headless (empty assistant shell, `llmCalls` stuck) and would pop a "Claude session lost" question in prod; read-only offer set required on Claude.
- TODO: live Cursor acceptance remains user-side (no Cursor live harness exists; Cursor coverage is unit-only plus shared overLimit/handoff tests).

### User
Context limit handoff
- When a session crosses the token threshold in Handoff mode, the follow-up session now actually continues the work instead of stalling, and it keeps the permissions the original turn had.
- Typing a non-numeric token threshold in the TUI dialog is now rejected.
- Live Cursor acceptance still to do in a real Cursor session.

---

## 2026-10-11 (~06:20) - v0.2.153 dwellingWassup - Slash commands supersede earlier personas; command-turn proxy tools load up front - Claude Opus 5.5, default reasoning; Implementation

### Agent
- Meta: Claude Opus 5.5 (Claude Code in oc); default reasoning; Implementation via Muse 1.3 high + Grok 4.6 medium subagents; completed
- Version: 0.2.153 dwellingWassup
- Fixed persona bleed: `/spitS` then `/impS` (same agent, resumed conversation) kept spitball rules. `SessionPrompt.command` (src/packages/opencode/src/session/prompt.ts ~1629) now prefixes single commands with `[/<name> is active: ... replace any earlier slash command's persona, mode, and rules ...]`; multi-command wrapper gained the same sentence.
- Added `withoutCommandHeader` in prompt.ts; `namingText` and subtask-only title path strip the header.
- Fixed command-turn "no read tool": command-permission spawns use `--tools ""` so only deferred `mcp__opencode_proxy__*` tools remained. `createProxyMcpServer` (proxy-mcp.ts) takes `alwaysLoad`; `planSpawn` sets it only for command-permission spawns. Normal turns stay deferred (alwaysLoad removal for native-tool turns still holds).
- Changed `buildToolEnvironmentNote(proxyTools, commandTurn)` (prompts.ts): command turns say built-ins are off and name the proxy replacements. Fresh spawn guaranteed since `toolCatalogHash` includes `commandPermission`.
- Tests: prompt.test.ts (single header, multi sentence), rename-digest.test.ts (header stripped), subagent-hint/proxy-mcp/fundamental-tools tests (note text, alwaysLoad config, spawn).
- Verification: claude-code tests + rename-digest `109 pass / 1 fail`; prompt.test.ts slash composition `3 pass / 0 fail`. Failing test `subagent-hint.test.ts` "proxy defs follow the tools opencode offered the agent" is pre-existing (expects DEFAULT_PROXY_TOOLS without `time`); files involved not touched. Live `command-permissions.test.ts` skipped (needs claude CLI). Not live-checked.
- Risk: `--tools ""` removing ToolSearch is inferred from `claude --help`, not measured. Older CLIs ignore unknown `alwaysLoad` (assumed).
- MISTAKE: subagents first wrote LF / changed unrelated em dashes in prompts.ts; caught on review and reverted. Rule: check line endings and diff scope of subagent edits.

### User
Slash commands
- Running a new slash command now clearly replaces the previous command's mode, so `/impS` after `/spitS` no longer acts like spitball.
- On Claude Code turns from a command with permissions, file tools like read and edit are available right away instead of looking missing.

---

## 2026-10-11 (~04:29) - v0.2.153 dwellingWassup - Persist Claude pool across revive - Cursor Grok 4.6, default reasoning; Implementation

### Agent
- Meta: Cursor Grok 4.6; default reasoning; Implementation; completed
- Version: 0.2.153 dwellingWassup
- Added persist of `currentAccount`/`limitedUntil` to `Global.Path.data/claude-code/account-pool.json` in `accounts.ts`; load on first pool read; drop past deadlines; write on mark and current-account change. `_resetAccountPool` and `BUN_TEST` disable disk.
- Added usage-cache seed on first load: `claude-usage.json` / `claude-usage-<name>.json`, 100% `five_hour`/`seven_day` with future `resets_at` marks limited (later reset wins); never lowers a persist deadline; missing/99% ignored.
- Added session/usage/weekly limit patterns to `ACCOUNT_LIMIT_PATTERNS`; `onResult` calls `beginTextAccountSwitch` so CLI text without `rate_limit_event` fails over. `allowed_warning` still does not switch. Compaction still does not switch.
- Verification: `bun test test/provider/claude-code/account-pool.test.ts test/provider/claude-code/cli-events.test.ts` 24 pass 0 fail; `bun run typecheck` in packages/opencode exit 0. No live `/revive` check.

### User
Claude accounts
- After `/revive` or a server restart, oc keeps using the Claude login that was already in use, and skips a login whose 5-hour or weekly bar is already at 100%.
- If Claude only says "You've hit your session limit" instead of sending a formal rejection, oc still moves the chat to the next login.

---

## 2026-10-11 (~03:50) - v0.2.152 psnEw - Restore WezTerm tabs on revive - Cursor Grok 4.6, default reasoning; Implementation

### Agent
- Meta: Cursor Grok 4.6; default reasoning; Implementation; completed
- Version: 0.2.152 psnEw
- Added optional `sessionID`/`directory` on `TuiLedger.Record`; `read` rejects empty/wrong types.
- Changed TUI ledger write: `app.tsx` `writeLedger` plus `createEffect` on route session; `directory` from `sync.session.get` or `sdk.directory`; write errors ignored.
- Added `Revive.Tab`, `RestartContext.tabs`, `windowTabs(listJson, records, paneID)` (window of pane, list order, first pane per `tab_id`, oc vs shell cwd from `file://`), `decodeRestart`/`decodeTabs`, `reopenCommand` WezTerm multi-tab `oc revive-tabs`.
- Added `revivePipeline` snapshot before `shutdownAll` (`wezterm cli list`, `TuiLedger.read`+`select`); prepends reviving pane (hosted TUI already gone); list failure logs one revive line and continues without tabs.
- Added `oc launch --session`; hidden `oc revive-tabs` sequential `wezterm cli spawn` then tab 0 in-process.
- Fixed home oc tab: no `sessionID` uses `oc launch` with no target (`launchProject(undefined)`) so no bootstrap session; spawn still `--cwd <dir>`.
- Verification: `bun test test/config/revive.test.ts test/config/tuiLedger.test.ts` 28 pass 0 fail; `bun run typecheck` in packages/opencode (`tsgo --noEmit`) exit 0. No spawnTab unit test (not exported). Live WezTerm restore not checked. packages/tui typecheck still fails on pre-existing `usage-freshness.test.ts` `starts` (unrelated).
- Risk: tab order assumes `wezterm cli list` row order (unverified live); split panes keep only their first pane; only the reviving window is restored.

### User
Revive
- `/revive` in a WezTerm window with several tabs reopens those tabs in the same order: oc tabs return to the session they were showing, and plain shell tabs return as shells in the same folder.
- A tab that was on the home screen comes back as home, not a new session.
- Windows Terminal, a single-tab window, and single mode keep the previous one-tab restart.

---

## 2026-10-11 (~02:46) - v0.2.151 moderatorfakefronttiresSlobs - Usage provider spacing toggle - Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Opus 5.5; low reasoning; Implementation; completed
- Version: 0.2.151 moderatorfakefronttiresSlobs
- Added `usageSpacing: boolean` (default false) to `SidebarSettings` in `sidebar-tools/helpers.ts`; normalized as boolean-only; `saveUserUsageSpacing` writes user `~/.config/openSidebar/config.json`.
- Added `usageSpacing` signal in `sidebar-tools.tsx`; stripped from project config save; Usage menu Settings row "Toggle: provider spacing on/off".
- Changed `usageRows`: providers wrapped in column box with `gap={usageSpacing() ? 1 : 0}`, each provider in its own box so hidden providers get no gap.
- Kept: `showRemaining` still not persisted (raised to user, not changed).
- Added (follow-up): `formatClaudeUsageRows` marks first pooled weekly row `spaced`; `aligned` adds `marginTop` 1 there when spacing is on, splitting Claude h rows from w rows.
- Fixed: usage second columns misaligned across rows/providers when dates differ in length (`~12:00PM` vs `~7:30AM`). `formatUsageRows` takes `columns` (min date start per window slot) and returns `starts`; new `usageColumns` takes the max per slot. Sidebar `usageRows` lays out Codex/Claude/Cursor/Go twice (measure, then shared columns). `formatClaudeUsageRows` passes `columns` through. Replaced an earlier per-account date-padding attempt that fixed Claude but shifted it off Codex.
- Added: sidebar section collapse state persists in TUI kv (`sidebar_open_<section>`) via new `feature-plugins/sidebar/open.ts` `sectionOpen`; used by mcp, lsp, todo, files, subagents, plugins (plugins keeps "unset follows failures" default). Global, not per-session. tsc clean; live toggle not checked.
- Removed: `[+]`/`[-]`/`[!]` status markers from sidebar sub-agent rows (`feature-plugins/sidebar/subagents.tsx`); color and the `. done` label still show status. No test referenced them.
- Verification (follow-up): scratch run with screenshot values printed all second columns at the same cell; open-sidebar.test.ts 73 pass, 2 skip; tsc clean for sidebar-tools.
- Fixed: Claude label greyed while data was fresh. `usageColor` dimmed any `source === "cache"` read; with several oc instances polling, this one gets rate-limited and reads the cache another instance wrote seconds ago (both claude-usage*.json mtimes current). Now dims only when `stale` or older than 10 min (cache reads already carry the file mtime as `fetchedAt`).
- Verification: `bun test test/feature-plugins/open-sidebar.test.ts -t usage` 19 pass (new spacing test included); `tsc --noEmit` in packages/tui exit 0. Live TUI look not checked.

### User
Sidebar usage
- The Usage popout has a new "provider spacing" toggle that adds a blank line between each provider in the sidebar.
- The setting is remembered across restarts and is off by default.
- Collapsing a sidebar section (MCP, LSP, Todo, Files, Sub-agents, Plugins) is now remembered across sessions and restarts.

---

## 2026-10-11 (~02:27) - v0.2.150 hawkHygienist - Drop padded usage decimals - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed; delegated implementation, parent reviewed formatter
- Version: 0.2.150 hawkHygienist
- Changed `formatUsagePercent` in `src/packages/tui/src/routes/session/sidebar-tools/usage.ts`: strips trailing decimal zeros after existing adaptive rounding, retaining meaningful fractions and suppressing remaining-mode subtraction noise. Current integer probe readings display integer percentages.
- Updated `usage-freshness.test.ts` spacing expectations; added actual fractional and remaining-mode cases. Delegated check: 17 pass, 0 fail, 74 expectations. No live TUI check.
- Kept calculated reset-clock alignment and existing once-per-session version bump.

### User
Usage sidebar
- Integer percentages no longer show fabricated decimal zeros; actual fractional values retain meaningful decimals.

---

## 2026-10-11 (~02:10) - v0.2.150 hawkHygienist - Separate Claude hourly and weekly usage rows - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed; delegated implementation, parent reviewed source and focused checks
- Version: 0.2.150 hawkHygienist
- Added `formatClaudeUsageRows` in `src/packages/tui/src/routes/session/sidebar-tools/usage.ts`: multiple readable accounts show hourly/reset pairs then compact weekly/reset pairs; each value aligns to its own clock hour. Single readable account uses its own hourly and weekly windows side by side without slash.
- Changed `sidebar-tools.tsx` to render formatted Claude pairs, showing label once for multiple accounts. Removed obsolete inline weekly-band branches; Go retains explicit slash separator.
- Verification: delegated `bun test test/cli/tui/usage-freshness.test.ts` in tui: 17 pass, 0 fail, 68 expectations. Covers exact four-row layout, single readable pooled account, missing resets, remaining mode, and three-account narrow pairs. Live TUI not checked.
- Kept existing once-per-session version bump and single-pair narrow clipping limitation.

### User
Usage sidebar
- Multiple Claude accounts now have hourly usage and reset rows followed by weekly usage and each account's weekly reset.
- A single readable Claude account uses the same two-number layout as Codex.

---

## 2026-10-11 (~02:05) - v0.2.150 hawkHygienist - Replace Claude usage bars with spaces - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed follow-up
- Version: 0.2.150 hawkHygienist
- Changed `formatUsageRows` in `src/packages/tui/src/routes/session/sidebar-tools/usage.ts`: replaced outer Claude weekly-band bars with spaces, including split-account rows; hourly/reset alignment unchanged.
- Updated focused golden expectations; `bun test test/cli/tui/usage-freshness.test.ts` in tui: 13 pass, 0 fail, 61 expectations. Live TUI not checked.
- Kept existing once-per-session version bump.

### User
Usage sidebar
- Claude weekly percentages are surrounded by spaces instead of vertical bars.

---

## 2026-10-11 (~02:04) - v0.2.150 hawkHygienist - Remove Codex usage slash - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed follow-up
- Version: 0.2.150 hawkHygienist
- Changed `formatUsageRows` in `src/packages/tui/src/routes/session/sidebar-tools/usage.ts`: Codex percentages separated by padding only; reset-clock alignment preserved.
- Updated two Codex golden expectations in `usage-freshness.test.ts`.
- Verification: `bun test test/cli/tui/usage-freshness.test.ts` in tui: 13 pass, 0 fail, 61 expectations. Live TUI not checked.
- Kept existing session version bump; revision already bumped once this session.

### User
Usage sidebar
- Removed the slash between Codex usage numbers while keeping their alignment with reset times.

---

## 2026-10-11 (~01:59) - v0.2.150 hawkHygienist - Align usage percentages with reset times - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed; delegated implementation to Sol low, parent reviewed code and corrected reset comma separator; final bookkeeping only in this turn.
- Version: 0.2.150 hawkHygienist
- Added `formatUsagePercent` in `src/packages/tui/src/routes/session/sidebar-tools/usage.ts`: below 10 uses two decimals, 10 to below 100 uses one, 100 uses integer; compact Claude weekly band and Cursor API remain integers.
- Added `formatUsageRows`: aligns first percentage digit with its own reset clock-hour digit, adds padding only as needed, and splits width overflow into whole matched percentage/reset pairs.
- Updated `src/packages/tui/src/routes/session/sidebar-tools/sidebar-tools.tsx`: centered slash for Codex/Go; pooled Claude hourly values with `|weekly/weekly|` band; Cursor monthly `;` API; reset dates use comma-space. Preserved auth, menu, stale state, and remaining mode.
- Added exact October golden examples in `src/packages/tui/test/cli/tui/usage-freshness.test.ts`, variable date widths, 0/9/10/99/100 boundaries, null/missing resets, remaining mode, and three-account narrow matched pairs.
- Verification: final delegated `bun test test/cli/tui/usage-freshness.test.ts` in `src/packages/tui`: 13 pass, 0 fail, 61 expectations, 205ms. No typecheck, build, install, push, or live TUI rendering validation; bookkeeping reran no checks.
- Limit: a matched pair can clip when pane is narrower than that single pair.
- Reference: extends v0.2.145-147 usage history preserved in `buildNotes.archive8.md`; retained current cumulative summary and other session's v0.2.149 entry unchanged. Other session completed rotation; no additional rotation performed.

### User
Usage sidebar
- Usage percentages show more precision at low values and align with their own reset times.
- Provider separators and pooled Claude weekly values stay compact, while narrow rows split at complete percentage/reset pairs.
- Thirteen focused checks passed; actual terminal rendering remains unvalidated, and a pane narrower than one pair can still clip it.

---

## 2026-10-11 (~01:55) - v0.2.149 bihhFudge - Session titles focus on the actual work - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.149 bihhFudge
- Changed `opencode/src/agent/prompt/title.txt`: concrete feature/problem/decision before workflow labels, specific behavior, supported details, quoted command instructions treated as context; two examples added.
- Added `ocCommandArguments` in existing text-part metadata at shared command expansion path. Chat still stores/runs complete templates; naming uses nonempty original arguments before digest truncation. Older messages and argument-free task commands retain text.
- Reused `namingText` in native initial-title model context and `renameDigest`; automatic oc names already call rename. Composed commands retain one original request, preserving latest substantive replies. No wire schema/dependencies/extra model calls.
- Added digest regression cases; updated automatic first-command test to assert request-only naming and unchanged persisted template; added fake-model native/manual composed-command scenario with >1500-character boilerplate.
- Verification: `bun test test/session/rename-digest.test.ts test/session/autoRename.test.ts --timeout 30000` in opencode: 14 pass, 0 fail, 55 assertions after final source edits. No build/install/typecheck/real-model title-quality check; bgShell tools unavailable, used built-in shell for scoped checks.
- Moved previous 1152-line active notes verbatim to `buildNotes.archive8.md`; destination absence and before/after SHA-256 verified. Fresh summary covers archives1-8. Kept unrelated dirty source changes.
- Limit: original arguments recoverable only for newly saved command turns; existing histories receive improved prompt but retain old expanded text. Argument-free commands retain text because their templates may contain the actual task. Subtask-only command naming retains existing path.

### User
Session names
- `/rename` and automatic titles now favor the concrete subject over labels such as spitballing or thinking.
- New slash-command requests reach the naming model without long command instructions hiding the subject, including combined commands.
- Fourteen focused checks passed; actual model wording remains a live `/rename` check after rebuilding.

Notes
- Older history was preserved in `buildNotes.archive8.md` and the active notes now have an updated cumulative summary.

---
