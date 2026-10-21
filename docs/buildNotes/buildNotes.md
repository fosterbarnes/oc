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
- Kept histories verbatim: archive1 (2026-08-20 through 09-09), archive2 (09-09 through 09-15), archive3 (09-15 through 09-28), archive4 (1144 lines), archive5 (1019 lines through v0.2.65), archive6 (1127 lines through v0.2.87), archive7 (1176 lines, v0.2.88 through v0.2.120, committed e4d73d1), archive8 (1152 lines, v0.2.120 through v0.2.148), archive9 (1059 lines, v0.2.149 through v0.2.172; its summary was archive8's carried unchanged, so archive9 is first summarized here), archive10 (1122 lines, v0.2.173 through v0.2.202), archive11 (1008 lines, v0.2.203 through v0.2.224), archive12 (1009 lines, v0.2.225 through v0.2.246, equals commit 1b7aa56). Archive8 retains the previous cumulative summary plus complete later entries, earlier hashes, checks, and risks. Never edit archives.
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

# Historical entries (newest first)

---

## 2026-10-21 (~00:19) - v0.2.274 phatCrystal - Bun 1.4.2 pin, streamed refusals as text, upstream119 closeout - Claude Opus 5.5; Implementation

### Agent
- Meta: Claude Opus 5.5; default reasoning; Implementation (`/imp` on `plans/upstream119/closeout.md`); completed except user-driven Bun steps
- Version: v0.2.274 phatCrystal
- Kept the other session's Bun edits: `src/package.json` `packageManager` bun@1.4.2, catalog `@types/bun` 1.4.0, override `bun-types` 1.4.2; `AGENTS.md` Bun note (bytecode stays on). Ran `bun install` from `src`: `src/bun.lock` now resolves `@types/bun` 1.4.0 / `bun-types` 1.4.2.
- Kept `.scripts/scriptHelper.ps1` `testBunHasFfiFix` unchanged: 1.4.2 passes without `--canary`.
- Not ported `1e4e9c5d85` (bytecode off on Bun 1.4.0): oc never compiles with 1.4.0 and oven-sh/bun#40270 is fixed in 1.4.1. Recorded in `implementation.md`.
- Fixed AI 28: `provider.ts` `openAICompatibleQuirks` -> `openAIWireQuirks`, now also for `@ai-sdk/openai` and `@ai-sdk/azure`; new `rewriteChunk` turns Responses `response.refusal.delta` into `response.output_text.delta` and chat `delta.refusal` into `delta.content`. Line precheck skips the `"refusal":null` on every OpenAI chat chunk. `compatibilityFetch` now always rewrites SSE bodies for these SDKs.
- Checked first: `@ai-sdk/openai` 3.0.131 (`ai-v6`) and 4.0.99 (`latest`) have no refusal stream handling, so a bump would not fix it.
- Removed `SCOPE.md` row "Replace the sidebar Plugins section with a load-failure toast" (user: toast added v0.2.270, sidebar stays).
- Fixed `FORK.md` count table: recounted active rows 16/61/32/8/0 = 117 (one `removed` row in section 4 not counted). Updated the "OpenAI-compatible model quirks" row for refusals.
- Skipped B3 (user runs no local model servers). Deleted `plans/upstream119/sweep/` (user approved).
- Installed Bun 1.4.2 locally (user request): `bun upgrade --stable` gave 1.4.3, so reinstalled exact 1.4.2 via `bun.sh/install.ps1 -Version 1.4.2` (`1.4.2+744846f84`).
- ERROR: typecheck failed with bun-types 1.4.x: 75 TS2345 in `@ff-labs/fff-bun` 0.9.4 `src/ffi.ts` (`FFIType.ptr` returns `Pointer | bigint | null` since bun-types 1.4.0; 0.9.4 ships raw `.ts` as its types, so `skipLibCheck` does not cover it). No oc code errors.
- Fixed: bumped `@ff-labs/fff-bun` 0.9.4 -> 0.10.5 (upstream dev version; ships `dist/*.d.ts`) in `packages/core` and `packages/opencode` `package.json`; `bun install` refreshed `src/bun.lock`. Upstream's 0.10.5 patch (NodeNext `.js` imports) not needed in oc. Supersedes D5 "stay on 0.9.4".
- Verification: `bun test test/provider/compatibility.test.ts` (opencode): 5 pass, 0 fail (2 new refusal tests). `.scripts\test.ps1 -Category typecheck`: 16/16 successful. `bun test test/filesystem/search.test.ts` (core): 6 pass, 0 fail. `.scripts\build.ps1`: both `oc` and native `opencode` built and passed `--version` (0.2.274). Live starts not run.
- User installed and revived oc v0.2.274 (Bun 1.4.2 build starts). L1 `cb863b8ea5` dropped: user reports ctrl+c on an empty shell-mode prompt does not exit oc.
- TODO: user live checks in `plans/upstream119/liveChecks.md` (includes FFF `@` file search and refusal text). Non-streamed refusals are still dropped. buildNotes.md is now ~1019 lines: next entry rotates to `buildNotes.archive13.md`.

### User
Models
- When an OpenAI, Azure, or OpenAI-compatible model refuses a request, the refusal now shows as the reply instead of an empty message.

Build
- oc now pins Bun 1.4.2, matching upstream, and the local Bun is now 1.4.2.
- The file search library (FFF) moved to 0.10.5 so the typecheck passes with the new Bun types.

Docs
- SCOPE.md no longer lists the sidebar Plugins toast idea, and FORK.md's feature counts are correct again.

---

## 2026-10-21 (~00:00) - v0.2.273 bunsPastrami - break the core provider plugin import cycle - Claude Opus 5.5; Implementation

### Agent
- Meta: Claude Opus 5.5; no workers; Implementation; completed
- Version: 0.2.273 bunsPastrami
- Fixed import cycle: every core plugin imported `define` from `plugin/internal.ts`, which imports the full `ProviderPlugins` list, so loading a plugin module first (e.g. `provider-google-vertex.test.ts` via `aisdk`) read `GoogleVertexAnthropicPlugin` before it finished loading (`ReferenceError ... before initialization`, `plugin/provider.ts:51`).
- Added `core/src/plugin/define.ts` (`Requirements`, `Plugin`, `define`; type-only imports, no runtime edges). `internal.ts` re-exports them so `PluginInternal.Plugin` / `PluginInternal.define` keep working; dropped unused `Scope` import. 34 plugin modules (`plugin/*.ts`, `plugin/provider/*.ts`) now import `define` from `./define` / `../define` (one-line literal replace). Mirrors upstream, which moved `define` out of `internal`.
- Verification: core `test/plugin/provider-google-vertex.test.ts` 9 pass 0 fail (was 0/1 at import); with `provider-opencode.test.ts` together 22/0 (both failed together before); all `test/plugin` 228 pass 0 fail across 40 files; core `tsgo --noEmit` exit 0.
- Fixed: ERROR/TODO from v0.2.267 and v0.2.271 (Vertex plugin test import failure).

### User
Internal
- No visible change: a startup ordering bug in the built-in provider plugins is fixed, so their tests run cleanly again.

---

## 2026-10-20 (~23:52) - v0.2.272 actuallyLoster - subagents no longer fail on a tool error they recovered from - Claude Opus 5.5; Implementation

### Agent
- Meta: Claude Opus 5.5; no workers; Implementation; completed
- Version: 0.2.272 actuallyLoster
- Fixed `tool/task.ts` `runTask`: it failed the task when any tool part in the child's final message had status error. Claude Code runs a whole turn as one assistant message, so a recovered early tool error (e.g. a failed `ls`) marked a finished subagent failed. Now only a tool error after the last non-empty text part (unanswered) fails; returned text is the last non-empty text part.
- Added test "execute succeeds when the child answers after a failed tool call" (`test/tool/task.test.ts`); existing "terminal child tool errors" test still covers real failures.
- Verification: `bun test test/tool/task.test.ts` 42 pass 0 fail; new test + terminal-error test fail (2) on the old `task.ts` and pass (2) with the fix. Typecheck left to prePush.
- Fixed: TODO from v0.2.264-v0.2.271 (5 false "Subagent failed" results during the upstream port).

### User
Subagents
- A subagent that hits a failing tool call, recovers, and finishes is no longer reported as failed.

---

## 2026-10-20 (~23:43) - v0.2.271 shlangingCosmos - upstream 1.19 port stage 9: closeout (sync baseline, SCOPE later rows) - Claude Opus 5.5; Implementation

### Agent
- Meta: Claude Opus 5.5; orchestrator, no workers; Implementation; Stage 9 of `~/.config/opencode/plans/upstream119/implementation.md` completed; upstream 1.19 port done
- Version: 0.2.271 shlangingCosmos
- Updated `.scripts/upstream-sync.state.json` `baselineSha` `abce98e0eb` -> `a1f604bbe0` (upstream v1 = v1.19.3), `updatedAt`. Dev fixes/features swept through upstream `dev` `db45c950a9` (window: not reachable from `8d05153965`), ported in v0.2.264-v0.2.270.
- Added 8 grouped "Planned for later" rows to `SCOPE.md` covering every feature the sweep or user marked later (native-runtime provider features, ACP, plugin hooks/storage, MCP elicitation/resources/auth, session navigation incl. paged history `3b8949b1ee`, usage/permission views, update/auth items, TUI look/config); items already covered by existing rows not duplicated.
- Removed: `~/.config/opencode/plans/upstream119/impl/*.progress.md`.
- Not ported (decided): `6e55ddd078`, `f112a73c06` (B1, reverted v0.2.266), `0762d63b6a`, `9b4882db54`, `50a1add183`, `5438dfb751`, `c85b09de6f`, codemode/llm package fixes (Stage 6 skipped), TUI 21 (no notice renderer).
- TODO: B3 default context for limitless custom models (discovery); AI 28 refusals (AI SDK drops refusal deltas); L1 `cb863b8ea5` live check; Bun upgrade to upstream's version (with `1e4e9c5d85`); fix oc `task` false-failure on a recovered tool error; core `provider-google-vertex.test.ts` import-order failure.
- Verification: docs/state only; no tests needed.

### User
Upstream sync
- oc is now synced through OpenCode v1.19.3 plus the OpenCode 2 fixes and the features you picked; the features left for later are listed in SCOPE.md.

---

## 2026-10-20 (~23:10) - v0.2.270 houndevatorsMisty - upstream 1.19 port stage 8: CLI and TUI features - Claude Opus 5.5 (orchestrator) + Opus 5.5 high/medium workers; Implementation

### Agent
- Meta: Claude Opus 5.5; orchestrator, workers `general-opus.5.5-medium` (8a, 8d, 8e) and `general-opus.5.5-high` (8b, 8c); Implementation; Stage 8 of `~/.config/opencode/plans/upstream119/implementation.md` completed (picks in `picks.md`)
- Version: 0.2.270 houndevatorsMisty
- 8a CLI: `oc update` aliases `upgrade` (`cli/commandLoader.ts`); `debug paths <name>` (+`db`), unknown name exits 1; `attach` checks `GET /api/health` (5 s) before validateSession; `oc debug profile <pid> [--heap] [--seconds]` writes a request file in `<state>/diag`, every CLI process watches it (`cli/heap.ts`) and writes `.cpuprofile`/`.heapsnapshot` to the log dir; `oc plug list|remove|update [--check]` over opencode.json + tui.json plugins, shared `core/src/npm-update.ts` check also drives an "update X.Y.Z" marker on /plugins External rows (no auto-install). Help snapshots updated.
- 8b unread sessions: migration `20261020143000_sessionViewedState` adds nullable `session.time_idle`/`time_viewed` (`migration.gen.ts`, `schema.gen.ts`, `schema.json`, `core/src/session/sql.ts`, projector, `schema/src/v1/session.ts`); `Session.setIdle` (roots only, run ended on its own, from `prompt.ts` loop) and `setViewed` (watermark); `PATCH /session/:id` accepts `time.viewed`; TUI session route records viewed while shown + terminal focused; session list gutter shows unread `●` (priority: awaiting input, spinner, unread, pin). `bun script/migration.ts` regenerates identical schema (no changes); `--check` fails on Windows only by CRLF (test is Linux-only).
- 8c transcript/shell: transcript views full/grouped/summary (`routes/session/transcriptView.ts`, keybind `transcript_view`, unbound); read rows `path:10-60`; `ui/file-path.tsx` semantic truncation (file-changes dialog, home footer); processor forwards tool-input deltas as `message.part.delta` `state.raw`, TUI parses partial JSON (`util/partial-json*.ts`) for pending rows; `session_background` (ctrl+b) also moves a running foreground bash call into a background job (`background/shellJobs.ts`, `handlers/experimental.ts`); shell rows get a Full output dialog (`component/dialog-shell-output.tsx`, keybind `session_shell_output`, unbound).
- 8d prompt/commands: Backspace at a `[Pasted ~N lines]` chip expands it; image paste preview dialog (`component/dialog-image-preview.tsx`; Kitty/Sixel only, metadata always; no transcript images); footer path click copies, right click opens Explorer (`util/openFolder.ts`); `messages_previous`/`messages_next` = alt+up/alt+down; `/copy` = last reply, `/copy-all` = transcript; `@` rows labelled agent/reference/resource; `/effort` and `/thinking` open `/variants`; palette "Edit last queued prompt" (`session_queued_prompt_undo`, unbound; upstream ctrl+u clashes).
- 8e notices/dialogs: toast actions (`ui/toast.tsx` `action`, kept in notice history, `dialog.notices.action` ctrl+r); plugin/MCP failure toast -> `component/dialog-error-details.tsx` with `i` investigate (prefilled new session) and `c` copy; release notes shown once after an oc update from the GitHub release body (`ocRelease.ts` keeps `body`); sidebar subagents filter all/running/idle (kv `sidebar_subagents_filter`); favorites rank first in model search; palette/`/delete` "Delete this session" with confirm -> home; TUI config files watched and reloaded on save (`config/tui.ts` returns `files`); plugin `TuiDialogSelectProps` filter + row actions (`TuiDialogSelectAction`). Skipped TUI 21 (oc renders no agent-switch notice).
- Docs: FORK.md rows added/edited per chunk; wiki Launching, Configuration, Troubleshooting, Sessions, Keybinds, Agents-and-Skills, Sidebar; `docs/keybinds.md` regenerated (`--check` 0). Codegen: legacy SDK + client after 8b (session `time.idle`/`time.viewed`, PATCH `time.viewed`).
- Verification: all 29 changed test files run by orchestrator, every one 0 fail (265 pass), incl. core database-migration 21, ocRelease 5; opencode commandLoader 8, attach 5, config/tui 37, processor-effect 20, session 10, backgroundShell 13, debug-paths 3, heap 2, npm-update 7, plug-manage 3; tui dialog-select 22, dialogSessionListStatusFilter 7, syncEvents 11, sidebarSubagents 4, tool-display 13, model-options 3, toastAction 2, dialogImagePreview 3, dialogShellOutput 3, configLive 2, failureToasts 3, pastedChip 3, releaseNotes 1, transcriptView 5, file-path 8, openFolder 1, partial-json 6; help-snapshots 1/0 after update. Typecheck left to prePush.
- ERROR: 8e reported failed on a nonzero bash exit although it finished (known false failure).
- Fixed (agent-push, typecheck missed by workers): `core/src/npm-update.ts` tag/range narrowing; `tui/src/app.tsx` reload chain `Promise<unknown>`; `tool/shell.ts` shared `Metadata` type for run/moved/background returns; `config/tui.ts` `reload` declares `Error`. Verified: full turbo typecheck 16/16; shell, shellMetadata, backgroundShell, config/tui 151 tests (shell "basic [bash]" cold-start timeout, passed on rerun), npm-update 7, configLive 2.
- Risk: every oc process now runs a file watcher on `<state>/diag`; `alt+up`/`alt+down` may be taken by the terminal (Windows Terminal pane focus); npm update check sends no registry auth.

### User
CLI
- `oc update` works like `oc upgrade`, `oc plug` can list, remove, and update plugins, `oc debug paths db` prints one path, and `oc debug profile <pid>` captures a CPU profile or heap snapshot of a running oc.

Sessions
- Sessions that finished while you were elsewhere show a `●` in the session list until you open them, and you can delete the current session from the palette or with `/delete`.
- `/copy` now copies the last reply and `/copy-all` copies the whole transcript; `alt+up` and `alt+down` jump between messages.

Transcript and shell
- Tool rows fill in while the model is still writing the call, read rows show line ranges, and the transcript can switch to grouped or summary views (bind `transcript_view`).
- `ctrl+b` also moves a running shell command to the background, and shell rows have a Full output view.

Notices and dialogs
- Plugin or MCP failures pop a toast you can open for details and investigate in a new session, release notes show once after an update, and the TUI config reloads when you save it.

---

## 2026-10-20 (~21:20) - v0.2.269 nigiriFartsds - upstream 1.19 port stage 7: core features (tools, output limits, compat options, questions, web search, MCP) - Claude Opus 5.5 (orchestrator) + Opus 5.5 high workers; Implementation

### Agent
- Meta: Claude Opus 5.5; orchestrator, workers `general-opus.5.5-high` x4 (7a+7b, then 7c+7d in parallel); Implementation; Stage 7 of `~/.config/opencode/plans/upstream119/implementation.md` completed (picks in `picks.md`)
- Version: 0.2.269 nigiriFartsds
- 7a tools: edit result text + guidance (Core 2); shell env `AGENT=1`, `OPENCODE=1`, `AI_AGENT`, `OPENCODE_SESSION_ID` (Core 5); read keeps oc XML output, folder reads load that folder's AGENTS.md (Core 6); grep `literal`/`caseSensitive`, glob `hidden` (`core/src/ripgrep.ts`; Core 8); new `session_rename` tool via `Session.setTitle` (`tool/sessionRename.ts`; Core 10); `~` paths in edit/write/apply_patch (`external-directory.ts` `expandHome`; Core 11); new `models` tool (`tool/models.ts`; Core 15); background shell end notice names log paths (`shellJobs.ts`; Core 17); `ToolInputRepair.repairToolName` (case/separator/`functions.` prefix, single match) wired by orchestrator into `session/llm.ts` `experimental_repairToolCall`, unmatched still `invalid` (Plugin 3).
- 7b providers/output: `OUTPUT_TOKEN_MAX` 256k (fallback 32k), maxOutputTokens fits estimated prompt, `length` stop auto-continues up to 2 times (Core 1); `ProviderError.contentFilterMessage` (Core 3); prompt cache prefix diagnostics behind a flag (`session/llm/promptCacheDiagnostics.ts`; Core 4); config `compatibility.reasoningField`/`maxTokensField`/`requireFinishReason` for `@ai-sdk/openai-compatible` (fetch wrapper maps streamed reasoning field; `requireFinishReason` default off) (AI 2); `prompt_cache_key` to OpenRouter + 13 allowlisted compatible providers (AI 25). AI 28 Responses controls already reachable via `@ai-sdk/openai` providerOptions; refusals not added.
- 7c session/permissions: question reject takes optional `message` (route query, TUI `m` key); with a message the agent continues (Core 14); refreshed `gpt.txt`, `gpt-astra.txt`, Claude "Code comments" section, display-name identity line, no tool trimming (Core 16); `run` auto-reject sends feedback message (CLI 1); background subagents without the experimental flag, flag + gates + launcher env line removed (Other 2); v1 `permission.ask` hook wired: runs only when rules would prompt, plugin may allow/deny/ask (Plugin 4).
- 7d MCP/web search: config `websearch: false | { provider, apiKey }` with Firecrawl (MCP) and Tavily (REST) backends; pick order env `OPENCODE_WEBSEARCH_PROVIDER` > config > flags > session checksum (Core 7); MCP JSON text parsed in Code Mode, `_meta.sessionID` sent (orchestrator wired direct calls in `session/tools.ts`) (Core 12); MCP `connecting` status + non-durable `mcp.status.changed` event, shown in sidebar/status/dialog (Core 18); `POST /mcp/:name/reconnect` + MCP dialog `ctrl+r` reconnect (CLI 3).
- Docs: FORK.md new rows (output limits, compat quirks, question dismiss message, background subagents default, run continues, plugin permission decisions; Tool input repair + background shell rows updated); wiki Agents-and-Skills, Configuration, Keybinds, Launching, Sessions, Sidebar; `docs/keybinds.md` regenerated.
- Codegen: legacy SDK (`compatibility`, question `message`, `mcp.reconnect`, `connecting`) + client `bun run generate`.
- Verification: opencode edit 34/0, shell 96/0, read 44/0, grep 10/0, glob 5/0, sessionRename 2/0, external-directory 8/0, models 2/0, backgroundShell 12/0, inputRepair 59/0, transform 590/0, overflow 16/0, error 3/0, promptCacheDiagnostics 5/0, compatibility 3/0, provider 105/0, prompt `-t` output limit/content-filter 2/0 and question dismiss 2/0, question dismiss 1/0, run-process 1/0, task background 8/0, registry 1/0, footer.view 3/0, runtime-flags 36/0, permission/next 8/0, system 3/0, mcp/catalog 7/0, websearch 17/0, mcp/lifecycle 24/0, httpapi-mcp + public-openapi 23/0, httpapi coverage pass=223 (3 known missing); keybind docs `--check` 0. Typecheck left to prePush.
- Fixed (agent-push): prePush typecheck failed on stale test mocks; added `reconnect` handler to `test/server/httpapi-mcp-oauth.test.ts`, `blockedMessage` to the fake processor handle in `test/session/compaction.test.ts`.
- ERROR: Claude plan session limit stopped both 7a/7b workers mid-run (resumed after reset); 7d reported failed on a nonzero bash exit although it finished (known false failure).
- TODO: AI 28 refusals (`@ai-sdk/openai` 3.0.88 drops refusal deltas; needs a fetch-level stream rewrite). FORK.md count table was already inconsistent before this stage (worker counted high 55, medium 28, low 8).

### User
Agent tools
- New `models` and `session_rename` tools, grep can match literally or ignore case, glob can include dotfiles, `~/` works in file tools, and a misnamed tool call is fixed when the intended tool is obvious.

Models
- Long replies are no longer capped at 32k output tokens and continue automatically when cut off, and OpenAI-compatible or local models can set `compatibility` options for their reasoning and token fields.

Sessions and permissions
- Press `m` on an agent question to dismiss it with a note the agent reads, background subagents work without the experimental flag, and plugins can approve or deny permission prompts.

Web search and MCP
- Choose the web search provider in config (Exa, Parallel, Firecrawl, or Tavily), see MCP servers as "Connecting" while they start, and reconnect one with `ctrl+r` in the MCP dialog.

---

## 2026-10-20 (~20:26) - v0.2.268 sirHoedown - upstream 1.19 port stage 5: TUI fixes - Claude Opus 5.5 (orchestrator) + Opus 5.5 high/medium workers; Implementation

### Agent
- Meta: Claude Opus 5.5; orchestrator, workers `general-opus.5.5-high` (5a, 5c) and `general-opus.5.5-medium` (5b, 5d; 5d needed 3 runs after two CLI cut-offs); Implementation; Stage 5 of `~/.config/opencode/plans/upstream119/implementation.md` completed
- Version: 0.2.268 sirHoedown
- 5a dialogs (`58201a32c1` `a4b91d33d9` `ed1636e3bd` `8e3e94aa26` `865f512a44` `b04d8d53e6` `41349ff20a` `26e27c7a7f` `7a22ac865d` `b62dc4a636` `f6aa1a67f0` `a779027303` `5df9cecf03` `cb852434b1` `2bf6a9813a` `0ee9f61e3d` `0ee5ef6c43` `22dea2453b`): `ui/dialog-select.tsx` clamps/preserves selection across list updates, honors falsy `current`, `selection: "none"` actions, separate no-match vs empty views, scroll after layout, real-mouse-move selection (no input-mode store), gutter text color, wrapped error details; `ui/dialog.tsx` mounts each dialog once; `dialog-prompt` single-line (new `multiline` prop for queue edit and /btw); MCP dialog toggles servers independently and shows errors; plugins dialog drops current marker; spinner glyph no longer shrinks.
- 5b prompt/keys (`0481dba88e` `a5f7f8d3b5` `58a36a1560` `238ce304a9` `55f490b898` `d177f29dba` `97ba700fac` `474c3588c1` `d62049aab4`; `311e32da93` no-op): narrow-terminal layout (logo, prompt padding, model/footer truncation); repeated pasted image reuses its `[Image N]` label and is sent once; footer path truncates from the left; alt+return = `prompt_queue` only (B10; `docs/keybinds.md` regenerated via `packages/tui/script/keybindDocs.ts`, wiki `Sessions.md`); autocomplete descriptions flattened, selection kept visible after wheel scroll; agent/model fade plays once; renderer listener budget 15.
- 5c session view (`655adbf46e` `f92e490bb6` `047d434aa2` `8d989f6829` `a8fc664b6d` `71f81dc0fe` `2f740cec5d` `9c39e75ce2` `f268956c75` `60b88daddf` `aaed6eaa45` `3c1f87d2d4` `fe0d9579a7` `cf4b4c2312` `cc9011c1ae` `e89206d397`): per-hunk diffs with `@@` rows (`util/diff.ts`, `component/patch-diff.tsx`), added files over 3000 lines render in chunks in the diff viewer; stale permission prompts dismissed on PermissionNotFound; "Allow always" previews patterns and replies at once; nested subagent permissions/questions surface in the parent; execute child calls one row each; task resume rows "Continue"; shell rows show newest output with "(N earlier lines)" label, command capped at 2 rows; copy/export fetch the full transcript; table cell padding; shell files highlight as bash. B12 revert banner pluralizes.
- Orchestrator: finished `e89206d397` in `component/prompt/index.tsx`: `/editor` with no `$VISUAL`/`$EDITOR` shows an error toast (caller check, not a throw in `editor.ts`, so export-to-file without an editor still saves).
- 5d theme/app/sidebar (`cd942d0669` `910e37f6d8` `0eaa75ec0f` `8c1808ab74` `83cfafc884` `ced3d5e02a` `b866900417` `f7b222e95a` `667c274c7f` `0d8e64112f` `21dac524f3` `e47b9b5453` `61d812fcd6` `c82340a97b` `2e4abeb25d` `f51dc62721` `8c1ce954d0` `2e7ac8c8ea` `bd23808adf` `52a10f573f`; `8381153418` already present): home paths use `~/a/b`; context usage ignores reverted replies; root session cost includes all descendant sessions (B9, `util/session.ts` `sessionCost`; gap: children outside the 100-session / 30-day list are not counted); `<Toast />` mounted once at app root (top 2, right 2 of the full terminal); `--prompt` on resume/continue/fork submits once after agent/model are ready (`local.agent.ready`); deleted-session toast names the session; footer MCP row click opens the MCP list; sidebar MCP errors contained; system-theme palette probed after first frame, cached in kv `system_theme_palette`, only when `system` is active; toast errors use `errorMessage`; external-mode fetch has no timeout; compact numbers roll to `1.0M`; ARM64 x64 emulation shown.
- Verification: tui dialog-select 20/0, dialogMountOnce 1/0, dialogSessionListStatusFilter 6/0, prompt/part 9/0, collapse-tool-output/diff-viewer/added-patch/inline-tool-wrap-snapshot/filetype/session/notifications/permissionPrompt combined 50/0, syncQuestions 13/0, app-lifecycle 9/0, util/locale 5/0, runtime 2/0, contextUsage 6/0, util/session 4/0; keybind docs `--check` exit 0. Typecheck left to prePush.
- ERROR: Claude Code CLI closed its output twice mid-run for the 5d worker (no result); a fresh worker finished from the progress file.

### User
Dialogs and prompt
- Lists keep your selection when they refresh, show "no matches" separately from "empty", and the MCP dialog toggles several servers at once and shows each server's error.
- `alt+return` now only queues a prompt; use `shift+return`, `ctrl+return`, or `ctrl+j` for a newline.
- `/editor` tells you to set `$VISUAL` or `$EDITOR` instead of doing nothing, and the prompt fits narrow terminals better.

Session view
- Diffs show each hunk separately, very large new files open in chunks, shell output shows the newest lines, and subagent permission prompts and questions appear in the parent session.
- The revert banner says "messages" for more than one, and copy/export include the whole transcript.

Sidebar and app
- The session cost now includes what its subagents spent, toasts sit in the top-right of the whole window, and the system theme no longer slows startup.

---

## 2026-10-20 (~19:27) - v0.2.267 waaazoooBeethoven - upstream 1.19 port stage 4: providers, session, build/server - Claude Opus 5.5 (orchestrator) + Opus 5.5 high/medium workers; Implementation

### Agent
- Meta: Claude Opus 5.5; orchestrator, workers `general-opus.5.5-high` (4a, 4c) and `general-opus.5.5-medium` (4b, 4d), pairs in parallel; Implementation; Stage 4 of `~/.config/opencode/plans/upstream119/implementation.md` completed
- Version: 0.2.267 waaazoooBeethoven
- 4a Copilot/Codex (`a0a6963beb` `7129ed6e62` `a35f96f427` `50c5218bca` `206f51547c` `760f87fab1` `d52380024d` `94b9133910` `1fc05ca590`, feature Core 19 from `35ef229454`): Copilot login stores account `apiEndpoint` (`copilotBaseURL`), rejects accounts with chat disabled; Codex allowlist drops gpt-5.4/-mini (B7), every allowed model 400k/272k (B5, includes oc-only gpt-6-sol/luna), gpt-6.1-sol 628k/500k; Codex OAuth falls back 1455 -> 1457 with cancel request; subagent sessions send parent id as prompt cache key (`session/llm/request.ts`), Codex `session-id`, Copilot `X-Interaction-Id`; Copilot chat keeps late `reasoningOpaque`; Copilot Responses passes effort/sampling for all model ids, system role always `system`.
- 4b provider/models (`023f76f6fc` `3441b95afc` `82947af8e3` `93afa91904` `7d1e212fb5` `a701129184` `35bb8e44ef` `d8129ca1e0`): models.dev refresh 5 min, cache write failure logged not fatal; SSE idle timer ignores `:` comment heartbeats (`wrapSSE`); Vertex default `global` (B6, legacy + core plugin); Copilot `grok-*`/`mai-code-*` use Responses (`gemini-*` stays chat per later upstream `1a9e29a0b9`); Console config responses closed unread; empty provider name falls back to catalog; `chunkTimeout` default 15 min.
- 4c session/MCP/permissions (`bc5ff1cfd9` `1aae92c42a` `bfdbf43ef8` `b31747124b` `22f2604ffa` `59f0e3a378` `2937f0e635` `9c65a69937` `8889447f5a` `148042ab81` `757e565c23`): corrected sibling permission asks fail with `CorrectedError` so the turn continues (B2); MCP tool calls default 12 h fixed budget (no progress reset); Code Mode row shows error state; compaction truncates tool output by code point; fork skips incomplete assistant messages (running shells); `webfetch` per-URL permission rules; compaction prompt tweaks (Completed wording, max 15 files, single-line bullets); task `model: ""` ignored.
- 4d build/server/db (`a48d44955e` `aeed4b6375` `89d37a0f6d` `8f0f4be03c` `d8e31d846a`): compiled binary starts with `--no-warnings`; `GET /api/integration/:id` returns 404 `IntegrationNotFoundError`; DB files chmod owner-only before open (non-Windows, not `:memory:`; D1); detached HEAD build channel `detached`, branch names sanitized (D2; `9b4882db54` not ported); server PTY-connect auth skip matches the routed endpoint + `ticket`, not a URL regex.
- Regenerated legacy SDK (`apiEndpoint`) and client (`packages/client` `bun run generate`) for the integration error.
- Verification: opencode permission `reply - reject` 4/0, mcp/catalog 6/0, compaction surrogate 1/0, session fork 3/0, config granular webfetch 1/0, task blank model 5/0, transform parent cache key 1/0, plugin github-copilot 9/0, plugin codex 50/0, header-timeout 13/0, provider empty name + Vertex 10/0; core copilot-chat-model 12/0, openai-responses 7/0, models 10/0, provider-opencode 13/0, session-compaction prompt 3/0, database 0/2 skipped (Windows), database-migration concurrent 1/0; httpapi exercise `--mode effect --include integration` pass=7 fail=0 (3 known missing `/agent/sub`). Typecheck left to prePush.
- Fixed: prePush typecheck failed on two test typings (`config.test.ts` webfetch literal `as const`, `transform.test.ts` headers union cast); opencode typecheck pass, granular webfetch 1/0, transform parent 1/0.
- ERROR: core `test/plugin/provider-google-vertex.test.ts` fails at import, `ReferenceError: Cannot access 'GoogleVertexAnthropicPlugin' before initialization` (`core/src/plugin/provider.ts:51`), also with Stage 4 changes stashed (worker check); not fixed (V2 provider plugin, import-order cycle). TODO: add to AGENTS.md known failures after a confirming run.
- Risk: oc's legacy PTY-ticket check (`opencode/src/server/.../middleware/authorization.ts`, `shared/pty-ticket.ts`) still uses the URL regex; Codex OAuth callback still listens on all interfaces (pre-existing, upstream binds localhost).

### User
Providers
- GitHub Copilot uses your account's own API endpoint and says clearly when chat is not enabled for the account.
- ChatGPT (Codex) models get the larger context windows from upstream, gpt-5.4 models are gone, and Codex sign-in tries a second port when the first is busy.
- Subagents reuse their parent's prompt cache, and Vertex now defaults to the `global` location.

Sessions
- Correcting one of several permission prompts no longer stops the whole turn, long MCP tool calls are no longer cut off after 60 seconds, and forking a busy session skips the reply still in progress.

---

## 2026-10-20 (~18:34) - v0.2.266 eepCompare - upstream 1.19 port stage 3: core tools, shell, search, config, snapshots - Claude Opus 5.5 (orchestrator) + Opus 5.5 high/medium workers; Implementation

### Agent
- Meta: Claude Opus 5.5; orchestrator, workers `general-opus.5.5-high` (3a-3d, pairs in parallel) and `general-opus.5.5-medium` (3e); Implementation; Stage 3 of `~/.config/opencode/plans/upstream119/implementation.md` completed
- Version: 0.2.266 eepCompare
- 3a patch/edit/read (`63e2054f50` `96dc560833` `e770415fd5` `3ea8895299` `6ec17e5d55` `532292b5f3` `bc47030d4d` `d484f070d1` `0cb434775c`): `patch/index.ts` clearer errors, padded markers, CRLF lines, real EOF anchors, no `…`->`...` folding, malformed hunks rejected; edit + apply_patch share one per-file lock; edit keeps mixed CRLF/LF per region and fails on no-op edits; read retries a missing path against one NBSP-normalized sibling. Kept oc's Begin/End search-anywhere rule (strict rule is `dbfbb13ccc`, not in scope).
- 3b shell/process (`f8c46684eb` `90fb6562ce` `a6b49b3f74` `01edae4a7f` `813c41ff6c` `cf606660fb` `1dcc6551d9` `e22c1622e0`): spawner stops draining pipes 1 s after exit and buffers output eagerly (D6 test `finishes when a detached grandchild keeps stdio open`, fixture `core/test/fixture/held-stdio.cjs`); Windows ProcessTree/killTree kept (`stop` renamed `send`); `Shell.args(file, command)` drops cwd, bash/zsh run plain `-c` (no `-l`, no rc sourcing), PowerShell adds `-NoLogo -NonInteractive`; shell tool settles on exit-code read failure, reports `KilledBySignal` + `metadata.signal`; `$ARGUMENTS` replacement keeps `$&` etc. literal.
- 3c search/git (`8f4b62eb49` `3bda0ce123` `945d1c8cb2` `c7ceccf869` `3b0195e045` `45d58717a4` `20929b3081` `cae205a3d9` `9d55b223bb` `6dbb5f5008` `4ea368e09e` `39e1ce55bc` `126b7b633b`): grep/glob fail on missing path, 30 s search timeout; watcher ignores built-in dirs at any depth; FFF only for VCS locations, off for home; home scans capped, protected dirs skipped; fallback index refresh 10 s; repo discovery stops at nearest marker (`fs-util` `up` `mode: "first"`); `check-ignore` fatal fails refresh; glob drops dotfiles before limit when hidden off; repository host segments validated; Windows ripgrep zip via System32 `tar.exe`. B8: grep appends "(skipped N matches on lines over 64 KB)" (`Ripgrep.GrepInput.onOversized`).
- 3d config/location/state (`baacb2e776` `b2ce195bda` `f725443e30` `36da0d5c77` `1f2c59a1b6` `cbef698861` `c22942c1f3` `d5154fb74e` `c458ad72d3` `f09eee5002` `ccc6a3fd59`): OTLP setup failure falls back to local logs; location keys normalized (Windows spelling); failed location boot evicted for retry; state committed before finalize, `{ flush: false }` for plugin teardown; unreachable well-known config skipped with warning; gray-matter cache bypassed; missing/unreadable `{file:}` -> empty + warning; `{env:}` escaped only when it breaks JSON. `ConfigVariable.substitute` is now an Effect (4 callers updated). Skipped `2c8e2a2b28` (superseded by `36da0d5c77`).
- MISTAKE: plan put `f112a73c06` (core config walk without stop) in 3d as "core only", but core config is live, so it loaded `~\.opencode` and `C:\.opencode` above the repo root, against B1. Reverted `core/src/config.ts` + its test edits. Rule: a user "stop at repo root" decision applies to every live config path, not one package.
- 3e snapshot/refs/skills (`0bb24a46c1` `59ad593d9c` `2b6dd2559c` `d68031bc0d` `b2c7246134` `bc5ebf00a4` `b0c8a8c827`): lazy snapshot repo discovery; snapshot repo config via one included `opencode.gitconfig`; nearest skill source wins; undo restores renamed files (`--no-renames`); git references refresh at most daily (attempt time in `.git/opencode-refresh-attempt`, no KV in oc); Windows snapshot `git add` retried twice; flock heartbeat writes fresh time.
- Verification (workers + orchestrator): opencode patch 41/0, apply_patch 32/0, read 43/0, edit 33/0, shell 95/0, prompt `-t` replacement 1/0, grep+glob 13/0, config 119/0, config/tui 36/0, snapshot 55/0 (3 Windows skips), skill 19/0; core spawner 32/0 (1 POSIX skip), process 24/0, shell 11/0, ripgrep 10/0, search+ripgrep 16/0, ignore 2/0, filesystem 28/0, git+snapshot 12/0, repository 13/0, location-layer 6/0, state 7/0, markdown 4/0, observability 10/0, config 18/0 (after revert), snapshot 6/0, repository-cache 9/0. Not run: POSIX signal test, typecheck (prePush).
- Risk: `!` commands no longer see `.bashrc`/`.zshrc` aliases or functions (upstream `01edae4a7f`).
- Fixed (agent-push): prePush typecheck failed on `core/test/state.test.ts` (transform callback returned `push`'s number); `add` and the transform now use block bodies. State 7/0 and core typecheck pass.
- Fixed (agent-push): opencode typecheck failed on `opencode/test/patch/patch.test.ts` (helpers widened hunk `type` to `string`); `update` and `added` typed as `Patch.Hunk`. Patch 41/0 and opencode typecheck pass.

### User
Agent tools
- Patches and edits are stricter and clearer: bad patches fail with a precise error, CRLF and mixed line-ending files keep their endings, and two edits to one file can no longer overwrite each other.
- Grep and glob say when a path does not exist, stop after 30 seconds, and grep tells you when it skipped matches on very long lines.

Shell
- A command that leaves a background process holding its output no longer hangs the shell tool until timeout, and commands killed by a signal say so.
- `!` shell commands start faster and no longer load your `.bashrc`/`.zshrc`, so aliases from those files are not available there.

Config and projects
- A config URL that cannot be reached, or a missing `{file:...}` reference, now logs a warning instead of breaking startup.
- Undoing changes restores renamed files, and the nearest project's skills win over ones from parent folders.

---

## 2026-10-20 (~17:58) - v0.2.265 casseroleMillions - upstream 1.19 port stage 2: dependency fixes - Claude Opus 5.5 (orchestrator) + Opus 5.5 medium worker; Implementation

### Agent
- Meta: Claude Opus 5.5; orchestrator, worker `general-opus.5.5-medium`; Implementation; Stage 2 of `~/.config/opencode/plans/upstream119/implementation.md` completed
- Version: 0.2.265 casseroleMillions
- Ported `d432823515`: `diff` catalog 8.0.4; malformed-header test retargeted to `getRevertDiffFiles` (`tui/test/util/revert-diff.test.ts`).
- Ported `334f7a3510`: core `bun-pty` 0.4.9.
- Ported `3a2203eaac`: `src/patches/pacote@21.5.1.patch` (upstream copy) replaces 21.5.0 patch; core pins `pacote` 21.5.1; added root `overrides.pacote` 21.5.1 because the lock kept nested `@npmcli/arborist/pacote` 21.5.0, so the patch never applied (git `::path:` branch-subdirectory install failed). Test in `core/test/npm.test.ts`.
- Ported `c9df4ba80d` (`core/src/npm.ts` installs with `audit: false`), `a5b6ead43e` (`core/src/npm-config.ts` loads `@npmcli/config` lazily; `npmPath` stays module-level), `dddb5eb96f` (OpenTelemetry 2.8.0 / 0.219.0 + upstream's 4 extra pins in core and opencode; `core/test/observability-otlp.test.ts`).
- Ported `2f8fa6afef`: MCP SDK 1.29.0 patch serializes token refresh; `opencode/test/mcp/oauth-refresh.test.ts`.
- Kept FFF 0.9.4 (`97ccafce3b`, decision D5): it already honors `**/` ignores; `core/test/filesystem/search.test.ts` now waits for the scan and checks both an ignored and a found file.
- Verification: after `bun install`: core `npm.test.ts` 8 pass 0 fail (7/1 before the override), `observability-otlp.test.ts` 1/0, `filesystem/search.test.ts` 3/0, `npm-config.test.ts` 5/0; opencode `mcp/oauth-refresh.test.ts` 1/0; tui `util/revert-diff.test.ts` 4/0. Typecheck left to prePush.

### User
Dependencies
- Installing a plugin from a git branch subfolder works, plugin installs skip npm audits, and MCP sign-in no longer races when two tools refresh the same token.
- Updated diff, bun-pty, pacote, and OpenTelemetry to upstream's fixed versions; no UI change.

---

## 2026-10-20 (~17:24) - v0.2.264 meatspinMichael - upstream 1.19 port stage 1: version 1.19.3, reasoning options, share removal - Claude Opus 5.5 (orchestrator) + Opus 5.5 medium/high workers; Implementation

### Agent
- Meta: Claude Opus 5.5; orchestrator, workers `general-opus.5.5-medium` (1a) and `general-opus.5.5-high` (1b) in parallel; Implementation; Stage 1 of `~/.config/opencode/plans/upstream119/implementation.md` completed
- Version: 0.2.264 meatspinMichael
- Changed OpenCode package version 1.18.29 -> 1.19.3 (decision V1): 13 `package.json` (`src/packages/*`, `src/sdks/vscode`), 12 `src/bun.lock` workspace lines, `.opencode/package.json` plugin pin and `.opencode/package-lock.json` version lines (resolved/integrity still 1.18.29: lock needs `npm install` refresh).
- Ported `d12161eecd`: `core/src/v1/config/provider.ts` `ReasoningOption` + model `reasoning_options`; `opencode/src/provider/provider.ts` config reasoning options replace catalog variants, config `variants` still merge on top; `transform.ts` `reasoningVariants` takes `Pick<ModelsDev.Model, "reasoning_options">`. Test ported into `test/provider/provider.test.ts`. Regenerated legacy SDK (`packages/sdk/js/script/build.ts`): `src/v2/gen/types.gen.ts` +`reasoning_options`.
- Ported `d320177aa4` share removal (decision SH1): deleted `share/share-next.ts` + test; `SessionShare` now fails `share`, `unshare` only clears the stored link, `create` no longer auto-shares; removed `ShareNext` from app/bootstrap runtimes, server, `import`/`pr` share-URL import, `github.handler.ts`, `src/github/action.yml`; `run --share` hidden and prints discontinued; removed TUI `session_share`/`session_unshare` keybinds + CommandMap, sidebar share URL, session share/unshare commands, share tips. Kept like upstream: SDK `session.share`/`unshare` routes, `handlers/tui.ts` `session_share` alias, `session_share` DB table.
- Docs: `SCOPE.md` share row moved to Removed from upstream; `UPSTREAM-SYNC.md` step 8 now says the package version tracks the synced upstream release, share-client line updated. Wiki had no share mentions.
- Verification: `bun test test/provider/provider.test.ts` 103 pass 0 fail; `test/cli/import.test.ts` + `help-snapshots.test.ts` pass; httpapi exercise `session.share`/`session.unshare` pass (3 known missing `/agent/sub` scenarios). Typecheck left to prePush.
- ERROR: oc `task` reported 1b as failed after one failed Edit call inside the worker although it finished (same false failure as the sweep scouts). TODO: fix task result reporting so a recovered tool error does not mark the subagent failed.

### User
Upstream sync
- The sidebar version now reads OG v1.19.3, matching the upstream release this port syncs to.
- Models in your config can list `reasoning_options`, and oc builds their effort variants from it.

Session sharing
- `/share`, `/unshare`, the sidebar share link, share tips, and importing shared-session URLs are gone because upstream shut the share service down; `oc run --share` now just prints that sharing was discontinued.

---

## 2026-10-20 (~05:56) - v0.2.263 cinematicSunbathing - stop subagents without deleting the session - Grok 4.6; Agent

### Agent
- Meta: Grok 4.6; Agent; completed
- Version: 0.2.263 cinematicSunbathing
- Cause: Claude auto-resume off left queued wakes; each subagent scheduled its own usage-reset prompt; Esc on the parent did not abort children. Session subagents toggle only denies future `task` calls.
- Fixed `ScheduledResume.setEnabled(false)`: drops `entries`. `takeDue` while disabled also clears leftovers. `fireEntry` drops a claimed wake if disabled (`scheduledResume.ts`).
- Added `cancelSession(sessionID)`: drops that session's wake and resume count. `SessionPrompt.cancel` walks children, then `cancelSession`, then pause/runner/question cancel (`prompt.ts`).
- Added palette **Stop session subagents** `/stopSub` (`ocCommands.tsx`): aborts children of the current (or parent) chat; keeps parent history.
- Claude auto-resume off option now says queued wakes cancelled (`claudeCommands.tsx`).
- Live: aborted 26 children of `ses_ea85eea1fffeoYng6xnDiYzuWc` (`oc - Backport plan from opencode 1.19`) plus parent via resident server; resume file already `enabled:false` `entries:[]`.
- Wiki: `Agents-and-Skills.md` stop/Esc; `Claude-Code.md` off cancels queue.
- Verification: `bun test test/session/scheduledResume.test.ts` 23 pass; tui `tsgo --noEmit` clean. New cascade/palette not in the installed binary until rebuild.
- TODO: user rebuild/install for `/stopSub` and Esc cascade.

### User
Subagents
- The backport chat's 26 subagents were aborted in place. History stayed. Auto-resume was already off.
- After a rebuild: Esc on the parent stops children; `/stopSub` stops children without aborting the parent; turning Claude auto-resume off cancels queued wakes so they do not come back at reset.

---


## 2026-10-20 (~01:08) - v0.2.262 deliWife - cli typecheck finds the .ps1 text import - Claude Opus 5.5, low effort; Agent

### Agent
- Meta: Claude Opus 5.5; low effort; Agent (agent-push prePush failure); completed
- Version: 0.2.262 deliWife
- Fixed `@opencode-ai/cli` typecheck: `tui/src/ocCommands.tsx` imports `./killall.ps1` (since v0.2.260) but cli's program never included `tui/src/script.d.ts`. Added `/// <reference path="./script.d.ts" />` at the top, same pattern as `attention.ts` + `audio.d.ts`.
- ERROR: prePush typecheck failed with TS2307 on `killall.ps1`; earlier pushes passed through the turbo cache.
- Verification: `bun run typecheck` in packages/cli clean.

### User
Build
- No UI change; fixes a type check that blocked pushing.

---

## 2026-10-20 (~01:05) - v0.2.262 deliWife - Subagents dialog can set a Claude account - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (follow-up to the claudeAccount entry below); completed
- Version: 0.2.262 deliWife (no second bump: same uncommitted session)
- Added `claudeAccount` (pool id) to `POST /agent/sub` payload (`httpapi/groups/instance.ts`); handler maps it to the `accounts` entry as written via new `accountConfigEntry` (`provider/claude-code/accounts.ts`), dies on unknown id. `SubagentFile.add` writes `claudeAccount` after `variant`.
- Added TUI step `chooseAccount` in `tui/src/component/dialog-subagents.tsx` between efforts and name: only for provider `claude-code` with 2+ pool accounts (`sdk.claudeAccount.state()`); "No preference" omits the key. Default name and description gain the account (`general-opus.5.5-claude4-xhigh`, "prefers .claude4"). Back goes to efforts, or to the list when the model has none.
- Regenerated legacy SDK (`packages/sdk/js/script/build.ts`): `sdk.gen.ts`/`types.gen.ts` +3 lines.
- Tests: `accountConfigEntry` case in `accountPool.test.ts`; `claudeAccount` write case in `test/agent/subagentFile.test.ts`.
- Verification: both test files 32 pass 0 fail; `tsgo --noEmit` clean in opencode and tui. TUI flow not run live.
- TODO: no way to change the account of an existing entry from the dialog; delete and re-add.
- Kept: `bun.lock` shows modified in git status with no content diff (line endings); not touched by this session.

### User
Subagents dialog
- Adding a Claude subagent with two or more Claude accounts now asks which account it should prefer, or none.

---

## 2026-10-20 (~00:59) - v0.2.262 deliWife - agents can prefer a Claude account (claudeAccount) - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (/imp of `~/.config/opencode/plans/upstream119/prereqAdvisorAccount.md`); completed
- Version: 0.2.262 deliWife
- Added `CLAUDE_CODE_ACCOUNT_OPTION = "claudeAccount"` (`provider/claude-code/shared.ts`) and `resolveAgentAccount` (`callOptions.ts`); `turnContext.ts` exposes `turn.agentAccount`. Agent frontmatter unknown keys already land in `options` (`core/v1/config/agent.ts` `normalize`).
- Added `preferredAccount(dir, ids, now)` and `turnAccount(sessionID, preferredDir, ids, now)` in `accounts.ts`. Order: existing session pin, else usable preferred account (pinned via `pinSessionAccount` so `failoverAccount` moves it and it never snaps back), else `poolAccount`. Matches by `canonicalAccountId`, case-insensitive on win32, so `~/.claude4`, absolute paths, and the inherited `default` dir all match. Skipped for affinity `default`. Unknown dir: one `log.warn` per dir, then pool pick.
- Changed `claudeCodeLanguageModel.ts` account line to `turnAccount(turn.affinity, turn.agentAccount, accountIds)`.
- Added 3 tests in `test/provider/claude-code/accountPool.test.ts` (prefer+pin+failover no snap-back, limited/unknown/default-affinity fallback, inherited-dir -> `default`).
- Added user config entry `general-opus.5.5-xhigh-claude4` in `~/.config/opencode/agents/sub/general.md` (user approved).
- Docs: `oc.wiki/Claude-Code.md` paragraph under Several Claude accounts; `FORK.md` Claude account pool row.
- Verification: `bun test test/provider/claude-code/accountPool.test.ts` 22 pass 0 fail; `bun run typecheck` (tsgo) clean in packages/opencode. No live run.
- MISTAKE: first draft of the default-affinity test assumed an unsticky global pick; `poolAccount` is sticky across calls in one test. Fixed the test.

### User
Claude accounts
- An agent can name a preferred Claude login with `claudeAccount: "~/.claude4"`; its new chats and subagents start on that login.
- If that login is at its usage limit, the chat starts on the usual login, and a later limit moves it on like any chat.
- New subagent `general-opus.5.5-xhigh-claude4` runs Opus 5.5 xhigh on the `~/.claude4` login.

---

## 2026-10-20 (~00:43) - v0.2.261 coleslawEnders - agent-push keeps the title of a session it did not open - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (after /spit plan); completed
- Version: 0.2.261 coleslawEnders
- Fixed `SessionPrompt.command` (`opencode/src/session/prompt.ts`): `agentPushTitle` now set only inside the first-message check, same rule as `PUSH_SESSION_KEY`. Mid-session push keeps its title.
- Kept `sessionComplete.ts`: `#<sha>` append still keys on the exact placeholder title, so mid-session pushes no longer get the hash or the bare-title failure marker.
- Updated `test/session/prompt.test.ts`: mid-session test now expects the old title; first-message test also asserts the placeholder title.
- Verification: `bun test test/session/prompt.test.ts -t "agent-push"` from `packages/opencode`: 2 pass, 0 fail.

### User
agent-push
- Running /agent-push partway through a session no longer renames it; only a session that starts with /agent-push gets the push title and commit hash.

---

## 2026-10-20 (~00:29) - v0.2.260 ffzBoogaloo - Jev skill hint for subagents - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (/spit plan then /imp, implemented directly); completed
- Version: 0.2.260 ffzBoogaloo (already bumped by the parallel Beta daily theme session; not bumped again)
- Added `tool/skillHint.ts`: TypeSafe skill-suggestion recipe (docs.typesafe.ai/cookbooks/skill_suggestion.md, measured wrong loads 16.8% -> 7.3%, needless 9.8% -> 4.0% on Haiku 4.5). Request 1: `choice` over all described skills + 3 gate nouls (acts, procedure, prose inverted), mean < 0.3 stops. Request 2: top 3 with description + 700 chars of body, `choice` + per-candidate `fits_<i>` noul, best < 0.3 = no skill.
- Added `TaskTool` `hintFor` (`tool/task.ts`): new sessions only (no `task_id`), needs `apiKey()` and the skill tool not disabled for the subagent, uses `Skill.available(subagent)`, 5 s cap via `AbortSignal.any`. Appends a synthetic `<skill_relevance>` text part. Failure logs `skill hint failed` and dispatches without a hint; success logs `skill hint` with skill/gate/fits.
- Fixed `jevClient.ts` retry wait: abortable `sleep(ms, signal)` instead of `Bun.sleep`, so an abort no longer waits out a `retry-after` of up to 30 s.
- Added `Skill.node` to the `test/tool/task.test.ts` layer group (TaskTool now needs `Skill.Service`).
- Fixed `test/preload.ts`: deletes `TYPESAFE_API_KEY`. Without it, test subagent dispatches reached the real api.typesafe.ai whenever the shell had the key.
- MISTAKE: the first `task.test.ts` run (41 pass) likely sent test prompts to TypeSafe live because the key was in the shell. Prevention: a new network call reachable from shared paths needs its env key in `test/preload.ts`.
- Fixed `hintFor`: a user abort during the hint now fails the dispatch instead of being swallowed and starting the subagent anyway.
- Fixed prePush typecheck: added `opencode/src/script.d.ts` (`*.ps1` as text), mirroring `tui/src/script.d.ts`. opencode's program reaches `tui/src/ocCommands.tsx` (`killall.ps1` import) via `cli/tui/layer.ts` -> `@opencode-ai/tui` -> `app.tsx`, but not tui's ambient decls; same pattern as `opencode/src/audio.d.ts`. opencode `bun run typecheck` exit 0.
- Rejected: Jev picking subagent tiers. A live `jev_classify` on a clear tier-1 brief gave tier1 0.53 / tier2 0.46, confidence 0.37.
- Risk: thresholds are the cookbook's, not tuned on oc's skills. Tune them from the `skill hint` log lines.
- Risk: `jev_*` in the `spit` command permission does not match the `jev` permission the tools ask for (`tool/jev.ts`); with `"*": deny` a native turn should reject. Through the Claude Code proxy the call succeeded. Added `jev: allow` to the user's commands (home buildNotes).
- Plan: `~/.config/opencode/plans/jevSkillHint.md`.
- Verification: after the /pass fixes, `bun test` on `skillHint`, `jev`, `task`, `proxyOpencodeTools` tests: 54 pass. `bun run typecheck` reports only `tui/src/ocCommands.tsx(50,27)` missing `./killall.ps1`, from the parallel session's uncommitted work, not this change. Not checked live.

### User
Subagents
- When a Jev key is set, each new subagent gets a one-line hint naming the skill that fits its task, or saying none does.
- The subagent's task text is sent to TypeSafe for this; unset `TYPESAFE_API_KEY` to turn it off.

Jev tools
- Cancelling a Jev call during a rate-limit wait now stops it at once.

---

## 2026-10-20 (~00:20) - v0.2.260 ffzBoogaloo - Beta daily theme - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (imp after spit); completed
- Version: v0.2.260 ffzBoogaloo
- Added `src/packages/tui/src/theme/daily.ts`: `dayNumber` (local date as day index), `msUntilNextDay`, `dailyTheme(day)` = per-cycle seeded Fisher-Yates (mulberry32, seed = cycle) over code-unit-sorted `DEFAULT_THEMES` keys. Deterministic worldwide per oc version; no repeat within an N-day cycle. Custom/plugin themes excluded on purpose (would break sync).
- Added tui config `daily_theme` (default false) + `setDailyTheme` in `config/index.tsx`; `persistTuiSetting` key union in `ocSettings.ts`.
- Added in `context/theme.tsx`: `store.day`, `store.dailyPaused`, `daily` memo; `values` resolves `daily() ?? store.active`. Daily never writes `store.active` or kv, so off restores saved pick. Midnight `setTimeout` re-arms, cleared in `onCleanup`. `theme.set` pauses daily (preview, plugins); toggling `daily_theme` unpauses. Exposed `daily`, `resumeDaily`.
- Changed `component/dialog-theme-list.tsx`: cancel resumes daily; confirm with daily on turns it off, persists, toasts.
- Added palette entry `oc.daily_theme` (Beta group, `/dailyTheme`) in `ocCommands.tsx`; desc `on: <theme>` / `off`.
- Updated wiki `Configuration.md` with `daily_theme` row.
- TODO: predetermined calendar (day/week/month schedules, user-made themes) replaces `dailyTheme`; adding/removing a built-in theme currently reshuffles the sequence.
- Risk: plugin `theme.set` pauses daily for the session. Last day of a cycle can match first day of next (1/N).
- Verification: `bun test test/dailyTheme.test.ts` 3 pass; `bun run typecheck` exit 0. Live TUI not checked.

### User
Themes
- New Beta setting **Daily theme** in `ctrl+o` switches to a different built-in theme every day, the same one for every oc user.
- It is off by default, and turning it off brings back the theme you had picked.
- Picking a theme in **Themes** turns the daily theme off, and cancelling the theme list keeps it on.

---

## 2026-10-20 (~00:11) - v0.2.259 fedsLmaoo - Pass on update progress and auto confirm - Claude Opus 5.5, low effort; Pass

### Agent
- Meta: Claude Opus 5.5; low effort; Pass (/pass over this session's update progress, auto confirm, toast width, row wrap); completed
- Version: 0.2.259 fedsLmaoo (unchanged; not committed since the previous bump)
- Fixed: `Save-Download` (`desktopUpdate.ts`) set `HttpClient.Timeout` infinite; the default 100 s could cut a large download on a slow link. The `runCliCommand` 10 min kill still bounds it.
- Fixed stale FORK.md rows (Claude/Cursor/ChatGPT Desktop, PowerShell): "always confirms first" -> "confirms first unless **Auto confirm updates** is on".
- Moved `_INDENT` beside the other constants in `updateProgress.ts`.
- Reviewed, no change: line splitting across chunk boundaries, progress-line filtering in parsers, final-phase reset of detail, `stop()` idempotence, getter-preserving placement of the toggle entry.
- Verification: `bun test test/updateProgress.test.ts test/desktopUpdate.test.ts` 24 pass (includes live `Save-Download`); `bun run typecheck` (tui) exit 0; `git diff --check` clean. A slow real download was not run.

### User
Third party updates
- Large app downloads on a slow connection no longer risk stopping after 100 seconds.

---

## 2026-10-20 (~00:07) - v0.2.259 fedsLmaoo - Update progress rows wrap to a second line - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (follow-up, user request); completed
- Version: 0.2.259 fedsLmaoo (unchanged; not committed since the previous bump)
- Changed `formatUpdateRow` (`updateProgress.ts`): a row over 52 cols breaks at the last space within 52 (hard break when none) and continues on one line indented 2; text past that line is cut with `...` (`clip`). Cap at two lines keeps a long CLI line from growing the toast.
- Changed `test/updateProgress.test.ts`: wrap case and cut-after-second-line case replace the old truncation case.
- Verification: `bun test test/updateProgress.test.ts` 7 pass; `bun run typecheck` (tui) exit 0. Toast not visually checked by agent.

### User
Third party updates
- A progress line too long for the toast now continues on the line below instead of being cut short.

---

## 2026-10-20 (~00:05) - v0.2.259 fedsLmaoo - Fixed-width update progress toast - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (follow-up to the progress entry below, user live check); completed
- Version: 0.2.259 fedsLmaoo (unchanged; not committed since the previous bump)
- Fixed: progress toast width jumped as row text changed (box was content-sized, `maxWidth` only).
- Added optional `width` to `ToastOptions` and exported `TOAST_MAX_WIDTH` (60) in `ui/toast.tsx`; box uses `width ?? "auto"`, still capped by `maxWidth`.
- Changed `createUpdateProgress` render to pass `width: TOAST_MAX_WIDTH`. Rows stay cut at 52 cols (54 inner).
- Verification: `bun run typecheck` (tui) exit 0; `bun test test/updateProgress.test.ts` 6 pass. Width not visually checked by agent.

### User
Third party updates
- The update progress toast now keeps one fixed width instead of resizing as each line changes.

---

## 2026-10-19 (~23:45) - v0.2.259 fedsLmaoo - Third party update progress and auto confirm - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (/spit plan `~/.config/opencode/plans/thirdPartyUpdateProgress.md`, then /imp, no subagents); completed
- Version: 0.2.259 fedsLmaoo
- Added `log?: boolean` to `ToastInput` (`ui/toast.tsx`); `log: false` skips Notices.
- Added `lineSplitter` + 5th param `onLine` to `runCliCommand` (`cliUpdate.ts`); splits on CR/LF, strips ANSI, flushes partial on finish. Forwarded through `runCliUpdate`, `runVersionedCliUpdate` (update command only, not version probes).
- Added `DOWNLOAD_HELPERS` in `desktopUpdate.ts`: `Write-OcStep` and `Save-Download` (HttpClient, ResponseHeadersRead, status check, final host via `RequestMessage.RequestUri` checked before body, 80 KB stream, `OCPROGRESS: <received> <total>` on percent change >=200 ms or every 1 s). Writes via `[Console]::Out` because Write-Output in a function becomes its return value.
- Changed all four scripts (Claude, Cursor, ChatGPT, PowerShell) to `Save-Download` + `OCSTEP` verifying/installing. Cursor and PowerShell keep their host allowlists; Claude and ChatGPT keep no final-host check (as before).
- Changed `nonEmptyLines` to drop `OCSTEP:`/`OCPROGRESS:` lines; added `failureDetail` so a killed script never reports a progress line as its error.
- Added `updateProgress.ts`: rows, `applyUpdateLine`, `formatUpdateRow` (52-col cut), `createUpdateProgress` (redraw on change, 1 s tick only while a timed phase is shown, `stop()` fades after 5 s).
- Changed `harnessUpdate.ts`: `runSingleUpdate`/`updateCli` for single entries; `updateDesktopHarness` and `updateAllHarnesses` take `autoConfirm` and skip `DialogConfirm` when on; Update all title "Update all (auto confirm)".
- Added `auto_confirm_updates` (config schema, signal + setter, `persistTuiSetting` key) and palette entry `oc.auto_confirm_updates` (`/autoConfirmUpdates`) outside the mapped update list, because spreading would freeze the `desc` getter.
- Deviation: plan had the auto-confirm toast title list what closes; kept to "(auto confirm)" to fit the 60-col toast; the warning lives in the toggle descriptions and config doc.
- Docs: FORK.md row; wiki `Configuration.md` setting row, `Claude-Code.md` Update paragraph.
- Verification: spikes confirmed live stdout from `powershell.exe -Command` and HttpClient final host/length in 5.1 (GitHub release-assets, downloads.cursor.com). `bun run typecheck` (tui) exit 0. `bun test test/updateProgress.test.ts test/cliUpdate.test.ts test/desktopUpdate.test.ts test/pwshUpdate.test.ts` 51 pass, including live `Save-Download` against a local Bun server (redirect, progress, reject host, 404). Live check-only of all four real scripts parsed and reported up to date. Install path not run (all current; would change user apps).
- Risk: progress redraws can cover an unrelated toast within 1 s (still in Notices); a single entry during Update all shares the one toast slot.

### User
Third party updates
- Each update now shows a live toast with a line per item: checking, waiting for your confirmation, download percent and size, verifying, and installing time, then the result.
- CLI updates show the updater's latest output line while they run.
- New **Auto confirm updates** toggle (`/autoConfirmUpdates`, off by default) installs without the confirm prompt, which can close Claude Desktop, Cursor, and ChatGPT without asking; PowerShell still asks for admin approval.
- Progress updates do not fill `/notices`; only the final result is kept there.

---

## 2026-10-19 (~23:24) - v0.2.258 alchemistNolan - detailed prompt-bar line for a lone subagent - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (after /spit plan); completed
- Version: 0.2.258 alchemistNolan
- Changed `contextUsage` (`tui/src/util/contextUsage.ts`): also returns `modelID`/`variant` of the last assistant reply (additive).
- Added `formatSubagentUsage` (`tui/src/util/session.ts`): `↳<Label>-<modelID>-<Variant> <tokens> (<pct>%)`; trailing `-N-N` becomes `-N.N` (claude-opus-5-5 -> claude-opus-5.5); variant titlecased; percent omitted when limit unknown.
- Changed prompt `subagentUsage` (`tui/src/component/prompt/index.tsx`): exactly one child with usage -> `formatSubagentUsage`; 2+ keep the old `Label N%` list (still skips unknown-percent children). TODO: multi format, user wants it to follow the single format.
- Risk: `shortModelName` in `dialog-subagents.tsx:32` has the same `.$1.$2` bug (claude-opus-5-5 -> opus.5.5 after prefix strip); left untouched.
- Verification: `bun test test/cli/tui/contextUsage.test.ts` 5 pass (new formatter case caught the dot bug first run); tui `bun run typecheck` exit 0. No pane check.

### User
Prompt bar
- With one subagent, the prompt bar now shows its agent, model, effort, tokens, and context %, for example `↳General-gpt-5.6-sol-Low 10.3K (10%)`.
- With several subagents, it still shows the short `General 10% . Explore 4%` list for now.

---

## 2026-10-19 (~23:16) - v0.2.257 spamTuesday - killall survivor line without repeated reason - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (follow-up on user's second installed /killall run); completed
- Version: 0.2.257 spamTuesday (already bumped this session, uncommitted)
- Fixed `killall.ps1` "Still running" line: name and PID only; the failure reason (and service hint) is already printed in the stop results.
- Finding: kernel paged pool 1.0 GB (22:52 boot) -> 1.1 (22:58) -> 1.6 (23:15) -> 1.66 GB (23:16) while process private stayed ~10-11 GB. Lead for the ~7.5 GB built up the previous day; identify the pool tag with `poolmon -b` (WDK, elevated).
- Verification: script parses (0 errors); change is one log string.

### User
Processes
- The kill summary no longer repeats the failure reason for a process that is still running.

---

## 2026-10-19 (~22:58) - v0.2.257 spamTuesday - killall report: memory split, CPU top 10, cleaner failures - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (follow-up after user ran installed /procReport and /killall, then restarted); completed
- Version: 0.2.257 spamTuesday (already bumped this session, uncommitted)
- Finding: user's /killall stopped 11 of 12 targets; `codex-windows-sandbox-service` Access denied (service, unelevated). Commit 24.9 -> 22.4 GB with no AI left; fresh boot 14.9 GB, so ~7.5 GB built up outside oc/AI over 23 h.
- Finding: System log 60 days has ~70 restarts, all clean `1074` (RuntimeBroker = Start menu, a few Windows Update), zero 41/6008/1001. Restarts are manual, not crashes. Four `wmiprvse.exe` restarts (08-27, 10-10 x3) = WMI-initiated, cause unknown.
- Added to `killall.ps1` header: uptime; commit split into all-process private, paged pool, nonpaged pool, rest (`Memory` reads `PoolPagedBytes`/`PoolNonpagedBytes`); top 10 by CPU over the measured sample for all processes (sample loop now covers every process, `$sampleMs` measured). `allProcessesPrivateGB` in JSON.
- Fixed `killall.ps1` stop lines: `Reason` unwraps .NET `InnerException` ("Access is denied." instead of "Exception calling Kill..."); result printed after name (no column overflow); failed services get a `Stop-Service <name>` hint.
- Docs: `FORK.md` row text and status, wiki `Troubleshooting.md` report contents.
- Verification: live `-ReportOnly` after reboot shows the split (11 GB processes, 1.1 + 0.6 GB pools, ~2 GB rest) and CPU top 10; `Stop-Identity` on `lsass.exe` returns "failed: Access is denied." (handle refused, nothing stopped).

### User
Processes
- The process report now shows how memory splits between programs, the Windows kernel, and everything else, plus uptime and the 10 processes using the most CPU.
- A process that cannot be stopped now shows a short reason, and services say how to stop them as administrator.

---

## 2026-10-19 (~22:08) - v0.2.257 spamTuesday - Kill all AI processes and process report - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (imp from /spit plan `~/.config/opencode/plans/killall.md`); completed
- Version: 0.2.257 spamTuesday
- Added `packages/tui/src/killall.ps1`: stops oc/opencode/occ, claude, chatgpt, codex*, cursor* (name) plus `@anthropic-ai/claude-code`, `@openai/codex`, `cursor-agent`, `packages/opencode/src/index.ts` (command line) and all descendants, terminals included. Parent link needs child created no earlier than parent; stop holds the handle, rechecks CIM creation time, kills children first, waits 5 s. Keeps self, own descendants (console), and ancestors up to the first matching process. `-ReportOnly`, `-Yes`, `-Pause`.
- Added log to `%LOCALAPPDATA%\oc\killall\killall-<stamp>.log/.json`: commit charge (`Win32_PerfFormattedData_PerfOS_Memory`), System log size and 41/1001/6008 count, top 15 private bytes, trees with memory/handles/CPU/age and 2 s CPU sample, Claude workers per owning oc (from `opencode-claude-code-<pid>` in `--mcp-config`), helpers whose parent PID is an exited oc (dead temp-dir owners), services, stop results, survivors, respawns.
- Added palette group **Processes** (win32 only) in `ocCommands.tsx`: `oc.killall` (`/killall`, `DialogConfirm` first) and `oc.process_report` (`/procReport`). `launchKillall` writes the embedded script (`with { type: "text" }`, `script.d.ts` declares `*.ps1`) to `Global.Path.data` and runs `launchDetached`.
- Added profile function `killai` (user PowerShell profile) running the repo script directly.
- Finding: `sessionManager.ts` `DEFAULT_IDLE_PROCESS_TIMEOUT_MS = 0`, `MAX_ACTIVE_PROCESSES = 16`; each idle `claude.exe` ~500-570 MB private. User chose logging before setting `idleProcessTimeoutMs`. System log goes back to 2026-08-12 with zero 41/1001/6008 events despite reported restarts.
- Docs: wiki `Troubleshooting.md` section, `FORK.md` row (medium).
- Verification: `bun run typecheck` (tui) exit 0; Bun text import returns script content; live `-ReportOnly` run exit 0 with correct trees, owner mapping, issues; `Stop-Identity` exercised on a disposable `ping` (stopped / already exited / PID-reuse skip). Full stop mode not run (would stop the user's processes).

### User
Processes
- New **Kill all AI processes** (`/killall`) stops every oc, Claude, ChatGPT, Codex, and Cursor process and everything they started, after a confirm.
- New **Log AI process report** (`/procReport`) writes the same report without stopping anything.
- Reports go to `%LOCALAPPDATA%\oc\killall` and show memory use, what each process is, which oc owns each Claude worker, and anything left behind.
- `killai` in PowerShell runs the same thing when oc is frozen (`killai -ReportOnly` only logs).

---

## 2026-10-19 (~21:32) - v0.2.256 fartniteRoommates - Update PowerShell palette entry - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (/spit plan `~/.config/opencode/plans/pwshUpdate.md`, then /imp); completed
- Version: 0.2.256 fartniteRoommates
- Added `packages/tui/src/pwshUpdate.ts`: fixed powershell.exe script on the `runDesktopCheck`/`runDesktopInstall` frame. Installed version from `HKLM:\SOFTWARE\Microsoft\PowerShellCore\InstalledVersions` (InstallLocation `Program Files\PowerShell\7`), latest from `aka.ms/pwsh-buildinfo-stable` `ReleaseTag`, GitHub MSI with final-host allowlist (github.com, objects/release-assets.githubusercontent.com), Authenticode Valid + `Microsoft Corporation` CN pin, `Start-Process msiexec -Verb RunAs` `/qn /norestart MSIRESTARTMANAGERCONTROL=DisableShutdown`, 10 min wait; 3010 = success with "restart Windows to finish"; 1602/1618/UAC cancel mapped to messages.
- Added: refuses 7.7+ at check time (Microsoft ships no MSI from 7.7, MS Learn install page).
- Kept: no MSI properties passed; v7.6.6 `assets/wix/Product.wxs` restores ADD_PATH, context menus, remoting, MU, telemetry from its saved `InstallerPropertiesKey`.
- Added `POWERSHELL` harness in `harnessUpdate.ts`, included in `updateAllHarnesses` win32 confirm list; combined confirm now lists each item's own `closes` phrase (title "Confirm updates") since pwsh closes nothing.
- Added `oc.update_powershell` to `ocCommands.tsx`; renamed palette group "Third party harness updates" -> "Third party updates".
- Updated FORK.md (new row; fixed stale "Third party harness management" heading on update rows) and wiki `Claude-Code.md`.
- Verification: `bun test test/pwshUpdate.test.ts` (tui) 6 pass; live check-only `checkPowershell()` returned 7.6.6 -> 7.6.7; MSI URL redirects to release-assets.githubusercontent.com. Install path not run (needs UAC, user-driven).
- Risk: with DisableShutdown, files held by running pwsh are replaced at reboot; new pwsh windows before reboot may mix versions. Needs user live check.

### User
Third party updates
- New **Update PowerShell** entry (Windows) checks for a newer PowerShell 7, asks you to confirm, then installs it after a Windows admin prompt.
- **Update all** now includes PowerShell and shows what each confirm-first update will do in one prompt.
- Open PowerShell windows, including the one oc runs in, are never closed; they keep the old version until reopened, and Windows may ask for a restart.
- The palette group is renamed to **Third party updates**.

---

## 2026-10-19 (~21:09) - v0.2.255 drangleicUndercut - /revive-single closes the pane it ran from (WezTerm) - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (/spit then /imp); completed
- Version: 0.2.255 drangleicUndercut
- Added `paneID` to the `/revive-single` context in `tui/src/reviveCommands.tsx` (`oc.revive_single`), mirroring `revive()`.
- Added busy guard there: `Global.native` + WezTerm pane + `sync.data.session_status[sessionID]` not idle -> `DialogConfirm.show`; cancel aborts before the helper launches. Only native, because its reply runs in-process; an oc pane's reply keeps running on the resident server.
- Added in `reviveSingle` (`config/reviveHost.ts`, hosted branch): records the original pane with `oldPanes({ paneID })` before the build (skipped when not WezTerm or when it equals own `WEZTERM_PANE`); after spawning native, races `exited` vs `REPLACEMENT_SETTLE_MS`, then `closeOwnedPanes(old)` (same-window check), errors logged and ignored. Build failure path unchanged, so the original pane stays.
- Changed `oldPanes` param in `config/wezterm.ts` to `Pick<RestartContext, "paneID" | "tabs">`.
- Kept Windows Terminal and plain consoles unchanged (no per-tab close CLI).
- Risk: a reply started after confirming (during the build) is still stopped by the close; 1.5s settle is not proof native drew.
- Updated `FORK.md` section 7 and wiki `Launching.md` (Native test builds).
- Plan: `C:\Users\Foster\.config\opencode\plans\reviveSingleClosePane.md`.
- Verification: `bun run typecheck` passed in `packages/tui` and `packages/opencode`. No unit test added (pane selection is existing `Revive.ownedPanes`/`closeOwnedPanes`). Live WezTerm check not run; needs a user build.

### User
Revive single
- In WezTerm, `/revive-single` now closes the tab or pane you ran it from once the new opencode is running, leaving every other tab alone.
- Running it from a native opencode tab while a reply is in progress asks first, because closing that tab stops the reply.
- A failed build keeps the original tab open, and Windows Terminal or plain consoles behave as before.

---

## 2026-10-19 (~21:08) - v0.2.254 unfortunateCoffe - Steered messages keep a "read mid-turn" label - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (spit -> imp); completed
- Version: 0.2.254 unfortunateCoffe
- Diagnosed `ses_ead947310ffe1FAf89dHyMGtUi` ("queue not working"): the Enter steer was delivered (`.claude3` transcript `cce9f95b`: `queued_command`, `absorbed_mid_turn` 04:59:42Z), but Claude's reply ignored it. Once the turn ended, the `SENT` badge reverted to the timestamp, so the steer looked unsent below the reply. The user's revert then triggered a rewind; the blank replies afterwards were the v0.2.238 stale-wake bug (fixed v0.2.243/245; user still ran 0.2.238).
- Added `steered` memo in `UserMessage` (`tui/src/routes/session/index.tsx`): the non-queued fallback shows `read mid-turn` (joined with the timestamp when on); `metadataVisible` includes it. Uses persisted `metadata.steered`, so the label survives restarts.
- Changed `~/.config/opencode/opencode.jsonc` Claude provider `logging.level` debug -> info: debug filled the 5 MB `opencode-claude-code/plugin.log` in hours, so the 1 AM evidence was gone. Info keeps the steer, wake, and rewind lines.
- Updated wiki `Sessions.md` "Steering a running turn".
- Verification: `bun run typecheck` (tui) exit 0; `OC_TUI_PANE=1 bun test ./test/provider/claude-code/tuiPane.test.ts -t "steering actions"` 1 pass (now waits for `read mid-turn` after the turn ends).
- MISTAKE: the first pane run used a relative `cd` that persisted from the typecheck call and ran in the wrong package. Use absolute `Set-Location` in background runs.

### User
Claude chats
- A message you send while Claude is working now keeps a "read mid-turn" label after the turn ends, so you can tell it was delivered even when Claude's reply did not answer it.
- To get a separate answer to a new question while Claude is busy, queue it with Alt+Enter instead.

---

## 2026-10-19 (~20:53) - v0.2.253 englandMachismo - Forked chats keep their Claude conversation - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (spit -> imp); completed
- Version: 0.2.253 englandMachismo
- Fixed: Ctrl+P > fork on a Claude chat asked "Claude session lost" on the first message. Cause: `claude-code/sessions.json` is keyed by oc session id and `Session.fork` never told the provider.
- Added `forkClaudeSessions(from, to)` + `isPendingFork` in `provider/claude-code/sessionManager.ts`: copies origin records (not `movedTo`) to the fork's key with `forked: true` (persisted, parsed). `setClaudeSessionId` rebuilds the record, so the CLI's new id clears the flag.
- `Session.fork` (`session/session.ts`) calls it via dynamic import after copying messages. Synchronous, so scheduled `target: "fork"` entries are covered too (no event timing).
- `cliArgs.ts`: `--fork-session` on rewind or pending fork; `appendResumeIfNeeded` adds it for pending forks too. Origin record untouched, so the origin keeps resuming its own transcript.
- Fork from an earlier message: no new code; `rewindOnDrift` finds the shared anchor and adds `--resume-session-at`. `sessionSync.ts`: a pending fork with no matching anchor (older than the 20 kept) drops the record and starts fresh with the catch-up, instead of resuming turns the fork dropped.
- Verification: `bun test test/provider/claude-code/sessionSync.test.ts` 8 pass (2 new: full fork branches + origin resumes without fork flag; partial fork rewinds to `-a1`); `cliArgs.test.ts` pass; `bun run typecheck` (opencode) exit 0. `Session.fork` -> provider wiring not covered by a test; needs live check.
- ERROR: first test run failed only in cleanup (EBUSY: origin fixture removed the shared cwd while the fork's fake CLI ran). Fixed: fixtures clean up newest first and only the owner removes the cwd.

### User
Claude chats
- Forking a Claude chat (Ctrl+P > fork) now continues the same Claude Code conversation in the fork instead of asking to start a new one.
- The original chat is unaffected: it keeps its own Claude conversation, and the two branch from the fork point.
- Forking from an earlier message rewinds the fork's Claude conversation to that point; if it is too far back, the fork starts a new Claude conversation with the last exchange.

---

## 2026-10-19 (~07:48) - v0.2.252 timeoutsEstimate - Esc-back restores selection in every menu - Claude Opus 5.5; Implementation

### Agent
- Meta: Claude Opus 5.5; Implementation; completed. Pass over all unpushed work (presets, Usage palette entry, Esc back, selection restore); user approved both changes below.
- Version: 0.2.252 timeoutsEstimate (bumped earlier this session)
- Changed `dialog.tsx`: selection memory is now shared. Drill-in `replace` with `back` records the opener as `parent: DialogMemory` (selection + its own parent); `escape()` hands `current.parent` to the replace the back callback runs, so every back link (model picker hidden/provider/category screens, palette hotkey, warm-up) restores row and search. Redraws that reuse the screen's selection keep their parent. Read entries via `unwrap`: store proxies broke the `===` redraw check, making a redrawn screen its own parent (palette came back with the editor's "Save preset" filter).
- Removed hand-wired `selection` from `CommandPaletteDialog` hotkey back and warm-up root back (`claudeWarmup.tsx`); kept warm-up root's own selection signal for redraws.
- Added `back` param to `DialogConfirm.show`; warm-up Replace preset confirm passes `prompt`, so Esc returns to the name prompt with the name kept (was: closed the whole editor).
- Fixed `DialogSelect.moveTo` bumps `visibilityGeneration`: the frame-deferred current-row jump from the previous entry ran after `DialogModel`'s `ref.moveTo(highlighted)` and overrode it (`local.test.ts` category picker opened for the wrong model). Explicit moves now cancel pending deferred scrolls.
- Reviewed sol palette dispatch change (palette stays open during `dispatchCommand`): commands that bail on `dialog.stack.length` are `hidden` and absent from the palette; command layers carry no mode, so dispatch is unaffected. Risk: plugin commands checking `api.ui.dialog.open` now see true while running from the palette.
- MISTAKE: previous entry's `renderer.once("frame")` change ran only warm-up tests; it broke `local.test.ts` until this pass. Shared `DialogSelect` timing changes need the dialog-using suites (`local.test.ts`, `subagentDialog`, `commandPalette`) before handoff.
- Updated sibling wiki `Keybinds.md` `esc` row (back keeps item and search; menus without a back step close).
- Verification: full tui `bun test`: 635 pass, 2 fail (known `subagentDialog.test.tsx` pair, AGENTS.md Known failures), 640 tests / 99 files. Added Esc-on-confirm check to `claudeWarmupRendered.test.tsx`. `bun run typecheck` (tui): exit 0. No build/install.

### User
Menus
- Pressing Esc to go back now returns to the item and search you had in every menu with a back step, including the model picker's screens.
- In the warm-up editor, Esc on "Replace preset?" goes back to the name prompt instead of closing the editor.

---

## 2026-10-19 (~07:38) - v0.2.252 timeoutsEstimate - Scroll restored menu row into view on back - Claude Opus 5.5; Implementation

### Agent
- Meta: Claude Opus 5.5; Implementation; completed. Finished Sol session `ses_eacf22c70ffenl801QVVihZXvc`, which aborted mid-debug.
- Version: 0.2.252 timeoutsEstimate
- Fixed `DialogSelect` restore scroll (`dialog-select.tsx`): Esc back restored the highlighted palette row but left the list at the top until an arrow key. Two causes: (1) `scrollToSelection` read `target.y`; ScrollBox viewport culling skips `updateFromLayout` on off-screen rows, so never-drawn rows report y=0. Now reads Yoga `getLayoutNode().getComputedTop() - scroll.scrollTop`. (2) Palette rebuilds its rows after mount (`<For>` recreates them), so Sol's double `requestAnimationFrame` sometimes ran before the new rows had layout. Now waits on `renderer.once("frame")` (fires after a full render).
- Fixed typecheck: restored selection value typed `unknown`; added `restoredValue as T | undefined` in `DialogSelect`.
- Removed Sol debug `console.log`s from `dialog-select.tsx` and the layout dump plus unused imports from `test/claudeWarmupRendered.test.tsx`. Wrapped long palette back line in `command-palette.tsx`.
- Kept: `preserveSelection` path still uses double rAF; not touched (outside this bug).
- Verification: `bun test test/claudeWarmupRendered.test.tsx`: 5 pass, 0 fail (scroll test failed before fix, passed 3 repeat runs after). `bun run typecheck` (tui): exit 0. `git diff --check`: clean. No build/install.

### User
Menus
- After pressing Esc to go back, the list now scrolls straight to the item you were on, without needing an arrow key first.

---

## 2026-10-19 (~03:34) - v0.2.251 witchNumbered - Restore menu selection on back - GPT-6.1 Sol; Implementation

### Agent
- Meta: GPT-6.1 Sol; Implementation; completed
- Version: 0.2.251 witchNumbered (already bumped this session)
- Added per-screen selection signal to dialog entries; `DialogSelect` snapshots selected value and filter on cleanup, restores both and scrolls selected row into view. New searches still reset selection normally.
- Kept warm-up root selection across redraws and nested time/preset screens; returned parent carries its own selection. Palette hotkey back carries palette selection too. State lasts only for the dialog flow.
- Expanded rendered regression: unfiltered Wednesday selection survives Esc and Enter reopens Wednesday; preset row and filtered palette entry reopen with Enter; no schedule writes. Updated existing checks to clear restored searches before inspecting other rows; pending-save menu remains locked and retains its search.
- Verification: `bun test test/claudeWarmupRendered.test.tsx`: 4 pass, 0 fail, 41 assertions. Updated sibling wiki. No build/install or broad checks run.

### User
Menus
- Going back restores the highlighted item and search text, including the command palette and warm-up schedule editor.

---

## 2026-10-19 (~03:30) - v0.2.251 witchNumbered - Warm-up editor back navigation - GPT-6.1 Sol; Implementation

### Agent
- Meta: GPT-6.1 Sol; Implementation; completed
- Version: 0.2.251 witchNumbered
- Fixed `claudeWarmup.tsx` account editor: capture opening dialog and its back callback; restore that parent on Esc, including after draft redraws and nested times/preset screens.
- Changed `CommandPaletteDialog` dispatch: retain current screen until command runs so drill-ins can capture their actual parent; clear afterward only when command did not replace it.
- Added rendered regression covering oc palette, full palette, alternate Usage parent, mode redraw, nested times back, root back, and final dismissal without schedule writes. `bun test test/claudeWarmupRendered.test.tsx`: 3 pass, 0 fail, 32 assertions.
- Updated sibling wiki `Claude-Code.md`. No build/install or broader checks run.

### User
Warm-up schedules
- Esc goes back one screen at a time, returning from the schedule editor to the menu that opened it.

---

## 2026-10-19 (~03:23) - v0.2.250 humblesSuppress - Usage palette namespace correction - GPT-6.1 Sol; Implementation

### Agent
- Meta: GPT-6.1 Sol; Implementation; completed
- Version: 0.2.250 humblesSuppress (already bumped this session)
- Fixed `USAGE_MENU_COMMAND` in `sidebarTools.tsx`: namespace `palette`, category `oc`, existing Show usage handler. `CommandPaletteDialog` queries reachable `palette` commands before its category filter; category alone never exposed the sidebar-scoped command.
- Added `test/component/usagePalette.test.ts` against real OpenTUI keymap using the production descriptor. Checks the palette namespace/category query, group, and dispatch. Confirmed failure with old namespace (undefined entry), then 1 pass, 0 fail, 4 assertions with corrected namespace. `git diff --check` passed.
- Corrected wiki calendar wording: open through Usage menu; its separate command remains sidebar-scoped.
- MISTAKE: previous follow-up checked category but missed namespace and claimed availability without a registry test. Check both command-registration namespace and palette filters before declaring a palette entry reachable.
- No build/install performed; user-installed check remains Ctrl+O -> Third party harness management -> Show usage.

### User
Usage
- Show usage is now registered in the oc palette's command namespace, fixing its absence after the previous change.

---

## 2026-10-19 (~03:19) - v0.2.250 humblesSuppress - Usage menu in oc palette - GPT-6.1 Sol; Implementation

### Agent
- Meta: GPT-6.1 Sol; Implementation; completed
- Version: 0.2.250 humblesSuppress (already bumped this session)
- Changed existing `sidebar.usage` registration in `sidebarTools.tsx` to category `oc`, group Third party harness management. oc palette filters by category; Sidebar hid Show usage. Kept command identity and existing menu handler.
- Updated sibling wiki `Sidebar.md` with in-session Ctrl+O entry; corrected calendar shortcut wording to full palette.
- Verification: `git diff --check` passed. Metadata-only change; no tests/typecheck/build/install run. User check: Ctrl+O -> Third party harness management -> Show usage.

### User
Usage
- Show usage now appears in the oc command palette under Third party harness management while a session is open.

---

## 2026-10-19 (~03:16) - v0.2.250 humblesSuppress - Named warm-up schedule presets - GPT-6.1 Sol; Implementation

### Agent
- Meta: GPT-6.1 Sol; Implementation; completed after user-authorized verification follow-up
- Version: 0.2.250 humblesSuppress
- Added Save preset/Load preset in `tui/src/claudeWarmup.tsx`: named daily/weekly snapshots, shared local `claudeWarmupPresets.json`, current time zone, draft-only load, explicit account Save activation, case-insensitive replacement confirmation.
- Added strict preset validation and fresh read-modify-write under Flock with five-second timeout; awaited atomic publication preserves other tabs' additions and surfaces storage errors. Added busy/generation guards against duplicate submits and late dialog reopening.
- Added focused real-file persistence/concurrency/error checks in `claudeWarmup.test.ts` and rendered save/load/replace/activation/dismissal checks in `claudeWarmupRendered.test.tsx`. Updated FORK and sibling wiki `Claude-Code.md`.
- Fixed rendered test synchronization: Esc changed dialog content before keyboard focus moved; following picker search reached the account editor and Enter toggled its mode. Wait for focus transition on back/select, reject destroyed inputs, and distinguish name textarea from InputRenderable (a textarea subclass). Product code needed no fix for this timeout.
- Verification: worker `bun test test/claudeWarmup.test.ts`: 23 pass, 0 fail, 194 assertions. Final parent `bun test test/claudeWarmupRendered.test.tsx`: 2 pass, 0 fail, 15 assertions. `git diff --check` passed before notes insertion. No build, install, broad checks, real Claude usage, or push; installed acceptance remains user-owned.
- MISTAKE: initial rendered check shipped into the working tree with an unresolved timeout and stopped after two attempts. User authorized follow-up; diagnostic frame exposed the wrong focused picker. Synchronize dialog focus, not only stack identity or visual idle.
- Preserved pre-existing `src/bun.lock` change. Plan: `C:\Users\Foster\.config\opencode\plans\claudeWarmupPresets.md`.

### User
Warm-up schedules
- Save preset keeps multiple named daily or weekday schedules for reuse across accounts and restarts.
- Load preset copies times into the editor; review them and press Save to activate for that account.
- Reusing a name asks before replacing it, and saving a preset leaves active schedules alone.

---

## 2026-10-19 (~02:33) - v0.2.249 caliburThornberry - Font size arrow hints - GPT-6.1 Sol; Implementation

### Agent
- Meta: GPT-6.1 Sol; Implementation; completed
- Version: 0.2.249 caliburThornberry
- Added compact `↑ +1` / `↓ -1` footer hints in `DialogPrompt` for numeric prompts only; values follow configured step, hidden while busy. Reused theme text/textMuted roles.
- Updated sibling `oc.wiki/Install.md` with visible keyboard hints.
- Verification: `git diff --check` passed before notes insertion. Presentation-only change; no tests, build, or live TUI run. Existing keyboard behavior unchanged.

### User
Terminal font
- Font Size now shows `↑ +1` and `↓ -1` beside Enter so keyboard adjustment is visible.

---

## 2026-10-19 (~02:29) - v0.2.248 homerGranny - Font size keyboard stepping - GPT-6.1 Sol; Implementation

### Agent
- Meta: GPT-6.1 Sol; Implementation; completed
- Version: 0.2.248 homerGranny
- Added optional `DialogPrompt.numeric` min/max/step bindings at existing priority 1; arrows replace editable text and move cursor to end, ahead of managed textarea navigation.
- Changed only Font size caller to enable Up/Down by 1 within 4..48 and seed actual editable saved size. Blank/nonfinite input starts at minimum; typed decimals and confirmation-only save remain.
- Updated sibling `oc.wiki/Install.md`; preserved pre-existing font changes, wiki edits, and v0.2.247 notes. FORK unchanged by this session.
- Verification: `bun test test/cli/tui/dialog-prompt.test.tsx` in packages/tui: 7 pass, 0 fail, 26 assertions. Added keyboard coverage for stepping, clamps, invalid/blank values, decimal typing, Enter, Esc, and ordinary text navigation. No broad checks, build, install, or push.
- MISTAKE: first test run used nonexistent `textarea.cursor.row`; changed test to existing `cursorOffset` API and reran successfully.
- Manual check pending: installed WezTerm `/font` -> Size, edit with arrows, Esc leaves font unchanged, Enter applies.

### User
Terminal font
- Font Size opens with your saved size ready to edit; Up/Down changes it by 1 within 4 to 48 pt, and typed decimals still work.
- Enter applies the size; Esc cancels without applying edits.

---

## 2026-10-19 (~02:20) - v0.2.247 docsDoomed - Font review fixes and buildNotes rotation - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low effort; Implementation (/imp of `~/.config/opencode/plans/2026-10-19-review-since-push.md`); completed
- Version: 0.2.247 docsDoomed (no second bump; already bumped this session)
- Fixed Reset in an oc tab whose KV predates another tab's pick: `ocCommands.tsx` Reset now writes `fontEscape(undefined)` through `useRenderer` + `writeTerminalEscape` before `kv.set(undefined)` (the `app.tsx` effect saw no change)
- Fixed `terminalFont.test.ts` skip guard: requires consola, arial, and msgothic.ttc, not consola alone
- Updated `FORK.md`: Terminal font row medium -> high (counts high 51, medium 19, total 87), noted accepted stale-tab case; Plugins row no longer mentions removed `weztermZoom`
- Added missing notes: wezFig `buildNotes.md` (`oc_font` handler), `C:\Users\Foster\buildNotes.md` (plugin removal)
- Moved active notes to `buildNotes.archive12.md` (1009 lines, byte-equal to HEAD after CRLF normalization); this session's two entries were cut before the move and carried here. Summary extended through v0.2.246
- Kept: `src/bun.lock` shows modified with no content diff; pre-existing, untouched
- MISTAKE: inserted two entries into a 1009-line file before rotating; summary already says "Count buildNotes lines before inserting". Repaired by cutting them out before archiving, so the archive equals the committed file
- Verification: `bun test test/util/terminalFont.test.ts` 3 pass, 8 assertions; `bun run typecheck` in packages/tui exit 0

### User
Terminal font
- Reset to terminal default now works in every oc tab of the window, including tabs opened before the font was set.

---

## 2026-10-19 (~02:17) - v0.2.247 docsDoomed - oc palette Font sets the WezTerm font - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low effort; Implementation (/imp of `~/.config/opencode/plans/ocFontPalette.md`); completed, live check pending
- Version: 0.2.247 docsDoomed
- Added `tui/src/util/terminalFont.ts`: `parseFontList` (upright faces from `wezterm ls-fonts --list-system`, path + TTC index), `isMonospaceFile` (`post.isFixedPitch` or OS/2 PANOSE family 2 + proportion 9, header reads only), `listMonospaceFonts` (cached per run, built-in JetBrains Mono only), `fontEscape` (`oc_font` base64 JSON, empty = reset). 29 families, ~280 ms here
- Added palette `oc.font` (`/font`, Layout) in `ocCommands.tsx`: Family, Weight (family's weights), Size prompt 4-48, Size +/-0.5, Reset. Non-WezTerm toast
- Added `app.tsx` effect: sends `oc_font` on KV `terminal_font` change and at start; never sends empty at start (per-window overrides, other oc tabs keep theirs); `destroyRenderer` does not clear it
- Changed plan: KV `terminal_font` instead of tui config schema (no schema change, same persistence as other Layout toggles). Note: KV `set` merges objects, so callers pass full objects and Reset sets undefined
- Changed wezFig `wezterm.lua`: `oc_font` handler (`set_config_overrides` font/font_size, `wezterm.serde.json_decode`) replaced `oc_font_zoom`. Removed personal `~/.config/opencode/tuiPlugins/weztermZoom.ts`, its test, empty folder, and `tui.json` plugin entry
- Updated `docs/wezterm.md` Font section, `FORK.md` row (medium, total 87), wiki `Install.md`
- Verification: `bun test test/util/terminalFont.test.ts` 3 pass, 8 assertions (real ls-fonts lines; consola/arial/msgothic.ttc index 0/1). `bun run typecheck` in packages/tui exit 0. Live probe listed 29 families. No build; WezTerm Lua handler not exercised live
- Risk: fonts that set neither fixed-pitch flag are missing from the list; next step would be an `hmtx` uniform-advance check

### User
Terminal font
- oc palette **Font** (`/font`) picks a monospace font family, weight, and size for the WezTerm window, and Reset returns to your WezTerm config.
- oc remembers the font and applies it again when it starts.
- The font applies to the whole WezTerm window, so other tabs in it change too.
- Font needs the `oc_font` handler from `docs/wezterm.md` in your WezTerm config; other terminals show a warning.
