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
- Archives 1-16 hold the full history verbatim; never edit them. The old 60 KB cumulative summary: `git show 661a21b463:docs/buildNotes/buildNotes.md` (archive16 has it through archive15). Shortened in place 2026-11-10 at the user's request.
- Rules already in `AGENTS.md`, `docs/dev/*.md`, `FORK.md`, `SCOPE.md`, or `principles.md` are not repeated here. Read those first.
- Upstream: port by hand per `UPSTREAM-SYNC.md`, no unrelated-history merge. Synced through OpenCode v1.19.3 (v0.2.271). Vendor patches in `src/patches` (`@opentui/core@0.5.14`, `opentui-spinner@0.0.7`) need a refresh on upgrade.
- Process safety: stop only processes with proven creation-time identity (CIM on Windows, libproc on macOS). Never PID-only or whole-tree kills; unknown ownership leaves the process alive.
- Bun 1.4.2: `spawn(..., { detached: true })` of pwsh exits 0 without running (use the Start-Process launcher; the hidden pwsh hop keeps the resident alive). Two concurrent `fs.rename` of one source both fulfil: use exclusive `wx` create as a lock.
- `Bun.file(...).exists()` caches per object: use a fresh `BunFile` for changing state.
- Claude tools: restricted command turns use oc proxies, ordinary turns keep native tools. Explicit `proxyTools` lists must include `run_after_turn`, `time`, and `schedule`. `CLAUDE_UNSUPPORTED_TOOLS` (worktree, cron, wakeup) stay off.
- Claude prompt cache: keep the live clock out of the system prompt (the `time` tool serves it).
- Claude accounts: pool persists in `account-pool.json`; failover only on error results, ranked by most 5-hour usage left. An account switch retires the CLI conversation and catches up with a bounded `resumeBlock`, never a full history paste.
- Claude steering: `--replay-user-messages`; a message's settings compare by difference; an unmergeable message ends the turn after the current tool (`maybePreempt`); `isWakeTurn` checks only the newest message.
- Claude Code 2.1.309+ sends a tool-less naming request on a chat's first turn: match fake-model scenario requests by tools.
- Notices stay provider-neutral in `tui/src/feature-plugins/system/notifications.ts`. Claude `logger.ts` warn/error go to `opencode.log` (`channel=claude-code`), not toasts.
- Commands, skills, and agent markdown hot reload by fingerprint with per-file last-good. Keep the Command -> Skill lock direction; commands win name collisions.
- Palette entries go in category `oc`; `Session` entries are hidden from the oc palette. Check namespace and palette filters before calling an entry reachable.
- Slash commands: pasted, quoted, or fenced text never runs commands (`typedSlashCommands`). Command permissions are saved on the user message and apply to that turn only. Revive commands may sit inside a chain.
- Queue and schedule: `session_queue` (`run_at`, `target`, `message_id`) with durable claims in `scheduledDelivery.ts`; `alt+return` only queues.
- Session metadata is public API: no internal keys there; provider state goes in provider storage.
- TUI: a plugin sidebar root `<box>` must always render (an async `<Show>` root leaked OpenTUI buffers until the chat froze). Bootstrap uses the provider summary (`Provider.SummaryResult`), not the full provider list.
- TUI: opentui marks every mouseup on selectable text as dragging; read its event flow before trusting event flags. Shared `DialogSelect` timing changes need `local.test.ts`, `subagentDialog`, and `commandPalette` runs.
- Keybinds: a new `keybind.ts` Definition needs a `packages/tui/script/keybindDocs.ts` regen; `prePush.ps1` checks it.
- Security kept: `/update` verifies SHA-256 before writing; `launchDetached` passes argv through `OC_LAUNCH_ARGV`, never the cmd line; editor launch is quoted with a Notepad fallback; Cursor proxy keeps SSRF, symlink, and git-credential guards.
- Revive: `/revive` skips the build when the source fingerprint is unchanged, builds with the window open (`oc oc --revive-prepare`), compiles once and copies `oc` to `opencode`. `prepareStop` runs before any TUI kill. The native file must be named `opencode`.
- macOS: platform helpers carry `win32` and `darwin` branches; callers stay neutral. Details: `docs/dev/macos.md`. First launch of each new executable path costs about 1.6 s.
- Installer: Inno Setup plus WPF `ocSetup` (engine `oc oc deps`). WPF controls that keep default styles need an explicit Foreground; bind read-only view-model properties `Mode=OneWay`; build XAML edits before handoff.
- Tests: a new network call reachable from shared paths needs its env key cleared in `test/preload.ts`. `OPENCODE_DISABLE_CONFIG_INSTALL` blocks plugin installs in tests. Build test sessions the way real callers do (synthetic init message).
- Repo is a public fork: scan for private paths before every push. History was rewritten once (branch `backup/pre-rewrite`).
- v0.2.346: working tree is LF, README is no longer stamped at push, and activity rules moved from `AGENTS.md` to `docs/dev` (`commitMessage`, `testing`, `agentTest`, `debugRuns`).
- Risk: Claude `persistSessions`/`persistPool` are last-writer-wins across oc and native; no real-limit failover acceptance check; failover ranking uses stale readings for unpolled accounts; long `Monitor` watches hold an account switch.
- Risk: `revive.ts` `consoleStart` still uses `/v:off` with `%VAR%`; `.bat`/`.cmd` through Start-Process are re-parsed by cmd; Codex OAuth callback listens on all interfaces.
- Risk: sidebar usage refresh does not see busy sessions in other windows; `disabledSubagents` metadata PATCH is read-modify-write; a crash-retried queued command claim reruns pre-prompt side effects.
- Risk: a revive chain with no TUI on the session holds the queue; `!` shell commands no longer load `.bashrc`/`.zshrc`; a plain mid-turn message cannot lift a command's restrictions; cua "Allow always" lasts until restart.
- TODO: `POST /agent/sub` bad input returns 500; a test rewrites tracked `packages/opencode/config.json`; `backgroundable` treats CLI-run bash parts as movable; `shortModelName` `.$1.$2` bug in `dialog-subagents.tsx`.
- TODO: installer VM first-install checks pending (`DefaultAppDir`, compression dictionary, uninstall of a retargeted `.lnk`); Windows-only `revive.test.ts` cases and the revive plan's live checks not run since v0.2.343.
- TODO: Mac-only failures in `.scripts/tests/buildNotesChanged.tests.ps1` and `installDir.tests.ps1` (Windows path literals) and tui `dependencies.test.ts` "finds Git Bash" (2026-11-10).
- MISTAKE rule: never end an Edit replacement in whitespace. Removing lines with Edit can join neighbors: match the whole line with its newline, then diff against HEAD.
- MISTAKE rule: run both sides of a bisect from the same shell. Probes of `Global.Path` run outside `bun test`. Probes that type into the prompt go through `ocTui` only.
- MISTAKE rule: confirm a regression test fails on old code in a temp copy, never by overwriting working files. Read the mechanism a test contends on before changing its timing.
- MISTAKE rule: trace cancel paths through `cancelBackgroundJobs` before promising notice behavior. Never derive layout from free text when structured fields exist.
- MISTAKE rule: Claude under oc uses the native task tool, never shell `opencode run`. An unquoted YAML colon once silently dropped a whole agent family: validate agent files after editing.
- MISTAKE rule: check file mtimes before editing when a handoff may be live. A user "stop at repo root" decision applies to every live config path.
- MISTAKE rule: `Test-Path -PathType Container` before copying into a folder. PowerShell `$HOME` is read-only: use a test home. `Start-Job` dies with its shell: use the harness background tool.
- MISTAKE rule: never bypass the real-spend guard through a fresh environment. Compile generated AppleScript with `osacompile`. Count buildNotes lines and rotate before inserting, not after.

## User
- oc is a fork of OpenCode that ships as two programs from one build: `oc` with a background server, and `opencode` in its own window. It runs on Windows and on Apple Silicon Macs. It is public on GitHub; the README is a short pitch and the wiki holds the user docs.
- Models: Claude Code, Claude Agent, Cursor, and OpenAI models sit in one model list. Favorites can be grouped into colored categories. Claude models come from the public model list (`/updateModels`).
- Claude Code: several logins with a manager, automatic failover to the login with the most usage left, auto-resume after a reset, scheduled warm-ups, mid-turn steering, and chats that keep their conversation across forks and logins.
- Usage: the sidebar and Usage menu show limits, reset times, plan renewals, and each Claude login, with a calendar of upcoming resets.
- Prompts: queue with Alt+Q (Cmd+Option+Q on Mac), schedule for later with Alt+S, chain slash commands including `/revive`, and ask a side question with `/btw`. Pasted text never runs commands.
- Subagents: live cards while they run, context use in the prompt bar, a per-chat off switch, a dialog to pick models and logins, optional terminal tabs, and Esc stops the main turn first and then the subagents.
- Sessions: global list with marks and filters, automatic names, cleanup of finished sessions, scheduled prompts, and oc's own `oc.db` so stock OpenCode cannot break it.
- Palette and sidebar: the oc palette (ctrl+o) is grouped under headings and every entry has a description; any entry can become a sidebar button; sidebar style, position, width, and visibility are settings.
- `/revive` rebuilds and reinstalls oc from source with the window open and reopens your tabs; `/update` installs releases and verifies the download; a Windows setup exe and the "oc Dependency Installer" set up a new machine.
- Tools built in: background shell, Jev, cua computer use with permission prompts, time, scheduling, `/killall`, third-party harness updates, and PowerShell update.
- Look and feel: themes are separate for oc and opencode, with drac variants and an optional daily theme; a Notices list keeps every popup; chat links open on click in a chosen browser.
- Removed over time: `oc single`, ocdebug, command markers, `/work` and `/done`, SuperPlan/SuperGo, ChatGPT Web and Claude Web, sharing, and the README line count.

# Historical entries (newest first)

---

## 2026-11-10 (~01:31) - v0.2.346 ggBigspin - LF working tree, README no longer stamped at push, smaller AGENTS.md and notes summary - Claude Fable 5.2, low effort; Implementation

### Agent
- Meta: Claude Fable 5.2; low effort; Implementation; completed. Plan: `~/.config/opencode/plans/threeCleanups.md`. Done in the Mac checkout (clean and ahead of Windows at start).
- Version: 0.2.346 ggBigspin
- Changed `.gitattributes` to `* text=auto eol=lf`; removed the 11 per-path `eol=lf` pins (now redundant); kept `*.pdf binary` and `linguist-generated`. `.editorconfig` `end_of_line = lf`.
- Converted 2935 working files CRLF -> LF with a throwaway byte-level script. Note: git then listed every file as modified with an empty diff (cached size differs); `git update-index -- <files>` on the unchanged ones cleared it. A Windows checkout needs no conversion: CRLF copies stay valid until rewritten.
- Removed `setLineEndings` (`scriptHelper.ps1`), its `prePush.ps1` call, and `.scripts/tests/lineEndings.tests.ps1`.
- Removed `.scripts/countCode.ps1`, `.scripts/readmeVersion.ps1`, `scc.txt`, their `prePush.ps1` calls, `$readme`, and `scc.txt` from the `getUnbumpedCodeChanges` regex. README: static "Latest release" link, `## Progress` table deleted.
- Removed the `scc` row from `tui/src/dependencies.ts` (its only use was the count) and from `dependencies.test.ts`. Kept the `scc.exe` uninstall line in `oc.installer.iss` for older installs.
- Moved AGENTS.md text unchanged to `docs/dev/commitMessage.md`, `testing.md`, `agentTest.md`, `debugRuns.md`, and the installer VM bullet to `vmAcceptance.md`; AGENTS.md keeps a "Read before these activities" pointer list (31.3 KB -> 16.2 KB). Mac known failures merged from `macos.md` into `testing.md`. Shortened the Bun 1.4.0 bullet.
- Added AGENTS.md "Build notes" summary budget (80 lines, 12 KB); the shared `build-notes-archive` skill is unchanged.
- Changed the cumulative summary in this file in place at the user's explicit choice (167 lines / 60 KB -> 62 lines / 10 KB). Old text: `git show 661a21b463:docs/buildNotes/buildNotes.md`. Spliced with a scratch script so the rules block and entries stayed byte-identical.
- Updated references: `agentPush.ps1 -Context` and `scriptHelper.ps1` comment point at `docs/dev/commitMessage.md`; `SCRIPTS.md` rows and code-count section; `FORK.md` dev tools list; wiki `Developing.md` and `Install.md` (scc dropped).
- Verification: `git ls-files --eol` shows no `w/crlf`; `git status` after conversion listed only `.gitattributes`; every moved AGENTS.md line compared byte-exact against `HEAD`; `commitSubject.tests.ps1` and `testRunner.tests.ps1` pass; `push.ps1 -DryRun "probe"` and `agentPush.ps1 -Context` print as expected; tui `bun run typecheck` clean; `dependencies.test.ts` 18 pass.
- ERROR: Mac-only failures on unchanged code: `buildNotesChanged.tests.ps1` and `installDir.tests.ps1` (Windows path literals; the first leaves a stray temp file, removed), tui `dependencies.test.ts` "finds Git Bash from git's cmd folder only". `prePush.ps1` itself not run.
- Kept `docs/dev/docReview.md`, `reviveFasterPlan.md`, and `macPerfPlan.md` mentions of the removed pieces: dated plans.

### User
Repo upkeep
- Files on disk now use LF line endings on every OS, so the push step no longer converts them and shell scripts no longer break on the Mac.
- A push no longer rewrites the README: the line-count table and `scc.txt` are gone, and the version line is a fixed link to the latest release. Pushing no longer needs `scc`.
- The oc Dependency Installer no longer offers scc.
- AGENTS.md is about half its size; commit-message, testing, agent-test, and debug rules moved to `docs/dev` and are read only when needed.
- The build notes summary is about a sixth of its size; the full old text stays in git history and the archives.

---

## 2026-11-10 (~01:15) - v0.2.345 poopingPerms - False "no reply" note after a Claude restart; note when a restart stops background tasks - Claude Fable 5.2, low effort; Implementation

### Agent
- Meta: Claude Fable 5.2; low effort; Implementation (/spit then /imp); completed
- Version: 0.2.345 poopingPerms
- Cause: a CLI resumed with an unfinished background task (CLI 2.1.321) first runs a `<task-notification>` "didn't finish before the previous session ended" turn with no model call: `system/init`, then `result` (`subtype: success`, `num_turns: 0`, `origin: { kind: "task-notification" }`), then reads the stdin message. `TurnStream` took that `result` as its own, showed `▌ **no reply:**`, and the real turn then ran through the wake path (`requestWakeTurn`)
- Seen 2x in ses_e3e0b47d1ffeLhmceN9Q07AWOG (rustitles, 2026-11-10 05:50 and 05:51 UTC): once after a `/pass` command turn respawned the CLI (command tool plan changes `toolCatalogHash`), once after a revive
- Fixed `turnStream.ts`: `isNoticeResult` skips a `result` whose `origin.kind` is `task-notification` unless the turn attached to a CLI-started turn (`attachedAutonomous`); it calls `noteTurnStarted` again because `noteTurnLine` already settled `turnInFlight` on that line
- Added `origin` to `ClaudeStreamMessage` (`types.ts`)
- Changed plan: spit proposed gating `result` on the `--replay-user-messages` echo. Not used: fake CLIs in the unit tests never echo, and the CLI marks the foreign result itself
- Added `formatTasksStoppedNote` / `TASKS_STOPPED_MARKER` (`cliEvents.ts`) and `TurnStream.retire(ap, why)`: the three respawn branches of `retireStaleProcess` (tools, model/agent/effort, MCP config) push a `▌ **background tasks:**` notice with the count of backgrounded entries in `ap.backgroundTasks` before stopping the process
- Kept the respawn itself (user choice): postponing it would run a command turn without the command's tool restrictions
- Added `silentTurn.test.ts` case "a background task notice ahead of the message is not taken for its reply" (fails without the fix); `autonomousTurn.test.ts` fake tags its woken turn's result with the same origin, covering the attach exemption; `fakeModel.test.ts` scenario "a restart that stops a background task says so and still answers the message" (real CLI, model switch with a background `sleep 60`)
- Verification: probe (real CLI 2.1.321, `TestLLMServer`, `openChat` server restart with a background `sleep 300`) showed the note plus a wake turn without the fix and one `SECOND-REPLY` step with it; second probe (model switch) showed the stopped-tasks note then the reply; probe folders deleted. `bun test` silentTurn, autonomousTurn, respawn, cliEvents, sessionManager: 74 pass; unattendedReplay, resultFallback, turnStreamFailures passed before the note change. New fakeModel scenario passes alone; full `fakeModel.test.ts` run before the note change: 25 pass, 3 fail (the 3 known macOS entries in `AGENTS.md`). `bun run typecheck` in `packages/opencode` clean
- Rotated `buildNotes.md` (1305 lines) to `buildNotes.archive16.md`. Its newest entry, v0.2.344 "Claude Fable 5.2 and Mythos 5.2 in the Claude Code list", was not committed yet: include it in the next commit body
- Note: a real CLI whose server was killed stays alive (PPID 1) while its background task runs; probes left 5 such processes, each stopped after confirming its fixture path or cwd
- MISTAKE: inserted this entry before rotating (file was at 1305 lines), then had to remove it, rotate, and re-insert. Rule: count lines before inserting
- MISTAKE: applied the `retire` and `cliEvents.ts` edits with an inline Python script instead of Edit. No damage found (diff checked, typecheck clean). Rule: Edit only for project files
- Risk: source edited in the Mac checkout (`/Volumes/C` did not hold the Windows repo); an rsync from Windows without these changes would overwrite them

### User
Claude chats
- Sending a message right after oc or Claude Code restarted, while a Claude background command was still running, no longer shows a false "no reply" note before the real answer.
- When a slash command or a model, agent, or effort change restarts Claude Code and that stops background commands it was running, the reply now starts with a note saying how many were stopped and why.
