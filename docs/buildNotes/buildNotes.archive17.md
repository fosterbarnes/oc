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

## 2026-11-17 (~00:16) - v0.2.371 duringMinister - Atomic queued batches and stale blank-question cancellation - GPT-6.1 Sol, default; Implementation

### Agent
- Meta: GPT-6.1 Sol; default; Implementation; completed
- Version: 0.2.371 duringMinister
- Implemented `macHarnessFixes.md` sections 7-9 atop uncommitted peek/transfer/split work; preserved other agents' edits.
- Changed `SessionQueue.add(sessionID, inputs)`: ordered inserts under one permit and immediate transaction, per-entry receipt/sent checks and conflict no-op, one pause check and post-commit wake. Migrated prompt wrapper, HTTP, schedule tool, queue tests, and prompt-test caller near line 591.
- Added HTTP `batch` with nonempty shared add fields; `checkAdd` validates every entry before one queue call. TUI `addEntries` sends one request; Enter step batches join Alt+Enter's `queueSends` chain.
- Fixed blank-step questions: shared payload-change check, versioned queue-wake watcher raced against ask, interrupted request cleanup, drain rerun after edit/cancel. Explicit rejection still pauses with `interrupted`.
- Added behavior tests: concurrent batch contiguity, invalid second HTTP entry leaves queue empty, valid HTTP batch, cancellation sends following prompt, edit sends updated command without answering. Existing rejection/blank/skip cases pass.
- Regenerated client (no output diff) and legacy SDK using `bun ./packages/sdk/js/script/build.ts --generate-only`; direct script invocation lacked execute permission. HTTP exercise only checks unknown payload, so unchanged.
- Verification: queue 30 pass/0 fail; HTTP queue 2/0; migrated prompt contention test 1/0; TUI prompt 39/0; opencode and TUI `bun run typecheck` exit 0; `git diff --check` clean. Initial stale SDK and concurrent config type errors resolved before final checks.
- Not run: builds, installs, live GUI, full session prompt suite. No commits or pushes.

### User
Queued commands
- Multi-step submissions now queue atomically and keep Enter and Alt+Enter submissions in press order.
- Editing or cancelling a blank queued command closes its question and lets the queue continue immediately.

---

## 2026-11-16 (~23:51) - v0.2.370 nerdyIntel - Raise Claude warm-up times-per-day cap to 24 - Claude Opus 5.5, medium; Build

### Agent
- Meta: Claude Opus 5.5; medium; Build; completed
- Version: 0.2.370 nerdyIntel
- Changed: `MAX_TIMES_PER_DAY` (`warmup/schedule.ts`, server) and `MAX_TIMES` (`tui/src/claudeWarmup.tsx`) 4 -> 24. A full 5h cycle needs 5 sends/day (24/5 = 4.8), so 4 could not cover a day. User rule: keep a sane cap rather than none; 24 = hourly. Keep the two constants equal.
- Updated tests (intended change): `opencode/test/provider/claude-code/warmup.test.ts` and `tui/test/claudeWarmup.test.ts` now accept 24 hourly times and reject 25 (parser, `normalizeSchedule`, preset reader); TUI parser also covers the 5-time 04/09/14/19/00 cycle.
- Updated `FORK.md` warm-up row and wiki `Claude-Code.md` "Times per day" row to "up to 24".
- Verification: `bun test test/provider/claude-code/warmup.test.ts` (41 pass) in opencode; `bun test test/claudeWarmup.test.ts test/claudeWarmupRendered.test.tsx` (28 pass) in tui.

### User
Claude warm-up schedule
- The Times dialog now accepts up to 24 times per day instead of 4, so a full 5-hour cycle (for example 04:00, 09:00, 14:00, 19:00, 00:00) fits.

---

## 2026-11-16 (~21:47) - v0.2.369 ringesqueDwarves - Active commands, ordered command steps, mode_switch - Claude Opus 5.5 (imp, lead) with GPT-6.1 Sol (server) and Claude Opus 5.5 medium (TUI); Implementation

### Agent
- Meta: lead Claude Opus 5.5; server half GPT-6.1 Sol medium subagent, TUI half Claude Opus 5.5 medium subagent. Plan: `~/.config/opencode/plans/activeCommandsPlan.md` (decisions settled with user; earlier `docs/dev/modeSwitchPlan.md` draft removed).
- Version: 0.2.369 ringesqueDwarves
- Why: command rules were turn-only while the command text stayed in history, so plain follow-ups after `/spit` ran with full access while the model still believed `/spit` applied (probed: Opus 5.5 low + Terra medium both assumed sticky). Now harness and transcript agree.
- Added public `Command.whenBlank` (ask default), server-only `suggest`; defaults preserve lazy MCP templates.
- Added `session/activeCommand.ts`: `ocActive` message metadata, newest meaningful user lookup, model-only continuation marker. Supersedes cumulative summary's turn-only command rule.
- Removed command composition and `additionalCommands`; shared command rules/template paths serve explicit commands, inherited plain turns, and approved switches. Unrestricted commands store empty rules so Claude forwards `mode_switch` too.
- Added question-only `mode_switch`, root/active visibility, live suggested targets, synthetic none-clear, createUserMessage-only switch persistence, Claude preemption, noninteractive run denial.
- Added queue `split`, pre-claim legacy expansion, blank question/send/typed/Skip/dismiss paths, expected-payload claim checks; scheduled stacks transfer atomically to one destination queue before command dispatch.
- Regenerated client and legacy SDK (`--generate-only`); no TUI edits. Updated intended-change composition/title tests and TaskPromptOps fixtures; added consent, inheritance, queue, and proxy contracts.
- Verification: focused feature tests 16/0; queue 27/0; proxy selection 92/0 (1 skip), subagent/CLI proxy tests 71/0. Broader 7-file session/tool run 195 pass, 1 skip, 1 documented Mac failure; requested 5-file run 130 pass, 1 skip, 2 documented Mac failures.
- TUI: `splitSlashSteps` (`tui/src/prompt/slash.ts`): one command keeps today's path; 2+ -> ordered steps (leading text = plain step, stack text -> first command, duplicates kept). Submit and Alt+Enter add one queue entry per step (`split: true` from step 2, editor/attachments on step 1, never steers); multi-command messages cannot be scheduled (toast). `extractChain` uses the splitter; `reviveChain.tsx` sends per-step text and asks Send blank / Add prompt / Skip for blank step-2+ commands unless `whenBlank: send`. Active command reader + muted `/name` indicator beside the agent label.
- Core: `util/reviveResume.ts` `chainText` includes step text so stopped/edited chains keep it (TUI agent deviation, kept).
- Fixed: new queue test "scheduled legacy stack" picked any root session other than origin and counted exact LLM calls; failed when run with prompt.test.ts (shared DB, extra naming call). Now takes the session fireDue created and waits on its completed replies.
- Personal config (not shipped): `suggest: true` on spit/spitS/imp/impS (+ `mode_switch: allow` on spit/spitS, Mac and Windows copies), `whenBlank: send` on verify, pass, agent-push, fpc, fpcmd, forkScope, verScope, syncFree. Line endings kept per file (some mixed).
- Docs: FORK.md row "Active commands and ordered command steps"; wiki Agents-and-Skills (one command / several in order / last command stays active), Configuration (`whenBlank`, `suggest`), Sessions (queued steps).
- Verification (lead re-ran): opencode 5-file run 130 pass, 2 documented Mac failures (`cancel finalizes interrupted bash ...`, `command path rules persist ...`); queue 27/0 alone and in combination; tui slash/part/queue/chain 21/0; core reviveResume 3/0; `tsgo --noEmit` exit 0 in opencode and tui. Probe: real `~/.opencode/commands` load through `ConfigCommand.load` with the new keys, no diagnostics.
- MISTAKE: initial composition-flow rewrite retained unrestricted first command and timed out; corrected fixture to invoke the restricted command directly.
- /agentTest (native window, 2026-11-16): indicator persists across a plain follow-up (Big Pickle); `/spit ONE /spit TWO` ran as two turns in order; `/spit FIRST /think` showed the blank-step form, Skip kept /spit; `please /spit SOLO` stayed one message; Claude Haiku: plain "create hello.txt" in /spit -> switch form -> Stay (no file) -> Switch -> /imp created it. Evidence `<tmp>/agentTest/20261116-2235/`.
- Fixed (found by /agentTest): personal spit/spitS had `mode_switch: allow` before `"*": deny` (last match wins), so the tool was never offered; moved below it (Mac + Windows). Added `MODE_SWITCH_PROXY_HINT` to `provider/claude-code/prompts.ts` `buildToolEnvironmentNote` (only when `mode_switch` is offered): proxy tools are deferred, so Claude saw only the name. subagentHint tests 27/0, typecheck exit 0.
- MISTAKE: my first agentTest case `reply ONE /spit reply TWO` has one command, so it correctly stayed one message; case design error, not a bug.
- Quirk: on macOS `ocTui` `palette` steps cannot open the command palette (cmd+p); use `/new` for a fresh chat. `reply` often returned empty before the turn finished; judge on the duration footer. `nativeTest.ps1 -Start` stays attached after starting the window, so start it with nohup or a background job dies with the window.
- /agentTest round 2: `whenBlank` live (project `/ping` with `whenBlank: send` ran blank, no form; `/pingAsk` asked, Send blank ran it). GPT-6.1 Terra Fast (OpenAI): /spit mockup -> plain file write -> switch to /imp -> "back to the mockup" -> switch to /spit, all via forms. Claude Haiku in /imp with "back to the mockup": tool offered (transcript), but Haiku edited the mockup in /imp without asking, twice (also after rewording `MODE_SWITCH_PROXY_HINT` to include "even if the active one could do it"). Stopped after 2 attempts. Permission-driven switches work on Haiku; role-driven ones depend on the model.
- Fixed (user asked for a zero per-message-token fix): role boundary as a permission boundary plus a hint only at denial time. Personal imp/impS: `edit: { "*": allow, "~/.config/opencode/plans/mockups/**": deny }` (on Claude Code /imp edits now go through oc's edit/write proxy). Code: `PermissionV1.DeniedError` got optional `hint` (appended to its message); `SessionTools` adds "If another command fits this request, ask the user to switch with mode_switch..." to denials when mode_switch is offered and allowed that turn. Haiku case 8d: denied mockup edit in /imp -> switch form -> Switch -> /spit edited it. PASS.
- Fixed regression: `tool/registry.test.ts` code-mode tests failed (`@opencode/MCP: Unimplemented method "prompts"`) because the registry now lists commands for mode_switch; added `prompts` to the two MCP mocks. 19/0. Unrelated failure seen: `jev.test.ts` "duplicate ids and a missing key" expects old "TYPESAFE_API_KEY is not set" wording (Jev key message changed outside this session).
- Quirk: project commands added after the native window starts are not loaded (restart with `-Project`). A trailing `/command` at the end of a message can be autocompleted by the `/` menu on Enter.
- Final review (Sol low; Grok unavailable, "Model not found: cursor/grok-4.6"), verified, handed off to a separate session (user's clipboard prompt with the macOS harness issues): TODO multi-step submit adds steps in separate calls (partial success re-queues earlier steps on resend); Enter-submitted batches bypass `queueSends` and can interleave; the drain's blank-step question outlives a cancelled/edited entry and holds `draining`. Root fix: atomic batch queue add + one send chain; tie the question to its entry.
- Final checks: opencode 13-file run 300 pass, 2 documented Mac failures; tui 41/0; core 3/0; typecheck exit 0 in opencode, tui, core.
- Known gaps: Queued prompts edit into several commands still saves one legacy multi-command entry (drain expands it).
- No build, install, GUI, real-model spend, commit, or push.

### User
Commands
- The last command you send now stays active: plain messages keep its rules, the prompt bar shows it, and the model knows it is still active.
- The model can ask to switch commands (for example from `/spit` to `/imp`); nothing switches unless you pick Switch in the form. It only proposes commands marked `suggest: true`.
- Several commands in one message now run in order, one turn each, instead of being merged. A later command with no text asks for a prompt when its turn comes, unless it is marked `whenBlank: send`.

---

## 2026-11-16 (~20:18) - v0.2.368 wolfsHard - Warm-up lists the default Claude account on macOS - Claude Opus 5.5, default effort; Implementation

### Agent
- Meta: Claude Opus 5.5; default effort; Implementation (from /spit handoff); completed
- Version: 0.2.368
- Fixed `warmup/inventory.ts` `probeAccount` and `warmup/index.ts` `sendWarmup` always setting `CLAUDE_CONFIG_DIR`, including for the default account (pool ids are materialized, so the `=== DEFAULT_ACCOUNT` checks never matched). On macOS the CLI keys its Keychain login on whether that var is set (`Claude Code-credentials` vs `Claude Code-credentials-<hash>`), so `~/.claude` probed as signed out and vanished from the warm-up palette; scheduled sends for it were skipped too.
- Replaced `warmupConfigDir` with `warmupEnv(accountID)` in `warmup/cli.ts`: default (`DEFAULT_ACCOUNT` or `materializeDefaultDir()`) keeps the inherited env, others pin their dir. Same rule as `accountManage.ts` `runAuth`.
- Verification: throwaway probe ran real `listConnected` for `~/.claude2`, `~/.claude`, `~/.claude3` with `CLAUDE_CONFIG_DIR` unset: 3/3 connected (was 2/3). `warmup.test.ts`, `warmupFakeModel.test.ts`, `httpapi-warmup-listener.test.ts`: 46 pass. tsc showed no warmup errors. Probe folder deleted.

### User
Claude warm-up
- The palette now offers "Schedule Claude warm-up" for every signed-in pool account on the Mac, including the main `~/.claude` login, and scheduled warm-ups for it actually send.

---

## 2026-11-16 (~18:16) - v0.2.367 replicateDiildopickle - Sidebar Usage grouped and table layouts - Claude Opus 5.5, default effort; Implementation

### Agent
- Meta: Claude Opus 5.5; default effort; Implementation (/imp of plan `~/.config/opencode/plans/usageSidebarLayout.md`, mockup `mockups/usageSidebarLayout.html` cards B and C); completed
- Version: 0.2.367
- Added `tui/src/routes/session/sidebar-tools/usage/layout.ts`: pure `usageLines(layout, entries, width, options)` returning lines of `{ text, tone, key? }` segments. `grouped`: name (+ ` «`) with the renewal right-aligned, then `  <tag> <pct> <bar> <reset>` per window (bar `━`, cells `min(12, width - 11 - longest reset)`, dropped under 3). `table`: one line per `table` entry whose window tags match the first two-window Claude/Codex entry (or that has a `note`), columns sized from the data; resets drop when they do not fit, renew drops first. Other entries render below in grouped style; the header labels return as `header` and continue the `- Usage:` line.
- Tones: used >= 95 error, >= 80 warning, else stale or 0% muted, else text; bar fill primary/warning/error/muted, track `borderActive`. The stale `*` is gone (dimmed instead).
- `usage/format.ts`: removed `formatUsageRows`, `usageColumns`, `formatClaudeUsageRows`, `windowLabel`; added `windowTag(minutes, fallback)` (`5h`/`1d`/`wk`/`mo`/`Nd`) and `shortResetDate(ms, nowMs)` (clock today, weekday + clock within 6 days, else `M/D`; `:00` dropped in 12h; follows `Locale.clock()`).
- `usage/plans.ts` `usagePlanLine`: also returns `short` (`26d`, `end`, `-`); `urgent` is now within 3 days or ended (its only caller is the sidebar).
- `sidebarUsage.tsx`: `usageRows` builds `UsageEntry`s from the existing snapshots (fallback notes unchanged in meaning; Cursor's two-line sign-in hint is now one note `open Usage to sign in`), renders segments with `<span>`s, and splits a keyed renewal into its own `<text>` for hover and the billing click (`planLine` folded in). `«` shows only for pooled accounts. Usage menu `Settings` gains `Layout: grouped` / `Layout: table`.
- `settings.ts`: `usageLayout: "grouped" | "table"` (default `grouped`, normalized, in `USER_KEYS`).
- Tests: deleted the formatter alignment tests in `test/cli/tui/usageFreshness.test.ts` and the `formatClaudeUsageRows` asserts in `usageLive.test.ts` (code removed); added a `usageLayout` normalize case in `test/feature-plugins/sidebarTools.test.ts` (settings-file contract).
- Docs: `FORK.md` Usage meters row; wiki `Sidebar.md` (Usage bullet, plan renewal section, `usageLayout` settings row). Wiki not pushed.
- Verification: `bun run typecheck` clean; `bun test test/cli/tui test/feature-plugins/sidebarTools.test.ts` 225 pass, 0 fail. Probes (deleted after): `usageLines` output at 38/36/33/25/24/22 columns matched the mockup for both layouts; an opentui `testRender` probe of the same span/split-text pattern rendered both layouts at 38 and 24 columns as expected. A layout test file asserting whole lines was written, then removed under the verify keep bar. No live pane run.

### User
Sidebar
- The Usage block has two new layouts: grouped (default) shows each account's renewal on its name line and one line per window with a bar and a short reset time; table shows one line per account under 5h / week / renew columns.
- Switch layouts with **Layout** in the Usage menu (saved as `usageLayout` in `sidebar.json`).
- Usage turns yellow at 80% and red at 95%, renewals turn yellow within 3 days, and out-of-date numbers are dimmed instead of ending in `*`.
- The previous layout is removed.

---

## 2026-11-14 (~23:50) - v0.2.366 ohQueens - Claude Skill in command turns; Monitor follows bash - Claude Opus 5.5, high effort; Implementation

### Agent
- Meta: Claude Opus 5.5; high effort; Implementation (/imp of plan `~/.config/opencode/plans/2026-11-14-claude-native-tool-families.md`); completed
- Version: 0.2.366
- Fixed `CLAUDE_NATIVE_TOOLS` (`provider/claude-code/shared.ts`): added `skill: ["Skill"]`, and `Monitor` + `TaskStop` to `bash`. Root cause: a closed command turn (`"*": deny`, e.g. `~/.opencode/commands/spit.md`) builds `--tools` only from this table, so `Skill` was always dropped even with `skill: allow`, while the `--plugin-dir` skill listing and the env note still advertised `oc:` skills -> `No such tool available: Skill`.
- Same table now makes agent/session denials reach these built-ins through `nativeToolsDeniedByHost`: `skill` denied (e.g. `explore`) turns `Skill` off; `bash` denied turns `Monitor` (runs shell commands) and `TaskStop` off. Closed turns that keep native Bash now also keep `Monitor`/`TaskStop` (oc's `bgStatus`/`bgKill` were already dropped there as replaced).
- Changed `planSpawn` (`spawnPlanning.ts`): `skillOn` from `cliTools`/`disallowed`; `--plugin-dir` and the env note's skills bullet only when `Skill` is on. The skills fetch still starts in parallel and is ignored when off. `buildToolEnvironmentNote` gained `skills = true` (`prompts.ts`).
- Added `Monitor` to `READ_ONLY_DISALLOWED_CLI_TOOLS` (`permissionPresets.ts`) for CLIs without `--restricted`.
- Tests: updated `commandToolPlan.test.ts` / `subagentHint.test.ts` family lists; added closed-turn skill allow/pattern/deny case, `Skill`/`Monitor`/`TaskStop` denial cases, env note skills gate. The old `TaskStop` assertion now checks the todo family against `[{ name: "bash" }]` (same intent).
- Wiki: `Agents-and-Skills.md` (Skill in kept tools), `Claude-Code.md` (skill deny, Monitor/TaskStop follow bash). Not pushed.
- Verification: throwaway `planSpawn` probe (stub client with one skill, deleted after) across ordinary / closed-allowed / closed-proxied / closed-denied / ordinary-denied: old code gave `ToolSearch,Read,Bash,PowerShell` + plugin-dir + note for closed-allowed; new code gives `ToolSearch,Read,Skill,Bash,PowerShell,Monitor,TaskStop`, and no plugin-dir or note whenever `Skill` is off. `bun run typecheck` clean. `bun test test/provider/claude-code test/session/llm`: 11 failures, the identical set to the baseline run with the change stashed (real-CLI TestLLMServer, steering, `commandPermissions` ENOENT, `describeSpawnCwd`); no new failures.
- ERROR: those 11 pre-existing failures in `test/provider/claude-code` were not investigated this session.
- Open (plan's out-of-scope): agent-level pattern limits (built-in `plan` agent's `edit` limited to plan files) are not enforced on Claude's native Edit/Write on ordinary turns; `commandToolPlan` counts only command rules. Needs a test-backed decision.

### User
Claude Code
- Skills now load in commands that limit tools, such as `/spit`, instead of failing with "Skill isn't available".
- An agent or command that denies skills or the shell now also turns off Claude Code's own `Skill`, `Monitor`, and `TaskStop`.
- In tool-limited commands that allow the shell, Claude can now watch and stop its background jobs.

---

## 2026-11-13 (~03:20) - v0.2.365 fairandRogen - Revive live checks on Mac and win10; server start back to 2.3 s - Claude Opus 5.5, default effort; Agent

### Agent
- Meta: Claude Opus 5.5; default effort; Agent; completed except the checks that need the window (guided with the user next). Follows v0.2.364 below; same uncommitted working tree.
- Version: 0.2.365
- Ran the live checks in `docs/dev/reviveSkipBuildPlan.md` and `docs/dev/reviveFasterPlan.md`; results tables added at the end of each. Without a restart: ran the installed `oc oc --revive-prepare <base64url {"result":...}>` by hand (skip, build, two at once, syntax error), `build.ts` with `HTTPS_PROXY=http://127.0.0.1:9` for offline.
- ERROR: since 2026-11-10 `Starting server` took 5.8 s on every install (2.3 s before; 0.4 s on skips). Cause: `warmLaunch` (`reviveHost.ts`) ran `occ --version` + `opencode --version` alongside the server start; macOS checks new executables serially (fresh `oc` first launch 2.0 s alone, 4.0-5.6 s with two others).
- Removed `warmLaunch` and its `await`; comment at the install step says why not to re-add it. Expected: server ~2.3 s, then the reopened `occ` pays its own ~1.6 s check.
- Windows check on win10 (user's choice over the win11 VM): fast-forwarded `~/Documents/GitHub/oc` to `683703c`, applied the Mac working tree from a bundle of a temp-index commit (`git restore --source=FETCH_HEAD --worktree -- .`; tree `9796721` matches the Mac), then `bun install`, `.scripts/build.ps1`, `.scripts/install.ps1 -NoBuild`. install.ps1 stopped the PC's resident server (no windows were open). The PC repo now holds the same uncommitted changes as the Mac (minus this bump and notes).
- Windows results: one compile + 43 ms copy; native `opencode.exe` titles `⦿ OpenCode`, no server; `oc.exe` hosts (launcher, serve, attach), title `■`; `oc --shutdown-all` stops oc, leaves native.
- Note: an `ssh -tt goon '& oc.exe'` launcher that gets killed ends its SSH session and Windows kills the server too, so `--shutdown-all` then fails "Unable to connect". Keep the session open (`; Start-Sleep 140`) when repeating.
- Note: sidebar migration verified on the Mac (real first launch): `~/.config/opencode/sidebar.json` has the legacy `scripts` plus `visibility`; legacy file untouched. Not yet run on win10 (only the home screen opened there).
- Verification: `opencode` typecheck clean; `test/config/revive.test.ts` 30/0 (11 skip); `docLinks.ts` clean; probes and scratch files deleted (two probe stage folders under `~/.cache/opencode/oc-revive-build/` removed).
- TODO: guided checks with the user: new install timing + build toast, syntax-error toast, `/revive <text>` chains (good and broken), native window through a revive, `/revive-single`.

### User
Revive
- Restarting after a rebuild is about 2 seconds faster again: oc no longer pre-launches `occ` and native `opencode` while the server starts, which had slowed the start from 2.3 s to 5.8 s on macOS.

Docs
- The two revive plans now record which live checks passed on the Mac and on the Windows PC and which still need you.

---

## 2026-11-13 (~02:57) - v0.2.364 entSwiss - Push commands by frontmatter flag, macOS key column, doc link check, upstream leftovers removed - Claude Opus 5.5, default effort; Agent

### Agent
- Meta: Claude Opus 5.5; default effort; Agent; completed. Follow-up to the entry below (same session and version), on the user's request to fix its TODOs, apply the FORK level suggestions, and drop dead `bgRun` config.
- Version: 0.2.364
- Added command frontmatter `pushSession` (`core/src/v1/config/command.ts`, server-side in `Command.Info` like `permission`/`toolHost`). Replaced `names.includes("agent-push")` in `SessionPrompt.command` with the first selected definition flagged `pushSession`; title is `pushTitle(directory, command)` = `<folder> - <command>:`.
- Changed `session_complete` (`sessionComplete.ts`, `session-complete.txt`): generic push wording; "titled" now needs `PUSH_SESSION_KEY` plus a `<folder> - ...:` title (no commit appended yet), instead of an exact `agent-push` title.
- Moved `tui/src/agentPushAutoDelete.ts` -> `pushAutoDelete.ts` (`createPushAutoDelete`), palette `oc.push_auto_delete` **Push session auto-delete** `/pushAutoDelete`. Kept kv key `agent_push_auto_delete` so the saved choice carries over (on for Windows).
- Changed comment examples in shipped code from `/pass /revive /agent-push` to `/test /revive /ship`. Test fixtures that only use `agent-push`/`pass` as sample names kept.
- Tests (intended change): `prompt.test.ts` push tests use `command.ship.pushSession`; `task.test.ts` uses `pushTitle` and sets `PUSH_SESSION_KEY` with the title, as the server does; `pushAutoDelete.test.ts` renamed.
- Added `src/script/docLinks.ts` and a `prePush.ps1` step: checks relative links, links to this repo or its wiki on GitHub, wiki page links, and `#anchors` in root `*.md`, `docs/` (not build notes), `.github`, and `../oc.wiki` when present. Note: Bun.Glob braces do not span path segments (`{*.md,docs/**/*.md}` matched nothing): one pattern each.
- Fixed `docs/dev/v0.3.0.md`: 12 historical source links to removed files became code text.
- Added `keybindDocs.ts` "oc (macOS)" column from `TuiKeybindPreset.mac` (`super+` shown as `cmd+`; bold only when the key differs, not for the rename); regenerated `docs/keybinds.md`.
- Removed upstream leftovers: `.github/actions/{setup-bun,setup-git-committer}` (no workflows), `.opencode/agent/{triage,duplicate-pr}.md`, `.opencode/tool/github-{triage,pr-search}.ts` (+ their `tools` block in `.opencode/opencode.jsonc`), `.opencode/command/{changelog,translate}.md`, `.opencode/glossary/`, `.opencode/env.d.ts` (only for the triage tool). Kept `.github/TEAM_MEMBERS` (read by `packages/script`) and the smoke plugin (documented in `specs/tui-plugins.md`). Fixed `rmslop.md` (diff against `main`) and `ai-deps.md` (`src/` paths). Removed `OPENCODE_OC_CONFIG` from `oc.test.ts` (test renamed: missing `oc.json` reads `{}` and writes nothing).
- Changed FORK.md levels per the user: Plugins in the sidebar and MCP connecting status low -> medium; Windows setup exe and macOS support medium -> high (counts 13/63/38/6 = 120). Shipped-vs-personal rule text no longer lists an exception.
- Changed personal config (user asked): removed `"bgRun": "allow"` from `~/.config/opencode/opencode.jsonc`, `bgRun: deny` from `~/.opencode/commands/spit.md` and `spitS.md`, the `/bgRun` sentence in `~/.config/opencode/AGENTS.md`; added `pushSession: true` to `~/.opencode/commands/agent-push.md` and `~/.claude/skills/agent-push/SKILL.md` (on this Mac they are separate files that already differ, not a symlink as the comment says).
- Docs: wiki Sessions (push commands, `/pushAutoDelete`), Agents-and-Skills (push commands), Configuration (`command.<name>.pushSession`), Keybinds (macOS column); FORK automatic names; SCRIPTS prePush row.
- Verification: `task.test.ts` 45/0; `prompt.test.ts -t push` 2/0; `pushAutoDelete.test.ts` 1/0; `oc.test.ts` 30/0; core, opencode, tui `tsgo` clean; probe: `ConfigCommand.load(~/.opencode)` gives `agent-push` `pushSession: true` with no diagnostics (deleted); `docLinks.ts` clean and a scratch file with a bad anchor and a missing file failed it (deleted); `keybindDocs.ts --check` passes.
- Risk: Windows copies of `~/.opencode/commands/agent-push.md`, `spit.md`, `spitS.md` still lack the flag / keep `bgRun`; settings sync carries commands if not excluded (`spit.md`/`spitS.md` legacy entries are excluded on this Mac).
- MISTAKE: ran `./packages/sdk/js/script/build.ts` directly (exit 126, not executable); run it with `bun`.

### User
Push commands
- A commit-and-push command you write can set `pushSession: true` in its frontmatter; oc no longer looks for a command named `agent-push`.
- The palette entry is now **Push session auto-delete** (`/pushAutoDelete`), and your saved on/off choice carries over.

Docs
- The key list now has a macOS column.
- Pre-push checks now fail on broken links or headings in the repo docs and the wiki.

Cleanup
- Removed leftover upstream GitHub tooling and translation files that oc never used.

---

## 2026-11-13 (~02:47) - v0.2.364 entSwiss - Documentation review against current code; /bgRun removed; sidebar settings moved to oc's folders - Claude Opus 5.5, default effort; Agent

### Agent
- Meta: Claude Opus 5.5; default effort; Agent; completed. Lead plus 12 Claude Opus medium sub-agents in waves spread over `.claude`/`.claude2`/`.claude3` (user rule this session: Claude-only sub-agents, few at a time). `.claude` hit its 5-hour limit mid-session; its task failed over to `.claude3`.
- Version: 0.2.364
- Applied the never-executed v0.2.320 review (`docs/dev/docReview.md`, now deleted) after re-verifying each row against current code, plus coverage of v0.2.321-0.2.363. Per-file sub-agent reports were scratch (`/tmp/ocDocCheck`, deleted).
- User decisions this session: D1 replaced: platform statement is "Windows 10/11 and macOS (Apple Silicon, newer, no installer); Linux not yet; full Windows/macOS/Linux on or before 0.3.0" (README, wiki Home/FAQ/Install, CONTRIBUTING, SCOPE "Linux support", v0.3.0.md gate item 4). D2: wiki key tables replaced by links to generated `docs/keybinds.md`. D5: finished plans deleted. D8 and D9 code done (below).
- Removed (D8) `/bgRun`: `bgRun` ask block in `opencode/src/tool/shell.ts`, `oc.bgrun` entry in `tui/src/ocCommands.tsx` and its slot in `component/command-palette.tsx` order. Background `bash` uses the normal `bash` permission only. Test `backgroundShell.test.ts` retargeted (intended change): "denied bash permission starts no background job".
- Changed (D9) sidebar storage: user settings `<Global.Path.config>/sidebar.json` (`sidebarUserPath`), per-project state unchanged (`state/sidebar/<hash>.json`), Cursor token `<Global.Path.data>/cursor-session` written with mode 0600. Project `.config/openSidebar.json` override, `projectDirectory`, `hasConfiguredScripts`, kv script-settings fallback, plugin-options stub, and legacy normalize branches removed. One `saveUserSidebarSetting(key, value)` replaces four save functions.
- Added `migrateLegacySidebar` (`settings.ts`, `TODO: remove at 0.4.0`): when `sidebar.json` is missing and `~/.config/openSidebar` exists, copies user keys (visibility from top-level `showMcp`/`showLsp`, else the project file's copied visibility) and the old token (token first, `sidebar.json` last as the done marker); when a project has no state file, imports pins/favorites/roots through the old user -> project -> kv chain. Old files are read only, never changed. `readSettings` in `sidebarTools.tsx` runs it before every load.
- Fixed `resetScriptSettings`: reset to `defaultScriptSettings()` (it re-saved the current settings).
- Moved `openSidebar.test.ts` -> `sidebarTools.test.ts` (covers the whole sidebar). Rewrote storage tests; kept one migration test (guards data loss: old files byte-identical, one-time copy, kv import, no empty state file).
- Changed `paneFixture.ts` quota fixture path to `~/.config/opencode/sidebar.json`.
- Docs: wiki (15 pages), README, SECURITY (new Settings sync section, port 4097 now = sync), CONTRIBUTING, .github templates, AGENTS.md (D4 shipped-vs-personal rule; `Database.path()`, `$installDir` macOS, `SYNTAX.<shell>.ownPane`, no `sdk-next`, migration-id hint), SCRIPTS.md (every script listed), UPSTREAM-SYNC, FORK.md (rows fixed; deleted octray, Work copies, Debug/Luna routing, Hide Plan agent, Cheap vs hard, No browser app; added Sub-agent management and stopping, Daily theme and drac variants; counts 13/61/38/8 = 120), SCOPE.md (Linux, soft revive, run --share, two v0.2.364 Retired rows), docs/dev procedures, v0.3.0.md (one turnover gate), oc-palette-entry skill, schema AGENTS, perf README.
- Removed docs: `docs/dev/{claudeAgentPortPlan,claudeApiRolloverPlan,commandDescriptionsPlan,CONTEXT,importPlan,macPerfPlan,mythosAccessPlan,nativeSplitPlan,noticesPlan,publicForkPlan,publicReadiness,revivePlan,usageSidebarMac,docReview}.md`, `docs/dev/plans/queuedEditPlan.md`, orphan `src/script/translate-ui.md`. Kept `reviveFasterPlan`/`reviveSkipBuildPlan` (live checks pending, linked from FORK Revive row), `syncPlan`, `shellBenchPlan`, `shellBenchReport` (referenced from code and scripts).
- Verification: `backgroundShell.test.ts` 13/0; `sidebarTools.test.ts` 73/0; tui and opencode `tsgo` typecheck clean; migration probe on copies of the real Mac and Windows (`goon`) `config.json` plus oc's project file: keys carried, old files' sha unchanged, probe deleted; `keybindDocs.ts --check` passes; scratch link/anchor scan of all edited repo docs and the wiki: no broken links (v0.3.0.md historical source links excepted); no em dashes; no private absolute paths.
- TODO: `agent-push` name special-cased in shipped code (session titles, `session_complete` text, auto-delete, revive chains): replace with a command frontmatter flag (old K1).
- TODO: `keybindDocs.ts` builds the oc column from `TuiKeybindPreset.oc` only; Mac cmd layout (`TuiKeybindPreset.mac`) is in no generated table (wiki Keybinds "macOS" section covers it in prose).
- TODO: link/anchor check in `prePush.ps1` (old D10); upstream CI leftovers (`.github/actions/*`, `CODEOWNERS`, `TEAM_MEMBERS`, `.opencode` triage/changelog/translate commands, `OPENCODE_OC_CONFIG` in `oc.test.ts`).
- TODO: level calls left to the user: Plugins in the sidebar and MCP connecting status low -> medium; Windows setup exe and macOS support medium -> high. testing.md "six `tick:` tests" count unverified (warmup.test.ts has 11).
- Note: personal config still names the removed switch: `~/.config/opencode/opencode.jsonc:32` `"bgRun": "allow"` (dead, harmless) and `~/.config/opencode/AGENTS.md:41`. Not edited (user's files).
- ERROR: a sub-agent edited README.md with a Python string replace instead of Edit; diff checked clean (no CR, no stray bytes).

### User
Documentation
- The README, wiki, and repo docs were checked against the current code and corrected, and finished plan files were removed.
- The docs now say oc works on Windows and on Apple Silicon Macs, with Linux and full support planned on or before 0.3.0.
- Key tables in the wiki now link to the generated key list instead of copying it.

Background shell
- The **bgRun** entry is gone from the oc menu; background commands now use the same approval as any other shell command.

Sidebar
- Sidebar settings now live in `sidebar.json` in oc's config folder, and a pasted Cursor usage token lives in oc's data folder.
- The first time a sidebar opens, oc copies your old `openSidebar` settings over and leaves the old files untouched.
- A project's own `.config/openSidebar.json` no longer overrides settings.
- **Reset global script settings** in the script settings menu now really restores the defaults.

---

## 2026-11-12 (~22:06) - v0.2.363 eloteLem - Loose ends from the last 5 oc sessions per machine - Claude Opus 5.5, medium effort; Agent

### Agent
- Meta: Claude Opus 5.5; medium effort; Agent (audit of the 5 latest oc sessions on Mac and goonstation, then the fixes the user picked); completed
- Version: 0.2.363 eloteLem
- Audit: read-only digests of `oc.db` (`bun:sqlite`, readonly) on both machines. All code from those sessions is on `origin/main`. Open items found: PC `proxyOpencodeTools` lacked `clipboard`; the 5 `oc/` skills never joined sync (PC session step 3); clipboard tool's `/pass` crashed (`error_during_execution`) and never re-ran; queued Edit/Delete for non-Claude still a TODO (v0.2.347 entry, user undecided); sidebar Keychain test.
- Fixed `tool/clipboard.ts` `clean`: text made of two or more fenced blocks lost only its outer fences (inner ones left half-open); it now unwraps only when the inner text has no fence line.
- Fixed tui `Clipboard` row click: `clipboard.write` rejection had no `.catch` (unhandled, no toast); now shows "Failed to copy to clipboard" like the file's other copy actions.
- Fixed `openSidebar.test.ts` "a Claude pool with one live account...": passes `claudeKeychain: async () => undefined`. `~/.claude` under the fake home maps to the bare Keychain service, so on macOS it read the real user's login (expired at the test's `nowMs`) and failed.
- Added `session/intake.ts` (`SessionIntake`), resolving the v0.2.347 TODO (user chose "make them work"): Edit/Delete on a QUEUED message now works on oc's own loop (non-Claude models). Every model request of a step comes from one read (`prompt.ts` loop, `MessageV2.filterCompactedEffect`); `SessionIntake.read` wraps it in a per-session `Semaphore` and records the newest id read; `classify` marks the step native after `lastUser` is picked (unset in between, so refuse); `takeBack` removes a user message only if newer than that read and the step is native, under the same lock; `end` (loop `ensuring`) clears the entry under the lock. `unsendable` in `handlers/session.ts` still asks the Claude steer sink first; with no sink it calls `takeBack`. Claude Code behavior unchanged (its steps classify non-native).
- Added kept test `httpapi-sdk.test.ts` "deletes a queued message on oc's own loop only until a step reads it": fake model held on step 1, DROP-ME deleted (true) and never sent; KEEP-A/KEEP-B read by step 2, then deleting KEEP-A (no reply of its own) is refused 409. Fails on the old route (stashed only `handlers/session.ts`), passes now.
- Updated wiki `Sessions.md` (Steering: other models), `FORK.md` steering row, `docs/dev/plans/queuedEditPlan.md` (resolved).
- goonstation oc clone: discarded its uncommitted `docs/dev/macos.md` (carried by v0.2.362), fast-forwarded to `78992d8`, clean.
- Config details in `~/buildNotes.md` (PC clipboard proxy, `oc/` skills synced, dead `.bak` exclusions dropped, `tui-mockup` macOS self-check).
- Verification: probe through the real `ClipboardTool.execute` with `writeNative` captured (one block unwrapped, two-block text kept, trailing newlines trimmed, inline triple backticks kept); probe deleted. openSidebar 79 pass with `CLAUDE_CONFIG_DIR` unset and the Keychain entry present. `tsgo --noEmit` clean in opencode and tui (rerun clean after the intake change). httpapi-sdk 19 pass, httpapi-session 22 pass, promptCacheDiagnostics 5 pass; steering 11 pass 5 fail and prompt.test 84 pass 1 fail (`cancel finalizes interrupted bash tool output ...`), all on the known macOS list in `docs/dev/testing.md`.

### User
Messages sent while the agent works
- On models other than Claude Code, Edit and Delete on a `QUEUED` message now work until the model's next call picks the message up; before, they always failed while the agent was busy.

Clipboard tool
- Asking an agent to copy two separate code blocks no longer pastes half-broken fences; a single fenced block is still copied without its backticks.
- If clicking a "Copied" row fails to copy, oc now says so instead of failing silently.

Developer tooling
- The sidebar tests no longer fail on a Mac that is signed in to Claude Code.

---

## 2026-11-12 (~20:45) - v0.2.362 songyBird - Mac clone caught up with goonstation; version collision renumbered - Claude Opus 5.5, medium effort; Agent

### Agent
- Meta: Claude Opus 5.5; medium effort; Agent (/think plan `~/.config/opencode/plans/2026-11-12-mac-win-merge.md`, user approved running all of it); completed
- Version: 0.2.362 songyBird
- Fast-forwarded Mac `main` to `f3fa1b8` (v0.2.361 jakeTimtam) around the uncommitted Mac work: stashed only `src/.version/*` + this file, `pull --ff-only`, popped. Mac had bumped to 0.2.361 loopholeDrive (collision): took origin's version, ran `bumpVersion.ps1` once, renamed the 6 Mac entries' `0.2.361 loopholeDrive` to `0.2.362 songyBird`. Mac entries sit above the jakeTimtam entry (version order, not clock order).
- Updated `docs/dev/macos.md`: took goonstation's uncommitted Mac ssh line (`ssh mac`, `id_ed25519`) verbatim; the SMB share note now says goonstation has no shares since 2026-11-12 (SSH/scp only). goonstation still has that edit uncommitted: after this push run `git checkout -- docs/dev/macos.md; git pull --ff-only` there.
- Fast-forwarded Mac `oc.wiki` to `c77772d` (Claude-Code.md); local `Sidebar.md` edit kept.
- Config (`/sync` on both, peers ok): all synced items already equal. Copied Mac `skills/oc/tui-mockup` (ask-first rule) and `plans/cloneCommands.md` to goonstation; goonstation `plans/macosSupport.md` and `agents/sub/free.md` (crouton-alpha-free gone; longcat/minimax lists, all present in Mac `oc models opencode`) to the Mac. Fixed goonstation's per-host `skills/foster/ssh` (winserver row, `/Volumes/C` note). Backups of every overwritten file in `/tmp/ocMerge/` (`winOrig/`, `*.mac.bak.md`).
- ERROR: tui `openSidebar.test.ts` "a Claude pool with one live account reads as live even when another is cached" fails on this Mac (`'cache' !== 'live'`): `readClaudeOauth` reads the real Keychain `Claude Code-credentials` (present here) because the test passes no `claudeKeychain`/`platform`, and that token is expired at the test's `nowMs`. Passes 79/79 with `CLAUDE_CONFIG_DIR` set. Not caused by the merge (neither side touched it). TODO: stub `claudeKeychain` in that test.
- ERROR: `ssh administrator@winserver` from goonstation (`BatchMode`, `ConnectTimeout=6`) hung past the timeout; stopped it and its leftover `ssh.exe` there. goonstation-to-winserver login is unverified.
- Verification: `git diff origin/main` on this file = 119 added, 0 removed lines, equal to the Mac's original block with the rename; `git status` paths same as before; `git log -1` = `f3fa1b8`. Copies byte-compared after scp; goonstation originals hashed equal to the scan before overwrite.

### User
Mac and Windows in step
- The Mac's oc clone now includes the latest Windows commit, and the Mac's unpushed work is renumbered to v0.2.362 so the two machines no longer share a version number.
- A few files that oc sync skips on purpose now match on both machines where they should (mockup skill, free model list, two plans); no UI change.

---

## 2026-11-11 (~22:43) - v0.2.362 songyBird - /cloneLocal works on macOS; /clone scripts ported to POSIX for shellbench - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (shellBenchPlan backlog item 2); completed
- Version: 0.2.362 songyBird (unchanged: no commit since the bump)
- Fixed global `~/.config/opencode/scripts/cloneProject.ps1`: `invokeRobocopy` replaced by `copyTree` (robocopy on Windows with the same flags and excludes; `rsync -a --exclude-from` with `/`-anchored ignored paths plus `index.lock` elsewhere). `/cloneLocal` failed on macOS with "robocopy is not recognized".
- Fixed `cloneHelper.ps1` `newSnapshot`: index path via `Join-Path` (was `"$GitDir\index"`, never found on macOS, so the index was never reused; Windows unchanged).
- Added `~/.config/opencode/scripts/posix/cloneHelper.sh`, `cloneProject.sh`, `openCloneTab.sh` (same args, JSON key order, messages; EXIT trap removes a half-made clone; newest live `wezterm-gui` by socket mtime). The ps1 scripts stay what `/clone` runs (`prompts/clone.md` unchanged).
- Added shellbench `clone` (scratch fixtures with `GIT_CONFIG_GLOBAL=/dev/null`; parity on JSON minus seconds, file list with types/hashes/link targets, branch, status, base and HEAD trees, `ocClone.source`, pushurl); `Case.warmup`, `Case.pathPrefix`. Updated README, ANALYSIS, plan, report, and `~/.config/opencode/plans/cloneCommands.md`.
- Results: 7/7 same, also with pwsh off PATH; Local git 651 vs 142 ms, Remote 828 vs 177 ms, errors ~300 vs 12-36 ms.
- Verification: reproduced the robocopy failure, then the fixed ps1 cloned a scratch repo correctly (ignored paths out, symlink kept, untracked and modified files in, clean status on the clone branch, base ref). `mergeClone.ps1` brought a clone's edit and new file back into the source after the helper change. Full `clone` and `clone --no-pwsh` runs: no parity flags; temp folders removed.

### User
Clone commands
- `/cloneLocal` now works on macOS; before, it failed because it relied on a Windows-only copy tool.

---

## 2026-11-11 (~22:13) - v0.2.362 songyBird - Sidebar WezTerm scripts work on macOS in pwsh and zsh panes - Claude Opus 5.5, low effort; Go

### Agent
- Meta: Claude Opus 5.5; low effort; Go (shellBenchPlan backlog item 1); completed
- Version: 0.2.362 songyBird (unchanged: no commit since the bump)
- Fixed `weztermExecutable` in `tui/src/routes/session/sidebar-tools/scriptRunner.ts`: maps `wezterm-gui` to `wezterm` on every OS (was win32 only). WezTerm sets `WEZTERM_EXECUTABLE` to the GUI binary, whose `cli` exits 2 on macOS, so sidebar WezTerm script runs always failed on the Mac ("WezTerm exited with code 2").
- Added `preparePane` (non-win32): reads the pane's tty from `wezterm cli list --format json`, waits until `stty -a` (stdin = the tty) shows `-icanon` for 4 polls in a row (pwsh flips it off ~25 ms, back on ~35 ms, then off at the prompt; an Enter typed earlier is lost), up to 5 s, then picks syntax from the tty's session leader (`ps -o stat=,comm= -t`). Windows and uninspectable panes keep pwsh syntax.
- Added `SYNTAX` table: pwsh (`$env:SCRIPT_OWN_PANE='1'; `, `''` quoting) and posix (`export SCRIPT_OWN_PANE=1; `, `'\''` quoting). `scriptCommand` and `weztermSendArgs` take an optional syntax, default pwsh (clipboard, paste, and Windows Terminal unchanged).
- Added the macOS case to openSidebar test "uses the WezTerm CLI executable when WezTerm provides the GUI executable" (fails on the old code: confirmed by running it with the change stashed).
- Updated wiki `Sidebar.md` (default shell, prompt wait) and the plan's backlog.
- Verification: live probes through the real `runScript` (kind wezterm, `.sh` script in a folder named `it's here`): 8/8 pwsh panes and 3/3 zsh panes (zsh via a `WEZTERM_EXECUTABLE` wrapper adding `-- /bin/zsh`) ran with `SCRIPT_OWN_PANE=1`; before the 4-poll hold 1 of 5 pwsh runs lost its Enter. POSIX `closeOut` closed both a pwsh and a zsh pane. openSidebar 79 pass; tui `tsgo` clean. Probe folder and panes removed.

### User
Sidebar scripts
- On macOS, scripts set to open in a WezTerm tab, window, or split now start; before, they failed with "WezTerm exited with code 2".
- Scripts work whether WezTerm's default shell is PowerShell or zsh: oc waits for the new pane's prompt and types the command for that shell.

---

## 2026-11-11 (~21:55) - v0.2.362 songyBird - shellbench Test 1b run and final report - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (user asked to run all remaining tests without asking, then write up); completed
- Version: 0.2.362 songyBird (unchanged: no commit since the bump)
- Ran Test 1b (user-authorized model spend): 4 `opencode run` runs, GPT-6 Luna medium, shell set per run by `OPENCODE_CONFIG_CONTENT`; log confirms pwsh, pwsh, zsh, zsh. All same correct answer, 1 shell call each, 0 syntax errors, 11-14 s, 40-42k tokens.
- ERROR: first attempt hung 10 min: `opencode run` reads a non-TTY stdin until EOF (`cli/cmd/run.ts` `Bun.stdin.text()`), and the background shell's stdin stayed open. Killed both runs, deleted the empty logs; `modelCommands` now appends `< /dev/null`.
- Added `docs/dev/shellBenchReport.md` (summary, changes, all test tables, findings, recommendations); plan status and Results updated.
- Verification: `model --read` table and per-run tool calls read from the JSON logs; shell per run checked in `opencode.log`; no `opencode run` processes left.

### User
Developer tooling
- The pwsh vs Mac shell comparison is finished; `docs/dev/shellBenchReport.md` has the results and recommendations. No UI change.

---

## 2026-11-11 (~21:26) - v0.2.362 songyBird - shellbench Test 3: POSIX test runner port and results - Claude Opus 5.5, medium effort; Implementation

### Agent
- Meta: Claude Opus 5.5; medium effort; Implementation (shellBenchPlan Test 3, after the user's `/revive`); completed, Test 1b still waits on the user
- Version: 0.2.362 songyBird (unchanged: no commit since the bump)
- Verified the revive: `opencode.log` shows `shell tool using shell` `/usr/local/bin/pwsh` before and `/bin/zsh` after 02:19Z.
- Added `.scripts/posix/test.sh`: single-package path of `test.ps1` with the same flag names (`-Package`, `-File`, `-Name`, `-DryRun`), same messages, lexical `-File` resolution in awk (`GetFullPath` semantics), env vars set for bun only, provider packages refused. Added POSIX `closeOut` (kill the sidebar-made pane) to `.scripts/posix/scriptHelper.sh`; marked `.scripts/posix/*.sh` executable.
- Added shellbench `test` cases (fast and slower file with bare `bun test` as arm C, name filter, dry run, failing run, three input errors); `Case.runs` per-case run count; shared `plain()` message cleanup (also used by `bump`); `render` handles cases with different arms; runs clear `SCRIPT_OWN_PANE`.
- Results: 8/8 same, also with pwsh off PATH; wrapper overhead over bare bun ~270 ms pwsh vs ~10 ms sh. Overall table for Tests 1-3 in `.scripts/shellbench/ANALYSIS.md`; plan status and Results updated.
- Known failure, already listed in `docs/dev/testing.md`: core `launchDetached.test.ts` 0 pass 2 fail on macOS (it is the Test 1b task's file, so 1b answers report it).
- MISTAKE: appended the Test 3 section of `ANALYSIS.md` with a shell heredoc instead of Edit. Content checked intact (no CR, no mangled text). Rule: project files only through Edit/Write.
- Verification: `test.sh` probed by hand (usage, dry runs incl. `..` and absolute `-File`, outside/missing file, unknown and provider package, missing flag value, failing and passing runs); the pwsh `-DryRun` line printed identical text. Full `test` run n=10 and `--no-pwsh`: no parity or stability flags. `bump` rerun after the `plain()` refactor: 7/7 same. No `shellbench-*` temp folders left.

### User
Developer tooling
- `.scripts/posix/test.sh -Package <name> -File <test>` runs one package's tests like `test.ps1` does, with the same messages, and adds about 10 ms instead of about 270 ms.
- The PowerShell scripts are still the ones to use; the plain-shell copies exist to compare the two.

---

## 2026-11-11 (~18:24) - v0.2.362 songyBird - pwsh agent commands skip the profile, Mac agent shell is zsh, bumpVersion POSIX port - Claude Opus 5.5, medium effort; Implementation

### Agent
- Meta: Claude Opus 5.5; medium effort; Implementation (user picked all four Test 1 options in `docs/dev/shellBenchPlan.md`); completed, Test 1b waits on the user
- Version: 0.2.362 songyBird (unchanged: already bumped this session)
- Fixed `cmd()` in `packages/opencode/src/tool/shell.ts`: pwsh always gets `-NoLogo -NoProfile -NonInteractive -Command` (was win32 only; darwin ran `pwsh -c` through the `shell` option and loaded the user profile). `detached` stays `process.platform !== "win32"` so POSIX process-group kill still works.
- Changed shared `~/.config/opencode/opencode.jsonc`: removed `"shell": "pwsh"` (comment in its place), so each machine uses `$SHELL`: Mac `/bin/zsh`; Windows `SHELL` is `pwsh.exe` and has no zsh (checked over ssh), so Windows stays on pwsh. Shared `~/.config/opencode/AGENTS.md` Environment and Mac `principles.md` now say pwsh on Windows, zsh on macOS; `.ps1` scripts via `pwsh -NoProfile -File`.
- Claude Code under oc already used zsh on the Mac: its own Bash tool uses `$SHELL`; oc sets `CLAUDE_CODE_USE_POWERSHELL_TOOL=1` only on win32 (`provider/claude-code/spawnEnv.ts`).
- Added `.scripts/posix/bumpVersion.sh` + `scriptHelper.sh` (POSIX sh, stock macOS `jq`/`awk`/`od`, `LC_ALL=C`), side by side with the ps1, which stays the source of truth.
- Added shellbench `bump` test (throwaway repo copies; `reset` before each run; `check` compares version/tag files, BOM, LF, and the error message with pwsh's error gutter stripped) and `model` (prints `opencode run` commands for Test 1b with `OPENCODE_CONFIG_CONTENT` setting the shell per run; `--read` summarizes the JSON logs). `.gitignore` now ignores `.scripts/shellbench/shellbench-*`.
- Results: bump 631 ms pwsh vs 138 ms sh (sh mostly `jq` on the 44,356-word list); 7/7 cases same, also with pwsh off PATH. Recorded in `.scripts/shellbench/ANALYSIS.md` and the plan's Results.
- Deviation: Test 1b runs in the real repo (read-only task) with the shell set by env, not a scratch `/clone`.
- Verification: probe test through the real ShellTool with SHELL=pwsh and `XDG_CONFIG_HOME` unset (the test preload sets it, which hides the profile): `PROFILE LOADED` before, `NO PROFILE` after, `bun` resolves the same; probe deleted. Shell tool suites (`shell`, `backgroundShell`, `shellMetadata`): zsh 44 pass 0 fail; pwsh 44 pass 2 fail, and both failures (`captures stderr in output`, `reports a command killed by an external signal`) fail the same way with the change reverted (POSIX-only commands in a non-win32 block), so not regressions. Config parses with opencode's JSONC rules (trailing commas allowed) and resolves the agent shell to `/bin/zsh`. Printed Test 1b command parses in zsh into the intended argv; `--read` checked against a synthetic log (deleted).

### User
Agent shell on macOS
- oc's agents now run their commands in zsh, the Mac's own shell, instead of PowerShell; on Windows they still use PowerShell.
- When an agent does run PowerShell commands, oc no longer loads your PowerShell profile for each one, which makes each command about 0.15 s faster and stops profile functions (such as a custom `kill`) from changing what commands do.
- Restart oc (`/revive`) to pick up both changes.

Developer tooling
- `.scripts/posix/bumpVersion.sh` is a plain-shell version of `bumpVersion.ps1` for comparison; it gives identical results about 4x faster. The PowerShell scripts are still the ones to use.

---

## 2026-11-11 (~18:12) - v0.2.362 songyBird - shellbench: pwsh vs zsh timing harness and agent shell results - Claude Opus 5.5, medium effort; Implementation

### Agent
- Meta: Claude Opus 5.5; medium effort; Implementation (/imp of `docs/dev/shellBenchPlan.md`, Chunk 0 + Test 1); completed, Test 1 decision pending with the user
- Version: 0.2.362 songyBird
- Added `docs/dev/shellBenchPlan.md`: A/B of pwsh vs stock macOS shell on three workloads (agent shell calls, `bumpVersion`, `test.ps1 -Package -File`), side-by-side POSIX scripts in `.scripts/posix/`, one chunk per session with a decision gate.
- Added `.scripts/shellbench/` (`shellbench.ts`, `README.md`, `ANALYSIS.md`), modeled on grepbench: `spawn` and `agent` tests, interleaved arms, median/p90/min, parity vs first arm, `--no-pwsh` (shadows PATH folders holding pwsh with link folders, fails if pwsh still resolves). Reports `shellbench-*.json`/`.md` gitignored in `.gitignore`.
- Found: on macOS the shell tool runs pwsh without `-NoProfile` (`cmd()` in `packages/opencode/src/tool/shell.ts` passes it only on win32; darwin spawns `pwsh -c` through the `shell` option), so every agent pwsh call loads the user profile (~160 ms; profile `kill` shadows `/bin/kill`). Not changed yet: waiting on the user's decision.
- Found: 2,077 of 2,105 shell calls in the Mac `oc.db` come from claude-code sessions, which use Claude Code's own zsh Bash tool; only non-Claude providers reach oc's pwsh shell tool.
- Results (median ms per agent call): A0 pwsh today 295-389, A1 pwsh -NoProfile 122-203, B zsh 4-58; 14/14 output parity on all arms, also with pwsh off PATH.
- Deviation: arms are argv only (no `reset` until Test 2); the plan's `session` row is the sum of medians; reports are per test.
- Verification: `spawn` run reproduced the plan's baseline probes (4.1 / 44.4 / 116.3 / 309.1 / 192.6 ms); `agent` and `agent --no-pwsh` runs n=10 completed with no parity or stability flags; unknown test name prints usage and exits 1; no `shellbench-nopwsh-*` temp folders left; `git status -uall` shows reports ignored.

### User
Developer tooling
- New benchmark `bun .scripts/shellbench/shellbench.ts <spawn|agent>` times oc agent commands on pwsh vs the Mac's built-in zsh. No UI change.
- On this Mac an agent command run through pwsh takes about 0.3 s, about 0.15 s without the PowerShell profile, and about 0.01 s on zsh, with identical results.
- Claude sessions already run their commands on zsh; only other models go through pwsh.

---

## 2026-11-11 (~21:18) - v0.2.361 jakeTimtam - Claude warm-up error messages, corrupt store recovery, small cleanups - Claude Opus 5.5, effort not reported; Fixup

### Agent
- Meta: Claude Opus 5.5; effort not reported; Fixup (/fixup after resetting the user's warm-up data); completed
- Version: 0.2.361 jakeTimtam (first bumped locally to 0.2.360 dancinHoooooooo, which collided with origin's 0.2.360 shaprioBenis; reconciled by fast-forward + re-bump)
- Context: user asked to reset warm-up settings; deleted `~/.local/share/opencode/claude-code/warmup.json` and `~/.local/state/opencode/claudeWarmupPresets.json` (backups in `%TEMP%`). Missing store = no schedules; TUI re-fetches on palette open, so no restart needed.
- Fixed tui `claudeWarmup.tsx` `conciseError`: typed server errors (`{ name, data: { message } }`: WarmupStoreError, WarmupScheduleError, NotFoundError) toasted "Warm-up inventory unavailable" instead of their message.
- Fixed `mergeAccount`: save response is built without clash context (`accountView` default `clashes: false`), so a saved account lost its disambiguated label; now keeps the inventory label.
- Cleaned tui: `parseTimes` limit message uses `MAX_TIMES`; `clockReset` uses `RESET_MS`, single modulo; `loadPreset` sorts once instead of in render.
- Fixed `warmup/index.ts` `tickOnce`: CLI-unavailable `skipped` counted all enabled accounts, now only due ones. Folded the three `recordAttempt` copies into a local `record(outcome, attemptedAt)` and `late()`.
- Added `claudeCodeOptions(global)` in `handlers/global.ts`; handlers and the warm-up loop shared copy-pasted options cast + cliPath fallback (3 places).
- Cleaned `warmup/store.ts`: `isRecordValue` no longer normalizes the schedule twice (readStore does) and drops the always-true `typeof key` check; `writeStoreAtomic` removes its tmp file when write/rename fails.
- Fixed stale test `httpapi-global.test.ts` (intended change, not regression): expected `path.basename` label, but `poolAccountLabel` drops the leading dot since the Claude names change; now expects `poolAccountLabel(id)`.
- Fixed corrupt warm-up store dead end (was: any bad entry or bad JSON -> GET listed no accounts, PUT threw, only fix was deleting the file by hand). `store.ts` `StoreRead` gained `unreadable` (I/O error, file never touched) vs `malformed` (bad JSON / no `accounts`). Bad entries go to `WarmupFile.invalid` (raw), skipped by the scheduler, written back unchanged by `writeStoreAtomic`; saving that account drops it. `setAccountSchedule` on `malformed` renames the file to `badStoreFile()` (`warmup.json.bad`) and starts fresh. Added `storeProblem(read, file)` for the user message; `claudeWarmup` handler now lists accounts with that error instead of returning none. `tickOnce` treats any non-ok read as stop + warn.
- Changed test `warmup.test.ts` store contract (intended): was "reject malformed, never reset"; now bad entry skipped but kept, corrupt file untouched by reads and replaced only by a save with a `.bad` copy. `httpapi-global` 500 test now uses a directory at the store path (real I/O failure) instead of `not json`.
- Updated wiki `Claude-Code.md`: "If the schedule file is damaged" section; palette example labels `claude1`/`claude2` (dot dropped).
- MISTAKE: started the session without fetching origin; another machine had pushed 0.2.360, so the local bump reused the number. Rule: `git fetch` and check `main...origin/main` before bumping.
- Verification: `tsgo --noEmit` 0 errors in opencode and tui. opencode warmup, warmupFakeModel, httpapi-warmup-listener, httpapi-global 58 pass (1 stale-label fail before the test fix). tui claudeWarmup + claudeWarmupRendered 28 pass. Probes (deleted): fake client returning `WarmupStoreError` yields its message; merged label kept; `clockReset` wrap unchanged; real handler: corrupt file -> GET 1 account + `.bad` message, PUT 200 with `.bad` holding old bytes, GET clean after, one bad entry -> GET names `.claude9` while the good account stays enabled. Not run: live TUI dialog.

### User
Claude warm-up
- Save errors in the warm-up dialog now show the real reason instead of "Warm-up inventory unavailable".
- Saving a schedule no longer shortens an account's name in the palette when two accounts share a folder name.
- A damaged warm-up schedule file no longer hides every account: one bad entry only affects that account, and if the whole file is unreadable, saving a schedule starts a new one and keeps the old file as `warmup.json.bad`.

---

## 2026-11-11 (~01:37) - v0.2.360 shaprioBenis - Sync exclusions both ways, permanent deletes, all-or-nothing writes - Claude Opus 5.5, medium effort; Implementation

### Agent
- Meta: Claude Opus 5.5; medium effort; Implementation (/imp of the four-item plan from the pass); completed
- Version: 0.2.360 shaprioBenis (unchanged: already bumped since the last commit)
- Changed core `OcSync.manifest`/`items`: filter out ids this machine excludes (`OcItems.excluded` with state tags), so an excluded item is neither pulled nor offered; a missing entry is "nothing to do" on the puller, never a delete.
- Removed `_TOMBSTONE_DAYS`: `rescan` keeps tombstones forever, so an old copy from a long-offline peer loses to the delete.
- Changed core `OcItems.apply` to all or nothing: backup (now inside the try), stage every write as `<real>.tmp-<pid>`, then rename/rm each with `retryBusy` (EPERM/EBUSY/EACCES, 5 x 100 ms). On failure: remove temps, `restore` only the targets already changed, delete the backup folder, rethrow. `undo` shares the new `restore` helper (also uses `retryBusy`).
- Added `.bak`, `.bak-<stamp>`, `.orig`, `*~` to `_SKIP_NAME`.
- Updated wiki `Configuration.md` (exclusion both ways, permanent deletes, all-or-nothing, skipped backup copies) and `docs/dev/syncPlan.md`.
- MISTAKE: removed the five `.bak` ids from both machines' `sync.exclude` while both still ran builds without the `.bak` skip; within one tick the Mac pulled the PC's five `.bak` files. Fixed: re-added the five ids on both machines (31 excludes each), deleted the five Mac copies (sync backup record showed `existed: false` for all) and that backup folder; PC copies confirmed present. Rule: change exclusions only after the build that makes them unnecessary runs on every machine.
- Deviation: no new kept tests. Core tests run against the real `Global.Path` config (preload sets no temp home), and the rollback check relies on macOS `chflags`; probes cover both.
- Verification: probes (separate processes, temp homes): A's excluded skill absent from A's manifest and refused by `items`, B never receives it even after A edits it; B's tombstone set 100 days old still beats A's 200-day-old copy; staging failure (read-only folder) and placement failure (immutable target, after one file was placed) both leave original content, no temp files, no backup folder, and report the error; the next apply succeeds with one backup; `.bak`/`.bak-<stamp>`/`~` files are not collected. Core `tsgo` 0 errors; ocItems/ocSync tests 11 pass. Probes deleted.

### User
Settings sync
- An item you exclude in Sync settings now stays on that machine: it is no longer sent to your other machines either, even when you edit it.
- Deleted items stay deleted, even when a machine that was offline for months comes back with an old copy.
- A sync change is written whole or not at all; if Windows has a file busy, oc retries briefly and otherwise puts everything back and tries again later.
- Backup copies (`.bak`, `.orig`, `~` files) are no longer synced, exported, or imported.

---

## 2026-11-11 (~01:29) - v0.2.360 shaprioBenis - Sync keeps symlinked config files linked - Claude Opus 5.5, medium effort; Pass

### Agent
- Meta: Claude Opus 5.5; medium effort; Pass (review of the v0.2.359 sync work after enabling it on Mac + goonstation); completed
- Version: 0.2.360 shaprioBenis
- Fixed core `OcItems.apply`: temp+rename at `fs.realpath(target)`, so a symlinked item file keeps its link (goonstation `~/.opencode/commands/agent-push.md` -> `~/.claude/skills/agent-push/SKILL.md` would have become a plain copy on the next synced change). `undo` copies to the real path too.
- Added `.tmp-<pid>` to `_SKIP_NAME` so an interrupted write is never collected or synced as part of an item.
- Kept (not changed): exclusion only stops pulling here, an excluded item edited here still reaches peers (documented as per machine); a tombstone expires after 90 days, so an item deleted here but kept on a peer that excludes it can come back; Windows `rename` can fail (EPERM) on a file another program holds open, leaving a partial apply that the next tick retries; `.bak` files under item folders count as items.
- Verification: probe (tmp HOME, symlinked legacy command): apply writes through the link and leaves no temp file; undo restores old content and the link stays. Core `tsgo` 0 errors; ocItems/ocSync tests 11 pass. Probe deleted.

### User
Settings sync
- Synced or imported changes to a config file that is a shortcut (symlink) to another file now update that file instead of replacing the shortcut.

---

## 2026-11-11 (~01:07) - v0.2.359 backhandDoordasher - Settings export/import by file and tailnet sync - Claude Opus 5.5, medium effort; Implementation

### Agent
- Meta: Claude Opus 5.5; medium effort; Implementation (/imp of `~/.config/opencode/plans/2026-11-11-export-import-sync.md`); completed
- Version: 0.2.359 backhandDoordasher
- Moved core `util/ocImport.ts` -> `util/ocItems.ts` (`OcItems`): added stat-cached `collect` (`mtimes`, `unread` sources: missing root or jsonc parse errors), `toWire`/`fromWire` (`{{OC_HOME}}` token on string leaves + `redact`), `hash`, `tags` (windows/posix/localMcp), `tree`, `excluded`/`excludeNode`/`includeNode`, `compare(wireItems)`, `apply(items, { remove, backupRoot, keep })` with temp+rename writes and `assertSafe` (path must stay in root, no machine oc.json keys), `undo(dir?)`. `_MACHINE_OC_KEYS` gained `sync`.
- Added core `util/ocPack.ts` (`.ocpack` = `Bun.Archive` gzip tar, `manifest.json` + `files/<root>/<path>`, unpack in memory) and `util/ocSync.ts` (settings, state.json with `hash`/`local`/`at`/`base`/`deleted`, locked scan with 2 s reuse, tombstones 90 days skipped for unread sources, manifest + ETag, `items`, `decide`, `pull` (re-decides under lock on a fresh scan, removes stale skill files), status.json, Tailscale helpers moved from import).
- Moved opencode `server/importPeer.ts` -> `server/syncPeer.ts`: 20 s loop, listener on Tailscale IPv4:4097 (GET manifest, POST items, same-UserID 403 check kept), peer backoff 5 min, reload via `disposeAllInstancesAndEmitGlobalDisposed` only when no `session.status` busy is open (GlobalBus). `serve.ts` starts `SyncPeer`.
- Removed `allowImport` (OcConfig keys/check, tui `readOcConfig`/`persistOcConfig`, palette `oc.allow_import`); added `OcConfig.Settings.sync` and tui `persistOcSync` (jsonc modify of oc.json).
- Added tui `component/itemTree.ts`, rewrote `dialog-import.tsx` (file prompt with quote/escape/`~` cleanup, tree picker, `DialogExport`, `undoImport`), added `dialog-sync.tsx` (toggle, peers, overwritten-edit restore, exclude tree). Palette `oc.sync` (`/sync`), `oc.import`, `oc.export` (`/exportSettings`: `/export` is the session transcript); `_COMMAND_RANK` updated.
- Fixed `includeNode` (found by probe): re-including a leaf under an excluded category re-included its whole branch; now siblings are excluded at every level below the exploded ancestor.
- Added `docs/dev/syncPlan.md`; marked `importPlan.md` superseded; FORK.md row replaced (count unchanged); wiki `Configuration.md` new "Moving settings between machines" section and `sync.*` rows.
- Kept tests: `core/test/util/ocItems.test.ts` (renamed; + exclude-tree bug and key-prefix cases), new `ocSync.test.ts` (decide rules).
- Verification: core/opencode/tui `tsgo --noEmit` 0 errors; kept tests 11 pass; tui findPaletteEntry/commandPalette/slashMenuLayout/slash 16 pass. Probe: two fake machines as separate processes over 127.0.0.1:4097 (8 steps: path rewrite, secret kept, binary, 150-char name, prefix exclude, no echo back, delete propagation + backup, edit back with comments, broken jsonc guard, restore, pack across homes) pass; real config 143 items, pack 16 ms/419 KB, round trip 0 diffs, cached collect 3 ms. Probes deleted. Not run: syncPeer inside a resident server on the real tailnet, the three dialogs, idle-gated reload, Windows.
- Fixed (pass): `OcSync.readStatus` returns an empty status on a damaged `status.json` instead of throwing, which would have kept `SyncPeer.start` from ever starting the loop. Rechecked core `tsgo` 0 errors, kept tests 11 pass.
- Risk: `walk` depth limit 8 still applies (deeper files are not items); tags are heuristic (extensions/paths).

### User
Moving settings between machines
- Import no longer uses Tailscale: **Export oc settings** saves picked skills, commands, agents, themes, and settings to an `.ocpack` file, and **Import oc settings** reads one back.
- New **Sync settings** (`/sync`) keeps settings the same on all your machines on the same Tailscale account, checking every 20 seconds.
- Everything syncs by default; you can leave out a whole type, folder, single item, or a Windows-only / Mac/Linux-only / local MCP tag on each machine.
- When two machines change the same item, the later change wins and the overwritten version is listed so you can restore it.
- **Allow import from this machine** is gone.

---

## 2026-11-11 (~00:39) - v0.2.358 yoursPercs - New session picker highlights current project again - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (/spit then /imp); completed
- Version: 0.2.358 yoursPercs
- Fixed tui `ocNewSession.ts` `listHomeDirs`: resolves `homeDir` with `fs.realpathSync.native` before listing, so `fullPath` uses on-disk casing. Cause: oc.json `homeDir` `/Users/Foster/...` vs session dir `/Users/foster/...`; `FSUtil.contains` (`path.relative`) is case-sensitive on darwin, so `current` in `ocCommands.tsx` newSession never matched.
- Kept `FSUtil.contains` unchanged (shared core path checks).
- Verification: throwaway probe in tui `test/tmp/verify`: `listHomeDirs("/Users/Foster/Documents/GitHub")` returns `oc` with lowercase fullPath and `contains` matches the session dir; missing homeDir returns []. Probe deleted. Live cmd+n not checked (needs /revive).

### User
New session
- The New oc session list (cmd+n) starts on the project you are in again, even when the home folder setting is spelled with different capital letters than the real folder.

---

## 2026-11-11 (~00:16) - v0.2.357 wallabySpasm - Import config from another oc over Tailscale - Claude Opus 5.5, medium effort; Implementation

### Agent
- Meta: Claude Opus 5.5; medium effort; Implementation (/imp of `docs/dev/importPlan.md` phases 1-3); completed
- Version: 0.2.357 wallabySpasm
- Added core `util/ocImport.ts`: `collect` (config + `~/.opencode` roots; skills per SKILL.md folder, commands/agents `.md`, themes `.json`, prompts, root `.md`, code dirs; opencode.jsonc keys split for agent/command/mcp/provider; tui.json keys; oc.json minus `_MACHINE_OC_KEYS`), `bundle` (redacted, 20 MB cap, 2 MB per file), `scan`/`tailscaleStatus`/`fetchBundle`, `compare` (rewrite + `restoreRedacted` before hashing), `apply` (backup to `state/import/<ts>`, keep 10, jsonc `modify`), `undo`.
- Added opencode `server/importPeer.ts`: Bun.serve on Tailscale IPv4:4097, GET `/oc-import/hello|bundle`, 403 unless caller IP is a same-`UserID` peer (status cached 30 s); follows oc.json `allowImport` via `fs.watch(Global.Path.config)`. Started from `cli/cmd/serve.ts` for the resident server only.
- Added `allowImport` to `OcConfig.keys` (boolean check) and `readOcConfig`/`persistOcConfig` in tui `ocSettings.ts`.
- Added tui `component/dialog-import.tsx` (peer list, ctrl+r rescan; picker with enter toggle, ctrl+a/ctrl+u/ctrl+s, confirm listing code and missing paths; `global.dispose` after apply/undo; toast Undo action) and palette entries `oc.import` (`/import`), `oc.allow_import` (`/allowImport`), `oc.import_undo` in Tools; ranked in `_COMMAND_RANK`.
- Kept `core/test/util/ocImport.test.ts`: redaction, restore, and the home-prefix boundary (guards a real bug the probe found).
- Deviations from plan (recorded in importPlan.md Status): one bundle route instead of manifest/bundle + loopback routes; items keep their root; no diff view.
- Updated FORK.md (new medium row, counts 121) and wiki `Configuration.md` (`allowImport` row, Importing section).
- Verification: core/opencode/tui `tsgo --noEmit` exit 0. Probe with two fake machines (Windows home -> Mac): redaction, rewrite, missing paths, comment-kept merge, re-compare empty, undo restore. Live listener probe from goonstation over ssh: own IP 403, peer hello 200, bundle served, POST 405, allowImport false -> refused, true -> 200 without restart. Real config collect: 143 items, 1.27 MB. tui findPaletteEntry, commandPalette, slash tests pass. Not run: scan/import between two installed builds, the dialog UI, Windows serving side.
- MISTAKE: first listener probe used `Bun.spawnSync` for ssh in the same process as the server, blocking its event loop and looking like a hang. Use async spawn when a probe calls back into its own server.
- ERROR: `rewriteHome` matched `C:\Users\FosterX` as `C:\Users\Foster`; fixed with a `(?![\w.-])` boundary.

### User
Import from another oc (beta)
- New palette entry **Import from another oc** (`/import`) finds oc on your other Tailscale machines and lets you pick which skills, commands, agents, themes, and settings to copy.
- New palette toggle **Allow import from this machine** makes this machine available to your own Tailscale account only; it is off by default.
- Paths under the other machine's home folder are rewritten to yours, and API keys, sign-ins, and machine-only settings are never copied.
- Every import is backed up first; **Undo last import** (or the toast's Undo) restores it.

---

## 2026-11-10 (~23:53) - v0.2.356 smoteRiddle - Clipboard tool copies on the server and reports failures - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (follow-up to the entry below, same session, no extra bump); completed
- Version: 0.2.356 smoteRiddle
- MISTAKE: first version copied only in the TUI viewing the session, so headless runs or another open session copied nothing while the model was told it copied. Rule: a tool that claims a side effect must perform it and report the real result.
- Moved `copyCommand` + native write from `tui/src/clipboard.ts` to new `core/src/util/clipboard.ts` (`writeNative`, throws with stderr / "no clipboard command found"). TUI `write` = OSC 52 + `writeNative`, clipboardy on failure; exported `writeOsc52`. `tui/test/clipboard.test.ts` imports `copyCommand` from core (moved, same assertions).
- Changed `tool/clipboard.ts`: copies via `writeNative`, failure fails the call; strips a whole-text code fence and trailing newlines (`clean`); returns cleaned text in `metadata.text`.
- Changed TUI listener: OSC 52 (`writeOsc52`) + toast only, from `metadata.text`; row preview/click use `metadata.text`.
- Verification: tsgo core/tui/opencode exit 0; `tui/test/clipboard.test.ts` 10 pass. Probes (deleted, folder confirmed gone): tool with no TUI copied fenced input to `pbpaste` as cleaned text, `"echo hi\n\n"` -> `echo hi`; `writeNative` with empty PATH -> "no clipboard command found"; `OC_TUI_PANE=1` Claude Code proxy run: row, toast, auto copy, click re-copy all matched. User clipboard restored. Windows not checked.

### User
Agents
- The clipboard tool now copies even when no oc window is showing the session, and the agent is told if the copy failed.
- A code fence around the copied text and trailing newlines are removed, so a pasted command does not run on its own.

---

## 2026-11-10 (~23:49) - v0.2.356 smoteRiddle - Agents can put text on your clipboard - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (/spit -> /think -> /imp); completed
- Version: 0.2.356 smoteRiddle
- Added `opencode/src/tool/clipboard.ts` `ClipboardTool` (`clipboard`, param `text`): rejects empty and >64 KB (OSC 52 limit), `ctx.ask` permission `clipboard` (default allow via `"*"`; no config schema change, `StructWithRest`), no I/O. Registered in `tool/registry.ts` next to `sessionRename`.
- Added TUI copy in `tui/src/routes/session/index.tsx` Session `message.part.updated` listener (same spot as `plan_exit`): route session only, skips `time.compacted`, `time.end` older than 15 s, and repeat part ids (`copied` Set); `clipboard.write` + toast. Copy lives in the TUI because the resident server has no terminal (no OSC 52) and may be remote.
- Added `Clipboard` renderer (`⧉ Copied <first line> (+N lines)`, click copies again) in `toolDisplays`/`ToolPart`; exempt from `shouldHide` so it shows with tool details off.
- Added `clipboard` to user `~/.config/opencode/opencode.jsonc` `proxyOpencodeTools` (Mac only; that file is not mirrored). FORK.md row (high, counts 62/120); wiki `Agents-and-Skills.md` bullet.
- Kept: no server-side copy fallback; headless/other-session runs copy nothing while the model is told it copied.
- Verification: tsgo typecheck tui + opencode exit 0. Probes (deleted, `Test-Path` equivalent confirmed): tool execute (output, ask call, empty/64 KB errors); registry lists it, default allow, `deny` hides, `ask` asks; `OC_TUI_PANE=1` pane run through Claude Code proxy (`proxyOpencodeTools: ["clipboard"]` in a scratch fixture copy): row + toast shown, real `pbpaste` matched multiline Unicode/quote/backslash text, click re-copied after clipboard was overwritten; user clipboard restored. Not probed: reopen-session no-recopy (guarded by design), Windows.

### User
Agents
- Agents can now put text on your clipboard when you ask them to copy something, instead of telling you to copy it yourself.
- The copy happens the moment the agent's call finishes and shows a "Copied to clipboard" notice.
- A "⧉ Copied ..." line stays in the chat; click it to copy the text again.
- Set the `clipboard` permission to `ask` or `deny` to confirm or block it.

---

## 2026-11-10 (~17:43) - v0.2.355 timberlakeSegways - Plan lines read Renews; usage values share one column - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.355 timberlakeSegways
- Changed `usagePlanLine` (`usage/plans.ts`): text leads with the verb only (`Renews ~11/16 (6d)`), no plan name. `usagePlanLabel` (calendar) unchanged.
- Added `lead` to `formatUsageRows` (`usage/format.ts`): each row reports its first value column (wrapped continuation rows report 0); `usageColumns` returns the max; position 0 start honors `lead - offset`. Fixes varied pooled-name label widths and clockless `-` first resets (value sat right after the label). `formatClaudeUsageRows` takes `lead` as a new last param; `sidebarUsage.tsx` passes `shared?.lead` to both.
- Kept `Codex :` label as is.
- Rerolled tag: first roll was an offensive word.
- Updated wiki `Sidebar.md` example to `Renews ~11/14 (18d)`.
- Verification: probe of the screenshot's pool (Pro, Team1, idle Team2, Codex) with shared columns put every first value at col 10 and the `-` under it; weekly values share col 19. `usageFreshness` + `usageLive` 39 pass; tui `tsc --noEmit` clean. Not checked live.

### User
Sidebar
- Plan lines now read just `Renews ~11/16 (6d)` instead of `Pro renews` or `Team renews`.
- Usage percentages line up in one column across accounts and providers, including an idle Claude account whose hour window shows `-`.

---

## 2026-11-10 (~17:37) - v0.2.354 darknessGibbons - Sidebar plan lines stop warning early; Claude rows use account names - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.354 darknessGibbons
- Changed `usagePlanLine` (`tui/.../usage/plans.ts`): `urgent` only when `verb === "ended"`; dropped the `days <= 3` warning.
- Changed `formatClaudeUsageRows` (`tui/.../usage/format.ts`): pooled row label is the account `name` (`claudeAccountName`, same rule as server `poolAccountLabel`: palette name, else `claude1`/dir basename) instead of positional `Claude`/`ClaudeN`. Single unpooled snapshot keeps `Claude`.
- Updated tests `usageFreshness.test.ts`, `usageLive.test.ts`: intended label change; fixtures now name accounts `claude1..3`.
- Updated wiki `Sidebar.md`: renewal line yellow only once ended; Claude rows labeled with palette account name.
- Verification: `bun test test/cli/tui/usageFreshness.test.ts test/cli/tui/usageLive.test.ts` 39 pass; tui `tsc --noEmit` clean. Not checked live in the TUI.
- MISTAKE: edited a test file through a shell Bun script with broad `replaceAll`; it hit an unrelated non-pooled test, fixed after. Use Edit per hunk.

### User
Sidebar
- Plan renewal lines no longer turn yellow when the renewal is near; they only turn yellow once a plan has ended.
- Claude usage rows now show each account's name from the oc palette's Claude accounts menu instead of Claude, Claude2, Claude3.

---

## 2026-11-10 (~16:45) - v0.2.353 chickpeasDiego - oc palette regrouped by job and ordered by use - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; /spit then /imp; completed
- Version: 0.2.353 chickpeasDiego
- Added `_GROUP_RANK`, `_COMMAND_RANK`, `compareGroups` in `tui/src/component/command-palette.tsx`: oc groups and commands sort by fixed rank, then A-Z; ungrouped still lead a category; user `command_palette.order` still beats the built-in rank. Unlisted names (per-account warm-ups, `oc.update_<id>`) go last in their group A-Z.
- Changed oc `group` values: Session, Claude, Subagents, Defaults, Updates, Prompt, Appearance, Sidebar, Folders, Server and processes, Tools, About (`ocCommands.tsx`, `claudeCommands.tsx`, `claudeWarmup.tsx`, `sidebarTools.tsx`, `savedImages.ts`). Removed Beta, Layout, Links, Processes, Server, Third party harness management, Third party updates, Tools (experimental). No visible oc command is ungrouped now.
- Updated tests for the renamed headings (intended change): `claudeWarmup.test.ts`, `claudeWarmupRendered.test.tsx`, `usagePalette.test.ts`, `tuiPane.test.ts` (warm-up pane test waits for the filtered row; Home sort order now under Folders).
- Updated `FORK.md`, wiki `Claude-Code.md`/`Sidebar.md`, `.opencode/skills/oc-palette-entry/SKILL.md` (new entries pick a group and a `_COMMAND_RANK` slot). Plan: `~/.config/opencode/plans/ocPaletteOrder.md`, mockup `plans/mockups/ocPaletteOrder.html`.
- Kept Auto confirm updates unranked, so it sits after Update model list (A-Z before the per-app updates), not last as the plan listed.
- Verification: probe ran `orderPaletteEntries` on names/groups parsed from the real sources: group sequence and in-group order match the plan; user order still wins; probe deleted. `bun test` commandPalette, claudeWarmup, claudeWarmupRendered, usagePalette: 32 pass. `tsgo --noEmit` in tui clean. `tuiPane.test.ts` (OC_TUI_PANE live) not run.

### User
Command palette
- The oc commands palette (cmd+o) is grouped by job: Session, Claude, Subagents, Defaults, Updates, Prompt, Appearance, Sidebar, Folders, Server and processes, Tools, About.
- Groups and the commands inside them are ordered by how often they are used, not alphabetically.

---

## 2026-11-10 (~16:07) - v0.2.352 whitneysNutz - /update refuses a source tree with uncommitted changes or unpushed commits - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.352 (same session; no second bump)
- Fixed the TODO from the recovery entry below. `core/util/ocSource.ts`: added `unsafe({ dirty, ahead })` (reason string or undefined) and `localWork`; `reset` now re-checks and throws "oc source is not clean (...)" before `git reset --hard`, so the /revive prepare helper (`reviveHost.ts` `OcSource.reset`) refuses even if the tree changed after the TUI check. `status` reuses `localWork`.
- `tui/src/reviveCommands.tsx`: `/update` shows an error toast and stops instead of the "Overwrite local oc changes?" confirm. Local commits not on main block too (reset would drop them from the branch).
- `core/test/util/ocSource.test.ts`: intended change. The old test asserted reset discards edits; now one test checks status lists edits and local commits, one checks reset refuses and keeps the edit and the local commit, one checks a clean clone behind main still updates and keeps untracked files.
- Docs: `FORK.md` Update oc row; wiki `Launching.md` Updating oc (unpushed).
- Verification: `bun test test/util/ocSource.test.ts` (core) 5 pass; `bun run typecheck` exit 0 in core and tui. Live `/update` not run.

### User
Updating oc
- `/update` now refuses to run when your oc folder has uncommitted changes or commits not on GitHub, and lists them instead of offering to overwrite them.

---

## 2026-11-10 (~16:05) - v0.2.352 whitneysNutz - Recovered uncommitted work after /update reset the repo; notice padding - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.352 (restored to the value this session's earlier entries used; see below)
- ERROR: running `/update` in a TUI whose /revive source is this repo ran `git reset --hard` to `origin/main` (v0.2.349). Every uncommitted change to tracked files was lost: the v0.2.350/351 third party updates work and this session's notice work. Untracked files (`thirdPartyUpdates.ts`, `weztermUpdate.ts`, `test/weztermUpdate.test.ts`) survived. No git objects, editor history, or checkpoints held copies. TODO: `/update` should refuse, or stash, when the source folder has uncommitted tracked changes instead of only listing them in a confirm.
- Recovered the earlier sessions by replaying their recorded file-changing tool calls (Edit, Write, and Python find-and-replace scripts) from Claude Code transcripts `90e7d55a` and `4085233a` into a scratch copy of HEAD (`/tmp/ocReplay`), then copying the results back. Check: the three surviving untracked files matched the replay byte for byte, and per-file changed-line counts matched the `git diff --stat` recorded before the reset; `harnessUpdate.ts` deleted again.
- Redid this session's notice work by hand from the transcript (final state only): `PromptNotice` above the prompt, `notices` prop on Home and session prompts, **Notice display** `prompt`/`floating`, one-line update progress rows and their test rewrite, `FORK.md` Notices row. Added one blank row of padding top and bottom inside the notice (user request).
- Restored `src/.version/version` 0.2.352 and `versionTag` mondaySalamanders by writing the values back (they were set by `bumpVersion.ps1` earlier this session; not a new bump).
- Kept a copy of the 0.2.352 binary at `~/ocRecovery/oc-0.2.352` (minified bundle with all lost code) until the user confirms the recovery.
- Verification: after recovery `bun run typecheck` exit 0; `bun test test/updateProgress.test.ts test/cliUpdate.test.ts test/weztermUpdate.test.ts` 32 pass 0 fail; `git status` file list matches the pre-reset snapshot plus this session's files. Live TUI not run.
- MISTAKE: an agent-side summary claimed "build notes entry added" while the build notes lived only in the working tree; uncommitted work is one reset away from gone. Commit or stash before running anything that rebuilds or updates from source.

### User
Recovery
- `/update` reset your oc folder to the last commit and wiped the uncommitted work from today's third party updates sessions and the notice changes; all of it has been restored.
- Notices above the prompt now have a blank line of space at the top and bottom inside the colored box.

---

## 2026-11-10 (~15:46) - v0.2.352 whitneysNutz - Toasts moved from the sidebar to right above the prompt - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.352 (same session as the sidebar entry below; no second bump)
- Replaced the sidebar dock: user found the top and bottom of the sidebar both easy to miss while typing. Mockups `~/.config/opencode/plans/mockups/promptNotice.html` (options A/B/C) and `promptNoticeRail.html` (B iterations); user picked plain B.
- Renamed `SidebarNotice` to `PromptNotice(indent)` in `ui/toast.tsx`: `backgroundPanel`, variant left rail, title bold, message muted under a title (capped 6 rows), action and `/notices to read again` on one row, hover pause and click activate on the rail.
- Added `notices` prop on `Prompt` (`component/prompt/index.tsx`), set in `routes/home.tsx` and `routes/session/index.tsx` only (permission and plugin prompts stay out). Docks while `notices && visible && toast_display !== "floating" && dialog.stack.length === 0`; renders between `QueueStrip` and the prompt box.
- Reverted `routes/session/sidebar.tsx` to HEAD (no notice, no sidebar hover pause).
- Changed `ocCommands.tsx` **Notice display** values to `prompt` / `floating`; an older stored `sidebar` reads as `prompt`.
- Docs: `FORK.md` Notices row; wiki paragraph moved from `Sidebar.md` to `Troubleshooting.md` (unpushed).
- Verification: `bun run typecheck` exit 0; render probe (deleted) showed the rail above a prompt row, long error capped with action row visible. Live TUI not run.

### User
Notices
- Popup messages now show right above the prompt box, where you are typing, instead of in the sidebar.
- On Home and in sessions alike; while a dialog is open they still float at the top right.
- **Notice display** (`/noticeDisplay`) now offers `prompt` (default) or `floating`.

---

## 2026-11-10 (~15:35) - v0.2.352 whitneysNutz - Toasts show at the top of the sidebar - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5 (plan by Fable 5.2); low effort; Implementation; completed
- Version: 0.2.352
- Plan: `~/.config/opencode/plans/sidebarNotice.md`, mockup `plans/mockups/sidebarNotice.html` (style B "rail").
- Added `ui/toast.tsx`: `toast.dock()` (counter, returns undock) and `docked`; `Toast()` hides while docked; `SidebarNotice` renders the current toast as a left rail on `backgroundElement` (`variantColor` shared with `Toast()`), message capped at `_NOTICE_MESSAGE_ROWS = 6`, title/action/`/notices` rows always shown; `TOAST_DISPLAY_KEY = "toast_display"`.
- Added `routes/session/sidebar.tsx`: docks while kv `toast_display` is `sidebar` and `dialog.stack.length === 0` (dialog backdrop would cover it; `ToastProvider` sits above `DialogProvider`, so the sidebar decides). Notice is the first child above the scrollbox; hover pause/resume on the whole sidebar box (opentui over/out bubble, so moving between children nets out).
- Added `ocCommands.tsx`: **Notice display** (`oc.toast_display`, `/noticeDisplay`, Layout) `sidebar` / `floating`.
- Changed `updateProgress.ts`: `formatUpdateRow` returns one line (detail clipped at 80); renderer wraps. Removed `_LINE_WIDTH` / `_INDENT` pre-wrap.
- Changed `test/updateProgress.test.ts`: intended change, two wrap tests rewritten to one-line and detail-cut expectations.
- Docs: `FORK.md` Notices row; wiki `Sidebar.md` **Notice display** paragraph (unpushed).
- Verification: `bun run typecheck` exit 0; `bun test test/updateProgress.test.ts` 7 pass; throwaway render probe (deleted) showed rail + blank row, long error capped with action visible, dialog open and `floating` fall back to the floating toast. Live TUI not run.
- MISTAKE: overlapping rows on the first probe came from `maxHeight` on the whole rail (yoga shrinks text children). Cap only an inner message box with `flexShrink={0}` text.
- MISTAKE: filtered probe output with `grep -v` blank lines and misread a present margin as missing. Read layout (`y`/`height`) before "fixing" spacing.
- MISTAKE: ran Prettier by hand on `toast.tsx` and `sidebar.tsx` against AGENTS.md; only touched lines changed.

### User
Notices
- When the session sidebar is showing, popup messages now appear at the top of the sidebar with a colored bar instead of floating over it.
- Hovering the sidebar keeps the message up; clicking it still runs its action.
- With a dialog open, on Home, or with the sidebar hidden, messages float as before.
- New **Notice display** setting in the oc palette (`/noticeDisplay`) switches back to floating messages.
- Third party update progress lines no longer break early, so they wrap cleanly in the narrower sidebar.

---

## 2026-11-10 (~15:25) - v0.2.351 sealsChurning - Third party updates rebuilt around one target list; uninstalled programs hidden - Claude Fable 5.2, low effort; Implementation

### Agent
- Meta: Claude Fable 5.2; low effort; Implementation; completed, not built or run in the TUI
- Version: 0.2.351 sealsChurning
- Replaced `tui/src/harnessUpdate.ts` with `tui/src/thirdPartyUpdates.ts`. `updateTargets(claudeCliPath)` is the one per-platform list; `UpdateTarget` = `id`, `label`, `desc`, `installed()`, `check()` -> result or `PendingUpdate { versions?, confirm?, install }`. Builders: `cliTarget` (self-updating CLIs, no confirm) and `checkedTarget` (check/install pairs). Removed the separate CLI tuple list, `DesktopHarness`, `POWERSHELL`/`POWERSHELL_MAC`/`WEZTERM` exports, and the three hand-kept platform lists.
- Added detection: `detectInstalled` runs every `installed()` in parallel (local only: PATH, files, folders, `pkgutil`) into a Solid signal. `ocCommands.tsx` builds entries from the list (`oc.update_<id>`, same names as before) with `get hidden()`; Update all's `desc` lists the installed labels. Detection runs at `createOcCommands`, on both palette-open commands in `app.tsx` (`refreshUpdateTargets`), and at the start of `updateAll`.
- Changed statuses: `ok` split into `updated` (carries `old -> new`) and `current`; progress phases `done`/`not installed` replaced by `updated`/`up to date`; `progress.remove(label)` drops a row whose check says not installed (Appx folder outlives uninstall), which also removes its palette entry.
- Changed Update all: under auto confirm every update installs right after its own check; otherwise CLIs install at once and the rest wait for one combined confirm. A thrown check or install becomes a `failed` row instead of ending the run.
- Changed `cliUpdate.ts`: removed `runCliUpdate`; Claude Code now uses `runVersionedCliUpdate` like Cursor and Codex. `probeCliVersion` keeps the first word with a digit (`codex-cli 0.149.0` -> `0.149.0`). Messages: `Updated <label> a -> b`, `<label> is up to date (v)`. Added shared `BREW_ENV`, `runOrThrow`, `errorText` (were duplicated in `pwshUpdateMac.ts` and `weztermUpdate.ts`).
- Moved presence checks next to their updaters and reused them in `dependencies.ts`: `appxPresent`/`claudeDesktopPresent` (`desktopUpdate.ts`), `chatgptDesktopPresent`, `cursorDesktopPresent` + `CURSOR_EXE`, `powershellPresent` + `PWSH_EXE`, `weztermPresent`. `Test-GithubHost` PowerShell function is now `TEST_GITHUB_HOST` in `desktopUpdate.ts`, used by the pwsh and WezTerm scripts.
- Docs: FORK.md (progress row, Codex CLI row), wiki `Claude-Code.md`.
- Verification: `bun run typecheck` in `packages/tui` exit 0. 9 update/dependency test files: 90 pass, 9 skip, 1 fail (`dependencies.test.ts` "finds Git Bash from git's cmd folder only", a Windows-path test run on macOS; `gitBash` untouched). Edited `cliUpdate.test.ts` and `updateProgress.test.ts` for the intended message/phase changes. Live probe on the Mac: detection 80 ms, found Claude Code, PowerShell, WezTerm, hid Cursor CLI and Codex CLI; PowerShell and WezTerm checks returned up to date. Not checked: anything on Windows (the script string move, presence helpers), a real install, the palette in a rebuilt oc.
- Pass: a target whose check says "not installed" now stays hidden until restart (`_gone` set) instead of reappearing on every palette open; `attempt` overloads replaced by one generic.
- Risk: a CLI on PATH that oc cannot run (unrelated `agent`, PowerShell-only codex shim) and a Cursor Desktop in a custom folder are now hidden instead of shown with an error.
- MISTAKE: edited project files with inline `python3` scripts through the shell instead of Edit. Rule: use Edit/Write for project files, as principles.md says.

### User
Third party updates
- Update all and the palette only list programs that are on this machine; one installed later appears the next time the palette opens.
- The Update all summary now separates "Updated" (with old -> new versions) from "Up to date".
- Claude Code, Cursor CLI, and Codex CLI report the same way: the version change, or "up to date" with the version.
- With Auto confirm updates on, each update installs as soon as its check finishes.

---

## 2026-11-10 (~14:42) - v0.2.350 zoomerArrogant - Update WezTerm (nightly) in Third party updates and Update all - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation; completed
- Version: 0.2.350 zoomerArrogant
- Added `tui/src/weztermUpdate.ts` (`checkWezterm`, `installWezterm`, `WEZTERM_NOTE`): nightly only (stable is 20240203). Latest = `head_sha` of upstream's newest successful `gen_macos_continuous.yml` / `gen_windows_continuous.yml` run on `main` (those runs upload the `nightly` release; the `nightly` git tag never moves). Same build = same 8-char commit; the date in `<yyyymmdd>-<sha8>` is display only (installed date is committer local time, CI's is UTC).
- macOS: only the `wezterm@nightly` cask; deletes the `brew --cache --cask` zip (same URL nightly) then `brew reinstall --cask`. The cask has no quit step, so the WezTerm hosting oc survives.
- Windows: only `Program Files\WezTerm` (setup.exe, as the `wezterm` dependency row installs). Windows PowerShell script via `runDesktopInstall`: downloads setup.exe and its `.sha256`, verifies, then an elevated `swap.ps1` renames in-use `.exe`/`.dll` to `*.<guid>.oc-old`, runs setup with `/NOCLOSEAPPLICATIONS` (Restart Manager must not touch WezTerm; see the PowerShell MSI Ctrl+C note), restores on failure, deletes unheld `*.oc-old`.
- Added `WEZTERM` harness to `harnessUpdate.ts` (last in `desktops` on win32 and darwin) and `oc.update_wezterm` palette entry in `ocCommands.tsx`; Update all descriptions name WezTerm. FORK.md row and wiki (`Claude-Code.md`, `Configuration.md`) updated.
- Verification: `bun test test/weztermUpdate.test.ts` (new, parse/compare) and `tsc --noEmit` for tui clean; live `checkWezterm()` on Mac reported up to date (20261108-458a100c); the generated Windows script run live on win10 with `strip-ansi-escapes.exe` held open: download, sha256, elevation, rename, setup all ran; it ended with the expected "still reports" error because the build was unchanged, and left only the held file as `.oc-old`. The Mac brew reinstall path was not exercised (no newer nightly yet).

### User
Third party updates
- New **Update WezTerm** entry in `ctrl+o`, also included in **Update all**, keeps WezTerm on the latest nightly build.
- On macOS it reinstalls the Homebrew `wezterm@nightly` cask; on Windows it runs the nightly installer after a UAC prompt.
- Your open WezTerm windows, including the one oc runs in, stay open and switch to the new version the next time WezTerm starts.

---

## 2026-11-10 (~13:50) - v0.2.349 calculatedSchmeat - /update syncs the revive source to GitHub main (temporary) - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (/imp of `~/.config/opencode/plans/oc/updateFromSource.md`); completed
- Version: 0.2.349 calculatedSchmeat
- Fixed `/update`: it only toasted "update with git and /revive" on source builds and looked up GitHub releases otherwise; no releases exist. TEMPORARY until releases ship.
- Added `core/util/ocSource.ts`: `status(dir, repo)` fetches `main` by URL into FETCH_HEAD and returns branch, target sha, dirty tracked files, ahead/behind; `reset(dir, sha)` refuses non-main, then `git reset --hard`. `GIT_TERMINAL_PROMPT=0` so a hidden process never waits on auth. Raw stdout: porcelain lines start with a meaningful space.
- Changed `tui/reviveCommands.tsx` `oc.update`: needs `reviveSource`; refuses another branch; "up to date" when clean, even, and `InstallationSourceTree` matches `sourceTree(dir)`; one `DialogConfirm` for dirty files (first 5) or unpushed commits; then `revive.prepare({ update: sha })` and swap. Title "Update oc from GitHub main". Removed the release dialog and the unused `kv`.
- Added `PrepareRequest.update` (40-hex, exclusive with `release`/`source`) in `config/revive.ts`; `SOURCE_REPO` now `OcSource.REPO_URL`. `reviveHost.ts` `prepare` resets under the shared `buildLock()` before the existing build path.
- Added `reviveSource` to `tui/ocSettings.ts` `readOcConfig`.
- Kept dormant: `updateNotice`, `SKIPPED_VERSION`, `Revive.downloadRelease`, release notes on first start.
- Docs: FORK.md row renamed "Update oc (temporary: source sync)"; wiki `Launching.md` "Updating oc" and `Install.md` dev/stable bullet; `docs/dev/macos.md` replaces the rsync mirror with two git clones synced through GitHub (user: both machines are dev machines now). Also updated user `~/.config/opencode/principles.md` (Mac) the same way; Windows `principles.md` not reachable (share unmounted).
- Verification: `bun test test/util/ocSource.test.ts` (core) 3 pass, new: guards the warning contract before a destructive reset; `test/config/revive.test.ts` 19 pass with new decode cases; `tsgo --noEmit` clean in core, opencode, tui. Probe: `OcSource.status` on this clone against real GitHub returned branch main, ahead/behind 0, and exactly the 5 edited tracked files. Not run: live `/update` in the TUI.
- Risk: an untracked file at a path main now tracks is overwritten by `reset --hard` without being listed. A release that ever ships still triggers the startup notice saying "Run /update", which now syncs source instead.

### User
Updating oc
- `/update` now brings your oc source folder up to the latest GitHub `main`, then rebuilds and restarts like `/revive`.
- If that folder has edits or commits not on GitHub, `/update` lists them and asks before discarding them.
- If the folder is on another branch, `/update` stops and tells you; if everything already matches, it says oc is up to date.

---

## 2026-11-10 (~04:36) - v0.2.348 choccieJiminy - Claude API credit rollover when every login is limited - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (/imp of `docs/dev/claudeApiRolloverPlan.md`); completed
- Version: 0.2.348 choccieJiminy
- Phase 0 probe (user approved, ~$0.005 real spend): `claude --print` with `ANTHROPIC_API_KEY` in an empty `CLAUDE_CONFIG_DIR` and Agent SDK `query()` both succeeded and the user confirmed the Team plan's Promotional credits dropped. So the plain CLI path (option A) draws the credit; no SDK transport or entrypoint relabel needed.
- Added `accounts.ts` "API-credit rollover": `configureApiAccount` (from `createClaudeCode`, provider option `apiAccount { apiKey, dir? }`, default `~/.claudeApi`, blank key = off), `apiAccountId`, `apiAccountKey`, `apiRolloverCandidate`, `pinApiRollover`, private `apiRolloverTurn` (first step of `turnAccount`: keeps a pinned chat on the key while all pool ids are limited, else clears the pin). The API id is never in `poolAccountIds`, so ranking, sidebar, account manager, and warm-up never see it. `applyFailoverChoice` pins per chat for the API id; `poolAccountLabel` returns `API credits`.
- Added `claudeSpawnEnv` `apiKey`, set after the configDir credential strip; `spawnClaudeProcess` passes `apiAccountKey(account)` (respawn reuses `old.account`).
- Changed `turnStream.ts`: `queueAccountSwitch` offers `[{ id: api }]` when `failoverCandidates` is empty; `pickAccount` follows oc.json `claudeApiRollover` (`off`/`always`/unset=`ask`) for it, and an agent without `question` never spends; `switchAccount` runs `createAccountDir` for the API dir so `projects` is shared and the conversation resumes; `onResult` treats `billing_error` or "credit balance too low" on the API account as exhausted (marked limited until `earliestLimitedUntil(pool)`, note, `allLimited` for auto-resume).
- Changed `failoverQuestion.ts`: a lone API candidate asks consent (`API_ROLLOVER_LABEL` / Stop). `reportSystemInit` takes `apiKeyExpected` to skip the pay-as-you-go warning on that account. `claudeCodeLanguageModel` keeps a working API process (`keepWorking`).
- Added oc.json key `claudeApiRollover` (`config/oc.ts` validation, `tui/ocSettings.ts`) and palette entry **Claude API credit rollover** in `claudeCommands.tsx` (shown only with `apiAccount`).
- Added `apiAccount` to the user's `~/.config/opencode/opencode.jsonc`, first as `{env:CLAUDE_CREDIT_API_KEY}`, then `{file:~/.config/opencode/secrets/claudeCredit.key}`. Config updates patch raw jsonc, so the reference is never replaced by the key.
- ERROR: after `/revive` the log said "apiAccount has no apiKey": the resident server (started by revive) kept the environment from before the User env var was set. Fixed by the `{file:}` key; wiki and `types.ts` now recommend it.
- Pass: `apiCreditsExhausted` reads the streamed reply only when the result has no text (same rule as `beginTextAccountSwitch`); dropped a label-list assertion from the consent-question test.
- Docs: wiki `Claude-Code.md` "API credit rollover", FORK.md account pool row, plan file status.
- Verification: `tsgo --noEmit` clean in `packages/opencode` and `packages/tui`; `bun test` accountPool + spawnEnv + failoverQuestion 43 pass (3 new pool tests, 1 spawnEnv test: billing safety contract), cliEvents 15 pass. Not run: a live rollover turn in oc (needs a restart so the env var is in the server process, and every login limited).
- ERROR: first `bun test` run including `cliEvents.test.ts` crashed with "Bun has run out of memory"; immediate rerun passed. Not caused by this change.
- Risk: sidebar does not show the API account; a chat on credits shows its pool's account row. The "credit balance too low" text match is from Anthropic docs, not observed live.

### User
Claude accounts
- A Claude Console API key (for example the Team plan's monthly API credit) can now act as a last resort when every Claude login hits its usage limit.
- oc asks "Continue on API credits?" in that turn, and a yes keeps that chat on the key until any login resets.
- The new palette entry **Claude API credit rollover** switches between Ask, Always, and Off.
- When the credit runs out, the turn ends with "API credits used up" and waits for a login to reset.

---

## 2026-11-10 (~02:17) - v0.2.347 gregAngelmaker - Queued Claude messages stay editable until the next tool call - Claude Opus 5.5, low effort; Implementation

### Agent
- Meta: Claude Opus 5.5; low effort; Implementation (/think plan then /imp); completed
- Version: 0.2.347 gregAngelmaker
- Fixed: Edit/Delete on a QUEUED message mid Claude turn failed "Session is busy". `Steering.admit` wrote every steer to stdin at once unless a proxied tool ran, so `retract` refused it (`writtenIds`) while Claude was still thinking or running a CLI tool.
- Changed `steering.ts`: `admit` always holds; removed `SteeringHost.busy`. `turnStream.ts` `completeToolUse` flushes held steers at a CLI-run (non-proxy) `tool_use` when `inStreamCalls === 0`; proxied result flush and `completeResult` flush kept.
- Changed `tui/.../dialog-message.tsx`: a `SessionBusyError` refusal toasts "Too late to take back: the model already has this message"; other errors show "Not deleted: <error>".
- Changed `steering.test.ts`: new guard "a steer sent while Claude thinks stays deletable until its next tool call"; "written"/"streamed" cancel cases now reach the written state via a Read call next to a held proxied question (the test fixture rejects native Bash, so a slow Bash returns instantly).
- Added plan `docs/dev/plans/queuedEditPlan.md`. Updated wiki `Sessions.md` (QUEUED Edit/Delete paragraph) and `docs/dev/testing.md` (Windows fakeModel known failures).
- Risk: a ms-fast CLI tool can finish before the flushed steer lands; then it is read one boundary later or runs as the next turn (`completeResult` path). Not lost.
- TODO: non-Claude providers have no steer sink, so QUEUED Edit/Delete always fails while busy but is still offered. Undecided (hide vs make native-loop deletion safe).
- Verification: tsc clean for touched files in tui and opencode. `steering.test.ts` 16/16 pass. `fakeModel.test.ts` 27 pass, 2 fail ("claudeTestFlow step 4", "an API error the CLI reports twice shows once"), same symptoms as known failures, no steering involved.

### User
Claude Code sessions
- Clicking a QUEUED message and choosing Edit or Delete now works while Claude is thinking or running its own tools, up to its next tool call.
- When it really is too late, the notice says so plainly instead of showing a raw "Session is busy" error.

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
