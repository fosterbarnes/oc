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

## 2026-10-14 (~22:43) - v0.2.198 garnishKickflipping - agent-push session title with pushed commit hash - Claude Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Claude Opus 5.5; low; Implementation (/spit then /imp); completed
- Version: 0.2.198 garnishKickflipping
- Fixed v0.2.197 agent-push title: it was hardcoded `oc - agent-push: commit here` and only applied when agent-push was the first message (`startTitle` skips once users > 1). Removed `_FIXED_TITLES`, its `title()` branch, and the `ocCommand` text-part metadata (no other reader).
- Added `agentPushTitle(directory)` in `tool/sessionComplete.ts` (`<basename> - agent-push:`). `SessionPrompt.command` sets it before `prompt()` when any selected command name is `agent-push`, at any message count. Automatic naming skips non-default titles, so no conflict.
- Added in `SessionCompleteTool`: after marking complete, if the title equals the placeholder, `git rev-parse HEAD @{u}` must match (full hashes), then title becomes `<placeholder>#<rev-parse --short=7 HEAD>`. No upstream, or HEAD not pushed: placeholder stays as the failure marker. `--short` accepts only one revision, hence two calls.
- Added `Git.node` to `ToolRegistry.node` deps (and the `task.test.ts` layer group, which lists nodes explicitly).
- Changed `.scripts/agentPush.ps1` push report to `git rev-parse --short=7 HEAD`. Set local `git config core.abbrev 7` in this repo (git picked 9 at ~220k objects; local `.git/config` only).
- Updated wiki `Sessions.md` Names section (separate `oc.wiki` checkout, unpushed).
- Risk: TUI Ctrl+Shift+Enter complete toggle does not go through the tool, so it adds no hash. The Claude Code proxy reaches `session_complete` through the live tool registry (`spawnPlanning.ts` LiveToolInfo); not exercised live.
- Verification: new `task.test.ts` "completion appends the pushed commit" (no upstream keeps placeholder; after push to a bare origin gets hash) plus the existing completion tests, 5 pass; new `prompt.test.ts` "agent-push mid-session" plus command permission test, 2 pass; `autoRename`/`renameDigest` 15 pass; `registry`/`skill`/`commandPermissions` 25 pass; opencode typecheck exit 0. Live run not done.
- ERROR: first draft used `git rev-parse --short=7 HEAD @{u}`, which fails ("Needed a single revision"); the new test caught it.

### User
session titles
- Running agent-push renames the session to `<folder> - agent-push:` at any point in a session, not just as the first message.
- When the push lands and the agent marks the session complete, the title gains the 7-character commit hash, like `oc - agent-push:#b5e4f26`.
- A title without a hash means the push did not finish.
- Short commit hashes in this repo and in the agent-push report are now 7 characters.

---

## 2026-10-14 (~22:28) - v0.2.197 attemptingNation - Claude auto-resume becomes one harness palette entry - Claude Opus 5.5, low reasoning; Agent

### Agent
- Meta: Claude Opus 5.5; low reasoning; Agent; completed
- Version: 0.2.197 attemptingNation
- Replaced palette commands `resume.toggle` and `resume.list` in `tui/src/app.tsx` with `claude.autoResume` (group "Third party harness management", desc on/off). Dialog: Setting row toggles via `sdk.resume.set`; Scheduled rows (sorted by `fireAt`, shows retry count) cancel via `sdk.resume.cancel`; inert "None" row when empty; dialog reloads state after each action. Dropped unused `ScheduledResumeEntry` import.
- Updated wiki `oc.wiki/Claude-Code.md` "When usage runs out" for the new entry name.
- Kept: unrelated worktree changes in `prompt.ts`, `package.json`, `bun.lock`.
- Verification: `bun run typecheck` in `packages/tui` passed. Not run live.

### User
Command palette
- The two auto-resume entries ("Enable auto-resume after usage reset", "Scheduled resumes") are now one "Claude auto-resume" entry under Third party harness management, showing on/off.
- Opening it explains what auto-resume does, toggles it, and lists scheduled resumes with their fire time; selecting one cancels it, and an empty list shows "None" instead of a toast.

---

## 2026-10-14 (~22:04) - v0.2.196 roNetwork - New session from Home opens faster - Claude Opus 5.5, low reasoning; Agent

### Agent
- Meta: Claude Opus 5.5; low reasoning; Agent; completed
- Version: 0.2.196 (reused uncommitted bump per user; no new bump)
- Moved: ported uncommitted ocCLONE change (plan `2026-10-14-new-session-speed-merge.md`); `git apply --3way` clean
- Added `src/packages/core/src/util/ocSession.ts`: `writeSidebar`, `nextProjectTitle` moved verbatim; `opencode/src/config/oc.ts` re-exports them
- Added `src/packages/tui/src/ocNewSession.ts`: `listHomeDirs` (no stat on name sort), `bootstrapSession` (SDK in-process: sidebar, global list limit 500, create + noReply prompt with explicit `directory`)
- Removed from `tui/src/app.tsx`: `listOcHomeDirs`, `runOcCommand`, `bootstrapOcSession`, executable check on `oc.new_session` path
- Added `src/packages/tui/test/ocNewSession.test.ts`
- Verification: `bun test test/ocNewSession.test.ts` (tui) 2 pass; `bun test test/cli/sessionBootstrap.test.ts` (opencode) 2 pass; `bunx tsc --noEmit` (tui) no errors; leftover-name grep clean
- Risk: remote `oc attach <url>` lists local folders (pre-existing)

### User
Sessions
- Home -> Ctrl+N -> pick project now creates the session directly instead of launching a separate oc process, so the prompt opens faster.
- New session no longer requires a configured oc executable.

---

## 2026-10-14 (~22:02) - v0.2.196 roNetwork - Question tool works the same on every Claude turn - Claude Opus 5.5, low reasoning; Agent

### Agent
- Meta: Claude Opus 5.5; low; Agent (merge handoff questionToolConsistency.merge.md); completed, not committed
- Version: 0.2.196
- Moved uncommitted question-tool changes from ocCLONE2 (base 8a42a5cd3) via patch: question.txt, prompts.ts (QUESTION_PROXY_HINT, MULTI_STEP_TASK_HINT), proxyToolDefs.ts (QUESTION_PROXY_NOTE, static question def), question.test.ts (open-ended options: []), subagentHint.test.ts
- Fixed merge conflict by hand in spawnPlanning.ts: v0.2.194 replaced hasCommandPermission with commandToolPlan; kept that and applied overlayQuestionProxyDescription on command-turn staticDefs, added toolNameForHost import
- Kept ocCLONE2 src/.version out; left user's src/bun.lock and package.json changes untouched
- Verification: bun test question.test.ts subagentHint.test.ts proxyMcp.test.ts: 95 pass, 0 fail
- TODO: command-turn question overlay has no automated test (no planSpawn command-turn fixture)

### User
Claude provider
- Claude now uses oc's question form consistently, including for open-ended questions and on command turns like `/spit`.
- Claude is told to keep working through routine multi-step tasks instead of stopping to ask.

---

## 2026-10-14 (~21:58) - v0.2.195 regenerateVomit - Claude no longer answers the revive mark before your prompt - Claude Opus 5.5, low reasoning; Debug

### Agent
- Meta: Claude Opus 5.5; low; Debug; completed
- Version: 0.2.195 regenerateVomit
- ERROR: first prompt after `/revive` (session ses_ec2d2575bffefzJxzDmWSxx7gP) got a Claude step answering the revive mark ("brief revival notice"), then a second step for the real prompt. DB: assistant msg_13d42b0dd parentID = revive mark msg_13d42101d.
- Root cause: `pendingUser` in `session/prompt.ts` loop (added fc7699a1e, v0.2.186 steering follow-up) picks the OLDEST user message after the last Claude step's parent. The TUI revive mark (`app.tsx` `mark()`, `noReply`) sits there, so it ran as its own turn and the real prompt was filtered out until the next loop step. Same class as the v0.2.186 launcher-message fix.
- Added `noReply` (optional boolean) to `SessionV1.User` (`schema/src/v1/session.ts`); `createUserMessage` persists it when `input.noReply`. `pendingUser` and `unanswered` skip `noReply` messages; the mark still reaches Claude as context with the next prompt.
- Regenerated legacy SDK (`sdk/js/src/v2/gen/types.gen.ts`: one line).
- Risk: marks saved before this build have no flag; one already sitting after the last Claude reply can still be answered once.
- Added fakeModel.test.ts "a revive mark between prompts is never answered on its own": prompt, noReply revive mark, prompt; expects 2 Claude requests, mark flagged, assistants parented to the two real prompts.
- Verification: new test fails without the `pendingUser` skip (3 requests), passes with it; with the launcher-mark rename test: 2 pass. `bun run typecheck` in opencode clean. Not checked live (needs build).

### User
Claude Code chats
- After a revive, Claude answers your next prompt directly instead of first replying to the "oc revived" line.

---

## 2026-10-14 (~21:58) - v0.2.194 hoplessExposing - Agent rules denying websearch turn Claude's WebSearch off - Claude Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Claude Opus 5.5; low; Implementation; completed
- Verified live: user confirmed closed-command WebSearch fix (v0.2.194).
- Fixed: agent/session `websearch: deny` never reached Claude's WebSearch; `nativeToolsDeniedByHost` reads only offered oc tools, and oc offers `websearch` only with Exa/Parallel.
- Added `harnessToolsDenied` (`session/llm/request.ts`): `CLAUDE_HARNESS_ONLY_TOOLS` built-ins disabled by agent+session permission, sent as `opencodeHarnessDenied` (`CLAUDE_CODE_HARNESS_DENIED_OPTION`, `shared.ts`). Read by `harnessToolsDenied` (`callOptions.ts`); `spawnPlanning.ts` adds it to `--disallowedTools` on normal and open command turns, drops it from closed `--tools`; `toolCatalogHash` keys on it.
- Verification: `commandToolPlan.test.ts` (new case), `fundamentalTools`, `commandPermissions`: 21 pass. `bun run typecheck` clean. Not checked live.

### User
Claude Code
- An agent that denies `websearch` now also turns Claude Code's own web search off.

---

## 2026-10-14 (~21:37) - v0.2.194 hoplessExposing - Live toolHost check; WebSearch kept in closed command turns - Claude Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Claude Opus 5.5; low reasoning; Implementation; completed
- Version: 0.2.194 hoplessExposing
- Verified live (v0.2.193): `/imp` ran Claude's own Bash with `run_in_background`, no oc bash/bgStatus/bgKill; `/spit` refused oc `write` outside plans, Claude `Write` was off, oc question/skill/session_*/custom_websearch still loadable. "71 tools disconnected" notice on command turns is Claude Code's MCP reconnect report, not loss.
- Fixed: closed command turns (`"*": deny`) dropped Claude's WebSearch even with `websearch: allow`. Root cause: `--tools` built only from `CLAUDE_NATIVE_TOOLS`, gated on oc offering the tool; oc offers `websearch` only with Exa/Parallel (`tool/registry.ts:336`).
- Added `CLAUDE_HARNESS_ONLY_TOOLS` (`websearch: ["WebSearch"]`) in `provider/claude-code/shared.ts`. `commandToolPlan` (`session/llm/request.ts`) adds a harness-only id to `native` when the command's rules do not deny it and `toolHost` is not `oc`. `splitCommandTools` (`proxyToolSelection.ts`) keeps it without needing an offered oc tool and puts it in `off` otherwise, so a non-closed turn denying `websearch` now also turns WebSearch off. `spawnPlanning.ts` closed `cliTools` drop WebSearch when `config.webSearch === "disabled"`.
- Docs: FORK.md row 175 status and WebSearch note; wiki `Agents-and-Skills.md` WebSearch sentence.
- Verification: `commandToolPlan.test.ts` (new WebSearch case), `fundamentalTools.test.ts` (closed spawn `--tools ToolSearch,Read,WebSearch` with no oc websearch offered), `commandPermissions.test.ts`: 20 pass, 0 fail. `bun run typecheck` in opencode clean. WebSearch fix not checked live (needs build).

### User
Commands on Claude Code
- `/spit` and other commands that block everything they don't list now keep Claude Code's own web search when they allow `websearch`.
- A command that denies `websearch` now also turns Claude Code's web search off.
- Checked live: `/imp` runs background jobs with Claude Code's own shell, and `/spit` still refuses writes outside the plans folder.

---

## 2026-10-14 (~21:29) - v0.2.193 eldritchWario - Command turns keep Claude Code's own tools; per-tool toolHost - Claude Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Claude Opus 5.5; low; Implementation; completed
- Version: 0.2.193 eldritchWario
- Plan: `C:/Users/Foster/.config/opencode/plans/2026-10-14-command-turns-native-tools.md` (option a, per tool).
- Fixed: any command with rules spawned Claude with `--tools ToolSearch` and proxied every oc tool, so `/imp` lost native Bash/Read/Edit and background runs.
- Added `toolHost` (`auto`/`oc`/`harness`, `*` default) to command config (`core/src/v1/config/command.ts` `ToolHost`), skill frontmatter (`skill/index.ts`, server-side only), `Command.Info`, and `UserMessage` (`schema/src/v1/session.ts`). `command()` merges it (later wins) next to `turnPermission`; compaction copies it like `permission`; Claude steering refuses to merge into such turns.
- Added `commandToolPlan` (`session/llm/request.ts`): per `CLAUDE_NATIVE_TOOLS` id, auto = native unless the command's own rules limit it (non-`*` pattern or `ask`; `external_directory` counts for file tools). `closed` when rules deny unlisted tools or `"*": oc`. Sent as JSON in `opencodeCommandPermission` (was `"true"`).
- Moved the native map to `provider/claude-code/shared.ts` (`CLAUDE_NATIVE_TOOLS`). Added `splitCommandTools` (`proxyToolSelection.ts`): forwarded proxy names, kept/off built-ins. bgStatus/bgKill follow bash. `spawnPlanning.ts`: closed → `--tools ToolSearch,<kept>`; open → normal built-ins plus `--disallowedTools` for proxied/denied natives. `callOptions.ts` `commandToolPlan` replaces `hasCommandPermission`; catalog hash keys on the plan.
- Changed the tool note (`prompts.ts`): names only the limited tools.
- Regenerated the legacy SDK (`sdk/js/src/v2/gen/types.gen.ts`: `toolHost` on UserMessage and command config). Restored line-ending-only rewrites of `bun.lock` and `packages/opencode/package.json` from that run.
- Kept: normal oc models unchanged; Cursor already executes its native calls through oc tools, so no Cursor change. `harness` applies only to tools with a Claude built-in counterpart.
- Docs: `FORK.md` plan-only command permissions row; wiki `Agents-and-Skills.md`, `Configuration.md` (push is the user's).
- Verification: `tsgo --noEmit` clean in opencode, core, schema. `bun test` new `commandToolPlan.test.ts` plus edited `fundamentalTools`/`subagentHint`: 44 pass. Fake-model `claude-code/commandPermissions.test.ts` (spit-style: native Read, proxied Write/Edit, native Write bypass blocked; new imp-style: native Bash/Read/Edit/Write, no proxy bash/bgStatus): 1 pass. `commandPermissions`, `commandPermissionsFlow`, `test/skill`, `claude-code/backgroundShell`: 32 pass. No live run.
- Risk: `harness` on a limited tool runs Claude's own tool, so oc can't enforce that limit. That is by design for an explicit opt-in.

### User
Commands on Claude Code
- Slash commands like `/imp` now keep Claude Code's own tools (Bash, Read, Edit, background runs). Only tools a command limits, like `/spit`'s plans-only edits, switch to oc's versions.
- A new `toolHost:` setting in a command or skill file picks per tool: `auto`, `oc` (always oc's tool), or `harness` (always Claude Code's own).

---

## 2026-10-14 (~20:50) - v0.2.192 scallywagWhatsoever - Remove leftover tuiDiag debug writes - Claude Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Claude Opus 5.5; low; Implementation; completed
- Version: 0.2.192 scallywagWhatsoever
- Removed `tuiDiag.txt` appendFileSync writes from `ui/dialog-select.tsx` (submit), `routes/session/dialog-message.tsx` (create, revert select/result), `routes/session/index.tsx` (message mouse down/up; dropped the now-empty `onMouseDown`). No source references remain.
- Added `esc` row to `oc.wiki/Keybinds.md` for drill-in menus going back (wiki push is the user's).
- Verification: `bun x tsc --noEmit -p .` in `packages/tui` clean. Live Esc-back confirmed by the user on the installed build.

### User
Cleanup
- oc no longer writes a debug log to the temp folder on menu picks, message clicks, and reverts.
- The Keybinds wiki page lists Esc going back in menus opened from another menu.

---

## 2026-10-14 (~20:40) - v0.2.192 scallywagWhatsoever - Esc goes back in drill-in dialogs - Claude Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Claude Opus 5.5; low; Implementation; completed
- Version: 0.2.192 scallywagWhatsoever
- Added `back` option to `dialog.replace(input, onClose, { back })` in `ui/dialog.tsx`; global escape runs `back` when set, else closes. ctrl+c still closes. Exposed `dialog.escape()` for header "esc" labels (select, prompt, confirm, alert, export-options, dialogHotkey).
- Removed `dialog.push` (only user: hidden models, now `replace` + `back`) and the `submenu` gutter in `command-palette.tsx` (no command set it).
- Kept vanilla rule (sst/opencode dev `DialogSelect.onCancel` "Back"): palette -> dialog still closes; only drill-ins go back. Did not wire Esc to component `onCancel` props: `DialogPrompt.show`/`DialogConfirm.show` use `onCancel` as a resolve, so Esc would leave the dialog open.
- Wired `back`: script settings children (extension/executable prompts, language pick, WezTerm split size mode/value) in `sidebarTools.tsx`; hidden models and Connect provider in `dialog-model.tsx`; set hotkey -> palette (same category); session rename -> session list; subagent add model/efforts -> subagents; queued prompt edit -> queue. Removed dead `onCancel` props those prompts passed.
- Removed `tuiDiag.txt` debug writes in `ui/dialog.tsx` only. TODO: same writes remain in `dialog-select.tsx:370`, `dialog-message.tsx`, `routes/session/index.tsx` (not touched; may be an active debug session).
- Not done: plugin API dialogs (`feature-plugins/system/plugins.tsx` install -> list) because `api.ui.dialog.replace` is the public plugin surface.
- Verification: `bun x tsc --noEmit -p .` in `packages/tui` clean (0 lines). No pane check run; no live run.

### User
Dialogs
- Pressing Esc in a menu opened from another menu now returns to that menu instead of closing everything, matching vanilla OpenCode.
- This covers script settings sub-menus, hidden models, Connect provider from the model list, set hotkey from the palette, session rename, adding a subagent, and editing a queued prompt.
- Clicking the "esc" label in a dialog header does the same as pressing Esc.
- Dialogs opened straight from the command palette still close on Esc, and ctrl+c still closes any dialog.

---

## 2026-10-14 (~20:31) - v0.2.191 simplicityPonny - About dialog in the oc palette - Claude Opus 5.5, default reasoning; Implementation

### Agent
- Meta: Claude Opus 5.5; default reasoning; Implementation (after /spit plan); completed
- Version: 0.2.191 simplicityPonny
- Added `InstallationVersionTag` (`core/src/installation/version.ts`), baked from `.version/versionTag` as `OPENCODE_VERSION_TAG` in `opencode/script/build.ts` (validated `^[A-Za-z]+$`). `cli/script/build.ts` untouched: it does not define display version either.
- Added `tui/src/component/dialog-about.tsx`: oc version+tag, OpenCode version, build flavor+channel, Bun+OS, creator, repo/wiki `Link`s, license; `enter` copies. Layout mirrors `dialog-debug.tsx`.
- Added `oc.about` (`/about`) in `tui/src/app.tsx`, top `oc` group after Clear saved images.
- Added About mention to wiki `Troubleshooting.md` intro (wiki push is user's).
- Verification: `bunx tsc --noEmit` in `packages/tui` clean (exit 0). No build or live run.

### User
oc palette
- `ctrl+o` has a new **About** entry (also `/about`) showing the oc version and tag, the OpenCode version it includes, build, runtime, creator, and links to the repo and wiki.
- Press `enter` in the About dialog to copy its details.

---

## 2026-10-14 (~19:50) - v0.2.190 trailDepressing - One apply_patch model check for tools and prompt - Claude Opus 5.5, default reasoning; Implementation

### Agent
- Meta: Claude Opus 5.5; default reasoning; Implementation; completed
- Version: 0.2.190 (already bumped this session; no second bump)
- Fixed: gpt-oss got edit/write (registry excluded `oss`) but `gpt.txt` ("Always use apply_patch") via `SystemPrompt.provider` matching any `gpt`.
- Added `Patch.usesApplyPatch(modelID)` in `src/patch/index.ts`; `tool/registry.ts` tool filter and `session/system.ts` GPT prompt branch both use it. Non-patch GPT ids (gpt-oss, `gpt` without `gpt-`) now fall to the default prompt. Session path already passes `model.api.id` to the registry (`session/tools.ts`), so both sides read the same id.
- Added `test/session/system.test.ts` case: gpt-5/gpt-5-codex prompts mention apply_patch, gpt-oss ids do not. gpt-6 (astra prompt) mentions no edit tool, so it is left out.
- Verification: `system.test.ts` + `tool/registry.test.ts` 25 pass; tsc clean for touched files.

### User
Tools
- Open-weight GPT models (gpt-oss) are no longer told to use a patch tool they do not have; they get the standard prompt that matches their edit and write tools.

---

## 2026-10-14 (~19:37) - v0.2.190 trailDepressing - apply_patch Add File documents overwrite - Claude Opus 5.5, default reasoning; Debug

### Agent
- Meta: Claude Opus 5.5; default reasoning; Debug; completed
- Version: 0.2.190 (already bumped this session; no second bump)
- ERROR: GPT-6.1 Sol (session ses_ec33b36ccffeDxZYTmkdlMuuX7) reasoned it "can't overwrite" existing files. GPT models get `apply_patch` only (no write/edit), and `tool/apply_patch.txt` described `Add File` as "create a new file" though the `add` case in `apply_patch.ts` writes over any existing file (also noted in `provider/cursor/protocol/applyPatch.ts`). Its Add File on `buildNotes.txt` succeeded; no tool error in the session.
- Fixed `src/packages/opencode/src/tool/apply_patch.txt`: Add File now says it replaces an existing file and is the whole-file rewrite path.
- Verification: none; prompt text only.

### User
Tools
- GPT models are now told that adding a file over an existing one replaces it, so they stop second-guessing whole-file rewrites.

---

## 2026-10-14 (~19:32) - v0.2.190 trailDepressing - Keep proxy tools deferred on command turns - Claude Opus 5.5, default reasoning; Implementation

### Agent
- Meta: Claude Opus 5.5; default reasoning; Implementation; completed
- Version: 0.2.190 trailDepressing
- ERROR: Sonnet in a `/imp` turn refused to edit: "Edit unavailable". Transcript `f5af515a`: a normal-to-command turn switch flipped the proxy server from deferred to `alwaysLoad`, and Claude Code 2.1.300 logged that as "68 tools are no longer available (MCP server disconnected): mcp__opencode_proxy__*... Do not call them". The model trusted that notice over its tool list, which did contain `mcp__opencode_proxy__edit`.
- Fixed `planSpawn` (`provider/claude-code/spawnPlanning.ts`): command turns pass `--tools ToolSearch` instead of `--tools ""`, so proxy tools stay deferred like on normal turns and no false "disconnected" delta fires. ToolSearch only loads schemas, so the permission gate holds.
- Removed the `alwaysLoad` option from `createProxyMcpServer`/`ensureProxyServer` (`proxyMcp.ts`). It had no other caller.
- Changed `buildToolEnvironmentNote` (`prompts.ts`): command turns get the ToolSearch hint plus the "built-ins are off; proxy replacements are ..." line.
- Verified CLI behavior with a scratch probe (fake `/v1/messages` capture plus stdio MCP, 81 tools): `--tools ToolSearch` + `ENABLE_TOOL_SEARCH=true` sends `ToolSearch` + a deferred placeholder. With tool search off (non-first-party base URL), the CLI loads the MCP schemas in full, so neither mode needs `alwaysLoad`.
- Updated tests: `fundamentalTools.test.ts` (command turn asserts `--tools ToolSearch`, no `alwaysLoad`), `subagentHint.test.ts` (command note carries the ToolSearch hint). Removed the `alwaysLoad` config test from `proxyMcp.test.ts`.
- Verification: `bun test` on fundamentalTools, subagentHint, proxyMcp: 105 pass. `tsc --noEmit` reports no errors in the touched files. A live `/spit` then `/imp` run in oc was not done.

### User
Claude provider
- Slash-command turns (like `/imp`) no longer make Claude think its file tools have disconnected, so it edits files normally after a command.

---

## 2026-10-14 (~19:20) - v0.2.189 taperStreamrise - Remove version bump countdown - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.189 taperStreamrise
- Removed `.scripts/bumpVersion.ps1` `closeOut 3`; version bumps return without countdown or forced process exit.
- Fixed `AGENTS.md` revision and commit-message version paths to explicitly use `src/.version/`.
- Verification: required `pwsh -NoProfile -File .scripts\bumpVersion.ps1` bump exited 0 in 0.62 seconds; output contained no closing countdown. Read back version/tag and reviewed scoped diff.

### User
Version scripts
- Version bumps finish without the three-second closing countdown.
- Agent instructions now give the correct version file paths under `src/.version/`.

---

## 2026-10-14 (~19:20) - v0.2.188 appreciationsVods - pinned Claude chats fail over on usage limits - Claude Opus 5.5, low; Implementation

### Agent
- Meta: Claude Opus 5.5; low; Implementation (/spit then /imp); completed
- Version: 0.2.188 appreciationsVods
- Fixed: pinned chat (`ses_ec6b130eb...` pinned to `.claudeSecond`) hit 5h limit and ended on "rate limit" while `default` was usable. Cause: `queueAccountSwitch` in `provider/claude-code/turnStream.ts` skipped failover for any session pin.
- Added `failoverAccount(sessionID, ids, now)` in `provider/claude-code/accounts.ts`: unpinned = `nextUsableAccount` (moves global); pinned = next usable after the pin in pool order, pin moved via `pinSessionAccount`, global `currentAccount` untouched.
- Changed `maybeScheduleResume` to wait for earliest pool reset even when pinned (pinned chats now move). Removed unused `sessionPin`/`nextUsableAccount` imports in turnStream.
- Kept: compaction mode still never switches.
- Verification: `bun test test/provider/claude-code/accountPool.test.ts` 19 pass 0 fail (new test: pin moves, all-limited returns undefined, unpinned still moves global).

### User
Claude accounts
- A chat pinned to a Claude account now switches to another account when the pinned one runs out of usage, and the pin moves to the new account.

---

## 2026-10-14 (~19:18) - v0.2.187 skyTouring - agent-push version tag pick - Claude Opus 5.5, low; Implementation

### Agent
- Meta: Claude Opus 5.5; low; Implementation; completed
- Version: 0.2.187 skyTouring
- Changed `.scripts/scriptHelper.ps1`: split `newVersionTag` into `getVersionTags -Count` (distinct tags, no write) and `setVersionTag` (validates `^[a-z]+[A-Z][a-z]*$` case-sensitively, writes); `newVersionTag` wraps both.
- Added `.scripts/agentPush.ps1` `-Tags` (prints 10) and `-SetTag <tag>` (writes, prints new line 1).
- Updated `agent-push` SKILL.md (`~/.claude` and `~/.claudeSecond`, kept identical): new step 2 asks Keep current / 10 tags / Reroll via question tool; on change runs `-SetTag` and fixes the tag in this session's buildNotes.md heading and Version bullet.
- Verification: `-Tags` printed 10 distinct tags; `-SetTag badTag1` threw, exit 1, versionTag untouched. Live question form not checked.

### User
agent-push
- agent-push now shows 10 version tag ideas and lets you keep the current one, pick one, or reroll before it commits.

---

## 2026-10-14 (~18:11) - v0.2.186 - Fix Claude ignoring the first prompt in launcher sessions - Claude Opus 5.5, low reasoning; Debug

### Agent
- Meta: Claude Opus 5.5; low; Debug (spit -> imp); completed
- Version: 0.2.186
- Fixed `src/packages/opencode/src/session/prompt.ts` loop `pendingUser`: steering code picked the oldest unsteered user message when no assistant existed, i.e. the launcher's synthetic `Working directory initialized` message (`oc.ts`, `noReply`), then filtered out the real prompt. Claude got only system reminders + `(empty)`. Now `pendingUser` requires a prior Claude assistant step; first turn falls to `unanswered`.
- Evidence: DB parts for ses_ec3971169ffeg8vf0a2khUXAFf (oc41) and ses_ec3a42cc2ffe0qt3h5pwoMtpoE (stickee1); stickee1 also had Sol answer the synthetic message, then a 0-token Claude step.
- Added assertion in `test/provider/claude-code/fakeModel.test.ts` (synthetic-first-message rename test) that the Claude envelope contains the real prompt text.
- Fixed `test/provider/claude-code/flowReport.ts` `turnUsage`: a lower cumulative CLI cost footer means a new CLI process (server restart, rewound/lost conversation), so the turn's spend is the new total instead of unknown. Fixes pre-existing fakeModel failures `flow report: reverted tokens...` (rewind reset counter) and `flow report: cost deltas ... restart` (restart reset counter). Updated `flowReport.test.ts` decreased-counter case to match.
- Verification: `bun test` fakeModel.test.ts + flowReport.test.ts: 30 pass, 0 fail. steering.test.ts alone: 13 pass twice.
- ERROR: steering.test.ts flakes (30 s polls time out) when run in the same `bun test` call as fakeModel.test.ts; passes alone. Not fixed.

### User
Claude Code chats
- Claude now answers your first prompt in sessions opened with `oc <project>`, instead of replying that there was no request.

---

## 2026-10-14 (~17:27) - v0.2.186 - Fix desktop app updates failing in server-connected oc - Claude Opus 5.5, low reasoning; Debug

### Agent
- Meta: Claude Opus 5.5; low reasoning; Debug; completed
- Version: 0.2.186
- Fixed Claude/Cursor Desktop install failing with "Error in TypeData System.Security.AccessControl.ObjectSecurity: The member AuditToString is already present". Cause: TUI env carried a PowerShell 7 `PSModulePath` (`...\PowerShell\7\Modules`), so `powershell.exe` 5.1 tried to load 7's `Microsoft.PowerShell.Security` and `Get-AuthenticodeSignature` (all three install scripts) failed. Worked under `/revive-single` because that process env differed.
- Added `windowsPowershellEnv` in `src/packages/tui/src/desktopUpdate.ts` (drops `PSModulePath` in any casing); `runPowershell` passes it. Added optional `env` param to `runCliCommand` (`cliUpdate.ts`).
- Kept `clipboard.ts` `powershell.exe` calls unchanged: they use `Set-Clipboard`/Management only, not Security.
- Verification: reproduced from bun with a pwsh 7 `PSModulePath` (Get-AuthenticodeSignature fails); new win32 test in `test/desktopUpdate.test.ts` runs it through `windowsPowershellEnv` and expects `Valid`. 4 updater test files: 48 pass, 0 fail. Live palette rerun by user pending.

### User
Command palette
- Updating Claude Desktop, Cursor Desktop, or ChatGPT Desktop no longer fails with an "AuditToString is already present" error when oc runs connected to its background server.

---

## 2026-10-14 (~17:07) - v0.2.186 - Palette "Update all" for third-party harnesses - Claude Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Claude Opus 5.5; low reasoning; Implementation; completed
- Version: 0.2.186
- Added `oc.update_all_harnesses` ("Update all") first in the "Third party harness management" palette group (`src/packages/tui/src/app.tsx`). Order: Claude Code, Cursor CLI, Codex CLI, then (win32) Claude/Cursor/ChatGPT Desktop. Sequential; one failure does not stop the rest. Module flag blocks a second concurrent run.
- Refactored the six updaters into result-returning cores (`runClaudeCodeUpdate`, `runVersionedHarnessUpdate`, `checkDesktopHarness`, `installDesktopHarness`) returning `HarnessUpdateResult` status `ok|notInstalled|busy|declined|failed`. Single-item palette entries keep the same toasts and confirm text via `showHarnessResult` and `updateDesktopHarness` with `DesktopHarness` table consts.
- Desktop flow in Update all: all checks first, then one combined `DialogConfirm` listing only pending updates; decline marks them `declined`. Ends with one summary toast grouped by status (error variant 30 s if any failed).
- Added `notInstalled: true` to `resolveCursorCli`/`resolveCodexCli` not-found results (`cliUpdate.ts`) and to `parseDesktopCheckOutput`/`runDesktopCheck` not-installed results (`desktopUpdate.ts`). Claude Code not-installed = `which(cliPath)` null.
- Verification: `bun test` cliUpdate, desktopUpdate, cursorDesktopUpdate, chatgptDesktopUpdate: 46 pass, 0 fail (not-installed expectations updated). Typecheck and live palette run not done.

### User
Command palette
- New "Update all" entry updates Claude Code, Cursor CLI, Codex CLI, and on Windows the Claude, Cursor, and ChatGPT desktop apps, one after another.
- Tools that are not installed are skipped and listed as "Not installed" in the final summary instead of raising errors.
- Desktop app updates ask for confirmation once, listing every app that has an update, instead of one prompt per app.

---

## 2026-10-14 (~05:05) - v0.2.186 hospitalFavorite - Finish Claude steering cancellation, permissions, and revert fixes - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed approved follow-up directly; no delegation
- Version: v0.2.186 hospitalFavorite; preserved session's existing bump and concurrent ledger/dependency work
- Fixed `turnStream.ts`: stop steering on abort/cancel/close/denial; retain authoritative written IDs across receipts and child replacements; correlate replay by UUID instead of text; stop with an error when receipt persistence fails. Busy retraction owns DB removal and delays result completion until deletion settles.
- ERROR: cancellation timeline proved unread `CANCEL-STEER` started a model request after the explicit abort. Retirement still sent interrupt to a terminating CLI, and PATH `claude` was an npm `.cmd` wrapper: killing its PID left native Claude running. Fixed shared `cliExecutable.ts` to resolve only the exact stock native npm shim; custom wrappers remain unchanged. Added `deleteActiveProcessAndWait.forceKill`: kill before releasing proxy requests; retired turns receive no interrupt or buffered output.
- Fixed `prompt.ts`: inspect original and incoming stored user settings, including command permission, tools, system, format, variant, and explicit model selection. Incompatible prompts run individually in order under their own settings; later prompts cannot overtake an incompatible one. Cancel the run before releasing its question.
- Fixed busy message deletion in HTTP `handlers/session.ts`: require live held-message ownership, never assume unknown IDs are pending; idle history deletion uses existing maintenance gate. Written IDs remain non-retractable while receipts save.
- Added delivered text metadata `steeredAssistantID` / `steeredParentID`; `revert.ts` maps a delivered steer to the original prompt and restores all shared-turn patches. Existing `resetStaleSession` handles empty-history rewind; no sessionSync change or migration needed.
- Fixed TUI `dialog-message.tsx`: capture Edit draft before removal events erase parts; show `Revert whole turn` for delivered steers and restore original prompt only after successful revert. Updated FORK and local wiki `Sessions.md`; wiki push remains user-owned.
- Added real oc/CLI fake-model regressions for held Edit/Delete, busy/idle delivered deletion, cancellation before/after visible content, pending-message preservation and exactly-once next dispatch, identical text receipts, SQL-trigger receipt-save failure, denial, both command-permission directions, and delivered-steer file/history revert with prior/empty history. Added owned headless pane regression for QUEUED/SENT, Edit/Delete, busy revert refusal, and whole-turn revert.
- MISTAKE: initial checks synchronized on saved message parts before sink admission, and tried reading an unfinished streamed text block from DB. Replaced with published admission/stream signals; pane waits for idle footer before successful revert. Early receipt assertion used the wrong SDK error field; final check reads serialized error contract. Temporary diagnostic writes removed from tests.
- Verification: final `bun test test/provider/claude-code/steering.test.ts test/provider/claude-code/cliExecutable.test.ts`: 15 pass, 0 fail, 129 Bun assertions. `OC_TUI_PANE=1 bun test test/provider/claude-code/tuiPane.test.ts --test-name-pattern 'steering actions'`: 1 pass, 0 fail, 6 assertions; 12 unrelated cases filtered out. Scoped diff checks passed. Restored touched source CRLF with user's explicit bounded normalization approval.
- Kept checks scoped to edited/introduced files. Background dispatch denied by bgRun permission; user explicitly approved bounded foreground fake-model runs. No general typecheck, build/install, real tokens, commit, push, or buildNotes.txt edit. Installed acceptance, account failover, and compaction interactions were not exercised.

### User
Claude steering
- Stopping a turn prevents unread messages from starting unattended Claude work; pending messages remain available for the next prompt.
- Commands with their own permissions and other changed execution settings run separately instead of inheriting the running turn's settings.
- Edit and Delete safely take back messages still held by an oc tool; messages already written to Claude are protected from deletion while busy.
- Revert whole turn restores the shared reply's file changes and puts the original prompt back; a busy revert leaves the prompt alone.
- Fake-model and headless terminal checks passed without spending model usage.

---

## 2026-10-14 (~04:07) - v0.2.186 hospitalFavorite - Review revive PID-reuse fix - GPT-6.1 Sol, default reasoning; Pass

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Pass; completed; scoped to this session's revive changes
- Version: v0.2.186 hospitalFavorite
- Reviewed shared ledger reader, registration/removal, shutdown selection, edited tests, troubleshooting entry, and session-owned version/notes delta. No actionable correctness defects found.
- Simplified final identity validation to reuse already-resolved `live` process instead of rescanning process snapshot; exact creation/executable checks unchanged.
- Verification: same 9 scoped tests passed, 41 assertions; scoped `git diff --check` passed. No build/install/live revive run. Kept session's existing version bump.

### User
Revive
- Reviewed the stale-process fix and removed one redundant process-list search.
- All 9 targeted checks still pass; live revive verification remains pending installation.

---

## 2026-10-14 (~04:01) - v0.2.186 hospitalFavorite - Skip stale revive terminal records after PID reuse - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: v0.2.186 hospitalFavorite
- ERROR: `/revive` completed builds but aborted in `TuiLedger.read`; old oc PID 12184 now belongs to Firefox with a different CIM creation stamp. Crashed TUI ledger pairs remain on disk and Windows reuses PIDs.
- Fixed `config/tuiLedger.ts` shared reader: skip live foreign executables and records whose saved CIM creation stamp proves PID reuse. Retained missing/corrupt identity failures for possible live oc TUIs; no PID-only stops or deletion of stale files.
- Added mixed valid/stale ledger regression covering same-executable PID reuse, Firefox replacement, safe selection, preserved files, and unavailable live creation stamp. Updated launcher ledger expectation for proven reuse.
- Updated wiki `Troubleshooting.md` with stale-ledger cause and manual build/install bootstrap for older installed helpers; wiki push remains user-owned.
- Verification: scoped Bun run across edited `test/config/tuiLedger.test.ts` and launcher ledger check: 9 pass, 0 fail, 41 assertions; scoped `git diff --check` passed. Background dispatch denied; bounded foreground tests completed in 1.42s. No build/install or live revive run.

### User
Revive
- Revive skips old terminal records when Windows has reused their process IDs, instead of aborting after a successful build.
- Process identity checks still protect unrelated programs from being stopped.
- The installed older helper needs one manual build/install to pick up this fix.

---

## 2026-10-14 (~03:57) - v0.2.185 wantsManifesting - Claude mid-turn steering, unsend waiting messages - Claude Opus 5.5, default reasoning; Implementation

### Agent
- Meta: Claude Opus 5.5; default reasoning; Implementation (/imp of `~/.config/opencode/plans/2026-10-14-claude-steering.md`); completed; resumed after a usage-limit cutoff and account switch
- Version: v0.2.185 wantsManifesting
- Probe (real CLI vs TestLLMServer): stdin user msg written mid-turn is delivered at the next tool boundary, appended by the CLI to the tool_result as a `<system-reminder>` "The user sent a new message while you were working"; written after the last tool call it runs as the CLI's next turn with its own `result`. `--replay-user-messages` echoes it (`isReplay: true`) when consumed. Compaction summary replays also carry `isReplay`.
- Added `claudeSteerSinks` / `ClaudeSteer` / `ClaudeSteerSink` / `STEERED_METADATA_KEY` in `provider/claude-code/shared.ts`.
- Added `--replay-user-messages` to `cliArgs.ts`; `isReplay` on `ClaudeStreamMessage`.
- `turnStream.ts`: tool-scope non-compaction turns register a sink; `onSteer` holds while `inStreamCalls > 0` (retractable), else writes; `flushSteers` before resolving a proxied call and in its `finally`; `onReplay` matches echo text, runs `delivered()`; `onResult` waits for acks; `completeResult` holds the step open (no finish, `noteTurnStarted`, result fallback armed) while written steers are unread. Steers dropped on account switch and start-watchdog respawn (loop resends them).
- `session/prompt.ts`: `steerClaudeTurn` after `createUserMessage` (plain text only, same model id and agent); `delivered` sets text-part `metadata.steered` via `EffectBridge`; loop exit also when every user msg after the assistant is steered (`readMidTurn`).
- `message-v2.ts` passes `providerMetadata["claude-code"].steered` on steered user text; `messageBuilder.ts` skips those parts so a later step never repeats them.
- `handlers/session.ts` `deleteMessage`: keeps `assertAvailable`; skips `assertNotBusy` for a user msg with no assistant child, not steered, and retracted from (or unknown to) the Claude turn.
- TUI `dialog-message.tsx`: `waiting` prop shows Edit/Delete (deleteMessage, Edit refills the prompt) instead of Revert; Revert now awaits and toasts its error instead of filling the prompt. `routes/session/index.tsx`: `isSteered`, badge `SENT`, passes `waiting`.
- Docs: `FORK.md` row "Claude mid-turn steering"; wiki `Sessions.md` "Steering a running turn" (wiki push is the user's).
- Verification: `bun run typecheck` in `packages/opencode` and `packages/tui` passed; `bun test test/provider/claude-code/steering.test.ts` 2 pass (tool-boundary steer: 2 model requests, steer in request 2, one assistant msg, part flagged; late steer: same step, SECOND-DONE). No pane check; no test for delete-while-held.
- Risk: Esc with a written-but-unread steer leaves it in CLI stdin; the CLI may run it as an unattended turn while oc still sees it unanswered.
- Risk: delete-while-busy can race a non-Claude loop that is just starting a step for that message.

### User
Chat
- On Claude Code, a message you send while the agent works now reaches Claude after its current tool call instead of after the whole turn.
- While a subagent batch or other oc tool runs, your message waits and is delivered the moment that tool returns.
- A delivered message's badge changes from `QUEUED` to `SENT`, and it is never sent a second time.
- Clicking a `QUEUED` message offers Edit and Delete, which work while the agent is busy until the model has the message.
- Revert on a message the agent is still working on shows an error instead of silently putting a duplicate in your prompt.

---

## 2026-10-14 (~03:37) - v0.2.184 blamFan - Sticky tool block titles while scrolling - Claude Opus 5.5, default reasoning; Implementation

### Agent
- Meta: Claude Opus 5.5; default reasoning; Implementation; completed, uncommitted
- Version: 0.2.184
- Added sticky title row in `packages/tui/src/routes/session/index.tsx`: `BlockTool` registers its box + title getter in new context field `blocks` (Map, deleted on cleanup). `queuePin` (microtask-deferred, since scrollbar `change` and content `resize` can fire inside opentui layout) picks the block whose title row (`el.y + 1`) is above `scroll.viewport.y` and whose last content row (`el.y + el.height - 2`) is below it.
- Added absolute one-row overlay as a sibling after `<scrollbox>` in the padded outer box (ref `scrollFrame`); left/width from the block, same border/panel/muted styling as the real title. Click scrolls to block top (`pin.el.y - scroll.viewport.y`). Wheel over it is forwarded via `scroll.processMouseEvent` (overlay is not a scrollbox descendant, so wheel would not bubble there).
- Kept: Spinner titles show with `# ` stripped, same as `BlockTool`. Assistant text, user messages, untitled Bash not pinned.
- Risk: absolute `left` assumes Yoga offsets from the parent's border edge (outer box has padding 2); if the pinned row shows 2 columns off, that assumption is wrong.
- Updated `FORK.md` section 6 row; wiki `Sessions.md` "Long tool blocks" (wiki push is the user's).
- Verification: `bun run typecheck` in `packages/tui` exit 0. Prettier: file already unformatted at HEAD; new lines match Prettier output. No live check run.

### User
Session view
- When an edit, write, or patch block is taller than the screen, its title stays pinned at the top while you scroll through it, so you can always see which file the diff is for.
- Clicking the pinned title jumps back to the top of that block.

---

## 2026-10-14 (~03:06) - v0.2.183 placementsSwingset - Move build notes out of the repo root - Claude Opus 5.5, default reasoning; Implementation

### Agent
- Meta: Claude Opus 5.5; default reasoning; Implementation; completed, uncommitted
- Version: 0.2.183 (already bumped once this session; no second bump)
- Moved `buildNotes.md`, `buildNotes.archive1-9.md`, `buildNotes.txt` to `docs/buildNotes/` with `git mv` (history follows renames). User chose the folder and moving the txt.
- Fixed paths: `.scripts/scriptHelper.ps1` `$buildNotes`; `.scripts/agentPush.ps1` `-Context` diff path; `src/packages/opencode/test/tool/planExecute.test.ts` `TEST_PLAN_PATH`; `AGENTS.md` (layout line, build notes section, buildNotes.txt heading); `UPSTREAM-SYNC.md`, `FORK.md`, `SCRIPTS.md`; `docs/dev/{v0.3.0,nativeSplitPlan,publicReadiness}.md` links.
- Kept: global `build-notes` skills still say repo root; `AGENTS.md` now overrides that for oc.
- Risk: right after the move, `testBuildNotesChanged` sees `docs/buildNotes/buildNotes.txt` as changed (new path vs HEAD), so a bare `push.ps1` would reuse the old message. Write a new message before the next push.
- Verification: `bun test test/tool/planExecute.test.ts` 14 pass; `.scripts/tests/buildNotesChanged.tests.ps1` passed; `agentPush.ps1 -Context` ran and read the new path.

### User
Repository
- Build notes, their archives and the next-commit message file now live in `docs/buildNotes/` instead of the repo root.
- No app or UI change.

---

## 2026-10-14 (~02:57) - v0.2.183 placementsSwingset - Publish oc as a GitHub fork of opencode - Claude Opus 5.5, default reasoning; Implementation

### Agent
- Meta: Claude Opus 5.5; default reasoning; Implementation (/imp, then /pass + agent-push; plan `~/.config/opencode/plans/2026-10-14-public-fork.md`); completed
- Version: 0.2.183
- Moved: old private repo renamed `fosterbarnes/oc-ARCHIVE` (local `Documents\GitHub\oc-ARCHIVE`); `fosterbarnes/oc` is now a public fork of `anomalyco/opencode`, default branch `main`, Actions off on purpose.
- Rewrote history with git filter-repo: root grafted onto upstream `5cd8e68fdd`; removed `*.lnk`, `desktop.ini`, `.scripts/{revive,reviveAndInstall,safeShutdown}.exe`, `.res/yapBot.json` from all history; the home-folder name in Windows user paths -> `user` (separators kept), plus two approved wording redactions (rules in `plans/ocPublic/redactions.txt`, private); 11 bodyless subjects renamed. Authors/dates unchanged. Old-to-new map: `plans/ocPublic/commit-map.txt` (private).
- Added sync merge `e10f2bb` (`-s ours` of upstream `abce98e`, tree unchanged) so Git knows upstream through `abce98e` is handled.
- Added commit `ec678eb`: untracked `.config/openSidebar.json`; `.gitignore` += `*.lnk`, `.scripts/*.exe`, `.res/yapBot.json`; `newVersionTag` (`.scripts/scriptHelper.ps1`) throws a clear "list is private" error when the word list is missing. Pushed `main` = `ec678eb` (agent, user's explicit request).
- Kept: `.res/yapBot.json` and `.config/` exist locally only (gitignored); `UPSTREAM/opencode` reference checkout not recreated in the new clone.
- Fixed `UPSTREAM-SYNC.md`: real merge base now exists; still hand-port; after a committed port, fetch the upstream SHA and record it with `git merge -s ours --no-ff <sha>`. Fixed `.scripts/upstream-sync.state.json` `snapshotSha` to the true parent `5cd8e68fdd` (old `5e75e5e9` was 219 commits older, wrong).
- Verification: per-commit verifier 100/100 (only approved diffs); leak gates L1-L8 (gitleaks custom rules, 45 real local credential values, personal-info, banned files, binaries, header literals, identities, fresh-clone rerun) clean; full-history gitleaks 78 hits all upstream; push dry run listed only `main`. Wiki (`oc.wiki`, 5 commits) L1-L7 clean. Scripts/reports: `plans/ocPublic/`.
- Moved wiki: user created a placeholder page; agent pushed (user's explicit go-ahead) `oc.wiki` history plus a `-s ours` merge of GitHub's 2 placeholder commits, fast-forward, no force. Local `oc.wiki` origin -> `fosterbarnes/oc.wiki.git`. TODO: its 9 uncommitted page edits from an earlier session are untouched.
- Risk: anything pushed to the fork is reachable through the whole opencode fork network permanently; scan before every push. Release binaries can embed build paths: scan archives before `pushRelease.ps1`.

### User
Repository
- oc is now public at github.com/fosterbarnes/oc as a fork of opencode, with the full commit history kept and personal paths and private files scrubbed.
- The old private repository is kept as oc-ARCHIVE.
- Generating a new version tag needs the private word list, which only exists on your machine; anyone else gets a clear error.
- No app or UI change.

---

## 2026-10-14 (~01:29) - v0.2.182 fromsoftFreeztyle - Fix push-blocking model assertion - GPT-6.1 Sol, reasoning default; Implementation

### Agent
- Meta: GPT-6.1 Sol; reasoning default; Implementation; fixed push blocker
- Version: 0.2.182 fromsoftFreeztyle
- Fixed `opencode/test/agent/plugin-agent-regression.test.ts`: compare branded model ID as String, matching existing agent tests; retained exact-value assertion.
- Regenerated `docs/keybinds.md` with TUI keybind docs generator after prePush detected stale documentation.
- ERROR: first agent-push prePush typecheck rejected plain string expectation for branded ModelV2.ID; no commit or push occurred.
- Verification: edited plugin-agent regression file passed, 3 tests and 23 assertions. Prior push attempt passed 111 targeted tests and PowerShell revive cleanup checks; required pre-push checks run again before commit.

### User
Push checks
- Fixed the model-ID test assertion that blocked the commit; the regression tests pass.

---

---

## 2026-10-14 (~01:25) - v0.2.181 garnishForgive - Finish ocdebug retirement and report tab launch failures - GPT-6.1 Sol, reasoning default; Pass

### Agent
- Meta: GPT-6.1 Sol; reasoning default; Pass; completed approved fixes directly
- Version: 0.2.181 garnishForgive; retained this session's existing revision bump
- Reviewed session-owned `/revive-single`, ocdebug removal, old debug-setting revive failure; excluded concurrent subagent-management work.
- ERROR: `.scripts/install.ps1` still required/copied removed ocdebug artifact; build.ps1 still passed --with-debug; buildDebug.ps1's ignored --debug-only silently built normal variants. Removed debug build source requirement/copy/flag; retired buildDebug/installDebug/.runDebug with immediate errors. Kept legacy installed-file backup/process guards.
- Fixed `OcConfig.openReviveTab`: await terminal CLI exit rather than detached-hop acknowledgement; generic cmd uses Normal window and settle check. Added --no-auto-start to WezTerm spawn. TUI single helper uses ordinary hidden child with bounded stderr capture and exit failure toast; restart helpers retain detached launch.
- Updated AGENTS.md, SCRIPTS.md, SCOPE.md, FORK.md and local wiki Launching.md for retirement/native test builds. Wiki not pushed.
- Added terminal-launch regression using real harmless Bun child exits and environment forwarding; added `.scripts/tests/reviveCleanup.tests.ps1` parsing changed scripts, checking removed artifact/flag references, executing only retired entrypoints.
- Verification: `bun test test/config/revive.test.ts --test-name-pattern 'single revive'` 3 pass, 0 fail; PowerShell cleanup checks passed; scoped git diff --check passed. No build/install, broad typecheck, or live terminal flow. Background test dispatch denied; bounded foreground check completed in 1.82s.
- Risk: native-only test build reuses installed support files and production DB; no isolated profile. Full terminal flow still needs user acceptance.
- MISTAKE: prior assistant claimed config edit without a tool record in this visible continuation. Current oc.json verified to have source only, no debug key; user's revive marker reports v0.2.181. Claim only observed edits/checks.

### User
Revive cleanup
- The normal installer no longer asks for the removed ocdebug build.
- Old debug scripts stop immediately and explain which current command to use.
- `/revive-single` reports rejected tab launches, and plain-console launches request a visible window.
- Focused checks passed; build/install and the live new-tab check remain user-driven.

---

## 2026-10-14 (~01:06) - v0.2.181 garnishForgive - Repair subagent picker handoffs and file edits - GPT-6.1 Sol, reasoning default; Implementation

### Agent
- Meta: GPT-6.1 Sol; reasoning default; Implementation; completed directly after Cat Jam task cancelled
- Version: 0.2.181 garnishForgive; retained session's existing revision bump
- Fixed `tui/src/component/dialog-model.tsx` and `dialog-subagent-efforts.tsx`: clear outgoing dialog before invoking continuation; next picker/name prompt survives.
- Fixed `opencode/src/agent/subagentFile.ts`: restrict edits to YAML frontmatter agents map, quote scalar values, remove complete entries across internal blank lines, preserve body/comments/EOL, compare parsed result against expected data before atomic replacement. Keep empty map editable after last removal. Reject unsupported mapping layouts before writing.
- Added GET `/agent/sub` names from configured writable file; `dialog-subagents.tsx` enables Ctrl+D only for matching names. Regenerated legacy SDK and Client outputs through project generators.
- Added renderer regressions for model/effort/name handoff, multiple selections including provider default, no-effort models, and deletion membership. Extended file tests and hot reload integration with quoted descriptions and names.
- Updated local wiki `Agents-and-Skills.md`: add/delete flow, writable-file setting, hot reload placement, safe edit limitations; not pushed.
- Verification: `bun test test/agent/subagentFile.test.ts test/agent/subagentFile.integration.test.ts` 9 pass; `bun test test/cli/tui/subagentDialog.test.tsx` 4 pass. SDK generation and `packages/client` generation succeeded. No build/install, broad typecheck, or installed-app run.
- MISTAKE: first file-test run collided fixture `tmpdir` with existing OS import; corrected OS calls to `os.tmpdir`; rerun passed.

### User
Subagents
- Selecting a model and efforts now keeps the next dialog open so you can name the new subagent.
- Ctrl+D is available only for entries in the file this menu can edit.
- Adds and deletes preserve agent-file comments and Markdown content, and refuse malformed or unsafe edits.

---

## 2026-10-14 (~01:01) - v0.2.181 - /revive-single test builds; ocdebug removed - Claude Opus 5.5, medium; Implementation

### Agent
- Meta: Claude Opus 5.5; medium; Implementation (imp, cat jam subagent drafted then reworked); completed
- Version: 0.2.181
- Added `/revive-single` (`oc.revive_single`, tui `app.tsx` `reviveCommands`; shared `launchHelper`; `readOcConfig().reviveBuild`). ReviveContext mode `single` + `hosted` flag (`revive.ts`).
- Added `oc.ts` `reviveSingle`: unhosted helper opens `Revive.openTabCommand` (wezterm cli spawn / wt -w 0 new-tab / cmd start via shared `consoleStart`) running itself with `hosted: true`; hosted run builds `buildSteps(build, "native")` (`--native-only`), installs only opencode.exe under install lock, then runs opencode in place. Failure: log, wait Enter, exit 1. No shutdown/server/restarter/marker.
- Removed ocdebug flavor: `Global.isDebugExecutable`, `resolveAppName`, `Path.debug` (app always `opencode`); `core/src/debugConfig.ts` + test; `withOcLaunchDefault`; port 4097; debug log level; `build.ts` `--with-debug`/`--debug-only`; OcRelease `debug` variant; `effectiveBuild`, `BuildConfig.debug`, `resolveLauncher`/`downloadRelease` debug params; startup OPENCODE_INSTANCE; descendants regex; app.tsx debug env. `parseBuild` still accepts and ignores an old `debug` key.
- Changed FORK.md: section 7 now `/revive-single`; ocdebug mentions dropped.
- Kept: `cli/cmd/mcp.ts` `opencode-debug` (upstream MCP client name). Old `opencode-debug` data folders stay on disk.
- Verification: opencode `bun test` revive/oc/tuiLedger/commandLoader/startup/cli oc: 84 pass 0 fail; core global 4 pass, ocRelease 5 pass. Typecheck: only known `plugin-agent-regression.test.ts(114)` and `tui/src/component/dialog-model.tsx(182)` (unrelated worktree change). Live `/revive-single` not run.
- Risk: single build shares the production DB; a schema migration in a test build hits the running server's DB.

### User
Revive
- New `/revive-single` builds just native `opencode.exe` from your saved source and opens it in a new tab, leaving this window, other oc windows, and the server running.
- A failed `/revive-single` build waits for Enter and leaves your installed `opencode.exe` unchanged.
- `ocdebug` and its separate data folder, port 4097, and settings import are gone.

---

## 2026-10-14 (~00:49) - v0.2.181 garnishForgive - Server API for adding and removing subagent entries - GPT-6.1 Sol, high; Implementation

### Agent
- Meta: GPT-6.1 Sol, high; Implementation; completed.
- Version: 0.2.181 garnishForgive
- Added Config.subagentFile optional string in src/packages/opencode/src/config/config.ts; default ~/.config/opencode/agents/sub/general.md; schema patched via Struct fields (Effect Schema has no extend).
- Added src/packages/opencode/src/agent/subagentFile.ts: add({name,model,variant?,description}) and remove(name), text-edit preserving comments/order, duplicate/not-found/missing-file validation, name regex validation, atomic temp+rename.
- Added HTTP routes in src/packages/opencode/src/server/routes/instance/httpapi: InstancePaths.agentSub/agentSubRemove, POST /agent/sub, DELETE /agent/sub/:name; handlers resolve subagentFile from config.
- Regenerated legacy JS SDK: openapi includes operation ids app.agent.sub.add and app.agent.sub.remove; client.app.agent.sub nested methods.
- Added tests test/agent/subagentFile.test.ts and test/agent/subagentFile.integration.test.ts: 7 pass including hot reload verification.
- Verification: bun test targeted files: 7 pass, 0 fail. Typecheck showed pre-existing plugin-agent-regression test modelID branded type error only.
- MISTAKE: initially used ConfigV1.Info.extend which does not exist; switched to Schema.Struct spread.
- Added TUI flow in src/packages/tui/src/component/dialog-subagents.tsx: "Add subagent" row -> DialogModel (updateCurrent=false) -> dialog-subagent-efforts.tsx multi-select (efforts + No effort) -> name prompt prefilled general-<short> -> app.agent.sub.add per effort; list reopens refreshed.
- Added keybind subagent_delete (ctrl+d) in tui config/keybind.ts; DialogSelect action, disabled on native agents and Add row; DialogConfirm then app.agent.sub.remove.
- Fixed TUI SDK calls: removed unknown casts, added throwOnError so failures toast as errors.
- Verification: tui tsgo shows only debug-path errors (core/src/debugConfig.ts, app.tsx) from concurrent global.ts edits, none in subagent files.

### User
Subagent management
- API and file editor can now add or remove subagent entries in ~/.config/opencode/agents/sub/general.md while preserving comments and order.
- Agent list hot-reloads added and removed entries.

---

## 2026-10-14 (~00:28) - v0.2.180 editFormed - Preserve plugin agent overrides and fix subagent command parsing - GPT-6.1 Sol, reasoning default; Implementation

### Agent
- Meta: GPT-6.1 Sol; reasoning default; Implementation; completed; Cat Jam handled command-file edits, parent reviewed and tightened validation.
- Version: 0.2.180 editFormed; kept this session's earlier revision bump, no second bump.
- Fixed `Config.agents()` replacing plugin edits to existing agents even on first initialization. Replaced name-only tracking with independent pre-plugin agent snapshot; recursively reapplied changed fields, additions, and deletions over fresh markdown layers. Untouched nested fields still reload; arrays/scalars retain plugin replacement values.
- Added regression scenario in `test/agent/plugin-agent-regression.test.ts` with actual config hook fixture: startup and live edits, prompt/model overrides, nested permission override, option/temperature/agent deletions, fresh untouched fields, markdown removal, and plugin-added agent survival.
- Fixed user commands `~/.opencode/commands/addSub.md` and `rmSub.md`: exact full model/name match precedes last-colon effort split; colon-bearing model IDs stay intact. Explicit `as slug` now wins in addSub; missing model/empty effort validation clarified.
- Updated FORK.md and wiki `Agents-and-Skills.md` to describe preserved plugin overrides.
- Verification: `bun test test/agent/plugin-agent-regression.test.ts` final 3 pass, 0 fail, 23 assertions; scoped `git diff --check` passed. Command instructions reviewed, commands not invoked. No build or package typecheck run.
- MISTAKE: first regression run lacked exported Config service in test node group; added `Config.node`, reran successfully. Dependencies used directly by tests must be exposed as roots.
- Corrected earlier limitation: plugin edits were discarded at first Agent initialization, not only after reload.

### User
Subagents
- Plugin changes to existing agents now survive startup and hot reload while your other agent-file edits still take effect.
- `/addSub ... as name` uses the name you requested even when that model already has another entry.
- `/addSub` and `/rmSub` distinguish model IDs containing colons from reasoning-effort suffixes.

---

## 2026-10-14 (~00:19) - v0.2.180 editFormed - /viewSub subagent popout, /rmSub, /addSub rename - Claude Opus 5.5, reasoning low; Implementation

### Agent
- Meta: Claude Opus 5.5; reasoning low; Implementation (imp from spit plan `~/.config/opencode/plans/rmSubViewSub.md`); completed; Cat Jam trial subagent did rmSub.md and the rename
- Version: 0.2.180 editFormed
- Added `tui/src/component/dialog-subagents.tsx`: `DialogSelect` over a fresh `sdk.client.app.agents({})` (not `sync.data.agent`, which is bootstrap-only), non-primary non-hidden agents, category = `provider/model` or `native`, title padded to max name, description = variant, footer = first sentence. Enter copies the name + toast. Load error shown via `emptyView` like `dialog-skill`.
- Added palette entry `oc.view_subagents` ("Subagents", `slashName: "viewSub"`) in `app.tsx` before `agent.default_subagent_model`. Do not create a `viewSub.md` command (slash collision).
- Added user config `~/.opencode/commands/rmSub.md` (model id / name / slug target, optional efforts, refuses `general` alias, warns on tier-table names, confirms, deletes YAML blocks keeping LF). Renamed `addsub.md` -> `addSub.md`; updated subagents SKILL.md and FORK.md mentions. Historical plans/buildNotes left as `/addsub`.
- Updated `agents/sub/general.md` `general-cat-jam-free` description with trial result.
- Verification: `bun run typecheck` in `src/packages/tui` exit 0. Line endings checked (new tsx converted to CRLF to match repo). `/viewSub` and `/rmSub` not run (need installed build / live session).

### User
Subagents
- New `/viewSub` (palette: oc > Subagents) shows every subagent grouped by model with its effort and a short description; type to filter, Enter copies the name.
- New `/rmSub` removes subagents by model, name, or slug, optionally only some efforts, after you confirm.
- `/addsub` is now `/addSub`.

---

## 2026-10-14 (~00:10) - v0.2.180 editFormed - Agent markdown hot reload and /addsub command - Claude Opus 5.5, reasoning low; Implementation

### Agent
- Meta: Claude Opus 5.5; reasoning low; Implementation (imp from spit plan `~/.config/opencode/plans/addsubHotAgents.md`); completed
- Version: 0.2.180 editFormed
- Added agent hot reload: `Agent.state` carries a fingerprint (`ConfigAgent.fingerprint`, agent+mode md in `config.directories()`), reads go through `Fingerprint.reloading`, init builds from new `Config.agents()` and toasts diagnostics. Agent node now depends on `EventV2Bridge`.
- Added `Config.agents()`: replays `agentLayers` (inline JSON `agent` records from `merge()`/managed prefs, config dirs rescanned with `ConfigAgent.scan`+`loadMode`) in startup order, applies JSON `mode` entries, overlays plugin-added agents (names not in `layerAgentNames`). `Config.get().agent` stays the startup snapshot (claude-code registry unchanged).
- Added per-file last-good cache in `ConfigAgent.scan` (split into `scanFile`); a file with any diagnostic serves its previous agents. No parse memo: `{file:}` prompts must stay fresh on instance reload.
- Kept lock order Agent -> Skill (`skill.dirs()`); Skill never calls Agent.
- Risk: plugin config-hook edits to file-defined agents are lost after the first reload; brand-new config dirs, `{file:}` targets, and JSON `agent` blocks still need `/reload`. Claude Code proxy `task` description refreshes only on CLI respawn.
- Added `TestConfig.make` `agents` stub; `test/agent/hotReload.test.ts`; plugin-agent survival case in `plugin-agent-regression.test.ts`.
- Added user config: `~/.opencode/commands/addsub.md` (`/addsub provider/model[:e1,e2] [as slug] ["note"]`, validates via `opencode models --verbose`, confirms, edits `agents/sub/general.md`); subagents skill drops its hand-kept name list and points at the live list + `/addsub`.
- Updated FORK.md (Agent file hot reload row) and wiki `Agents-and-Skills.md` (Agent files section; wiki push is the user's).
- Verification: `bun test test/agent/hotReload.test.ts test/agent/plugin-agent-regression.test.ts test/agent/agent.test.ts test/config/config.test.ts` 163 pass 0 fail; `bun run typecheck` clean. `/addsub` itself not run (needs installed build).
- ERROR: first plugin-survival test version failed because `.opencode` did not exist at startup, so the dir was never a config layer; test now creates it first (matches real `~/.config/opencode`).

### User
Agents
- Adding, editing, or removing an agent file now takes effect on the next task call, without restarting oc.
- A broken agent file keeps its last working version and shows a warning toast.
- New `/addsub` command adds general subagents from one line, for example `/addsub openai/gpt-6.2-sol:low,medium`, after checking the model and efforts exist and asking you to confirm.

---

## 2026-10-13 (~21:13) - v0.2.179 snakeArrived - Stage 4 leftovers: dependency bumps, three upstream ports, baselineSha to v1 tip - Claude Opus 5.5, reasoning default; Implementation

### Agent
- Meta: Claude Opus 5.5; reasoning default; Implementation; completed (resumed after rate limit and account switch)
- Version: 0.2.179 snakeArrived
- Updated deps: `@ai-sdk/xai` 3.0.139 (patch moved to `patches/@ai-sdk%2Fxai@3.0.139.patch`), `@ai-sdk/gateway` 3.0.191, `@ai-sdk/togetherai` 2.0.68, `@ai-sdk/provider` 3.0.16, `@ai-sdk/provider-utils` 4.0.51, `gitlab-ai-provider` 6.19.0; refreshed openai patch (ultrafast). `bun install` run.
- Ported `35fc7a776c` (provider timeouts for Cloudflare AI Gateway models) into `provider/provider.ts`, kept oc's Cloudflare loader; `test/provider/header-timeout.test.ts`, new `test/provider/openai.test.ts`.
- Ported `29f07e0c69`: added `core/src/open.ts` (`openUrl`, `open` 11.0.4 moved to core); `tui/app.tsx`, `ui/link.tsx`, `dialog-retry-action.tsx`, `cli/cmd/account.ts`, `mcp/browser.ts`, `mcp/oauth-provider.ts`, digitalocean/snowflake plugins use it.
- Ported `95daf90670` (ACP session options + reasoning boundaries): `acp/config-option.ts`, `acp/event.ts`, `acp/service.ts`, `session/message-v2.ts` + tests.
- Moved `.scripts/upstream-sync.state.json` `baselineSha` `5cd8e68fdd` -> `abce98e0eb` (upstream v1 tip).
- Verification: core `open.test.ts` 2/2, 8 ported opencode test files 148/148, typecheck clean core/opencode/tui. `.scripts\test.ps1` unit/providers/httpapi/typecheck: providers and typecheck pass; other unit packages pass except opencode (18 fail) and tui (2 fail); httpapi 207/207 scenarios pass but exits 1 for 14 routes with no scenario. `generated` not run (dirty worktree).
- ERROR: known `prompt.test.ts` failures (2) still present. New stale-test failures unrelated to Stage 4 files (no Stage 4 diff touches them): `event-manifest` (Latest 90, test expects 89), `config/tuiLedger.test.ts` (7), `control-plane/workspace.test.ts` sessionWarp, `tool/parameters.test.ts` snapshots (bash `background`, task `model` params), `cli/run/footer.view.test.tsx` (2, `ctrl+b subagents` vs expected), `claude-code/spawnEnv.test.ts` (PATH), `tui/app-lifecycle.test.tsx` (2, one 30s timeout). `httpapi-listen`/`httpapi-sdk` failed in full run, pass in isolation. httpapi missing scenarios: claude warmup/account, plugin, provider usage, resume state/cancel, session queue/generate/handoff, instance reload.
- TODO: fix or update the stale tests above and add the 14 httpapi scenarios before the 0.3.0 release gate.
- Update (same session, ~22:40): TODO above done; all suites green. Real fixes and stale-test updates below.
- Fixed `project/instance-store.ts` `completeLoad`: closing the store scope mid-boot interrupted the boot fiber before `entry.deferred` settled, so the `disposeAll` finalizer awaited forever (server shutdown hang; httpapi auth mode hung after an aborted probe). Now `onInterrupt` removes entry + `Deferred.interrupt`. Regression test `test/project/instance.test.ts` "closing the store while a load is still booting does not hang" (fails without fix).
- Fixed `server/lifecycle.ts` `setController` clearer also resets `draining`; `httpapi-global` shutdown test leaked draining into later files (`/global/health` 500 in `httpapi-listen`/`httpapi-sdk`). Production never calls the clearer.
- Fixed `session/prompt.ts` loop exit: model lookup only when a context-limit action applies; a finished turn whose model left config threw `ModelNotFound` ("concurrent loop callers get same result").
- Fixed `config/tuiLedger.ts` `read()`: pid from file name, so a dead TUI's truncated `<pid>.json` is skipped instead of throwing on every read (blocked launcher cleanup).
- Changed stale tests to current oc behavior: `tuiLedger.test.ts` rewritten for identity files + CIM `created` (v0.2.162 design); `event-manifest` 90 (fork `provider.usage.updated`); `parameters` snapshot (bash `background`, task `model`); `footer.view` oc preset (`ctrl+b` subagents, `ctrl+shift+b` background, queued key bound in test since default none per v0.2.177); `prompt.test.ts` replace test -> "later prompt tool flags override earlier ones" (merge is deliberate v0.2.162); tui `sync.test.tsx` + `app-lifecycle.test.tsx` disposal bootstrap nonfatal (v0.2.177 /reload).
- Fixed test isolation: `spawnEnv.test.ts` used `env.PATH` (Windows key `Path`); `workspace.test.ts` `initGitRepo` sets `core.autocrlf false` (global true made warp patch CRLF); `compaction.test.ts` abort bound 250ms -> 2s (10s backoff; flaked at 354ms under load).
- Added httpapi scenarios for 14 oc routes (`test/server/httpapi-exercise/index.ts`); writes use 400/404 validation paths. Fixed existing scenarios: `session.rename` returns `{ session, model }`; pty uses `cmd.exe` on Windows (`controlledPtyCommand` in `dsl.ts`). Effect + auth modes had never run (coverage mode failed first).
- Verification: `.scripts\test.ps1 -Package opencode,tui` opencode 4861 pass / 1 fail (compaction flake, then fixed: file 55/55); tui 535/535; `bun run test:httpapi` coverage/auth/effect 221/221 each; opencode typecheck clean. Earlier this session: other unit packages, providers, typecheck categories pass.
- Note: known `prompt.test.ts` failures (entry 2026-10-13 ~11:25 and earlier) are resolved; do not list them as expected anymore.

### User
Providers
- xAI, Together AI, Vercel gateway, and GitLab providers are on newer SDK versions.
- Cloudflare AI Gateway models now respect the configured provider timeout.

Browser links
- Opening docs, login, and OAuth links now goes through one shared opener in every part of the app.

ACP
- Editors using ACP get their session options back on reload and see reasoning separated correctly from replies.

Reliability
- Shutting down or restarting the server while a project is still loading no longer hangs.
- A leftover, half-written TUI record from a crashed window no longer blocks oc from stopping its TUIs.
- Reopening a finished session whose model was removed from your config no longer errors.
- The full test suite now passes on Windows, including the server route checks.

---

## 2026-10-13 (~11:25) - v0.2.178 dacMemore - Stage 6 follow-ups: per-project /reload gate, explicit task model, safe PID handling - Claude Opus 5.5, reasoning default; Implementation

### Agent
- Meta: Claude Opus 5.5; reasoning default; Implementation (close-out of `plans/upstreamParity/stage6/passFollowups.md`); completed. Code by an earlier session; this session verified, reviewed item 2, bumped, wrote notes.
- Version: 0.2.178 dacMemore
- Fixed (item 4) `core/src/util/processTree.ts` + `cross-spawn-spawner.ts`: `killTree(root, held)` checks root creation time against the spawn window and the held Node handle; STOP verifies all live entries first, skips vanished ones; no root-only fallback kill on Windows.
- Fixed (item 3) `background/shellJobs.ts`: meta stores `ownerCreated`; `recover()` and `bgKill` verify owner PID + creation time, unverified owner -> `interrupted` (PID never signalled).
- Fixed (item 1) explicit task model: removed module-level `explicitModelSessions` Set; carried as `UserMessage.model.explicit` (`session/prompt.ts` `explicitModel`) -> `opencodeExplicitModel` provider option (`claude-code/shared.ts`, `callOptions.ts hasExplicitModel`, `turnContext.ts`). Also fixed stage-6 regression where `defaultSubagentModel` was ignored.
- Changed (item 2, user picked option a) `core/src/session/work.ts`: `run(key, effect)`/`maintain(key, effect)` keyed by instance directory; `run` during that project's maintenance fails fast with `BusyError` (no waiting, so no stale `InstanceRef`); `prompt.ts` `gated`/`gatedSession` supply `ctx.directory` and map to `Session.BusyError` (409). `/btw` stays gated (now per project only). `config.invalidate()` kept before `store.reload` (reload must re-read global file). FORK.md `/reload` row and wiki `Configuration.md` updated. Legacy SDK regenerated by earlier session.
- Verification: opencode task/taskModelOverride/proxyTask/agentModels 76 pass 0 fail; core session-work/processTree/cross-spawn-spawner 43 pass 0 fail; opencode reloadConfig/httpapi-global/shutdown/backgroundShell x2 38 pass 0 fail; typecheck exit 0 in core, opencode, tui. Release-gate spot checks: no tracked personal paths, no upstream names in `.github`, FORK.md counts match (82). No build/install, no live check.
- ERROR: earlier session's Claude CLI stream went silent >60 s during the item 1 test run and was closed without a result; rerun in background passed.
- MISTAKE (process): this session and the earlier one overlapped on item 2 files without coordination; this session caught it from mtimes before editing. Rule: check file mtimes / ask before editing when a handoff may still be live.

### User
Reload and sessions
- `/reload` in one project no longer waits on or blocks sessions in other projects; prompts sent to the project being reloaded are refused as busy instead of waiting.

Subagents
- A task given an explicit model keeps that model even when the same subagent is resumed while still running.

Background shell
- A background job left by a crashed oc is marked interrupted even if Windows reused its PID, and killing such a job reports that instead of "already running".
- Stopping a process tree never touches an unrelated process that reused the original PID.

---

## 2026-10-13 (~11:01) - v0.2.177 - Show failed Claude CLI web searches - Claude Sonnet 5.5, reasoning default; Implementation

### Agent
- Meta: Claude Sonnet 5.5; reasoning default; Implementation; completed
- Version: 0.2.177
- Added `webSearchIds` in `provider/claude-code/turnStream.ts`: `completeToolUse` records each CLI-run WebSearch id, `onUser` now reads its `tool_result` and notes `Web search failed: <reason>` when `is_error` is true; success stays silent
- Added two tests in `test/provider/claude-code/cliEventsStream.test.ts` (failed search noted, successful search not noted)
- Verification: `bun test test/provider/claude-code/cliEventsStream.test.ts` 14 pass, 0 fail
- Risk: real CLI may report a failed WebSearch as plain text without `is_error`; unverified against a live failure

### User
Web search
- A web search that fails inside Claude Code now shows a "Web search failed" line with the reason under the search query.

---

## 2026-10-13 (~09:57) - v0.2.177 parlorYowza - Stage 6 adoptions: queue, /btw, /reload, background shell, task model, tool repair, one title path - Claude Opus 5.5, reasoning default; Implementation

### Agent
- Meta: Claude Opus 5.5; reasoning default; Implementation (imp, orchestrator); completed. Designs by general-gpt-6.1-sol-medium (architect role), code by general-haiku-5.5-high workers in 3 waves, docs by general-haiku-5.5-medium.
- Version: 0.2.177 parlorYowza
- Plans: `~/.config/opencode/plans/upstreamParity/stage6/*.md` (7 files); queue plan has an appended "Persistence (user decision)" section.
- Merged automatic naming into `SessionPrompt.title({ mode: stock|marked|manual })` (`session/prompt.ts`); `rename()` is a thin manual wrapper; automatic writes skip when the title changed meanwhile. Stock titles now run under `SessionWork.run`.
- Added `tool/inputRepair.ts` (port of dev `437cdc03a9`), applied at the `SessionTools.resolve` boundary (validator + executor). Builtins repair against the advertised normalized schema (raw Effect doc blocked repairs). Code-mode child calls not covered.
- Added optional `model` (`provider/model#variant`) on `tool/task.ts`; validated before permission/child; `task_id` must be a same-agent direct child. Claude: `proxyToolDefs.ts` schema, `agentModels.ts` `setExplicitModelSession` skips `forceModel`/`defaultSubagentModel`, `hostTools.ts` V2 `subagent` passes `model`. TUI task row shows the effective model.
- Added `POST /instance/reload` + TUI `/reload` (`app.tsx`): `SessionWork` process-wide idle gate (`core/src/session/work.ts`), config preflight (`config.ts`, local JSON only), `InstanceStore.reload`; disposal bootstrap in `sync.tsx` is nonfatal.
- Added `POST /session/:sessionID/generate` + `SessionPrompt.generate` and `/btw` dialog (`tui/src/component/dialogBtw.tsx`): no history writes, tools none, 120 s. Claude Code and Cursor return typed 422.
- Added built-in background shell: `bash` `background`, `background/shellJobs.ts`, `tool/shellJobs.ts` (`bgStatus`/`bgKill`), completion notice via shared `notifySession` in `task.ts`, `run-state.ts` maintenance gate, safe tree kill `core/src/util/processTree.ts` (cross-spawn-spawner win32 no longer uses `taskkill`). Jobs use their own instance-scoped registry, not `BackgroundJob` (Esc would kill them). `bgRun` now asks by default.
- Added persisted queue: `session_queue` table + migration `20261013132808_sessionQueue`, `session/queue.ts`, `GET/POST /session/:sessionID/queue`, `dialogQueue.tsx`, Alt+Enter `prompt.queue` in session; restart/revive loads queues paused; `dispatching` rows reconciled by message id at start; scheduled resume defers while queue has entries. `session_queued_prompts` default now none (collided with quit).
- Regenerated legacy JS SDK (`sdk/js/src/v2/gen/*`); `packages/client` generate produced only EOL changes (restored).
- Docs: FORK.md (5 new rows, bgShell row replaced, counts 82), SCOPE.md bgShell retired row, `docs/keybinds.md`, wiki `Sessions.md`, `Keybinds.md`, `Configuration.md`, `Agents-and-Skills.md`, `Companion-Tools.md`.
- Verification: core 10 pass (session-work, processTree), `migration --check` exit 0; opencode 209 pass / 0 fail across 18 new+edited files; tui 23 pass / 0 fail; typecheck exit 0 in core, opencode, tui; `keybindDocs.ts --check` exit 0. Pane checks not run. No build/install.
- ERROR: known pre-existing failures in `test/session/prompt.test.ts`: "prompt tools replace previous prompt tool rules" (code merges, test expects replace; code unchanged from HEAD) and "concurrent loop callers get same result" (ModelNotFound in context-limit check from `f69cf20`). Not caused by this session.
- Risk: queue Esc in the gap between claim and run start may still start that prompt; two oc processes on one DB can double-send after Resume. Background jobs die on instance reload (`/reload`); job lifetime = instance lifetime.
- TODO: `/btw` on Claude Code (needs isolated one-shot CLI call); `docs/keybinds.md` still lists alt+return under Insert newline (upstream def).
- Pass cleanup (4 grok review agents, claims verified by reading): `shellJobs.ts` job ids now match `^bg_[A-Za-z0-9]+$` (model-supplied id could walk out of the job dir), `readTail` reads only the log end, corrupt `meta.json` is skipped; queue `pause` now takes the same lock as `claim`, and a failed claim that finds the session idle retries instead of stalling; 20 new/edited LF files converted to CRLF. Verification: opencode typecheck 0, backgroundShell/queue/shell tests 115 pass; core processTree `stops a live child tree` failed once under load and passed on rerun (6 pass), `tool.shell basic [bash]` timed out once (5 s) and passed on rerun.
- Known, not changed (need a decision): `explicitModelSessions` is a module-level Set in the Claude provider, set from `tool/task.ts`; `SessionWork` gate is process-wide and requests that waited out a reload resume with the pre-reload instance; paused queue also holds back a due auto-resume; recovery trusts `processAlive(owner)` (PID reuse can leave a job `running`).
- MISTAKE: Haiku workers reported failure on harmless last-tool errors; resuming with `task_id` recovered them. Brief workers to finish with a text report.

### User
Sessions
- Alt+Enter on a session screen queues your prompt; queued prompts send in order after each turn, survive restarts (paused until you resume), and can be edited or cancelled in the queue manager.
- `/btw <question>` asks a quick side question about the session without adding it to the conversation (API providers only for now).
- Background shell commands are built in: agents can run `bash` in the background, check jobs with `bgStatus`, stop them with `bgKill`, and the session is told when a job ends. The separate bgShell plugin is retired.

Configuration
- `/reload` reloads config, agents, skills, providers, MCP and plugins without rebuilding oc.

Agents and tools
- Sub-agent calls can pick a model (`provider/model#variant`) for one run.
- Slightly malformed tool arguments from models are repaired automatically instead of failing.
- Automatic session names use one code path; no visible change.

---

## 2026-10-13 (~08:19) - v0.2.176 tolkienBurps - Live usage sidebar updates mid-turn - Claude Sonnet 5.5, reasoning unspecified; Agent

### Agent
- Meta: Claude Sonnet 5.5; reasoning unspecified; Agent (picked up from Sol session ses_ecb0be099ffexITeS0F8XysXdt); completed
- Version: 0.2.176 tolkienBurps
- Added: provider usage observations from live streams (Claude rate-limit events, Codex WS quota) published via `schema/src/provider-usage.ts`, `core/src/provider-usage.ts`, `core/src/claude-usage-cache.ts`, `opencode/src/provider/usage-observations.ts`; event-manifest and generated client/SDK updated.
- Added: TUI `usageLive.ts` and `usageRefresh.ts` so the sidebar Usage block and an open Usage dialog update during an unfinished turn instead of waiting for turn end.
- Changed: `tuiPane.test.ts` fractional-usage pane check opens the Usage dialog by clicking the sidebar Usage block (command-palette search for "Show usage" returned "No results found"); added `quotaFixture.ts`.
- Verification: pane check `OC_TUI_PANE=1 bun test test/provider/claude-code/tuiPane.test.ts -t 'Claude fractional usage'` passed (1 pass). Ran opencode usage-observations, codexQuota, openai-ws, accountPool, cliEventsStream, fakeModel (102 pass); tui usageLive, usageRefresh, usageFreshness, openSidebar (117 pass, 2 skip); schema event-manifest (2 pass). No build or install run.
- ERROR: command-palette search did not find the sidebar usage command in the pane (earlier run); resolved by clicking the Usage block.

### User
Usage sidebar
- Claude and Codex usage readings in the sidebar now update while a turn is still running.
- An open Usage menu refreshes with the new readings without reopening it.

---

## 2026-10-13 (~07:01) - v0.2.175 skaDutchman - oc-release /update, session list attention, local model discovery - Claude Opus 5.5, reasoning unspecified; Implementation

### Agent
- Meta: Claude Opus 5.5; reasoning unspecified; Implementation (imp), orchestrator plus 3 subagents (Haiku high, Haiku med, Sol low); completed
- Version: 0.2.175
- Plan: `C:\Users\user\.config\opencode\plans\upstreamParity\plan.md` D7 + D9.
- Added `core/src/util/ocRelease.ts` (`lookup`, `asset`, `isNewer`; asset names match `.scripts/pushRelease.ps1`).
- Added revive mode `update` + `release` (validated `X.Y.Z`) and `Revive.downloadRelease` (download + `tar -xf` into `Global.Path.cache/oc-update/<v>` before shutdown; ocdebug included when installed or debug flavor). `oc.ts revivePipeline` feeds it to the existing install/rollback path.
- Added TUI `/update` (`oc.update` in `reviveCommands`: latest / skip / update) and one startup notice (`updateNotice`, honors `autoupdate: false` and `skipped_version`). Removed stock `installation.update-available` handler, `isVersionGreater`, `DialogAlert` import.
- Removed release blocker: `checkUpgrade` (worker + `cli/cmd/tui.ts`), `cli/upgrade.ts`. `Installation.method` always `unknown`; `latest` default points at fosterbarnes/oc. `opencode upgrade` only reports.
- Added session palette `Copy session ID` (`session.copy_id`).
- Subagent: session list "Awaiting input" group + `?` marker (`dialog-session-list.tsx`); `Project.list` orders by latest session activity and hides projects whose worktree is gone while the drive root exists (no migration).
- Subagent: prompt footer `resumes at HH:mm` from `sdk.resume.state()` (mount, 60 s, idle, session switch).
- Subagent: `provider/localDiscovery.ts` lists models for configured `lmstudio`/`ollama`/`vllm` (1 s deadline, debug log on failure).
- Skipped: interrupt confirmation (double-Esc already exists).
- Kept: `core/src/util/launchDetached.ts` `settleMs` diff is another session's work; untouched.
- Docs: FORK.md row "Update from oc releases" (counts 77), README line, wiki `Launching.md` "Updating oc" (wiki push is user's).
- Verification: opencode localDiscovery + project + revive + help snapshot 72 pass; tui dialog-session-list + format 19 pass; core ocRelease 5 pass; `tsgo --noEmit` clean in core, opencode, tui. No build/install. `/update` not live-checked (no public release yet).

### User
Updates
- oc checks its own GitHub releases at startup and offers `/update`, which installs the new version and reopens where you were; it never offers stock OpenCode anymore.
Sessions
- Sessions waiting on a question or permission appear at the top of the session list with a `?`.
- The prompt footer shows when a usage-limit auto-resume will fire.
- The session menu can copy the session ID.
Models
- Configured LM Studio, Ollama, and vLLM providers list their installed models automatically.

---

## 2026-10-13 (~06:40) - v0.2.174 coastersWall - Upstream parity stages 0-4: SCOPE.md, repo cleanup, v1 fix ports - Claude Opus 5.5, reasoning unspecified; Implementation

### Agent
- Meta: Claude Opus 5.5; reasoning unspecified; Implementation (imp) orchestrating 10 subagents; Stages 0-3 and part of 4 completed, Stages 5-6 not started
- Version: 0.2.174 (bumped twice by subagents: 0.2.173 Haiku packages entry below, 0.2.174 Luna ports; no further bump)
- Plan: `C:\Users\user\.config\opencode\plans\upstreamParity\plan.md` (decisions D1-D11, Stage 1 results, execution log). Raw scout reports: `plans\upstreamParity\stage1\rawReports.md`.
- Upstream: refreshed via `.scripts\updateUpstream.ps1`; v1 `abce98e0eb`, dev `c5aabae288` (v2.0.28). `baselineSha` not moved (only part of the v1 delta ported).
- Added `SCOPE.md` (removed / not planned / planned for later / retired oc features). Retired `README.OG.md` (git rm). FORK.md retired list moved to SCOPE.md; README.OG references in FORK.md, AGENTS.md, UPSTREAM-SYNC.md replaced; AGENTS.md + UPSTREAM-SYNC.md gained the sync classification rule. README links SCOPE.md.
- Moved `CONTEXT.md`, `publicForkPlan.md`, `revivePlan.md`, `claudeTestFlow.md` to `docs/dev/` (git mv); refs fixed (FORK.md:54, `realModel.test.ts:1`). Removed `STATS.md` and its writer `src/script/stats.ts`.
- Fixed personal paths in AGENTS.md:6, SCRIPTS.md:109, UPSTREAM-SYNC.md:9-10, `docs/dev/claudeTestFlow.md:8`; `src/package.json` repository URL -> fosterbarnes/oc.
- Subagent (Haiku med): `.github` TEAM_MEMBERS/CODEOWNERS -> fosterbarnes, PR template rewritten, `publish-python-sdk.yml` removed; `.config/openSidebar.json` projectDirectory dropped; grepbench resolves ugrep from env/PATH; test fixtures use `C:/Users/example`.
- Subagent (Luna high): ported v1 `055d95bb7e`, `97a86b7677`, `a97622c801`, `b471c2b449`, `ba341c6cac`, `f5ce4f881e`, `7b39a338a0`, `a9a6fad0fa`, `b2a3926e87`, `e9f8a210b9`. Stopped `35fc7a776c` (conflicts with oc's custom Cloudflare loader). Dependency bumps (xai, togetherai, gateway, gitlab, ultrafast patch), `29f07e0c69`, `95daf90670` ACP, `228e9095ba` (ui icon, package removed) not ported.
- Risk: RELEASE BLOCKER open: native TUI `checkUpgrade` (`cli/cmd/tui.ts:287` -> `cli/upgrade.ts`) queries anomalyco/opencode releases (`installation/index.ts:258`). Decision D7: retarget to oc releases; not implemented yet.
- Risk: new session headers `x-opencode-session-id` / parent now go to every provider (upstream behavior).
- Kept: unrelated concurrent edits (revive/launcher in `config/oc.ts`, `revive.ts`, `serve.ts`, launcher tests, FORK revive row, `src/bun.lock`, `opencode/package.json`) untouched.
- Verification: subagents reported tsgo typecheck clean in tui, core, opencode, server; targeted tests pass (filetype 2, error 4, npm 5, search 2, httpapi-pty 5 pass/5 skip, copilot models 7, copilot chat 19+12, llm 33, oc cli 11, oc config 28, revive 23, openSidebar 74/2 skip); `go vet` grepbench clean. Orchestrator read the port diffs; did not rerun tests. No build, install, `bun install`.
- TODO: user runs `bun install` (drop removed workspaces from bun.lock), build, check notification sounds play. Next: Stage 5 small wins and Stage 6 plan files (D7-D9).

### User
Repository
- A new SCOPE.md lists what oc leaves out of upstream OpenCode, what is planned for later, and retired oc features; README.OG.md is gone.
- Leftover web packages, upstream publish and stats scripts, and upstream GitHub metadata were removed or rewritten for oc.
- Developer docs moved from the repo root into docs/dev, and personal machine paths were removed from code, tests, and docs.
Fixes from upstream OpenCode
- C++ module files get syntax highlighting, /status shows Windows plugin names correctly, remote config login failures explain how to sign in again, and several Copilot and MCP browser fixes landed.

---

## 2026-10-13 (~06:31) - v0.2.173 cornpopAggression - Remove dead ui, session-ui, and docs packages - Claude Haiku 5.5, reasoning unspecified; Implementation

### Agent
- Meta: Claude Haiku 5.5; reasoning unspecified; Implementation; completed
- Version: 0.2.173
- Removed `src/packages/ui`, `src/packages/session-ui`, `src/packages/docs` via `git rm -r`; deleted leftover ignored `node_modules` and `.turbo`
- Moved 5 TUI notification sounds (`bip-bop-01`, `bip-bop-03`, `staplebops-06`, `nope-03`, `yup-01`; hash-checked) to `src/packages/tui/src/asset/audio/`
- Changed `tui/src/attention.ts` sound imports to `./asset/audio/*.mp3`; `tui/src/audio.d.ts` keeps only the `*.mp3` declaration
- Removed `@opencode-ai/ui` from `tui/package.json`; `src/bun.lock` still lists the workspaces until `bun install`
- Removed `@opencode-ai/ui#test` and `@opencode-ai/session-ui#test` from `src/turbo.json`
- Removed `session-ui` and `ui` from the unit list in `.scripts/test.ps1`
- Removed `src/script/publish.ts`: no caller in any package.json, `.scripts`, or `.github`; it published `packages/ui`
- Removed `src/script/translate-ui.ts` and its test, plus the `translate:ui` script in `src/package.json` (user approved; they only edited `packages/ui/src/i18n`)
- Changed comments in `packages/core/src/oauth/page.ts` to name upstream OpenCode's UI package instead of removed paths
- Kept `src/packages/opencode/script/build.ts` unchanged: it has no ui audio list; Bun bundles the `type: "file"` imports
- Rotated `buildNotes.md` (1059 lines) to `buildNotes.archive9.md`; carried the cumulative summary forward unchanged
- Verification: `bun run typecheck` in `src/packages/tui` (tsgo --noEmit) exit 0, no errors. `git grep` for `session-ui|@opencode-ai/ui|packages/ui|packages/docs` leaves only the translate-ui files. No tests run (no test files edited). No build, install, commit, or push
- ERROR: none

### User
Cleanup
- Removed the unused UI, session UI, and docs packages. The TUI notification sounds now come from the TUI package, so the bundled sounds should be unchanged. Not run live.

---
