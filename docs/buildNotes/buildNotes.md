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
- Kept histories verbatim: archive1 (2026-08-20 through 09-09), archive2 (09-09 through 09-15), archive3 (09-15 through 09-28), archive4 (1144 lines), archive5 (1019 lines through v0.2.65), archive6 (1127 lines through v0.2.87), archive7 (1176 lines, v0.2.88 through v0.2.120, committed e4d73d1), archive8 (1152 lines, v0.2.120 through v0.2.148), archive9 (1059 lines, v0.2.149 through v0.2.172; its summary was archive8's carried unchanged, so archive9 is first summarized here), archive10 (1122 lines, v0.2.173 through v0.2.202), archive11 (1008 lines, v0.2.203 through v0.2.224), archive12 (1009 lines, v0.2.225 through v0.2.246, equals commit 1b7aa56), archive13 (1074 lines, v0.2.247 through v0.2.276; its v0.2.276 entry was uncommitted at rotation), archive14 (1051 lines, v0.2.277 through v0.2.297; v0.2.297 entries uncommitted at rotation, last commit dca5d1b). Archive8 retains the previous cumulative summary plus complete later entries, earlier hashes, checks, and risks. Never edit archives.
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
- Changed usage sidebar v0.2.150-165 (archive9): `formatUsagePercent` adaptive decimals, trailing zeros stripped; `formatUsageRows` aligns each value to its own reset clock digit, `usageColumns` shares slot widths (layout runs twice). Claude rows per account `Claude:`, `Claude2:`; active account marked `«` (`sdk.claudeAccount.onChange` -> `usageScheduler.request()`); idle 5h shows `-` (reset placeholders stay 1-2 chars so pooled rows never wrap). Claude windows parse independently; `projectClaudeUsage` expires deadlines on the local minute clock; per-window `_fetchedAt` in cache. `usageSpacing` user-level; label dims only when stale/old. Section collapse kv `sidebar_open_<section>`. Sidebar rows reconcile snapshots to keep clipping stable; `clipEnd` renders empty when unmeasured.
- Added Claude pool persistence `account-pool.json` + usage-cache seed + text-limit failover (v0.2.153); palette Switch Claude account (`GET/PUT /session/claude-account`, v0.2.161); auto-resume scheduler `scheduledResume.ts` (default off, 5-fire cap, lockfile, retries) v0.2.159; `/compact` reports `post_tokens`; warm-up schedule `warmup.ts` + `/global/claude/warmup` (v0.2.172).
- Fixed context-limit handoff v0.2.154: `isTitleRequest` keys on naming agents; tool-less session-agent turns share the chat's `tools::` CLI key (`continuesChat`) so a deny-all summary does not hang in `askFreshConversation`; child kickoff carries command-turn permission. Compaction-only config PATCH no longer disposes instances (v0.2.163).
- Added WezTerm multi-tab revive (`oc revive-tabs`, ledger `sessionID`/`directory`) v0.2.152. Split binaries v0.2.157: `Global.native` (`OPENCODE_FLAVOR`, `OC_FLAVOR`), `oc.exe` resident vs native `opencode.exe`; removed `oc single`/`--portable`/`mode`; build/install `-Oc`/`-Native`; `oc launch --palette` spawns native.
- Changed slash commands v0.2.153: single-command header `[/<name> is active: ... replace any earlier slash command's persona ...]`; `withoutCommandHeader` for naming. Titles favor concrete subject via `ocCommandArguments` (v0.2.149).
- Fixed fork-wide review v0.2.162: Claude failover only on error results, Cursor relay token/abort/containment, scheduled resume backoff, identity-gated launcher kills, palette hotkeys validation, top/bottom sidebar finished, desktop updater runner (`OCERR:`), installer backup/restore; prettier + 174 fork files renamed camelCase; removed oc.json `reasoningEffort`. Risk open: claude-code `persistSessions`/`persistPool` last-writer-wins across oc + native.
- Added palette group headings (Defaults, Layout, Folders, Tools, Server, Third party harness management) v0.2.165; harness updaters v0.2.161. WezTerm Ctrl+V via `oc_tui` user var + native clipboard read; pasted images saved to `attachment.image.save_dir` (default `%LOCALAPPDATA%\oc\images`) with path text, whitelisted dir, `Clear saved images` (v0.2.166). Intro: first pwsh spawn blocks ~0.42 s, so process listing runs in `spawnWorker.ts`; `introPace`; `INTRO_TICK_MS` 40 (v0.2.167).
- Removed command markers v0.2.168 and `/work`/`/done` v0.2.171 (`SessionWork` kept; stale `ocWorkHandoff` metadata/copy dirs left). README is pitch; wiki (`oc.wiki`) is source of truth for user behavior (v0.2.168).
- Removed ui/session-ui/docs packages; added SCOPE.md, docs/dev; ported v1 fixes (v0.2.173-174). Added `/update` from oc releases, removed stock `checkUpgrade` (v0.2.175); live usage observations mid-turn (v0.2.176); Stage 6 queue (`session_queue`), `/btw`, `/reload`, built-in background shell (`bgStatus`/`bgKill`), task `model`, `inputRepair` (v0.2.177); `SessionWork` keyed per directory, explicit model on `UserMessage.model.explicit`, `killTree` identity checks (v0.2.178); deps + 3 ports, instance-store boot interrupt fix, httpapi scenarios for 14 routes (v0.2.179).
- Added agent markdown hot reload (`Config.agents()`, fingerprint, per-file last-good), plugin override snapshot, `/addSub` `/rmSub` `/viewSub`, `POST/DELETE /agent/sub` (v0.2.180-181). Added `/revive-single` (native-only build in a new tab); retired ocdebug (v0.2.181).
- Moved repo public as GitHub fork (filter-repo, scrubbed paths; scan before every push; record upstream via `git merge -s ours`) and build notes to `docs/buildNotes/` (v0.2.183). Added sticky tool titles (v0.2.184). Added Claude mid-turn steering (`--replay-user-messages`, QUEUED/SENT, retraction, revert whole turn), `cliExecutable` native shim so kills reach real Claude (v0.2.185-186). Fixed ledger PID reuse skip, launcher first-prompt `pendingUser`, `PSModulePath` dropped for powershell 5.1 updates, palette Update all (v0.2.186).
- Added agent-push tag pick (`-Tags`/`-SetTag`), pinned-chat failover (`failoverAccount`), bumpVersion without countdown (v0.2.187-189). Command turns spawn `--tools ToolSearch` (no false "disconnected" notice); `Patch.usesApplyPatch` shared by registry and system prompt; apply_patch Add File documents overwrite (v0.2.190). About dialog + baked `InstallationVersionTag` (v0.2.191). `dialog.replace(..., { back })`: Esc goes back in drill-ins; tuiDiag writes removed (v0.2.192).
- Added per-tool `toolHost` (`auto`/`oc`/`harness`) and `commandToolPlan`; `CLAUDE_HARNESS_ONLY_TOOLS` keeps/denies WebSearch; `harnessToolsDenied` (v0.2.193-194). `noReply` user messages skipped by `pendingUser` (v0.2.195). Question tool consistent on every Claude turn; Home new session bootstraps in-process (`ocNewSession.ts`) (v0.2.196).
- Added `claude.autoResume` on/off dialog (v0.2.197-199); agent-push title `<folder> - agent-push:#<hash>` after `HEAD == @{u}` (v0.2.198); bundled `drac`, `theme` vs `theme_native` kv keys, kv `set` merges under lock (v0.2.200); `readmeVersion.ps1` in prePush (v0.2.201); `DialogSessionCleanup` palette (v0.2.201); `agentPushAutoDelete` + `session_complete autoDelete` (v0.2.202).
- Verification baseline update: v0.2.179 all suites green (opencode 4861 pass, tui 535, httpapi 221 x3 modes); earlier `prompt.test.ts` known failures resolved. `steering.test.ts` flakes when run in one `bun test` call with `fakeModel.test.ts`; passes alone.
- MISTAKE: palette entries in `Session` category are hidden from the oc palette; use `oc`. `git rev-parse --short` takes one revision. Subagents leave LF/mixed EOL and edit glyphs inside literals: check EOL and diff scope; glyph cleanup touches comments only, never upstream files. Check file mtimes before editing when a handoff may be live. Close each chunk's notes independently. Rotate buildNotes before inserting the new entry.
- Added usage calendar (archive11, v0.2.203): `usageCalendarEvents`/`nextRenewal`/strip, user-level `usageSubscriptions` (free-text labels, renew day or end date), rows read inside the dialog so readings update live; Usage menu and calendar list actions first.
- Moved large fork files into topic files v0.2.204 (C0-C9; exact line-range moves, no logic edits, no barrels or shims): tui `usage/`, `claude-code/warmup/`, `config/oc.ts` -> `resident.ts`/`reviveHost.ts`/`wezterm.ts`, `app.tsx` -> `ocSettings`/`ocCommands`/`reviveCommands`/`harnessUpdate`/`crow`, `sidebarTools` -> `sidebarUsage`/`rootPicker`/`scriptSettingsMenu`, sidebar `helpers.ts` -> `settings`/`cursorToken`/`roots`/`scripts`, cursor `protocol/tools.ts` split, cursor `pump.ts` `CursorPump` + `execRecovery.ts`, claude `turnStream` -> `streamWriter`/`todoMirror`/`steering`, `session/titleGen.ts`, `session/sideQuestion.ts`, `handlers/sessionOc.ts`, `ocSessionCommands.ts`, `claudeCommands.tsx`. TODO: cursor `startSession` still one long function.
- Fixed v0.2.205: sidebar plugins root `<Show>` on an async resource remounted ~1,700/s and leaked OpenTUI text buffers until the 65,535-handle table filled (freeze on "esc interrupt"); root `<box>` always renders. User `info` no longer writes `permission: undefined`. Cursor Windows soft-timeout shell runs in the foreground with `timeout`.
- Fixed v0.2.206: warm-up test allows CLI `safeguards` (`dangerous_tool_use`); default Claude account dir is `CLAUDE_CONFIG_DIR || ~/.claude`.
- Added v0.2.207-212: single auto-resume toggle; Third party harness updates heading; `subagent_tabs.return_to_parent` (default true); favorite model categories (`favoriteCategories`, colors, `DialogFavoriteCategory`, cross-category moves via `moveModelFavorite`, `nested`/`hasHeading` in `dialog-select.tsx`) v0.2.208/214; scheduled prompts (`session_queue.run_at`/`target`/`message_id` migrations, `queue.due`/`fireDue`/`dispatchDetached`, Alt+S, `scheduleClock.ts` segmented clock, fresh message ids at send, Flock lease on claims) v0.2.210; footer schedule/oc palette hints v0.2.211; unified `time.clock`/`time.timezone` (`applyTimeZone` sets process `TZ`, `Locale.setTimeSettings`, palette Time) v0.2.212.
- Added v0.2.213: `CLAUDE_UNSUPPORTED_TOOLS` (worktree, cron, wakeup tools) always disallowed; `Workflow` off with task tools; oc `schedule_prompt`/`schedule_list`/`schedule_cancel` + `schedule` proxy entry (in default proxy list); provider option `claudeSettings` merged into `--settings`; `accountSettingsDrift` startup warning.
- Changed v0.2.215-216: removed manual handoff command; Subagents dialog grouped by provider/model with effort on the right, Ctrl+A add, inline double-press delete. Layout uses structured `agent.model`/`agent.variant` only.
- Changed v0.2.217-219: `getUnbumpedCodeChanges` gate kept in `agentPush.ps1` only (prePush gate removed); build-notes skill runs `bumpVersion.ps1`. Claude provider warn/error surface as TUI toasts (60 s dedupe), file line written first. "view subagents" hint only while a task runs. History rewrite: 27 commit messages corrected, same version+tag commits squashed; backup branch `backup/pre-rewrite` + bundle `ocPreRewrite-2026-10-16.bundle`.
- Fixed v0.2.220: unbound `tui.showToast` threw in every provider warn (zombie Esc turns, hung proxy calls); `ActiveProcess.releaseTurn`; aborted grace not reset by later lines. Claude preempt: unmergeable messages end the turn after the current tool result (`maybePreempt`/`endPreempted`).
- Merged perf review Waves 0-1 v0.2.221: probe kit `test/perf` (`OC_PERF_PROBE=1`); TUI handler isolation, `forgetSession`, reconnect resync, stale hydration dropped; `scheduledDelivery.ts` durable claims; processor F1/F2, shell metadata coalescing, retry cap; Claude single-flight spawn; Cursor unknown interaction rejection; core `notify` isolates listeners. F8 history recheck only on clean exits. Known failure: `prompt.test.ts` queue contention (F5) needs rewrite against durable claims (TODO).
- Fixed v0.2.222-224: agent-push auto-delete only for sessions started with `/agent-push` (`ocPushSession`, `isRealUserMessage` skips the synthetic init message); `openInOtherTabs` counts only live `<pid>.json` ledgers.
- Verification baseline (archive11): `steering.test.ts` receipt-save test flaky; steering pane test intermittent; `accountPool.test.ts` needs `CLAUDE_CONFIG_DIR` unset; `prompt.test.ts` F5 queue contention fails (known).
- MISTAKE (archive11): never derive layout from free text when structured fields exist. `sed -i` in Git Bash strips CRLF. Removing inserted lines with Edit can join neighbors: match the whole line with its newline, then diff vs HEAD. Slice moved blocks by their own closing line. Expand shared subagent prompt placeholders before dispatch. Read the mechanism a test contends on before changing its timing. Build test sessions the way real callers do (synthetic init message). Count buildNotes lines before inserting.
- Fixed memory leaks ML-1 to ML-4 v0.2.225 (archive12): Cursor no-tool Runs keep blob/checkpoint per Run unless bound (title retries no longer reset the chat binding), bounded global SSE queues (overflow fails the stream), TUI keeps only open session trees, Claude exchanges released. Risk: sidebar usage refresh no longer sees busy sessions in other windows.
- Added stream smoothness v0.2.226: `bun patch` for `@opentui/core@0.5.14` (`CodeRenderable._shownContent`, `parseMarkdownIncremental` drops `max(1, trailingUnstable)` tokens) and `opentui-spinner@0.0.7` (phase-locked due times); reasoning renders as streaming markdown; Claude logger batches (100 ms timer, 64K, sync on warn/error/exit); Beta `smooth_streaming` (tui.json, default off, palette group "Beta"). Risk: both vendor patches need refresh on OpenTUI/spinner upgrades.
- Added `GET /provider/summary` (`Provider.SummaryResult`, shared `selectProviders`) v0.2.227; TUI bootstrap uses it instead of the 8.3 MB `/provider`. Fixed perf probe proxy teardown (502 on late upstream failure).
- Added v0.2.228 `/update` SHA-256 check (`OcRelease.Asset.sha256` from API `digest`; refuses missing or mismatched before write). Fixed v0.2.229 cmd injection in `launchDetached` `.ps1` path (`cmd /d /v:on ... !OC_LAUNCH_ARGV!`, `consoleTitle` strips `" % ! ^`; `DetachedCommand` return type v0.2.231). Risk open: `revive.ts` `consoleStart` `/v:off` `%VAR%` pattern, and `.bat`/`.cmd` via `Start-Process` re-parsed by cmd. Fixed Cursor `env.shell` (was `/bin/bash` on Windows; now configured shell).
- Added v0.2.230: `dialog.close` keybind (`ctrl+c` stock, `none` in oc preset) and rename-dialog copy (`DialogPrompt` `actions`); removed `/thinking` slash; exact slash match ranks first (`withExactSlashFirst`); Cursor exec fixes (negative read offset via `fileLineCount`, grep `(?i)`, native Glob/Grep forward-slash paths, `ls_result` `<entries>` parse); Prettier runs in `prePush.ps1` on changed files (batches of 200 since v0.2.231), `format.ts` honors root gitignore.
- Changed v0.2.231 agent noise: `setDefaultTimeout(30000)` in opencode test preload (Bun ignores bunfig timeout; CLI `--timeout` has no effect); AGENTS.md: working-tree EOL irrelevant (`eol=crlf`, prePush restores), local `core.safecrlf=false`, Known failures list (prompt.test.ts F5, subagentDialog 2, test:httpapi missing `/agent/sub` x3, steering flaky). Repaired user Effect reference cache (stale `index.lock`, then `reset --hard origin/main`); deleted `~\.claude\skills\.trash` duplicates.
- Added v0.2.232-233: Subagents dialog Enter on native general/explore picks model (`persistAgentModel`) then Reasoning ("Auto" = `variant: ""` removed by `writableGlobal`); dialog refetches on `sync.configReloadEpoch`. Notices: `ToastContext.notices` (100, per run), palette `/notices`; provider-neutral "Question waiting" reminder after 5 min in `feature-plugins/system/notifications.ts`; Claude `logger.ts` warn/error go to opencode.log (`channel=claude-code`), not toasts; proxy broker stall lines NOTICE only.
- Fixed v0.2.234-235 paste then Enter: `trackPaste`/`await pasting` in submit/queue; `pasteGrace` (300 ms) maps rolled-over Ctrl+Enter to submit after Ctrl+V.
- Added v0.2.236-238: per-session subagent off switch (`session.metadata.disabledSubagents` -> task deny rules in `turnPermission`, `describeTask` filters by session/turn permission, `DialogSessionSubagents`, `/sessionSub`, sidebar button); subagent context % in prompt bar (`contextUsage`, `subagentLabel`, `/subagentUsage`); live subagent cards in `Task` (`subagentFeed`, kv `subagent_card_rows` 0/3/4/6 default 4, `/subagentRows`). Risk: metadata PATCH read-modify-write races.
- Added v0.2.239-241: click-to-open chat links (`openClickedLink`: left down+up same cell; opentui marks every mouseup on selectable text as dragging), `/linkClick`, `/linkBrowser` (registry scan, `openUrl(input, app)`; missing exe rejects with toast v0.2.244); collapsed slash-command user messages (`ocCommands` names on template parts, `promptFromParts`, `typedText`); slash composition fixes (pasted text never runs commands via `typedSlashCommands`, Alt+Enter refuses command drafts, editor selection sent with command turns, `Command.Event.Executed` per name, `Command.COMPOSED_PREAMBLE` shared); paste summary off by default (kv `PASTE_SUMMARY_KEY`, `/pasteSummary`).
- Added v0.2.242 native Jev tools (`tool/jev.ts`, `tool/jevClient.ts`, listed only with `TYPESAFE_API_KEY`; key read at process start, restart for a new key); jev MCP removed from user config; missing-key toast v0.2.246.
- Fixed v0.2.243 stale wake silencing a Claude chat: `isWakeTurn(prompt)` checks only the newest message; wake marker parts dropped. Fixed v0.2.245 failed revive orphaning the resident server: `prepareStop` (secret + creation-time liveness, no executable-vs-caller gate) runs before any TUI kill. Added v0.2.246 `prePush.ps1` regenerates `packages/sdk/openapi.json` (was stale since v0.2.172).
- Verification baseline (archive12): pre-existing `subagentDialog.test.tsx` 2 failures and `test:httpapi` missing `/agent/sub` scenarios x3 (see AGENTS.md Known failures).
- MISTAKE (archive12): before adding a user-facing notice in a provider, check `feature-plugins/system/notifications.ts` and keep notices provider-neutral. Read opentui event flow before trusting event flags (`isDragging`). Verify fail-on-old-code in a temp copy, never by overwriting working files. Confirm a regression test fails on old code. After a one-time repair, confirm the next real run succeeds before calling it fixed. `as const` on literal `type` in decode tests.
- Added v0.2.247-252 (archive13): oc palette Font (`/font`, WezTerm `oc_font` user-var handler in `docs/wezterm.md`, reapplied at start, Up/Down 1 pt in 4-48); named warm-up schedule presets; Show usage in oc palette namespace; Esc-back restores selection, search, and scroll in every drill-in menu (`DialogSelect` focus sync).
- Added v0.2.253-255: forked Claude chats keep their Claude conversation (rewind to fork point, fresh with last exchange when too far back); steered messages keep `read mid-turn` label (`isSteered`, persisted `metadata.steered`); `/revive-single` closes the WezTerm pane it ran from once native runs (asks first mid-reply).
- Added v0.2.256-259: Update PowerShell palette entry (admin prompt, never closes open pwsh); `/killall` + `/procReport` + `killai` (`tui/src/killall.ps1`, reports in `%LOCALAPPDATA%\oc\killall`, memory split, CPU top 10, identity-checked stops); third-party update progress toast (fixed width, wrapped rows, only results kept in Notices) and `/autoConfirmUpdates` (default off); lone-subagent prompt-bar detail line.
- Added v0.2.260-263: Beta daily theme (shared daily pick, off restores chosen theme); Jev skill hint for new subagents (task text sent to TypeSafe when `TYPESAFE_API_KEY` set); agent `claudeAccount` preferred login and Subagents dialog account pick; agent-push renames only sessions it opened; `/stopSub` and Esc cascade stop subagents without deleting sessions; auto-resume off cancels queued wakes.
- Synced upstream OpenCode v1.19.3 v0.2.264-271 (stages 1-9, `plans/upstream119`): share removed, `reasoning_options`, dependency pins, core tools/shell/search/config/snapshot fixes, provider/session/server ports, TUI fixes and features (`oc update`, `oc plug`, `oc debug profile`, unseen-session dot, `/copy-all`, `alt+up/down`, transcript views, `ctrl+b` shell to background, diag toasts), output-limit continue, `compatibility` options, question dismiss `m`, web search providers, MCP reconnect. `alt+return` only queues now. SCOPE.md records later items.
- Fixed v0.2.272-275: oc `task` no longer reports a subagent failed after a recovered tool error; core provider plugin import cycle broken; Bun pinned 1.4.2, FFF 0.10.5 for bun-types 1.4; streamed OpenAI refusals render as text; image paste preview off by default (`/imagePreview`, chip click opens it).
- Fixed v0.2.276: Claude steering compares a message's settings by difference (undefined inherits the running turn), so plain messages and background notices (`SESSION_NOTICE_KEY`) join command turns instead of preempting them; `retireStaleProcess` keeps the CLI for a wake attaching to `autonomousTurn`; errored subagents pass their last reply.
- Risk (archive13): `!` shell commands no longer load `.bashrc`/`.zshrc` (upstream `01edae4a7f`); every oc process watches `<state>/diag`; legacy PTY-ticket check still URL regex; Codex OAuth callback listens on all interfaces; non-streamed refusals dropped (AI SDK); plain mid-turn message cannot lift a command's restrictions; `shortModelName` `.$1.$2` bug in `dialog-subagents.tsx`; daily theme reshuffles when built-ins change.
- ERROR (archive13): `steering.test.ts` "permission-bearing command ends the running turn at its next tool boundary" fails at `names[1]).not.toContain("Write")`, pre-existing, not investigated (TODO). Core `provider-google-vertex.test.ts` import-order failure was fixed in v0.2.273. prePush once failed TS2307 on `killall.ps1` text import (fixed v0.2.262).
- MISTAKE (archive13): a user "stop at repo root" decision applies to every live config path (reverted core config walk). New network calls reachable from shared paths need their env key cleared in `test/preload.ts` (Jev test hit TypeSafe live). Shared `DialogSelect` timing changes need `local.test.ts`, `subagentDialog`, `commandPalette`. Check command namespace and palette filters before calling an entry reachable. Use absolute paths in background runs. Rotate buildNotes before inserting.
- Added v0.2.277-279 (archive14): Claude mid-turn read splits the reply at the steered message (footer time still whole turn); commit subjects `v<ver> <tag> [<label> > <summary>]` validated by `assertCommitSubject` before slow checks (label list and rules in AGENTS.md).
- Changed v0.2.280-282: oc layout Tab types a tab, Shift+Tab next agent (`agent_cycle_reverse` unbound); `/tabKey` setting (text, agent, effort, favorite model); Tab still completes `@`/`/` lists. Removed SuperPlan/SuperGo (sp, go, spa, goa) and plan tools; do not resurrect. Prompt bar shows only running subagents.
- Added v0.2.283-290: Claude failover ranks accounts by most 5-hour usage left (sidebar cached reading; skips full 5h/week); "Claude account failover" Auto|Ask question; numbered same-name subagent labels; `/subagentRows` list (off, 2-10); revive commands inside slash chains (`/pass /revive /agent-push`: later steps sent after revive, failure/Esc puts the rest in the prompt; quoted or fenced commands never run); custom sidebar buttons from either palette (alt+p, `sidebar_buttons` in tui.jsonc, `/sidebarReset`).
- Added v0.2.291-292: feature request issue form (Area mirrors FORK.md sections); palette Claude account switch waits for a chat's running turn/background jobs (sidebar marks the account in use). Risk: long `Monitor` watches hold the switch.
- Added v0.2.293-297 Windows setup: Inno Setup `.installer/oc.installer.iss` installs to `%LOCALAPPDATA%\Programs\oc` with PATH, one self-contained setup exe; WPF companion `.installer/ocSetup` ("oc dependencies", engine `oc oc deps` JSON/NDJSON) with Required/Default tags, completion view, WezTerm-targeted shortcuts, prefetched downloads plus a parallel non-PATH lane, desktop shortcut column, software rendering (VM glyph corruption), icon header and tag dots. `.runCompanion.ps1 -Fake`/`--dev` loop never writes shortcuts or starts oc. `install.ps1` and revive scripts install to the oc on PATH. Removed ocdebug script vestiges and Debug agents (FORK.md TODO).
- ERROR (archive14): ProgressBar `Value` binds TwoWay by default; bind read-only VM props `Mode=OneWay`. Codex desktop feed version mismatch and Claude desktop 0x80073D28 (needs admin) fixed in v0.2.295. Bun 1.4.2 Windows: two concurrent `fs.rename` of one source both fulfil; use exclusive `wx` create as a lock.
- Risk (archive14): ISCC/VM first-install checks pending for `DefaultAppDir`, compression dictionary, Inno uninstall of retargeted `.lnk`; Everything `/S` defaults unverified; failover ranking uses stale readings for unpolled accounts.
- MISTAKE (archive14): `sed -i` and inline python on project files (use Edit/Write). Adding a `keybind.ts` Definition needs `keybindDocs.ts` regen. Copying into a moved test folder created a file: `Test-Path -PathType Container` first.

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
- Since then: oc ships as two programs (`oc` with the background server, `opencode` in its own window); `oc single`, ocdebug, command markers, and `/work`/`/done` are gone. `/revive-single` test-builds native opencode, `/update` installs oc releases, and `/revive` restores WezTerm tabs.
- The sidebar usage block aligns percentages with reset times, lists each Claude account, marks the active one, shows `-` for idle 5-hour windows, and updates mid-turn. Claude accounts persist across restarts, can be switched from the palette, fail over even when a chat is pinned, can auto-resume after a reset, and can be warmed up on a schedule.
- Claude Code turns support mid-turn steering, commands keep Claude's own tools unless they limit them (`toolHost`), and web search follows agent rules. Queued prompts, `/btw`, `/reload`, built-in background shell, and per-task models are available.
- Agent files hot reload, and `/addSub`, `/rmSub`, `/viewSub` manage subagents. The palette is grouped under headings, has About, Update all harnesses, Clean up completed sessions, and themes are separate for oc and opencode.
- oc is public as a GitHub fork; the README is a short pitch and the wiki holds the user docs. agent-push titles sessions with the pushed commit hash and can delete them after you leave.
- The Usage menu has a usage calendar of upcoming resets and your own subscription dates. Prompts can be scheduled for later (Alt+S) in this session, a fork, or a new session, and agents can schedule prompts too. A Time palette entry sets the 12/24-hour clock and time zone for all of oc.
- Favorite models can be grouped into colored categories, the Subagents dialog is grouped by provider and model, and oc returns to the parent session when a watched subagent finishes.
- Claude Code warnings show as toasts, Esc no longer leaves old Claude turns running in the background, a message Claude cannot merge into its turn runs right after the current tool, and Claude's own worktree, cron and wakeup tools are off under oc.
- The chat no longer freezes on "esc interrupt" from a sidebar leak, Cursor shell commands work on Windows on the first try, and agent-push auto-delete only removes sessions that started with `/agent-push`.
- Since v0.2.225: memory leaks fixed, streaming text and code render smoother, startup loads less data, `/update` verifies downloads, and script launches can no longer run injected commands. Cursor reads, searches, and folder listings behave like oc's own tools.
- Ctrl+C no longer closes dialogs in the oc layout and copies the name in the rename dialog. A Notices list keeps every popup, a question reminder works for every provider, and Claude internals log quietly instead of popping up.
- Fast paste-then-Enter sends with the image. Subagents can be switched off per chat, show their context use in the prompt bar, and show live cards while they run; the Subagents menu sets general/explore model and reasoning.
- Chat links open on click in a chosen browser; slash-command messages show just the command names and your request; pasted text never runs commands; paste summary is off by default.
- Jev tools are built in, a stale wake-up no longer leaves a Claude chat giving blank replies, and a failed revive no longer leaves a hidden server running.
- The oc palette can set the WezTerm font, save warm-up schedule presets, and Esc goes back to where you were in every menu.
- Forked Claude chats keep their conversation, `/revive-single` closes the tab it ran from, and `/killall` stops every AI process with a report.
- Third-party updates show live progress and can auto-confirm, PowerShell can be updated from the palette, and a Beta daily theme rotates built-in themes.
- Agents can prefer a Claude login, `/stopSub` and Esc stop subagents without deleting them, and agent-push keeps titles of sessions it did not open.
- oc is synced through OpenCode v1.19.3: sharing is gone, `alt+return` only queues, and many CLI, TUI, tool, and MCP improvements arrived (see SCOPE.md for what was left for later).
- Subagents that recover from a tool error are no longer reported failed, OpenAI refusals show as text, image paste preview is off by default, and messages sent during a Claude command join its turn.
- When Claude reads a message mid-turn the reply splits there. In the oc layout Tab types a tab and Shift+Tab switches agents, or pick what Tab does with `/tabKey`. SuperPlan/SuperGo are gone.
- Claude failover picks the account with the most 5-hour usage left, can ask which account to use, and a manual account switch waits for running work. `/revive` can sit inside a chain of slash commands. Any palette entry can become a sidebar button (alt+p).
- oc has a Windows setup exe and an "oc dependencies" window that installs PowerShell 7, Git, Node.js, Everything, WezTerm, and the Codex, Claude, and Cursor apps, with optional desktop shortcuts.

# Historical entries (newest first)

---

## 2026-10-24 (~23:37) - v0.2.304 scrubyYogi - Shared TUI pane fixture for verify probes; probe and known-failure rules - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (/imp of plan `~/.config/opencode/plans/2026-10-24-verify-command.md` phases 1-3); completed
- Version: 0.2.304
- Moved `openPane`, `stopPaneChild`, `powershell`, `cimProcess` from `test/provider/claude-code/tuiPane.test.ts` to new `paneFixture.ts` (same folder); exported `openPane`, `paneReady`, `powershell`, `stopPaneChild`. Pure move: block diffed identical to the original (only `export` added)
- Changed `tuiPane.test.ts`: imports fixture, `describe.skipIf(!paneReady)`, keeps `sidebarColumn`
- Changed `AGENTS.md` `## Testing`: replaced "only run checks you edit or introduce" with pointer to principles + `verify` skill (no CI); added probe rule (`src/packages/<pkg>/test/tmp/verify/`, gitignored by `tmp`, delete after, `Test-Path`)
- Added known failures in `AGENTS.md`: tuiPane "an API error the CLI reports twice shows once" and "claude warm-up palette opens the schedule dialog" (3/3 runs); flaky "rewinding Claude shows the provider notice" (1/3)
- Note: user-level rule changes (principles Verification, `verify` skill, `/verify`, `/test-instructions`, `/agentTest`, `/imp`, `/pass`, `refinement`) logged in `C:\Users\Foster\buildNotes.md`
- TODO: plan phase 4, audit fork-added tests for change detectors; start with the two tuiPane failures
- Verification: `bun run typecheck` (opencode) exit 0. `OC_TUI_PANE=1 bun test test/provider/claude-code/tuiPane.test.ts` runs: 12/15, 13/15, filtered 1/3; failures above, all outside the moved code path. Probe `test/tmp/verify/paneSmoke.test.ts` 1 pass, screen capture had "Ask anything"; folder deleted, `Test-Path` False. Evidence `%TEMP%\verify\20261024-2328\`
- ERROR: tuiPane API-error case: CLI shows the next reply instead of `FAKE-BAD-REQUEST-81`; warm-up case: `Times` row never appears. Not investigated

### User
Testing
- The TUI test helpers now live in a shared file, so agents can write a short throwaway check that drives oc's real TUI instead of asking you to look.
- Agent rules now prefer throwaway checks over new permanent tests; no app change.

---

## 2026-10-22 (~23:26) - v0.2.303 basementMapper - ocSetup finishing screen, centered scroll bar, .NET 8/10 Desktop Runtime rows - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (plan `~/.config/opencode/plans/ocSetupFinishing.md`); completed
- Version: 0.2.303 basementMapper (unchanged: not committed since the bump)
- Added `ShowFinishing`/`SetFinishing`/`DoneLines` (`MainWindow.xaml.cs`): installs + shortcuts path shows the Done panel as "Finishing setup" (FinishingDots, "Creating desktop shortcuts") before the post-install reload; Back/Open oc disabled until `ShowDone`. `MainWindow.xaml`: heading + `FinishingDots` StackPanel, `BackButton` named
- Changed `FlatScrollBarStyle` Width 12 -> 8, thumb Margin `0,2`, bar Margin `12,0,0,0`: thumb centered 12/12 between panel and window edge (`theme/controls.xaml`)
- Added rows `dotnetRuntime8`/`dotnetRuntime10` (".NET N Desktop Runtime", DEV, admin, signer `.NET`) via `dotnetDesktopRuntime(major)`; `dotnetSdk10` -> `dotnetInstaller(channel, "sdk" | "desktopRuntime")` (desktop runtime = latest-release's `windowsdesktop` `windowsdesktop-runtime-win-x64.exe`); detection shares `dotnetVersions` (`--list-sdks` / `--list-runtimes` WindowsDesktop.App); `DOTNET_INSTALL_ARGS`
- Tests: lock table + no-shortcut list include the two runtime rows
- Docs: wiki Install.md dev list; oc-companion skill order + no-shortcut list
- Verification: `bun test test/dependencies.test.ts` 19 pass; tui typecheck exit 0; `buildCompanion.ps1` 0/0; dev and built `oc deps list`: dotnetRuntime8 found 8.0.32, dotnetRuntime10 found 10.0.13; `build.ps1 -Release` binaries + 2 basic checks OK; `buildInstaller.ps1` OK; overwrote `ocInstallerTest\oc_v0.2.303_windows-x64-setup.exe` (SHA256 5E88ED03...1414, hash match); TESTING.md updated. `dotnetInstaller` download URL resolution not exercised (no install run here); finishing screen not seen on screen
- ERROR: `build.ps1 -Release` zip step failed again (known, `zip` missing); my wrapper treated its throw as fatal, so the installer step was rerun separately

### User
ocSetup
- After installing with desktop shortcut boxes ticked, the window now switches straight to a "Finishing setup" summary while it re-checks apps and makes shortcuts, instead of sitting on the list.
- The scroll bar now sits evenly between the list panel and the window edge.
- New optional dev rows: .NET 8 Desktop Runtime and .NET 10 Desktop Runtime.

---

## 2026-10-22 (~23:06) - v0.2.303 basementMapper - ocSetup flat scroll bar outside the list panel - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (spit -> imp, plan in chat); completed
- Version: 0.2.303 basementMapper (unchanged: not committed since the bump)
- Added `ScrollPageButtonStyle`, `FlatScrollBarStyle` (12 wide, 8-wide rounded thumb, BorderSubtle -> BorderStrong on hover/drag, no arrows, track click pages) and `PanelScrollViewerStyle` (ContentPanelStyle border with Padding 0 + `PART_ScrollContentPresenter` in col 0, `PART_VerticalScrollBar` in an Auto col 1 bound to `ComputedVerticalScrollBarVisibility`) in `theme/controls.xaml`
- Changed `MainWindow.xaml` `ListPanel` from Border + ScrollViewer to one `ScrollViewer` with `PanelScrollViewerStyle`; panel padding moved to the inner StackPanel margin so rows scroll under the border; `ListPanel` name kept for `SetDoneVisible`
- Kept: base `theme/controls.xaml` not updated (same plain ScrollViewer there); port separately if wanted
- Verification: `buildCompanion.ps1` 0 warnings/0 errors; `buildInstaller.ps1` OK; overwrote `ocInstallerTest\oc_v0.2.303_windows-x64-setup.exe` (SHA256 EFF1F7D7...C37E, hash match), removed the `-c` copy; TESTING.md updated. Window not opened here (XAML resource errors would only show at load)

### User
ocSetup
- When the dependency list is taller than the window, a thin flat scroll bar appears to the right of the panel instead of the old Windows-style bar inside it.
- The panel narrows slightly only while the bar is shown, and the status text no longer touches the bar.

---

## 2026-10-22 (~22:34) - v0.2.303 basementMapper - ocSetup sections all open by default - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.303 basementMapper (unchanged: not committed since the bump)
- Changed `DependencySection` to start expanded (ctor `isExpanded` param removed); `ShowSections` no longer derives open state from required/default rows
- Removed the "required/default rows only in the first section" assertion from the section test (rule existed only for collapsed sections); contiguity check kept
- Docs: wiki Install.md, oc-companion skill
- Verification: `bun test test/dependencies.test.ts` 19 pass; `buildInstaller.ps1` OK; share copy of `oc_v0.2.303_windows-x64-setup.exe` locked (5 retries), staged as `-c` (SHA256 768956F2...30A6, hash match); TESTING.md updated
- ERROR: VM held `oc_v0.2.303_windows-x64-setup.exe` open again; `-c` copy staged

### User
ocSetup
- Every section of the dependency list now starts expanded; you can still collapse any of them.

---

## 2026-10-22 (~22:28) - v0.2.303 basementMapper - ocSetup taller default window - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.303 basementMapper (unchanged: not committed since the bump)
- Changed `MainWindow.xaml` Height 600 -> 840 (runtime + dev sections open); ctor clamps to `SystemParameters.WorkArea.Height` so small screens do not open off-screen
- Verification: `buildInstaller.ps1` OK; overwrote `ocInstallerTest\oc_v0.2.303_windows-x64-setup.exe` (SHA256 37E300B3...D5CD, hash match), TESTING.md updated; removed the earlier `-b` copy at the user's request

### User
ocSetup
- The dependency window opens taller, up to the height of the screen.

---

## 2026-10-22 (~22:24) - v0.2.303 basementMapper - ocSetup row text color fix + rename to oc Dependency Installer - Claude Opus 5.5, low effort; Debug

### Agent
- Meta: Claude Opus 5.5; low effort; Debug (user VM screenshot); completed
- Version: 0.2.303 basementMapper (unchanged: not committed since the bump)
- Fixed black row labels: the system Expander style sets Foreground to ControlTextBrush and rows inherit it; `SectionExpanderStyle` now sets `PrimaryTextBrush` (`MainWindow.xaml`)
- Renamed window title, crash MessageBox caption (`App.xaml.cs`), and Start menu shortcut (`oc.installer.iss`) to "oc Dependency Installer"; `[InstallDelete]` removes the old `oc dependencies.lnk` on upgrade; README, FORK.md, wiki Install.md, oc-companion skill updated
- Fixed `[UninstallDelete]` missing `scc.exe` (placed next to oc.exe by the new scc row)
- Verification: `buildInstaller.ps1` OK (companion publish + ISCC); staged `ocInstallerTest\oc_v0.2.303_windows-x64-setup-b.exe` (SHA256 A62D7C5D...AAC2, hash match) + TESTING.md; fix not seen on screen here
- MISTAKE: new Expander template did not set Foreground although the CheckBox and ToggleButton comments already named the system-color problem. Rule: any WPF control whose default style is kept needs an explicit Foreground in this window
- ERROR: VM share copy of `oc_v0.2.303_windows-x64-setup.exe` was locked; staged as `-b`

### User
ocSetup
- Row names in the dependency list are white again instead of black.
- The window and its Start menu shortcut are now called "oc Dependency Installer"; upgrading replaces the old "oc dependencies" shortcut.
- Uninstalling oc also removes scc.exe if the window installed it.

---

## 2026-10-22 (~22:15) - v0.2.303 basementMapper - ocSetup collapsible sections + dev and coding tool rows - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (/imp from plan `~/.config/opencode/plans/ocSetupSections.md`); completed, VM run pending
- Version: 0.2.303 basementMapper
- Added `section` to `Dependency`/`DependencyInfo`/`rowInfo` (`src/packages/tui/src/dependencies.ts`) and `DependencyItem.Section` (C#); label consts `RUNTIME`/`DEV`/`CODING`; existing 11 rows `RUNTIME`
- Added rows: DEV bun (bun.sh install.ps1, userPath), dotnetSdk (releases.json 10.0 latest-sdk win-x64 exe, signer `.NET`, `/install /quiet /norestart`, admin; detect `dotnet --list-sdks`, <10 = outdated), innoSetup (`githubAsset` tag `is-6_7_3` + digest + signer `Pyrsys B.V.`, `/ALLUSERS`; detect = buildInstaller.ps1 rule via `reg query` DisplayVersion >= 6.7, else ISCC on PATH), ghCli (MSI + digest + `GitHub, Inc.`), scc (zip -> `ocInstallDir`, no lock); CODING notepadPlusPlus (NSIS `/S`, signer `NOTEPAD++`, shortcut), githubDesktop (central.github.com -> desktop.githubusercontent.com, `--silent`, `GitHub, Inc.`, userPath, no shortcut box), vscode (update API url + sha256, `Microsoft Corporation`, `/MERGETASKS=!runcode`, userPath, shortcut via `vscodeExe`)
- Added `githubAsset(..., releasePath)` for pinned tags; `ocInstallDir(tool)` shared by es.exe and scc; INSTALL_SCRIPT exe branch accepts 3010
- Added `viewModels/DependencySection.cs` (IsExpanded, Rows, tri-state AllChecked, Refresh, SelectAll); `MainWindow.ShowSections` keeps sections across reloads, new section opens only if it holds a required/default row; removed `SelectAllBox` and `RefreshSelectAll` body; `SectionSelectAll_Click`
- Moved row DataTemplate to `RowTemplate` resource; added `SectionExpanderStyle` (CheckBox + `HeaderSite` ToggleButton siblings, chevron rotates, name at x=80); `ChevronIconGeometry` in `theme/icons.xaml`
- Tests: lock table + no-shortcut list extended; new test: sections contiguous in order and required/default rows only in the first section
- Docs: wiki `Install.md` step 3 (sections); oc-companion skill (contract `section`, order, signers, open items)
- Verification: signer CNs checked on downloaded installers in a temp dir (all Valid; VS Code sha256 matched API); `bun test test/dependencies.test.ts` 19 pass; tui typecheck exit 0; `buildCompanion.ps1` 0 warnings/0 errors; built `oc.exe oc deps list` detects all 19 rows with sections; `buildInstaller.ps1` OK; staged `ocInstallerTest\oc_v0.2.303_windows-x64-setup.exe` (SHA256 1DEAADB0...2A97) + TESTING.md. Window not opened here; UI checks are in TESTING.md
- MISTAKE: `sed -i` on dependencies.ts in Git Bash converted CRLF to LF and missed its pattern; restored with `git checkout` (own change only). Use Edit for repo files
- ERROR: `build.ps1 -Release` still fails at the release zip step (`bun: command not found: zip`) after both binaries pass; installer unaffected
- Risk: GitHub Desktop `--silent` behavior (auto-launch, own shortcut, PATH) unverified until the VM run

### User
ocSetup
- The "oc dependencies" list is now split into three sections you can open and close: oc Runtime Dependencies (open), oc Dev. Work Dependencies and Basic Coding Tools (closed).
- Each section has its own Select all box; the single Select all at the top is gone.
- New optional rows: Bun, .NET 10 SDK, Inno Setup 6, GitHub CLI and scc for building oc, and Notepad++, GitHub Desktop and VS Code.
- Notepad++ and VS Code can get a desktop shortcut from the shortcut column; GitHub Desktop makes its own.

---

## 2026-10-22 (~21:50) - v0.2.302 krankenwagenAppointment - ocSetup Select all for installs and shortcuts - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (after /spit plan); completed, not built
- Version: 0.2.302 krankenwagenAppointment
- Added `SelectAllBox` under the header icons in `.installer/ocSetup/windows/MainWindow.xaml`; header icons and it are wrapped in `ListHeader` (was `HeaderIcons`), shown in `ReadRowsAsync`. Label sits on the row label column via a 56 margin.
- Added `SelectAllBox_Click` in `MainWindow.xaml.cs`: sets `IsChecked` on `CanCheck` rows first, then `WantsShortcut` on `CanShortcut` rows (a missing row's shortcut box opens only once ticked). Uses Click, not Checked/Unchecked, so programmatic sync does not loop.
- Added `RefreshSelectAll` (called from `RefreshButtons`): true when every tickable box is ticked, false when none, null between; disabled while loading/running or with nothing tickable. Locked required rows are not `CanCheck`, so clearing leaves them ticked.
- Added a dash mark + `IsChecked={x:Null}` trigger to the shared CheckBox template for the partial state.
- Verification: `.scripts\buildCompanion.ps1` builds (0 warnings, 0 errors) after one fix. Not run; dev run `.scripts\.runCompanion.ps1 -Fake` pending.
- MISTAKE: put the Dash Path beside Mark directly in the template's Border (MC3089, Border takes one child); wrapped both in a Grid. Rule: build XAML template edits before handoff.

### User
ocSetup
- The dependency list has a "Select all" box that ticks every install and every desktop shortcut it can, and clicking it again clears them.
- The box shows a dash when only some are ticked, and required rows stay ticked when it is cleared.

---

## 2026-10-22 (~20:44) - v0.2.301 lasersFtw - Esc stops the main turn first, then its subagents - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed. Plan: `~/.config/opencode/plans/escStopsSubagents.md`
- Version: 0.2.301 lasersFtw (bumped earlier this session, uncommitted; no second bump)
- Cause: prompt `session.interrupt` enabled only while the root was busy (Esc dead with idle root + working background subagent); when it ran, `SessionPrompt.cancel` cascaded to all children and `cancelBackgroundJobs` killed every descendant job, so the main turn could not stop alone.
- Added `SessionRunState.CancelOptions { keepBackground }`; `SessionRunState.cancel` / `SessionPrompt.cancel` take it. keepBackground skips the child cascade and skips jobs with `metadata.background === true` (incl. promoted); the turn's foreground task jobs still cancel (and cascade via task onInterrupt). Default unchanged for `/undo`, `/stopSub`, child Stop, ACP, workspace warp, TaskPromptOps.
- Added abort query `keepBackground` (`AbortQuery`, `QueryBoolean`) in `httpapi/groups/session.ts`; handler passes it. Regenerated SDK v2 via `sdk/js/script/build.ts` (diff: description + `keepBackground?: "true" | "false"` only). Note: `packages/client` generate does not cover the TUI SDK; `sdk/js` build does.
- Changed `tui/src/component/prompt/index.tsx`: `busyChildren` memo; Esc enabled when root busy or a direct child busy; second press aborts root with `keepBackground: "true"` if busy, else full-aborts each busy child (error toast on failures). New footer hint `esc stop subagents` / `esc again to stop subagents` for idle root + busy children.
- Removed dead v0.2.301 `MessageAbortedError` -> "Subagent stopped by the user" wording in `task.ts` and its test: aborting a child always cancels its own job first (`cancelBackgroundJobs` matches job id = session id), so runTask never reached it and no parent notice is sent.
- Verification: `test/tool/task.test.ts` 45 pass (new keepBackground job test); `test/server/httpapi-session.test.ts` 22 pass (abort `?keepBackground=true` 200, `=yes` 400); `bun run typecheck` opencode + tui clean.
- Added pane test `tuiPane.test.ts` "Esc stops a busy main turn alone, then its background subagent" (fake Claude main + background subagent on `test/test-model`): asserts sidebar stays `. working` with `esc stop subagents` after stage 1, `. stopped` after stage 2, no third Claude request. Passes (18.8 s). `openPane` now sets `TYPESAFE_API_KEY: ""` so a host key cannot send subagent briefs to TypeSafe.
- User live run (grok, deepseek free, luna, haiku subagents): log shows `cancel keepBackground=true` on the root then a separate child cancel in all four; no extra parent turn.
- ERROR (baseline, not caused here): full `OC_TUI_PANE=1` run 13/15; "an API error the CLI reports twice shows once" (fake 400 never rendered, CLI moved on to the next queued reply) and "claude warm-up palette opens the schedule dialog" (dialog closes after Down Down Enter, `Times` never shows) fail on rerun too. Neither touches the Esc/subagent paths; baseline at v0.2.300 not run.
- MISTAKE: v0.2.301 entry and report claimed the parent gets a "stopped by the user" notice; never verified the job-cancel order. Rule: trace cancel paths through `cancelBackgroundJobs` before promising notice behavior.

### User
Subagents
- In the main chat, Esc Esc while the agent is working stops only the main turn; background subagents keep running.
- Esc Esc again, or any time the main chat is idle while subagents work, stops those subagents; the footer shows "esc stop subagents".
- Subagents the main turn was waiting on directly still stop together with it.
- Stopping a subagent no longer claims the main agent is told about it; the main agent gets no notice and is not woken.

---

## 2026-10-22 (~20:26) - v0.2.301 lasersFtw - Stop one subagent: task_cancel tool and Esc/Stop in the child view - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed. Plan: `~/.config/opencode/plans/subagentCancel.md`
- Version: 0.2.301 lasersFtw
- Cause: nds Opus parent could not stop its background Haiku task: no oc tool reached `BackgroundJob.cancel`; Claude `TaskStop` only sees Claude jobs; child view mounts no Prompt so Esc (`session.interrupt`) did nothing there.
- Added `tool/taskCancel.ts` `task_cancel(task_id)`: owner check (`parentID === ctx.sessionID`), reads job status first (cancel() returns a finished job's old snapshot), then `background.cancel`; job `onInterrupt` cancels the child. No parent notice (cancelled jobs are not injected). Registered in `tool/registry.ts`.
- Added `Permission.disabled` mapping `task_cancel` -> `task` permission.
- Added Claude proxy def `task_cancel` (`proxyToolDefs.ts`), map entry (`proxyToolSelection.ts`), rides along with `task` (`spawnPlanning.ts`), read-only deny (`permissionPresets.ts`), dispatch hint bullet (`prompts.ts`). Kept Claude `TaskStop` enabled (kills Claude's background Bash).
- Changed `task.ts`: background started/updated text names task_cancel; child `MessageAbortedError` now fails as `Subagent stopped by the user (task_id)` instead of `Subagent failed`.
- Added TUI `session.child.stop` (keybind `session_child_stop`, default escape, double press within 5 s, armed state keyed by session) and Stop button in `routes/session/subagent-footer.tsx` (busy only; click stops at once). Sidebar `stopped` label (muted, idle) for aborted children; sessionFailed still wins.
- Regenerated `docs/keybinds.md` via `script/keybindDocs.ts`.
- Verification: `test/tool/task.test.ts` 45 pass (3 new); claude-code `proxyTask`, `proxyMcp`, `permissionPresets`, `subagentHint` 123 pass; `test/permission/next.test.ts` 82 pass; tui `test/sidebarSubagents.test.ts` 5 pass; `bun run typecheck` opencode + tui clean. Live TUI/Claude check not run.
- Risk: Esc in child view assumes no other session-route escape binding; dialogs guarded via `dialog.stack`.

### User
Subagents
- Agents can now stop a background subagent they started, including Claude agents, which are told to use it instead of TaskStop.
- In a subagent's own view (or its tab), press Esc twice or click Stop in the footer to stop just that subagent; the parent and other subagents keep running.
- A subagent you stopped shows as "stopped" in the sidebar, and the parent agent is told it was stopped by you rather than that it failed.

---

## 2026-10-22 (~20:08) - v0.2.300 barnesTexture - Context-limit handoff opens a top-level session, not a subagent - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed. Plan: `~/.config/opencode/plans/handoffTopLevel.md`
- Version: 0.2.300 barnesTexture
- Cause: `SessionHandoff.finish` created the child with `parentID: fromID`; TUI keys subagent behavior on parentID (`routes/session/index.tsx:289` hides prompt input, `dialog-session-list.tsx` hides it, subagent footer/notifications, `setIdle` skips it). Seen on nds session `ses_e9d1bb69bffefZKDLKhTgFThpz` (claude-code limit action is `handoff`).
- Fixed `session/handoff.ts` `finish`: no parentID (link stays in `ocHandoffFrom` metadata); moves in-progress mark origin -> child via `setSessionInProgress`.
- Fixed `handoffTitle`: strips an existing `Handoff: ` prefix so chained handoffs do not stack it.
- Simplified `canAutoHandoff` guard (pass): non-handoff sessions return `!parentID`; same behavior, subagents still blocked, handoff sessions (legacy parented ones too) identified by metadata.
- Updated `test/session/handoff.test.ts`: asserts no parentID, de-duplicated title, in-progress moved.
- Kept existing parented handoff session as-is (no migration); optional manual DB repair in the plan.
- Verification: `bun test test/session/handoff.test.ts` 4 pass, 0 fail; `bun run typecheck` (opencode) clean. Live handoff not run.

### User
Context limit
- When a session hands off at the context limit, the new session is a normal session: you can type in it and it appears in the session list.
- The old session stops showing as in progress and the new one shows as in progress.
- A second handoff no longer titles the session "Handoff: Handoff: ...".

---

## 2026-10-22 (~19:54) - v0.2.299 deactivatedZippo - Update all: no wait after Appx installs; PowerShell MSI no longer kills oc - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (plan `~/.config/opencode/plans/updateAllPwshAndDelay.md`); completed; live checks pending (user)
- Version: 0.2.299 deactivatedZippo
- Found (event logs, 2026-10-22 run): `Windows PowerShell` 400/403 show Claude's script ran 85 s and ChatGPT's 195 s after "Updated", process exit/close instant; the only code there was `Remove-UpdateDir` (same held-MSIX delete hang as `dependencies.ts` removeRunDir comment). RM 10006 on pid 7236 (`pwsh -NoExit -Command oc`) at 19:35:11, oc log `global event disconnected` 19:35:13: RM shutdown attempt (Ctrl+C to the console) killed the TUI; `DisableShutdown` does not apply to RM-authored MSIs.
- Changed `runDesktopInstall` (`desktopUpdate.ts`): `script: (dir) => string`, optional `dir`; without one it makes `%TEMP%\oc-<key>-update-*` and `void removeRunDir` after the result (2 s cap, then hidden retry handoff).
- Moved `removeRunDir`/`removeDirLater`/`REMOVE_DIR_LATER_SCRIPT`/limits from `dependencies.ts` to `desktopUpdate.ts`; dependencies imports it.
- Replaced `ScriptPrepare`/`$PrepareDir`/`UPDATE_DIR_HELPERS` with `ScriptWork` -> `$WorkDir`, `$PrepareOnly`, `$Prepared`; 4 scripts (Claude, ChatGPT, Cursor, pwsh) dropped New/Remove-UpdateDir and try/finally; download guard `if (-not $Prepared)`.
- Changed pwsh msiexec `MSIRESTARTMANAGERCONTROL=DisableShutdown` -> `Disable` (`pwshUpdate.ts`), header comment says why.
- Added `Write-OcStep "installing"` after the UAC prompt returns (pwsh, `Install-MsixElevated`).
- Fixed `updateAllHarnesses`: confirmed items show `waiting` instead of `awaiting confirm` until their turn.
- Added test `installs in its own temp folder and removes it` (`desktopUpdate.test.ts`); fake script uses `$WorkDir`/`$Prepared`; removeRunDir test imports from desktopUpdate.
- Updated oc-companion skill (WorkDir contract).
- Verification: tui `bun run typecheck` exit 0; `bun test test/desktopUpdate.test.ts test/dependencies.test.ts test/updateProgress.test.ts` 46 pass; real read-only checks of all 4 scripts report up to date. Not run: a real Appx/pwsh install (nothing to update); `Disable` reaching the RemoveExistingProducts session unverified (VM test in plan).
- Leftover from the killed run: `%TEMP%\pwsh-update-51ca6f428dd84a33b4b3bed20b7f8c2b` (117 MB), not deleted.

### User
Third party harness updates
- Claude and ChatGPT desktop updates finish right after "Updated" instead of waiting 1-3 minutes on temp file cleanup, which now happens in the background.
- Updating PowerShell no longer closes oc when oc runs inside a PowerShell window; open PowerShell windows may need a Windows restart to finish the update.
- After you confirm Update all, items not yet started say "waiting", and the status switches from "needs admin approval" to "installing" once you approve.

---

## 2026-10-22 (~05:57) - v0.2.298 mortadellaBoners - VM runs 6-7 confirmed; temp debug logging removed - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (plan `~/.config/opencode/plans/ocSetupVmRun5Fixes.md` Issue 3); completed; final VM run pending
- Version: 0.2.298 mortadellaBoners (not bumped again; already bumped since last commit)
- Run 6 (`logs\run6`; `logs\run6-stale` was the old 04:35 exe): 11/11 done, engine exit 4.4 s after the last row (2 s cleanup cap + 2.4 s launcher), ChatGPT `found 26.1016.6573.0`. Cleanup result unchecked (VM reverted).
- Run 7 (`logs\run7`, same exe): 11/11, exit 3.2 s after last row; `ocSetup-cleanup.log`: `oc-deps-* removed at try 1 after 3 s`; `%TEMP%` had no `oc-deps-*` after 5 min. Holder never queried (first retry succeeded), so the cause stays unknown and does not matter.
- Removed engine debug logging (`dependencies.ts`): `DEBUG`/`debugLine` and every call, Restart Manager holder query, cleanup log. `removeRunDir` row-by-row removal + 2 s cap + `removeDirLater` handoff kept.
- Removed ocSetup trace logging: `helpers/DebugLog.cs` deleted; `App.xaml.cs` start/args/OnStartup/exit lines and `StartStallProbe`; `MainWindow.xaml.cs` ctor/loaded/closing/install/shortcut/open oc/rows rendered/table bound/run/pid/stdout/exit lines, `OC_DEPS_DEBUG`, `ReadErrorAsync` (stderr back to `ReadToEndAsync`); `OcLauncher.cs` retarget line. Kept: 20 fps `Timeline` cap, 100 ms tooltips, `_DRAIN_MS` exit + drain.
- Added `helpers/ErrorLog.cs` (`%TEMP%\ocSetup-error.log`): crash (message box names it), unobserved task, failed shortcut retarget. Deviation from plan's crash-only `ocSetup-crash.log`: the retarget catch would otherwise be silent, so the file is named for errors.
- Removed `.installer/oc.installer.iss` `SetupLogging=yes` and `DeinitializeSetup` desktop log copy.
- Updated oc-companion skill (errors line, ChatGPT latest, run 7 result, open item removed) and oc-installer skill (desktop log pattern now historical).
- Verification: `bun test test/dependencies.test.ts test/desktopUpdate.test.ts` 38 pass; `bun run typecheck` exit 0; `.scripts\buildCompanion.ps1` 0 warnings 0 errors; `git grep "WIP: temp debug" -- .installer src/packages/tui` none. Not run: `.runCompanion.ps1 -Fake` (GUI).
- Built final VM package: `build.ps1 -Release` binaries basic checks pass (known zip-step exit 1), `buildInstaller.ps1` OK; staged as `ocInstallerTest\oc_v0.2.298_windows-x64-setup-final.exe` (SHA256 C2F22473...CD04) because the run 7 exe in the share stayed locked (5 retries); TESTING.md names the `-final` file.

### User
Dependency setup
- Run 7 on a fresh VM confirmed the leftover ChatGPT download is deleted in the background a few seconds after setup finishes.
- The setup and the dependency window no longer write debug logs to the desktop.
- If the dependency window crashes, its error box points at `ocSetup-error.log` in your temp folder.

---

## 2026-10-22 (~05:27) - v0.2.298 mortadellaBoners - Stuck temp cleanup retried in background; ChatGPT latest = direct MSIX - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (imp of plan `~/.config/opencode/plans/ocSetupVmRun5Fixes.md` Issues 1 + 2); completed; Issue 3 (remove temp debug logging) waits for VM run 6
- Version: 0.2.298 mortadellaBoners (already bumped this session series; not bumped again)
- Changed `removeRunDir` (`src/packages/tui/src/dependencies.ts`): `CLEANUP_LIMIT_MS` 10 s -> 2 s; timeout or thrown removal (was swallowed, folder left) now awaits `handOff(dir)`. `remove`/`handOff` injectable for tests; exported.
- Added `removeDirLater` + `REMOVE_DIR_LATER_SCRIPT`: short non-detached powershell.exe launcher runs `Start-Process powershell.exe -WindowStyle Hidden ... Invoke-Expression $env:OC_CLEANUP_SCRIPT`; retry loop 60 x 5 s `Remove-Item -LiteralPath -Recurse -Force`. Launch waits `LAUNCH_LIMIT_MS` 5 s max. Start-Process (ShellExecute) inherits no handles, so ocSetup's pipes are not held.
- ERROR: Bun 1.4.2 `spawn(..., { detached: true })` of powershell.exe or pwsh.exe exits 0 at once without running the command (any stdio, with or without windowsHide); cmd.exe works. Never use Bun `detached` for PowerShell; use the Start-Process launcher.
- Added WIP Restart Manager holder query (`Add-Type` `OcRestartManager`, `RmStartSession`/`RmRegisterResources`/`RmGetList`) on the first failed try, plus outcome lines, to `Desktop\ocSetup-cleanup.log` only with `OC_DEPS_DEBUG`. Separate file so it never contends with ocSetup's log. Remove with Issue 3.
- Fixed `chatgptDesktopUpdate.ts`: latest = `x-ms-meta-package_version` from a HEAD of `ChatGPT-<arch>.msix` (identity `OpenAI.Codex` and `x-ms-meta-architecture` pinned, fail closed). Dropped Store feed `windows-store-update.json` (buildVersion 26.1016.8120.0 vs file 26.1016.6573.0 made a fresh install read outdated). Downloaded manifest version must now equal latest ("Latest version changed ... confirm again"), replacing the newer-than-installed check from the archive14 fix.
- Added test `removeRunDir hands a stuck or failed folder off instead of waiting` (`test/dependencies.test.ts`).
- Updated oc-companion skill (cleanup handoff, cleanup log). Plan status updated. Decided: keep crash-only logging permanently in Issue 3.
- MISTAKE: `sed -i` in Git Bash turned `test/dependencies.test.ts` CRLF into LF; restored CRLF. Use Edit for project files, never sed -i.
- Verification: `bun test test/dependencies.test.ts` 18 pass; `bun run typecheck` clean; `checkChatgptDesktop()` on this PC: up to date 26.1016.6573.0; PS 5.1 HEAD headers read case-insensitively (x64 and arm64 metadata present); live check with a file held open (FileShare None): engine returned in 2.6 s, log named `PowerShell 7 (pid 3184)`, folder removed at try 2 after 5 s. Not run: buildCompanion, VM run 6.

### User
Dependency setup
- The summary now shows about 2 seconds after the last row instead of waiting up to 10 seconds on a temp file that cannot be deleted yet.
- A leftover download folder (such as the 930 MB ChatGPT installer) is now deleted in the background within a few minutes instead of staying in your temp folder.
- ChatGPT desktop no longer shows "outdated" right after installing; it compares against the version that can actually be downloaded.

---

## 2026-10-22 (~04:58) - v0.2.298 mortadellaBoners - Run end no longer waits on temp cleanup - Claude Opus 5.5, low effort; Debug

### Agent
- Meta: Claude Opus 5.5; low effort; Debug; completed
- Version: 0.2.298 mortadellaBoners
- Run 4 (VM): all 11 rows done in 133 s from Install (run 3: 256 s, run 2: 680 s), Claude Code CLI via npm 8 s, Cursor CLI 12 s (was 111 s), node first; summary still never shown
- Found: engine logged `all settled` at +133 s, never `run end`, so it hung in `runInstalls`' `finally` after `prefetch.done` (all prepares had emitted ready): removing the run folder. Local Bun 1.4.2 `rm` threw EBUSY at once in every case tried, so the VM blocker is something not reproduced here (likely a provisioned MSIX or a file an elevated process holds)
- Added `removeRunDir` + `CLEANUP_LIMIT_MS` 10 s (`dependencies.ts`): removes row folders one by one with WIP `cleanup <row> at <ms>` lines, races a 10 s abortable `sleep`, then returns; `process.exit` ends a still-pending removal. Leftover: one `%TEMP%\oc-deps-*` folder
- Verification: `bun test test/dependencies.test.ts` 17 pass (no added delay, so the abort works); `bun run typecheck` exit 0; timeout path not exercised locally (no hang to reproduce)
- TODO: run 5 log names the blocking row folder; decide then whether to delete that file earlier or leave it

### User
Dependency window
- The install summary no longer waits forever after the last row finishes; it shows within about 10 seconds even if a temp file cannot be removed yet.

---

## 2026-10-22 (~04:31) - v0.2.298 mortadellaBoners - Taller dependency window - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.298 mortadellaBoners
- Changed `MainWindow.xaml` Height 520 -> 600: during installs each row with a progress bar grows ~9 px, so 11 rows overflowed into a scrollbar on the VM (run 4 screenshot)
- Verification: `buildCompanion.ps1` 0 errors; not visually checked; not in the staged run 4 installer (next build)

### User
Dependency window
- The window is taller, so all rows and their progress bars fit during an install without scrolling.

---

## 2026-10-22 (~04:24) - v0.2.298 mortadellaBoners - Fixes from VM run 3: Claude Code via npm, ready-first installs, run end - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed; plan `~/.config/opencode/plans/ocSetupVmRun3Fixes.md`
- Version: 0.2.298 mortadellaBoners (already bumped this session)
- Run 3 (VM): 256 s Install to last row (run 2: 680 s); summary never shown (no engine `exit` logged for 53 s after the last row); Claude Code CLI failed on GCS egress quota (2nd run in a row); Cursor CLI 110 s; node sat ready 49 s behind pwsh's download; Appx exit/close delay gone
- Changed claudeCli in `dependencies.ts`: `npm install -g @anthropic-ai/claude-code` (documented, same native binary via optional dep, auto-updates); needs node (was git). Added `npmGlobalInstall` (codexCli shares it) and `Lock` `"npm"` on both rows
- Changed scheduler in `runInstalls`: ready-first; a row waits for locks only after needs + download, takes all locks at once when free and no earlier waiting row shares one (`acquire`/`release`, `held`, `waiting`); replaces per-lock queues
- Changed `INSTALL_SCRIPT` ps1 branch: `-Command` with `$ProgressPreference='SilentlyContinue'` inherited, `& '<file>'; exit $LASTEXITCODE`. Measured: Cursor's 78 MB zip 22.1 s with progress vs 2.9 s without (PS 5.1, hidden, piped). Difference from -File: a trailing failing native command now fails the script
- Changed run-dir cleanup to non-fatal (`rm` EBUSY logged, not thrown). Measured: Bun 1.4.2 `rm` recursive force throws EBUSY at once (file without share-delete, folder as cwd), no hang; so the run 3 hang was not `rm`
- Changed `RunEngineAsync` (`MainWindow.xaml.cs`): ends on engine process exit + `_DRAIN_MS` 2 s drain, not stdout EOF; logs "stdout still open after the engine exited" (WIP) to show a pipe leak next run
- Added WIP OCDEBUG `<label> spec <ms>`, `all settled`, `run end, cleanup <ms>`. Removed exit/close OCDEBUG in `cliUpdate.ts` and all OCTRACE lines (`desktopUpdate.ts`, `chatgptDesktopUpdate.ts`)
- Tests: lock pin (npm), "a row still downloading does not hold up a later ready row", renamed starvation test; first scheduler test order (git start before codexCli skipped)
- Updated `oc-companion` skill (locks, scheduling, npm Claude, drain)
- Verification: `bun test test/dependencies.test.ts test/desktopUpdate.test.ts` 37 pass; `bun run typecheck` exit 0; `buildCompanion.ps1` 0 errors; ps1 wrapper checked in PS 5.1 (path with `'`, exit 3, Write-Error -> 1, progress off); fake install all 11 rows 13.1 s, schedule correct; release build + installer, staged SHA256 38911F0E...4964 with TESTING.md for run 4. Not run: real npm Claude install (VM run 4)
- ERROR: `build.ps1 -Release` still fails at the zip step (`bun: command not found: zip`, build.ts:269) after both basic checks pass; installer unaffected
- TODO: run 4 decides the hang cause (engine `run end` line vs "stdout still open"); then remove remaining WIP debug logging

### User
Dependency window
- Claude Code CLI now installs through npm instead of Anthropic's install script, whose download server failed in the last two test runs.
- Installs whose download is done no longer wait behind ones still downloading, so Node.js and the tools that need it start much sooner.
- Cursor CLI installs faster: its download no longer runs with the slow PowerShell progress bar.
- The window finishes the run when the installer engine exits, so the summary and desktop shortcuts appear.

---

## 2026-10-22 (~03:57) - v0.2.298 mortadellaBoners - Dependency installs: all downloads up front, lock-based scheduling - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed (VM run 3 pending, user)
- Version: 0.2.298 (session bump, uncommitted)
- Plan: `~/.config/opencode/plans/ocSetupOrchestration.md`. VM run 2: 680 s Install→done, all serial; ~175 s of downloads inside install turns; 233 s between the Appx scripts' "Updated" line and process close; cursorCli 115 s; claudeCli failed (Anthropic GCS egress quota).
- Changed `runInstalls` scheduler: `Dependency.parallel` -> `locks: Lock[]` (`"admin" | "userPath"`). A row starts when its selected needs settled, its download is ready, and it heads every lock queue (table order; `turn`/`leave` + one `changed` signal). Lock table pinned by test (node holds both; codexCli none). `PREFETCH_LIMIT` 3 -> 4.
- Added prepare/install split to the 4 harness scripts: `scriptModeLines(..., prepare?)` adds `$PrepareDir`/`$PrepareOnly`; `UPDATE_DIR_HELPERS` (`New-UpdateDir`/`Remove-UpdateDir`); scripts print `PREPARED <latest>` and exit before installing; install reruns with `$ExpectedVersion = <latest>` and skips Save-Download. `prepareDesktopInstall` + `prepareClaudeDesktop`/`prepareChatgptDesktop`/`prepareCursorDesktop`/`preparePowershell` replace the `install*Latest` exports (only `oc oc deps` used them). TUI update menu path unchanged (prefix lines empty/false).
- Changed Everything to `prepareEverything` (downloads app + es zip ahead); removed `runInstaller`. `harnessPrepared` wraps harness prepares. Moved `psString` to `desktopUpdate.ts` (re-exported from dependencies).
- Added vendor `ps1` retry once after 15 s (`VENDOR_RETRY_MS`) and `scriptErrorRecord` (vendor error record as the failure message, 200 chars).
- Added WIP diagnostics: `runCliCommand` logs `exit` vs `close` under `OC_DEPS_DEBUG`; `OCTRACE provisioned/registered/cleaned up` lines in `Install-MsixElevated` and the two Appx scripts.
- Verification: tui tests (dependencies, desktopUpdate incl. new Windows PowerShell prepare round trip, updateProgress) 43 pass; tui typecheck 0; real read-only checks for Claude/ChatGPT/Cursor/pwsh OK; `depsDev --fake install` all 11: 12.6 s, admin chain serial, userPath chain after node, codexCli beside. Release binaries built (zip step fails, known); setup SHA 119E2B13... staged with TESTING.md (`logs\run3`).
- Risk: lock table infers node/Cursor/vendor-script user PATH writes from vendor defaults.
- TODO: from VM run 3 logs decide the Appx exit/close fix; then remove all WIP debug logging and `SetupLogging=yes`.

### User
oc dependencies window
- Every download starts as soon as you click Install, and installs that do not conflict now run at the same time, so a full install should take far less time.
- Admin prompts still appear one at a time.
- A failed Claude Code CLI install is retried once and shows the real reason when it fails.

---

## 2026-10-22 (~03:16) - v0.2.298 mortadellaBoners - Fixes from VM run 1: Codex desktop elevated, download retry, faster checks - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed (VM run 2 pending, user)
- Version: 0.2.298 (session bump, uncommitted)
- Plan/findings: `~/.config/opencode/plans/ocSetupVmRun1Fixes.md`, `ocSetupVmRun1.md`.
- Added `INSTALL_MSIX_ELEVATED` (`Install-MsixElevated`, `desktopUpdate.ts`) from Claude's elevated provisioning block; Claude and ChatGPT scripts both call it. Fixed codexDesktop 0x80073D28 on a fresh VM; removed its `parallel` (test pins `["codexCli"]`). TUI update menu now prompts UAC for ChatGPT too.
- Changed `Save-Download`: User-Agent (`... WindowsPowerShell/<ver> oc-setup`; HttpClient sent none, claude.ai gave 429) and retry for network errors/429/5xx, 3 attempts, Retry-After capped 30 s else 2 s/5 s, `OCSTEP: downloading retry N of 3 (...)`. Tests: `/flaky` 429 then OK, `/agent` UA required.
- Changed every `Signature check failed` throw (4 update scripts + `INSTALL_SCRIPT`) to include `$sig.StatusMessage`. Claude desktop `UnknownError` cause still unknown; read it from VM run 2.
- Changed detection: pwsh skips `checkPowershell` without `Program Files\PowerShell\7\pwsh.exe`; codex/claude desktop `appxMissing` (`%LOCALAPPDATA%\Packages\<family>`); cursorDesktop needs Cursor.exe in the per-user or Program Files folder. No Windows PowerShell start for missing rows.
- Changed `freshEnv`: two parallel `reg query` (HKLM Session Manager\Environment, HKCU\Environment; HKCU exit 1 = none) + exported `parseRegPath`/`expandEnv`; matched .NET `GetEnvironmentVariable` output exactly on the dev PC (4341 chars).
- Changed ocSetup: `RunEngineAsync` starts the engine via `Task.Run` (first oc.exe start blocked UI 683 ms on VM); App static ctor overrides `Timeline.DesiredFrameRate` default to 20 (software rendering; removed per-storyboard setting on dots).
- Changed `packages/opencode/script/build.ts`: `cursor-runtime` copy skips `test/` (dist now main.mjs + package.json).
- Verification: deps + desktopUpdate tests 33 pass (incl. 2 new Save-Download); tui/opencode typecheck exit 0; buildCompanion 0/0; dev `depsDev.ts list` statuses unchanged; build.ps1 -Release binaries basic checks passed (zip step fails, known); buildInstaller OK; staged setup SHA FB97F78F... + TESTING.md (run 2, `logs\run2`).
- ERROR: `build.ps1 -Release` zip step still fails (`zip` not found); not in scope.
- Risk: `appxMissing` assumes Windows creates the per-user Packages folder on registration (true for both on the dev PC); VM run 2 post-install list confirms.

### User
oc dependencies window
- Codex (ChatGPT) desktop now installs with an admin prompt, like Claude desktop, instead of failing.
- Downloads retry when a site rate-limits them.
- The dependency list finishes much faster on a new PC because missing apps are found without starting PowerShell.
- The window appears sooner the first time and stutters less during installs.
- The setup no longer installs Cursor runtime test files.

---

## 2026-10-22 (~02:58) - v0.2.298 mortadellaBoners - VM test logs on the desktop - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.298 (uncommitted bump from this session)
- Changed `.installer/ocSetup/helpers/DebugLog.cs`: log at `Desktop\ocSetup-debug.log`, `%TEMP%` only for `--dev` runs (user preference: VM logs on the desktop).
- Added WIP `DeinitializeSetup` in `.installer/oc.installer.iss`: copies the setup log (`{log}`) to `Desktop\ocSetup-install.log` with `CopyFile`.
- Updated skills `oc-installer` (desktop log rule, VM share is `Z:\Shared Folder\ocInstallerTest`) and `oc-companion` (log path, OCDEBUG).
- Rebuilt `.installer\Output\oc_v0.2.298_windows-x64-setup.exe` (ISCC 0 errors). Not copied to the VM share: the user's VM run was already using the earlier package (logs in `%TEMP%`); TESTING.md says so.
- Verification: installer compile succeeded; desktop logging not run (next VM pass).

### User
Testing
- Future test builds put their logs on the desktop (`ocSetup-install.log`, `ocSetup-debug.log`).

---

## 2026-10-22 (~02:49) - v0.2.298 mortadellaBoners - VM perf run instrumentation and setup build - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed (VM run pending, user)
- Version: 0.2.298 (already bumped this session, uncommitted)
- Added WIP `debugLine` in `src/packages/tui/src/dependencies.ts`: with `OC_DEPS_DEBUG` set, stderr `OCDEBUG +ms` lines for module load, list PATH dir count, per-row detect start/done (ms, status, version, message), install selection, per-install PATH refresh ms, and every non-event installer script line (OCERR, vendor output).
- Changed `MainWindow.RunEngineAsync`: sets `OC_DEPS_DEBUG=1`; `ReadErrorAsync` logs OCDEBUG lines as they arrive (`engine:`) and keeps them out of the returned error text.
- Added WIP log lines: `App` args, CPU count, memory, elevation at start; CPU ms and peak memory at exit; `Window_Closing` state.
- Removed depsDev `time`/`timed` OCTIME probes (replaced by engine `debugLine`).
- Added WIP `SetupLogging=yes` to `.installer/oc.installer.iss` (`%TEMP%\Setup Log <date> #NNN.txt`).
- Built `.scripts\build.ps1 -Release` (binaries 0.2.298 OK) and `.scripts\buildInstaller.ps1` -> `.installer\Output\oc_v0.2.298_windows-x64-setup.exe` (SHA256 0A7972E8...C6D4). Staged with `TESTING.md` in `D:\VirtualBox VMs\Shared Folder\ocInstallerTest` (+ `logs\`).
- Verification: tui typecheck exit 0; deps tests 12 pass; buildCompanion 0 warnings/errors; dev launch log shows `engine:` lines and empty stderr; built `oc.exe oc deps list` with OC_DEPS_DEBUG: table + 11 rows + 24 debug lines.
- ERROR: `build.ps1 -Release` exits 1 at the release zip step (`bun: command not found: zip`, `packages/opencode/script/build.ts:268`) after both binaries build and pass `--version`. Installer does not use the zips. Not fixed.
- TODO: after the VM logs, remove all `WIP: temp debug logging` perf probes and `SetupLogging=yes`.

### User
Testing
- The v0.2.298 setup with temporary debug logging is in the VM shared folder with a TESTING.md checklist.
- No UI change beyond the previous entry.

---

## 2026-10-22 (~02:37) - v0.2.298 mortadellaBoners - ocSetup streamed dependency list, fresh PATH, loading dots - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (stages: instrument + measure, plan, implement); completed
- Version: 0.2.298
- Findings and plan: `~/.config/opencode/plans/ocSetupPerf.md`, `ocSetupPerfPlan.md`. Time-to-rows was ~1.7-1.95 s; engine `list` ~75% of it. `freshEnv` powershell spawn (~230 ms) gated every detect; `which` sync ~20-47 ms/lookup on a 112-dir PATH; slow tails cursorCli ~850 ms, pwsh check 0.7-1 s, desktop checks ~0.55 s. Compiled `oc.exe oc deps list` 1.39-1.44 s vs bun source ~1.6 s (no engine-startup issue). ReadyToRun: -30 ms first frame, +15 MB: rejected. Published first launch +~280 ms before managed start (VM to confirm).
- Changed `src/packages/tui/src/dependencies.ts`: `listDependencies(deps, onRow?)` uses `process.env` (no `freshEnv`); new `printDependencyList(print, deps)` prints the table (status `checking`) then one line per row as detected; `rowInfo` shared builder; `DependencyInfo.status` adds `checking`. Install keeps `freshEnv` per row.
- Changed `DepsCommand` list (`packages/opencode/src/cli/cmd/oc.ts`) and `script/depsDev.ts` to `printDependencyList`.
- Added `.installer/ocSetup/helpers/FreshPath.cs` (Machine + User Path); `RunEngineAsync` sets engine `Path` from it; `OcLauncher.Open` reuses it.
- Changed `MainWindow.ReadRowsAsync`: `[` line = busy table rows, `{` line = `DependencyRow.Update`; after exit 0 rows unbusy, then defaults (`DefaultChecked` moved out of `CreateRows`). Failure or a row still checking = error text, rows stay busy (no install from unknown state).
- Changed `DependencyRow`: `Item` private set, `Update` (Notify all), `IsChecking`, run-failure text kept in `_runStatus` and shown once detected.
- Added `LoadingDotsStyle` (`MainWindow.xaml` resources, not `theme/controls.xaml` base copy): 3 dots, staggered opacity, runs only while visible (IsVisible trigger), 20 fps (software rendering). Bottom bar "Checking dependencies" + dots (`LoadingDots`, toggled in `LoadRowsAsync`); row status cell dots bound to `IsChecking`.
- Added WIP perf probes (keep until VM pass, then remove): `DebugLog` `+ms` since process start, `App.StartStallProbe`, MainWindow timeline lines, depsDev `time`/`timed` OCTIME stderr.
- Updated skill `~/.config/opencode/skills/oc/oc-companion/SKILL.md` list contract.
- Verification: `bun test test/dependencies.test.ts` 12 pass; tui + opencode `bun run typecheck` exit 0; `buildCompanion.ps1` 0 warnings/errors; `depsDev.ts list` = 1 table + 11 row lines; 4 dev launches (real read-only list): table bound 423-485 ms (before first frame 451-546), last row 1479-1579 ms, no post-load idle CPU. Dots animation not visually checked (GUI). Installs not run.
- Risk: startup UI stall 315-364 ms (was ~260) because table rows build in the first frame.

### User
ocSetup
- The dependency list now appears right away, and each row fills in its status as its check finishes.
- "Checking" text in the bottom bar and on each row has animated dots while the check runs.
- Checkboxes and Install unlock once every row is checked, with the same defaults as before.
- The dependency check starts about 230 ms sooner because it no longer starts PowerShell just to read PATH.

---

## 2026-10-22 (~02:45) - v0.2.297 stacheChamber - Pass: ocSetup icon/dot session - Claude Opus 5.5, low effort; Pass

### Agent
- Meta: Claude Opus 5.5; low effort; Pass; completed
- Version: 0.2.297 stacheChamber (no new bump; same session)
- Reviewed session diff (`App.xaml`, `App.xaml.cs`, `theme/icons.xaml`, `theme/controls.xaml`, `DependencyRow.cs`, `MainWindow.xaml(.cs)`): no stale keys (`InfoIconGeometry`, `TagBadge`, `InstallBox`, `TaggedLabel` gone), no dead code.
- Fixed wiki `oc.wiki/Install.md` step 3: "tagged Default" and "Desktop shortcut column" text replaced with filled dot / ring / monitor icon wording.
- Risk: `ToolTipService.InitialShowDelayProperty.OverrideMetadata` throws at startup if WPF ever seals FrameworkElement metadata first; unverified until a run.

### User
- The wiki install page now describes the dots and header icons in the dependencies window.

---

## 2026-10-22 (~02:35) - v0.2.297 stacheChamber - ocSetup rounded buttons - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.297 stacheChamber (no new bump; same session)
- Changed `.installer/ocSetup/theme/controls.xaml`: default Button border gets `CornerRadius="{StaticResource SmallCornerRadius}"` (3, same as checkboxes); NeutralButtonStyle 1 -> SmallCornerRadius so "Open oc and close" and "Close" match on the done screen.
- Verification: none run (XAML resource reference only). Not built or run.

### User
oc dependencies window
- Buttons have slightly rounded corners, matching the checkboxes.

---

## 2026-10-22 (~02:25) - v0.2.297 stacheChamber - ocSetup header icons switched to Lucide - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (user picked icons on lucide.dev); completed
- Version: 0.2.297 stacheChamber (no new bump; same session)
- Changed `.installer/ocSetup/theme/icons.xaml` from MDI fills to Lucide (ISC) stroke paths fetched from `lucide-icons/lucide` main: `download` (InstallIconGeometry), `monitor-dot` (ShortcutIconGeometry, circle rewritten as two arcs), `list-checks` (renamed InfoIconGeometry -> TagIconGeometry).
- Changed `MainWindow.xaml` header Path style: Stroke SecondaryTextBrush, width 2, round caps/joins, fixed 24x24 inside a Viewbox (keeps the SVG viewBox; Stretch would fit each icon to its own bounds). Effective stroke ~1.33 px at 16.
- Verification: `Geometry.Parse` (PresentationCore in pwsh) parses all three; bounds match the SVGs. MainWindow.xaml parses as XML. Not built or run.

### User
oc dependencies window
- The header icons are now thin line icons from Lucide: a download arrow for install, a monitor for desktop shortcut, and a checklist for the Required/Default column.

---

## 2026-10-22 (~02:10) - v0.2.297 stacheChamber - ocSetup faster tooltips, header waits for list - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.297 stacheChamber (no new bump; same session; earlier v0.2.297 entries in archive14)
- Changed `.installer/ocSetup/App.xaml.cs` static ctor: `ToolTipService.InitialShowDelayProperty.OverrideMetadata(typeof(FrameworkElement), 100)` (system hover time ~400 ms). In the static ctor so it runs before any element seals the metadata.
- Changed `MainWindow.xaml` header icons StackPanel to `x:Name="HeaderIcons"`, Collapsed; `ReadRowsAsync` shows it after `RowsList.ItemsSource` is set, so a failed list load leaves it hidden.
- Rotated buildNotes.md (1051 lines) to `buildNotes.archive14.md` verbatim.
- Verification: MainWindow.xaml parses as XML. Not built or run; `OverrideMetadata` throwing (metadata already sealed) would only show at startup.

### User
oc dependencies window
- Tooltips appear almost immediately on hover.
- The header icons appear together with the list instead of before it.

---
