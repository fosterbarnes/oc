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
- Kept histories verbatim: archive1 (2026-08-20 through 09-09), archive2 (09-09 through 09-15), archive3 (09-15 through 09-28), archive4 (1144 lines), archive5 (1019 lines through v0.2.65), archive6 (1127 lines through v0.2.87), archive7 (1176 lines, v0.2.88 through v0.2.120, committed e4d73d1), archive8 (1152 lines, v0.2.120 through v0.2.148), archive9 (1059 lines, v0.2.149 through v0.2.172; its summary was archive8's carried unchanged, so archive9 is first summarized here), archive10 (1122 lines, v0.2.173 through v0.2.202), archive11 (1008 lines, v0.2.203 through v0.2.224). Archive8 retains the previous cumulative summary plus complete later entries, earlier hashes, checks, and risks. Never edit archives.
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

# Historical entries (newest first)

---

## 2026-10-18 (~18:45) - v0.2.233 manipulatedGlaze - Provider-neutral notices: shared question reminder, Claude internals log only - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low effort; Implementation (imp of `docs/dev/noticesPlan.md`); completed
- Version: 0.2.233 manipulatedGlaze (same session as the ~18:10 Notices entry; not bumped twice)
- Why: user saw the earlier Claude-only "still waiting" toast as provider-specific UX. Rule now: user-facing notices live in shared TUI attention; provider internals log.
- Added question reminder to `tui/src/feature-plugins/system/notifications.ts`: `questions` is now `Map<id, timer>`; 5 min after `question.asked` (`QUESTION_REMINDER_MS`, seam `_setQuestionReminderMs`) `remindQuestion` toasts info "Question waiting" (`"<title>" has waited 5 min for your answer.`) unless `api.route.current` is that session, and calls `attention.notify` with notification+sound `when: "blurred"`. Cleared on replied/rejected. Once per question. Gap kept: questions pending before TUI start get no reminder.
- Removed `toastProxyWait` from `proxyBroker.ts` (added in the ~18:10 entry); stall and deadline-approaching stay `log.notice` only.
- Changed `logger.ts`: removed `surface()`/toast/stderr fallback; warn/error now mirror to opencode.log via `ManagedRuntime.make(Observability.layer, { memoMap })` + `Effect.logWarning/logError` annotated `channel: "claude-code"`. Silent mode never writes stderr. Shared memoMap reuses the app's built logging layer; no app-runtime import cycle.
- Moved the 60 s per-toast repeat guard into `runtimeStatus.showToast` (key = title + message).
- Audit of ~70 warn/error sites: added plain-English `showToast` only for user-actionable ones: `agentModels.ts` unknown model / effort override, `proxyToolSelection.ts` unknown or colliding `proxyOpencodeTools`, `spawnPlanning.ts` unknown `proxyTools` (none-recognised variant too), `messageBuilder.ts` image link and unsupported media type. Rest log only (turn-ending errors already surface as `session.error`; warm-up shows its outcome in its own UI; MCP availability shows in MCP status).
- Tests: `notifications.test.ts` +3 (reminder fires with title; none after reply/reject; no toast while viewing); fixture `test/fixture/tui-plugin.ts` gained optional `toast` and `route`. `logger.test.ts` rewritten for no-stderr/no-toast plus a new opencode.log mirror test (reads the preload's temp `Global.Path.log`). `broker.test.ts` question-toast test removed.
- Docs: wiki `Troubleshooting.md` toast meanings rewritten (wiki push is user's), `FORK.md` Notices row, plan status.
- Verification: tui `bun test test/cli/cmd/tui/notifications.test.ts` 9 pass; opencode 17 claude-code test files (incl. logger, broker, agentModels, indexHooks, proxyMcp) 282 pass; `tsgo --noEmit` exit 0 in opencode and tui. Not run: live TUI check.
- MISTAKE: the ~18:10 entry shipped a Claude-only "Question waiting" toast that duplicated the shared attention system. Prevention: before adding a user-facing notice inside a provider, check `feature-plugins/system/notifications.ts` and keep notices provider-neutral.

### User
Notifications
- Any model's unanswered question now gets one "Question waiting" toast after 5 minutes, naming the session, if you are looking at a different session.
- Claude Code no longer shows its internal warnings as toasts; they go to `opencode.log` like everything else.
- Claude Code still tells you in plain English when an agent names a model or effort it does not have, when a proxy tool setting has an unknown name, or when an attached image or file was not sent.
- The "Tool still running" and "Tool near time limit" toasts are gone; a tool that runs out of time shows as a tool error in the chat.

---

## 2026-10-18 (~18:18) - v0.2.233 painedKool - Reasoning "Not set" renamed to "Auto" - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low effort; Implementation; completed
- Version: v0.2.233 painedKool (not re-bumped; already changed since last commit)
- Changed Reasoning row in `tui/src/component/dialog-subagents.tsx` `chooseEffort`: title "Not set" -> "Auto", dropped "chosen per run" footer; comments in same file and `opencode/src/config/config.ts` `writableGlobal` updated
- Verification: label/comment change only; no test references the label. Not re-run

### User
Subagents menu
- The reasoning option that lets each run choose is now called "Auto".

---

## 2026-10-18 (~18:14) - v0.2.233 painedKool - Subagents menu asks for reasoning after the native model pick - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low effort; Implementation; completed
- Version: v0.2.233 painedKool (already bumped since last commit by another session's entry; not re-bumped)
- Added `chooseEffort` in `tui/src/component/dialog-subagents.tsx`: after `DialogModel` for a native agent, single-choice `DialogSelect` "Reasoning" with "Not set" (value "") + the model's variants; current = agent variant when model unchanged. Back returns to the model picker. Models without variants save straight away with variant ""
- Changed `persistAgentModel` (`tui/src/ocSettings.ts`): optional `variant`; "" clears, undefined leaves unchanged (palette "Subagent model" still passes none)
- Changed `writableGlobal` (`opencode/src/config/config.ts`): agent `variant: ""` -> undefined so `patchJsonc` removes the key (JSON payload cannot carry undefined; same pattern as `shell: ""`)
- Not set = no fixed effort; caller can pass `provider/model#effort` per task call (`tool/task.ts:70`)
- Added tests: `opencode/test/config/config.test.ts` "removes an agent variant when the update sends an empty one"; tui `subagentDialog.test.tsx` "a native agent model with efforts asks for reasoning before saving"; updated native test to expect `variant: ""`
- Verification: tui `subagentDialog.test.tsx` 4 pass / 2 fail (known 2); `config.test.ts -t "variant|shell|subagent"` 10 pass (first run failed on my over-strict `toEqual`; fixed assertion); tui and opencode `bun run typecheck` exit 0. No live TUI run
- Kept: other session's uncommitted claude-code/toast changes untouched

### User
Subagents menu
- After picking a model for general or explore, you now choose its reasoning level; "Not set" leaves it open so each run can pick.

---

## 2026-10-18 (~18:10) - v0.2.233 manipulatedGlaze - Notices list and plain-English wait toasts - Opus 5.5, low effort; Build

### Agent
- Meta: Opus 5.5; low effort; Build; completed
- Version: 0.2.233 manipulatedGlaze
- Trigger: user saw raw toast "proxy call still waiting, no deadline" (question form unanswered 5 min) and read it as a failure. User picked: Notices list + clearer text; question stall as info toast.
- Added `ToastContext.notices` (`tui/src/ui/toast.tsx`): every `toast.show` kept newest-first, cap 100, per TUI run. Warning/error toasts render a muted "/notices to read again" line.
- Added oc palette **Notices** (`oc.notices`, `/notices`) in `ocCommands.tsx`: DialogSelect of snapshot, footer `Locale.todayTimeOrDateTime`, enter opens `DialogAlert` with `Locale.datetime` + full message. Empty list opens an alert, not a toast (a toast would itself become a notice).
- Added optional `title` to plugin `showToast` (`runtimeStatus.ts`); `logger.ts` `surface()` titles every plugin warn/error toast "Claude Code".
- Changed `proxyBroker.ts` stall and deadline-approaching lines from WARN to NOTICE (record only) plus `toastProxyWait`: looks up session title via raw client `GET /session/:id?directory=<cwd>` (session id = sessionKey part 2, only `ses_*`), fallback "a Claude Code session". Texts: "Question waiting" (info, question tool), "Tool still running" (warning), "Tool near time limit" (warning, mentions `proxyToolTimeoutMs`). Durations via `turnStats.formatDuration`. Did not import sessionManager (it imports proxyBroker).
- Kept: other ~85 plugin warn/error call sites still toast their raw log message (now titled + in Notices). TODO if wanted: human toast text per call site.
- Updated `broker.test.ts` (NOTICE asserts, new question-toast-names-session test), `logger.test.ts` (toast body has title), `FORK.md` row, wiki `Troubleshooting.md` (Notices + three toast meanings; wiki push is user's).
- Verification: `bun test` broker + logger (46 pass); `tsgo --noEmit` in opencode and tui packages exit 0. Not run: live TUI check.

### User
Notifications
- New **Notices** entry in the oc palette (`/notices`) lists every toast since oc started, with its time, and opens any one in full.
- Warning and error toasts now say "/notices to read again", so a message that vanished can be found.
- Claude Code warnings and errors now show the title "Claude Code" so you can tell where they came from.
- The 5-minute "still waiting" toast is now plain English and names the session, for example "Question waiting: A question in "Fix toasts" has waited 5m 0s for your answer", and shows as info rather than a warning.
- Long-running subagent and near-time-limit toasts are reworded the same way.

---

## 2026-10-18 (~17:54) - v0.2.232 aurousOriginaly - Subagents menu shows the new native model after saving - Opus 5.5, low effort; Debug

### Agent
- Meta: Opus 5.5; low effort; Debug; completed
- Version: v0.2.232 aurousOriginaly (already bumped this session, not re-bumped)
- Fixed: Subagents dialog kept the old model after Enter on general/explore. Cause: `GlobalHttpApi.configUpdate` (`opencode/src/server/routes/instance/httpapi/handlers/global.ts:122-123`) forks instance dispose after the PATCH returns, so the dialog's immediate `app.agents` refetch read the pre-reload list
- Changed `DialogSubagents` agents resource to key on `sync.configReloadEpoch` (bumped by sync after a global `server.instance.disposed` bootstrap), so it refetches once the server reloads
- Changed test: mock `/agent` reports the new model only after `server.reloaded`; test asserts old frame lacks "Sample", emits global `server.instance.disposed`, waits for "Sample"
- Verification: `bun test test/cli/tui/subagentDialog.test.tsx` 3 pass / 2 fail (known 2). New test fails with the epoch key removed and passes with it. tui `bun run typecheck` exit 0. No live TUI run

### User
Subagents menu
- After you pick a new model for general or explore, the menu now shows that model instead of the old one.

---

## 2026-10-18 (~17:50) - v0.2.232 aurousOriginaly - Enter on general/explore in Subagents picks their model - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low effort; Implementation (/spit then /imp); completed
- Version: v0.2.232 aurousOriginaly
- Added `persistAgentModel(client, name, model, toast)` in `tui/src/ocSettings.ts`: PATCH `/global/config` `{ agent: { [name]: { model } } }` + toast
- Changed `DialogSubagents` (`tui/src/component/dialog-subagents.tsx`): Enter on a `native` row (general, explore) opens `DialogModel` (`current` = agent model, `updateCurrent={false}`), saves via `persistAgentModel`, reopens highlighted on that row; back also reopens. Non-native rows keep copy-on-Enter. Footer hint `change model`/`copy` by row
- Changed "Subagent model" palette entry (`tui/src/ocCommands.tsx`) to use `persistAgentModel` instead of its inline update
- Kept: model only; existing `variant` on the agent is not cleared. Risk: a configured effort the new model lacks carries over (no general/explore overrides in opencode.jsonc today)
- Added test in `tui/test/cli/tui/subagentDialog.test.tsx`: mocked `general` native agent, wrapped fetch captures `/global/config` PATCH bodies; asserts `{ agent: { general: { model: "test/sample" } } }`
- Verification: `bun test test/cli/tui/subagentDialog.test.tsx` 3 pass / 2 fail; the 2 are the known failures (AGENTS.md Known failures), same 2 fail with changes stashed; new test passes. `bun run typecheck` in tui exit 0. No live TUI run

### User
Subagents menu
- Pressing Enter on general or explore in the Subagents menu now opens the model picker, and the chosen model is saved for that agent.
- Other subagent rows still copy their name on Enter.

---

## 2026-10-18 (~14:56) - v0.2.231 wooooooooooooooooOutfit - launchDetached return type fixes prePush typecheck - Opus 5.5, default effort; Agent

### Agent
- Meta: Opus 5.5; default effort; Agent (agent-push, fix after prePush failed); completed
- Version: 0.2.231 wooooooooooooooooOutfit (tag rerolled from herosComplimented via `agentPush.ps1 -SetTag`; no bump)
- ERROR: prePush typecheck failed in core `test/util/launchDetached.test.ts:14` (`OC_LAUNCH_ARGV` missing on the inferred env union). Same cause as the 2 opencode errors the 02:03 entry reported (`launcherSafety.test.ts:139`, `revive.test.ts:150`): each branch of `detachedCommand` inferred its own env shape
- Fixed `core/src/util/launchDetached.ts`: `detachedCommand` returns `DetachedCommand` (`options: SpawnOptions & { env: NodeJS.ProcessEnv }`). No runtime change
- Verification: core and opencode `bun run typecheck` exit 0; core `bun test test/util/launchDetached.test.ts` 3 pass

### User
Push checks
- Fixed a type error that blocked the pre-push typecheck; no behavior or UI change.

---

## 2026-10-18 (~14:47) - v0.2.231 wooooooooooooooooOutfit - Session pass: batched prePush Prettier, doc corrections - Opus 5.5, default effort; Pass

### Agent
- Meta: Opus 5.5; default effort; /pass over this chat's Prettier + noise-audit work; completed
- Version: 0.2.231 wooooooooooooooooOutfit (already bumped this session; no second bump)
- Fixed `.scripts/prePush.ps1` Prettier step: changed files now go to Prettier in batches of 200. One command line with every path would exceed the Windows 32,767-char limit on large pushes (v0.2.172 and v0.2.174 each changed 1,500-1,900 src files, 78-97 KB of paths) and fail prePush
- Fixed `src/script/format.ts` comment: nested `.gitignore` files exist (`packages/opencode`, `plugin`, `sdk`, `sdks/vscode`, `github`, `artifacts`). Behavior unchanged: every git-ignored file on disk under `src` already reports `ignored: true` with format.ts's ignore paths
- Changed AGENTS.md: opencode preload timeout bullet says a CLI `--timeout` has no effect there (probed: 3 s test passed under `--timeout 2000`; `script/profile-test-files.ts` `TEST_PROFILE_TIMEOUT` is now inert); known-failures header no longer claims the flaky steering entry was confirmed
- Kept preload `setDefaultTimeout(30000)`: Bun gives the preload no view of CLI flags (`process.argv` lacks `--timeout`), and every repo script passes 30000 anyway
- Verification: batch slicing covers a synthetic 1,900-path list exactly once (longest batch 7,199 chars); batched read-only `prettier --list-different` over the 23 real changed files ran 3 batches without error; `format.ts` and `preload.ts` pass `prettier --check`. Full prePush not run (typecheck)

### User
Push checks
- The pre-push formatting step no longer breaks on very large pushes such as upstream syncs.
- AGENTS.md now says a custom test timeout flag is ignored in the main package, and the known-failures note is worded accurately.

---

## 2026-10-18 (~14:34) - v0.2.231 wooooooooooooooooOutfit - Effect reference cache actually repaired - Opus 5.5, default effort; Debug

### Agent
- Meta: Opus 5.5; default effort; Debug; completed (follow-up to the noise audit below)
- Version: 0.2.231 (user data only, no bump)
- ERROR: after the stale `index.lock` was deleted, every hourly refresh still failed (11 warnings, 07:10-17:53Z): `checkout -B main origin/main` refused "untracked working tree files would be overwritten". The interrupted August checkout had left 2,163 staged deletions with the files still on disk; `repository-cache.ts` runs checkout before `resetHard`, so it never self-heals from that state
- Fixed (user data): in `~\.local\share\opencode\repos\github.com\Effect-TS\effect-smol` ran `reset --hard HEAD`, `fetch origin`, `checkout -B main origin/main`, `reset --hard origin/main`; 0 dirty entries, 2,163 tracked files
- Note: effect-smol is archived (origin/main `3a1128c` 2026-07-14 "Update readme with archive notice"; V4 moved to `Effect-TS/effect` main). Frozen at `effect` 4.0.0-beta.98, newer than oc's pinned 4.0.0-beta.83, so the `.opencode/opencode.jsonc` reference stays. Revisit when oc moves past beta.98
- MISTAKE: previous entry claimed the next refresh would heal the cache without checking the refresh order. Rule: after a one-time repair, confirm the next real run succeeds (log or state) before reporting it fixed
- Verification: cache `git status --short` empty; `git log -1` = origin/main. Next oc refresh not yet observed

### User
Agent noise
- The Effect reference docs that agents read are now a clean, complete copy; the earlier fix only removed the first of two problems.

---

## 2026-10-18 (~03:12) - v0.2.231 wooooooooooooooooOutfit - Agent noise audit: test timeout, line endings, known failures - Opus 5.5, default effort; Implementation

### Agent
- Meta: Opus 5.5; default effort; Implementation; completed (same chat as the Prettier entry below)
- Version: 0.2.231 wooooooooooooooooOutfit
- Audit: `~\.local\share\opencode\plans\1792307014350-agent-noise-audit.md` (259 MISTAKE/ERROR lines across all build notes, opencode.log 10-15..10-18, git EOL state, Bun probes)
- Added `setDefaultTimeout(30000)` to `packages/opencode/test/preload.ts`. Bun 1.4.1 ignores bunfig `[test] timeout` (probed); bare `bun test <file>` used 5 s (9 past entries). Preload value also overrides CLI `--timeout`; per-test timeouts still win
- Added AGENTS.md General Principles bullet: working-tree EOL irrelevant (`* text=auto eol=crlf` stores LF; prePush `setCrlf` restores CRLF); do not check/convert EOL. Supersedes summary "Subagents leave LF/mixed EOL: check EOL"
- Changed local git config `core.safecrlf=false` (this clone only): `git diff` LF->CRLF warnings 7 -> 0. LF writers remain (scriptHelper version/tag, `keybindDocs.ts`, bun.lock); harmless
- Added AGENTS.md Testing bullets: opencode preload timeout; Known failures list (prompt.test.ts F5, subagentDialog 2, test:httpapi missing `/agent/sub` x3, steering flaky)
- Removed from baseline: `warmupFakeModel` (3 pass), `probe.test.ts` teardown (fixed earlier), `accountPool.test.ts` CLAUDE_CONFIG_DIR note (19 pass with 15 inherited CLAUDE* vars; test pins it). Summary line "accountPool needs CLAUDE_CONFIG_DIR unset" is stale
- Fixed (user data, not repo): deleted 0-byte `~\.local\share\opencode\repos\github.com\Effect-TS\effect-smol\.git\index.lock` dated 2026-08-20; every reference refresh failed (270 warnings/4 days), checkout stuck at 2026-07-14 with half-applied deletions. RepositoryCache refresh fetches + hard-resets on next boot
- Removed (user data): 4 folders in `~\.claude\skills\.trash`; upstream skill loader scans `~/.claude/skills/**` with `dot: true`, so trashed skills loaded and re-logged `duplicate skill name` (2,511 of 3,634 WARN/ERROR lines)
- Kept (not fixed, upstream code): `duplicate skill name` from `synced/` account copies; `failed to getPrompt` avalonia-docs `recreate-ui` (460): command list MCP `template` getter (`command/index.ts:146`) passes `$1` to an enum arg
- Risk: version bumped although another session already bumped since HEAD; AGENTS.md "once per session" applied, earlier entry in this chat did not bump
- Verification: 6 s probe test passes under bare `bun test` in packages/opencode (probe file removed, Test-Path false). Confirming runs: prompt.test.ts 64 pass/1 fail (F5); subagentDialog 2 pass/2 fail; test:httpapi pass=222 missing=3 exit 1; warmupFakeModel 3 pass; steering 14 pass; accountPool 19 pass. Worktree had another session's uncommitted PerfReview changes during these runs
- ERROR: OpenCode Console API key expired: `title model failed` (opencode/mimo-v2.6-flash-free, 28 on 10-18) and `failed to load OpenCode provider config` 401. User action

### User
Testing
- Running a single test file in the main package no longer fails slow tests at 5 seconds; it now uses the same 30-second limit as the package test script.
- AGENTS.md now lists the tests that are known to fail, so agents compare against that list instead of re-proving old failures each session.

Agent noise
- Agents are told line endings in the working tree do not matter, and git no longer prints "LF will be replaced by CRLF" warnings in this clone.
- Cleared a two-month-old stale git lock that kept the Effect reference docs from updating, and emptied Claude's skills trash folder that was flooding the log with duplicate-skill warnings.
- Your OpenCode Console API key has expired, so session titles from that provider fail until you replace or remove it.

---

## 2026-10-18 (~02:54) - v0.2.230 powerwashFun - Prettier runs at push; format script honors root gitignore - Opus 5.5, default effort; Implementation

### Agent
- Meta: Opus 5.5; default effort; Implementation; completed except plan step 4 (blocked on dirty tree)
- Version: 0.2.230 (already bumped since last commit by a concurrent session; no extra bump)
- Plan: `~/.config/opencode/plans/prettierFormatting.md`. Root cause: fork removed upstream's generate/format workflow, so 205 tracked `src` files drifted; all 92 upstream-derived ones are clean at upstream `abce98e0eb` (drift is fork-made; formatting moves toward upstream).
- Fixed `src/script/format.ts`: `--ignore-path ../.gitignore --ignore-path .prettierignore`, cwd pinned to `src`. Before, it rewrote ~320 ignored files (`.turbo/cache`, `dist`, `sdk/js`).
- Added `packages/core/schema.json`, `packages/opencode/config.json` to `src/.prettierignore` (generator output via `JSON.stringify`; would flip-flop).
- Added prePush step (`.scripts/prePush.ps1`, before `setCrlf`): Prettier `--write --ignore-unknown --log-level warn` on `git -C src ls-files -m -o --exclude-standard`, existing files only.
- Added `AGENTS.md` General Principles bullet: no manual Prettier, no Prettier verification claims, no hand-reverting its output.
- TODO: plan step 4 baseline (`bun script/format.ts` from `src`, ~203 files) on a clean tree as its own commit; optional `.git-blame-ignore-revs` after.
- Verification: `prettier --check script/format.ts` clean; ignore-path list = 203 tracked files, none ignored/generated; prePush block run by hand with `--list-different` instead of `--write` (22 changed files listed, unknown types skipped, cwd restored, 9 would format). No files written by Prettier; full `prePush.ps1` not run.

### User
Formatting
- Pushing now auto-formats changed code files under `src` with Prettier, so agents no longer argue about or revert formatting noise.
- The whole-repo format script no longer touches build output; run it once on a clean tree to clear the existing drift.

---

## 2026-10-18 (~02:53) - v0.2.230 powerwashFun - Cursor fixes rechecked live; native Glob/Grep paths sent with forward slashes - Opus 5.5, default effort; Implementation

### Agent
- Meta: Opus 5.5; default effort; Implementation (follow-up to the 02:46 entry, after the user's 02:50 rebuild); completed; Glob path recheck pending a build
- Version: 0.2.230 powerwashFun (no bump: version already changed since the last commit)
- Verified live on Composer 2.5 and Grok 4.6 low (`ses_eb237b931ffel6qFuiSVSLy2ag`, `ses_eb237b92bffeRefo2kLCJ4xo2B`):
  - negative-offset reads return lines 300 / 298-300;
  - case-insensitive grep finds both files;
  - no-match now reads `0 files found`.
- Fixed `cursor/protocol/execResult.ts` `grep_result`: relative backslash paths still rendered as `../src\deep\b.ts`.
  - Both that and the original `../C:\...` fit Cursor showing each file relative to the workspace key with POSIX path rules.
  - Key and files now go out absolute with forward slashes (`forwardSlashes`); removed `pathUnder`.
- Changed `opencode/test/provider/cursor/toolMapping.test.ts` grep_result case to forward-slash absolute paths.
- Verification: `bun test test/provider/cursor/toolMapping.test.ts` 4 pass 0 fail; `tsgo --noEmit` no Cursor errors; CRLF kept.
- TODO (user): rebuild; then rerun native Glob on both models and expect `src/a.ts`-style paths with no `../`.

### User
Cursor
- Reading the end of a file and case-insensitive search now work for Cursor models (confirmed live on Composer and Grok).
- Native file search results are now sent in a form Cursor shows as clean paths instead of `../src\...`; needs a rebuild to check.

---

## 2026-10-18 (~02:46) - v0.2.230 powerwashFun - Cursor tool fundamentals: negative read offset, case-insensitive grep, native Glob/Grep/ls results - Opus 5.5, default effort; Debug

### Agent
- Meta: Opus 5.5; default effort; Debug (live subagent tests on Composer 2.5 and Grok 4.6 low, then fixes); completed; live recheck pending a build
- Version: 0.2.230 powerwashFun (no bump: version already changed since the last commit)
- Tested read/edit/write/delete/grep/glob/shell/parallel/web/skill on both models against fixtures; verified via DB tool parts and disk bytes. Results table: `~/.config/opencode/plans/oc/cursorAfterClaudeChanges.plan.md` Phase 4.
- Fixed `cursor/protocol/execParse.ts` read: negative Cursor offset (-1 = last line) was dropped (`offset > 0` only), so the read returned line 1. Now resolved with `fileLineCount` (trailing newline is not a line, same as oc read). Relative paths keep the old behavior.
- Fixed `execParse.ts` grep: `case_insensitive` was dropped. Now an inline `(?i)` prefix (ripgrep).
- Changed `execParse.ts` `parseExecServerMessage`: `grep_args` now sets `resultMetadata.path` to the searched path.
- Fixed `cursor/protocol/execResult.ts` `grep_result`:
  - Removed `extractPathLines`, which kept lines containing `/`. Windows paths have none, so every line went through, incl. "No files found" and `Line N:`.
  - New `extractResultPaths` keeps only absolute paths and grep `<path>:` headers.
  - `pathUnder` makes them relative to the searched folder, which is now the `workspace_results` key; absolute paths rendered as `../C:\...` in Grok.
- Fixed `execResult.ts` `ls_result`: the same parser listed `<path>`/`</entries>` as files and dropped plain names. New `readDirectoryEntries` reads the `<entries>` block; `name/` entries go to `children_dirs`. Found by reading only (neither model exposed a native ls).
- Added `opencode/test/provider/cursor/toolMapping.test.ts` (real oc output shapes). Fail-on-old-code check not done (user stopped it).
- Changed user config `~/.config/opencode/cursorInOpencode.md` (user decision): Cursor shells run in the foreground with a long `timeout`; removed `bgStatus`/`bgKill` and the `background: true` mapping.
  - Cause: Cursor native Shell has no background flag, and `background_shell_spawn_args` becomes a POSIX `nohup` wrapper that `shellTimeout.ts` refuses on Windows. Neither model reached oc background jobs.
- Verification: `bun test test/provider/cursor/toolMapping.test.ts` 4 pass 0 fail; `tsgo --noEmit` in opencode has no Cursor errors (the 2 known `launchDetached` test errors remain, from other work). CRLF kept in all edited files.
- ERROR (agent): the user-stopped revert check had already run its first half: `git show HEAD:...` overwrote `execParse.ts`/`execResult.ts` before the rejection. Restored from the backup it made first; diff, tests and EOL re-checked.
- MISTAKE: a destructive "revert to verify" step on files in a shared tree. Rule: verify fail-on-old-code in a temp copy (for example a scratch worktree), never by overwriting the working files.
- TODO (user): rebuild, then rerun the read-last-line, case-insensitive grep and native Glob tests on both models.

### User
Cursor
- "Read the last lines of a file" now returns the end of the file instead of line 1.
- Case-insensitive searches from Cursor models now really ignore case.
- Native file searches and directory listings no longer show "No files found" or odd `../C:\` paths as results on Windows; paths are shown relative to the searched folder.
- Cursor models are now told to run shell commands in the foreground with a long timeout, because background shells don't work for them on Windows.

---

## 2026-10-18 (~02:41) - v0.2.230 powerwashFun - Exact slash command match ranks first - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low effort; Implementation; completed
- Version: 0.2.230 (already bumped this uncommitted cycle)
- Added `withExactSlashFirst` in `tui/src/component/prompt/autocomplete.tsx`: in "/" mode, option whose name (display minus `:(label)`) or alias equals `/<search>` goes first, pulled from all options so fuzzysort limit 10 can't drop it
- Added test in `tui/test/component/autocomplete.test.ts`
- Verification: `bun test test/component/autocomplete.test.ts` 2 pass; tui `tsgo --noEmit` exit 0

### User
Slash commands
- Typing a slash command's full name, such as `/think`, now puts that exact command at the top of the list and selects it, even when longer names like `/thinking` also match.

---

## 2026-10-18 (~02:37) - v0.2.230 powerwashFun - Remove /thinking slash command - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low effort; Implementation; completed
- Version: 0.2.230 (already bumped this uncommitted cycle)
- Removed `slash` (`thinking`, alias `toggle-thinking`) from `session.toggle.thinking` in `tui/src/routes/session/index.tsx`; palette entry and keybind kept
- Verification: skipped (one-property removal); no other refs to `/thinking` or `toggle-thinking`

### User
Slash commands
- `/thinking` no longer appears in the slash menu, so typing `/think` goes straight to your command; the expand/collapse thinking toggle is still in the command palette.

---

## 2026-10-18 (~02:20) - v0.2.230 powerwashFun - Rename dialog copies session name; ctrl+c no longer closes dialogs in oc layout - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low effort; Implementation (/spit plan then /imp); completed
- Version: 0.2.230 powerwashFun
- Added keybinds `dialog.close` (default `ctrl+c`) and `dialog.session_rename.copy` (default `ctrl+c`) in `packages/tui/src/config/keybind.ts`.
- Changed `ui/dialog.tsx` stack layer: hardcoded `ctrl+c` close binding replaced by registered `dialog.close` command bound from config; `escape` binding unchanged; selection guard unchanged.
- Added `"dialog.close": "none"` to oc preset (`config/keybindPreset.ts`). User `keybinds` override still wins (`config/index.tsx` resolveKeybinds merge order).
- Added `actions` prop to `DialogPrompt` (`ui/dialog-prompt.tsx`): commands + config bindings in the existing textarea-targeted priority-1 layer, footer hints via `ActionHint` (hidden when unbound). Mirrors `DialogSelect` actions.
- `component/dialog-session-rename.tsx`: copy action writes saved `session.title` (not edited draft) to clipboard, toast "Copied session name", dialog stays open.
- Regenerated `docs/keybinds.md` via `packages/tui/script/keybindDocs.ts`. Updated wiki `Keybinds.md`, `Configuration.md` (local clone, not pushed).
- Test harness `test/cli/tui/dialog-prompt.test.tsx` now opens the prompt through `dialog.replace` (production path) so stack bindings apply; fixture `createTuiResolvedConfig` resolves to the oc preset by default.
- Verification: `bun test test/cli/tui/dialog-prompt.test.tsx` from `packages/tui`: 5 pass, 0 fail (2 existing + 3 new: action beats ctrl+c close, oc keeps dialog open, `dialog.close` override restores close). Typecheck not run.

### User
Rename session
- Pressing `ctrl+c` in the Rename Session dialog copies the session's current name and keeps the dialog open; the footer shows the key.
- The key is configurable with `keybinds["dialog.session_rename.copy"]`, or `"none"` to turn it off.

Dialogs
- In the oc keybind layout, `ctrl+c` no longer closes menus and dialogs; `esc` still does.
- To get stock behavior back, set `keybinds["dialog.close"]` to `"ctrl+c"` or switch Keybind layout to opencode.

---

## 2026-10-18 (~02:03) - v0.2.229 trePeice - Cursor review after Claude harness changes; Cursor now told the real shell (pwsh) - Opus 5.5, default effort; Debug

### Agent
- Meta: Opus 5.5; default effort; Debug (review, live Cursor subagent checks, one fix); completed
- Version: 0.2.229 trePeice (no bump: version already changed since the last commit)
- Reviewed Claude harness changes v0.2.190-229 for Cursor impact. Claude-only paths are gated by `isClaudeCodeProvider` (`session/llm/request.ts`, `llm.ts`, `prompt.ts`, `tools.ts`), and `provider/cursor` imports nothing from `claude-code`. No cross-impact regression found. Plan and evidence: `~/.config/opencode/plans/oc/cursorAfterClaudeChanges.plan.md` and `cursorAfterClaudeChanges.md`.
- Note: the main DB has no real Cursor turns between 10-16 15:47 and this session (v0.2.220+). Live subagent checks on the installed build (rebuilt 10-18 01:38 from this tree) passed:
  - Composer two-turn checkpoint reuse: turn 2 `in=119 cacheR=10394`, so the v0.2.225 durable path works.
  - Composer tool breadth incl. `time`/`schedule_list`.
  - Grok read/write/bash/time.
- Fixed `provider/cursor/context/env.ts`: RequestContext `env.shell` was `process.env.SHELL || "/bin/bash"`. `SHELL` is unset on Windows, so Cursor models assumed Git Bash. Grok ran `mkdir -p "/c/ocTestTmp/..."` and pwsh created `C:\c\ocTestTmp`. Now `Shell.acceptable(configuredCursorShell())`, the same shell `tool/shell.ts:679` runs.
- Added `configuredCursorShell()` in `shellTimeout.ts`, which returns the config-hook value already stored there.
- Note: RequestContext base is frozen per Cursor conversation in memory; the new hint applies after rebuild/restart.
- Added `opencode/test/provider/cursor/env.test.ts` (CRLF like neighbors).
- Changed user config (outside repo, user approved):
  - `~/.config/opencode/cursorInOpencode.md`: dropped the stale `cursor-opencode-provider@0.6.2` npm-patch note and the background-subagent env-var sentence (the flag is set at user level, and `task` hides `background` when it is off).
  - `~/.opencode/skills/host-skills/SKILL.md`: removed the vendor link.
  - Deleted `~/.opencode/vendor/cursor-opencode-provider` and the then-empty `vendor` folder (unused; npm id `cursor-opencode-provider` maps in-tree at `provider/provider.ts:155`).
- Verification: `bun test test/provider/cursor/env.test.ts` 1 pass (3 runs). First run had an unnamed hook timeout, which did not recur (cold start). `tsgo --noEmit` in opencode: no errors in Cursor files.
- ERROR: `tsgo --noEmit` reports 2 errors in `test/cli/launcherSafety.test.ts:139` (`OC_LAUNCH_ARGS`) and `test/config/revive.test.ts:150` (`OC_LAUNCH_STYLE`). They come from the uncommitted v0.2.229 `launchDetached` change (env type is now a union), not from this session. Not fixed.
- TODO (user): live check in a new Cursor chat after the build: `bash` uses PowerShell syntax and no `C:\c\` folder appears. Delete the stray `C:\c\ocTestTmp\cursorLive2`. Remaining Cursor live checks (auto-title memory, mid-turn message, Esc, restart) are listed in the plan.

### User
Cursor
- Cursor models are now told your real shell (PowerShell on Windows) instead of `/bin/bash`, so they stop writing Git Bash paths like `/c/...` that created a stray `C:\c\` folder.
- A review found that the recent Claude Code changes did not affect how Cursor models work; live Composer and Grok checks passed.
- The Cursor instructions file no longer mentions an old npm patch, and the unused vendor folder was removed.

---

## 2026-10-18 (~01:36) - v0.2.229 trePeice - .ps1 launches no longer let arguments run cmd commands - Opus 5.5, default effort; Implementation

### Agent
- Meta: Opus 5.5; default effort; Implementation; completed
- Version: 0.2.229 trePeice
- Fixed cmd injection in `core/src/util/launchDetached.ts` `.ps1` path: `windowsArguments` writes `"` as `\"`, which cmd does not honor, so arg `a" & cmd & "b` ran `cmd`, and `%VAR%` in args expanded. Exposure was `run_after_turn` (permission keys on `exe` only).
- Changed `.ps1` line to constant `cmd /d /v:on /c start "<title>" pwsh -NoProfile -File !OC_LAUNCH_ARGV!`; env `OC_LAUNCH_ARGV = windowsArguments([file, ...args])`. Delayed expansion runs after cmd parses metacharacters and is not re-parsed. `-File` kept, so named params bind as before.
- Changed `consoleTitle` (was inline in removed `startScript`): strips `" % ! ^` (was only `"`). Changes `HKCU\Console` key only for script names with those chars.
- Kept: `OC_LAUNCH_ARGV` is inherited by the script (cmd cannot unset before `start`), same as `OC_REVIVE_ARG_*`.
- Risk: `config/revive.ts` `consoleStart` uses `"%OC_REVIVE_ARG_n%"` with `/v:off`; phase-1 expansion is re-parsed, so a value with `"` would break out. Current values cannot contain `"`. Follow-up: same `/v:on` + `!VAR!` pattern, with a live check that `start` finds the program from expanded text.
- Risk: `run_after_turn` with `.bat`/`.cmd` goes through `Start-Process`, which hands batch files to `cmd /c`, so args are re-parsed by cmd. Not fixed.
- Rewrote `core/test/util/launchDetached.test.ts`: the old assertion enshrined the bug. Now asserts the constant command line, env value, and title stripping. Added a Windows-only live test: a temp `.ps1` writes `$args` as JSON; asserts exact round trip of `&`/`%`/`!`/trailing `\`/`-Flag` args and that the injection target file is absent.
- Verification: `bun test test/util/launchDetached.test.ts` in `src/packages/core`: 3 pass, 0 fail. Scratch run of the old command line with the same payload created the injection file, so the live test catches the old bug.
- MISTAKE: the first live-test payload quoted the redirect path, which the old quoting would not have run either, so it could not fail on the old code. Rule: confirm a regression test fails against the old code before trusting the pass.

### User
Security
- Arguments passed to a `.ps1` through `run_after_turn` can no longer break out and run extra cmd commands, so an "always" approval for a script only ever runs that script.
- Arguments containing `%`, `!`, `^`, quotes or a trailing backslash now reach the script exactly as written; no UI change.

---

## 2026-10-18 (~01:22) - v0.2.228 swagGap - /update verifies each zip against GitHub's published SHA-256 - Opus 5.5, default effort; Implementation

### Agent
- Meta: Opus 5.5; default effort; Implementation; completed
- Version: 0.2.228 swagGap
- Added `OcRelease.Asset.sha256` (`core/src/util/ocRelease.ts`): `parse` keeps the hex from the API's `digest` (`sha256:<64 hex>`); malformed or missing leaves it unset.
- Changed `Revive.downloadRelease` (`opencode/src/config/revive.ts`): refuses an asset without `sha256`; reads the body to bytes, hashes with `Bun.CryptoHasher`, throws on mismatch before `Bun.write`/`tar`. Still runs before shutdown.
- Changed `reviveHost.ts` step label to `Downloading and verifying oc v<release>`.
- Kept trust root = GitHub account (user decision). Rejected signed-manifest/offline-key and Authenticode plans: Authenticode cannot cover `cursor-runtime/main.mjs` in the zip; offline key blocks forks. Plan: `~/.config/opencode/plans/oc/updateSignedManifest.md`.
- Docs: `FORK.md` update row, `SCRIPTS.md` release section, wiki `Launching.md` (user pushes wiki).
- TODO (user): enable repo "Release immutability"; on next release confirm `gh release create <tag> <files>` still works with it on (fallback: `--draft` then `gh release edit --draft=false`).
- Verification: `bun test test/util/ocRelease.test.ts` (core) 5 pass 0 fail, lookup test now returns real-shape `digest` values. `tsc --noEmit` in `packages/opencode` exits 2, no errors in touched files. `downloadRelease` not exercised; live `/update` after next release.

### User
Updates
- `/update` now checks each downloaded zip against the SHA-256 hash GitHub shows on the release page, and cancels the update if the hash is missing or different.
- The progress line reads "Downloading and verifying oc v<version>".
- You can check a release by hand by running `Get-FileHash <zip> -Algorithm SHA256` and comparing it with the release page.

---

## 2026-10-17 (~14:50) - v0.2.227 axesShittn - P4 probe teardown no longer fails; scrollback surface checked against the OpenTUI patch - Opus 5.5, default effort; Implementation

### Agent
- Meta: Opus 5.5; default effort; Implementation (follow-up to stream smoothness v0.2.226 and startup payload v0.2.227, both uncommitted); completed
- Version: 0.2.227 axesShittn (no bump: version already changed since the last commit)
- Fixed `test/perf/probe.test.ts` pacing proxy: upstream `fetch` and body read now `.catch` to a 502 response. Cause: TestLLMServer closes before the pane at teardown while the pane's oc still calls the model, and a throw inside the `Bun.serve` handler fails the bun test ("Unable to connect", ConnectionRefused). Bug predates v0.2.226.
- Verification: `bun test test/cli/run/scrollback.surface.test.ts` against the patched OpenTUI (`@opentui%2Fcore@0.5.14.patch`): 16 pass, 1 skip (`skipIf(win32)`, file unchanged), 0 fail. P4 `run-1792262819672-P4`: 1 pass, 0 fail, cleanup verified, isolation checked; frames/s 26.2 / 26.7 / 26.9 (no tool / 1 / 4 tools), confirming the spinner phase-lock (was 26.0 / 37.5 / 48.5).
- Note: probe.test.ts kept CRLF.

### User
Tests
- The spinner performance probe no longer reports a false failure when it shuts down.
- The terminal scrollback check still passes with the new instant code-block streaming.

---

## 2026-10-17 (~10:03) - v0.2.227 axesShittn - Lighter TUI startup: provider summary endpoint replaces the 8.3 MB provider list - Opus 5.5, default effort; Implementation

### Agent
- Meta: Opus 5.5; default effort; Implementation (option A of `~/.config/opencode/plans/streamSmoothness/startupPayload.md`, user-chosen); completed; user live check pending a build
- Version: 0.2.227 axesShittn
- Note: runs after the v0.2.226 stream-smoothness session (same uncommitted tree); no shared source files.
- Found: native startup sent 12.8-13.6 MB over the worker RPC bridge. 8.3 MB was `GET /provider` (sync.tsx bootstrap, blocking): 234 models.dev providers, 9,044 models. TUI read only `all[].id/name` (Connect dialog, model-dialog onboarding) and `connected` (Connect gutter, `contextLimit.tsx`); `default` unused.
- Found: cost on the TUI thread about 105 ms in one block: envelope `JSON.parse` in `rpc.ts` about 18-23 ms, SDK body parse about 15-17 ms, Solid `reconcile` about 65 ms (its `unwrap` walks every object; about 77 ms again on each re-bootstrap). Worker answered 0.38-0.42 s after `/config/providers` (`fromModelsDevProvider` + `toPublicInfo` per provider + encode), so the blocking bootstrap waited for it.
- Added `Provider.SummaryResult` (`opencode/src/provider/provider.ts`): `{ all: { id, name }[], connected: string[] }`.
- Added `GET /provider/summary` (`provider.summary`) in `httpapi/groups/provider.ts`; handler `summary` in `handlers/provider.ts`. Moved list's provider selection into `selectProviders` (enabled/disabled filter over ModelsDev, loaded providers on top, `connected` = loaded or has credentials, same key order as `Object.assign`); `list` output unchanged; `summary` skips `fromModelsDevProvider`/`toPublicInfo`.
- Regenerated legacy JS SDK: `bun ./packages/sdk/js/script/build.ts --generate-only` (from `src`). Diff only adds `provider.summary` and its types; no dist build. `packages/client` contract has no legacy `/provider`, so it was not regenerated.
- Changed `tui/src/context/sync.tsx`: bootstrap calls `sdk.client.provider.summary`; `provider_next` typed `ProviderSummaryResponse`, initial `{ all: [], connected: [] }` (dropped unused `default`). Dialogs and `contextLimit.tsx` unchanged.
- Changed tests: new case in `opencode/test/server/httpapi-provider.test.ts` (summary equals list's id/name and `connected`, with an `xai` credential); `/provider` stubs -> `/provider/summary` in `tui/test/fixture/tui-sdk.ts`, `tui/test/cli/tui/subagentDialog.test.tsx`, `opencode/test/fixture/tui-sdk.ts`; scenario `provider.summary` in `opencode/test/server/httpapi-exercise/index.ts`.
- Added FORK.md row "Lighter TUI startup payload" (section 2); high 49 -> 50, total 85 -> 86.
- Proof (P11, `OC_PERF_P11_PROMPTS=none OC_PERF_CPU_PROF=1`, `cursor/composer-2.5-fast`, no model calls; runs in `C:\ocTestTmp\ocPerfRuns\startupPayload`): before `run-1792208422134-P11`, after `run-1792245727752-P11`. Bridge bytes 13.6 MB -> 5.3 MB; largest message 8.3 MB -> 1.25 MB (`/config`); summary reply 11.6 KB, 5 ms after `/config/providers` (was 377 ms); the 125 ms + 107 ms stalls after bootstrap are gone; bootstrap reconcile samples about 65 ms -> about 6 ms. The after-run machine was slower overall (`/config` +3.49 s vs +2.52 s), so absolute startup times are not compared.
- Verification: `tsgo --noEmit` exit 0 in tui and opencode. `bun test test/server/httpapi-provider.test.ts` 6 pass, 1 skip (pre-existing). TUI fixture users (`subagentDialog`, `app-lifecycle`, `data`, `test/cli/cmd/tui`, `use-event`, `dialogSessionListStatusFilter`): 70 pass, 2 fail. `httpapi-exercise --mode coverage`: 222 pass, 0 fail; `provider.summary` covered.
- ERROR: pre-existing `subagentDialog.test.tsx` failures "model and effort selections hand off to the name prompt" and "Ctrl+D only opens confirmation for names in the writable file"; same 2 fail with this session's TUI files restored to HEAD. Not fixed.
- ERROR: pre-existing httpapi coverage misses `GET /agent/sub`, `POST /agent/sub`, `DELETE /agent/sub/{name}` (no scenarios since v0.2.180-181), so `test:httpapi` exits 1. Not fixed.
- Note: prettier warnings in `sync.tsx` and `httpapi-exercise/index.ts` are on lines this session did not touch; left alone.
- Not changed (plan "not recommended now"): `/config` 1.25 MB (1 MB is `command`: synced Claude skills stored three times under `skill:synced:<id>_<id>:` keys, source not traced), `/agent` 857 KB `permission`, `/command` 608 KB `template`, unused `data.tsx` V2 loads (`/api/skill` 429 KB), bridge double encoding.
- TODO: leftover `models.json.<pid>.<time>.tmp` files in `~\.cache\opencode` (26 files, 117 MB): `ModelsDev.fetchAndWrite` (`core/src/models-dev.ts:202-215`) cleans up only on failure, not on interruption or a hard kill.
- Note: palette `get desc` getters in `ocCommands.tsx` call `readOcConfig()` (sync read + `statSync`, `ocSettings.ts:13`) on each palette rebuild; one 310 ms profile gap there. Not investigated.
- TODO: user live check after a build: Connect dialog shows every provider with checkmarks on connected ones; first-run model dialog shows "Popular providers"; after connecting a provider the model list opens.

### User
Startup
- The TUI now asks the server only for provider names at startup instead of the full catalog of every model, so about 8 MB less data moves at launch.
- Startup no longer has a brief freeze (about a tenth of a second) when that catalog arrived, and the startup sync no longer waits about 0.4 s for it.
- The Connect provider dialog and the first-run provider list look and work the same.

---

## 2026-10-17 (~03:26) - v0.2.226 subscribeButterfree - Stream smoothness: instant streaming code, reasoning on markdown, batched Claude logging, spinner phase-lock, Beta smooth streaming - Opus 5.5, default effort; Implementation

### Agent
- Meta: Opus 5.5; default effort; Implementation (stage 3 of `~/.config/opencode/plans/streamSmoothness/stage2.plan.md` items 1-5, evidence `stage1.findings.md`); completed; user live checks pending a build
- Version: 0.2.226 subscribeButterfree
- Added `src/patches/@opentui%2Fcore@0.5.14.patch` (`bun patch`; `patchedDependencies` in `src/package.json` and `bun.lock`), bun files only (`chunk-bun-j2z63cdy.js`, `index.bun.js`). `CodeRenderable._shownContent` = source text the buffer shows, set everywhere the buffer is set from content. Streaming non-markdown `set content` appends the new tail with `textBuffer.append` when the value extends `_shownContent`; other changes still wait for the highlight. `ensureVisibleTextBeforeHighlight` shows a streaming code block's first text at once, and keeps a visible code buffer that already shows the content (no plain flash when streaming ends). Markdown-filetype blocks unchanged.
- Fixed (same patch) `parseMarkdownIncremental`: reuse drops `max(1, trailingUnstable)` tokens. With `trailingUnstable` 0 the last paragraph token was reused when `streaming=false` landed before the final append, so the tail became its own block (`P10PROSEDO` / `NE`). Exposed by TextPart's new `streaming` flip: `part.time.end` and the last text arrive in one update and `streaming` is applied first.
- Changed `tui/src/routes/session/index.tsx`: ReasoningPart renders `<markdown streaming={!isDone()} internalBlockMode="top-level">` (subtle syntax, header, collapse kept); TextPart has one trim memo and `streaming` from `part.time?.end`.
- Changed `opencode/src/provider/claude-code/logger.ts`: lines queue; flush on a 100 ms unref'd timer, at 64K chars, at once for warn/error, before `configureLogger`, and on process `exit`. `mkdirSync` + `statSync` once per resolved file, size tracked for 5 MB rotation; a failed rename keeps appending; disable on first write failure kept. Exported `flushLogger()`. `_resetLoggerForTests` drops queued lines (plan said flush; dropping avoids recreating deleted test dirs).
- Added `src/patches/opentui-spinner@0.0.7.patch`: due times `(Math.floor(now / interval) + 1) * interval` in `start`, `reschedule`, and both `tick` sites.
- Added Beta `smooth_streaming` (tui.json, default false): schema, signal, `setSmoothStreaming` in `tui/src/config/index.tsx`; `persistTuiSetting` key; palette `oc.smooth_streaming` (`/smoothStreaming`, category `oc`, new group "Beta") in `ocCommands.tsx`; helper `tui/src/routes/session/smoothText.ts` (33 ms ticks reveal `max(1, ceil(backlog / 4))`; off or done = full text; text present at mount or when enabled shows at once; a shorter rewrite clamps). Used by TextPart content and ReasoningPart body.
- Docs: wiki `..\oc.wiki\Configuration.md` row for `smooth_streaming` (unpushed; that clone has other uncommitted edits not from this session). FORK.md rows "Steady streaming paint" and "Smooth streaming (beta)", high 47 -> 49, total 83 -> 85, Beta added to the palette headings list.
- Removed `TEMP(streamTrace)` block and its `appendFileSync` import from `sessionManager.ts` (file equals HEAD again) and `OC_PERF_STREAM_RAW` from `probe.test.ts`. `streamPreload.ts` reads `_shownContent.length` (dropped `__shownLen`).
- Recorded stage-1 perf kit (uncommitted until now): P10 stream smoothness and P11 real model in `probe.test.ts`, `streamPreload.ts`, `streamContent.ts`, `probeEntry.ts`, `run.ps1`, README; test-env leak fix (P10/P11 panes strip the `test/preload.ts` env: temp `XDG_*`, fixture model list, `OPENCODE_EXPERIMENTAL_*`, `OPENCODE_TEST_*`). This session added P10 options `OC_PERF_SMOOTH=1` and `OC_PERF_THINKING=show` and a README note that the P10 Claude variant has a harness-only delta hold (use P11 for Claude timing).
- Changed root `AGENTS.md`: removed the "state the expected cost first" clause from the real-model rule (user edit from stage 1).
- Proof item 1 (P10 isolated, before `run-1792206025959-P10`, after `run-1792221012148-P10`): code lag p50/p95 chars mixed 10/123 -> 0/0, code 9/44 -> 0/0, long 9/26 -> 0/0; longest frozen code block mixed 508 ms -> 0; hidden code frames 3/1/1 -> 0; frame JS p95 <= 1.9 ms; sent -> painted unchanged (prose 11.9/18.9 -> 10.7/19.9 ms).
- Note: the stage-1 "reasoning sent -> painted p95 35 ms" was an artifact: the probe's thinking mode defaults to `hide`, so reasoning deltas painted nothing and the metric caught the next unrelated frame (fewer frames now with the phase-lock: 38.2 ms after). Expanded reasoning (`OC_PERF_THINKING=show`), old `<code>` renderer swapped in temporarily `run-1792221262971-P10` vs new `run-1792221215273-P10`: 11.2/19.5 vs 11.6/20.5 ms, equal; reasoning highlight ms p95 2.7 -> 0.8, total 566 -> 233 ms.
- Proof item 3 (P4, before = original spinner file swapped into the store temporarily `run-1792221672708-P4`, after `run-1792221472640-P4`): frames/s (a) status only 26.0 -> 26.5, (b) one tool 37.5 -> 26.7, (c) four tools 48.5 -> 27.2 (before (c) counted from `spinner-wakes.jsonl` over the case window); spinner glyphs render the same in the screens.
- Proof item 2 (Claude P10 prose, before `run-1792206160546-P10`, after `run-1792221877868-P10`): 400 `plugin.log` lines in the prose window in both; before = 400 appends + 400 `mkdirSync` + 400 `statSync`; after about 72 appends for 428 lines (estimated from 100 ms timestamp clusters, not counted directly), one `mkdirSync` + `statSync`.
- Proof item 4 (`run-1792221321790-P10`, `OC_PERF_SMOOTH=1`; from `md` content-set rows, since `analyze.py` times message arrival, not reveal): content-set gap p95 64-82 -> 35 ms; chars per set p95 35-39 -> 19-22; final text length exact in every phase; arrival -> content set p50 ~16 -> ~115 ms, p95 ~230-250 ms; frames/s 44-49 -> 51-55.
- Verification: `tsgo --noEmit` exit 0 in tui and opencode (tests included). tui `test/component/streamingCode.test.tsx` (6, new), `test/cli/tui/thinking.test.ts` (5), `test/routes/smoothText.test.ts` (5, new): 16 pass. opencode `test/provider/claude-code/logger.test.ts`: 17 pass. 0 fail.
- ERROR: first P10 after item 1 timed out ("Timeout: P10 prose"): the parser split above. Fixed in the patch, regression case in `streamingCode.test.tsx`.
- ERROR: both P4 runs fail at teardown with "Unable to connect" from the shared LLM proxy in `probe.test.ts` (late request after the fake LLM closed); all three cases were measured first. That proxy is in HEAD; not fixed here. TODO: return 502 when the upstream fetch fails.
- Not run: `opencode/test/cli/run/scrollback.surface.test.ts` (streams through CodeRenderable with `MockTreeSitterClient`, so the patch can change its output) and tui snapshot tests that render session parts.
- Risk: both vendor patches need a refresh on OpenTUI or opentui-spinner upgrades (OpenTUI 0.6.6 has the same gating). `TextBuffer.append` keeps appended chunks until the next `setText`, bounded by the block's size.
- Note: FORK.md's medium count had already drifted (25 active rows vs 19 listed); left as is.
- TODO: user live checks: a long Claude reply with a code block (text flows, last chars color a moment later; reasoning as smooth as text); spinner looks the same and WezTerm CPU is lower while a tool runs; Beta > Smooth streaming off by default, steady when on, final text exact; `plugin.log` still fills, warnings appear at once.

### User
Chat streaming
- Code blocks now show their text the moment it streams in; the newest characters pick up color a moment later instead of the whole block lagging behind.
- The first code block in a language no longer stays blank while its highlighter loads.
- Thinking blocks now use the same renderer as replies.
- Finishing a reply no longer flashes its code blocks as plain text.
- Spinners now tick together, so running tools no longer add extra screen redraws (about 37-48 down to about 27 per second).

Beta
- New setting **Smooth streaming** (`ctrl+o`, or `smooth_streaming` in tui.json), off by default: replies and reasoning appear at a steady pace about a tenth of a second behind arrival instead of in bursts.

Claude Code
- Debug file logging (`plugin.log`) now writes in small batches instead of once per line; warnings and errors still land immediately.

Developer
- New opt-in performance probes for stream smoothness (P10) and real-model sessions (P11).

---

## 2026-10-16 (~22:16) - v0.2.225 fuggnSomebody - Fix memory leaks ML-1 to ML-4: Cursor no-tool Runs, bounded SSE queues, TUI open trees, Claude exchanges - Opus 5.5, default effort; Implementation

### Agent
- Meta: Opus 5.5; default effort; Implementation (plan `~/.config/opencode/plans/perfReview/memoryLeaks.fixes.md` Phases 1-4, review `memoryLeaks.md`); completed; user live checks pending a build
- Version: 0.2.225 fuggnSomebody
- Phase 1 ML-3 (Cursor): `provider/cursor/languageModel.ts` adds `durable = !!sessionKey && !lifecycle`; frozen RequestContext keyed only when durable (`getOrBuildRequestContext("")` otherwise); `openCodeSessionId: durable ? sessionKey : undefined`; removed the keyless clear block and its two imports. `protocol/kv.ts` (`setConversationBlob`) and `pump.ts` `storeCheckpoint` (`setCheckpoint`) write process-wide state only when `session.openCodeSessionId`; `resumeCheckpoint` stays per Run.
- Fixed plan gap (user-approved): `lifecycle` was `!allowTools && !isCompaction && !recovery`, so a title Run's retry counted as a chat Run: its rebase reset the chat's own Cursor binding (`bindConversationId(sessionKey, { reset: true })`) and a resumed retry persisted under the chat key. With per-Run blobs the resume would also fail the blob-graph check (`blobReachability` throws on a missing blob) and force that reset. Now `lifecycle` ignores recovery, `conversationState` checks `resuming` first, and the forced rebase passes `ephemeral: lifecycle`. A title Run's checkpoint resume now degrades to a rebase on a throwaway id.
- Phase 2 ML-2: `core/src/event.ts` `allBounded(events, capacity, filter?)` filters before the offer. Instance `handlers/event.ts` uses it (capacity 2048) instead of `Queue.unbounded`. `handlers/global.ts` exports `globalEventStream(capacity)`: `Stream.callback` with a dropping buffer; `Queue.failCauseUnsafe(queue, Cause.fail(SubscriberOverflowError))` when `offerUnsafe` returns false. Both log "event reader fell behind; closing so it resyncs" via `Stream.tapError`.
- Note: an overflowing Effect queue enters Closing: buffered events drain first, then the failure ends the response (client reconnects and resyncs). A reader that never resumes holds at most `capacity` events.
- Phase 3 ML-1: `tui/src/context/sync.tsx` `openTrees`, `treeRoot` (parent walk, depth cap 32), `inOpenTree`. `message.updated/removed` and `message.part.updated/delta/removed` apply only inside an opened tree; the question-tool error block in `message.part.updated` stays ungated. `session.sync` adds the root before fetching and again after storing session info; `forgetSession` deletes it.
- Risk: `sidebarUsage.tsx:240` usage-refresh `active` reads the last assistant message of busy sessions to pick a provider; busy sessions in other windows no longer count. The plan's risk list covers the rest (`sidebarUsage.tsx:830`, plugin `state.session.messages`).
- Phase 4 ML-4: `provider/claude-code/sessionSync.ts` merges `exchangeText`/`exchangePosition` into one `exchanges` LRU capped at `MAX_CLAUDE_SESSION_ENTRIES` (64); new `forgetSessionExchanges(sessionID)` called from the `session.deleted` hook in `index.ts`.
- Added tests: `test/provider/cursor/ephemeralState.test.ts` (blob and checkpoint stay per Run unless bound; `CursorPump` builds from the fake session, so the checkpoint case ran), `test/server/globalEventStream.test.ts` (overflow fails the stream, listener released), core `event.test.ts` filter case, `syncEvents.test.tsx` 3 new cases (unopened session stores nothing but status; child of opened parent; sibling of opened subagent) and 3 cases now sync first, `sync-live-hydration.test.tsx` 3 cases open the tree first (two through a parent tree, the task-card flow), `sessionSync.test.ts` forget and cap cases.
- ERROR (expected): first run of the three tui sync files had 3 `sync-live-hydration` failures; those tests fed events into never-opened sessions. Setups fixed as the plan says.
- Verification: `tsgo --noEmit` exit 0 in core, opencode, tui. `ephemeralState` + `execReplies` 3 pass; core `event.test.ts` 45 pass; `globalEventStream` 1 pass; `httpapi-global` 12 pass; tui `sync`, `sync-live-hydration`, `syncQuestions`, `syncEvents` 40 pass; `sessionSync` + `indexHooks` 9 pass; all 0 fail.
- Not run: `httpapi-event.test.ts` (covers the instance handler, not named by the plan). The Phase 1 lifecycle-retry change has no unit test (`startSession` needs a live Run stream).
- TODO: user live checks from the plan (no "event reader fell behind" in the server log; `oc.exe attach` private MB flat while another window runs subagents; task cards and Sub-agents sidebar stay live; a subagent tab lists its siblings), then the Wave 3 heap snapshot.
- Rotated build notes: the 1008-line file moved to `buildNotes.archive11.md` (blob equals HEAD's `buildNotes.md`); summary now covers archive11.

### User
Memory
- Cursor title and naming requests no longer leave data in the background server for as long as it runs.
- A frozen oc window can no longer make the background server hold every event forever; once it reads again it reconnects and catches up.
- Each oc window now keeps chat history only for the sessions it opened and their subagents, instead of every chat on the server.
- Claude Code keeps its per-chat sync data for at most 64 chats and drops a chat's data when the session is deleted.

Cursor
- An interrupted Cursor title request no longer resets the Cursor conversation of the chat it was naming.
