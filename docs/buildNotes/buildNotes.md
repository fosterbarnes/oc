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
- Kept histories verbatim: archive1 (2026-08-20 through 09-09), archive2 (09-09 through 09-15), archive3 (09-15 through 09-28), archive4 (1144 lines), archive5 (1019 lines through v0.2.65), archive6 (1127 lines through v0.2.87), archive7 (1176 lines, v0.2.88 through v0.2.120, committed e4d73d1), archive8 (1152 lines, v0.2.120 through v0.2.148), archive9 (1059 lines, v0.2.149 through v0.2.172; its summary was archive8's carried unchanged, so archive9 is first summarized here), archive10 (1122 lines, v0.2.173 through v0.2.202). Archive8 retains the previous cumulative summary plus complete later entries, earlier hashes, checks, and risks. Never edit archives.
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

# Historical entries (newest first)

---

## 2026-10-16 (~01:00) - v0.2.217 sunTemptation - agentPush and prePush refuse code changes without a version bump - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low effort; Implementation (after a read-only audit of the named version commits); completed
- Version: 0.2.217 sunTemptation
- Audit: 4 code-changing pushes reused the previous version: `7ac3de4` (v0.2.153), `8a42a5c` (v0.2.190), `b5e4f26` (v0.2.194), `820ddab` (v0.2.201). All were Claude sessions that skipped `bumpVersion.ps1`; the build-notes skill only says to read the version. The docs-only repeats `84801be`, `910eca0` (v0.2.168) and `ff3100a` (v0.2.216) are allowed.
- Added `getUnbumpedCodeChanges` in `.scripts/scriptHelper.ps1`: when HEAD's `src/.version/version` equals the current version, it returns the changed and untracked paths outside `docs/`, `*.md`, `scc.txt`, `UPSTREAM`, and `src/.version/`. It uses `git -C $repoRoot`, so it works from any cwd.
- Added gate in `.scripts/agentPush.ps1`: `-Context` prints an `ACTION:` line (bump, fix the buildNotes heading, rerun) and the default mode throws before prePush.
- Added gate as the first step of `.scripts/prePush.ps1`, so manual pushes are checked too. Documented it in `SCRIPTS.md`.
- Verification: ParseFile reported 0 errors on all 3 scripts. With the version temporarily set back to 0.2.216, the function (run from `src\packages`) listed the changed scripts and `prePush.ps1` exited 1 before typecheck. Restored to 0.2.217, the function returned nothing. Typecheck was not run.

### User
Pushes
- A push now stops if the code changed but the version was not bumped, and says to run `bumpVersion.ps1`. This applies to agent pushes and to `prePush.ps1`; docs-only changes still go through.

---

## 2026-10-16 (~00:19) - v0.2.216 - Agents may offer a revive after oc changes - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low effort; Implementation (/imp after /spit review of Sol's plan); completed
- Version: 0.2.216
- Added exception to `AGENTS.md` Safe local builds and the strictly-user-driven build rule: the user-approved revive offer in global `principles.md` may queue `.scripts\reviveAndInstall.ps1` or `.scripts\revive.ps1` via `run_after_turn`.
- Kept: no code change. `run_after_turn` already spawns only on session idle (`runAfterTurn.ts:20-33`); `opencode.jsonc` allows `revive*.ps1` without a permission prompt, so the question answer is the only gate.
- Dropped Sol's `oc.wiki/Launching.md` step: personal agent policy, not an oc feature.
- Verification: none possible offline (policy text). Live check pending by user.

### User
Agent workflow
- After finishing changes to oc that need a restart, an agent may ask once whether to build, install, and revive (or revive only); no UI change.

---

## 2026-10-15 (~23:47) - v0.2.216 oprahChugs - Remove subagent descriptions from the list - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low effort; Implementation; completed
- Version: 0.2.216 oprahChugs (same session; no second bump)
- Removed description line from `dialog-subagents.tsx` at user request; rows are name + effort only.
- Removed `activeDetails` from `ui/dialog-select.tsx` (added in previous entry, no other users); file now differs from HEAD only by `nested`.
- Verification: `bun run typecheck` in `packages/tui` exit 0.

### User
Subagents dialog
- The highlighted entry no longer shows a description line.

---

## 2026-10-15 (~23:44) - v0.2.216 oprahChugs - Fix Subagents list not scrolling with the cursor - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low effort; Implementation; completed
- Version: 0.2.216 oprahChugs (same session; no second bump)
- Fixed: previous entry put `selectedValue()` in the `options` memo, so every move rebuilt all option objects; `<For>` recreated every row, and `scrollToSelection` measured unlaid-out children, leaving the list at the top.
- Added `activeDetails` to `DialogSelectOption` (`ui/dialog-select.tsx`): rendered after `details` only while the row is active; counted in `rows()` via `flat()[store.selected]`.
- Changed `dialog-subagents.tsx` to pass descriptions as `activeDetails`; `selectedValue` now only drives the copy footer hint. Also closes the post-delete gap (DialogSelect owns the highlight).
- Verification: `bun run typecheck` in `packages/tui` exit 0. Live check left to user.

### User
Subagents dialog
- The list scrolls with the cursor again, and the highlighted entry's description shows right away after a delete.

---

## 2026-10-15 (~23:28) - v0.2.216 oprahChugs - Subagents layout from structured fields only - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low effort; Implementation; completed
- Version: 0.2.216 oprahChugs (same session; no second bump)
- Removed generated-description text matching from `dialog-subagents.tsx` (MISTAKE below). Layout now uses only `agent.model` (provider group, model subcategory) and `agent.variant` (right footer).
- Changed descriptions to show as `details` on the highlighted row only (`selectedValue` from `onMove`), for all agents including native.
- Added `effortRank`: no variant first, then model variant order, then unknown efforts by `EFFORT_ORDER`, unlisted last.
- Kept: models missing from `sync.data.provider` fall back to raw `modelID` as subcategory and `providerID` as group.
- Risk: after inline delete, `preserveSelection` moves the cursor without `onMove`, so the new row's description appears only after the next move.
- MISTAKE: previous two entries guessed redundancy from description text (exact, then prefix match); broke on "low reasoning" style. Rule: never derive layout from free text when structured fields exist.
- Verification: `bun run typecheck` in `packages/tui` exit 0. Live check left to user.

### User
Subagents dialog
- Every entry is one line: name on the left, effort on the right, under provider and model headings.
- The highlighted entry shows its description on a line below it.

---

## 2026-10-15 (~23:24) - v0.2.216 oprahChugs - Hide generated subagent descriptions, fix effort order - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low effort; Implementation; completed
- Version: 0.2.216 oprahChugs (same session; no second bump)
- Fixed `dialog-subagents.tsx` generated-description check: exact match failed when live model name gained suffixes ("Claude Haiku 5.5 (0.1×)", "Muse Spark 1.3 Contributor"), so Claude/Meta rows showed "<model>, <effort>." detail lines. Now end-anchored suffix strip + `model.name.startsWith(base)`.
- Fixed effort order for models with no provider variants (Grok sorted high/low/medium): falls back to `EFFORT_ORDER` (none..max).
- Verification: `bun run typecheck` in `packages/tui` exit 0. Live check left to user.

### User
Subagents dialog
- Effort entries no longer show a repeated "model, effort." line under each name, and every model lists its efforts low to high.

---

## 2026-10-15 (~23:20) - v0.2.216 oprahChugs - Subagents dialog grouped by provider - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low effort; Implementation; completed
- Version: 0.2.216 oprahChugs (same session as previous entry; no second bump)
- Changed `dialog-subagents.tsx`: `category` = provider name, `subcategory` = model name (`subcategoryColor` textMuted); sort Native, provider, model, variant order, name. Removed per-row `categoryView`.
- Added `nested` prop to `ui/dialog-select.tsx`: keeps category heading when every row has a subcategory (`hasHeading`) and adds a blank line before each later subcategory (padding + `rows()` height count). Default off, so model favorites keep old layout.
- Updated `../oc.wiki/Agents-and-Skills.md` wording.
- Risk: model name no longer fuzzy-searchable (DialogSelect searches title + category only).
- Verification: `bun run typecheck` in `packages/tui` exit 0. Live check left to user.

### User
Subagents dialog
- Entries are now grouped under provider headings, with a dimmer heading for each model and a blank line between models.

---

## 2026-10-15 (~23:16) - v0.2.216 oprahChugs - Cleaner Subagents dialog layout - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low effort; Implementation; completed
- Version: 0.2.216 oprahChugs
- Changed `tui/src/component/dialog-subagents.tsx`: groups by model display name via `categoryView` (model accent + provider muted, on every row so headings survive filtering); Native group first; rows are bare names with effort as right footer, efforts in model variant order; native rows show model name; dropped padded `titleWidth` column and auto-generated descriptions (hand-written ones show as `details`).
- Added `subagent.add` action (`subagent_add` ctrl+a in `config/keybind.ts`) plus plain "Add subagent…" row; removed "Actions" category.
- Changed delete to inline double-press (row turns `theme.error`, as in workspace list); dropped `DialogConfirm` + reopen; refetches both resources so cursor stays put (`preserveSelection`). Delete now `hidden` on non-editable rows instead of greyed.
- Added "copy enter" footer hint (hidden on Add row); after add, reopens and `moveTo`s first added agent via `highlight` prop.
- Changed `dialog-subagent-efforts.tsx`: `model` prop for title "Efforts for <model>", no filter, `[✓]` rows, "Add N subagent(s)" label, chosen efforts returned in variant order.
- Regenerated `docs/keybinds.md`; updated `../oc.wiki/Agents-and-Skills.md` Managing subagents.
- Kept shared `DialogSelect` unchanged; long footers there still squeeze titles (`dialog-select.tsx:872`), avoided by not sending long footers.
- Verification: `bun run typecheck` in `packages/tui` exit 0; `keybindDocs.ts --check` exit 0. Live TUI check left to user.

### User
Subagents dialog
- Entries are grouped under readable model names with the provider beside them, and each entry shows only its effort on the right.
- Ctrl+A starts adding a subagent, and the new entry is highlighted when the list comes back.
- Ctrl+D now asks you to press it again on a red row instead of opening a confirm dialog, and only appears on entries you can delete.
- The effort picker shows the model name, uses checkboxes, lists efforts low to high, and has no search box.

---

## 2026-10-15 (~23:05) - v0.2.215 aliceBroooo - Remove manual session-handoff command - GPT-6.1 Sol, default reasoning; Implementation

### Agent
- Meta: GPT-6.1 Sol; default reasoning; Implementation; completed
- Version: 0.2.215 aliceBroooo
- Removed `oc.handoff_now` palette registration, `/handoffNow`, TUI handler/toasts, and unused route hook from `tui/src/app.tsx` and `contextLimit.tsx`.
- Kept automatic Context limit handoffs and session API; user clarified removal covers only the palette item and its TUI code.
- Updated `FORK.md`, retired-command row in `SCOPE.md`, and `../oc.wiki/Sessions.md`; preserved pre-existing wiki edits.
- Verification: `git diff --check` passed; TUI and wiki searches found no manual-command identifiers or label. Tests/build not run for deletion-only UI wiring.

### User
Command palette
- Removed Hand off session and its slash alias; automatic Context limit handoffs remain available.

---

## 2026-10-15 (~22:56) - v0.2.214 haldwaqyBsod - One-screen favorite category picker and cross-category moves - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low; Implementation (/imp from plan `~/.config/opencode/plans/favoriteCategoryPicker.md`); completed
- Version: 0.2.214 haldwaqyBsod (kept this session's bump)
- Replaced `categoryPicker` + `editCategory` + `manageCategories` + `categoryActions` + `colorPicker` in `component/dialog-model.tsx` with `DialogFavoriteCategory`: title `Category for <model>`, rows None + categories with count and color swatch footer, Enter assigns, search with no exact (case-insensitive) match prepends `Create "<query>"`. Footer actions rename/color/move up/move down/delete (press-again confirm via `toDelete`, red `bg`, reset in `onMove`); move actions hidden while searching. Rename/color return to the picker on the edited row via `onReopen(highlight)` + `ref.moveTo`.
- Added `dialog.model_category.rename|color|move_up|move_down|delete` in `config/keybind.ts` (`ctrl+r`, `ctrl+l`, `shift+up/down`, `ctrl+d`); `ctrl+k` skipped (input delete-to-line-end), `ctrl+n` skipped (`dialog.select.next`). Regenerated `docs/keybinds.md` via `script/keybindDocs.ts`.
- Changed `moveModelFavorite(favorites, model, direction, categories)` in `context/local.tsx`: no sibling in direction -> joins adjacent group of `[undefined, ...categories]`, first when moving down, last when moving up, in place when target empty; category key dropped for uncategorized. No-op at first group top / last group bottom.
- Updated `test/context/local.test.ts`: store move test now expects the hop, new pure hop test, menu test drives Create row, ctrl+r/ctrl+l/ctrl+d in the picker. Updated `FORK.md`, `../oc.wiki/Keybinds.md`, `../oc.wiki/Configuration.md`.
- Verification: `bun test test/context/local.test.ts` 19 pass 0 fail; `tsgo --noEmit` exit 0 after a test-only type fix. Live check after rebuild unchecked.
- ERROR: first `tsgo` run failed on `test/context/local.test.ts` (`category` missing on inferred union type); fixed by typing the helper parameter.

### User
Favorite model categories
- The category picker (`ctrl+g`) now names the model you are editing and shows each category's model count and color.
- Type a new name in the picker's search and press Enter on `Create "name"` to create the category and assign the model in one step.
- Rename (`ctrl+r`), recolor (`ctrl+l`), reorder (`shift+up/down`), and delete (`ctrl+d` twice) the highlighted category right in the picker; the Manage categories screens are gone.
- In `/models`, `shift+up/down` at the edge of a category now moves the favorite into the neighboring category.

---

## 2026-10-15 (~22:42) - v0.2.214 haldwaqyBsod - Hide Favorites heading when every favorite has a category - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low; Implementation follow-up; completed
- Version: 0.2.214 haldwaqyBsod (kept this session's bump)
- Added `hasHeading(category, options)` in `ui/dialog-select.tsx`: category heading hidden when every row has a `subcategory`. Applied in render, `rows()` (gap row still counted for i>0), and `scrollToSelection` child index.
- Changed first subcategory heading: paddingTop 1 when its category heading is hidden and the group is not first, so the section gap stays.
- Updated `FORK.md` row and `../oc.wiki/Keybinds.md`.
- Verification: `bun test test/context/local.test.ts` 18 pass 0 fail (new assertions: heading hides when all favorites categorized, returns when one is uncategorized); `tsgo --noEmit` exit 0. Live check after rebuild unchecked.

### User
Favorite model categories
- When every favorite is in a category, `/models` no longer shows the extra Favorites heading; it returns as soon as one favorite has no category.

---

## 2026-10-15 (~22:36) - v0.2.214 haldwaqyBsod - Flush favorite category headings and category colors - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low; Implementation; completed
- Version: 0.2.214 haldwaqyBsod
- Changed `ui/dialog-select.tsx`: subcategory heading paddingLeft 5 -> 3, rows lose the +4 subcategory indent; follows v0.2.208 favorite categories. Added `DialogSelectOption.subcategoryColor` (heading fg, default `theme.accent`).
- Added `favoriteCategoryColors` (name -> theme color name or `#rgb`/`#rrggbb`) in `context/local.tsx`: `FAVORITE_CATEGORY_THEME_COLORS`, `isFavoriteCategoryColor`, load filter (known categories, valid values), persist in `model.json`, `favoriteCategoryColor(name)` resolves RGBA, `setFavoriteCategoryColor`; rename moves the color, delete drops it.
- Note: Solid store setters shallow-merge objects; remove a record key by setting it to `undefined` (store type `Record<string, string | undefined>`).
- Added `Color…` row in category actions (`component/dialog-model.tsx`) -> picker: Default, 7 theme colors with swatch footers, Custom hex prompt.
- Updated `FORK.md` row and `../oc.wiki/Keybinds.md` favorite categories section.
- Verification: `bun test test/context/local.test.ts` from `src/packages/tui` 18 pass 0 fail (updated flush-alignment and color persistence/rename/delete assertions); `tsgo --noEmit` exit 0. Live picker and colors unchecked.

### User
Favorite model categories
- Category headings and their models in `/models` now line up with the Favorites heading instead of being indented.
- Each category can have its own heading color: Manage categories, pick a category, then Color… to choose a theme color, a custom hex value, or Default.

---

## 2026-10-15 (~21:53) - v0.2.213 tarStained - Claude under oc: unsupported tools off, oc schedule tools, claudeSettings - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low effort; Implementation (imp from /spit plan `~/.config/opencode/plans/claudeFeatureFixes.md`, audit `claudeFeatureAudit.md`); completed
- Version: 0.2.213 tarStained
- Added `CLAUDE_UNSUPPORTED_TOOLS` (`provider/claude-code/shared.ts`): EnterWorktree, ExitWorktree, CronCreate, CronDelete, CronList, ScheduleWakeup; `resolveDisallowedTools` always pushes them. Closed command turns already use `--tools` allowlist.
- Note: fake-model check showed EnterWorktree moves CLI cwd to `<project>\.claude\worktrees\<name>` for all later turns (oc snapshots/undo/diff miss edits); CronCreate result says "Session-only ... dies when Claude exits".
- Changed `disallowedToolFlags`: task/task_batch also disable `Workflow` (CLI-internal subagents past oc).
- Added `tool/schedule.ts`: `schedule_prompt` (`at` local `YYYY-MM-DD HH:MM` or `time`-tool format, or `delaySeconds`; target current/fork/new; one-shot), `schedule_list`, `schedule_cancel`. Uses `SessionPrompt.queue` via lazy import (same cycle-avoiding pattern as planExecute); payload keeps last user message model/variant and `ctx.agent`. Default allow; prompt/cancel call `ctx.ask` with their tool id. Registered in `tool/registry.ts`.
- Added proxy defs + `SCHEDULE_TOOL_NAMES` (`proxyToolDefs.ts`); `schedule` proxyTools entry expands to all three (`spawnPlanning.ts resolvedProxyTools`); `DEFAULT_PROXY_TOOL_NAMES` now includes `schedule`; read-only preset drops it (`READ_ONLY_DENIED_PROXY_TOOLS`).
- Changed `buildToolEnvironmentNote`: background Bash/Monitor end with the CLI process; schedule line when the proxy is live.
- Added provider option `claudeSettings` (`types.ts`, `index.ts`); `buildCliArgs` merges it with fastMode into one `--settings`; both spawn paths pass it. Takes effect on next spawn (not in respawn hash).
- Added `accountSettingsDrift` (`startupDiagnostics.ts`): warns when pool accounts differ on autoCompactEnabled/autoMemoryEnabled/outputStyle/permissions.deny (unless pinned) or CLAUDE.md text (CRLF-normalized; a lone `@import` counts as shared).
- Note: CLI 2.1.301 disables tool search for non-Anthropic `ANTHROPIC_BASE_URL`; `ENABLE_TOOL_SEARCH=true` turns it on. Deferred tools appear only in a reminder until ToolSearch loads them (then `defer_loading: true` in `tools`). `openChat` gained `env` option.
- Changed user config `~/.config/opencode/opencode.jsonc`: proxyTools + `schedule`, `claudeSettings: { autoCompactEnabled: true }`. User still runs the second-account link script (plan file).
- Docs: FORK.md rows Schedule tools + Claude settings for every account; SCOPE.md later row Repeating scheduled prompts; wiki `Claude-Code.md` (scheduling, tools turned off, option rows), `Sessions.md` agent schedules paragraph (wiki push is user's).
- Risk: not checked whether `permissions.deny` via `--settings` merges or replaces account deny lists. Model-scheduled prompt firing not checked live.
- Verification: `tsgo --noEmit` clean (opencode). Unit: cliArgs, fundamentalTools, proxyMcp, proxyTask, subagentHint, permissionPresets, startupDiagnostics, commandToolPlan, tool/schedule, tool/registry 205 pass; commandPermissions, session/tools, toolInputRepair, tool/skill, tool/task 61 pass; session/prompt 56 pass. Fake-model `fakeModel.test.ts` 27 pass incl. new scenarios (tool list + queued row; ToolSearch deferred load).

### User
Claude Code provider
- Claude can no longer move itself into a git worktree that oc does not track, and Claude Code's own multi-agent Workflow tool is off while oc runs its subagents.
- Claude Code's own cron and wakeup tools are off because they vanished on any restart; agents now schedule prompts with oc's own tools, which survive restarts.
- A new `claudeSettings` option applies Claude Code settings to every pooled account, and oc warns at startup when the accounts' settings or CLAUDE.md differ.

Sessions
- Any agent can schedule a one-time prompt for later, list its schedules, or cancel one; the prompts show in the session queue like ones you schedule yourself.

---

## 2026-10-15 (~21:35) - v0.2.212 vitaminsCowards - Unified time settings (clock and time zone) - Opus 5.5, low effort; Implementation

### Agent
- Meta: Opus 5.5; low effort; Implementation (imp from /spit plan `~/.config/opencode/plans/timeSettings.md`); completed
- Version: 0.2.212 vitaminsCowards
- Added config `time: { clock: "24h"|"12h", timezone: "auto"|IANA }` in `core/src/v1/config/config.ts`; regenerated `sdk/js/src/v2/gen/types.gen.ts` (+4 lines).
- Added `core/src/util/timeZone.ts`: `applyTimeZone` sets/restores process `TZ` (unknown zone -> startup zone), `SYSTEM_TIME_ZONE` captured before override.
- Note: Bun 1.4.1 measured: runtime `TZ` changes `Date` getters and `Intl.DateTimeFormat` defaults process-wide; deleting restores; `toLocale*String` stays on startup zone; a worker's `TZ` write is ignored but main-thread writes reach workers. So native build applies via TUI thread; resident server applies in `Config.loadGlobal` (opencode `config/config.ts`).
- Added `Locale.setTimeSettings`/`clock`/`zone`/`format` (`tui/src/util/locale.ts`); `time`/`shortDateTime`/`datetime` use `Intl.DateTimeFormat` with `hourCycle`. `app.tsx` effect mirrors `sync.data.config.time`.
- Removed KV `claude_resume_clock`, `claude_warmup_clock`, both Time format rows, `ClockFormat`, `formatResumeAt`, and clock params from warm-up helpers (`displayClock` etc. read `Locale.clock()`).
- Changed to Locale: prompt resume footer, auto-resume list/account limits, schedule dialog (hour12 + Next), queue labels, revive text and marker, transcript Created/Updated, usage `compactResetDate` (24h `~HH:mm`), `fullResetDate`, calendar day/weekday labels (module-level `Intl` consts were stuck on startup zone).
- Added palette **Time** (`oc.time`, `/time`, Layout) in `ocCommands.tsx`: clock toggle, zone picker (auto + `Intl.supportedValuesOf("timeZone")` with UTC offset, ~31 ms), inert Now preview; saves via `global.config.update`, applies locally, reopens.
- Kept: server-side math unchanged (time tool, `system.ts` date, warm-up schedule, cursor env follow `TZ`); warm-up ticks recompute occurrences live, no recompute hook needed.
- Risk: CLI `run`/`session` output uses Locale without config, so shows 24h OS-zone times. Project-level `time.timezone` affects TUI only; server reads global.
- Docs: FORK.md row **Unified time settings** + scheduled prompts wording; `docs/dev/CONTEXT.md` date line; wiki `Configuration.md`, `Claude-Code.md`, `Sessions.md` (wiki push is user's).
- Verification: tui tests locale/format/claudeWarmup/usageCalendar/usageFreshness/transcript 86 pass; `usageFreshness` reset-date expectation updated to 24h default. `tsgo --noEmit` clean in core, tui, opencode. Installed live check not run.
- ERROR: first typecheck missed `Locale` import in `dialogSchedule.tsx`; fixed.

### User
Time settings
- New **Time** entry in the oc palette (`/time`) sets 12-hour or 24-hour clock and the time zone (auto or any zone) for all of oc.
- Every time oc shows now follows it: message times, timeline, queue, scheduled prompts, auto-resume, warm-up, revive marker, transcripts, and the usage sidebar.
- The time zone also applies to the agent `time` tool, the date agents see, and Claude warm-up schedules.
- The separate Time format toggles in Claude auto-resume and warm-up are gone; the default is 24-hour.

---

## 2026-10-15 (~21:14) - v0.2.211 sureSmelter - Schedule keybind hint in prompt footer - Opus 5.5, low effort; Build

### Agent
- Meta: Opus 5.5; low effort; Build; completed
- Version: 0.2.211 sureSmelter
- Added `scheduleShortcut` (`useCommandShortcut("prompt.schedule")`) in `tui/src/component/prompt/index.tsx`; footer shows `<key> schedule` between agents and commands in normal mode, only with a session and a bound key.
- Added `ocPaletteShortcut` (`oc.settings_palette`, default ctrl+o): footer shows `<key> oc commands` after commands when bound.
- Verification: not run (typecheck/visual check left to user).

### User
Prompt footer
- The bottom row now shows the schedule-prompt key (default alt+s) next to `tab agents` and `ctrl+p commands` when you are in a session.
- The bottom row also shows `ctrl+o oc commands` after `ctrl+p commands`.

---

## 2026-10-15 (~20:44) - v0.2.210 chantStandards - Scheduling pass: message order and live claims - GPT-6.1 Sol; Pass

### Agent
- Meta: GPT-6.1 Sol; /pass; completed after approval for two backend fixes; no new subagents
- Version: 0.2.210 chantStandards (same session; kept existing revision bump)
- Reviewed session additions: scheduled queue/schema/API/polling, current/fork/new dispatch, Alt+S clock, queue labels, SDK and docs. User live-confirmed clock picker.
- Fixed old queue ids becoming user-message ids: Claude pending-user comparisons assume chronological ids. `queue.prepare` persists fresh `message_id` immediately before send, after fork copying. `prompt.ts` uses fresh ids for all queued sends.
- Added nullable `session_queue.message_id` via generated migration `20261016004221_sessionQueueReceipts`. Completed rows retain empty payload receipts, hidden from snapshots, so stable queue ids still deduplicate adds. Recovery checks actual message id; legacy rows fall back to original id.
- Fixed startup reconciliation releasing another host's live dispatch: claim holds existing Flock heartbeat lease (15 s stale threshold), released on persistence/settlement or service close. Startup and due polling acquire that same lease before recovering; live owners remain untouched.
- Fixed detached project-load failure leaving claimed entries stuck: `inSession` propagates failure to `fireDue`, which settles/releases and pauses the original queue.
- Verification: `bun test test/session/queue.test.ts` 14 pass, 0 fail, 53 assertions. Added fresh-id order assertions, fork-copy ordering, second-service startup after live claim, post-owner-exit recovery/deduplication, and failed project-load recovery. Migration generation and scoped diff whitespace check passed. No build, typecheck, or extra TUI tests.
- Updated `FORK.md`; existing wiki behavior remains accurate. Build/install and installed two-host recovery remain user-owned.

### User
Scheduled prompts
- Scheduled prompts get fresh message ids when they send, preventing later chats from confusing Claude's message order.
- Opening another oc process no longer releases a prompt that the first process is still sending.
- If a scheduled fork cannot load its project, its prompt returns to the paused queue instead of staying stuck as Sending.

---

## 2026-10-15 (~20:33) - v0.2.210 chantStandards - Segmented scheduling clock - GPT-6.1 Sol; Implementation

### Agent
- Meta: GPT-6.1 Sol; /imp follow-up; Implementation; completed with `general-gpt-6.1-sol-medium` implementation subagent
- Version: 0.2.210 chantStandards (same session; kept existing revision bump)
- Replaced presets/relative input in `tui/src/component/dialogSchedule.tsx` with locale-aware segmented HH:MM:SS plus AM/PM. Modal keymap owns digits, section selection, arrow steps, and submit; paste accepts full clocks; preview refreshes each second.
- Added `component/scheduleClock.ts`: immutable editing, digit auto-advance, clock carry/borrow, AM/PM, valid-range checks, next local occurrence with seconds; rejects nonexistent DST times.
- Changed `dialogQueue.tsx` schedule labels to show date and seconds. Updated `FORK.md` and sibling wiki `Sessions.md`.
- Verification: edited `test/component/dialogSchedule.test.ts` 9 pass, 0 fail, 63 assertions (subagent; parent combined run also passed all 9 logic tests). Scoped diff whitespace check passed. Build/typecheck/live TUI not run.
- MISTAKE: added an unnecessary headless dialog test; blank/garbled frame capture failed twice. Removed that agent-created test at user's request. Keep clock verification focused on logic and user-owned live interaction.

### User
Scheduled prompts
- After choosing the target, set the clock directly instead of selecting a preset or typing a delay.
- Left/right selects hours, minutes, seconds, or AM/PM; up/down adjusts hours by 1 and minutes/seconds by 10, or 1 with Shift.
- Type 044530 from hours to enter 04:45:30, then select AM/PM when using a 12-hour clock.
- The picker shows the next matching date and time, and saved queue entries show seconds.

---

## 2026-10-15 (~19:50) - v0.2.210 chantStandards - Scheduled prompts - Opus 5.5, low; Implementation

### Agent
- Meta: Opus 5.5; low; Implementation (/spit then /imp); completed, no subagents
- Version: 0.2.210 chantStandards
- Added `session_queue.run_at` + `target` (`current|fork|new`) in `core/src/session/sql.ts`; migration `20261015233906_sessionQueueSchedule` via `bun run migration` (schema.json, schema.gen.ts, migration.gen.ts regenerated).
- Changed `SessionQueue` (`opencode/src/session/queue.ts`): `nextRow` picks own-session rows by `coalesce(run_at, time_created)`; pauses hold only unscheduled rows; `mark` claims with conditional `UPDATE ... WHERE state='pending' RETURNING` (cross-process safe); added `ready`, `due(now)`; `settleRow` turns a failed scheduled row into a plain current-session row (paused) instead of retrying.
- Changed `SessionPrompt` (`prompt.ts`): drain uses `queue.ready`; added `dispatchDetached` (fork/new session created at fire time, prompt reuses entry id) and `queue.fireDue(inSession)`, skipping busy sessions to avoid stacking completion waiters.
- Added 5 s poll loop in `handlers/sessionOc.ts` beside the scheduled-resume loop; `inSession` loads the session's project via `InstanceStore.provide`. Runs in native too (webHandler builds the same handlers).
- Changed `QueuePayload.add` with `runAt` (Int) / `target`; fork/new without `runAt` -> 400. `ScheduledResume.fireEntry` now waits only on unscheduled entries.
- Regenerated legacy JS SDK; `packages/client` generate had no content change (LF-only rewrites reverted).
- Added TUI `prompt_schedule` (`alt+s`) / palette **Schedule prompt**, `component/dialogSchedule.tsx` (target step, then presets or custom `HH:mm`/`+30m`/`+1h30m` via `parseScheduleTime`), `queuePrompt(schedule)`, schedule labels in `dialogQueue.tsx`.
- Docs: `FORK.md` row, `docs/keybinds.md`, wiki `Sessions.md#scheduled-prompts`, `Keybinds.md` (wiki push is user's).
- TODO: usage-reset preset (needs sidebar usage `resetAt` wiring); pane check for the dialog.
- Risk: a detached entry whose origin session lookup fails after claim stays `dispatching` until restart (then settles to plain queued).
- Verification: `bun run typecheck` in opencode and tui clean; `bun test test/session/queue.test.ts test/session/scheduledResume.test.ts` 29 pass (3 new: pass-through + due fire, restart-pause bypass, new-session once across two SessionQueue layers); tui `dialogSchedule.test.ts` + `queue.test.tsx` + `config.test.tsx` 23 pass. No pane or live check.
- MISTAKE: `sed -i` in Git Bash stripped CRLF from `queue.ts` and `groups/session.ts`; restored. Use Edit for project files.

### User
Scheduled prompts
- In a session, type a prompt and press Alt+S (or use Schedule prompt in the command palette) to send it later.
- Pick this session, a fork of it, or a new session, then a time: in 15 minutes, 1 hour, 3 hours, tomorrow at 09:00, or a custom time like 14:30 or +2h.
- Scheduled prompts show their time in the queued prompts list and don't hold up normal queued prompts; a paused queue doesn't hold them either.
- If a scheduled prompt fails, it turns into a normal paused queued prompt you can edit, resume, or cancel.
- Prompts due while oc was closed send when it starts again.

---

## 2026-10-15 (~19:20) - v0.2.209 seriouslyInbred - Return to parent when a subagent finishes - Opus 5.5 (grok-4.6-medium subagent), low; Implementation

### Agent
- Meta: Opus 5.5; low; Implementation via `general-grok-4.6-medium`; completed
- Version: 0.2.209 seriouslyInbred
- Added `subagent_tabs.return_to_parent` (default true) in `packages/tui/src/config/index.tsx`; persist key in `ocSettings.ts`.
- Added edge effect in `routes/session/index.tsx`: on `sync.data.session_status[route.sessionID].type` non-idle -> idle for the same route, navigate to `parentID`. Skips: setting off, first status (hydration), sibling switch, open dialog, and `args.sessionID === route` (tab process launched via `attach --session <child>`).
- Changed `/subagentTabs` dialog: title "Subagents", third row toggles the new setting; boolean rows negate generically.
- Updated `test/config.test.tsx` expectations.
- Verification: `bun test test/config.test.tsx` 18 pass 0 fail; `tsgo --noEmit` exit 0 (both run by subagent). Live TUI behavior unchecked.
- TODO: wiki page and `FORK.md` entry not updated.

### User
Subagents
- When a subagent you are watching finishes, oc now jumps back to the parent session on its own.
- Opening an already-finished subagent, switching between subagents, or a subagent in its own terminal tab does not jump.
- Turn it off with "Return to parent when done" in `/subagentTabs` (now titled "Subagents").

---

## 2026-10-15 (~19:15) - v0.2.208 smhBombas - Favorite model categories - GPT-6.1 Sol; Implementation

### Agent
- Meta: GPT-6.1 Sol; /imp; Implementation; completed
- Version: 0.2.208 smhBombas
- Added optional named subcategories inside Favorites in `tui/src/component/dialog-model.tsx`; Category footer action (`Ctrl+G`) assigns, creates, and opens management for rename, reorder, and deletion. Uncategorized favorites lead; empty categories remain in picker only.
- Added `favoriteCategories` and optional favorite `category` persistence in `context/local.tsx`; old lists load uncategorized, invalid assignments clear, deleting categories preserves favorites, hiding/unfavoriting clears assignment. Model movement stays within category; cycling keeps underlying favorite-list order and passes model identity only.
- Added nested heading rendering, indentation, row counting, and scroll targeting in `ui/dialog-select.tsx`; restored highlighted favorite after category drill-ins without changing selected model. Updated keybind definitions/docs, `FORK.md`, and sibling wiki Configuration/Keybinds pages.
- Verification: parent reran `bun test test/context/local.test.ts` from `src/packages/tui`: 18 pass, 0 fail, 101 assertions. Covers legacy loading, saved assignments, rename/reorder/delete, cleanup, cycling, nested headings, picker creation/navigation, and search. Build, broader checks, installed mouse interaction, and restart acceptance not run; user-owned.

### User
Favorite model categories
- In `/models`, highlight a favorite and choose Category in the footer or press Ctrl+G to assign or create a named category inside Favorites.
- Manage categories from the same picker to rename, reorder, or delete them; deleting a category keeps its models favorited.
- Categories and assignments are saved, and model move actions reorder within the current category.

---

## 2026-10-15 (~18:51) - v0.2.207 feversJarrito - Separate harness update commands - GPT-6.1 Sol; Implementation

### Agent
- Meta: GPT-6.1 Sol; /imp follow-up; Implementation; completed
- Version: 0.2.207 feversJarrito
- Changed updater array group in `tui/src/ocCommands.tsx` to `Third party harness updates`; existing `Third party harness management` retains Claude warm-up, account switching, and auto-resume.
- Updated `../oc.wiki/Claude-Code.md` updater location. Kept this session's existing revision bump.
- Verification: reviewed one-line source diff and traced `CommandPaletteDialog` group-to-heading mapping; `git diff --check` passed. No tests added for a heading-only change; live palette check remains user-driven after rebuild.

### User
oc Palette
- Update all and individual harness update commands now have their own Third party harness updates heading, separate from the other harness settings.

---

## 2026-10-15 (~18:49) - v0.2.207 feversJarrito - Single-row auto-resume toggle - GPT-6.1 Sol; Implementation

### Agent
- Meta: GPT-6.1 Sol; /imp follow-up; Implementation; completed
- Version: 0.2.207 feversJarrito
- Replaced separate on/off rows in `tui/src/claudeCommands.tsx` with `Auto-resume: on/off`; selecting writes the opposite server state and refreshes the open dialog. Removed redundant setter and inline description.
- Updated `../oc.wiki/Claude-Code.md`. Kept this session's existing revision bump.
- Verification: `git diff --check` passed; traced existing `update` path through save, refresh, and error toast. No new tests for this small presentation change; live toggle check remains user-driven after rebuild.

### User
Claude auto-resume
- On and off now share one row: select Auto-resume to switch it on or off while keeping the dialog open.

---

## 2026-10-15 (~18:46) - v0.2.207 feversJarrito - Claude auto-resume clock preference - GPT-6.1 Sol; Implementation

### Agent
- Meta: GPT-6.1 Sol; /imp; Implementation; completed
- Version: 0.2.207 feversJarrito
- Added `claudeCommands.tsx` Time format toggle using existing saved KV key `claude_resume_clock`, default `24h`; available while auto-resume is off. Reactive options update title and scheduled list without reopening the dialog.
- Changed `util/format.ts` `formatResumeAt` to accept `24h` or `12h`; wired prompt footer to the same reactive preference. Kept local timezone and scheduler deadlines unchanged; warm-up clock remains independent.
- Updated `../oc.wiki/Claude-Code.md` activation instructions; preserved existing uncommitted wiki edits.
- Verification: `bun test test/util/format.test.ts` from `src/packages/tui`: 10 pass, 0 fail, 42 assertions, including midnight, noon, afternoon, and switching back. Reviewed diff. Build, typecheck, live dialog rendering, and restart persistence not run; user checks toggle/footer and restart after their build/install.

### User
Claude auto-resume
- Open Claude auto-resume in the oc Palette and select Time format to switch between 12-hour and 24-hour clocks for the resume footer and scheduled list.
- The choice is saved across restarts, defaults to 24-hour time, and can be changed while auto-resume is off.

---

## 2026-10-15 (~18:31) - v0.2.206 bindNew - Pre-push review; warm-up test accepts the CLI's safeguards field; Claude pool default dir - Claude Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Claude Opus 5.5; low reasoning; /spit pre-push review then /imp; completed
- Version: 0.2.206 bindNew
- Checked today's 7 entries vs worktree: all new split files imported (`.js` specifiers), no imports of moved/deleted paths, no B1 traces or `paneDiag` left, `push.ps1` stages with `add -A`, `bun.lock`/`package.json` dirty with no content diff. User chose to keep `aquaMasturbator`; this session's required bump rolled `bindNew` anyway.
- Fixed `warmupFakeModel.test.ts` failure (logged ERROR in the 18:12 entry): Claude Code 2.1.300 adds `safeguards: [{ type: "dangerous_tool_use", classifier_context }]` (server-side tool-use classifier, gated on a beta; found in `claude.exe`). CLI-owned, warm-up args cannot disable it. Added `OPTIONAL_REQUEST_KEYS`; any other unknown key still fails; `safeguards` entries must be `dangerous_tool_use`; its JSON joins the leak check.
- Fixed `claude-code/accounts.ts` `poolAccountIds`: `~/.claude` always mapped to `default`, but `default` spawns with the inherited env (`poolConfigDir` undefined), so with `CLAUDE_CONFIG_DIR` set elsewhere a configured `~/.claude` collapsed into the inherited account and was never used. Default dir is now `CLAUDE_CONFIG_DIR || ~/.claude`, matching `canonicalAccountId`, `seedCachePath`, `warmup/identity.ts`.
- Fixed `accountPool.test.ts`: both pool-id tests pin `CLAUDE_CONFIG_DIR` via `withConfigDir` (first failed whenever the shell had it set); the inherited case now expects `~/.claude` as its own account.
- Verification: `warmupFakeModel.test.ts` 3 pass / 0 fail (CLAUDE*/ANTHROPIC* vars removed). `accountPool.test.ts` + `warmup.test.ts` 60 pass / 0 fail, run with `CLAUDE_CONFIG_DIR` unset and set to `~/.claudeSecond`. Typecheck not run.

### User
Checks
- The Claude warm-up check passes again after the Claude CLI update started sending an extra safety field; any other new field still fails it.

Claude accounts
- If `CLAUDE_CONFIG_DIR` is set when oc starts, that folder is the default account, and a `~/.claude` entry in your accounts list now counts as a separate account instead of silently merging into it.

---

## 2026-10-15 (~18:12) - v0.2.205 aquaMasturbator - Fix modularize bugs B1-B5: sidebar text-buffer leak, Cursor Windows shell, user message schema - Claude Opus 5.5, low reasoning; Debug

### Agent
- Meta: Claude Opus 5.5; low reasoning; Debug (handoff `~/.config/opencode/plans/modularize/bugsHandoff.md`, order B3, B5, B1, B2, B4); completed
- Version: 0.2.205 aquaMasturbator
- Fixed B3 `session/prompt.ts` user `info`: wrote `permission: undefined` on ordinary turns; `schema/src/schema.ts` `optional()` is `optionalKey` on the encoded side (key may be absent, never `undefined`), so every message logged `invalid user message before save`. Now spread only when `turnPermission` is set, like `toolHost`. Added `prompt.test.ts` log-capture test (old line fails it with `Expected PermissionRuleset, got undefined at ["permission"]`).
- Fixed B5 `cursor/shellTimeout.ts` `prepareCursorShellArgs`: Cursor sends `timeout_behavior` BACKGROUND (2) on every timed shell call (real DB: refused calls had `timeout` 30000/60000, the call that ran had none), so the model was never asking for background. User chose: on Windows a soft-timeout call with `timeoutMs > 0` runs in the foreground with `args.timeout = timeoutMs` (killed and reported as timeout past it); `background_shell_spawn` and zero-window handoffs still refused. Note: Cursor's shell tool is server-built-in, not in `protocol/descriptors.ts`, so the handoff's descriptor idea did not apply.
- Fixed B1 + B2 (one cause) `tui/feature-plugins/sidebar/plugins.tsx`: root `<Show>` gated on async `plugin.status()` resource. OpenTUI 0.5.14 `Slot.renderEntry` runs the slot renderer inside a tracked memo and checks `hasInitialOutput`; the output flipping empty -> rows on each load re-ran the renderer -> new `View` -> pending again, ~1,700 remounts/s whenever a session sidebar is visible. Each cycle leaked never-inserted text renderables (OpenTUI destroys only on remove): creates 11,108 vs destroys 401 within 4 s, then `Failed to create TextBuffer` when the native handle table (16-bit index, 65,535 slots) filled; root ErrorBoundary disposed the app (fallback also needs text buffers), so the TUI froze on `esc interrupt` and later clicks did nothing. Fix: always-rendered root `<box>` with the `Show` inside.
- Note: server side was fine: traces showed `runLoop` exit -> Flock release -> `SessionWork` exit -> `finishRun` -> `onIdle` -> `status.set idle` in ~30 ms; acks were 0. The `aborted=true` flag on the TUI SDK provider's `handleEvent` was the tell. `BUN_JSC_useFTLJIT=0` did not help (ruled out the Bun FFI JIT theory).
- Removed pane test `paneDiag.txt` debug writes and the diag-only sleep loop (`tuiPane.test.ts` steering test).
- Kept B4 as not reproduced: `automatic rename` pane test 5 of 5 after the B1 fix; likely the same freeze, not proven.
- Removed all temporary B1 traces (`src/b1trace.ts`, runner/run-state/status/turnStream/prompt/worker, tui sdk/sync/app); `runner.ts`, `run-state.ts`, `status.ts` restored from HEAD (only my blank-line slip was in them).
- MISTAKE: removing `\nimport { b1 } ...` with Edit joined two import lines in `prompt.ts` and `turnStream.ts` (and dropped a blank line in three files). Caught by `git diff`, fixed. Prevention: when removing an inserted line, match the whole line plus its own trailing newline, then diff each touched file against HEAD.
- ERROR: `warmupFakeModel.test.ts` `one minimal greeting per account` fails: installed `claude` CLI now sends a new `safeguards` request key not in `ALLOWED_REQUEST_KEYS`. External CLI change, not fixed.
- ERROR: `accountPool.test.ts` `pool ids: the default dir inherits the environment` fails only when run from a Claude Code session (inherited `CLAUDE_CONFIG_DIR`); passes 19/19 with `CLAUDE*` vars removed.
- Verification: opencode + tui `tsgo --noEmit` ok; `prompt.test.ts` 56 pass / 14 skip / 0 fail; `test/provider/cursor` 117 pass / 0 fail; steering pane test 3 consecutive passes (incl. `Revert whole turn` + `2 message reverted`); automatic rename pane test 5/5; `test/provider/claude-code` 684 tests, 3 fail (steering flake passes alone 13/13; the two ERRORs above). Live (user-approved): one `composer-2.5-fast` turn ran `git log --oneline -1` first try with `timeout` 30000; session `cursor live check B5` is in the real DB.

### User
Chat window
- Fixed the chat freezing on "esc interrupt" after a Claude turn: the sidebar's plugin list kept rebuilding itself in the background and eventually crashed the screen, which also blocked "Revert whole turn" and other clicks.

Cursor
- On Windows, Cursor models now run shell commands on the first try instead of being refused twice; a command that runs past Cursor's time limit is stopped and reported as timed out.

Logs
- Sending a message no longer writes a harmless "invalid user message before save" error to the log.

---

## 2026-10-15 (~16:00) - v0.2.204 tonesPixar - Modularize crosscheck and sidecar fixes - Claude Opus 5.5, low reasoning; Build

### Agent
- Meta: Claude Opus 5.5; low reasoning; Build (/spit crosscheck then /imp of its sidecar); completed
- Version: 0.2.204 tonesPixar (same session; no second bump)
- Crosschecked modularize plan vs HEAD (`~/.config/opencode/plans/modularize/crosscheck.md`): 0 exports lost, moves are pure (only wiring added), no new duplicates or import cycles, no mixed EOL, docs clean except one path.
- Removed `Generate*` re-export shim from `session/prompt.ts` (my 15:08 change broke the plan's no-barrel rule); `httpapi/groups/session.ts` imports `GenerateInput`/`GenerateResult` from `session/sideQuestion`.
- Moved `createClaudeAccountCommands` from `claudeWarmup.tsx` (restored to HEAD) to new `tui/src/claudeCommands.tsx`; `app.tsx` spreads `claudeAccountCommands()` right after `claudeWarmup.commands()`, same palette order. Removed unused `DialogSelect` import in `app.tsx`. Updated `oc-palette-entry` skill.
- Removed duplicate `shellQuote`/`deleteShellCommand` in cursor `protocol/toolCallBridge.ts` (imports `deleteShellCommand` from `execParse.ts`); `sidebarTools.tsx` imports `MAX_TREE_ITEMS` from `scripts.ts`. Fixed stale helpers path in `docs/dev/publicReadiness.md`.
- Kept: cursor protocol `str` name clash (`values.ts` returns undefined, 4 local copies return ""), pre-existing unused `isActiveConversationBinding` import in `languageModel.ts`, `os` in upstream `routes/session/index.tsx`.
- MISTAKE: slicing `claudeWarmup.tsx` "from marker to end of file" also took the private helpers after the block; caught by diffing against HEAD before typecheck. Slice by the block's own closing line, then diff vs HEAD.
- Verification: tui + opencode `tsgo --noEmit` ok; tui `claudeWarmup`, `sidebarRows`, `openSidebar` 96 pass / 2 skip; opencode `httpapiGenerate` + `test/provider/cursor` 122 pass / 0 fail.

### User
Internal cleanup
- No intended behavior change: a check of the whole modularization found nothing missing; a few leftovers were tidied, and the Claude account and auto-resume palette entries now have their own file.

---

## 2026-10-15 (~15:08) - v0.2.204 tonesPixar - Plan leftovers: Claude palette entries, /btw, sidebar helpers split - Claude Opus 5.5, low reasoning; Build

### Agent
- Meta: Claude Opus 5.5; low reasoning; Build (modularize plan leftovers C4/C9 remainder + helpers review, user-approved); completed
- Version: 0.2.204 tonesPixar (same session; no second bump)
- Moved `claude.account`, `claude.sessionAccount`, `claude.autoResume` palette entries out of `tui/src/app.tsx` into `claudeWarmup.tsx` (`createClaudeAccountCommands`, called from `createClaudeWarmupCommands`; `commands()` memo now returns warm-up entries then these). Moved the `resumeEnabled` signal and its `sdk.resume.state()` onMount fetch with them. Same order, same visibility rules (2+ accounts; session entry only on a session route).
- Moved /btw `generate`, `revertedHistory`, `GENERATE_TIMEOUT`, `SIDE_QUESTION_INSTRUCTION`, `GenerateInput`/`GenerateResult` and the 4 `Generate*Error` classes from `session/prompt.ts` into new `session/sideQuestion.ts` (`makeSideQuestion` factory, like `titleGen.ts`). Schemas/errors moved too (avoids a runtime cycle) and are re-exported from `prompt.ts`, so `SessionPrompt.Generate*` still works. Built after `currentModel` (TDZ: `const` is defined later in the layer). Removed now-unused `LLMEvent`, `CURSOR_PROVIDER_ID` imports from `prompt.ts`.
- Split `routes/session/sidebar-tools/helpers.ts` (968 lines, deleted) into `settings.ts` (types, defaults, normalize, load/save, `parseLauncher`, `updateLanguage`; `readJsonFile`/`writeJsonObject` now exported), `cursorToken.ts`, `roots.ts` (root paths, `rootSections`, `displayPath`, Everything search), `scripts.ts` (script discovery, `readTree`, `clipEnd`, reconcile). No logic changes. Updated 5 src importers + `sidebarRows.test.tsx`, `openSidebar.test.ts`.
- Updated `.opencode/skills/oc-palette-entry/SKILL.md`: Claude entries live in `claudeWarmup.tsx`.
- TODO (future, not planned): cursor `languageModel.ts` `startSession` (~459 lines) is still one function; same risk class as `pump`. Split only when it gets in the way.
- Kept stale `helpers.ts` links in `docs/dev/v0.3.0.md` (historical doc, line numbers already stale).
- Verification: tui + opencode `tsgo --noEmit` ok; `sidebarRows.test.tsx`, `openSidebar.test.ts`, `claudeWarmup.test.ts` 96 pass, 2 skip, 0 fail. /btw and Claude palette entries not live-checked.

### User
Internal cleanup
- No intended behavior change: the Claude account and auto-resume palette entries, the `/btw` side question, and the sidebar's settings, scripts, file roots, and Cursor token code each moved into their own files.

---

## 2026-10-15 (~14:55) - v0.2.204 tonesPixar - Cursor pump split into a CursorPump class (C7 pump) - Claude Opus 5.5, low reasoning; Build

### Agent
- Meta: Claude Opus 5.5; low reasoning; Build (modularize plan C7 `pump` sub-chunk, user-approved); completed
- Version: 0.2.204 tonesPixar (same session; no second bump)
- Moved `pump` (1230-line closure) from cursor `languageModel.ts` into new `cursor/pump.ts` `CursorPump`: span/stream/replay state as fields, `safeEnqueue`/`safeError`/`closeOpenSpans`/`emitText`/`emitReasoning`/`emitFinish`/`failRunProtocol` as methods, `run()` keeps the frame read/decode loop, dispatch split into `storeCheckpoint`, `onTurnEnded`, `onToolCallStarted`, `onToolCallCompleted`, `onExec`, `onInteractionQuery`, `onKv` (true = pump stops; `return` -> `return true`, `continue` -> `return false`). `pump()` kept as a wrapper export for `pumpWithRecovery`.
- Moved with it: `nextFrameWithSemanticDeadline`, `responseRequiredChannel`, `RUN_*` codes, `normalizeCheckpointBytes`, `cursorTurnEndedProviderMetadata`, `spanEndParts`; `rethrowTransportWriteFailure` is a module function.
- Added `cursor/execRecovery.ts`: `rejectExec`, `recoverCorrelatedEditRead`, `rejectMissingReadTarget` take the pump (type-only import back, no runtime cycle).
- `languageModel.ts` 2355 -> 922 lines. Built from exact line ranges plus a word-boundary `this.` rewrite; fixed by hand: `controller` uses, one trace string and one comment the rewrite touched, `failRunProtocol`'s `session`, the `spanEndParts` shorthand call.
- Verification: opencode typecheck ok; `test/provider/cursor` + `cursor.test.ts` 116 pass. Only one test drives `pumpWithRecovery`, so ran a live `composer-2.5-fast` turn via `opencode run` from source (user-approved earlier): missing-file read answered on Cursor's channel, edit via the correlated read, shell, `CURSOR-PUMP-DONE`. One more `cursor live check pump` session is in the real DB.
- ERROR: logged B5 in the plan: composer requests a soft-timeout shell first and is refused twice per turn (intended refusal, wasted calls).

### User
Cursor
- No intended behavior change: the code that reads Cursor's replies is split into smaller, named pieces; a live Cursor chat (missing file, edit, shell) worked the same after the change.

---

## 2026-10-15 (~14:36) - v0.2.204 tonesPixar - Lift fork blocks out of three upstream files (C9) - Claude Opus 5.5, low reasoning; Build

### Agent
- Meta: Claude Opus 5.5; low reasoning; Build (modularize plan C9); completed
- Version: 0.2.204 tonesPixar (same session; no second bump)
- Moved fork title code out of `session/prompt.ts` into new `session/titleGen.ts` (`makeTitles` factory over `sessions`, `agents`, `provider`, `llm`, `work`, `scope`): `title`, `rename`, `startTitle`, `decodeAutoRename`, `RENAME_FALLBACKS`, `TitleInput`, `isRealUserMessage`, `titleConversation`, `cleanTitle`, `renameDigest`, `namingText`, `withoutCommandHeader`. `prompt.ts` keeps `titles.startTitle(...)` and `titles.rename(...)`. `renameDigest.test.ts` imports from `titleGen`. Kept `revertedHistory` (used by /btw `generate`).
- Moved tui session route's Auto-rename and complete/failed/in-progress palette entries into new `routes/session/ocSessionCommands.ts` (`createOcSessionCommands(session)`), spread in `sessionCommandList` at the same position, so titles still track `session()`.
- Moved resume, queue and Claude-account handlers plus the scheduled-resume poll loop from `handlers/session.ts` into new `handlers/sessionOc.ts` (`makeOcSessionHandlers`), yielded at the same point; removed 13 fork-only imports (none were in upstream `abce98e`).
- Fork diff vs upstream baseline: prompt.ts 1016 -> 816 changed lines, session route 723 -> 639, session handlers 274 -> 167.
- Verification: typecheck opencode + tui ok; title/rename/prompt tests 94 pass, 14 skip; tui marker/config 19 pass; handler/queue/resume 49 pass; pane tests automatic rename + sidebar/palette 2 pass.

### User
Code structure
- No intended behavior change: oc's own session-title, auto-rename, session-mark and queue/resume code moved out of files shared with upstream OpenCode, which makes future upstream updates easier to merge.

---

## 2026-10-15 (~14:24) - v0.2.204 tonesPixar - Live checks after the modularize split; pane test fixes - Claude Opus 5.5, low reasoning; Debug

### Agent
- Meta: Claude Opus 5.5; low reasoning; Debug (live verification of C0-C8 after the user's /revive); completed, steering stall left open
- Version: 0.2.204 tonesPixar (same session as the C0-C8 entry; no second bump)
- Checked live: revive.log 17:36 run had every step done (C3 `reviveHost`/`wezterm`); one resident `oc serve` on 4096 with both revived tabs attached (C3 `resident`).
- Checked C4 palette statically: name/title/category/group/slashName sequence of HEAD `app.tsx` equals current `app.tsx` with `ocCommands` runs expanded (268 fields); revive entries identical, same call site and context.
- Added pane test `sidebar and oc palette entries open their menus` (`tuiPane.test.ts`): clicks `files [work]` (C5 rootPicker), `scripts` (C5 scriptSettingsMenu), `Usage:` -> Usage calendar (C1/C5), then oc palette `Home sort order` under Layout (C4). Sidebar commands are keymap-layer commands, not palette entries (ctrl+o/ctrl+p find nothing), so the test clicks.
- Fixed stale pane tests (failed identically at HEAD in a temp worktree): `/contextLimit` now opens `Context limit scope` first (Enter on All providers); warm-up dialog's `Time format` row is the first selectable and the redraw after a mode toggle resets selection to it (one more Down for Times and the mode row, 8 Downs to Sunday).
- Cursor live (user-approved, real usage, `opencode run` from source in a scratch repo): `gpt-5.4-mini` hit `resource_exhausted` x3 (C7 `retry.ts` retried); `composer-2.5-fast` read, edited, ran `git diff --stat`, replied. Two sessions titled `cursor live check` are now in the real DB.
- ERROR: steering pane test is intermittent at HEAD too (HEAD passed the DONE step 1 of 2 runs; C8 0 of 3, HEAD with logging also stalled). Provider closes the turn (`conversation result`, `auto-continuation stopped`) and oc logs `exiting loop`, yet TUI stays busy; runner idle only follows `owned` Flock release + `SessionWork` boundary. Not traced further. Separate known failure after it: `Revert whole turn` never appears on the second click (seen 2026-10-14). The test still writes debug screens to `%TEMP%\opencode\paneDiag.txt` (pre-existing).
- ERROR: every user message logs `invalid user message before save` (`SchemaError: Expected PermissionRuleset ... ["permission"]`, `session/prompt.ts` ~1349; log only, save continues). 700+ hits since 2026-10-12, pre-existing.
- Kept: Cursor `soft-timeout (background-on-timeout)` shell refusal on Windows (`shellTimeout.ts`, since v0.2.162) is intended; the model retried in the foreground.
- Verification: pane suite before fixes 9 pass / 4 fail; after: new sidebar test 1 pass, contextLimit + warm-up 2 pass, automatic rename passed on rerun (flaky once). Steering still fails. Rename + steering compared with HEAD `turnStream.ts` swapped in and restored (diff confirmed).
- Removed: temp worktree `C:\ocTestTmp\ocHead`, scratch log dirs, scratch Cursor repo.

### User
Checks
- After your revive: oc rebuilt, reinstalled and reopened your tabs on a single shared server, and the palette, sidebar menus, usage calendar and a real Cursor chat (read, edit, shell) all work.
- Two pane tests that were already out of date were updated, and a new one opens the files, scripts and usage menus.
- Still open: the steering pane test sometimes leaves the chat showing busy after Claude finishes (it does this before today's changes too), and every sent message logs a harmless "invalid user message" error.

---

## 2026-10-15 (~13:27) - v0.2.204 tonesPixar - Modularize large fork files (C0-C8) - Claude Opus 5.5, low reasoning; Build

### Agent
- Meta: Claude Opus 5.5; low reasoning; Build (plan `~/.config/opencode/plans/modularize/plan.md`, chunks C0-C8); completed except C7 `pump` (deferred by user) and optional C9
- Version: 0.2.204 tonesPixar
- Rule: moves built from exact line ranges, no logic edits, no barrels or shims; importers (incl. tests) updated; old exports kept.
- C0: `asRecord` added to `util/record.ts`; removed 4 fork `isRecord` + 5 cursor `asRecord` copies (incl. claude-code `cliEvents.ts`, `index.ts`).
- C1: tui `sidebar-tools/usage.ts` -> `usage/` (providers, snapshot, fetch, format, calendar, claude, cursor, probes, live, refresh).
- C2: `claude-code/warmup.ts` -> `warmup/index.ts` + `schedule.ts`, `store.ts`, `identity.ts`, `cli.ts`, `inventory.ts`; dropped `ClaudeWarmup` self-namespace; `handlers/global.ts` uses named imports.
- C3: `config/oc.ts` 1171 -> 98; new `resident.ts` (`Resident`), `reviveHost.ts` (`ReviveHost`), `wezterm.ts`. Callers `cli/cmd/oc.ts`, `serve.ts`, 4 tests, CONTRIBUTING.
- C4: tui `app.tsx` 2772 -> ~1590; new `ocSettings.ts`, `crow.ts`, `harnessUpdate.ts`, `reviveCommands.tsx`, `ocCommands.tsx` (three runs spread at original positions, palette order unchanged). Updated `oc-palette-entry` skill.
- C5: `sidebarTools.tsx` 2373 -> 1005; new `sidebarUsage.tsx`, `rootPicker.tsx`, `scriptSettingsMenu.tsx`. Kept `sidebarCommands` inline. KV keys unchanged.
- C6: cursor `protocol/tools.ts` removed -> `descriptors.ts`, `subagents.ts`, `execParse.ts`, `editRemap.ts`, `readResult.ts`, `execResult.ts`, `values.ts`.
- C7 (easy moves): cursor `languageModel.ts` 3461 -> ~2350; new `retry.ts`, `turnState.ts`, `continuation.ts`, `prompt.ts`, `streamWrite.ts`; `estimateTokens` into `usage.ts`; removed 31 imports only the moved code used. TODO: `pump` -> `CursorPump` class, needs approval.
- C8: `claude-code/turnStream.ts` 2015 -> 1796; new `streamWriter.ts` (`StreamWriter`), `todoMirror.ts` (`TodoMirror`, `isTodoMirror`), `steering.ts` (`Steering` + `SteeringHost`; gates kept: admit/flush also stop on pending switch, retract does not). Kept account switch + proxy calls in `ClaudeTurn` (drive child, listeners, watchdogs). `toolMapping.ts` comment pointer updated.
- Verification: typecheck opencode + tui ok after each chunk. Tests per chunk all 0 fail: C0 171+16, C1 123, C2 58, C3 77, C4 16, C5 128 (2 skip), C6/C7 116 (cursor), C8 claude-code dir 667 pass / 16 skip.
- Risk: no test renders `SidebarTools`; resident/revive and palette need live checks.

### User
Code structure
- No intended behavior change: large files were split into smaller ones by topic.
- Please live-check after the next build: `oc`/`occ` reuse the resident server, `/revive` closes old panes, the oc palette section looks the same, the sidebar Usage/files/scripts menus work, and Claude and Cursor chats (including messages sent mid-turn and todo panel updates) behave as before.

---

## 2026-10-15 (~10:01) - v0.2.203 sculpturesTagging - Pass: usage calendar updates live - Claude Opus 5.5, low reasoning; Pass

### Agent
- Meta: Claude Opus 5.5; low reasoning; Pass (scoped to this session's calendar + menu order work); completed
- Version: 0.2.203 sculpturesTagging (same session; no second bump)
- Fixed `selectUsageCalendar` (`sidebarTools.tsx`): rows and strip were computed before `dialog.replace`, so readings arriving after its `usageScheduler.request()` never showed. Split into `usageCalendarItems`/`usageCalendarOptions`, read inside the dialog JSX like `usageMenuOptions`; added `preserveSelection`. Selectable rows (Add, subscriptions) lead, so index-based values stay stable when agenda rows change.
- Reviewed, no change: `usage.ts` calendar helpers (sorting, renew clamp, ended window, DST rounding), `helpers.ts` settings, menu reorder.
- Verification: `tsc --noEmit -p .` in tui exit 0; `usageCalendar.test.ts` 6 pass. Not live-checked.

### User
Sidebar usage
- The usage calendar now fills in and updates while open when fresh usage readings arrive, instead of showing whatever was loaded when you opened it.

---

## 2026-10-15 (~09:52) - v0.2.203 sculpturesTagging - Usage menu actions first - Claude Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Claude Opus 5.5; low reasoning; Implementation; completed
- Version: 0.2.203 sculpturesTagging (same session as the calendar entry below; no second bump)
- Changed `usageMenuOptions` (`sidebarTools.tsx`): Calendar and Settings rows now precede provider rows. `DialogSelect` groups by first appearance (remeda `groupBy` + `entries`), so row order sets group order.
- Changed `selectUsageCalendar`: "Subscription dates" group (Add row, then entries) now precedes the agenda.
- Verification: `tsc --noEmit -p .` in tui exit 0. Not live-checked.

### User
Sidebar usage
- The Usage menu now opens with the calendar and settings toggles on top, above the provider readings.
- In the usage calendar, adding or removing subscription dates is at the top instead of below every reset.

---

## 2026-10-15 (~09:22) - v0.2.203 sculpturesTagging - usage calendar submenu - Claude Opus 5.5, low reasoning; Implementation

### Agent
- Meta: Claude Opus 5.5; low reasoning; Implementation (/spit then /imp, no subagents); completed
- Version: 0.2.203 sculpturesTagging
- Added in `sidebar-tools/usage.ts`: `UsageSubscription` (`{label} & ({renewDay 1..31} | {endsOn YYYY-MM-DD})`), `parseUsageDate`, `normalizeUsageSubscriptions`, `nextRenewal` (local midnight, clamps short months, today counts), `usageCalendarEvents` (next known reset per window for enabled providers: Codex both windows, Cursor `billingCycleEnd` as "billing cycle renews", Go weekly/monthly, Claude per pooled account via `projectClaudeUsage`; OpenRouter none; subscription events `allDay`; ended `endsOn` kept 7 days past end day), `usageCalendarDay` (Ended/Today/Tomorrow/`Sat, Oct 17`[ year]), `usageCalendarStrip` (7-day counts).
- Added `usageSubscriptions` to `SidebarSettings` (`helpers.ts`), user-level `saveUserUsageSubscriptions`; stripped from project file in `saveProjectSettings` like usageProviders.
- Added in `sidebarTools.tsx`: `selectUsageCalendar` (DialogSelect, strip in `filterFooter`, back -> Usage menu), "Calendar: Usage calendar" row in Usage menu, palette `sidebar.usage-calendar` "Show usage calendar", add flow = two `DialogPrompt`s (label, then day or date), select entry removes it.
- Kept deviation from plan: subscriptions are free-text labels, not tied to provider/account ids (simpler; user names them). Strip not hidden on narrow terminals (fits 52-col dialog inner width).
- Updated wiki `Sidebar.md`: Usage calendar section + `usageSubscriptions` settings row (push is user's).
- Moved previous 1122-line notes verbatim to `buildNotes.archive10.md` (hash verified); summary now covers archive9 (never summarized by the v0.2.173 rotation) and archive10.
- MISTAKE: inserted this entry before checking the 1000-line limit; removed it (file byte-identical, `git diff` empty), then rotated. Count lines before inserting.
- Verification: new `test/cli/tui/usageCalendar.test.ts` 6 pass; `tsc --noEmit -p .` in tui reported no errors. TUI not live-checked; no pane test.

### User
Sidebar usage
- The Usage menu has a new Usage calendar that lists upcoming resets for every provider and Claude account, grouped by day, with a 7-day count strip on top.
- You can add subscription dates by name, either a monthly renewal day or an end date, and remove them by selecting them.

---
