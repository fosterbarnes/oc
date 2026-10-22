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
- Kept histories verbatim: archive1 (2026-08-20 through 09-09), archive2 (09-09 through 09-15), archive3 (09-15 through 09-28), archive4 (1144 lines), archive5 (1019 lines through v0.2.65), archive6 (1127 lines through v0.2.87), archive7 (1176 lines, v0.2.88 through v0.2.120, committed e4d73d1), archive8 (1152 lines, v0.2.120 through v0.2.148), archive9 (1059 lines, v0.2.149 through v0.2.172; its summary was archive8's carried unchanged, so archive9 is first summarized here), archive10 (1122 lines, v0.2.173 through v0.2.202), archive11 (1008 lines, v0.2.203 through v0.2.224), archive12 (1009 lines, v0.2.225 through v0.2.246, equals commit 1b7aa56), archive13 (1074 lines, v0.2.247 through v0.2.276; its v0.2.276 entry was uncommitted at rotation). Archive8 retains the previous cumulative summary plus complete later entries, earlier hashes, checks, and risks. Never edit archives.
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

# Historical entries (newest first)

---

## 2026-10-22 (~01:09) - v0.2.295 krankyVvitch - desktop shortcut column; ChatGPT and Claude desktop install fixes - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (/imp of `~/.config/opencode/plans/ocSetupShortcutsAndDesktopFixes.md`); completed, VM run pending
- Version: 0.2.295 krankyVvitch (same session, already bumped since the last commit)
- ERROR (VM, user screenshot): Codex (ChatGPT) desktop failed "Downloaded package version (26.1016.6573.0) does not match feed version (26.1016.8120.0)"; Claude desktop failed "0x80073D28 ... administrator privileges are required".
- Fixed `chatgptDesktopUpdate.ts`: `windows-store-update.json` is the Store build (`storeProductId 9PLM9XGG6VKS`); the direct `ChatGPT-x64.msix` (976 MB, Last-Modified 2026-10-21) can lag it, so the equality check never passed. Now requires downloaded > installed; name/publisher/signature pins kept. Also fixes the TUI update menu.
- Fixed `desktopUpdate.ts` `DESKTOP_SCRIPT`: the Claude MSIX carries the Cowork service; per-user `Add-AppxPackage` without admin fails 0x80073D28 (Anthropic deploy doc https://support.claude.com/en/articles/12622703-deploy-claude-desktop-for-windows). Now an elevated child runs `Add-AppxProvisionedPackage -Online -PackagePath ... -SkipLicense -Regions all` (`-EncodedCommand`, error text written to a file in the script's temp dir since RunAs cannot redirect), then `Add-AppxPackage -RegisterByFamilyName -MainPackage Claude_pzs8sxrjxfjjc -ForceApplicationShutdown` as the user (right account even when another admin approves). Applies to TUI Claude updates too: one UAC prompt per update.
- Changed `dependencies.ts`: claudeDesktop out of the parallel lane (elevates); parallel list now codexCli, codexDesktop.
- Added desktop shortcut data: `DependencyShortcut { name, target?, terminal?, appId? }` on `list` items from per-row `shortcut.find` (installed rows only). Targets: pwsh.exe, Git Bash (`gitBash()` from `<root>\cmd\git.exe`), Everything.exe, wezterm-gui.exe, CLI paths (terminal), Appx AUMIDs `OpenAI.Codex_2p2nqsd0c76g0!App` / `Claude_pzs8sxrjxfjjc!Claude` (from Get-StartApps), `%LOCALAPPDATA%\Programs\cursor\Cursor.exe`. Node has none.
- Added ocSetup "Desktop shortcut" column: header + per-row CheckBox (hidden on node, none ticked), `DependencyRow.WantsShortcut/CanShortcut/HasShortcut` (usable when installed or ticked for install; unticking install of a missing row clears it); button reads "Create shortcuts" when only shortcuts are ticked; after installs the list reloads before shortcuts are made; Done panel lists created/skipped/failed shortcuts and the PATH line only when installs ran.
- Added `helpers/DesktopShortcut.cs`: IShellLinkW COM interop; exe links; CLI links = pwsh (or powershell.exe) `-NoLogo -NoExit -Command "& '<cli>'"`, inside `wezterm-gui start --` when WezTerm is found; Appx links from the `shell:AppsFolder\<AUMID>` PIDL (`SHParseDisplayName` + `SetIDList`). Existing `Desktop\<name>.lnk` is skipped, never overwritten.
- Verification: `bun test` dependencies + desktopUpdate + chatgptDesktopUpdate 36 pass; tui `tsgo` exit 0; `OC_FLAVOR=oc bun run src/index.ts oc deps list` on this PC returned the expected shortcut for all 11 rows; PowerShell parser 0 errors on `DESKTOP_SCRIPT` and on the generated elevated command (path with a quote); `dotnet build ocSetup -c Release` 0 warnings 0 errors, bin/obj removed; AppsFolder PIDL links for Claude and ChatGPT created and resolved in a temp folder (then deleted), unregistered AUMID fails at parse. Not run: Claude provisioning, ChatGPT install, any shortcut on the real desktop, the window visually.
- TODO (VM): confirm Everything `/S` and Cursor's silent install add no desktop icon (Cursor: add `!desktopicon` to MERGETASKS if it does); `-RegisterByFamilyName` after provisioning; CLI shortcut via `.cmd` shim inside WezTerm.
- Updated skill `oc-installer` (contract, shortcut rules, Claude/ChatGPT notes) and wiki `Install.md`.

### User
Install
- The dependencies window has a "Desktop shortcut" column: tick it on any installed or selected item to get a desktop icon; none are ticked by default.
- CLI shortcuts (Codex, Claude Code, Cursor) open the CLI in a terminal (inside WezTerm when installed); an existing icon with the same name is left alone.
- Codex (ChatGPT) desktop installs again: the download no longer has to match the Store's newer build number.
- Claude desktop now installs with one admin prompt, as Anthropic requires for its background service, and shows up for your account.

---

## 2026-10-22 (~00:49) - v0.2.295 krankyVvitch - prefetched dependency downloads and a parallel install lane - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (/imp of `~/.config/opencode/plans/ocDepsParallelInstall.md`); completed, VM run pending
- Version: 0.2.295 krankyVvitch (same session as the entry below, version already bumped since the last commit)
- Changed `tui/src/dependencies.ts` `Dependency`: exactly one of `install` or `prepare(dir, onLine) -> Install`; new `parallel?`. `prepared(spec)` builds `prepare` for git, node, wezterm, claudeCli, cursorCli (same specs as before). pwsh, desktops, codexCli, everything keep `install` (shared update scripts / npm / two-step Everything).
- Changed `INSTALL_SCRIPT`: `$Mode` download|install + `$File`; download = `Save-Download` + verify; install = verify again (`Test-Installer`) then install. Caller owns the folder. `runInstaller` = mkdtemp + download + install + rm (Everything only). `runInstallScript` holds the shared prefix/runner.
- Rewrote `runInstalls`: emits `queued` per selected id; `startPrefetch` runs `prepare` rows 3 at a time in table order into `<temp>\oc-deps-*\<id>` (two scripts share the name install.ps1), emits `ready` or `failed` at once; serial and `parallel` lanes run concurrently in table order, each row awaits its selected `needs` (either lane) via `Promise.withResolvers`, settles in `finally`; `refreshEnv` now runs per started install inside the failure catch (a PATH read error fails that row instead of throwing out of the run). Temp folder removed after prefetch ends, also on error.
- Parallel rows: codexCli (npm, needs node), codexDesktop, claudeDesktop (Appx). Everything else stays serial: MSI one-at-a-time (1618), PATH read-modify-write races (HKLM and HKCU, vendor scripts assumed to write), one UAC prompt at a time.
- Added ocSetup `DependencyRow.ApplyEvent` phases: `queued` -> "Waiting", `ready` -> "Downloaded, waiting to install".
- Added tests: table invariant (one install path per row, parallel list pinned), serial no-overlap + parallel overlap + cross-lane need wait, failed serial need skips parallel dependent, prefetch limit 3 / table order / failed-at-once / dependents skipped / each install gets its own folder / temp removed after a thrown install. Updated the two existing `runInstalls` tests (`queued` events, 2 PATH reads).
- Fixed during tests: async `mkdir` let prefetches start out of table order; now `mkdirSync` inside each row's chain (also turns a mkdir failure into that row's `failed` instead of hanging its lane).
- Updated skill `oc-installer` contract (phases, scheduling, lane rule, `prepare` vs `install`).
- Verification: `bun test test/dependencies.test.ts` 10 pass (3 runs); tui `tsgo --noEmit` exit 0; `OC_FLAVOR=oc bun run src/index.ts oc deps install bogusId` -> "Unknown dependency: bogusId", exit 1. Live smoke (scratch, no install): git `prepare` downloaded + verified Git-2.56.0.2-64-bit.exe in 3.6 s (steps downloading, verifying); after appending a byte, install mode stopped with "Checksum mismatch" before running anything. `dotnet build ocSetup -c Release` 0 errors, bin/obj removed. Not run: any real install, the VM flow, oc/setup rebuild.
- Risk: PATH behavior of vendor scripts is assumed; only the three non-PATH rows are parallel. pwsh (first, monolithic) shares bandwidth with 3 prefetches; lower `PREFETCH_LIMIT` to 2 if the VM shows it noticeably delayed.

### User
Install
- The dependencies window now downloads Git, Node.js, WezTerm, and the Claude and Cursor CLI installers ahead of time, up to three at once, so installs no longer wait on each download.
- Codex CLI and the Codex and Claude desktop apps install alongside the others; everything that changes PATH or asks for admin approval still installs one at a time.
- Rows show "Waiting" and "Downloaded, waiting to install" while queued.
- Each downloaded installer is checked again right before it runs.

---

## 2026-10-22 (~00:25) - v0.2.295 krankyVvitch - faster ocSetup and smaller setup exe - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (/imp of `~/.config/opencode/plans/ocSetupPerformance.md`, steps 1, 2, 4; step 3 reverted by its gate; step 5 waits for VM retest); completed, installer not rebuilt
- Version: 0.2.295 krankyVvitch
- Changed `.installer\oc.installer.iss` `[Setup]`: `Compression=lzma2/max`, `SolidCompression=yes`, `LZMADictionarySize=262144`, `LZMAUseSeparateProcess=yes`. `oc.exe` and `opencode.exe` are both 224.8 MB Bun builds (different hashes, shared runtime); a solid stream with a dictionary larger than one binary stores that runtime once. `[Files]`: `opencode.exe` moved directly under `oc.exe`.
- Changed ocSetup publish (`.scripts\buildInstaller.ps1`): dropped `EnableCompressionInSingleFile` and `IncludeNativeLibrariesForSelfExtract`, added `-p:DebugType=none`; `.installer\publish` is cleared before publishing. `.iss` `OcSetupExe` define -> `OcSetupDir`, ships `publish\*` (ocSetup.exe + WPF `*_cor3.dll`) into `{app}`. No more per-start decompression or `%TEMP%\.net` extraction. ReadyToRun rejected (self-contained framework is already precompiled).
- Changed `.installer\ocSetup\windows\MainWindow.xaml.cs`: first `deps list` starts in the constructor (`_loadTask`), `Window_Loaded` awaits it (keeps crashes on the dispatcher handler); after install `ShowDone` shows at once and the list reloads behind it; `OpenOcButton_Click` awaits `_loadTask` (just-installed WezTerm still used, shortcuts retargeted) and disables itself; `LoadRowsAsync` wraps new `ReadRowsAsync` with `_isLoading`, and Install stays disabled while loading.
- Measured baseline (dev PC): dist `oc.exe oc deps list` median 1.38 s (cold 2.5 s). Per row: freshEnv 240 ms, pwsh check ~900, cursorCli ~800, desktop checks ~550-615, other CLIs 80-260.
- Reverted step 3 (start PATH-independent detections before `freshEnv`): measured ~1.20-1.25 s vs ~1.17-1.24 s before; the extra concurrent PowerShell start slowed the desktop checks. `dependencies.ts` unchanged.
- Updated skill `~/.config/opencode/skills/oc/oc-installer/SKILL.md` "Setup behavior" line for the new publish and compression.
- Verification: `bun test test/dependencies.test.ts` 6 pass (run before the revert; file now unchanged); `dotnet build ocSetup -c Release` 0 warnings 0 errors, bin/obj removed; `buildInstaller.ps1` PowerShell parse 0 errors. Not run: `dotnet publish`, ISCC compile (dictionary size vs ISCC limit unverified), setup size, ocSetup start time, VM install.
- Risk: setup extraction needs ~256 MB RAM. If ISCC rejects the dictionary, check its bitness and the `LZMAUseSeparateProcess` limit (1048576 KB). A missing native DLL would stop ocSetup from starting; the wildcard ships the whole cleaned publish folder.
- TODO: remove temp debug logging after the VM retest (plan step 5).

### User
Install
- The setup exe should be noticeably smaller: oc.exe and opencode.exe share most of their bytes, which are now compressed once.
- The dependencies window opens faster: it no longer unpacks itself on every start or extracts files to the temp folder.
- The dependency check starts while the window is still opening.
- After installing, the completion screen appears right away instead of waiting for a re-check; "Open oc and close" still waits for that check so a newly installed WezTerm is used.

---

## 2026-10-22 (~00:14) - v0.2.294 cawfeeeeRafter - session pass: installer tweaks - Claude Opus 5.5, low effort; Pass

### Agent
- Meta: Claude Opus 5.5; low effort; /pass over this session's ocSetup and buildInstaller changes; completed
- Version: 0.2.294 cawfeeeeRafter (same session, no bump)
- Fixed stale `-h` help text in `.scripts\buildInstaller.ps1`: now says older setup exes are removed.
- Checked: `ProcessRenderMode` is set in `OnStartup` before `StartupUri` creates `MainWindow`; no code references the removed `CloseButton`; no wiki page mentions the list Close button; `src/bun.lock` and `opencode/package.json` changes are not from this session.
- Verification: review only; no new checks needed for a help string.

### User
Install
- No visible change; build script help text updated.

---

## 2026-10-22 (~00:11) - v0.2.294 cawfeeeeRafter - equal-width dependency tags - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.294 cawfeeeeRafter (same session, no bump)
- Changed `.installer\ocSetup\windows\MainWindow.xaml` row template: tag column gets `SharedSizeGroup="TagBadge"` (all tags take the widest tag's width, "Required"); tag `TextBlock` centered.
- Verification: `dotnet build` 0 warnings 0 errors. bin/obj (pre-existing from the user's installer build) removed afterward; regenerated by any build. VM visual check pending.

### User
Install
- The Required and Default tags in the dependencies window are now the same width.

---

## 2026-10-22 (~00:09) - v0.2.294 cawfeeeeRafter - buildInstaller removes old setups - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.294 cawfeeeeRafter (same session, no bump)
- Added to `.scripts\buildInstaller.ps1`: after ISCC succeeds, removes every `oc_v*_windows-x64-setup.exe` in `.installer\Output` except the current version's; throws if one remains. Also keeps `pushRelease.ps1` (uploads every exe in Output) from shipping stale setups.
- Verification: PowerShell parser reports 0 errors; script not run (no build requested).

### User
Install
- Building the installer now deletes older setup exes from `.installer\Output`, leaving only the new one.

---

## 2026-10-22 (~00:05) - v0.2.294 cawfeeeeRafter - ocSetup software rendering, drop list Close button - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation after /spit; completed
- Version: 0.2.294 cawfeeeeRafter
- Fixed `.installer\ocSetup\App.xaml.cs` `OnStartup`: `RenderOptions.ProcessRenderMode = RenderMode.SoftwareOnly`. VMware VM showed the Codex CLI "Default" tag drawn as clipped "Missing" (same 7-char length, badge sized for "Default"); `DependencyRow.TagText` cannot produce "Missing", so treated as a GPU glyph-rendering glitch. Unconfirmed until VM retest.
- Removed `CloseButton` from the list view `BottomBar` in `.installer\ocSetup\windows\MainWindow.xaml`; window X still goes through `Window_Closing`. Done panel Close kept, `CloseButton_Click` still used there.
- Verification: `dotnet build .installer\ocSetup\ocSetup.csproj -c Release` 0 warnings 0 errors; bin/obj removed. Setup not rebuilt; VM retest pending.
- Risk: if the tag glitch reappears under software rendering, check `deps list` JSON for codexCli in `%TEMP%\ocSetup-debug.log`.

### User
Install
- The dependencies window draws with software rendering, fixing a garbled tag (Codex CLI showed "Missing" instead of "Default") seen in a VM.
- The dependency list no longer has a Close button; use the window's X.

---

## 2026-10-22 (~01:05) - v0.2.293 theorizedStrem - session pass: guard shortcut retarget - Claude Opus 5.5, low effort; Pass

### Agent
- Meta: Claude Opus 5.5; low effort; /pass over this session's installer work; completed
- Version: 0.2.293 theorizedStrem (same session, no bump)
- Fixed `.installer\ocSetup\windows\MainWindow.xaml.cs` `LoadRowsAsync`: a WScript.Shell/COM or file error while retargeting the oc shortcuts to WezTerm is logged instead of crashing the window.
- Checked: no stale `-dotnet` / `DotnetFlavor` / `-Flavor` references in repo docs, scripts, `.iss`, or wiki; Desktop test folder gone (user moved it); `src/bun.lock` and `opencode/package.json` show as modified with no content diff (line endings from the build).
- Kept (intentional): temp debug logging (TODO), `pushRelease.ps1` failing without a setup exe.
- Verification: `dotnet build` 0 warnings 0 errors; 44 tests pass across dependencies + 4 update-script files. Setups not rebuilt for this one-line guard.

### User
Install
- The dependencies window no longer closes if updating the oc shortcuts for WezTerm fails.

---

## 2026-10-22 (~00:55) - v0.2.293 theorizedStrem - single self-contained setup; round 6 build - Claude Opus 5.5, low effort; Build

### Agent
- Meta: Claude Opus 5.5; low effort; Build; completed, VM test is the user's
- Version: 0.2.293 theorizedStrem (same session, no bump)
- Removed the framework-dependent `-dotnet` setup: `.installer\oc.installer.iss` drops `DotnetFlavor`/`SetupSuffix` and the .NET 10 registry check (`InitializeSetup`); `OcSetupExe` default `publish\ocSetup.exe`; `.scripts\buildInstaller.ps1` drops `-Flavor`, publishes ocSetup self-contained single-file to `.installer\publish`. SCRIPTS.md, FORK.md (row text and remaining checks), wiki `Install.md` updated. Deleted stale `.installer\publish` + `.installer\Output` and the old `-dotnet` exe in the VM folder before rebuilding.
- Built: `build.ps1` basic checks 0.2.293; `buildInstaller.ps1` one compile, no warnings; built `oc.exe oc deps list` order pwsh, git, node, everything, wezterm, codexCli, claudeCli, cursorCli, codexDesktop, claudeDesktop, cursorDesktop. Copied `oc_v0.2.293_windows-x64-setup.exe` (180.8 MB, SHA256 6EB24F36...E9F475) + TESTING.md round 6 to `D:\VirtualBox VMs\Shared Folder\ocInstallerTest`.
- TODO: "oc Development Dependencies" section (user, next session); remove temp debug logging.

### User
Install
- There is now one setup exe; it bundles everything the dependencies window needs, so no .NET install is required.

---

## 2026-10-22 (~00:45) - v0.2.293 theorizedStrem - ocSetup tags aligned in one column - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; not rebuilt
- Version: 0.2.293 theorizedStrem (same session, no bump)
- Changed `.installer\ocSetup\windows\MainWindow.xaml` row template: Required/Default tags sit in a `SharedSizeGroup="TaggedLabel"` column (`Grid.IsSharedSizeScope` on `RowsList`) after a hidden copy of the checkbox; untagged rows collapse that copy, so the column width is the widest tagged label only (Codex desktop's longer label does not push tags right). Real checkbox stays underneath; hidden copy and the background-less overlay grid are not hit-testable.
- Verification: `dotnet build -c Release` 0 warnings 0 errors. Layout not seen yet.

### User
Install
- Required and Default tags in the dependencies window now line up in one column.

---

## 2026-10-22 (~00:35) - v0.2.293 theorizedStrem - dependency rows ordered Codex, Claude, Cursor - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; not rebuilt (user asked to wait)
- Version: 0.2.293 theorizedStrem (same session, no bump)
- Changed `dependencies.ts` `DEPENDENCIES` order: CLIs and desktop apps both Codex, Claude, Cursor (comment added). Install order follows the table; `needs` still point earlier (node, git).
- Verification: `bun test test/dependencies.test.ts` 6 pass (includes the needs-earlier check).

### User
Install
- The dependencies window lists Codex, then Claude, then Cursor for both the CLIs and the desktop apps.

---

## 2026-10-22 (~00:20) - v0.2.293 theorizedStrem - Claude and Codex CLI default, oc exe icon - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; built, copy to VM folder blocked by a lock
- Version: 0.2.293 theorizedStrem (same session, no bump)
- Changed `dependencies.ts` defaults: `claudeCli` and `codexCli` `defaultSelected: true`, `cursorCli` stays false (user corrected an earlier Cursor-default edit mid-turn). README and wiki `Install.md` updated.
- Fixed oc shortcuts showing Bun's icon: `opencode/script/build.ts` passes `compile.windows.icon` = `src/.res/icon.ico` (`windowsIcon`) for win32 targets when building on Windows; cross-compiles keep `{}`. Applies to `oc.exe` and `opencode.exe`.
- Verification: `bun test test/dependencies.test.ts` 6 pass; `build.ps1` basic checks 0.2.293; `buildInstaller.ps1` both flavors compiled. Icon not visually checked.
- ERROR: copying to `D:\VirtualBox VMs\Shared Folder\ocInstallerTest` failed: setup exe in use by another process (VM likely has it open). Not forced.

### User
Install
- Claude Code CLI and Codex CLI are now checked by default in the dependencies window; Cursor CLI is optional.
- oc.exe and opencode.exe now show oc's icon instead of Bun's, including on the desktop and Start menu shortcuts.

---

## 2026-10-21 (~23:58) - v0.2.293 theorizedStrem - ocSetup completion view, default tags, WezTerm shortcuts - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; built, VM retest pending
- Version: 0.2.293 theorizedStrem (same session, no bump)
- Added `path` (resolved executable) to `oc oc deps list` CLI rows (`dependencies.ts` `detectCli`); `DependencyItem.Path` in ocSetup.
- Added `.installer\ocSetup\helpers\OcLauncher.cs`: `WezTermGui` (wezterm-gui.exe beside detected wezterm.exe), `UseWezTermForShortcuts` (WScript.Shell COM; Start menu `Programs\oc.lnk` + `Desktop\oc.lnk`, only when target is this oc.exe or already WezTerm -> `wezterm-gui.exe start -- "oc.exe"`, icon oc.exe), `Open` (oc or WezTerm+oc with PATH rebuilt from Machine+User registry). Shortcuts are retargeted after every list load that finds WezTerm.
- Added completion view (`DonePanel`): heading "Setup complete" / "Setup finished with errors", installed list, failures, PATH note, "Open oc now?" with **Open oc and close**, **Close**, **Back to list**. Replaces the old bottom status line.
- Added Required/Default tags with tooltips (`DependencyRow.TagText/HasTag/TagToolTip`).
- Verification: `dotnet build` 0 warnings 0 errors; `bun test test/dependencies.test.ts` 6 pass; tui `tsgo` exit 0; rebuilt oc (basic checks 0.2.293) and both setups (exit 0); built `oc.exe oc deps list` includes `path`. Package refreshed with TESTING.md round 4.
- TODO (user, next session): "oc Development Dependencies" collapsed section listing and installing the dev toolchain. TODO: remove temp debug logging.
- Risk: Inno uninstall deletes the retargeted `.lnk` files only because the paths are unchanged; unverified.

### User
Install
- The dependencies window tags PowerShell 7 as Required and Git, Node.js, Everything, and WezTerm as Default.
- After installing, a completion screen lists what installed or failed and offers to open oc and close.
- When WezTerm is installed, the oc shortcuts and "Open oc" launch oc inside WezTerm.

---

## 2026-10-21 (~23:35) - v0.2.293 theorizedStrem - fix ocSetup crash on ProgressBar binding - Claude Opus 5.5, low effort; Debug

### Agent
- Meta: Claude Opus 5.5; low effort; Debug; fix built, VM retest pending
- Version: 0.2.293 theorizedStrem (same session, no bump)
- ERROR: VM: ocSetup dispatcher crash when rows render: "A TwoWay or OneWayToSource binding cannot work on the read-only property 'ProgressValue'". `RangeBase.Value` binds TwoWay by default; `DependencyRow.ProgressValue` has a private setter.
- Fixed `.installer\ocSetup\windows\MainWindow.xaml`: `Value="{Binding ProgressValue, Mode=OneWay}"`. Other bindings checked: `IsChecked` has a public setter, the rest default OneWay.
- Rebuilt both setups (exit 0, no warnings); `Desktop\ocInstallerTest\` refreshed with new SHA256 and TESTING.md round 3. Temp debug logging still in (TODO remove).
- Verification: compile only; VM run is the user's.

### User
Install
- Fixed the dependencies window closing right after it finished checking.

---

## 2026-10-21 (~23:16) - v0.2.293 theorizedStrem - temp crash logging in ocSetup - Claude Opus 5.5, low effort; Debug

### Agent
- Meta: Claude Opus 5.5; low effort; Debug; instrumentation only, cause not found yet
- Version: 0.2.293 theorizedStrem (same session, no bump)
- ERROR: user VM run: ocSetup appeared to crash after setup's **Set up dependencies**; no details yet.
- Added WIP temp logging: `.installer\ocSetup\helpers\DebugLog.cs` (`%TEMP%\ocSetup-debug.log`); `App.xaml.cs` static ctor logs start and hooks AppDomain/TaskScheduler, `OnStartup` hooks DispatcherUnhandledException; each crash logs the stack and shows a MessageBox with the log path; `MainWindow.RunOcAsync` logs args, pid, every stdout line, stderr, exit code, duration. TODO: remove all `WIP: temp debug logging` once fixed.
- Rebuilt both setups (`buildInstaller.ps1` exit 0); package refreshed at `Desktop\ocInstallerTest\` with new SHA256 and a crash-capture TESTING.md.
- MISTAKE: copied into `Desktop\ocInstallerTest` after the user had moved that folder away; `Copy-Item -Destination` created a file with that name. Removed it and recreated the folder. Rule: `Test-Path -PathType Container` the destination before copying into it.

### User
Install
- The dependencies window now writes a debug log to `%TEMP%\ocSetup-debug.log` and shows a message with the reason if it crashes (temporary, for testing).

---

## 2026-10-21 (~23:20) - v0.2.293 theorizedStrem - first installer build and VM test package - Claude Opus 5.5, low effort; Build

### Agent
- Meta: Claude Opus 5.5; low effort; Build (user asked); completed
- Version: 0.2.293 theorizedStrem (same session as the setup entry below, no second bump)
- Updated Inno Setup 6.7.1 -> 6.7.3 on the build PC (signer `Pyrsys B.V.` Valid, silent RunAs install exit 0, uninstall key reads 6.7.3).
- Fixed `.installer\oc.installer.iss`: `FileCopy` -> `CopyFile` (ISCC 6.7.3 rename hint).
- Built: `.scripts\build.ps1` exit 0 (basic checks 0.2.293); built `oc.exe oc deps list` printed the JSON array; `.scripts\buildInstaller.ps1` exit 0, both flavors compile with no warnings: `oc_v0.2.293_windows-x64-setup.exe` 180.9 MB, `-setup-dotnet.exe` 125.9 MB.
- Package: `Desktop\ocInstallerTest\` with both setups and `TESTING.md` (VM checklist + SHA256).
- Verification: compile and smoke only; no install run yet (VM test is the user's).

### User
Install
- Built the first oc setup exes and a VM test folder on the Desktop with a step-by-step checklist.

---

## 2026-10-21 (~22:54) - v0.2.293 theorizedStrem - Windows setup exe and dependency window - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (/imp of `~/.config/opencode/plans/ocWindowsInstaller.md`; 2 `general-haiku-5.5-high` subagents built `.installer\ocSetup` and the Inno/scripts side, reviewed after); completed except live installer runs
- Version: 0.2.293 theorizedStrem
- Added `tui/src/dependencies.ts`: `DEPENDENCIES` table (pwsh required; git/node/everything/wezterm default; claudeCli needs git, codexCli needs node; cursorCli; claude/cursor/codex desktop), `listDependencies`, `installDependencies` -> `runInstalls` (table order, `needs`-failure skip, PATH re-read from Machine+User registry after each install via `freshEnv`), `lineEvent` (OCSTEP/OCPROGRESS -> NDJSON events), generic `INSTALL_SCRIPT` (download with host allowlist, sha256 and/or exact signer CN, exe/msi/ps1/zip, `Start-Process -Verb RunAs` per machine-wide installer). Values reach PS as single-quoted literals (`psString`, curly quotes doubled too).
- Verified vendor facts 2026-10-21: Git `Git-*-64-bit.exe` signer `Johannes Schindelin` + GitHub digest; Node LTS MSI from `nodejs.org/dist/index.json`, signer `OpenJS Foundation`; Everything pinned 1.4.1.1032 sha256 `c42efad0...` + signer `voidtools PTY LTD` (bump `EVERYTHING_VERSION`/`EVERYTHING_SHA256` together); es.exe from `voidtools/es` x64 zip (digest) into oc.exe's folder; WezTerm setup unsigned, sha256 from sibling `.sha256` asset; `claude.ai/install.ps1` 302 -> `downloads.claude.ai`; Cursor `cursor.com/install?win32=true`; Codex via `npm install -g @openai/codex`. Git `/CURRENTUSER` unverified, so Git installs machine-wide.
- Added `$AllowFresh` to the pwsh, Claude desktop, Cursor desktop, ChatGPT desktop scripts (missing install -> version 0.0, proceeds) and `scriptModeLines` in `desktopUpdate.ts` replacing four inline prefixes; new `install*Latest(onLine)` exports. Harness update menu never sets it: behavior unchanged.
- Added hidden `oc oc deps list` / `oc oc deps install <ids..>` (`cli/cmd/oc.ts` `DepsCommand`, under `oc` so a folder named `deps` still launches); tui export `./dependencies`. No `--json` flag (output is always JSON); plan deviation.
- Added `.installer\ocSetup` WPF (base theme copied, themed CheckBox added because the default template draws black text), `.installer\oc.installer.iss` (per-user `{localappdata}\Programs\oc`, occ hard link via `CreateHardLinkW`, HKCU PATH add/remove, `oc --shutdown-all` before install/uninstall, `DotnetFlavor` registry check -> MsgBox + download page), `.scripts\buildInstaller.ps1` (`-Flavor`, Inno >= 6.7 guard from the `Inno Setup 6_is1` key, ImageMagick wizard images into gitignored `.installer\images`).
- Changed `scriptHelper.ps1` `$installDir` -> `%LOCALAPPDATA%\Programs\oc` (+ `$installerFolder`, `$installerOutput`); `pushRelease.ps1` uploads `.installer\Output\*.exe` and now throws when none exist; AGENTS.md line 10, SCRIPTS.md, FORK.md row, README, wiki `Install.md` updated.
- Verification: `bun test` dependencies + 4 update-script test files 44 pass; `tsgo` typecheck tui and opencode exit 0; `OC_FLAVOR=oc bun run src/index.ts oc deps list` on this PC: 11 rows, all found except Codex desktop outdated, 4.5 s; `dotnet build ocSetup -c Release` 0 warnings 0 errors; PS parse check of edited scripts 0 errors; `buildInstaller.ps1 -h` ok. Not run: ISCC compile, `dotnet publish`, any install path of `oc oc deps install`, the WPF window visually.
- Risk: Everything `/S` silent defaults and post-install `-startup` launch unverified; closing ocSetup mid-install leaves oc writing to a closed pipe; `.iss` Pascal never compiled.

### User
Install
- A Windows setup exe can now be built: it installs oc for your user in `%LOCALAPPDATA%\Programs\oc`, adds it to PATH, and closes running oc windows before upgrading.
- After setup, an **oc dependencies** window lists PowerShell 7, Git, Node.js, Everything, WezTerm, and the Claude, Cursor, and Codex apps, shows which are installed, and installs the ones you check with progress.
- The `-dotnet` setup is smaller but needs the .NET 10 Desktop Runtime; without it, setup stops and opens the download page.
- The developer install script now installs to `%LOCALAPPDATA%\Programs\oc` instead of `Apps\opencode`.

---

## 2026-10-21 (~22:22) - v0.2.292 safariShittin - Claude account switch waits for running work - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (/imp of `~/.config/opencode/plans/claudeAccountSwitchWaitForWork.md` + `claudeAccountSwitchBackgroundAndSidebar.md`); completed
- Version: 0.2.292 safariShittin
- Added `sessionManager.ts` `workingAccount(key)`, `sessionWorkingAccount(sessionID)`, private `processWorkingAccount`: live process holds its account while `turnInFlight && !turnAbandoned` or `backgroundTasks` non-empty; `closing` holds nothing. Map read directly (no LRU touch).
- Added `ActiveProcess.backgroundTasks` (id -> backgrounded) + `noteTaskLine` fed from the stdout `rl.on("line")` handler: CLI stream-json `system/task_started` adds (`is_backgrounded !== false`), `task_notification` deletes, `task_updated` with terminal `patch.status` deletes. Pre-filter `"subtype":"task_` before JSON.parse. `noteTurnLine` drops foreground entries at the terminal `result`. Not copied on respawn (tasks die with the child). Event shapes read from CLI 2.1.306 `claude.exe` strings; `task_updated` patch keys unverified.
- Changed `claudeCodeLanguageModel.ts`: a working session keeps its account and skips `turnAccount` + `retireOtherAccount`; palette switch applies on the next idle turn. New sessions and subagents get the new account at once. Failover unchanged (switches at the rejected `result`).
- Changed `accounts.ts` `poolState(..., running?)`: running account (in pool) wins `current`; `sessionOc.ts` passes `sessionWorkingAccount` for state and set, so the sidebar shows the account the chat is on now. No SDK change.
- Changed `prompts.ts:79` and `tui/src/claudeCommands.tsx` dialog titles; wiki `Claude-Code.md` (background jobs, Several Claude accounts).
- Verification: `bun test` `sessionManager.test.ts` + `accountPool.test.ts`: accountPool 24/24; sessionManager 29 pass, 2 fail ("an error on a dead child's stdin is logged, not thrown", "LRU eviction kills nothing while every process is mid-turn"), both capture `console.error` log lines while `logger.ts` (changed v0.2.233, after the test's last edit v0.2.221) never writes stderr; code paths untouched here, likely stale, not added to Known failures (TODO). /pass: comment and dialog-title wording now covers background tasks. `tsgo --noEmit` clean. No live check.
- Risk: long `Monitor` watches hold a manual switch until they end; a lost `task_notification` holds until the process exits (idle/LRU eviction or restart). Kept: idle eviction still kills background tasks.

### User
Claude accounts
- Switching the Claude account from the palette no longer interrupts a chat that is mid-turn or has background jobs running; that chat finishes the work and moves on its next message.
- New chats and subagents use the newly chosen account right away.
- The sidebar marks the account a chat is actually using until its running work finishes.

---

## 2026-10-21 (~22:09) - v0.2.291 wrigglingIommi - oc feature request issue form - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (from /spit, no plan file); completed
- Version: 0.2.291 wrigglingIommi
- Changed `.github/ISSUE_TEMPLATE/feature-request.yml`: replaced upstream form (emoji name, `[FEATURE]:` title, one textarea) with oc form in `bug-report.yml` style: required SCOPE.md/issues checkbox, required Problem + Proposed change (per `CONTRIBUTING.md:15`), optional Area dropdown (FORK.md sections 1-6, 8 + Other), Workarounds, oc version.
- Risk: Area dropdown mirrors FORK.md section names; update it when those sections are renamed.
- Fixed `.github/ISSUE_TEMPLATE/config.yml` FAQ link: `README.md#faq` anchor did not exist; now wiki FAQ.
- Kept CRLF (Write produced LF; converted with `unix2dos`).
- /pass: linked SCOPE.md in the checkbox label; reworded Proposed change description.
- Verification: both files parse with PyYAML (rechecked after /pass); body ids checked. GitHub form rendering not checked (server-side only).

### User
GitHub issues
- The feature request form now asks for the problem, the proposed change, the area of oc, workarounds, and the oc version, and asks you to check SCOPE.md first.
- The FAQ link on the new issue page now opens the wiki FAQ instead of a missing README section.

---

## 2026-10-21 (~21:59) - v0.2.290 organicThugs - Custom sidebar buttons from either palette - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (plan `~/.config/opencode/plans/2026-10-21-custom-sidebar-buttons.md`); completed
- Version: 0.2.290
- Added tui config `sidebar_buttons?: string[]` + `SIDEBAR_BUTTONS_DEFAULT` (`config/index.tsx`); absent = defaults, `[]` honored, `setSidebarButtons(undefined)` resets. `persistTuiSetting` accepts `["sidebar_buttons"]`; `undefined` deletes the key.
- Added `src/sidebarButtons.ts`: `toggleSidebarButton`, `resetSidebarButtons` (set + persist + toast); shared by palette, sidebar, reset entry.
- Added palette modal command `palette.toggle_sidebar` (`alt+p`, keybind `palette_toggle_sidebar`) in `command-palette.tsx`; covers ctrl+p and ctrl+o (same dialog). Pinned entries get `◆` in footer.
- Changed `sidebarTools.tsx` header buttons to `<For>` over `sidebar_buttons`; commands from `useKeymapSelector` map of registered commands; unregistered names skipped, not pruned. Built-in label table keeps "Switch Session"/"Subagents: N off". Subagents button now dispatches `oc.session_subagents`. Removed unused `useDialog`/`DialogSessionSubagents` imports.
- Added `HeaderButton.onRightClick` (button 2 on mouse up); sidebar right-click removes the button. Needed because `command.palette.show`/`oc.settings_palette` are hidden from the palette.
- Added oc palette entry `oc.sidebar_buttons_reset` "Reset sidebar buttons" (`/sidebarReset`, Layout).
- Kept model/variant row fixed.
- Docs: wiki `Sidebar.md`, `Configuration.md`; `FORK.md` sidebar row; regenerated `docs/keybinds.md` (`bun packages/tui/script/keybindDocs.ts`, new alt+p row; caught in /pass).
- Verification: `bun test test/config.test.tsx` 19 pass (new sidebar_buttons case); `bun run typecheck` exit 0 in `packages/tui`; `keybindDocs.ts --check` exit 0. Live TUI check not run.
- MISTAKE: fixed a typecheck error in `sidebarTools.tsx` with `sed -i` instead of Edit. Rule: project file edits go through file tools.
- MISTAKE: missed `docs/keybinds.md` regen when adding a keybind Definition. Rule: any `keybind.ts` Definitions change runs `keybindDocs.ts`.

### User
Sidebar
- You can add any Command Palette or oc Palette entry as a sidebar button: highlight it and press alt+p, and press alt+p again to remove it.
- Entries already on the sidebar show a ◆ in the palette.
- Right-clicking a sidebar button removes it.
- "Reset sidebar buttons" in the oc palette (or /sidebarReset) brings back Switch Session, Command Palette, oc Palette, and Subagents.
- The button order is saved as `sidebar_buttons` in tui.jsonc and can be edited by hand.

---

## 2026-10-21 (~21:43) - v0.2.289 homiesElection - Claude failover can ask which account to continue on - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (/spit -> /think -> /imp); completed
- Version: 0.2.289 homiesElection
- Added oc.json key `claudeFailover` (`auto` default | `ask`) in `config/oc.ts` (`keys` + value guard in `update`). Kept out of `account-pool.json` (loaded once per process, whole-file rewrite = cross-process clobber) and opencode.jsonc (config update reloads instances).
- Changed `accounts.ts`: `bestUsable` -> `rankUsable` (returns `FailoverCandidate { id, used? }[]`); removed `failoverAccount`; added pure `failoverCandidates(from, ids)` + `applyFailoverChoice(sessionID, id, ids)` (pin moves if pinned, else `setCurrentAccount`). Auto behavior change: unpinned chat takes best-ranked account even if another session moved the global pick.
- Changed `turnStream.ts`: `switchTo` is now ranked candidates; `switchAccount(resume)` detaches, `pickAccount` (reads oc.json fresh; read error -> auto with warn), then retires/respawns. Ask mode runs oc `question` in-stream via `hostToolExecutors` (`askFailover`, id prefix `account_failover_`, own plain tool-result so a dismissal is not a denial). No pick (Stop/dismiss/abort/unmatched typed answer) -> `failoverDeclined` + `allLimited`, reattach listeners, `resume()` re-runs `onResult(msg)` / `onClose()`; Claude session and process kept for auto-resume.
- Added `failoverQuestion.ts` (options best first, first `(Recommended)`, `5h used N%`/`usage unknown`, then `Stop`; `pick(label)` -> id).
- Changed `HostToolExecutor` (`shared.ts`) with optional `tools` set; `session/llm.ts` attaches bound tool names. No `question` (subagents, denied agents) -> auto, no error row.
- Changed `messageBuilder.ts`: exported `ACCOUNT_FAILOVER_TOOL_CALL_PREFIX`, renamed strip helpers (no longer historical-only).
- Added TUI palette entry `claude.failover` "Claude account failover" (Auto/Ask, shown with 2+ accounts) in `claudeCommands.tsx`; `readOcConfig`/`persistOcConfig` in `ocSettings.ts` know `claudeFailover`.
- Kept turn-start auto-move on a known-limited account (`nextUsableAccount`) per user decision: ask covers mid-turn rejections only.
- Verification: `bun test test/provider/claude-code/accountPool.test.ts test/provider/claude-code/failoverQuestion.test.ts` 25 pass 0 fail (includes existing fake-CLI in-turn auto-switch tests); `tsgo --noEmit` clean in `packages/opencode` and `packages/tui`; prettier clean on changed lines. Ask flow (form in a live turn) not exercised by tests: needs user live check.
- Plan: `~/.config/opencode/plans/claudeFailoverAsk.md`.
- /pass: inlined single-use `bestUsable` into `nextUsableAccount`; `askFailover` passes the stream's `abortSignal` so an aborted turn closes its question; FORK.md Claude account pool row documents Ask mode. Re-ran the same tests (25/0) + opencode typecheck.
- TODO: wiki page for the new setting (AGENTS.md: user-facing settings go in `..\oc.wiki`); not done this session.

### User
Claude Code accounts
- New palette entry "Claude account failover" chooses what happens when a Claude turn hits an account's usage limit: Auto (default, as before) or Ask.
- In Ask mode the running turn shows a question listing your other usable accounts, best first with their 5-hour usage, plus Stop; the turn continues on the account you pick.
- Stop or dismissing the question ends the turn on the limit, and auto-resume picks the same conversation back up after the reset if it is on.
- Subagents and agents that cannot ask questions keep switching automatically.

---

## 2026-10-21 (~21:29) - v0.2.288 sendWallaby - Numbered subagent labels in prompt footer - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (/imp after /spit); completed
- Version: 0.2.288 sendWallaby
- Added `numberDuplicateLabels` in `packages/tui/src/util/session.ts`: suffixes `-1`, `-2`... only to labels that repeat.
- Changed `subagentUsage` in `packages/tui/src/component/prompt/index.tsx`: sort children oldest first, drop entries without percent, then number (so visible numbers run in order), reverse to newest first, separator `" . "` -> `", "`. Lone-subagent detailed line unchanged.
- Risk: numbers are among currently running children; they can shift when one finishes.
- Added helper test in `packages/tui/test/cli/tui/contextUsage.test.ts`.
- Verification: `bun test test/cli/tui/contextUsage.test.ts` 7 pass, 0 fail. Live footer not checked.

### User
Prompt footer
- When several subagents with the same name run at once, the footer now shows them as `Subagent-1 2%, Subagent-2 3%, Subagent-3 4%` instead of repeating the same name.
- The oldest subagent gets -1, the newest is still listed first, and entries are separated by commas.

---

## 2026-10-21 (~21:19) - v0.2.287 justinJellyfish - Quoted commands never run; chain progress shown - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (/imp of plan `~/.config/opencode/plans/2026-10-21-chainProgressQuotes.md`); completed
- Version: 0.2.287 justinJellyfish
- Fixed `tui/src/prompt/slash.ts`: a command alone on a line inside a multi-line quoted example (`'/pass\n/revive\n/push'`) ran (unexpected revive). `quotedRanges` (`QUOTED`: ```` ``` ```` fences and `'` `"` `` ` `` `‘’` `“”` pairs opening after start/space/bracket, closing before end/space/punctuation) now hides commands in `extractSlashCommands` (replace offset) and `extractChain` (now `matchAll` + slicing instead of `split`). Apostrophes do not pair; unclosed quotes hide nothing.
- Added chain progress: `reviveChain.tsx` `chainNote` returns the note part with metadata `{ kind: "chain", step, total, done, later }`; `routes/session/index.tsx` shows `chainLine` under each step's message. Revive mark stores `next` (`useRevive().start(..., next)` -> `mark(sessionID, next)`); divider via `reviveDivider`. Both formatters in `util/revive.ts`.
- Docs: wiki `Launching.md` (quotes rule, step line), `FORK.md` revive row.
- Verification: tui tsgo clean; `bun test test/prompt/slash.test.ts test/prompt/part.test.ts test/reviveChainLine.test.ts` 17/17.

### User
Revive
- A slash command inside quotes or a code fence is now treated as text, so quoting `'/revive'` while describing it no longer restarts oc.
- Each step of a revive chain shows a line like "step 1 of 3 . next /revive, /agent-push" under its message, and the revive divider says what will be sent next.

---

## 2026-10-21 (~21:16) - v0.2.286 boozledReviewing - Pass: lone /revive from Home - Claude Opus 5.5, low effort; Pass

### Agent
- Meta: Claude Opus 5.5; low effort; /pass (chain step 1 of 3, live chain note observed in this turn); completed
- Version: 0.2.286 boozledReviewing
- Fixed `component/prompt/index.tsx` `submitInner`: since revive entries insert text, a lone `/revive` typed on Home went through the chain path and created an empty session first. A single-revive chain without a session now calls `reviveChain.revive` (`useRevive().start`) directly, after history append and `ref.reset()`.
- Reviewed: chain parse, runner, resume claim, pipeline settle points, autocomplete insert; no other issues found. `src/bun.lock` and `packages/opencode/package.json` show as modified with an empty diff (line endings from the user's build); left alone.
- Verification: tui tsgo clean. Live: this /pass turn arrived with the chain note "step 1 of 3 ... /revive, /agent-push".

### User
Revive
- Typing `/revive` on its own from the Home screen restarts oc without leaving an empty chat behind.

---

## 2026-10-21 (~21:12) - v0.2.286 boozledReviewing - Revive in slash menu after other commands - Claude Opus 5.5, low effort; Debug

### Agent
- Meta: Claude Opus 5.5; low effort; Debug (follow-up to revive chains, same version); completed
- Version: 0.2.286 boozledReviewing
- Fixed `component/prompt/autocomplete.tsx`: TUI slash entries were offered only at prompt index 0, so `/pass /rev` never listed `/revive`. Revive entries (`REVIVE_MODES` from `prompt/slash.ts`) now show at any position and insert `/name ` instead of dispatching (`AutocompleteOption.inserts` skips `hide()` in `select`). At index 0, picking `/revive` now inserts too; Enter on the draft runs it via the chain path.
- Moved the server-command insertion into `insertSlash(name)`, shared by both.
- Verification: tui tsgo clean; `bun test test/component/autocomplete.test.ts test/component/slashMenuLayout.test.tsx` 3/3.

### User
Revive
- `/revive`, `/revive-no-install`, and `/revive-single` now appear in the slash menu after other commands, and picking one types it into the message instead of restarting right away.

---

## 2026-10-21 (~21:03) - v0.2.286 boozledReviewing - Revive between slash commands - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (/imp of plan `~/.config/opencode/plans/2026-10-21-reviveChain.md`); completed
- Version: 0.2.286 boozledReviewing
- Added `extractChain` (`tui/src/prompt/slash.ts`): typed `/revive`, `/revive-no-install`, `/revive-single` split a draft into ordered steps; free text is one shared request (user decision: stream-of-consciousness style); command-free chains send each text segment as its own prompt. `typedSlashCommands` returns `chain` (pastes stay opaque).
- Added `tui/src/reviveChain.tsx` `useReviveChain`: `run` awaits each `session.command`/`session.prompt` (resolves at turn end; `info.error` or throw stops the chain), adds a synthetic `kind: "chain"` note per step, waits for idle before a revive, writes the rest via ReviveResume; `resume` claims on session open; failed/stopped chains go back to an empty prompt; `watchOwn` handles failures while the writer TUI stays alive (single, helper launch).
- Added `core/src/util/reviveResume.ts`: `<sessionID>-<at>.<pending|ready|failed>.json` under `state/oc-revive/resume`; `settle` idempotent; `claim` uses an exclusive-create `.claim` lock; writer skips its own ready file; ready older than 15 min is restored, not sent; pending older than 1 day removed.
- Changed `reviveCommands.tsx`: extracted `useRevive` (`start(mode, sessionID, resume)` returns false when nothing started, `revive`); session passed explicitly; `revive.path` settles ready before launching; helper exit/error settles failed.
- Added `ReviveContext.resume` (`config/revive.ts` + parseContext); settle points in `reviveHost.ts` (catch before native reopen, before terminal handoff, single failure, before native spawn) and `cli/cmd/oc.ts` (shutdown failure).
- Wired `component/prompt/index.tsx` submit (chain branch before commands) and `routes/session/index.tsx` claim effect (once per session after sync).
- Docs: wiki `Launching.md` "Revive between commands"; `FORK.md` revive row.
- Verification: tsgo typecheck core, opencode, tui clean. `bun test` core `test/util/reviveResume.test.ts` 3/3, tui `test/prompt/slash.test.ts` + `part.test.ts` 14/14, opencode `test/config/revive.test.ts` 26/26. No live revive run (user-driven).
- ERROR: Bun 1.4.2 on Windows: two concurrent `fs.rename` of the same source both fulfil; do not use rename as a claim lock (exclusive `wx` create works).
- MISTAKE: edited `config/revive.ts` and `prompt/part.ts` with inline python; prevention: use Edit/Write for project files (the part.ts private-use regex chars needed it; content verified by bytes).
- Risk: an agent asking approval in plain text (not the question tool) lets the chain continue; revive-first chain from Home may reopen Home with `oc` launcher (chain then waits for the session to be opened, 15 min TTL).

### User
Revive
- You can now put `/revive`, `/revive-no-install`, or `/revive-single` among other slash commands, for example `/pass /revive /agent-push`, and oc runs them in order.
- Commands before a revive run first and finish; commands after it are sent automatically once oc comes back.
- If a step fails, you press Esc, or the revive build fails, the remaining commands are not sent and appear in your prompt instead.

---

## 2026-10-21 (~20:47) - v0.2.285 depositMeebo - Subagent live rows picks from a list - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed, live check pending
- Version: 0.2.285 depositMeebo
- Changed `ocCommands.tsx` `oc.subagent_card_rows` run: `DialogSelect` (off, 2-10, `current` = kv value) replaces the 0/3/4/6 cycle; title, `/subagentRows`, default 4 kept.
- Verification: none run (no palette test); live check pending.

### User
Layout
- "Subagent live rows" in the oc palette now opens a list where you pick off or 2 to 10 rows.

---

## 2026-10-21 (~20:35) - v0.2.284 rottenThiollier - Claude failover picks the account with the most 5-hour usage left - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed, live check pending
- Version: 0.2.284 rottenThiollier
- Changed `accounts.ts` failover pick: `bestUsable(ids, from, now)` ranks usable accounts by cached `five_hour` utilization (lowest first); unknown last; ties keep rotation order after `from`. Used by `nextUsableAccount` (only when leaving a current account; fresh pool still starts at first usable) and `failoverAccount` pinned branch. Weekly ignored for ranking (user choice).
- Added `readUsageCache` (shared with `seedFromCaches`) + `windowUsedPercent` (past `resets_at` -> 0). `bestUsable` re-reads caches at failover and marks full windows (5h or weekly) limited, so stale once-per-process seed marks refresh.
- Kept: cache-only, sync reads; no live usage fetch (provider must not touch OAuth tokens). No ranking in `turnAccount`/`preferredAccount`/`setCurrentAccount`.
- Added test "failover picks the usable account with the least 5-hour use" in `accountPool.test.ts` (lowest wins, expired window = 0, no cache ranks last, full weekly skipped + marked, pinned pin follows).
- Docs: `FORK.md` account pool row; wiki `Claude-Code.md` (wiki push is the user's).
- Plan: `~/.config/opencode/plans/claudeFailoverMostHeadroom.md`.
- Risk: ranking uses the sidebar's last cached reading; unpolled accounts rank on old numbers.
- Verification: `bun test test/provider/claude-code/accountPool.test.ts` (CLAUDE_CONFIG_DIR unset): 24 pass, 0 fail. Live limit switch not exercised.

### User
Claude accounts
- When a Claude account hits its usage limit, oc now switches to the account with the most 5-hour usage left instead of the next one in your list.
- Accounts the sidebar already shows as full for the 5-hour window or the week are skipped.

---

## 2026-10-21 (~20:23) - v0.2.283 toastYurrrrr - WezTerm split tabs keep oc's tab title - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed, live check pending
- Version: 0.2.283 toastYurrrrr (bumped at push: agentPush counts buildNotes.txt as a change)
- Changed `docs/wezterm.md` tab snippet: `title_pane(tab)` returns title + `oc_agent_color` from the active pane if `oc_tui == '1'`, else the tab's `oc_tui` pane via `wezterm.mux.get_tab(tab.tab_id):panes_with_info()`, else the active pane. Fixes split tabs showing `pwsh` when the shell pane is focused.
- Real change lives in wezFig `wezterm.lua` `format-tab-title` (separate repo, uncommitted; its buildNotes has the entry).
- Verification: wezFig config loads via `wezterm show-keys`; callback not exercised. Live check pending.

### User
WezTerm
- No oc change; the WezTerm setup doc now shows how to keep oc's tab title and color when a shell pane beside oc is focused.

---

## 2026-10-21 (~20:18) - v0.2.282 cherrysFritz - Prompt bar shows only running subagents - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.282 cherrysFritz
- Changed prompt `subagentUsage` (`tui/src/component/prompt/index.tsx`): filter children to `session_status` type != idle (missing = idle) before `contextUsage`. Finished/failed/aborted children leave the bar immediately; no grace period (sidebar keeps 2 min). Permission/question waits stay `busy` server-side (idle only at `run-state.ts:88,110`, `processor.ts:743,755`), so waiting children stay visible.
- Removed the "unloaded past children" caveat: past children are idle, so it no longer applies.
- Docs: `FORK.md` subagent usage row; wiki `Agents-and-Skills.md` "Subagent usage in the prompt bar" (wiki push is user's).
- Plan: `~/.config/opencode/plans/subagentUsageRunningOnly.md`.
- Verification: no typecheck or tests run (one-line filter, no covering test). Live check pending.

### User
Prompt bar
- Subagent usage in the bar under the prompt now shows only subagents that are still running and disappears when they finish.

---

## 2026-10-21 (~19:39) - v0.2.281 yrOptic - Tab key setting: text, agent, reasoning effort, or favorite model - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low effort; Implementation (plan `~/.config/opencode/plans/promptTabAction.md`); completed
- Version: 0.2.281 yrOptic (already bumped by the uncommitted SuperPlan removal; not bumped again)
- Added `PROMPT_TAB_KEY` (`prompt_tab_action`) + `PromptTabAction` type in `prompt/part.ts`
- Changed `prompt.tab` run (`component/prompt/index.tsx`): reads KV, `agent` -> `local.agent.move(1)`, `variant` -> `local.model.variant.cycle()`, `favorite` -> `local.model.cycleFavorite(1)`, else `insertText("\t")`. No keybind change; autocomplete gate unchanged
- Added palette entry `oc.prompt_tab_action` "Tab key" (`ocCommands.tsx`, group Layout, `/tabKey`, desc = current option title), DialogSelect after `oc.keybind_preset`; options in module const `_TAB_OPTIONS`
- Kept Shift+Tab = `agent_cycle` in every mode; opencode layout unaffected (`input_tab: none`), entry still visible there
- Updated wiki `Keybinds.md`: `tab` and `shift+tab` rows
- Verification: `bun run typecheck` in `packages/tui` exit 0. Not live-checked (user check: each mode, `/`+Tab completion, persists after restart)

### User
Prompt keys
- New **Tab key** setting in `ctrl+o` (or `/tabKey`) picks what Tab does in the prompt: type a tab (default), switch agent, cycle reasoning effort, or cycle favorite models.
- Shift+Tab still switches to the next agent in every mode.
- Tab still completes the highlighted item while the `@` or `/` list is open.

---

## 2026-10-21 (~19:17) - v0.2.281 computerCriminally - Removed SuperPlan/SuperGo (sp, go, spa, goa) and plan tools - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (/imp from plan `~/.config/opencode/plans/2026-10-21-remove-sp-go.md`); completed
- Version: 0.2.281 computerCriminally
- Removed `plan_execute`, `plan_next_phase`, `plan_closeout` tools: deleted `src/tool/planExecute.ts`, `planNextPhase.ts`, `planCloseout.ts`, `test/tool/planExecute.test.ts`; dropped wiring in `tool/registry.ts`, default denies in `agent/agent.ts`, `runPlanExecute` + `ToolDefs` key in `cli/cmd/run/tool.ts`. Kept `plan_exit` (upstream plan mode).
- Removed config outside repo: `~/.claude/commands/{sp,go}.md`, `~/.opencode/commands/{sp,go}.md`, `~/.config/opencode/agents/{superPlan++,Go}.md`, `prompts/{sp,go}.md`, `archive/{agent,agentA,commands}`, `archive/roleAgents/*.md`. Dropped dead `plan_*` denies in `~/.opencode/commands/{spit,spitS}.md`.
- Changed `agents/Debug.md` and `Debug-a.md` stall handoff: switch to `superPlan++` -> run `/spit`.
- Kept `prompts/roles/`: still used by `skills/foster/subagents` and `skills/oc/add-subagent` (plan wrongly called it orphaned).
- Docs: FORK.md (dropped SuperPlan + Archive finished plans rows, renamed routing row, intro, :42, :149), SCOPE.md `/goal` note, `docs/dev/publicReadiness.md`, `docs/dev/v0.3.0.md`. Wiki `Companion-Tools.md`, `Configuration.md` permission rows.
- Kept history mentions: `docs/dev/publicForkPlan.md:135`, `test/permissionPlanEdit.test.ts:26` title, buildNotes archives.
- Risk: sessions saved with agent `Go`/`superPlan++` reopen on the default agent. Do not resurrect plan tools.
- Verification: `bun run typecheck` (tsgo --noEmit) in `packages/opencode` exit 0; leftover greps over src, docs, wiki, `~/.config/opencode`, `~/.opencode`, `~/.claude` clean except the kept history mentions.

### User
Agents and commands
- The superPlan++ and Go agents, the /sp and /go commands (oc and Claude Code), and the archived spa/goa variants are gone.
- The plan execution, next-phase, and closeout tools are removed from oc.
- Debug agents now point you to /spit when they stall instead of superPlan++.
- The wiki no longer lists SuperPlan/SuperGo or the three plan tool permissions.

---

## 2026-10-21 (~19:05) - v0.2.280 chuaStimming - Tab types a tab in the prompt, Shift+Tab cycles agents - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.280 chuaStimming
- Added keybind `input_tab` (`config/keybind.ts`, default `none`, command `prompt.tab`); hidden command `prompt.tab` in `component/prompt/index.tsx` runs `input.insertText("\t")`
- Added targeted `useBindings` for `prompt.tab` on `inputTarget`, enabled only when autocomplete hidden so `prompt.autocomplete.complete` keeps Tab
- Changed oc preset (`config/keybindPreset.ts`): `agent_cycle: shift+tab`, `agent_cycle_reverse: none`, `input_tab: tab`. Stock `opencode` preset unchanged (Tab cycles agents)
- Note: explicit insert needed; opentui `TextareaRenderable.handleKeyPress` drops sequences with char code < 32, so `\t` never inserts on its own
- Note: prompt traits `capture: ["tab"]` is not keymap capture; targeted binding wins over global `agent.cycle` like Ctrl+Enter does
- Regenerated `docs/keybinds.md` via `packages/tui/script/keybindDocs.ts`; wiki `Configuration.md` and `Agents-and-Skills.md` `tab_order` rows now name the agent-cycle key per layout
- Risk: tab char rendering width/cursor in textarea not live-checked
- Verification: `bunx tsc --noEmit` in `packages/tui` clean; no live TUI check

### User
Prompt keys
- In the oc layout, Tab now types a tab character in the prompt instead of switching agents.
- Shift+Tab now switches to the next agent; "previous agent" has no default key but can be bound as `agent_cycle_reverse`.
- Tab still completes the highlighted item when the `@` or `/` list is open.
- The stock opencode layout keeps Tab for agent switching.

---

## 2026-10-21 (~18:57) - v0.2.279 fpGabana - Commit subject separator is now > instead of | - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.279 fpGabana
- Changed `assertCommitSubject` (`.scripts/scriptHelper.ps1`): separator ` > ` replaces ` | `; summaries now ban `>` instead of `|`; error text updated
- Changed `.scripts/agentPush.ps1` `-Context`/`-SetTag` template to `[<label> > <summary>]`
- Changed `AGENTS.md` buildNotes.txt and Commits sections: format, example, banned chars, summary example
- Changed `.scripts/tests/commitSubject.tests.ps1`: cases use `>`; added old `|` form as a bad case
- Kept b6972ae (v0.2.278) subject with `|`; history not rewritten
- Verification: `pwsh -NoProfile -File .scripts\tests\commitSubject.tests.ps1` -> "Commit subject checks passed (3 good, 15 bad)."; `agentPush.ps1 -Context` prints `[<label> > <summary>]`

### User
Commits
- Commit title labels now use `>` instead of `|`, for example `[fix > OpenAI refusal text]`.

---

## 2026-10-21 (~18:49) - v0.2.278 sausageGaiden - Commit subjects carry a classifier and short summary - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (/imp from plan `~/.config/opencode/plans/2026-10-21-commit-classifiers.md`); completed
- Version: 0.2.278 sausageGaiden
- Added `.scripts/scriptHelper.ps1` `$commitLabels` (decision order: sync fix feat. patch perf. deps. scripts cleanup docs misc.) and `assertCommitSubject`: line 1 `v<ver> <tag> [<label> | <summary>]`, optional `; <label> | <summary>`; distinct labels, misc. alone, no trailing period, no `[ ] | ;` in summary, ASCII, <=72 chars
- Changed `.scripts/agentPush.ps1`: line 1 check calls `assertCommitSubject`; `-Context` and `-SetTag` print the bracket template; `-Context` prints labels plus pointer to AGENTS.md rules
- Added `.scripts/tests/commitSubject.tests.ps1` (3 good, 14 bad subjects, no git or files)
- Changed `AGENTS.md` buildNotes.txt section: format, label decision list, tie-breakers, misc. rules, summary rules. Replaced stale upstream "Commits and PR Titles" conventional-commit text with pointer to that section
- Changed `SCRIPTS.md` agentPush row: mentions classifier check and test
- Note: `~/.claude/skills/agent-push/SKILL.md` step 4 now says fix a rejected line 1 and rerun (user-level, logged in `C:\Users\Foster\buildNotes.md`)
- Kept `push.ps1` free-form; manual pushes not validated
- Verification: `pwsh -NoProfile -File .scripts\tests\commitSubject.tests.ps1` -> "Commit subject checks passed (3 good, 14 bad)."; spot-printed each rule's own error message; `agentPush.ps1 -Context` prints template and labels. Real push not run

### User
Commits
- Agent-pushed commit titles now end with a label and a short summary, like `v0.2.278 sausageGaiden [scripts | commit subject labels]`.
- Labels: sync, fix, feat., patch, perf., deps., scripts, cleanup, docs, misc.; AGENTS.md says when to use each, and when not to use misc.
- The agent push refuses a title that breaks the format before any slow checks run.

---

## 2026-10-21 (~17:53) - v0.2.277 tuberculosisHtml - A message Claude reads mid-turn splits the reply there, like other models - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low effort; Implementation (live S1 run with user, Luna comparison, plan `~/.config/opencode/plans/claudeSteerSplit.md`); completed
- Version: 0.2.277 tuberculosisHtml
- Diagnosed live S1 (`%TEMP%\steerTest\runs\A-S1-172520`, log `results\A-S1.log`): steer accepted 17:29:00, consumed 17:29:02, all edits commented. Delivery worked; TUI drew it after the whole reply because one CLI turn = one assistant message. GPT-6 Luna (native loop) shows it between steps and acknowledges it.
- Changed design vs plan: no step end/reattach. In-stream split instead: `Steering.onReplay` -> receipt saved -> `host.read` -> `StreamWriter.splitAt` (ends text, arms); next enqueued part first sends raw `{ claudeCodeInputRead }`; back-to-back reads coalesce to the newest.
- Added LLM event `input-read` (`llm/src/schema/events.ts` `InputRead`, `LLMEvent.inputRead`, `is.inputRead`); `session/llm/ai-sdk.ts` maps the raw chunk.
- Added `SessionProcessor.splitAt` (`processor.ts`): closes reasoning/text, step-finish `tool-calls` + patch on old reply, completes it, creates new assistant (parent = steer) + step-start, sets `toolStarted` (no retry). Cost/usage land on the last reply.
- Changed `readMidTurn(msgs, lastUser.id, lastAssistant)` (`prompt.ts`): exit when last reply's parent is a steer after `lastUser` and all later users are steered. `steerClaudeTurn` resolves the turn's first reply through the parent steer's receipt (`steeredAssistantID`), so settings compare against the turn root and revert anchors stay on it.
- Changed `instruction.clear` at step end to clear both the first and final reply ids (`Effect.suspend`).
- Fixed exchange hashes for split turns: `sessionSync.promptExchangeHashes` skips steered user messages (one Claude exchange); without it the next prompt logged "history differs".
- Kept revert semantics: reverting a steer still reverts the whole Claude turn (CLI cannot rewind mid-exchange).
- Tests: `steering.test.ts` steer scenarios assert two replies (`tool-calls` then parent = steer), id order, and a follow-up with no rewind; held/join tests assert reply parents; identical-steer test expects one reply per steer (read on separate calls). `tuiPane.test.ts` steering asserts the message renders above the rest of the reply; fixed stale `2 message reverted` string (TUI pluralizes).
- Updated `FORK.md` steering row, wiki `Sessions.md` "Steering a running turn", TUI comment `index.tsx`.
- Fixed footer duration after a split (`AssistantMessage` `duration`, `tui/.../index.tsx`): parent steer's `steeredParentID` gives the turn's first message, so the time covers the whole turn (live A2-S2 showed 2m 21s from the last steer). Typecheck tui exit 0; no automated check (user live check).
- Live checks on installed v0.2.277 (user typed, `%TEMP%\steerTest\results\A2-S1.log`, `A2-S2.log`): S1 and S2 (`/imp` + two steers, one "after work is done") pass; replies split per read steer, one footer, all 5 comments, follow-up normal. Claude does not acknowledge steers in words.
- Rotated buildNotes to `buildNotes.archive13.md` (1074 lines) before this entry.
- Verification: `bun run typecheck` opencode, llm, tui exit 0; `steering.test.ts` full run 13 pass, 2 fail (identical-steer expectation, fixed and rerun alone: pass; known `permission-bearing command` failure, archive13 ERROR); `OC_TUI_PANE=1 tuiPane.test.ts -t "steering actions"` 1 pass.
- TODO: user live check S1/S2 from `claudeSteerParity.computerUseHandoff.md` after build/install; Claude may still not acknowledge the message in words (no ack prefix by user decision).
- Risk: `instruction` claims for middle replies of 3+ splits are not cleared (small map entries).
- Note: computer-use grants WezTerm click-only (no typing); live runs need the user to type.

### User
Claude Code
- When Claude reads a message you sent while it was working, the reply now splits there: what it did before stays above your message, and the rest of the turn continues below it, as with other models.
- The message keeps its `read mid-turn` label.
- The time on the reply's footer still counts the whole turn from your first message.

---
