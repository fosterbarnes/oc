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
