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

## 2026-11-24 (~02:17) - v0.2.413 decemberHerbie - /revive no longer creates a session for tabs on Home - Claude Opus 5.5, low; Debug

### Agent
- Meta: Claude Opus 5.5; low; Debug; completed, live unverified
- Version: 0.2.413
- Fixed `oc revive-tabs` (src/packages/opencode/src/cli/cmd/oc.ts): a tab with no `sessionID` (ledger drops it on Home, packages/tui/src/app.tsx) went through `launchProject(directory)`, which calls `bootstrapSession` for any target. Added `home` option to `launchProject` and a hidden `--home` flag on `oc launch`; the first tab and every `spawnTab` pass it when the tab has no session, so any mix of Home and session tabs reopens as-is.
- Verification: `tsc --noEmit` clean for oc.ts; `bun test test/config/revive.test.ts` 35 pass. Live WezTerm /revive with mixed Home/session tabs not run.

### User
Revive
- Tabs that were on the Home screen come back on the Home screen after /revive instead of opening a new empty session.

---

## 2026-11-24 (~01:53) - v0.2.413 decemberHerbie - Mirror to a Mac no longer fails with ENOTSUP - Claude Opus 5.5, default; Debug

### Agent
- Meta: Claude Opus 5.5; default; Debug; completed, live unverified
- Version: 0.2.413
- Fixed `oc oc mirror receive` (`src/packages/opencode/src/cli/cmd/oc.ts`): `Bun.write(bundle, Bun.stdin)` -> `pipeline(process.stdin, createWriteStream(bundle))`. On macOS Bun copies stdin with `fcopyfile`, which throws ENOTSUP when stdin is the ssh socket, so every mirror to a Mac failed. Windows receivers did not hit it.
- Verification: on the Mac, piped 300 KB over `ssh mac` into bun: old call reproduced `ENOTSUP ... fcopyfile`, new call wrote identical bytes (sha1 match), and empty stdin wrote a 0-byte file (empty-bundle case). Full /mirror not run: the Mac needs this build first (`/revive` there).
- Applied this PC's source (caf905c + uncommitted fix) to the Mac by user request: bundle via scp, then the Mac's own `oc oc mirror receive --dirty overwrite` with stdin from the file (sidesteps the bug). Mac's uncommitted Cursor provider edits and untracked `provider/cursor/debugTempImage.ts` discarded as asked. Mac still needs `/revive` to run the fix.
- Risk: version name from `bumpVersion.ps1` came out as a long garbled string; left as generated.

### User
Mirror
- Mirroring to the MacBook no longer fails with "ENOTSUP: operation not supported on socket, fcopyfile" once the Mac runs this build.

---

## 2026-11-23 (~23:31) - v0.2.412 vanillaChill - Home footer shows oc and OG versions - Claude Opus 5.5, default; Implementation

### Agent
- Meta: Claude Opus 5.5; default; Implementation; completed, live unverified
- Version: 0.2.412
- Changed `Version` in src/packages/tui/src/feature-plugins/home/footer.tsx: renders `versionLabel(api.app)` = `oc v<displayVersion sans suffix> ∙ OG v<version>` (sidebarTools.tsx:972 format, no green `-`); directory width budget now measures the label
- Verification: `tsc --noEmit` in src/packages/tui clean; home page not viewed live (needs `/revive`)

### User
Home page
- The bottom-right corner now shows the oc and OpenCode versions, like the session sidebar.

---

## 2026-11-23 (~21:52) - v0.2.411 emacAnthem - Swarm claim fixes, lost subagent results, steering race, Cursor ledger items, API spend line - Claude Opus 5.5, default; Implementation

### Agent
- Meta: Claude Opus 5.5; default; Implementation (swarm handoff, verified claims); completed, live unverified. Uncommitted.
- Version: 0.2.411
- Fixed F18 `config/revive.ts` `openTabCommand`: escapes `;` in the folder (live in Windows Terminal); revive test updated.
- Fixed F36 `cursor/protocol/deviceId.ts` `parseWindowsMachineGuid`: hashes only the GUID; new `test/provider/cursor/deviceId.test.ts`. Changes Cursor device identity once.
- Fixed lost subagent results (26 of 74 in the swarm): `session/prompt.ts` `pendingClaudeUser` counts from the turn's original parent (`steeredParentID`) after a steer split and skips prompts an assistant already answered; regression test in `test/session/prompt.test.ts`.
- Fixed 76 of 78 REAL claims from `~/.config/opencode/plans/2026-11-23-claim-verification.md`: Cursor C10 C21 C32 C35 C47 C48 C49 C51 C52 C54 C55 C57-C61 C63; opencode/core C4 C5 C8 C9 C11 C39-C43 C64 C67 C71-C73; TUI dialogs C2 C3 C13-C18 C26-C28 C76 C77 C79-C81 C88 C93-C95 C97; sidebar/updaters C19 C20 C24 C25 C74 C84-C86 C89-C91 C100-C106 C108-C112. New `test/provider/cursor/editSafety.test.ts`.
- Kept C34 (macOS pid-reuse window; no simple close). Reverted C66: `renameFallback.test.ts` requires skipping a failed model at another variant; by design.
- Changed agent work: C8 failed listener lookup still trusts live state; C111 only an older build fails; C106 callers show save errors.
- Fixed core `util/processDarwin.ts`, `util/ocItems.ts`: `bun:ffi` now `require`d on first use, not imported. Node bundles (`plugin/azure.ts`, `npm.ts` via processTree) failed `ERR_UNSUPPORTED_ESM_URL_SCHEME`; pre-existing since processDarwin (v0.2.332), core source otherwise equal to HEAD. `Npm.add` Node test and azure test now pass; Azure entry removed from Known failures.
- Fixed F29 gap `agent/subagent-permissions.ts`: read-only rules name `session_complete`/`session_failed` deny. `Permission.disabled` special-cases those two (only a rule naming them counts), so the `*` deny left them listed; execution was already denied at `ctx.ask`. Test extended in `plan-mode-subagent-bypass.test.ts`.
- Fixed from review `session/queue.ts` cancel: re-reads the row inside the delete transaction (another process could claim it after the outside read).
- Fixed from review `cursor/context/skills.ts`: scan via core `Glob.scan` (same as host `util/fingerprint.ts`) instead of `Bun.Glob` followSymlinks; probe: junction cycle terminates.
- Fixed from review `tui/src/pushAutoDelete.ts`: `claimed` id set so sweep and leave-session never delete one session twice (false "failed" toast).
- Kept (review, checked): Cursor `~` paths consistent (host `edit`/`apply_patch` call `expandHome`); pushAutoDelete reuse safe (new prompt sets in-progress, clearing complete, `session.ts:847`); scheduledResume cross-process lost cancel on exit (was always lost before), resume count reset on cancel (designed), three-contender stale-lock race (two processes share the file).
- Risk/limits: C42 Terminal close timeout only, launcher surviving force-kill not killed; C52 tiny parent-dir swap window; C54 reminders lost if first write fails; C60 guesses first dash without provider; C61 not reproduced; C86 gap between prepare and install; C89 cannot see server-side plugin retry; C16 PATCHes may arrive out of order; F76 long-open terminal delays sync reload; macOS dataless folders listed.
- Fixed steering race `claude-code/steering.ts` `onReplay` + `streamWriter.ts`: the split waited for the async receipt save (`steer.delivered()`), so text Claude streamed meanwhile went to the reply before the steer (`steering.test.ts` "a steer reaches the running turn" failed 2 of 11 runs, empty second reply). `StreamWriter.hold()` on replay buffers output; `splitAt` emits the split then the buffer; `release()` on receipt failure and close. Test `streamWriter.test.ts`. Probe first ruled out `pendingClaudeUser` (equal to HEAD's lookup on all 8 test timelines).
- Fixed Cursor F40 `pump.ts`: failed progress continuation saves the checkpoint, then fails the turn (was a normal stop).
- Fixed Cursor F44 `session.ts`: `awaitingResume` keeps a Run open between result delivery and the next pump. Limit: a real cancel in that gap waits for replacement or the hard deadline.
- Fixed Cursor F48 `imageInput.ts`, `prompt.ts`: tool-result `image-data` (AI SDK 6) attached on a fresh Run; in-turn tool results get an explicit "not shown" note (exec replies are text only).
- Fixed Cursor F51 `readResult.ts`: nested AGENTS.md reminder kept for read_result/mcp_result. Left: `pi_read_result`.
- Fixed Cursor F53 `descriptors.ts`: MCP server named like the default keeps full tool names. F52 partial: bare `name` without provider still guesses the first dash.
- Fixed F29 gaps `session/prompt.ts`: read-only child's brief `@file` parts read through its rules (no cwd bypass); `refuseInReadonly` blocks command `!` shell and subtasks. ToolSearch kept exempt (schemas only; later calls guarded). Tests in `prompt.test.ts`.
- Added Claude API spend line: `accounts.ts` `addApiSpend` tally (local day/month, in pool file), `turnStream.ts` adds API-account turn cost, `sidebarUsage.tsx` shows `Claude API $x today · $y mo` or `out of credits`. Risk: pool file last-writer-wins across oc and native; CLI cost estimate only.
- Added personal agents `general-opus-5.5-api`, `advisor-fable-5.2-api` (`claudeAccount: ~/.claudeApi`). Ran one `general-opus-5.5-api` turn; no pool warning.
- Verified 79 low claims plus 3 unsure with 17 GLM Flash agents: 56 REAL. Fixed 41 with 8 Opus API agents (each re-checked first), skipped 15 with reasons; list in `~/.config/opencode/plans/2026-11-23-claim-verification.md`. Notable: Cursor open Runs pinned against conversation eviction (`conversationBind.ts` pin/unpin in `session.ts` register/close), generateImage symlink escape into a missing folder (test), GOAWAY ping no longer destroys draining Runs, edit remap path compare case-insensitive on win32 and refuses non-files, Cursor skill precedence now host order (later roots win), `run_after_turn` refuses a second call per turn, revive resume newest chain first, failed job spawn deletes its folder, Jev score must be 0-1, usage tags `20m`, pooled usage merge per account, Claude dirs deduped, single update and Update all exclusive, Explorer comma paths quoted verbatim (main agent: only comma paths, trailing `\` trimmed), WT scripts use resolved pwsh, script palette ids `encodeURIComponent` (old custom keybinds on punctuated script names change), ocCommands folder saves awaited.
- Fixed from GLM review of the claim fixes `cursor/session.ts`: a cancel held only by `awaitingResume` closes the Run after `AWAIT_RESUME_GRACE_MS` (30 s) if no step began reading (no hard deadline covers that gap). Test in `lateCancel.test.ts`. Rejected: pin-count leak (registerSession returns early for a registered session).
- Fixed `opencode-sessions.js` (user repo, uncommitted, approved): `messages()` reads the `X-Next-Cursor` header; `collectMessagePages` stops with pages read so far when a guessed message-id bookmark is rejected. Its tests 74/74. Live after an oc restart (plugin loads from that file).
- ERROR: one-offs not reproduced: `steering.test.ts` "delivered steer revert ... resets an empty conversation" (receipt missing, during edits under load; 10/10 since); tui `DiffViewerFileTree` empty render once (3/3 since; untouched).
- MISTAKE: a subagent edited `prompt.test.ts` with Python despite the Edit-only rule; checked: no CR/BOM, additions only. Restate the rule in every implementation brief.
- Verification (final tree): typecheck core, opencode, tui pass. core 1097 pass 0 fail. tui 809 pass, 5 known fail. opencode provider/session/agent/tool/config/permission/plugin/util/background 3858 pass, 1 known intermittent (`@<agent>:<level>`) plus the grace test, which ran against `session.ts` loaded before its edit; rerun after: lateCancel 3/3, cursor + prompt 230 pass 0 fail. Steering file 10/10 after the race fix. Live: F36 one Cursor turn answered normally on the installed build; user saw no sign-in or device prompt. Not run live: F29 on a real Cursor read-only child, lost-result fix with a real subagent burst, API spend line on screen, two-machine sync, macOS (C34 C40 C42 C91 C111 brew, Finder alias, dataless, Mac tool guard).
- Risk: Mac runs 0.2.407, which ignores `readonly: true`; do not use `review-*` there until updated.

### User
Subagents
- Background subagent results that arrived while a Claude turn was starting or ending are no longer lost.
- A read-only subagent no longer sees the tools that mark a session complete or failed.

Cursor
- Cursor now sees the same device id as its own app on Windows, so it may ask you to sign in again once.
- Cursor edits of files in your home folder, files with non-UTF-8 bytes, and repeated matches on one line now work safely.
- Cursor finds nested skills, uses the right subagent names, and no longer adds a symlinked AGENTS.md twice.
- Cursor now sees images that a read returns, keeps nested AGENTS.md reminders on reads, reports a failed continuation as an error, and keeps an MCP server named "opencode" working.
- A late cancel no longer cuts off a Cursor reply between tool results.

Claude
- Text Claude writes right after reading a message you sent mid-turn now always appears under that message.
- The sidebar Usage section shows a Claude API line with today's and this month's spend on API credits.

Read-only subagents
- A read-only subagent cannot read brief files its rules deny, and cannot run command shell steps or start subtasks.

Smaller fixes (41 from the low-priority bug list)
- Cursor: long runs keep their saved state, image writes through links stay in the project, server shutdowns let running replies finish, and web search errors show as errors.
- Sidebar usage: short windows read like `20m`, duplicate Claude folders show once, and switching accounts no longer mixes readings.
- Updaters: an app that is already current shows as current, and one update at a time runs.
- Dialogs and scripts: subagent toggles save in order, failed sync saves show the real state, plugin names keep their scope, and Windows Terminal scripts use the real PowerShell path.
- `run_after_turn` queues one command per turn and refuses a second.
- session_read works on long chats again (opencode-sessions plugin, after a restart).

Sessions and queue
- Cancelling a queued prompt that is already sending now says it is busy instead of "Cancelled".
- Cancelling a scheduled resume holds even when the schedule file is briefly locked.
- Push session auto-delete no longer deletes a session you open during the sweep or shows a false failure.

Windows Terminal, revive, and updaters
- Folders with a semicolon open correctly in new Windows Terminal tabs.
- /revive only builds a real oc source folder, and several updater and dependency rows report their true state.

Dialogs and sidebar
- Many dialog and sidebar fixes: hotkey conflicts are caught, saves report errors, schedule times near midnight stay on the right day, and script and usage rows show correct values.

---

## 2026-11-23 (~04:17) - v0.2.410 eggoEnabled - Sync only real files, read-only subagents, Cursor sh commands, sync idle - Claude Opus 5.5, default; Implementation

### Agent
- Meta: Claude Opus 5.5; default; Implementation (imp, swarm handoff F4/F29/F54/F76); completed, live unverified. Uncommitted.
- Version: 0.2.410
- Fixed F4 `core ocItems.ts`: lstat classifier `classify`/`heldReason`/`heldPath` runs before any readdir or read, top folders and root segments from home included. Held: symlinks, junctions, non file/dir, Windows REPARSE/OFFLINE/RECALL attrs (`GetFileAttributesW` via lazy bun:ffi, `\\?\` prefix), shortcut extensions, `.name.icloud` stubs (held under the real name; `.SKILL.md.icloud` marks a skill), macOS dataless (`blocks==0 && size>0` then `/usr/bin/stat -f %Xf`), Finder alias header. `collect().held` id or prefix -> reason; `isHeld`: exact, `/` child, or `:` prefix. Any held file holds its whole skill. Held key file or `.name.icloud` key stub holds `${file}:`.
- Fixed F4 `core ocSync.ts`: held ids keep previous state (no tombstone), leave manifest, skipped in `pull` and `applyPulled`; held ids join the `_etags` key.
- Added held rows: /sync "Not synced", Export "Not exported" (`itemTree.heldOptions`).
- Changed test (intended): "a dangling link marks its category partial" -> held, not partial.
- Changed personal: `~/.opencode/commands/agent-push.md` now real file, `~/.claude/skills/agent-push/SKILL.md` links to it (hash unchanged 13074186...; backup `%TEMP%\agentPushSwap-20261123`). `.claude2`/`.claude3` skill copies identical, untouched. File header still says "Not a symlink; edit both" (left: editing changes synced hash).
- Fixed F29: Cursor `SubagentArgs.readonly` -> `resultMetadata.readonly` -> `pump.ts` `markReadonlySubagentCall(toolCallId)`; `task.ts` takes it by `ctx.callID` (no tool arg). Child gets `READONLY_MARKER_RULE`; `prompt.ts` appends `readonlySubagentRules` last on every turn of a marked session: deny `*`, replay earlier rules for read/grep/glob/list/websearch/webfetch/external_directory (never upgraded), deny read `mcp:*`. Writable child resumed read-only -> refused.
- Added `readonly` agent field (core `v1/config/agent.ts`, `Agent.Info`): same marker. Not in `options` (those reach LLM request options, `session/llm/request.ts:122`).
- Added personal `review-*` entries (grok-4.6/4.7, glm-5.3(-flash), gpt-6.2-sol, gpt-6.1-terra) with `readonly: true` in `agents/sub/general.md`; subagents skill names them. Risk: oc before v0.2.410 (installed PC build, Mac 0.2.407) puts `readonly` into options and runs them writable; use only after /revive.
- Fixed F54 `shellTimeout.ts`: removed `exec /bin/sh <wrapper>` command rewrite and `preferWrapperCommand`; sh/dash/other follow Windows branch (real command, foreground at Cursor window, background refused). bash/zsh unchanged.
- Fixed F76 `syncPeer.ts`: `idle()` = `ServerIdle.report` (SessionWork via `makeRuntime` shared memoMap, shell jobs, PTYs) + `busyClaudeProcesses` (live child with non-abandoned turn, background tasks, or guardPending). Removed session.status map and 2 h cutoff. Long-open terminal delays reload.
- Fixed `global-lifecycle.ts`: `stopToolGuardChecks` before `disposeAll` clears stored Claude guards and aborts in-flight checks (deny, not hang on disposed services).
- Fixed from review: `toolGuard.ts` aborts a callback read after child exit; `sessionManager.ts` LRU and idle eviction spare a child with `guardPending`.
- Kept (review, reasoned): abandoned turns not busy for reload; task-brief attachments and slash commands inside a read-only child (pre-existing, user-driven); ToolSearch exempt; sentinel parse on foreground output; shell kind vs `Shell.acceptable`.
- Risk: macOS dataless folders are still listed (files inside held). Key stub check covers only the chosen settings file name.
- ERROR: `plugin/azure.test.ts` Node run fails `ERR_UNSUPPORTED_ESM_URL_SCHEME` (bundle pulls `processDarwin.ts` bun:ffi); none of this diff in the bundle; logged in `docs/dev/testing.md`.
- Verification: typecheck core, opencode, tui pass. Full provider/permission/tool/session/server/agent/plugin run 3664 pass, 2 fail (azure known; task readonly test passed alone, file edited mid-run). After review fixes: core ocItems/ocSync 21 pass; claude-code, task, agent, cursor, plugin/cursor 1038 pass 0 fail. Real `claude` CLI guard test with read-only session (fake LLM) passed. Probe: `busyClaudeProcesses` ignores closing/abandoned (deleted). Real config collect: only held item was agent-push link before swap, none after. Agents scan: six review-* parse with `readonly: true`. Not run: live Cursor turn, two-machine sync, macOS, F18, F36, claim verification wave (claims in `%TEMP%\swarm20261123\claims.tsv`, waiting for user go).

### User
Settings sync and export
- Sync and Export now skip links, junctions, shortcuts, cloud placeholders, and Finder aliases, and never treat them as deleted.
- The /sync and Export dialogs list those skipped items with the reason.

Subagents
- A read-only subagent requested by Cursor can now only read, search, and use web tools, even under a command that allows shell.
- An agent entry can set `readonly: true` for the same behavior; new `review-*` entries use it after `/revive`.

Cursor and sync
- Cursor shell commands on sh or dash now show and check the real command.
- Sync waits for real idle (running sessions, shell jobs, terminals, Claude background work) before reloading projects, instead of guessing from a 2-hour limit.

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
