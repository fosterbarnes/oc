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

Budget (AGENTS.md "Build notes"): at most 80 lines and 12 KB. Current invariants, open risks, and live rules only.

## Agent
- Archives 1-18 hold the full history verbatim; never edit them. Old 60 KB summary: `git show 661a21b463:docs/buildNotes/buildNotes.md`. archive17 covers v0.2.345-v0.2.371; archive18 runs through v0.2.407.
- Rules already in `AGENTS.md`, `docs/dev/*.md`, `FORK.md`, `SCOPE.md`, or `principles.md` are not repeated here. Read those first.
- Upstream: port by hand per `UPSTREAM-SYNC.md`, no unrelated-history merge. Synced through OpenCode v1.19.3 (v0.2.271). Vendor patches in `src/patches` (`@opentui/core@0.5.14`, `opentui-spinner@0.0.7`) need a refresh on upgrade.
- Process safety: stop only processes with proven creation-time identity (CIM on Windows, libproc on macOS). Never PID-only or whole-tree kills; unknown ownership leaves the process alive.
- Bun 1.4.2: `spawn(..., { detached: true })` of pwsh exits 0 without running (use the Start-Process launcher; the hidden pwsh hop keeps the resident alive). Two concurrent `fs.rename` of one source both fulfil: use exclusive `wx` create as a lock.
- `Bun.file(...).exists()` caches per object: use a fresh `BunFile` for changing state.
- Claude tools: restricted command turns use oc proxies, ordinary turns keep native tools; closed turns build `--tools` only from `CLAUDE_NATIVE_TOOLS`. `proxyTools` lists must include `run_after_turn`, `time`, `schedule`. Worktree, cron, wakeup stay off.
- Claude prompt cache: keep the live clock out of the system prompt (the `time` tool serves it).
- Claude accounts: pool persists in `account-pool.json`; failover only on error results, ranked by most 5-hour usage left. An account switch retires the CLI conversation and catches up with a bounded `resumeBlock`, never a full history paste. API credit rollover only when every login is limited.
- Claude on macOS: the CLI keys its Keychain login on whether `CLAUDE_CONFIG_DIR` is set; the default account keeps the inherited env (`warmupEnv`, same rule as `accountManage.ts` `runAuth`). Warm-up cap 24 times per day.
- Claude steering: `--replay-user-messages`; a message's settings compare by difference; an unmergeable message ends the turn after the current tool (`maybePreempt`); `isWakeTurn` checks only the newest message. Non-Claude loops read QUEUED edits through `session/intake.ts`.
- Claude Code 2.1.309+ sends a tool-less naming request on a chat's first turn: match fake-model scenario requests by tools.
- Notices stay provider-neutral in `tui/src/feature-plugins/system/notifications.ts`. Claude `logger.ts` warn/error go to `opencode.log` (`channel=claude-code`), not toasts. Toasts sit right above the prompt.
- Commands, skills, and agent markdown hot reload by fingerprint with per-file last-good. Keep the Command -> Skill lock direction; commands win name collisions.
- Palette entries go in category `oc`; `Session` entries are hidden from the oc palette. Check namespace and palette filters before calling an entry reachable. Push behavior comes from a command frontmatter flag, never the `agent-push` name.
- Slash commands: pasted, quoted, or fenced text never runs commands (`typedSlashCommands`). The newest command stays active (`session/activeCommand.ts`); 2+ commands queue as ordered steps (`split`, `whenBlank`).
- A command switch needs the user's Switch in the `mode_switch` form (`suggest: true` targets). Revive commands may sit inside a chain.
- Queue and schedule: `session_queue` (`run_at`, `target`, `message_id`) with durable claims in `scheduledDelivery.ts`; `alt+return` only queues.
- Queue adds are one-transaction batches (`SessionQueue.add(sessionID, inputs)`, HTTP `batch`) through one TUI `queueSends` chain; a blank-step question closes when its entry changes.
- Session metadata is public API: no internal keys there; provider state goes in provider storage.
- TUI: a plugin sidebar root `<box>` must always render (an async `<Show>` root leaked OpenTUI buffers until the chat froze). Bootstrap uses the provider summary (`Provider.SummaryResult`), not the full provider list.
- TUI: opentui marks every mouseup on selectable text as dragging; read its event flow before trusting event flags. Shared `DialogSelect` timing changes need `local.test.ts`, `subagentDialog`, and `commandPalette` runs.
- Keybinds: a new `keybind.ts` Definition needs a `packages/tui/script/keybindDocs.ts` regen; `prePush.ps1` checks it. macOS app shortcuts move to cmd (`TuiKeybindPreset.mac`).
- Security kept: `/update` checks SHA-256 and refuses a dirty or ahead source (`ocSource.unsafe`); `launchDetached` uses `OC_LAUNCH_ARGV`; editor launch is quoted; Cursor proxy keeps SSRF, symlink, git-credential guards.
- Settings sync (tailnet, port 4097): exclusions both ways, all-or-nothing writes, symlinks stay linked.
- Revive: skips the build on an unchanged source fingerprint, builds with the window open (`--revive-prepare`), copies `oc` to `opencode`; `prepareStop` before any TUI kill. No `--version` checks on the server start path (macOS checks new binaries serially).
- macOS: platform helpers carry `win32` and `darwin` branches; callers stay neutral. Details: `docs/dev/macos.md`. First launch of each new executable path costs about 1.6 s. Agent shell is zsh; pwsh agent commands skip the profile; a background `opencode run` needs `< /dev/null`.
- Installer: Inno Setup plus WPF `ocSetup` (`oc oc deps`). Default-styled WPF controls need an explicit Foreground; read-only bindings `Mode=OneWay`; build XAML edits before handoff.
- Tests: a new network call reachable from shared paths needs its env key cleared in `test/preload.ts`. `OPENCODE_DISABLE_CONFIG_INSTALL` blocks plugin installs in tests. Build test sessions the way real callers do (synthetic init message).
- Public fork: scan for private paths before every push. History rewritten once (`backup/pre-rewrite`).
- Risk: Claude `persistSessions`/`persistPool` are last-writer-wins across oc and native; no real-limit failover acceptance check; failover ranking uses stale readings for unpolled accounts; long `Monitor` watches hold an account switch.
- Risk: `revive.ts` `consoleStart` still uses `/v:off` with `%VAR%`; `.bat`/`.cmd` through Start-Process are re-parsed by cmd; Codex OAuth callback listens on all interfaces.
- Risk: sidebar usage refresh does not see busy sessions in other windows; `disabledSubagents` metadata PATCH is read-modify-write; a crash-retried queued command claim reruns pre-prompt side effects.
- Risk: a revive chain with no TUI on the session holds the queue; `!` shell commands no longer load `.bashrc`/`.zshrc`; cua "Allow always" lasts until restart; agent-level pattern limits are not enforced on Claude's native Edit/Write on ordinary turns.
- TODO: `POST /agent/sub` bad input returns 500; a test rewrites tracked `packages/opencode/config.json`; `backgroundable` treats CLI-run bash parts as movable; `shortModelName` `.$1.$2` bug in `dialog-subagents.tsx`; `keybindDocs.ts` has no Mac column.
- TODO: installer VM first-install checks pending (`DefaultAppDir`, compression dictionary, uninstall of a retargeted `.lnk`); Windows-only `revive.test.ts` cases and the revive plan's live checks not run since v0.2.343.
- TODO: Mac-only failures: `buildNotesChanged.tests.ps1`, `installDir.tests.ps1` (Windows path literals), tui `dependencies.test.ts` "finds Git Bash", tui `openSidebar.test.ts` pooled-live (real Keychain); `test/provider/claude-code` per `docs/dev/testing.md`.
- MISTAKE rule: never end an Edit replacement in whitespace. Removing lines with Edit can join neighbors: match the whole line with its newline, then diff against HEAD.
- MISTAKE rule: run both sides of a bisect from the same shell. Probes of `Global.Path` run outside `bun test`. Probes that type into the prompt go through `ocTui` only.
- MISTAKE rule: confirm a regression test fails on old code in a temp copy, never by overwriting working files. Read the mechanism a test contends on before changing its timing.
- MISTAKE rule: trace cancel paths through `cancelBackgroundJobs` before promising notice behavior. Never derive layout from free text when structured fields exist.
- MISTAKE rule: Claude under oc uses the native task tool, never shell `opencode run`. An unquoted YAML colon once silently dropped a whole agent family: validate agent files after editing.
- MISTAKE rule: check file mtimes before editing when a handoff may be live. A user "stop at repo root" decision applies to every live config path.
- MISTAKE rule: `Test-Path -PathType Container` before copying into a folder. PowerShell `$HOME` is read-only: use a test home. `Start-Job` dies with its shell: use the harness background tool.
- MISTAKE rule: never bypass the real-spend guard through a fresh environment. Compile generated AppleScript with `osacompile`. Count buildNotes lines and rotate before inserting, not after.
- MISTAKE rule: project files only through Edit/Write, never shell heredocs or inline Python. Run SDK build scripts with `bun`. Async spawn when a probe calls back into its own server.
- MISTAKE rule: `git fetch` and check `main...origin/main` before bumping. Commit or stash before anything that rebuilds or updates from source (`/update` once reset uncommitted work away).
- MISTAKE rule: a tool that claims a side effect must perform it and report the real result. Subagents of a lead-owned session must not bump the version or write build notes (2026-11-17: two subagents each bumped, one left a half-done rotation).

## User
- oc is a fork of OpenCode that ships as two programs from one build: `oc` with a background server, and `opencode` in its own window. It runs on Windows and on Apple Silicon Macs. It is public on GitHub; the README is a short pitch and the wiki holds the user docs.
- Models: Claude Code, Claude Agent, Cursor, and OpenAI models sit in one model list. Favorites can be grouped into colored categories. Claude models come from the public model list (`/updateModels`).
- Claude Code: several logins with a manager, automatic failover to the login with the most usage left, API credit rollover when every login is limited, auto-resume after a reset, scheduled warm-ups (up to 24 a day), mid-turn steering, and chats that keep their conversation across forks and logins.
- Usage: the sidebar and Usage menu show limits, reset times, plan renewals, and each Claude login (grouped or table layout), with a calendar of upcoming resets.
- Prompts: queue with Alt+Q (Cmd+Option+Q on Mac), schedule for later with Alt+S, chain slash commands including `/revive`, and ask a side question with `/btw`. Pasted text never runs commands.
- Commands: the last one you send stays active, several in one message run in order, and the model can ask to switch.
- Subagents: live cards while they run, context use in the prompt bar, a per-chat off switch, a dialog to pick models and logins, optional terminal tabs, and Esc stops the main turn first and then the subagents.
- Sessions: global list with marks and filters, automatic names, cleanup of finished sessions, scheduled prompts, and oc's own `oc.db` so stock OpenCode cannot break it.
- Palette and sidebar: the oc palette (ctrl+o, cmd+o on Mac) is grouped by job and every entry has a description; any entry can become a sidebar button; sidebar style, position, width, and visibility are settings.
- `/revive` rebuilds and reinstalls oc from source with the window open and reopens your tabs; `/update` installs releases and verifies the download; a Windows setup exe and the "oc Dependency Installer" set up a new machine.
- Settings: export and import by file, import from another oc over Tailscale, and ongoing tailnet sync between machines.
- Tools built in: background shell, Jev, cua computer use with permission prompts, time, scheduling, clipboard, `/killall`, third-party harness updates (including WezTerm nightly), and PowerShell update.
- Look and feel: themes are separate for oc and opencode, with drac variants and an optional daily theme; a Notices list keeps every popup; chat links open on click in a chosen browser.
- Removed over time: `oc single`, ocdebug, command markers, `/work` and `/done`, `/bgRun`, SuperPlan/SuperGo, ChatGPT Web and Claude Web, sharing, and the README line count.

# Historical entries (newest first)

---

## 2026-11-23 (~01:51) - v0.2.409 lonelyPigtail - Forward oc rules to Claude Code - Claude Opus 5.5, default; Implementation

### Agent
- Meta: Claude Opus 5.5; default; Implementation; completed. Uncommitted.
- Version: 0.2.409
- Added Claude tool guard: `toolGuard.ts` registers stream-json `PreToolUse` callback per process (CLI 2.1.317+); `session/claudeToolGuard.ts` maps built-ins to oc permissions; `session/tools.ts` publishes latest ruleset per session. Unknown, failed, or timed-out checks block.
- Changed `shell.ts`: `extra.claudeShell` reuses real permission scan for Claude's Bash/PowerShell, then stops before running.
- Fixed turn watchdog: pending guard answer no longer ends turn.
- Changed personal `/spit`, `/spitS`, `/ask`: read-only shell allowlist denies Python, redirects, `--output`, `--ext-diff`, `--pre`, credential names. `/ask` edit now denied.
- Changed `commandPermissions.test.ts` (intended): `imp` allows `external_directory`, because Claude's Write outside project now follows oc's default `ask`.
- Added `toolGuard.test.ts`: real CLI deny, allow, and `ask` flows. Guard-off control with CLI reported below 2.1.317 wrote denied file; guarded run blocked it.
- Risk: existing `ask` rules now prompt on Claude's native tools. Claude shell cwd changes are not tracked by guard path scan. CLI below 2.1.317 logs warning and has no guard. Mac live check pending.
- ERROR: `prompt.test.ts` "keeps the level" intermittent from unbounded concurrent part order, code untouched here; clean-HEAD comparison could not run because temp copy lacked workspace modules. `scheduledResume.test.ts` EPERM failed once, passed rerun.
- Verification: Claude provider, permission, tool, session suites 2062 pass, 3 fail before test update; `commandPermissions` + `toolGuard` then 3 pass; remaining 2 logged in `docs/dev/testing.md`. Live from source with real Haiku, isolated DB and project: `/spit` denied Python and ran `git status`; build ran Python; build pattern rule stopped native PowerShell through `PreToolUse`, and an allowed command ran. Not live-tested: `ask` prompt, Mac.
- Fixed Claude Code provider dropping oc system text: global `AGENTS.md`, other `instructions` files, `user.system`, and `experimental.chat.system.transform` additions (ponytail, opencode-planner) never reached the CLI.
- Added `Instruction.claudeCode`: `system` minus files the CLI loads (`~/.claude/CLAUDE.md`, its `@` imports, project `AGENTS.md`/`CLAUDE.md`). Imports read one level deep.
- Added `CLAUDE_CODE_INSTRUCTIONS_OPTION`: `request.ts` sends all system text after the lead; `prompts.ts` appends it under `## oc instructions`. Tool turns only; title and text-only calls stay small.
- Kept process reuse: instruction changes apply at next spawn and do not retire a live process, so prompt cache and background jobs survive.
- Changed personal `~/.config/opencode/opencode.jsonc`: `claudeSettings.outputStyle = "default"`, so oc Claude sessions drop Concise; desktop Claude Code keeps it.
- Updated wiki `Claude-Code.md` (unpushed).
- MISTAKE: first version forwarded oc `bash`/`bgStatus` shell notes to Claude as if true. Fixed with personal `~/.config/opencode/claudeInOpencode.md` under `instructionsByModel["claude-code/*"]`, loaded after global `AGENTS.md`. Rule: check forwarded text against the receiving harness's tools.
- Fixed `CLAUDE_IMPORT`: relative `@path` imports now count as CLI-loaded. Pass probe covered tilde and relative imports and override order; this cleanup needs `/revive` and a new Claude chat to run live.
- Fixed PowerShell guard gap in personal Windows `~/.claude`: hook matcher now `Bash|PowerShell`; added `hooks/blockShellCredentials.ps1`; `blockShellSrcWrites.ps1` also catches `[IO.File]::Write*`/`Append*`. Prior 30-day oc transcripts had 3516 native `PowerShell` calls, 9 matching src writes, 8 naming credential files (contents not judged).
- Risk: hook is text matching; wildcards or a filename built at runtime can evade it. Mac `~/.claude` hook unchanged (`Bash` only); PowerShell availability there unchecked.
- Fixed `ensureSkillPlugin`: same-name `~/.claude/skills` entry hides oc's copy only when `SKILL.md` is identical (CRLF ignored). Differing copies stay available as `oc:<name>` (`build-notes`, `build-notes-archive`, `refinement`, `trace`). Added regression test; updated fixture because an empty same-name folder no longer counts as a native skill.
- Kept ponytail on by user decision pending testing. `/btw` stays unsupported on Claude Code; user does not use it.
- Verification: real hook scripts 10/10 with Bash and PowerShell payloads; affected suites 56 pass; opencode typecheck pass. Fake-API CLI probe never reached tool execution, but live oc session `ses_df8c26e70ffe0Jk9a5cVn7cVlj` confirmed `PreToolUse:PowerShell` ran `blockShellCredentials.ps1` and blocked the command. Live after second `/revive`: appended prompt has harness notes, then `claudeInOpencode.md`, ponytail, no `principles.md` copy; `outputStyle: default`; plugin links the 4 differing oc skills and omits the 2 identical ones.
- Verification: `instruction`, `subagentHint`, `fundamentalTools` 53 pass; opencode typecheck pass. Throwaway probe through `prepare` and a fake CLI passed (no duplicates, plugin text present, text-only turn excluded), deleted. Real CLI init reports `output_style: default` with the setting, `Concise` without, against a dead local API. Live after `/revive` (session `Foster - Greeting`): appended prompt has global `AGENTS.md` and ponytail, no `principles.md` copy; `claude.exe` runs with `outputStyle: default`. Not judged: whether reply quality improves over time.

### User
Claude Code in oc
- Claude models in oc now receive your oc harness rules, instruction files, and plugin prompts such as ponytail.
- Files Claude Code already loads are not sent twice.
- oc Claude sessions now use the default output style, while the Claude desktop app keeps Concise.

---

## 2026-11-22 (~12:16) - v0.2.408 untitledTax - Fixed 47 bugs from a whole-fork swarm - Claude Opus 5.5, default; Implementation

### Agent
- Meta: Claude Opus 5.5; default; Implementation; completed, live unverified. Uncommitted.
- Version: 0.2.408
- Process: 240 read-only hunt runs over fork-only code (Grok 4.6/4.7, GLM 5.3/Flash, a few GPT Sol/Terra), 8 roast runs, 96 cross-model verifiers, 17 diff reviewers. Skipped generated Cursor pricing data and the Claude Code provider swarmed in v0.2.407. Ledger: `~/.config/opencode/plans/2026-11-22-swarm-oc.md`; report: `.html` beside it.
- Fixed sync: case-only rename no longer deletes the new file; etag kept only after every wanted item applied; mid-scan read failure skips the item as `partial`; locked key file aborts instead of becoming `{}`.
- Fixed revive/server: `/update` refuses untracked files at target paths; stale/corrupt revive claims recover; secret staged, ACL-protected, renamed; `icacls` by absolute path; shutdown survives failed pane kill and process snapshot; failed recovery still reaches restarter and keeps `.old-*`; second `/revive` during reply wait refused.
- Fixed Cursor: real shell/delete outcomes; write stats; pathless delete error; hex IPv4-mapped SSRF block; JSONC and `**/`; hunk `---` lines and rename paths; Max mode on continuation; ls not rejected as read; image-save refusals throw; locked snapshots kept; proxy stop during startup; bounded auth polls; `exec` arity 3 so approval cannot save `exec *`.
- Fixed tools/TUI: cua kill exemption keyed on pid + creation time; driver orphan; Jev wrong-class auto-accept; schedule clock bounds; session tail newest-first; `ownerOnce` retries failed identity; wake listener leak; UTF-16 tails; root picker cleanup; quoted launcher paths; reload failures warn; `shortModelName`; project titles with regex characters.
- Kept by design: cancel of a claimed queue row (test requires it); abort during Cursor setup (pump handles it; attempted fix reverted).
- TODO: user decisions F36 device id, F4 sync links, F29 read-only Cursor subagents, F54 approval prompt text, F18 wt semicolons, F76 2 h busy rule. 31 other left items and about 359 unverified lower-priority claims are in the ledger.
- Verification: typecheck core/opencode/tui pass. core 31 pass; opencode covering set 307 pass; tui 803 pass, 5 fail, and the same 5 fail on a clean HEAD copy. Throwaway probe 8 pass, deleted. Missing: live Cursor turn, live sync between machines, `/revive`, installers, macOS run, whole opencode suite.
- ERROR: tui `questionRestored.test.tsx` (4) lacks a Sync provider and `pwshUpdateMac.test.ts` (1) expects POSIX paths on Windows; both fail on clean HEAD. `diff-viewer-file-tree` failed once and passed on rerun.
- MISTAKE: a read-only Grok 4.7 hunter ran a real clipboard write, replacing then clearing the user's clipboard. Rule: swarm prompts must say inspect only, never execute code or change clipboard, processes, settings, network, or git.
- MISTAKE: verifier GLM Flash called the broken `ocSession` regex correct; a probe proved it wrong. Rule: run a probe when a verifier reasons about regex or parser behavior.

### User
Bug fixes
- Settings sync no longer deletes a file renamed only by letter case, and no longer loses settings when a file is locked.
- `/update` now refuses to overwrite an untracked file, and `/revive` recovers better from failed restarts.
- Cursor now sees real results for failed shell commands, deletes, and file writes, and keeps Max mode on follow-up requests.
- Approving one wrapped Cursor shell command can no longer silently approve later ones.
- Computer use can no longer force-close an unrelated app that reused an old process id without asking.
- Long PowerShell logs, launcher paths with spaces, the file picker shortcut, and folders named like `C++` now work correctly.

---
