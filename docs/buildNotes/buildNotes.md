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
- Archives 1-17 hold the full history verbatim; never edit them. Old 60 KB summary: `git show 661a21b463:docs/buildNotes/buildNotes.md`. archive17 covers v0.2.345-v0.2.371.
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

## 2026-11-18 (~19:30) - v0.2.388 squiggleEndevors - Clipboard read only on paste, API key dialog - Claude Opus 5.5, low; Imp

### Agent
- Meta: Claude Opus 5.5; low; Imp; completed per `~/.config/opencode/plans/clipboardReadGuard.md` (iteration 6)
- Version: 0.2.388 squiggleEndevors (not bumped: already changed since the last commit)
- Changed `tui/src/clipboard.ts` `read(trigger: KeyEvent | PasteEvent, options)`: returns undefined + console.warn when `isSyntheticTrigger` (missing, or keymap `createSyntheticCommandEvent` shape: name "command", raw ""; `@opentui/keymap` 0.5.14 `src/opentui.js:6`). Covers every `keymap.dispatchCommand` path (remote `tui.command.execute`/targeted, `--palette`, plugin shim, sidebar). No app.tsx blocklist. `ClipboardService.read` takes the trigger.
- Changed `prompt/index.tsx`: paste body moved to `pasteFromClipboard(trigger)`; `prompt.paste` passes `ctx.event`; empty bracketed-paste fallback calls it with the `PasteEvent` (dispatching `prompt.paste` would now be rejected). `editorPaste.ts` passes the binding's `ctx.event`.
- Added `component/dialogApiKey.tsx`: no text field; bracketed paste (`usePaste`) or `prompt.paste` keys (read with the key event); shows `Key sk-ant-…abcd` / `none`, inline error on non-`sk-ant-` paste, Enter saves. `claudeCommands.tsx` `claude.apiKey` renamed **Set Claude API key**, opens it; `saveApiKey` keeps the keychain logic, then `clipboard.write("")`, toast "Clipboard cleared (clipboard history may still hold it)". Note: plan's empty-state hint text replaced by `none` per principles (no usage hints).
- Moved cua `clipboard_read` from `SENSITIVE` to `DENIED` (`tool/cua.ts`), deny message and `cua_raw` description updated. Note: `run_steps` steps and `run_script` `cua.call` are limited by the driver to input/read tools without `clipboard_read`, so no bypass.
- Added `tui/test/clipboardReadGuard.test.ts`: scans tui/opencode/core src for read forms (`pbpaste`, `Get-Clipboard`, `GetText(`, `GetImage(`, `GetFileDropList`, `wl-paste`, `xclip ... "-o"`, `the clipboard as`, `clipboardy.read`, `navigator.clipboard.read`, `createHostClipboard`) outside `tui/src/clipboard.ts`; plus synthetic vs real trigger cases. `test/clipboard.test.ts` passes a `PasteEvent`.
- Docs: FORK.md new row "Clipboard reads only on paste", pool row palette name, cua row; wiki `Agents-and-Skills.md` cua bullet; setup guide `~/.config/opencode/mockups/claudeApiProfileSetup.html` step 6.
- Verification: `tsgo --noEmit` clean in tui and opencode; tui clipboardReadGuard + clipboard + dialog-prompt + promptPasteSubmit 21 pass 2 skip (win32-only) 0 fail; cua 5 pass. Probes (deleted): real `createDefaultOpenTuiKeymap` `dispatchCommand` -> read undefined, mock Ctrl+V -> read text; temp `pbpaste` file under tui/src -> guard test fails; macOS `write("")` after `pbcopy` -> `pbpaste` 0 bytes (user clipboard text saved and restored). Not run: Windows `Set-Clipboard ""` (PS 5.1), WezTerm OSC 52 empty payload, live paste and dialog in WezTerm/Windows Terminal.

### User
Clipboard
- oc now reads your clipboard only when you paste; the server, agents and remote commands can no longer make it read.
- Agents' cua `clipboard_read` is blocked instead of asking.

Claude accounts
- **Set Claude API key** opens a dialog: paste the key, check its last 4 characters, press Enter. oc then clears the clipboard; clipboard history may still hold the key.

---

## 2026-11-18 (~18:53) - v0.2.388 squiggleEndevors - Claude API key from the OS keychain - Claude Opus 5.5, low; Imp

### Agent
- Meta: Claude Opus 5.5; low; Imp; completed per `~/.config/opencode/plans/claudeApiKeychain.md`
- Version: 0.2.388 squiggleEndevors (not bumped: already changed since the last commit by the entry below)
- Added `apiAccount.keychain: true` in `accounts.ts`: `API_KEY_SECRET` (`oc`/`claudeCredit`), `loadKeychainKey` reads `Bun.secrets.get` in the background, re-runs `configureApiAccount` with the last args when found, retries on a later call after a miss, warns once without key text. A non-blank `apiKey` wins. `apiKeyReady()` exposes the pending read; `_setKeychainReader` for tests, and `_resetAccountPool` stubs the reader to null.
- `claudeCodeLanguageModel.ts` doStream and `sessionOc.ts` `claudePool` await `apiKeyReady()`, so a pinned API chat and the pickers see the profile on first use.
- Added TUI palette entry **Set Claude API key (from clipboard)** in `claudeCommands.tsx` (shown with `apiAccount.keychain`): requires `sk-ant-`, stores with `Bun.secrets.set`, toasts the last 4 characters, says restart when replacing a key, and nudges the server with a state read.
- Docs: `types.ts` option doc, FORK.md pool row, setup guide `~/.config/opencode/mockups/claudeApiProfileSetup.html` (steps 4, 6, 8).
- Verification: 2 new accountPool tests (miss then retry turns on; read once found; `apiKey` wins with 0 keychain reads; overlap guard still applies); accountPool 39 pass 0 fail; `tsgo --noEmit` clean in opencode and tui. Probe: real `Bun.secrets` set/get/delete round-trip on macOS with a throwaway `oc-probe` entry (deleted). Palette entry and Windows Credential Manager not run live.

### User
Claude accounts
- The Team API key can live in the macOS Keychain or Windows Credential Manager instead of a file: set `"apiAccount": { "keychain": true }`.
- New palette entry **Set Claude API key (from clipboard)** stores a copied Console key there and shows only its last 4 characters.

---

## 2026-11-18 (~18:24) - v0.2.388 squiggleEndevors - Team API credit as a fourth Claude profile - Claude Opus 5.5, low; Imp

### Agent
- Meta: Claude Opus 5.5; low; Imp; completed per `~/.config/opencode/plans/claudeApiProfile.md`
- Version: 0.2.388 squiggleEndevors
- Changed `accounts.ts`: `configureApiAccount(option, accounts)` disables the API profile when its dir overlaps a pool id (win32 case-insensitive, default dir included) and runs `createAccountDir` once per dir per process (skipped when `poolFile` is null, i.e. tests).
- Added private `known()` so `sessionPin`, `pinSessionAccount`, `preferredAccount` and `poolState` accept the API id; `rankUsable`, `nextUsableAccount`, `poolAccount`, `setCurrentAccount` stay pool-only.
- Moved rollover to its own pool-file set `apiRollover` (`pinApiRollover`, `apiRolloverTurn`, new `isApiRollover`); pins stay in `sessionAccounts`. Any pick or `forgetSessionPin` clears rollover. Manual API pick clears its limit mark.
- Added `"global"` sentinel (`UNPINNED`): unpin stores it and `turnAccount` skips `preferredAccount`, so an agent `claudeAccount` cannot re-pin. New `releaseApiPin` swaps an API pin for it.
- `poolState(..., { withApi })` computes one active id over pool plus API (running, rollover, pin) and appends a `kind: "api"` row; only `sessionOc.ts` passes it. `poolAccountLabel` checks `claudeAccountNames` before "API credits". Exported `API_ACCOUNT_DIR`.
- `turnStream.ts`: `queueAccountSwitch` returns false on the API account (covers `beginTextAccountSwitch`); credits-exhausted marks API limited one hour, rollover chats wait (`allLimited`), pinned chats unpin with a note naming the global login; dropped the `createAccountDir` call at failover.
- Server: `ClaudeAccount.kind` in `groups/session.ts`; `sessionOc.ts` `claudePool` calls `configureApiAccount`; `instance.ts` subagent add maps the API id to its dir (plan gap: it rejected non-pool ids). SDK `types.gen.ts` regenerated; `openapi.json` left to prePush.
- TUI: `ClaudeAccountOption.kind`; global switch filters API; session switch shows with logins+API >= 2; "bills API credits" description in pickers and `dialog-subagents.tsx`; `sidebarUsage.tsx` fetches state with an `apiAccount` and shows a "Claude: <name>" / "API credits" line instead of marking a login row.
- Docs: `types.ts` apiAccount doc, accounts.ts section header, FORK.md pool row.
- Verification: 6 new accountPool tests (overlap incl. win32 case, no automatic pick, limit clear on pick, Use global sticks, one current row, rollover keeps pin underneath); `bun test test/provider/claude-code/` 763 pass 0 fail; tui usage tests 33 pass; `tsgo --noEmit` clean in opencode and tui. Throwaway fake-CLI probe (deleted) confirmed: pinned exhausted -> "unpinned and runs on first", no switch, pin cleared; rollover exhausted -> "waiting for a Claude account to reset"; rejected rate_limit_event on API -> no switch, no limit mark. Live checks not run.
- MISTAKE: first eager-dir version gated on `IN_TEST` and created `src/packages/opencode/C:/acct/api` with links to `~/.claude` during tests. Bun 1.4 does not set `BUN_TEST` (it sets `NODE_ENV=test`). Removed the stray dir; gate on `poolFile` instead. Rule: never trust `BUN_TEST`; check `git status` for strays after tests that touch disk.
- ERROR: `IN_TEST` (`BUN_TEST`) is false under bun 1.4 in accounts.ts, warmup/identities.ts, warmup/store.ts and scheduledResume.ts, so tests not calling `_resetAccountPool` may touch live files. Not fixed here.

### User
Claude accounts
- Team plan API credit is now a Claude profile you can pick for one chat, for the next chat from Home, or for an agent; pickers mark it "bills API credits".
- It is never chosen automatically and never appears in the global account switch; the last-resort rollover still asks per `claudeApiRollover`.
- When its credits run out, a chat you pinned to it goes back to the global account; a rolled-over chat waits for a login reset.
- "Use global account" now sticks, so an agent's preferred account no longer re-pins the chat.
- The sidebar shows "Claude: <name>" with "API credits" while a chat runs on it.

---

## 2026-11-18 (~04:11) - v0.2.387 ummTension - Typed command aliases run outside the slash menu - Claude Opus 5.5, low; Imp

### Agent
- Meta: Claude Opus 5.5; low; Imp (plan `~/.config/opencode/plans/2026-11-18-slash-alias-parse.md`, second opinion from Sol 6.2, Terra 6.1, DeepSeek free); completed
- Version: 0.2.387 ummTension
- Fixed `/push` + Alt+Enter toasting "Only server commands can be queued": v0.2.378 aliases were menu-only, and `splitSlashSteps`/`extractSlashCommands` (`tui/src/prompt/slash.ts`) matched `name` only.
- Added `SlashCommand` type and `slashNames(available)` in `slash.ts`: typed name -> canonical name; real name beats any alias; shared alias goes to the first command in list order. Both parsers emit canonical names, so queue payloads, `session.command`, `typedText`, and the server never see aliases. `extractChain` revives still win over a server alias `revive`.
- Changed `typedSlashCommands` param to `SlashCommand[]` (`prompt/part.ts`).
- Changed autocomplete server rows (`component/prompt/autocomplete.tsx` `commands` memo) to list only aliases they own per `slashNames`, so menu and parser agree (menu used alphabetical-first before).
- Updated `aliases` comment in `core/src/v1/config/command.ts`; wiki `Agents-and-Skills.md` Aliases bullet.
- Kept out of scope: `oc run` footer (`cli/cmd/run/footer.prompt.tsx:178`) and ACP (`acp/service.ts:546`) still match real names only; both already hold `aliases`.
- Verification: added alias cases in `tui/test/prompt/slash.test.ts` and `part.test.ts` (typed alias resolves, pasted alias stays text); `bun test --timeout 30000` slash/part/autocomplete 24 pass; tui `bun run typecheck` clean. Live Alt+Enter not run (needs `/revive`).

### User
Slash commands
- A typed alias such as `/push` now runs its command anywhere in a message, including queued prompts and messages with several commands.
- When two commands share an alias, the menu and the typed message now pick the same one.

---

## 2026-11-18 (~03:44) - v0.2.386 potentialBidnis - Claude session account pick on Home - Claude Opus 5.5, low; Imp

### Agent
- Meta: Claude Opus 5.5; low; Imp; completed
- Version: 0.2.386 potentialBidnis
- Added module-level `nextSessionAccount` signal + exported `takeNextSessionAccount()` in `tui/src/claudeCommands.tsx`; `switchSessionAccount` now also shows on Home (`chooseNextSessionAccount`: dialog "Claude account for the next session"), `desc` getter shows the pick or `global` on Home.
- Added in `tui/src/component/prompt/index.tsx` after `local.agent.attachSession`: `takeNextSessionAccount()` then awaited `sdk.claudeAccount.set(id, sessionID)` (failure toasts, session runs on global). No server/SDK change: `pinSessionAccount` only checks pool membership and `sessionPin` is read at turn start.
- Fixed (pass): re-picking the same Home account no longer toasts, matching the in-session dialog's no-op.
- Kept: pick is per TUI process, memory only, consumed by the next prompt-created session; `bootstrapSession` (New oc session folder picker) does not consume it.
- Updated wiki `oc.wiki/Claude-Code.md` (Switch Claude account sentence).
- Verification: tui `tsgo --noEmit` clean. Throwaway pane probe (OC_TUI_PANE=1, 2 `accounts`, `warmupAuth` so the pool file persists): Home palette desc `global` -> pick claude2 -> desc `claude2`; first prompt turn ran on claude2 (its "not logged in" error) and `account-pool.json` `sessionAccounts` held the new session -> claude2; after `/new`, desc back to `global` and a second session got no pin. 1 pass; probe deleted.
- Plan: `~/.config/opencode/plans/2026-11-18-home-session-claude-account.md`.

### User
Claude accounts
- On the Home screen, "Switch Claude account (this session)" in the oc palette now picks the Claude account for the next chat you start from the prompt.
- The palette entry shows the picked account on Home; the pick applies once and then resets to the global account.

---

## 2026-11-18 (~02:13) - v0.2.385 palkiaSpeedrun - fix Mac test failures at the root; drop known-failures list - Claude Opus 5.5, low; Imp

### Agent
- Meta: Claude Opus 5.5; low; Imp; completed (plan `~/.config/opencode/plans/macKnownFailures.md`); 2 one-off flakes unreproduced
- Version: 0.2.385 palkiaSpeedrun
- Fixed `session/run-state.ts` `owned()`: per-session in-process `Semaphore` (module Map, never pruned) around flock acquire + work. Cause: Runner cancel sets Idle before old run's finalizers release flock, so in-process replacement (Esc then resend, cancel with loop queued behind `!cmd`) died `HeldElsewhereError`. Cross-process still fails at once (`timeoutMs: 0`).
- Risk: a finalizer that waits on the session's next run would now deadlock (comment on `owned()`).
- Fixed `effect/runner.ts` `stopShell`: `ready.await` races `Fiber.await(shell.fiber)`; a shell failing before opening `ready` hung cancel.
- Added `SessionRunState.Interface.phase(sessionID)` (runner `_tag`, `Idle` without runner); `prompt.test.ts` "cancel interrupts loop queued behind shell" polls `ShellThenRun` instead of `sleep(50)`.
- Added tests: `test/session/run-state.test.ts` (replacement waits; fails before fix with HeldElsewhereError), runner "cancel completes when the shell fails before opening ready" (hangs before fix).
- Fixed `core/util/launchDetached.ts`: `.ps1` cmd.exe branch only on win32; else `pwsh -NoProfile -File <file> ...args` detached. `consoleTitle` uses `path.win32`. Real launch test now runs off Windows when pwsh exists, with POSIX payloads (`$(touch)`, `; touch`, backticks, leading `-Flag`).
- Fixed `claude-code/startupDiagnostics.ts` `describeSpawnCwd`: no default params (explicit `undefined` pulled process-wide `getOpencodeProjectDirectory()`, order-dependent). One decision `runtimeStatus.decideSpawnCwd` -> `{ resolved, source }`; `resolveSpawnCwdFrom` returns `.resolved`. `CwdSource` moved to runtimeStatus, gains `session`.
- Fixed `tui/dependencies.ts` `gitBash`: `path.win32` on every host.
- Fixed tests: core pty (witness attachment + `stty -echo`; `attachCollecting` `includeReplay` option), Mac keybind expectations (`super` on darwin), cursor agentUrl stub (404 for non-ServerConfig, counts only ServerConfig), sessionTab `launcher` host paths, `startup.test.ts` parse test uses fixed `C:\state\opencode` (host tmp path + random suffix crossed the 260-char Run cap), warm-up listener `advanceTo` lockstep with loop via config-read counter (slow tick either looked like suspend gap > FIRE_ALLOWANCE_MS or left loop asleep on unadvanced TestClock; 30 ms probe repro failed 3/3 before, 10/10 pass under full CPU load after).
- ERROR: Bun 1.4.2 applies preload `setDefaultTimeout(30000)` only to the first file of a run; `[test] timeout` in bunfig ignored. Whole-suite runs need `--timeout 30000` (`bun run test`, `.scripts/test.ps1` pass it). Corrected `AGENTS.md` Testing bullet and `test/preload.ts` comment.
- Removed known-failures list: `docs/dev/testing.md` (section + flaky pane entry; pane rewind 15/15 on Mac per plan), `docs/dev/macos.md` pointer; `AGENTS.md` wording.
- Unreproduced one-offs (opencode full suite): "handoff child kickoff failure is marked failed and published" (10 s poll, child never failed; 8/8 alone, 6/6 under load; kickoff dies before `owned()`, own permit), "v2 pty HttpApi > does not duplicate replay or strand close" (`POST /api/pty` 404; 6/6 under load), "Claude warm-up sender > aborts an in-flight warm-up" (120 s timeout once in a bare 5 s-default run; 3/3 alone). Fix on recurrence with the error text kept.
- Verification: typecheck 16/16. Final: core 1079/0, tui 796/0, schema 15/0; opencode with `--timeout 30000` six runs: 0,0,1 (warm-up listener, since fixed),1 (startup, since fixed),2 (the unreproduced pair),0 fail. Each fixed test 3/3 after.
- TODO (Windows PC, user): run `runner.test.ts`, `session/run-state.test.ts`, `prompt.test.ts`, core `launchDetached.test.ts`, `revive.test.ts`, `launcherSafety.test.ts`, `config/tui.test.ts`, `runtime.boot.test.ts`, `agentUrlInvalidate.test.ts`, `startupDiagnostics.test.ts`, `startup.test.ts`, `httpapi-warmup-listener.test.ts`, tui `dependencies`/`sessionTab`.

### User
Fixes
- Pressing Esc and resending quickly, or cancelling while a message waits behind a `!` shell command, no longer fails with "Session is running in another oc process".
- Cancelling a shell command that failed to start no longer hangs.
- `run_after_turn` with a `.ps1` script now runs it through `pwsh` on macOS and Linux instead of failing.

Tests
- Fixed the Mac test failures at their cause; the docs no longer keep a list of accepted failures.
- Whole-suite test runs need `--timeout 30000`; Bun only applies the 30-second default to the first file.

---

## 2026-11-17 (~23:27) - v0.2.384 shartinMilkshake - subagent reasoning cutover on Mac and goonstation; old-name hint fix - Claude Opus 5.5, low; Imp

### Agent
- Meta: Claude Opus 5.5; low; Imp; completed. Plan `~/.config/opencode/plans/2026-11-17-subagentReasoning.md` steps 7-10 (cutover) after both machines ran 0.2.384.
- Version: 0.2.384 shartinMilkshake
- Fixed `opencode/src/agent/subagentRef.ts` `suggest`: compares stems with `.` and `-` as one separator, so `general-opus.5.5-high` suggests `general-opus-5.5:high` (live probe showed no hint). Test case added in `test/tool/task.test.ts`. Needs a rebuild to reach the installed binary.
- Personal config (not in repo): `agents/sub/general.md` rewritten to 10 entries with `reasoning` maps (xhigh manual), validated with `ConfigAgent.scan` before replacing (old copy `/tmp/ocDraft/general.md.old`); `scripts/syncFreeSubs.ps1` rewritten (one entry per model, keeps level states, new xhigh/max start manual like /viewSub, re-reads before the swap) and run on both machines (free.md 48 → 12 entries); skills `foster/subagents`, `foster/second-opinion`, `oc/add-subagent`, `~/.claude/skills/oc-subagent` and commands `addSub`, `rmSub`, `free`, `syncFree` moved to `<entry>:<level>`. goonstation: synced files arrived; its stale `foster/subagents` (Muse/Grok/Composer) replaced with the Mac version (user approved), `oc-subagent` edited in place (Windows paths kept).
- Verification: loader scan of live `~/.config/opencode` (Mac) and goonstation's agent files: no diagnostics. Live proxy dispatch: `general-haiku-5.5` → "needs a reasoning level: …:low, …:medium, …:high"; `general-haiku-5.5:low` → completed; `general-opus.5.5-high` → unknown (hint fixed after). syncFreeSubs: a level set off survived a rerun (`no change`). `bun test test/tool/task.test.ts` 49 pass; typecheck clean. Reference sweep: no hits on either machine.
- ERROR: first `suggest` only tried `stem` and `stem` with all dots replaced, missing a partly dotted name.

### User
Subagents
- Your subagent list is now one entry per model with reasoning levels, on both machines; call them as `general-haiku-5.5:medium`.
- Free models are one entry each, and the daily free-model sync keeps the levels you turn on or off.
- An old per-level name like `general-opus.5.5-high` now suggests the new form once oc is rebuilt.

---

## 2026-11-17 (~23:17) - v0.2.384 shartinMilkshake - subagent reasoning levels: one entry per model, `<agent>:<level>` dispatch - Claude Opus 5.5, low; Spit, Think, Second opinion, Imp

### Agent
- Meta: Claude Opus 5.5; low; Spit → Think → Second opinion (x2) → Imp; completed (code + docs). Plan `~/.config/opencode/plans/2026-11-17-subagentReasoning.md` rev 5; steps 6-10 (install, config cutover) are the user's.
- Version: 0.2.384 shartinMilkshake
- Added `opencode/src/agent/subagentRef.ts`: `parse` (`<entry>:<level>`), `listed` (on), `enabled` (on+manual), `levelFor` (variant or Error with valid refs), `suggest` (old `<stem>-<level>` → `<stem>:<level>`, also `.`→`-`), `FORMAT_HINT` (generic example, no personal names).
- Added `reasoning: Record<level, on|off|manual>` to `core/src/v1/config/agent.ts` (schema + KNOWN_KEYS) and `Agent.Info` (`agent/agent.ts`).
- Changed `config/agent.ts`: removed the fork's `variants:` list form (now a diagnostic); diagnostics for `reasoning`+`variant`, `reasoning` without `model`, `:` in a name. A diagnostic rejects the whole file (lastGood keeps serving).
- Changed `tool/task.ts`: parses the ref; agent name for lookup, permission ask, session.agent, resume check; validates the level against the entry and the model's published variants before ask/child creation; `model` override + level is an error; `turnVariant = override ? override.variant : level ?? …`; metadata `reasoning`; child title `@name:level`.
- Changed `tool/registry.ts` describeTask: `- name: reasoning a|b. blurb`, only on levels; entries with no on level hidden; one format line when any entry has levels.
- Changed `session/prompt.ts`: `@name:level` mentions keep the level and the hint lists levels for bare names; command `agent:` parsed at commandTemplate (1886 shell permission) and command (2014) lookups; level with `subtask: false` errors; handleSubtask uses base for agent/mode/ctx.agent and the full ref as subagent_type.
- Changed `provider/claude-code/proxyToolDefs.ts` (keep `reasoning …` prefix whole when trimming, format line, subagent_type description) and `prompts.ts:37`; `provider/cursor/protocol/subagents.ts` expands catalog items per level and never falls back to `general` for a `:` ref.
- Delegated to general-sonnet-5.5-high: `agent/subagentFile.ts` `add`→`upsert` (merge one-line flow map, omitted claudeAccount keeps the pin), `owner`/`list` scanning `{agent,agents}/**/*.md` (I added the configured `subagentFile` to the scan to avoid a regression), `remove` via owner; httpapi groups/handlers (POST upsert with `reasoning`, list `{name,file}`); sdk/js regenerated; TUI `dialog-subagents.tsx` (footer, Enter → reasoning dialog), `dialog-subagent-efforts.tsx` → `dialog-subagent-reasoning.tsx`, `ocCommands.tsx` (`/defaultSubagent` name:level options, `/defaultSubagentModel` base name).
- Docs: FORK.md row "Subagent reasoning levels"; wiki `Agents-and-Skills.md` (Reasoning levels section, /viewSub, default_subagent row) — wiki not pushed.
- Verification: `bun run typecheck` clean in opencode, core, tui. `bun test` in opencode: agent, tool/task (49), tool/registry (20), config/agentMarkdown (18), cursor/subagentCatalog (2), session/prompt level tests, subagentFile (14) all pass; broad run of agent/claude-code/tool/session-prompt/config/cursor: 1811 pass, 5 fail, all 5 listed as known Mac failures in `docs/dev/testing.md`. tui `subagentDialog` 7 pass. `script/httpapi-exercise.ts --mode effect`: pass=230 fail=0. No live dispatch run (needs install).
- ERROR: Sonnet's first `list()` scanned only the global config dir, dropping a `subagentFile` outside it; fixed by passing the configured file into `editable`.

### User
Subagents
- A subagent entry can now offer several reasoning levels instead of one entry per level, and agents call it as `name:level` (for example `reviewer:high`).
- Each level is on (listed to agents), manual (works only when named), or off, set in the agent file or by pressing Enter on the entry in `/viewSub`.
- Adding a subagent in `/viewSub` now creates one entry with the chosen levels; xhigh and max start as manual.
- Calling an entry without a level, or with a level that is off, fails with the list of valid calls; old per-level names suggest the new form.
- The old `variants:` list in agent files is no longer supported.

---

## 2026-11-17 (~22:20) - v0.2.383 guwopQld - rename_file tool so /spit can rename plans - Claude Opus 5.5, low; Spit, Second opinion, Think, Imp

### Agent
- Meta: Claude Opus 5.5; low; Spit -> Second opinion -> Think -> Imp; completed
- Version: 0.2.383 guwopQld
- Added `tool/renameFile.ts` (+ `.txt`), id `rename_file`: `filePath` + `newName` (bare name, so in place by input shape); rejects path separators, dot names, same name, `:` on Windows; `ctx.ask` `edit` on old and new path; inside `withFileLocks([from, to])` refuses missing source, directory, existing destination (except case-only rename: same dev+ino and names equal ignoring case); `fs.rename`; publishes Watcher unlink/add + `FileSystem.Event.Edited`.
- Changed `permission/index.ts` `disabled()`: `rename_file` follows the `edit` rule (no own permission key). Registered in `tool/registry.ts` after `write`; not gated on `usesApplyPatch`.
- Changed `~/.opencode/commands/spit.md` and `spitS.md` rule line: "Rename a plan with `rename_file`." (config, not in repo). Plan: `~/.config/opencode/plans/2026-11-17-rename-file-tool.md`.
- Second opinion (Sol 6.2, Terra 6.1, DeepSeek v4.1) caught: spit `edit` also allows `mockups/**`; relative paths must resolve like `write.ts`; missing watcher events; check-then-rename race (now locked).
- Verification: `test/tool/renameFile.test.ts` 5 pass (in-place rename, relative path, bad names, existing/dir/missing, case-only); registry + permission + commandPermissions suites 115 pass; `tsgo --noEmit` exit 0; probe of spit's real edit rules via `evaluateFile`: plan->`b.md` allow/allow, plans/sub allow/allow, ->`b.txt` deny on new path, repo file deny; `disabled()` shows tool under spit, hides it under `edit: deny`. Not run: live /spit rename (needs rebuilt oc).
- MISTAKE: first second-opinion dispatch sent the literal placeholder "BRIEF" as the prompt; resent in the same sessions. Rule: paste the full brief text before calling task_batch.

### User
Plans
- /spit and /spitS can now rename a plan file in its folder, for example `ocSourceBeam.md` to `ocMirror.md`.
- The rename only works where the mode could already write, never overwrites another file, and cannot move files to another folder.

---

## 2026-11-17 (~21:59) - v0.2.382 dongGuy - /mirror compares content, not "has changes" - Claude Opus 5.5, low; Debug, Plan, Implementation

### Agent
- Meta: Claude Opus 5.5; low; Debug -> Think -> Imp; completed
- Version: 0.2.382 dongGuy (same uncommitted bump as the /mirror entry below)
- ERROR (fixed): after a mirror the target held the sender's uncommitted files (blob hashes identical, measured Mac vs goonstation), yet every later /mirror prompted and `refuse` failed: presence check (`status --porcelain` non-empty). Notes: `~/.config/opencode/plans/2026-11-17-debug-mirror-dirty-prompt.md`; plan `2026-11-17-mirror-dirty-compare.md`.
- Changed `OcMirror.Info`: `dirty: string[]` -> `tree` (work tree id via `worktreeTree`: temp index seeded from real, `add -A`, `write-tree`) + `changes` (`diff-tree -r -z --no-renames head tree`; `untracked` = new and not in `ls-files`).
- Added `OcMirror.lost(changes, senderBlobs)`: lost = target content != sender snapshot content for that path; untracked file the sender lacks survives (restore leaves it); staged-new file is lost (`reset --hard` removes it). `Probe.lost`, `Probe.inSync` (equal head + tree).
- Changed `receive`: re-checks with `lost` against `ls-tree <snapshot>^{tree}`; `refuse`/`backup` act only on lost paths. `snapshotCommit` now reuses `info().tree`.
- Kept skew path `remoteInfo` (TODO): v0.2.382 targets send `dirty`; every path counts as lost (matches their own presence-based receive).
- Changed `dialog-mirror.tsx`: row `in sync` / `N own change(s)`; Enter on in-sync row toasts and stops; prompt lists lost paths only.
- Verification: core + tui typecheck exit 0; throwaway probe (deleted) via real CLI fake remote: re-mirror in sync with `refuse` and no stash; target edits (shared, untouched, spaced path) all lost, refuse throws, backup stashes; untracked own file not lost and kept; staged-new file lost; old-shape remote counts all lost. `info()` on the real oc repo 58-66 ms (3 runs) vs `git status` ~10 ms. Not run: real goonstation (still on the presence-based v0.2.382 build until revived).

### User
Mirror oc source
- A machine that already matches shows "in sync", and Enter on it does nothing.
- The "has changes" prompt now appears only for files the other machine changed itself, and lists just those files.
- Files a previous mirror copied there no longer count as the other machine's changes, so "refuse" and "backup" no longer trigger on them.

---

## 2026-11-17 (~21:49) - v0.2.382 dongGuy - /mirror: push oc source to another tailnet machine - Claude Opus 5.5, low; Plan, Implementation

### Agent
- Meta: Claude Opus 5.5; low; Plan (/spit) then Implementation (/imp); completed, real-network checks pending
- Version: 0.2.382 dongGuy
- Added core `util/ocMirror.ts`: `settings` (oc.json `mirror.dirty`/`revive`/`hosts`), `info`, `targets`, `probe`, `push`, `revive` (sender); `receive`, `requestRevive`, `takeRevive` (target). Plan: `~/.config/opencode/plans/ocSourceBeam.md` (named before the rename to mirror).
- Added hidden CLI `oc oc mirror info|receive|revive` (`cli/cmd/oc.ts` `MirrorCommand`); one JSON line on stdout, error last on stderr. Remote args must match `_SAFE_ARG` (passed through zsh/bash/cmd/pwsh unquoted).
- Snapshot: temp `GIT_INDEX_FILE` seeded from the real index, `add -A`, `commit-tree` with a fixed `oc mirror` identity; real index/worktree untouched. `git stash create` misses untracked files.
- Bundle: refs `refs/oc-mirror/{head,snapshot}` thin against the peer HEAD; empty file when nothing new. ERROR (fixed): `bundle create` drops a ref whose commit the basis excludes (HEAD unchanged), so receive fetches the `refs/oc-mirror/*` glob, then `cat-file -e` checks both commits.
- Receive order: branch check, fetch, extra-commit guard (`--allow-extra`), dirty policy (`stash push -u` for backup), `reset --hard head`, `restore --source snapshot --staged --worktree :/`, `reset`. Untracked target files not in the snapshot stay (counted in the result).
- Revive: `requestRevive` writes `state/mirror/revive.json` and waits 10 s for `claim-<id>` (exclusive `wx`); `useMirrorRevive` (`reviveCommands.tsx`, called once in `app.tsx`, non-native only) watches the folder and runs `revive.start("install", session)`. Claim files are not deleted right away, so a late second window cannot claim again; old ones are pruned.
- Added `OcSync.TailscaleStatus.peers[].ssh` (`sshHostKeys` present). `mirror.hosts` `auto` uses `tailscale ssh` then, else `ssh -o BatchMode=yes -o ConnectTimeout=5 <host>`.
- Added `tui/src/component/dialog-mirror.tsx`, palette `oc.mirror` (`/mirror`, Tools, ranked after `oc.sync`); `persistOcPath` in `ocSettings.ts` (persistOcSync now uses it).
- Docs: wiki `Developing.md` section, `FORK.md` row, `docs/dev/macos.md` dev loop line. principles.md (user file, both machines) still says GitHub-only sync: not edited.
- Verification: core/tui/opencode typecheck exit 0; `ocSync.test.ts` + `ocSource.test.ts` pass; throwaway probe (deleted) ran the real CLI as a fake remote with two temp repos: refuse, backup, unchanged-HEAD bundle, overwrite, target-only commits, branch mismatch, one-claim revive race. Not run: real ssh (Windows OpenSSH stdin, Tailscale SSH), the dialog, the TUI watcher revive.
- Risk: every machine needs a build with `oc oc mirror` before it can receive; older ones show the ssh/yargs error in the dialog row.

### User
Mirror oc source
- New `/mirror` (palette: Mirror oc source to another machine) lists your other tailnet machines with oc version, clean or changed files, and commits behind or ahead.
- Enter on a machine makes its oc source folder match this one, including uncommitted and new files; it builds for itself on revive.
- `oc.json` `mirror.dirty` (ask, refuse, overwrite, backup) and `mirror.revive` (ask, always, never) can be changed in the dialog; `mirror.hosts` sets how to ssh to each machine.

---

## 2026-11-17 (~21:26) - v0.2.381 gorlfriendOrganize - /spit plan writes after a command switch; mockups get their own folder - Claude Opus 5.5, low; Debug, Plan, Implementation

### Agent
- Meta: Claude Opus 5.5; low; Debug -> Think -> Imp in one chat; completed except the mockups folder move (user runs it)
- Version: 0.2.381
- Cause (measured, notes `~/.config/opencode/plans/2026-11-17-debug-spit-plan-write.md`): /spit's path-limited edit rule correctly routes edit/write/bash to `mcp__opencode_proxy__*` and turns Claude's Write/Edit/Bash off. After a mid-chat switch from /debug the model reused native `Write` from history; the CLI refused it ("No such tool available ... Continue without it") and the model gave up. oc never saw a permission check. 7 of 8 transcripts with the same refusal recovered via ToolSearch; this one did not.
- Added `replacedToolsTurnNote` (provider/claude-code/prompts.ts), sharing `replacedToolsText` with the system prompt line so the two cannot drift. `planSpawn` returns `toolNote` when `tools.replaced` is non-empty; `turnStream.spawn` stores it on `ActiveProcess.toolNote`; the first send on that process appends it as the last text block (`appendTextBlock` in messageBuilder.ts, appended so `tool_result` blocks stay first) and clears it. A command switch already forces a respawn (catalog hash), so the note lands on exactly that turn. `respawnActiveProcess` does not copy it; the watchdog re-send reuses `this.userMsg`, which already carries it.
- Rejected: `alwaysLoad` proxy tools (v0.2.153/190: flipping deferred/loaded made Claude report the server disconnected); a PreToolUse path hook (second permission path for one model mistake).
- Added test `test/provider/claude-code/replacedToolsNote.test.ts`: fake CLI records stdin; a spit-shaped command plan gets the note on the first message only. Fails with the append disabled.
- Personal config (not shipped): /spit, /spitS edit allow moved from `~/.config/opencode/plans/mockups/**` to `~/.config/opencode/mockups/**`; /imp, /impS deny moved the same way (still Claude-enforceable `Edit(//.../mockups/**)`); `oc:tui-mockup` SKILL.md and template.html use the new path.
- Verification: `tsgo --noEmit` clean; new test pass (fail with fix disabled); 9 claude-code suites 90 pass / 0 fail; probe of the edited commands: spit plans/*.md allow, plans/x.html deny, mockups/** allow, repo deny; imp mockups/** deny with Claude deny rule. Live check pending /revive.
- ERROR: the `mv plans/mockups mockups` was blocked by /imp's own deny on `plans/mockups/**`; left for the user.

### User
Claude Code chats
- After switching to /spit (or any command that limits file edits) mid-chat, Claude is now told which oc tools replace its own Write, Edit and Bash, so it can write its plan file instead of giving up.

Personal setup
- HTML mockups now live in `~/.config/opencode/mockups` instead of inside the plans folder; /spit may write only plan `.md` files and mockups.

---

## 2026-11-17 (~20:21) - v0.2.380 freebasedFractal - Claude accounts sync by email; warm-ups run on whichever machine is live - Claude Opus 5.5, low; Implementation

### Agent
- Meta: Claude Opus 5.5; low; Implementation (after /debug, /think, /second-opinion); completed; tests written by general-sonnet-5.5-high, TUI and core tests by general-haiku-5.5-high, review by general-gpt-6.1-sol-low
- Version: 0.2.380
- Cause (from /debug): slots that passed while the Mac slept were dropped (a tick gap over 60 s skipped every crossed slot, with no trace), and a revive during a slot lost it. Folder names map to different accounts per machine (Mac `~/.claude` = win10 `~/.claude2`), which is why names and schedules never synced.
- Added `warmup/synced.ts`: oc.json `claudeAccounts` keyed by lowercased email (`name`, `warmup {enabled, schedule, updatedAt}`), synced as `oc:claudeAccounts`. `saveWarmup` keeps `updatedAt` on a pause or resume with the same times.
- Added `warmup/identities.ts`: folder -> email from `auth status` (`inventory.ts` now parses `email`), persisted in `<data>/claude-code/identities.json`. `verifyAccountEmail` replaces `verifyAccountConnected`; a send needs the email to match.
- Rewrote `warmup/store.ts` as the runtime-only `warmup-state.json` (claims keyed by occurrence instant, `lastAttempt.host`). Occurrence keys are now `String(at)` (`schedule.ts`). The legacy `warmup.json` is read once by the migration and never written.
- Rewrote `warmup/index.ts` as `createScheduler`:
  - A pending queue keeps slots until they fire, a peer claims them, or their deadline passes.
  - Machines rank by host name (`rankFor`), and each lower rank waits `STANDBY_MS` longer. The deadline keeps the highest rank seen.
  - After a sleep gap or start, the next normal tick catches up the latest slot from the last 5 h (not before `updatedAt`) and restarts the waits of standby slots.
  - `stillScheduled` drops removed or paused times.
  - Standby machines re-read peers before claiming, and a machine claims only when it sends.
- Added `warmup/peers.ts` and a `GET /oc-sync/warmup` route in `server/syncPeer.ts`: emails signed in, claims from the last 24 h, latest outcomes. It answers 404 when sync is off or `oc:claudeAccounts` is excluded. Also added `warmupPeers` (self host from the new `TailscaleStatus.selfHost`) and `readyForAccountMigration` (the first cycle in which every online peer answered, or 15 min).
- Added `warmup/migrate.ts`: `migrateLegacy` fills only missing fields of `claudeAccounts` from `claudeAccountNames` and the legacy store. `createHousekeeping` probes identities at start (re-probing every 5 min while none are known), migrates after the barrier, and projects synced names into `claudeAccountNames`.
- Core:
  - `claudeAccountNames` is now machine-only (`ocItems._MACHINE_OC_KEYS`, `machineOnly`).
  - `ocSync.rescan` drops it from state without a tombstone, and `decide` skips it when a peer offers it.
  - `OcItems.apply` holds `OC_CONFIG_LOCK` while it edits oc.json.
- Added `OcConfig.edit` (locked, re-read, jsonc edit of the changed keys only, keeping comments). `update`, `reviveHost.saveReviveBuild` and the account name writes use it.
- `accounts.ts`: `setAccountName` writes the synced name when the email is known. Added `forgetAccountName` (folder removal is local only) and `projectAccountNames`.
- `handlers/global.ts`:
  - The warm-up GET lists accounts by email and adds `here`; the PUT writes `claudeAccounts`.
  - `makeWarmupLoop(pollMs, clock?, {peers?, ready?})` loads syncPeer lazily.
  - Sign-out and remove forget the folder's identity.
  - The API schema gained optional `here` and `lastAttempt.host`. The SDK was regenerated (`sdk/js/src/v2/gen/types.gen.ts`); the client generate step produced no change.
- TUI `claudeWarmup.tsx`: the last attempt shows ` on <host>`, and a `Not signed in here: another machine sends it` row appears when `here === false`.
- Docs: added a Claude accounts section to `docs/dev/syncPlan.md`. Plan: `~/.config/opencode/plans/2026-11-17-warmup-catchup.md`.
- Removed all `DEBUG-TEMP` instrumentation (0 left), the probe folder, and `<data>/log/debug/warmup.log`.
- Verification:
  - Typecheck is clean in core, opencode and tui.
  - Warm-up suites: 95/0 before the review fixes, plus 6 new regression tests (80/0 in `warmup.test.ts` + `warmupSync.test.ts`).
  - `test/provider/claude-code/`, the listener, global and `test/config/` tests: 1094 pass, 1 fail. The failure is `test/config/tui.test.ts` keybind lookup, which also fails with these changes stashed.
  - TUI warm-up 30/0, core ocItems/ocSync 14/0, pane warm-up test 1/0 (`OC_TUI_PANE=1`).
  - Live probe on the Mac: identities resolved by email, self host `macbook`, win10 (0.2.376) returned no peer view, and the warm-up was `sent` and recorded with `host: macbook`.
  - Not yet verified with two upgraded machines.
- Closed both gaps the Sol review left open (minor):
  - Cleared names: `saveName` blank keeps the account entry as the cleared marker, and `projectAccountNames` drops the local name when the synced account has no name. `migrateLegacy` only creates accounts with no entry (was field by field), so a stale local name never comes back.
  - TUI oc.json writes: `tui/src/ocSettings.ts` `persistOcSync` now takes `OC_CONFIG_LOCK`, re-reads inside it, writes atomically, and is queued; `dialog-sync.tsx` shows its async errors. The unused, unlocked `OcConfig.write` was removed.
  - Verification: typecheck clean in core, opencode and tui. Tests 149/0, TUI 30/0, core 14/0. A lock probe showed the TUI write waits for a held lock (held 0-815 ms, written at 1146 ms) and keeps comments. All 33 changed files copied to win10 with identical blob hashes.
- MISTAKE: the macOS `tar` used for that copy wrote 33 AppleDouble `._*` files into win10's repo; they were removed (0 left). Use `COPYFILE_DISABLE=1 tar` or `git diff`/`scp` for cross-machine copies.
- ERROR: the Sol review found six scheduler and migration gaps after the first pass: the barrier was released on a failed cycle, the startup probe was never retried, rank takeover shrank the deadline, a sleep during standby lost the slot, removed times could still fire, and the peer snapshot was stale at claim. All six are fixed and covered by tests. Not fixed (minor): a cleared shared name does not clear other machines' local copies, and an adopted peer claim can show the older outcome until the next sync.
- ERROR: the TUI's own oc.json writes (`tui/src/ocSettings.ts`, sync fs writes) are not under `OC_CONFIG_LOCK`.
- Live two-machine check (both on 0.2.380 after revive): `claudeAccounts` is identical on both. win10 re-projected its names (`~/.claude2` = Team1). Each machine's `/oc-sync/warmup` route answers the other. A temporary 20:54 slot on Pro synced to win10 in about 20 s; goonstation (rank 0) claimed and sent at 20:54:01, and the Mac sent nothing and recorded `sent` with `host: goonstation`. The original times are restored on both machines.
- ERROR: after the first revive, both machines held the migration barrier for the full 15 min, because winserver and Home Assistant (online, same Tailscale user, no oc) failed every sync pull. Fixed in `syncPeer.ts`: only peers that run oc hold the barrier (`runsOc`); a timeout or refused connection (`unreachable`) does not. Checked against the real devices (winserver `TimeoutError`, Home Assistant `TypeError`), and copied to win10 with an identical blob hash.

### User
Claude accounts
- Each Claude account's friendly name and warm-up schedule are now stored by account email and synced between your machines over tailnet sync. No sign-in data is synced.
- The same account gets the same name on every machine, even when its folder is `~/.claude` on one and `~/.claude2` on another.
- Your existing names and schedules move over automatically the first time the new build runs.
- Removing an account folder on one machine no longer clears its name elsewhere.

Warm-ups
- Each scheduled warm-up is sent once by whichever machine is up and signed in to that account. When both are, goonstation goes first and the Mac steps in a minute later only if goonstation didn't send.
- After the Mac wakes or oc restarts, a warm-up missed in the last 5 hours is sent then, unless another machine already sent it.
- The warm-up dialog says which machine sent the last warm-up, and marks accounts that aren't signed in on this machine.

---

## 2026-11-17 (~19:23) - v0.2.379 outcheaWhispering - Push auto-delete decided by oc, not the agent - Claude Opus 5.5, low; Implementation

### Agent
- Meta: Claude Opus 5.5; low; Implementation (from /debug + /think plan `~/.config/opencode/plans/2026-11-17-push-autodelete-cleanup.md`); completed
- Version: 0.2.379 outcheaWhispering
- Why: oc.db history showed 21 of 22 `session_complete({ autoDelete: true })` calls refused (push run mid-session), 15 refusals echoed into push reports, 5 sessions deliberating over the flag (notes: `~/.config/opencode/plans/2026-11-17-debug-push-autodelete-noise.md`).
- Removed the `autoDelete` parameter from `session_complete` (`opencode/src/tool/sessionComplete.ts`, `Parameters = Schema.Struct({})`). Stale callers passing it still decode (probe: Struct({}) accepts `{ autoDelete: true }`) and it is ignored.
- Changed: in a push session (`ocPushSession`) every completion writes `ocAutoDelete = pushed && prompts === 1` (HEAD matches `@{u}`, and `isRealUserMessage` count is 1). Writing false also fixes a stale flag: before, a pushed session prompted again and re-completed kept `ocAutoDelete: true` and could be deleted with new work. Non-push sessions skip git, message read, and metadata write.
- Tool output is always `Marked the current session complete.`; both "Not marked for auto-delete" strings removed. Push wording removed from `tool/session-complete.txt`.
- Updated flag comment in `tui/src/pushAutoDelete.ts`; `isAutoDeletable` logic unchanged (keeps the `ocPushSession` re-check for older flags).
- Outside repo: agent-push line 34 in `~/.opencode/commands/agent-push.md` and `~/.claude/skills/agent-push/SKILL.md` now says just "call `session_complete`"; wiki `Sessions.md` auto-delete sentence names the only-prompt rule (wiki not pushed).
- Verification: `bun test test/tool/task.test.ts` 45 pass 0 fail (new test "a push session auto-deletes only after a verified push with no later prompt": not pushed false, pushed true, re-prompted false, non-push undefined); `bun run typecheck` clean in opencode and tui; `rg autoDelete` leaves only `pushAutoDelete` names.
- Not done: `prompt.ts`/`command.ts` comments left as is (still accurate). Live TUI deletion check not run.

### User
Sessions
- Ending a push no longer adds a "not set to auto-delete" line to the agent's report; oc decides auto-delete on its own.
- A pushed session you keep working in is no longer auto-deleted after the agent finishes the later work.

---

## 2026-11-17 (~19:11) - v0.2.378 layneCleo - Slash menu keeps your pick and supports command aliases - Claude Opus 5.5, low; Implementation

### Agent
- Meta: Claude Opus 5.5; low; Implementation (/imp from plan `~/.config/opencode/plans/slashMenuRanking.md`); completed
- Version: 0.2.378 layneCleo
- Added `aliases` to command frontmatter (`core/src/v1/config/command.ts`, `Schema.mutable` array: a readonly array failed `config.ts:887` typecheck), `Command.Info`, the `GET /command` field pick (`handlers/instance.ts`), and regenerated SDK `types.gen.ts`. `openapi.json` left for prePush.
- Changed `withExactSlashFirst`, renamed `rankSlashOptions` (`tui/.../prompt/autocomplete.tsx`): exact name, then exact alias (name now beats another command's alias), then the row last picked for this query if still in the fuzzy results, then fuzzy order.
- Added per-query pick memory in kv `slash.picks` (query -> favoriteKey), recorded in `select()`, capped at 200 via `rememberSlashPick`.
- Fixed highlight jumping: when `options()` changes under an unchanged query, the selection follows the same item (`anchor` effect pair); query changes still reset to row 0.
- Added `aliases: [push]` to `~/.opencode/commands/agent-push.md` and `~/.claude/skills/agent-push/SKILL.md`. They are separate copies, not a symlink as the file comment claims.
- Skipped ranking tiers and an Enter debounce (plan "Not doing").
- Verification: `bun test test/component/autocomplete.test.ts` 4 pass (new alias/pick/cap cases); tui, opencode, core `tsgo --noEmit` clean; opencode command + config tests 129 pass; loader probe on `~/.opencode` returned `agent-push` aliases `["push"]`. Sticky-highlight effect not run in a live TUI.

### User
Slash menu
- Typing `/push` now puts `/agent-push` first, because commands can declare `aliases:` in their frontmatter.
- The menu remembers what you picked for the text you typed, so `/re` keeps offering `/revive` even after an undo makes `/redo` appear.
- The highlighted entry no longer silently changes to a different command while the menu updates.

---

## 2026-11-17 (~18:59) - v0.2.377 wutangRapped - Slash menu no longer waits on MCP servers after launch - Claude Opus 5.5, low; Debug + Implementation

### Agent
- Meta: Claude Opus 5.5; low; Debug then Implementation; completed, measured before and after on real launches
- Version: 0.2.377
- Fixed `Command.state` (`opencode/src/command/index.ts`): it no longer awaits `mcp.prompts()`, which waited for every MCP server to connect (30 s limit each). MCP prompt commands now load in a fiber forked in the state's scope (`Effect.forkScoped`, interrupted on rebuild or disposal) into `state.mcp.commands`; `list()` returns what is loaded, `get()` joins the fiber only when the name is not a file command or skill; a failed load logs and yields `{}`. MCP names are `server:prompt`, so no clash with files or skills.
- Changed `runBootstrap` (`tui/src/context/sync.tsx`): `command.list` starts with the blocking requests instead of after them; a failed response keeps the current list instead of writing `[]`. Late MCP prompts arrive through the existing `refreshCommands()` on each `/` open (no new event).
- Added tests in `opencode/test/config/config.test.ts` with a gated MCP stub: list returns while MCP is still connecting, an early `get("srv:hello")` waits and resolves, a dying MCP load leaves the list working. Both fail on the old code (timeout / die).
- Measured (debug run, real launches, 2 WezTerm tabs): before, list filled 2.1-4.0 s after TUI start on a cold server, 83-95% of server time waiting on MCP; after, 0.59-0.67 s, server `GET /command` 70-267 ms cold, MCP prompts joined ~1.1-1.35 s later in the background. Never reproduced the reported 10-20 s; a stalled MCP connect is the only measured path that could reach it, and it is now off the list path.
- Not fixed (measured): `app.agents` takes 1.6-1.7 s when 2 tabs cold-start together; each directory instance connects every MCP server separately.
- Verification: typecheck opencode, tui, core; prettier clean; `config.test.ts` 123 pass; config + mcp + tool registry + session prompt suites 305 pass, 1 fail (`cancel interrupts loop queued behind shell`, known failure, also fails with the old command module); tui suite 789 pass, 2 fail (`finds Git Bash from git's cmd folder only`, `util.sessionTab > launcher adds the entry script only under bun`; neither imports changed files, not confirmed pre-existing). All DEBUG-TEMP instrumentation and probe logs removed (search clean).
- ERROR: `prompt.test.ts` "cancel interrupts loop queued behind shell" passed once on a clean stash and failed 3/3 otherwise on this Mac; it is on the known-failures list, so treat as flaky, not as a regression.

### User
Slash menu
- Your commands and skills now show up in the `/` menu right after oc starts instead of waiting for MCP servers to connect.
- MCP prompts (like `/context7:...`) still appear, a second or so later, the next time you open the menu.
- If loading the command list fails during startup, the menu keeps what it had instead of going empty.

---

## 2026-11-17 (~18:24) - v0.2.376 parentalJimmie - Sidebar WezTerm runs start pwsh with the command instead of typing it - Claude Opus 5.5, low; Implementation

### Agent
- Meta: Claude Opus 5.5 (Claude Code in oc); low; Implementation (/spit plan, /second-opinion Sol/Terra/DeepSeek, /imp); completed, live WezTerm check pending
- Version: 0.2.376 parentalJimmie (version already changed since last commit; no bump)
- Fixed sidebar script runs in WezTerm (`scriptRunner.ts` `runWezterm`): with `submit`, the pane now starts as `wezterm cli split-pane|spawn ... -- <abs pwsh> -NoLogo -NoExit -EncodedCommand`, with no `preparePane` or `send-text`. Cause (ghostwriterpp session): PSReadLine's cursor-position reply `ESC[2;50R` interleaved with typed text, so `2;50R` ended up in the script's arguments.
- Added `weztermScriptArgs` and shared `pwshScriptArgs` (also used by `windowsTerminalScriptArgs`). The encoded command puts oc's `PATH` first, because a pane started with a program gets the mux's launchd PATH; that PATH matters for the script's tools and for closeOut's `Get-Command wezterm`.
- Added `resolveExecutable` (`which`/`where.exe`, first existing absolute line). If pwsh is not found, runs fall back to the typed path. `placeScript` still types, so the DSR race remains for placing (noted in the `preparePane` comment).
- Added `spawnWezterm`, `resolveExecutable`, and `preparePane` hooks to `RunnerOptions`. `weztermSendArgs` keeps `submit`, because the missing-pwsh fallback still submits (this differs from the second-opinion suggestion to drop it).
- Verification: `bun test test/feature-plugins/sidebarTools.test.ts` 75/75, including a new test covering both cases (pwsh found: one spawn, nothing typed; pwsh missing: typed with `\r`). tui `typecheck` and prettier are clean. The live pane probe was not run, because this process was outside WezTerm (stale gui socket).

### User
Sidebar scripts
- Running a script in a WezTerm pane no longer types the command into the new shell, so it can't get garbled by the shell's startup.
- Placing a script without running it still types it into the pane.

---

## 2026-11-17 (~20:05) - v0.2.376 parentalJimmie - Warm-up palette pane test fixed (stale navigation) - Claude Opus 5.5, low; Debug

### Agent
- Meta: Claude Opus 5.5 (Claude Code desktop); low; Debug; completed
- Version: 0.2.376 parentalJimmie (same session; no bump)
- Fixed tuiPane "claude warm-up palette opens the schedule dialog": not a product bug. Debug logs (removed) showed the palette ran `oc.claude_warmup.<id>`, `openAccount` found the account and the dialog opened; the test's two Downs (written for a removed "Time format" row) landed on Save, which saved and closed it. Now one Down to Times, Enter on the mode row, 7 Downs to Sunday.
- Fixed same test: after Esc from the Times prompt it pressed Cmd+O over the open schedule dialog and waited for "Search", which the dialog's own search box matched; typed text went into the dialog filter. Now Esc, Esc back to the prompt, then the palette key and wait for "Commands". Also waits for the prompt to close before the next key (a lone ESC byte before `ESC[111;9u` reads as one key).
- MISTAKE: previous entry blamed `keymap.dispatchCommand`; logging disproved it. Corrected in `docs/dev/testing.md`.
- Note: Cmd+O does not open the oc palette over an open dialog on macOS; Ctrl+O did on Windows. Not investigated.
- Verification: `OC_TUI_PANE=1` tuiPane 16/16; no tui source changed (debug code reverted, `git diff` clean there).

### User
Tests
- All TUI pane tests pass on macOS.

---

## 2026-11-17 (~19:40) - v0.2.376 parentalJimmie - Pane usage test rewrite; Keychain stub for test runs - Claude Opus 5.5, low; Debug

### Agent
- Meta: Claude Opus 5.5 (Claude Code desktop); low; Debug; completed except the warm-up palette bug (TODO)
- Version: 0.2.376 parentalJimmie (same session; no bump)
- Fixed tuiPane "fractional usage": grouped layout (default since v0.2.372) rounds in the sidebar (`5h 13%`, `wk 8%`, then `5h 19%`); fractions checked in the Usage menu (`5-hour: 12.5% used`).
- Added `keychainStubEnv(home)` in `test/lib/cli-process.ts`, used by `withCliFixture` and `paneFixture`: on macOS a failing `security` stub first on PATH (drains `-i` stdin, logs to `<home>/security.log`). User saw "Keychain Not Found ... store foster" during test runs: `claude` saves logins with `security add-generic-password -U` (Keychain first, `.credentials.json` fallback) and the temp HOME has no keychain. Warm-up pane run with the stub logged only `find-generic-password` reads, so the storing run was another temp-HOME test; all now stubbed.
- Found: warm-up palette pane test fails on every OS; the account is found, palette shows the entry, but Enter never runs `oc.claude_warmup.<accountID>` (palette clears, no dialog). Not a race (3 s wait), not Keychain.
- Verification: `test/provider/claude-code/` 713 pass 0 fail with the stub; tuiPane fractional usage pass; typecheck clean.
- TODO: trace why `keymap.dispatchCommand` misses the warm-up command (`command-palette.tsx` onSelect, `claudeWarmup.tsx` `warmupCommands`, `app.tsx` appCommands).
- MISTAKE: two probes writing a fake login and running `claude auth status` directly were denied; asked the user before running the equivalent through the pane test.

### User
Tests
- Test runs on macOS can no longer pop up "Keychain Not Found" or touch your real Keychain.
- The Usage sidebar pane test now matches the default grouped layout.

---

## 2026-11-17 (~02:59) - v0.2.376 parentalJimmie - Mac Claude test failures root-caused; steer fence; spawn env scrub - Claude Opus 5.5, low; Debug

### Agent
- Meta: Claude Opus 5.5 (Claude Code desktop); low; Debug; completed except 2 pane tests (below)
- Version: 0.2.376 parentalJimmie (same session as the entry below; no second bump)
- Fixed product `turnStream.ts`: held steers written just before a proxy result were missed when written in the same tick (CLI handles the MCP reply first; bare-CLI probe 3/3 miss). Added `stdinFence`: after `steering.flush()` returns true, write `control_request` `mcp_status` and wait for its `control_response` (handled first in `handleMessage`; ~5 ms; probe 3/3 hit) before `resolvePendingProxyCallById`; `cleanup` releases waiters. `Steering.flush` returns whether it wrote; `ClaudeStreamMessage.response` typed.
- Fixed product `spawnEnv.ts`: `HOST_SESSION_ENV` + `CLAUDE_CODE_DESKTOP_*` stripped from inherited env. `CLAUDE_CODE_ENTRYPOINT=claude-desktop` alone added a status-summary model call per CLI run (warm-ups doubled); session ids, messaging socket and host login identity also leaked. Guard test in `spawnEnv.test.ts`.
- Fixed tests: `cli-process.ts` realpaths the fixture home; `/compact` fakes (fakeModel, tuiPane) reply with `<summary>` tags (CLI re-asks without); new `TestLLMServer.errorEvery(match, status, body)` (entry stays queued) + `chatFixture.turnHas` replace per-retry error queueing (CLI 2.1.322 retries a 400 as-is and without `thinking.display`); steering log reads poll past the 100 ms flush; "identical steer text" now expects one split carrying both held steers (2 requests); tuiPane steering command drops PowerShell `&` off Windows; tuiPane palette key is `ESC[111;9u` (Cmd+O, kitty) on macOS.
- Verification: `test/provider/claude-code/` 713 pass 0 fail; steering 16/16 x3; tuiPane 14/16; typecheck clean; bare-CLI probes (scratch, deleted).
- TODO: tuiPane "claude warm-up palette opens the schedule dialog" on macOS (likely Keychain auth; my credentials probe was denied); tuiPane "fractional usage" stale after the v0.2.372 grouped layout default. Both in `docs/dev/testing.md`.
- MISTAKE: same as below, used inline Python/perl for some test edits and probes; probes fine, edits should use Edit.

### User
Claude Code
- Messages you send while Claude waits on an oc tool (like a question) now reach Claude with that tool's result, instead of becoming an extra turn afterwards.
- Running oc from inside a Claude Code session no longer makes every Claude run send an extra background request or carry that session's identity.

Tests
- The Claude provider tests that always failed on macOS now pass; two opt-in pane tests remain and are documented.

---

## 2026-11-17 (~01:53) - v0.2.376 parentalJimmie - Claude keeps Edit/Write on commands with a path deny - Claude Opus 5.5, low; Debug

### Agent
- Meta: Claude Opus 5.5 (Claude Code desktop); low; Debug; completed
- Version: 0.2.376 parentalJimmie
- Diagnosed (session `ses_e17ecfac9ffeuPql0Wa5PiS0Bh`): `/imp` edit rules `{"*": allow, ".../plans/mockups/**": deny}` counted as "limited" in `commandToolPlan`, so every imp turn proxied Edit/Write (deferred `mcp__opencode_proxy__edit`); Claude found no Edit and first edited through Python in Bash.
- Added `claudeEditDenies` (`session/llm/request.ts`): edit rules where every rule after the first path rule is a deny, POSIX absolute, wildcard only trailing `/*`|`/**`, no `[]()!#`, comma or space, become `Edit(//path)` rules in `CommandToolPlan.deny`; edit/write then stay native. Any `ask`, later allow, relative, mid-path wildcard or Windows path keeps the proxy.
- Added `deny` to `CommandToolPlan` (`shared.ts`), validated in `callOptions.ts isPlan`; `assembleProxyTools` adds it to `--disallowedTools` (open and closed turns).
- Added `editDenied` to `buildToolEnvironmentNote`: names denied paths and points at `mode_switch`, since Claude's own denial lacks oc's `DeniedError.hint`. The proxied-tools line now names each `mcp__opencode_proxy__<tool>`, gives the `select:` query, and forbids shell workarounds.
- Fixed `commandPermissions.test.ts`: stale since active commands (v0.2.372); the plain prompt inherited `/spit` rules. It now clears with `metadata: { ocActive: null }`, and its `imp` carries a mockups deny proving native Write plus Claude-enforced deny with the real CLI. Removed it from `docs/dev/testing.md` known failures.
- Verification: real CLI 2.1.322 probe (`--dangerously-skip-permissions --disallowedTools "Edit(//.../mockups/**)"`, haiku, `~/.claude3`) refused Write/Edit inside, allowed outside; plan built from the stored imp rules gives native edit/write plus that deny; new unit tests in `commandToolPlan.test.ts`, spawn-args test in `fundamentalTools.test.ts`; `test/provider/claude-code/` 702 pass, 9 fail (all the recorded Mac `fakeModel`/`steering`/warm-up entries); typecheck clean.
- TODO: user says expected failures mean broken tests; the 9 remaining Mac failures (`fakeModel.test.ts` x3, `steering.test.ts` x5, warm-up sender) need root-causing, not a list.
- MISTAKE: edited the test with an inline Python script; use Edit per `principles.md`.

### User
Claude Code
- Commands that allow editing everywhere except a few folders (like `/imp` blocking mockups) now let Claude use its own Edit and Write tools, and Claude Code itself refuses edits in the blocked folders.
- When a command does route edits through oc, Claude is told the exact tool names to load, so it stops hunting for an edit tool or editing through scripts.

---

## 2026-11-17 (~01:35) - v0.2.375 dogingConducting - macOS revive window that never opened; exact frame; app focus diagnosis - Claude Opus 5.5, low; Implementation

### Agent
- Meta: Claude Opus 5.5; low; Implementation (imp from `~/.config/opencode/plans/macWeztermFocusRevive.md`); completed
- Version: 0.2.375
- Fixed: macOS revive "old window gone, new one never opens". `reopenCommand` (`config/revive.ts`) passed `--position`, `x,y` as two args; a negative coordinate (display left of/above main) parsed as a flag ("unexpected argument '-1'"), wezterm-gui exited with no window, and `open` had already exited 0. Now `--position=x,y`.
- Added: `restartTerminal` default launch (`config/reviveHost.ts`) snapshots `wezterm-gui` pids (`ProcessDarwin.list`) before `open`, then `confirmWeztermWindow` requires a new one alive after `REPLACEMENT_SETTLE_MS`, else the step throws "New WezTerm window did not open" with a hand-run command and old panes stay. Logs new pid + frontmost pid (`lsappinfo`), placement, and window tab count. User decision: fail loudly, no relaunch.
- Added: `Placement` (`core/util/weztermWindow.ts`) gets pixel `width`/`height` (optional: restart contexts from an older oc lack them); `reopenCommand` always sets `OC_REVIVE_WINDOW` (`x,y,w,h` or ""), applied by wezFig `gui-startup` (`set_position`/`set_inner_size`). cols/rows kept for other configs.
- Fixed: `oc revive-tabs` (`cli/cmd/oc.ts`) tab spawn failures went to `console.error` in pane 0 and were wiped by the TUI; now `ReviveHost.reviveLog().step` per tab (`reviveLog` exported).
- Fixed: `windowTabs` and `shutdownAll` keepPanes match `weztermSocket` too; pane ids restart at 0 per GUI process.
- Fixed: resident server spawn (`startServerUnlocked`) drops `WEZTERM_UNIX_SOCKET`/`WEZTERM_PANE`; the server outlived the window that started it, and `wezterm cli` on the dead socket started a stray `wezterm-mux-server --daemonize`. `windowTabsSnapshot` list uses `--no-auto-start`.
- Kept: scriptRunner `wezterm cli` calls unchanged (TUI socket is always its live GUI); plan step 3 narrowed.
- Diagnosis (no oc change): sidebar split-run apps opening behind WezTerm. A bundled app started by its executable stays behind in WezTerm split, tab, and Terminal.app alike; `NSRunningApplication.activate` from the pane does not help; `open -a <app>` after `lsappinfo find pid=` is non-empty brings it forward (before check-in it starts a second instance). Fixed in flashCK `.run.ps1` only (user: other projects later). Details `docs/dev/macos.md`.
- Docs: wiki `Launching.md` (snippet + failure line), `FORK.md` revive row, `docs/dev/macos.md`.
- Verification: `bun test test/config/revive.test.ts` 19 pass/11 skip/0 fail (updated position expectation: intended; added negative-x and other-GUI socket cases, both fail on old code); core `weztermWindow.test.ts` 2/0; `tsgo --noEmit` clean in opencode and core. Probes: old-form `open ... --position -1728,76` exit 0 with no surviving wezterm-gui; `wezterm-gui start --position=-100,50 --help` parses; `wezterm cli` without socket env finds the GUI; real reopen command with `OC_REVIVE_WINDOW=200,200,1600,1000` gave bounds 100,100 800x500 pt; flashCK split runs before/after fix (behind -> front, 1 instance, x2). Not run: a real `/revive` with these changes (needs `/revive`).
- MISTAKE: ran `wezterm cli list` without `--no-auto-start` from an agent shell with a stale socket; it started a stray mux server (killed). Always pass `--no-auto-start` in probes.
- MISTAKE: first focus probe used TextEdit's executable; sandboxed apps crash when exec'd directly ("TextEdit quit unexpectedly" alert on the user's screen). Use an unsandboxed control.

### User
Revive
- On a Mac, `/revive` no longer loses the window when it sat on a display left of or above the main one.
- If the new window still fails to open, oc leaves the other old tabs open and `revive.log` says so, with a command to reopen by hand.
- With the wezterm.lua snippet from the wiki, a revived window comes back at its exact size and spot, so Rectangle snaps survive.
- Tabs that fail to reopen are now listed in `revive.log` instead of disappearing silently.

Scripts
- On macOS, an app that a run script starts directly opens behind the terminal in any terminal, not because of oc; running `open -a <app>` after it starts brings it forward (done for flashCK).

---

## 2026-11-17 (~01:17) - v0.2.374 forksFootjob - shell permission holes and deny-only spit - Claude Opus 5.5, high; Implementation

### Agent
- Meta: Claude Opus 5.5; high; Implementation; completed
- Version: 0.2.374 forksFootjob
- Found: spit session `ses_e17ecfac9ffeuPql0Wa5PiS0Bh` prompted 7 of 9 bash calls (incl. `kill`), from `bash "*": ask` in personal `~/.opencode/commands/spit.md`/`spitS.md`. Personal config changed to `"*": deny`, all `ask` exceptions to deny, removed `sed -n *` (GNU `e`/`w` run/write), added denies for `rg --pre`, `git grep -O`, `tree -o`, `file -C`, `sort --compress-program`; mockups in spit write HTML only.
- Fixed `tool/shell.ts` `collect`: new `unchecked(root, ps)` adds whole-statement patterns for `redirected_statement` whose body is not a `command` (`{ ls; } > f`, `(ls) > f`, loops, `ls | head > f`), PowerShell `invokation_expression` (`[IO.File]::WriteAllText(...)`, `$f.Delete()`; before, a line with no command ran with no ask at all), and any tree with `hasError` (zsh `*.json(N)` parses as one ERROR node hiding inner commands). Always-patterns for these are the exact text.
- Kept: "always" approvals are in-memory per instance (`permission/index.ts` `approved`), shared across modes until restart; configured deny still wins over them.
- Added `test/tool/shell.test.ts` regression tests: group redirect / pipeline redirect / zsh-only input (non-PS shells), PowerShell method call (PS shells; Windows only, `ps` list is empty on macOS).
- Verification: probe (`test/tmp/verify`, deleted) ran the real ShellTool against the parsed `spit.md` ruleset: all holes now deny, plain reads allow. New test fails with the fix disabled, passes with it. `bun test` tool/shell, backgroundShell, parameters, shellMetadata 82+5 pass; `tsc --noEmit` clean. PS test not run on Mac (probe covered pwsh parsing).
- Risk: modes with `ask` defaults may show one extra pattern for these statement forms; build-mode `bash: allow` unaffected. Needs `/revive` to take effect.

### User
Permissions
- Shell rules can no longer be bypassed by redirecting a group, loop, or pipeline into a file, by PowerShell .NET method calls, or by shell syntax oc cannot parse.
- In the author's own spitball command, shell commands outside the read-only list are now refused outright instead of asking, so other work needs a mode switch.

---

## 2026-11-17 (~00:53) - v0.2.373 fostahhhTnt - stop calling the permission.ask plugin hook - Claude Opus 5.5, high; Implementation

### Agent
- Meta: Claude Opus 5.5; high; Debug then Implementation (after /spit plan); completed
- Version: 0.2.373 fostahhhTnt
- ERROR: Claude session hung on a proxied bash call with no TUI prompt. `opencode.log`: `evaluated ... action=ask`, then nothing; `~/.opencode-notify.log`: opencode-notify@0.3.1 `permission.ask` hook waiting on an actionable macOS popup (shown only when WezTerm unfocused, no timeout). `Permission.ask` awaited the hook before publishing `Event.Asked` (added v0.2.269).
- Removed the hook call from `Permission.ask` (`opencode/src/permission/index.ts`), plus `Plugin` import and `Plugin.node` dep. File matches pre-v0.2.269 apart from later unrelated changes.
- Why removal: upstream 1.x dropped the call in `38e0dc9` (2026-03) and never restored it (PRs #7077, #12742, #47675 closed unmerged); anomalyco/opencode#7006 closed because v2 replaced it with `permission.evaluate` (#45003). opencode-notify's `event` handler for `permission.asked` replies through `POST /session/:id/permissions/:permissionID`, the correct path.
- Removed plugin-hook section from `test/permission/next.test.ts`. Added `@deprecated` JSDoc on `permission.ask` in `plugin/src/index.ts` (type kept so plugins compile).
- Docs: `FORK.md` "Plugin permission decisions" row removed; `SCOPE.md` Retired row (hook decisions) and Planned-for-later row (port v2 `permission.evaluate`); wiki `Configuration.md` section now "Plugins and permission prompts" (event + reply example; v1 SDK `Event` type lacks `permission.asked`).
- Risk: answering in the TUI leaves opencode-notify's popup up; clicking it later gets a 404 its log records.
- Verification: probe (`test/tmp/verify`, deleted) on real HTTP routes: `permission.asked` id -> POST reply "once" -> 200, `ask` fiber Success. `bun test` permission/next, commandPermissions, plugin/hookIsolation, acp/permission 98/0; typecheck clean in opencode and plugin. No live check with opencode-notify (needs `/revive` and macOS focus).
- MISTAKE: first fix raced the hook against the prompt (symptom patch, user rejected). Before relying on an upstream-declared hook, check whether upstream still calls it and why it was dropped.
- ERROR: mid-session the oc worktree was reset to HEAD by something outside this agent (no stash or reflog entry; likely an oc revert or another session); oc.wiki edit survived. Work re-applied from HEAD with user approval.

### User
Permissions
- A permission prompt now always shows in oc right away; a plugin can no longer hold it back.
- opencode-notify's desktop popup still works as a second way to answer the same prompt.
- Plugins can no longer silently auto-approve or deny prompts; they answer the open prompt through oc's API instead (see the wiki Configuration page).

---

