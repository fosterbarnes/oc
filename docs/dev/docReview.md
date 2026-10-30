# 0.2.x documentation review before 0.3.0

Status: findings collected and pre-planned on 2026-10-28 at v0.2.320. A final spot-check of 16
cited claims found 2 wrong citations (C4, A4 path), both corrected here.
Review in progress: you answered D1, D4, D6, D7, D8, D9. D7 is applied (SCOPE.md S1-S4, S7, S11).
D8 and D9 turned into code changes; see their sections. Everything else is still unedited.
After execution this file can be deleted (git keeps it).

## How to use this file

1. **You (review):** read the Decisions and skim each table. Strike a row (`~~F7~~`) to reject
   it, or edit its Fix text. Rows marked **YOU** need your input; everything else has a default.
2. **Executor (agent):** apply every row that is not struck, in the order of "Execution". Each
   row cites the evidence used; re-read the cited source line before editing, because some
   findings are medium confidence (`med`).

How the findings were made: a scratch scan of all fork-owned docs (links, anchors, file paths in
backticks, retired terms, TODO markers, em dashes, FORK.md level counts, script coverage), then
13 read-only subagent passes that checked each doc against source, plus a coverage pass over every
user-visible change from v0.2.177 to v0.2.320. The highest-impact claims were rechecked by hand
(Third party updates group, keybind defaults, `4097`, `revive.build.debug`, `configDirectory`,
FAQ base version, `killTuis` default, Todos label, `MSIRESTARTMANAGERCONTROL`).

Scope: README.md, FORK.md, SCOPE.md, AGENTS.md, SCRIPTS.md, UPSTREAM-SYNC.md, CONTRIBUTING.md,
SECURITY.md, docs/wezterm.md, docs/dev/*, .github templates, fork-owned docs under `src`, and the
wiki (`..\oc.wiki`, 18 pages). Not reviewed on purpose: upstream-identical docs under `src` and
`.opencode` (glossary, upstream commands), buildNotes archives (never edited), and
docs/keybinds.md (generated; `prePush.ps1` checks it).

## Decisions (defaults I chose; change them here before execution)

| ID | Decision | Why |
|---|---|---|
| D1 | **Answered:** 0.3.0 is Windows only; Linux and macOS ship before 0.4.0. Applied through R1, W-FAQ-3, S9, D-V030. | README said parity in 0.3.0; v0.3.0.md:59 said "not a requirement yet". |
| D2 | Keybind defaults get one source: generated docs/keybinds.md. Wiki Keybinds.md keeps behavior notes and links to that file for the full table. Configuration.md drops its per-keybind default rows and links there too. | Hand-copied defaults drifted: 7 wrong rows in Configuration.md, 3 in Keybinds.md. The generated file cannot drift (prePush checks it). |
| D3 | FORK.md bar: add a row only for something a user can invoke or configure; fold smaller behavior into an existing row; skip internal reliability fixes. | FORK.md:285 already says small fixes are support, not rows. Keeps the row count meaningful. |
| D4 | **Answered, widened:** a hard line between shipped oc and your personal config, applied to every doc and enforced going forward. Full sweep and rule text in "D4 detail". | FORK.md defines shipped oc; personal agent policy lives in `~/.config/opencode`. |
| D5 | docs/dev: keep procedures (claudeTestFlow, vmAcceptance) and v0.3.0.md (milestone record). Delete superseded plans after moving any still-real open item to FORK.md or SCOPE.md. | Git keeps history; stale plans cost review time and one cites a deleted file. |
| D6 | v0.3.0.md keeps its item history (sections 1-11, the record of what 0.3.0 contains). Three stale parts change: "Current state" (lines 16-56) and "Before tagging v0.3.0" (497-502) are replaced by the one turnover gate below, and the WezTerm Lua copy (233-246) becomes a link to docs/wezterm.md. | Those sections describe a 2026-10-03 snapshot (CI, ocdebug, both since removed). Two release checklists would drift; the Lua copy is older than docs/wezterm.md (no `oc_tui`, no `⦿`). |
| D7 | **Done.** SCOPE.md Since/Retired now hold real release numbers from git and build notes (`v0.1.2` ... `v0.2.281`); `before vX` only where the release is not recorded. SCOPE.md was created in v0.2.174 (commit `4a92c63`), not v0.2.173. | Column mixed `v0.1`, `0.3.0`, `0.2.213`, dates, and blanks. |
| D8 | **Determined:** keep the background shell; remove the `/bgRun` toggle and its `bgRun` permission gate (code change). See "D8 detail". | Heavily used (213 background runs in 38 sessions since v0.2.177); the toggle is a broken leftover of the retired bgShell plugin. |
| D9 | **Determined:** move sidebar storage onto oc paths with a one-time migration, drop the project override file and the legacy reads (code change). See "D9 detail". | Every project file on this machine is plugin-era state, not a hand-written override. |
| D10 | Not now: shortening FORK.md rows to 1-2 sentences plus a wiki link, and adding a link/anchor check to prePush. Listed under Follow-ups. | Both reduce future drift but are larger than this pass. |

## 0.3.0 turnover gate (proposed text for docs/dev/v0.3.0.md)

Replaces v0.3.0.md "Current state" (lines 16-56) and "Before tagging v0.3.0" (lines 497-502).

1. This review applied (all sections below, including the D8 and D9 code sessions) and the wiki
   pushed.
2. Live checks pass (user-owned; v0.3.0.md table updated):
   1. `/revive-no-install` from a session and from Home in Windows Terminal, WezTerm, and conhost:
      a visible oc window returns on the same session (or Home); unrelated terminals stay open.
   2. Agent asks a question, close the window, reopen with `occ`; repeat after a server restart:
      the question is back, and after the restart it shows as restored.
   3. Two sessions on different models and reasoning: sidebar rows match the prompt footer.
   4. Send a turn: that provider's usage updates within about a minute; stale rows dim.
   5. `task_batch`: sub-agents show live status in the sidebar, click opens the child.
   6. Tab marker in WezTerm, Windows Terminal, conhost: `■` (oc) or `⦿` (opencode); WezTerm
      colors it per agent; progress ring while busy where supported.
   7. `openEditedWith` map: a `.md` and a `.ts` path open in their mapped editors.
   8. `intro.background` `terminal` vs `black` (`config/oc.ts:25`).
   9. Claude Code session, `/agent-revive-no-install`: permission prompt, then revive after the turn.
   10. Windows Terminal: a script opens in a tab and in a split.
3. Known failing tests (AGENTS.md "Known failures", the `tuiPane.test.ts` entries): fixed, or
   accepted for 0.3.0 by you.
4. First release with the setup exe is published, then README.md:94-101 and Install.md:18-20
   `TODO(release)` notes are resolved (R4, W-INS-1).
5. **YOU:** version mechanism. `bumpVersion.ps1` only bumps the patch and AGENTS.md forbids hand
   edits of `src/.version/version`. Pick one: add `bumpVersion.ps1 -Minor` (sets `X.(Y+1).0`,
   rolls the tag; small script change, its own session), or approve a one-time hand edit.
   `readmeVersion.ps1` then updates README on the next push.

## D4 detail: shipped oc vs personal config

Rule, added to FORK.md "How rows are chosen" (replacing the sibling-project rule at :42 and :286)
and as one line in AGENTS.md's doc rules:

- **Shipped** is code under `src/`, repo scripts, the installer, and tracked repo files.
  **Personal** is anything that exists only because of `~/.config/opencode`, `~/.opencode`,
  `~/.claude*`, the PowerShell profile, or `Documents\Batch Files`: agents, model routing, skills,
  slash commands, principles, scripts.
- FORK.md, SCOPE.md, README, and the wiki describe shipped oc. A personal command appears only as a
  labelled example of something the user defines, never as a feature.
- Shipped code does not hardcode personal names (skill, command, or agent names, model aliases,
  personal paths). Today's exceptions are K1.
- External companion projects (octray, Crow, mcp-everything-search) live on wiki
  Companion-Tools.md, not in FORK.md.

Sweep: 118 FORK rows = 109 shipped, 3 personal, 6 mixed. Full table with evidence:
`%TEMP%\ocDocCheck\d4.md` (scratch, not committed).

| ID | Where | Fix |
|---|---|---|
| FD1 | FORK:188 Debug and Luna routing | Delete (replaces F3). |
| FD2 | FORK:199 Hide stock Plan agent | Delete (replaces F4). Agent `disable: true` is an upstream feature; no row needed. |
| FD3 | FORK:92 Windows tray (octray) | Delete; octray goes on Companion-Tools.md as external, not bundled. Resolves the F12 **YOU**; F12's row-89 fix stays. |
| FD4 | FORK:80 Run after turn and revive | Keep: terminal-aware restart/build/install revives, ordered revive chains, `run_after_turn` behind its permission. Drop the `/agent-revive*` names and allowlisted script paths (personal: `opencode.jsonc:35-38`). |
| FD5 | FORK:155 Everything Search | Keep: sidebar search through Everything's `es.exe` with missing-service reporting (`roots.ts:56-120`). MCP daemon and sort-API claims move to mcp-everything-search on Companion-Tools.md. |
| FD6 | FORK:183 Cheap vs hard delegated models | Keep: child agents run their own model and reasoning, with a per-task override (`task.ts:74-99`). Drop the cheap/hard policy; consider folding into row 184. |
| FD7 | FORK:189 Plan-only command permissions | Keep: command frontmatter sets turn-scoped permissions and tool host, carried into sub-agents and compaction (`command/index.ts:51-55`). `/spit`, `/imp` only as user-defined examples. |
| FD8 | FORK:215 Keys and command palette | With F6: chains of "commands you define", not `/spit /think`. |
| FD9 | FORK:258 Kill all AI processes | Drop the profile `killai` function; keep the palette actions. |
| FD10 | FORK:5, 283 | :5 "custom planning agents" -> "configurable agents and command permissions"; :283 drop global agents from the source criteria. |
| FD11 | README:20 | `/spit /think` -> placeholders, or "your own commands". |
| FD12 | SCOPE.md Retired | Delete "Open Computer Use MCP" and "ocdebug PowerShell wrapper function": a global MCP install and a profile function were personal setup. |
| FD13 | Wiki Agents-and-Skills.md:5-7, 13-16 | With W-AGS-1: built-ins are `/init`, `/review`; the author's `/spit`, `/think`, `/imp`, `/pass`, `/agent-push` are not bundled; examples use placeholders. |
| FD14 | Wiki Launching.md:73-85; Sessions.md:97-98, 134-138, 201-203 | Mark examples as user-defined; `/revive` is the only built-in in those chains; `/verify` is a personal skill. |
| FD15 | Wiki Sessions.md:34-45 | With W-SES-5: oc recognizes a command named `agent-push` (K1); the workflow is the user's. |
| FD16 | Wiki Companion-Tools.md:7 | "Debug agents" are your global profiles: remove, or list only if published. |
| FD17 | Wiki Why-I-Made-oc.md:33-45 | One line: these are the author's subscriptions and habits, not requirements (as FAQ.md:1-4). |
| FD18 | `.opencode/` | All tracked, none personal. Upstream maintainer leftovers listed under Follow-ups. |

Shipped code that hardcodes a personal workflow (a code session, not docs):

| ID | Where | Change |
|---|---|---|
| K1 | `session/prompt.ts:1967-1978`, `tool/sessionComplete.ts:8-69`, `tool/session-complete.txt:1`, `tui/src/agentPushAutoDelete.ts` | oc special-cases a command named `agent-push` (push title, push metadata, upstream HEAD check, auto-delete), and the `session_complete` text every model sees names agent-push. Replace the name check with a command/skill frontmatter flag (for example `pushSession: true`) that your skill sets; make the tool text generic. **YOU:** in the 0.3.0 gate or after (default: after). |
| K2 | `session/titleGen.ts:26-30`, `agent/agent.ts:283-299` | Title fallback and rename-agent default models are shipped defaults, not personal routing. Keep; make sure FORK row 133 names them and the `rename` agent override. |

## D8 detail: background shell and `/bgRun`

What exists: `bash` with `background: true` starts a job and returns at once; logs go to oc's
state folder and an exit notice wakes the session (`tool/shellJobs.ts:65-96`). `bgStatus` and
`bgKill` read and stop jobs (`shellJobs.ts:98-144`). `session_background` (Ctrl+B) moves a running
call into a job. Upstream has no background shell. In Claude Code turns Claude's own Bash does
background work and oc drops `bgStatus`/`bgKill` (`proxyToolSelection.ts:123-126`), so oc's jobs
serve the native-loop agents (GPT, Grok, Muse, ...). `/bgRun` (`ocCommands.tsx:965-1003`) writes
`permission.bgRun/bgStatus/bgKill` = allow or deny to global config; `bgRun` is checked in
`shell.ts:332-342` before the normal bash check.

Usage, read-only query of `oc.db` since 2026-10-13: 213 background `bash` runs in 38 sessions (last
2026-10-27), 229 exit notices, `bgStatus` 78 calls in 26 sessions, `bgKill` 4, Ctrl+B moves 6.

Determination: keep the background shell. Remove `/bgRun` and the `bgRun` gate, because:

1. Off is broken: denying `bgRun` leaves `background` in the bash schema and prompt
   (`shell/prompt.ts:26-36`), so models still try and get denied.
2. Defaults already allow it (`agent.ts:147` `"*": "allow"`); On just writes explicit allows.
   FORK.md:224 and Sessions.md:237 say background runs ask by default, which is false.
3. A background command already passes the normal `bash` permission with the same patterns
   (`shell.ts:344-352`); under `"*": "ask"` the gate is a second prompt for one command.
4. It is named after the retired bgShell tool: dialog "bgRun tool", group "Tools (experimental)"
   with no other entry.

Rejected alternative: make Off truly remove `background` and the two tools. Nobody turns it off
(your config pins allow) and it adds a schema switch with no current use.

| ID | Where | Change |
|---|---|---|
| B1 | `opencode/src/tool/shell.ts:332-342` | Delete the `bgRun` ask block. |
| B2 | `tui/src/ocCommands.tsx:965-1003` | Delete the `oc.bgrun` entry. |
| B3 | `opencode/test/tool/backgroundShell.test.ts:335` | Intended change: retarget "denied bgRun permission starts no job" to a denied `bash` permission (keeps the contract that a denied background command starts no job). |
| B4 | Docs | FORK.md:224 drop the `/bgRun` sentence and the "ask by default" claim. Sessions.md:236-237 and Agents-and-Skills.md:114: "Background runs use the normal bash approval." (replaces W-SES-1, W-AGS-8). SCOPE.md Retired: add "`/bgRun` palette toggle and `bgRun` permission \| <release> \| Normal `bash` permission" (replaces S5). |
| B5 | Your config (you, not the agent) | `~/.config/opencode/opencode.jsonc:32` `bgRun` key becomes dead (harmless); its line-87 comment no longer applies; `~/.config/opencode/AGENTS.md:37` drop "`/bgRun` is the user's palette switch". |

## D9 detail: sidebar settings storage

Current state (audit `%TEMP%\ocDocCheck\d9.md`, scratch; rechecked `settings.ts:372-481`):

- User settings: `~/.config/openSidebar/config.json`, outside oc's config folder. Four save
  functions hardcode that path (`settings.ts:448-474`) instead of using `sidebarConfigPaths`.
- Project file `<project>/.config/openSidebar.json`: no longer written since v0.2.309, still read
  on every load as an override.
- Per-project state `~/.local/state/opencode/sidebar/<hash>.json` (`settings.ts:384-386`): written
  since v0.2.309, but none exist on this machine yet; pins still come from the old files.
- Cursor usage token: `~/.config/openSidebar/cursor-session` (`cursorToken.ts:11-12`), a secret in
  a config folder.
- Legacy reads: top-level `showMcp`/`showLsp`, `fileRootPins`, `fileRoots.*.customRoots`, kv
  `opencode-sidebar-tools:*` (40 keys here), JSON `cursorSessionToken`, a dead plugin-options stub
  (`sidebarTools.tsx:123-131`).
- 46 projects under Documents\GitHub have `.config/openSidebar.json`. All are plugin-written
  state (pins, roots, `projectDirectory`) plus a copied `visibility` (MCP on, LSP off); two hold a
  default `scripts` copy. None is a hand-written override.

Determination:

- User settings move to `~/.config/opencode/sidebar.json`. Not `tui.json`: sidebar UI writes
  (usage providers, subscriptions, spacing, scripts) would live-reload every open TUI, the class of
  bug fixed in v0.2.320. Not `oc.json`: that is the launcher/server file.
- Drop the project override file: no real override exists, and per-project state already has its
  own oc-owned file.
- Cursor token moves to `Global.Path.data` next to `auth.json`; config folders get synced.
- One-time migration (pattern: `opencode/src/config/tui-migrate.ts`), then delete the legacy reads:
  1. New user file missing, old exists: normalize it (fold `showMcp`/`showLsp` into `visibility`;
     drop the state keys `scriptPins`, `fileRootPins`, `favoriteFileRoots`, `recentFileRoots`,
     `fileRoots`), write `sidebar.json`, move the Cursor token.
  2. Project opened with no state file: import pins, favorites, and roots from that project's
     `.config/openSidebar.json` and its kv keys, write the state file. Mark `TODO: remove at 0.4.0`.
  3. Copy, never delete: old files stay; the session reports none of them as removed.
- While there: one `saveUserSidebarSetting(key, value)` replaces the four save functions; delete
  `hasConfiguredScripts` and the stub with the kv fallback; visibility stays file-only (document
  it); rename `openSidebar.test.ts` to `sidebarSettings.test.ts`; keep `OPEN_SIDEBAR_LICENSE.md`.

| ID | Where | Change |
|---|---|---|
| SB1 | `tui/src/routes/session/sidebar-tools/settings.ts` | New paths, migration helper, single save function, legacy normalize branches removed. |
| SB2 | `sidebar-tools/cursorToken.ts` | Token in the data folder; migration moves the old file. |
| SB3 | `sidebar-tools/sidebarTools.tsx:105-131, 269-312` | Delete kv legacy keys and the stub; call SB1's per-project import. |
| SB4 | `tui/test/feature-plugins/openSidebar.test.ts` | Rename and update paths. One migration test is worth keeping: old file -> new file and state, old file untouched (guards data loss). |
| SB5 | Docs | Wiki Sidebar.md (paths, `usageSpacing`, no `configDirectory`, visibility file-only, pins in state; replaces W-SBR-1, -2, -6); Configuration.md:4, 13 (replaces W-CFG-1); SCOPE.md Retired: "`~/.config/openSidebar` folder and project `.config/openSidebar.json` override \| <release> \| `~/.config/opencode/sidebar.json` and per-project state" (replaces S6). |

Risk: two TUIs migrating at once (write only if missing, through the atomic `writeJsonObject`).
Live data here is only on the old paths: copy, re-read, and compare before trusting the new file.

---

## M. Cross-cutting results

| ID | Result | Action |
|---|---|---|
| M1 | Em dashes: none in any scoped doc. | None. |
| M2 | Broken links: wiki Developing.md:4 (`README.OG.md`, retired v0.2.173), Sessions.md:80 (target is literally `url`), v0.3.0.md 11 source links to moved files. Editing-This-Wiki.md:25 `Page-Name` hits are examples, not links to fix. | W-DEV-1, W-SES-2; v0.3.0.md links stay (historical banner already says lines are stale). |
| M3 | TODO markers in published docs: README.md:94, Install.md:20, FAQ.md:13, Companion-Tools.md:3, Why-I-Made-oc.md:15. | Gate item 4 for the release ones; **YOU** for the other three (W-FAQ-2, W-CMP-1, W-WHY-1). |
| M4 | FORK.md counts table says 16 / 61 / 33 / 8 = 118. Rows are 15 ~done~, 60 high, 34 medium, 8 low = 117 active, plus 1 row with level `removed` (line 114). | F0: recompute after all F rows. |

## R. README.md

| ID | Line | Fix | Evidence | Conf |
|---|---|---|---|---|
| R1 | 5 | Replace with: `Not ready for widespread use until 0.3.0. oc 0.3.0 is Windows only (Windows 10 and 11); Linux and macOS support is planned before 0.4.0.` (D1). At turnover, drop the first sentence. | D1 | high |
| R2 | 42-51 | `under Manage Third Party Harnesses` -> `under **Third party updates**` (6 lines). | `ocCommands.tsx:1130` group `"Third party updates"` | high |
| R3 | 121-122 | `Stop it with oc --kill-server or from ctrl+o.` -> `Stop it with oc --kill-server (this also closes this instance's oc windows) or from ctrl+o.` | `resident.ts:610` `killTuis ?? true`; matches Launching.md:20 | high |
| R4 | 94-101 | Gate item 4: once the setup exe is on Releases, delete the `TODO(release)` comment. Until then the zip text must not say the zip lacks `oc.exe`: packaging ships it (`scriptHelper.ps1:173-179`). | `.installer/oc.installer.iss:70,222-224` | high |
| R5 | 103-105 | Name the real assets: `opencode-v<version>-<tag>-windows-x64.zip` (oc) and the native zip (`opencode.exe` only). Same fix in Install.md:48. | `pushRelease.ps1:17-19,46` | med |

## W. Wiki (`..\oc.wiki`)

### Configuration.md

| ID | Line | Fix | Evidence | Conf |
|---|---|---|---|---|
| W-CFG-1 | 4, 13 | Replaced by SB5 (D9): after the D9 code session the row is `%USERPROFILE%\.config\opencode\sidebar.json`. | D9 | high |
| W-CFG-2 | 34, 36 | Delete the `revive.build.debug` row. `revive.build` values: `` `false` or `{ "source": "<absolute-folder>" }` ``. Keep the ask-on-first-`/revive` sentence. | `revive.ts:203-213` (leftover `debug` ignored) | high |
| W-CFG-3 | 30 | `server.port` default: `4096` (drop `4097` debug). | `oc.ts:28-30`; no `4097` in source | high |
| W-CFG-4 | 39 | "separate production/debug entries" for sign-in startup: debug flavor is retired. Re-read `startup.ts:30-55` and drop the debug half. | SCOPE.md:89 | med |
| W-CFG-5 | 120-161 | D2: delete the keybind default rows (they include `oc_reasoning_effort`, which does not exist, and six `<leader>` defaults that are really `none`, `keybind.ts:96-101`). Replace with one line linking docs/keybinds.md plus the `keybinds.<name>` syntax note. | `keybind.ts:45-281` | high |
| W-CFG-6 | 23-37 | Add oc.json row: `claudeFailover` \| `auto` or `ask` \| `auto` \| On a Claude usage limit, continue on the next login automatically, or ask which login to use. | `oc.ts:13-15,70-72` | high |
| W-CFG-7 | 116-117 | Add `subagent_tabs.return_to_parent` \| Boolean \| `true` \| Return to the parent session when a sub-agent you are viewing finishes. | `config/index.tsx:70-72,199-202` | high |
| W-CFG-8 | 49-71 | Add `subagent_depth` (non-negative integer, default `1`) and `permission.session_in_progress` / `permission.session_reopen` (`allow`/`ask`/`deny`, default follows `*`). | `config.ts:112-114`; `permission.ts:35-37` | med |
| W-CFG-9 | 107-161 | Add `prompt.max_width` (positive integer or `auto`). | `config/index.tsx:58-60` | med |
| W-CFG-10 | 118 | Smooth streaming: "about 130 ms behind" -> "reveals a quarter of the unshown text every 33 ms, so it trails arrival by a few frames". | `smoothText.ts:3-19` | med |

### Sessions.md

| ID | Line | Fix | Evidence | Conf |
|---|---|---|---|---|
| W-SES-1 | 236-237 | Replaced by B4 (D8): one bullet, "Background runs use the normal bash approval." | D8 | high |
| W-SES-2 | 80 | The example `[label](url)` renders as a link to `url`. Write it as code inside text: `` a bare URL or a markdown `[label](https://...)` link ``. | scan | high |
| W-SES-3 | 29 | Add: `While a folder starts up, the picker shows Creating session in <folder> and ignores input.` | `ocCommands.tsx:102-117` (v0.2.312) | high |
| W-SES-4 | 179 | Scheduled prompts: "checks every few seconds" is old. Say the server waits until the next due time, wakes when the queue changes, and rechecks other hosts every minute. | v0.2.221 entry; re-read `queue.due`/`fireDue` | med |
| W-SES-5 | 34-37 | Agent-push renaming happens only when the push runs as the session's first message; a push later in a session keeps the title. | `session/prompt.ts:1967-1978` (v0.2.261) | med |
| W-SES-6 | new | Add section "Clean up completed sessions": palette entry archives or deletes completed sessions in this folder or all folders; skips the current, busy, pinned, and unreachable ones; asks first. | `dialog-session-cleanup.tsx:19-85`; `ocCommands.tsx:355-363` | high |

### Sidebar.md

| ID | Line | Fix | Evidence | Conf |
|---|---|---|---|---|
| W-SBR-1 | 111-112 | Delete the two `configDirectory` sentences: nothing writes or reads it. (Done inside SB5.) | grep: no `configDirectory` in `tui/src` | high |
| W-SBR-2 | 79-104 | Add row: `usageSpacing` \| Boolean \| `false` \| Blank line between usage provider groups. (Done inside SB5.) | `settings.ts:52,231,364` | high |
| W-SBR-3 | 17 | `**Enable todos**` -> `**Todos**` (the confirm dialog says Enable todos?). | `todos.ts:38,52` | high |
| W-SBR-4 | 15 | Drop `(beta)` from Plugins. | `plugins.tsx:69-70` | high |
| W-SBR-5 | 10 | Add: `**Sidebar button style** in ctrl+o (/sidebarButtonStyle): Outline or Minimal (default Minimal).` | `ocCommands.tsx:577-604` | high |
| W-SBR-6 | 98-103 | Replaced by SB5: those keys become state-file only. | D9 | high |

### Claude-Code.md and Cursor.md

| ID | Line | Fix | Evidence | Conf |
|---|---|---|---|---|
| W-CC-1 | 39-41 | After the auto-switch sentence: `Palette **Claude account failover** (oc.json claudeFailover, default Auto) can be **Ask**: pick the login inside the running turn; **Stop** ends the turn so auto-resume can wake it.` | `claudeCommands.tsx:113-147`; `failoverQuestion.ts` | high |
| W-CC-2 | 31-46 | Name all three entries: **Switch Claude account**, **Switch Claude account (this session)**, **Claude account failover**; they appear only with two or more `accounts`. Add: a switch waits until the running turn and its background work finish. | `claudeCommands.tsx:30-72,195-203` | high |
| W-CC-3 | 31-46 | Add: the default login is `CLAUDE_CONFIG_DIR` when set, else `~/.claude`; `~/.claude` can also be listed as its own pool account. | v0.2.206 | med |
| W-CC-4 | after 19 | Add **Steering**: a plain message sent while a Claude turn runs is delivered at the next tool boundary; a message with different permissions, tools, model, or agent waits and runs next. | `steering.ts:1-4`; `shared.ts:86-105` | high |
| W-CC-5 | 202 | `Task` adds `task_batch` and `task_cancel`; `schedule` adds `schedule_prompt`, `schedule_list`, `schedule_cancel`. Add `task_cancel` to the names list. | `spawnPlanning.ts:160-168`; `proxyToolDefs.ts:269-320` | high |
| W-CC-6 | new | Add a short note: a command's `toolHost` (`auto`/`oc`/`harness`) picks Claude's built-in tool or oc's proxy for that turn. | `command/index.ts:51-55` | high |
| W-CC-7 | new | Add section **Models**: Claude models come from the models.dev catalog (effort levels, Fast twins); **Update model list** under Third party updates refreshes it when no session is running. | `models.ts:116-147`; `ocCommands.tsx:1096-1100` (v0.2.317) | med |
| W-CC-8 | new | Add: forking a Claude chat keeps its CLI conversation and rewinds it to the fork point. | `sessionManager.ts:602-625` (v0.2.253) | med |
| W-CUR-1 | 1-5 | Expand: Node.js on PATH runs `cursor-runtime`; **Update Cursor CLI** updates the agent CLI, not the editor; some Cursor-native actions are not bridged (screen and computer use, some shell variants); the picker can show live Cursor tiers. | `ocCommands.tsx:1084-1087`; `execVariants.ts:40-106` | high |

### Agents-and-Skills.md

| ID | Line | Fix | Evidence | Conf |
|---|---|---|---|---|
| W-AGS-1 | 5-6 | "oc ships no workflow commands" -> name the built-ins `/init` and `/review`, then "add your own Markdown under `commands` (singular `command` also loads)". | `command/index.ts:113-131`; `config/command.ts:11,23` | high |
| W-AGS-2 | 42, 63-65 | Say `agents/` or `agent/` (and `modes/`/`mode/` for primary modes). | `config/agent.ts:191-213` | high |
| W-AGS-3 | 15-16 | Alt+Enter does queue server slash commands and revive chains now; only shell and other TUI-only commands are refused (matches Sessions.md:138-141). | `prompt/index.tsx:1327-1360` (v0.2.311-313) | high |
| W-AGS-4 | 54 | Subagent dialog: Enter on native `general`/`explore` opens a model then reasoning picker (with **Auto**); Enter copies only for file agents. Re-read before writing. | `dialog-subagents.tsx:164-201` (v0.2.232-233) | med |
| W-AGS-5 | 77-79 | Esc is staged: the first stop ends the main turn, a second stops background sub-agents; in a child view Esc stops only that child. `task_cancel` stops one sub-agent. | `prompt/index.tsx:591-608`; `taskCancel.ts:23-33` (v0.2.301) | high |
| W-AGS-6 | 83-86 | Update the prompt-bar example: running duplicates are numbered oldest first and renumber when one finishes; a single running sub-agent shows model, effort, and tokens. | v0.2.258, v0.2.288 | med |
| W-AGS-7 | new | Add **Live sub-agent cards**: a running `task` line becomes a live panel; `/subagentRows` sets its height (off or 2-10, default 4). | FORK.md:151; v0.2.238, v0.2.285 | high |
| W-AGS-8 | 114 | Replaced by B4 (D8): drop the bgRun sentence. | D8 | high |

### Keybinds.md, Install.md, Launching.md, FAQ.md, Developing.md, Home.md, others

| ID | Line | Fix | Evidence | Conf |
|---|---|---|---|---|
| W-KEY-1 | 28-30 | Replace the `ctrl+x d/v/w`, `j/k`, `o/i` rows: these are `ctrl+o` entries **Model**, **Agent**, **Subagent agent**, **Subagent model**, **Home folder**, **Home sort order**, unbound by default. There is no default-reasoning entry. | `keybind.ts:96-101`; `keybindPreset.ts:8-33` | high |
| W-KEY-2 | page | D2: add a line linking docs/keybinds.md as the full oc vs opencode table; keep this page to behavior differences. | D2 | high |
| W-INS-1 | 18-20 | Gate item 4 (`TODO(release)`). | - | - |
| W-INS-2 | 12 | "Image paste with ctrl+v needs WezTerm": verify in Windows Terminal before changing. WT binds `ctrl+v` to its own text paste, so the claim may be right; if so, say why. | `clipboard.ts:67-75`; `keybind.ts:189` | low |
| W-INS-3 | 67-70 | Font menu: **Size +0.5** / **Size -0.5**; the size prompt takes 4-48 pt in steps of 1. | `ocCommands.tsx:793-820` | high |
| W-INS-4 | 48 | Asset names, same as R5. | `pushRelease.ps1:17-19,46` | med |
| W-LAU-1 | 40-42 | Theme dialog titles are **Themes** and **opencode theme**. | `dialog-theme-list.tsx:9-37` | med |
| W-FAQ-1 | 8 | `OpenCode 1.18.29` -> `OpenCode 1.19.3`. | `src/packages/opencode/package.json` version `1.19.3` | high |
| W-FAQ-2 | 13 | **YOU:** review the Claude-subscription answer, then delete the `TODO(user)` comment. | M3 | - |
| W-FAQ-3 | 34-36 | `Not currently. oc 0.3.0 is built and tested on Windows only; Linux and macOS support is planned before 0.4.0.` (D1) | D1 | high |
| W-DEV-1 | 4 | Remove the `README.OG.md` bullet (retired v0.2.173). | archive10:1078 | high |
| W-DEV-2 | 15-16 | Paths: `src/.version/version`, `docs/buildNotes/buildNotes.txt`, `docs/buildNotes/buildNotes.md`. | `scriptHelper.ps1:29-34` | high |
| W-DEV-3 | 8-13 | Bun line: `Bun, not 1.4.0 (the workspace pins 1.4.2; build scripts upgrade a 1.4.0 PATH bun to canary).` Link Install.md's developer dependencies instead of a partial list. | `src/package.json:7`; `scriptHelper.ps1:119-136` | med |
| W-HOME-1 | 19-31 | Add a Companion Tools row to the topic index. | README.md:142 links it | low |
| W-TRB-1 | new | Add the missing-Jev-key toast: set `TYPESAFE_API_KEY` and restart. | `proxyToolSelection.ts:267` (v0.2.246) | low |
| W-CMP-1 | 3 | **YOU:** add links for companion tools you will publish, drop the rest, delete the `TODO(user)` comment. | M3 | - |
| W-WHY-1 | 15 | **YOU:** remove the inline `(todo: ... benchmarks ...)` or add the numbers. | M3 | - |

## F. FORK.md

Line numbers are current FORK.md lines. Do not change levels on your own: rows marked
"level review" list the evidence; you decide.

| ID | Line | Row | Fix | Evidence | Conf |
|---|---|---|---|---|---|
| F0 | 9, 27-34 | Header | `Last reviewed: <date> (v<current>)`; drop the `.opencode/plans/lockCheck.md` sentence (file does not exist). Recompute the counts table last (M4). | scan | high |
| F1 | 114 | Work copies | Delete the row (level `removed`; already in SCOPE.md:51,72). | SCOPE.md | high |
| F2 | 93 | No browser/desktop app | Delete the row (an exclusion; SCOPE.md:18-24 covers it). | SCOPE.md | high |
| F3 | 188 | Debug and Luna routing | See FD1. | D4 | high |
| F4 | 199 | Hide stock Plan agent | See FD2. Removing it lowers ~done~ by one. | D4 | high |
| F5 | 117 | Queue prompts while busy | Replace the "revive chains are refused" clause: server slash commands queue or schedule; revive chains queue (not schedule) and an attached TUI runs them, then resumes the queue. Add the queue strip (up to three pending prompts plus a count; click opens Queued prompts). Replace the blanket live-check note with: Alt+Q delivery pane-verified (v0.2.305); multi-host and revive acceptance remain. | `sessionOc.ts:96-118`; `queueStrip.tsx:7-45`; v0.2.313-314 | high |
| F6 | 215 | Keys and command palette | Same queue correction as F5. Fold in: every oc palette entry shows a description or current value (v0.2.320); Esc steps back through nested menus and restores the position; typed commands collapse in the transcript and come back on edit, revert, or fork; About dialog. | `prompt/index.tsx:1327-1360`; v0.2.192, v0.2.240, v0.2.251, v0.2.320 | high |
| F7 | 84 | New-session project picker | Palette **New session** opens the folder picker, preselects the current folder, shows a locked spinner, and creates the session through the current connection; CLI palette launches open native `opencode`. Drop the tray claim. What's left: filter-then-Enter and Escape unchecked. | `ocCommands.tsx:83-143`; `oc.ts:227-240`; v0.2.312 | high |
| F8 | 65 | Update ChatGPT Desktop | Version now comes from the floating MSIX's HEAD response metadata (not `windows-store-update.json`); install verifies Authenticode, identity, publisher, version, provisions elevated, then registers for the user. | `chatgptDesktopUpdate.ts:12-82` | high |
| F9 | 62 | Update Claude Desktop | Install verifies Authenticode and publisher, provisions with admin approval, registers with ForceApplicationShutdown. Caveat: can close Claude Code sessions started from Desktop. | `desktopUpdate.ts:443-465`; `harnessUpdate.ts:116-120` | high |
| F10 | 66 | Update PowerShell | `MSIRESTARTMANAGERCONTROL=DisableShutdown` -> `MSIRESTARTMANAGERCONTROL=Disable`. | `pwshUpdate.ts:15,78` | high |
| F11 | 120 | Auto-resume | One **Claude auto-resume** dialog under Third party harness management toggles it and lists wakes to cancel; turning it off cancels queued wakes. | `claudeCommands.tsx:150-185`; v0.2.197, v0.2.263 | high |
| F12 | 89 | Server flags | CLI flags stop or restart the resident server without a TUI; `--shutdown-all` closes this instance's recorded oc terminals. No tray hooks exist in `src`. Row 92 (octray) is FD3. | `oc.ts:385-469`; `commandLoader.ts:85-89` | high |
| F13 | 55 | Claude account pool | "picks one by hand" -> "selects the global or session-pinned login; busy sessions apply it after the running turn and its background work finish". Add the `CLAUDE_CONFIG_DIR` default login. | `claudeCodeLanguageModel.ts:142`; `claudeCommands.tsx:46,91`; v0.2.206, v0.2.292 | high |
| F14 | 133 | Automatic session names | `` `title()` in `session/prompt.ts` `` -> `` `makeTitles()` in `session/titleGen.ts` ``. Fold in agent-push naming (pushed hash in the title; first message only). | `titleGen.ts:37-193`; v0.2.198, v0.2.261 | high |
| F15 | 80 | Run after turn and revive | "in the source folder" -> "from `<source>/src`". | `revive.ts:81-83,216-240` | high |
| F16 | 67 | Update progress and auto confirm | "Every Third party updates entry" -> "CLI and app updater entries" (Update model list is in that group). UAC caveat covers PowerShell, Claude Desktop, ChatGPT Desktop. | `ocCommands.tsx:1095-1130`; `desktopUpdate.ts:449-463` | high |
| F17 | 85 | Startup loading animation | Delete "(uncommitted)". | committed since v0.2.168 | high |
| F18 | 218 | Images in prompts | Preview is off by default (`/imagePreview`); clicking an image chip always previews. Delete "Uncommitted (0.2.166)". Fold in: submit and queue wait for a pending paste; fast `ctrl+v` then `ctrl+return` submits. | `ocCommands.tsx:652-662`; v0.2.234-235, v0.2.275 | high |
| F19 | 254 | Windows setup exe | Replace "not compiled with ISCC or run yet": installer builds and fresh-VM dependency runs passed; cancelled UAC, upgrade over running oc, uninstall remain. Fold in optional desktop shortcuts and parallel downloads. Level review: medium -> high? | archive15:501-511, 729-742; v0.2.295 | high |
| F20 | 156 | MCP connecting status | Delete the "direct MCP calls send ... only once" left item (fixed). | `session/tools.ts:412-415`; v0.2.269 | high |
| F21 | 145 | Click a path to open it | Transcript tool paths open on double-click; sidebar changed-file rows on click. | `routes/session/index.tsx:372-385`; `sidebarTools.tsx:706-713` | high |
| F22 | 160-161 | Todos | Palette entry is **Todos** (shows on/off). | `todos.ts:34-53` | high |
| F23 | 252 | Hidden Windows commands | Left item: interruption is a second Esc within 5 s (exists); keep only installed hidden-window acceptance. | `prompt/index.tsx:591-608`; v0.2.301 | high |
| F24 | 152 | Sub-agent tabs | `click` applies to transcript Task links; sidebar rows open inline; `return_to_parent` defaults true for inline child views. | `routes/session/index.tsx:2951-2954`; `subagents.tsx:97`; `config/index.tsx:70-71` | high |
| F25 | 144 | Plugins in the sidebar | Delete the extra sixth cell and "tui.json has none now". Level review: `low` means "not working", but the renderer exists. | `plugins.tsx:19-115` | high |
| F26 | 216 | Notices | "Every toast" -> "Toasts are kept by default (newest 100, this run); progress redraws opt out". Add the noticesPlan live checks to What's left (D-NOT). | `toast.tsx:104-118`; `updateProgress.ts:97-100` | high |
| F27 | 209 | Agent square | `■` for oc, `⦿` for native opencode; link docs/wezterm.md instead of v0.3.0.md for the tab-title setup. | `app.tsx:788-790`; docs/wezterm.md:24-63 | high |
| F28 | 118 | Scheduled prompts | Describe the deadline-driven loop (as W-SES-4) if the row still says polling. | v0.2.221 | med |
| F29 | 54 | Claude Code as the agent | Fold in: forks keep the CLI conversation and rewind to the fork point; shell runs show output blocks. | `sessionManager.ts:602-625`; v0.2.253, v0.2.318 | med |
| F30 | 150 | Subagent usage | Fold in duplicate numbering and the single-sub-agent detail format. | v0.2.258, v0.2.288 | med |
| F31 | 143, 154 | Sidebar, usage | Fold in usage calendar and subscription dates, sidebar button style, and sidebar state kept outside project folders. | `sidebarUsage.tsx:834-835`; v0.2.203, v0.2.309 | high |
| F32 | 214 | Keybind layouts | Fold in: oc layout Tab inserts a tab and Shift+Tab cycles agents; `/tabKey` picks the Tab action. | `ocCommands.tsx:553-570`; `keybindPreset.ts:24-27` | high |
| FN1 | new, section 1 | Claude model catalog | Models from the models.dev catalog with effort levels and Fast twins; **Update model list** refreshes. Suggested level high (palette acceptance pending). | `models.ts:116-143` | high |
| FN2 | new, section 3 | Clean up completed sessions | As W-SES-6. Suggested high. | `dialog-session-cleanup.tsx` | high |
| FN3 | new, section 5 | Sub-agent management and stopping | `/viewSub`, `/addSub`, `/rmSub`, `/sessionSub` (per-chat on/off), `/stopSub`, `task_cancel`, staged Esc; native general/explore model and reasoning picker. Suggested high. | `ocCommands.tsx:183-229`; `taskCancel.ts`; `dialog-subagents.tsx` | high |
| FN4 | new, section 6 | Daily theme and drac variants | Default-off `/dailyTheme` and four drac surface variants. Suggested medium (beta). | `theme/daily.ts`; `theme/dracVariants.ts` | high |

## S. SCOPE.md

| ID | Line | Fix | Evidence | Conf |
|---|---|---|---|---|
| ~~S1-S4~~ | all | **Done (D7).** Versions from removal commits (`git log --diff-filter=D`), the commit that added each row (`git log -S` on SCOPE.md), and build notes. Added one explanatory sentence under the intro. | git: `cbff312` v0.1.2, `1803047` v0.2.172, `4a92c63` v0.2.174 | high |
| S5 | bgShell row | Replaced by B4 (D8): bgShell row stays; new Retired row for the `/bgRun` toggle. | D8 | high |
| S6 | openSidebar row | Replaced by SB5 (D9): new Retired row for the old storage paths. | D9 | high |
| ~~S7~~ | Retired | **Done.** Added "SuperPlan and SuperGo planning agents (`plan_next_phase`, `plan_closeout` tools) \| v0.2.281 \| Stock Plan agent". | `feaa124` v0.2.281 | high |
| S8 | new | **YOU:** add "Soft revive (same window)" to Planned for later, from revivePlan.md (D-REV). Default: add. | revivePlan.md:3 | med |
| S9 | Planned for later | Add "Linux and macOS support \| v0.2.320 \| Target before 0.4.0; 0.3.0 is Windows only." (D1) | D1 | high |
| S10 | Retired | FD12: delete the Open Computer Use MCP and ocdebug PowerShell wrapper rows (personal setup). | D4 | high |
| ~~S11~~ | Retired | **Done.** "Cursor native plan-mode bridge" was "Replaced by OpenCode planning agents" (SuperPlan, removed v0.2.281) -> "Stock Plan agent". | `agent.ts:187-188` | high |

## A. AGENTS.md

| ID | Line | Fix | Evidence | Conf |
|---|---|---|---|---|
| A1 | 7 | Drop "(CI reads it via `.github/actions/setup-bun`)": there is no CI. | AGENTS.md:202; no `.github/workflows` | high |
| A2 | 8 | `Database.path` -> `Database.path()`. | `database.ts:66-73` | med |
| A3 | 200 | "cannot run from repo root (root `test` script...)" -> "from the `src` workspace root (`src/package.json` `test` script...)". | `src/package.json:16`; no root package.json | high |
| A4 | 211 | `run.ps1 <M1-M6\|P1-P9\|cleanup>` -> `run.ps1 <all\|M1-M6\|P1-P4\|P6-P11\|cleanup>`. | `src/packages/opencode/test/perf/run.ps1:1` | high |
| A5 | 32 | Mention `-Tags` / `-SetTag`. | `agentPush.ps1:5-14` | high |
| A6 | 87 | Optional: list every prePush step once (typecheck, keybind docs check, countCode, readmeVersion, OpenAPI regenerate, Prettier, CRLF) and have SCRIPTS.md link here, so the two stop disagreeing. | `prePush.ps1:6-29` | high |

## P. SCRIPTS.md, UPSTREAM-SYNC.md, CONTRIBUTING.md, SECURITY.md, .github

| ID | Doc:line | Fix | Evidence | Conf |
|---|---|---|---|---|
| P1 | SCRIPTS:16-18, 122 | `.version/version`, `.version/versionTag` -> `src/.version/...` everywhere. | `scriptHelper.ps1:29-31` | high |
| P2 | SCRIPTS:140-142 | Delete "Excluded base scripts": Inno, ImageMagick, `bumpVersion.ps1`, `readmeVersion.ps1` are all in-tree now. | `buildInstaller.ps1:1-70` | high |
| P3 | SCRIPTS:12 | prePush row: list all steps (or link AGENTS.md per A6). | `prePush.ps1:6-29` | high |
| P4 | SCRIPTS:17 | pushRelease publishes `src/packages/opencode/dist` archives plus the required `.installer/Output/oc_v<ver>_windows-x64-setup.exe`. | `pushRelease.ps1:18-24,54` | high |
| P5 | SCRIPTS files table | Add rows: `.runCompanion.ps1`, `buildCompanion.ps1`, `readmeVersion.ps1`, root `.install.ps1` (agents never run it); mention `upstream-sync.state.json` under Upstream. | files exist | high |
| P6 | SCRIPTS:80 | `unit` = the 13 local unit packages (not 20). | `test.ps1:30-33` | high |
| P7 | SCRIPTS:11, 116 | Dist paths need the `src/packages/opencode/` prefix; `build.ts --single` means "current OS/arch only" (not retired single mode); say so. | `scriptHelper.ps1:9`; `build.ts:40,114-116` | high |
| P8 | SCRIPTS:97 | List all four `.scripts/tests` suites (testRunner, commitSubject, installDir, buildNotesChanged). | `.scripts/tests` | high |
| P9 | SCRIPTS:19-20, 25 | agentPush `-Tags`/`-SetTag`; claudeRealFlow `-Model`/`-SwitchModel`; `.run.ps1 [-Native] [OpenCode arguments...]`. | param blocks | high |
| P10 | SCRIPTS:3 | "scripts set the repository location": prePush has no `Set-Location`; say scripts resolve `$srcRoot`/`$repoRoot`, and prePush expects to run where `src/package.json` is the workspace. Re-read prePush before writing. | `prePush.ps1:5-7` | med |
| U1 | UPSTREAM-SYNC:44-45, 62-63 | `.version` -> `src/.version`; example `0.0.8 to 0.0.9` -> `0.2.320 to 0.2.321`. | `bumpVersion.ps1:9-10` | high |
| U2 | UPSTREAM-SYNC:50-56 | Steps 8 and 9 conflict (record a merge commit vs never commit). Make step 8 "only when you ask to record the upstream SHA". | same file | high |
| U3 | UPSTREAM-SYNC:18 | Parent may stay dirty; only `UPSTREAM\opencode` must be clean (matches SCRIPTS.md:111). | `updateUpstream.ps1:18-20` | med |
| C1 | CONTRIBUTING:73-74; pull_request_template.md:21 | Replace the conventional-commit title format with the house subject format (link AGENTS.md "buildNotes.txt"). | AGENTS.md:66-67 | high |
| C2 | CONTRIBUTING:36-38 | `install.ps1` does not use a fixed folder: PATH folder with `oc.exe`+`occ.exe`, else `%LOCALAPPDATA%\Programs\oc`. | `scriptHelper.ps1:16-27` | high |
| C3 | CONTRIBUTING:33 | `.run.ps1` runs `bun dev .` then `oc launch` (resident) unless `-Native`. | `.run.ps1:12-17` | med |
| C4 | CONTRIBUTING:81 | `(shown in the sidebar footer as oc vX)` -> `` `oc vX ∙ OG vY` `` (bug-report.yml:25 and feature-request.yml:56 already match). | `sidebarTools.tsx:1032-1034` | high |
| SEC1 | SECURITY:15 | Drop the port `4097` debug instance: `oc starts a local background server (port 4096 by default).` | `oc.ts:28-29` | high |

## D. docs/dev and fork-owned docs under `src`

| ID | File | Action | Evidence |
|---|---|---|---|
| D-V030 | docs/dev/v0.3.0.md | D6: replace lines 16-56 and 497-502 with the gate above; replace the Lua block (233-246) with a link to docs/wezterm.md; line 59 -> "0.3.0 is Windows only; Linux and macOS ship before 0.4.0" (D1); leave sections 1-11 and the orchestration log. | CI removed v0.2.88; ocdebug retired v0.2.181 |
| D-CTX | docs/dev/CONTEXT.md | Delete: upstream session-runtime glossary for the removed OpenCode 2 engine (Context Epochs); `UPSTREAM\opencode\CONTEXT.md` keeps upstream's copy. No script references it. | AGENTS.md:218 |
| D-PFP | docs/dev/publicForkPlan.md | Delete: public fork done in v0.2.183. | buildNotes.md:109 |
| D-CDP | docs/dev/commandDescriptionsPlan.md | Delete: implemented in v0.2.320. | its own status line |
| D-NSP | docs/dev/nativeSplitPlan.md | Delete: implemented in v0.2.157; AGENTS.md:9 and FORK.md:87 carry the result. | its own status line |
| D-NOT | docs/dev/noticesPlan.md | Move its pending live checks (lines 130-143) into FORK.md Notices What's left (F26), then delete. | implemented v0.2.233 |
| D-PRD | docs/dev/publicReadiness.md | Delete: survivors live in FORK.md, SCOPE.md, vmAcceptance.md; it cites the removed `agentify.ts`. | line 35 |
| D-REV | docs/dev/revivePlan.md | Delete after S8 records soft revive; hard revive is FORK.md:80. | its own status line |
| D-VMA | docs/dev/vmAcceptance.md | Keep. The "fresh-machine parity plan" it takes IDs from does not exist: call the IDs local labels or drop the sentence. | lines 11-13 |
| D-CTF | docs/dev/claudeTestFlow.md | Keep (FORK.md:54 uses it). | - |
| X-TUI | src/script/translate-ui.md | Delete: orphan prompt; `translate-ui.ts` and `packages/ui` were removed in v0.2.173; nothing references it. | archive10:1111; `git grep translate-ui` empty |
| X-SKL | .opencode/skills/oc-palette-entry/SKILL.md | Fix paths: `src/app.tsx` -> `src/packages/tui/src/app.tsx`, `src/todos.ts` -> `src/packages/tui/src/todos.ts` (lines 14, 24, 47). | `todos.ts:8` |
| X-SCH | src/packages/schema/AGENTS.md | Re-read lines 17-18 ("V1 isolation PR", `src/v1/`) and fix if stale; low priority. | triage |
| X-KEEP | src/specs/tui-package.md, src/packages/opencode/specs/tui-plugins.md, src/packages/opencode/test/perf/README.md | Leave: upstream-modified specs (editing adds sync friction) or current. | triage |

## Coverage gaps not placed above (skipped under D3)

Internal or minor behavior, no doc change: Cursor tool parity details (v0.2.225-230), exact slash
match ranking, `.ps1` after-turn argument quoting, startup sync speed, code streaming internals,
event/permission/retry reliability, plugin hook isolation, sub-agent hint timing, footer hints,
gpt-oss tool instructions, ACP options, tool-input repair messages, failed-subagent result
semantics, streamed refusals on the wiki, revive shutdown validation, stale Claude wake recovery.
Revisit only if you want them listed.

## Execution (for the agent)

Rules: AGENTS.md applies. Edit with Edit/Write only. No em dashes. The wiki is a separate clone
(`..\oc.wiki`, rules in its `Editing-This-Wiki.md`); do not push it or this repo. Docs-only work:
no version bump (AGENTS.md "Revision"); the two code sessions follow AGENTS.md for code changes.
Never edit buildNotes archives.

Code sessions first, so the doc chunks describe the result (each is its own session):

- C1. D8: B1-B4. Run `backgroundShell.test.ts` and typecheck the two packages.
- C2. D9: SB1-SB5. Run the sidebar settings tests; probe the migration on a copy of the real old
  files (never on the live ones), then confirm the old files are untouched.
- C3 (only if you put K1 in the gate): K1.

Then the doc chunks, in bite-size pieces (each fits one sub-agent with a file allowlist):

1. Wiki chunk 1: Configuration.md, Keybinds.md (W-CFG, W-KEY; do D2 here).
2. Wiki chunk 2: Sessions.md, Sidebar.md, Agents-and-Skills.md (W-SES, W-SBR, W-AGS).
3. Wiki chunk 3: Claude-Code.md, Cursor.md, Install.md, Launching.md, FAQ.md, Developing.md,
   Home.md, Troubleshooting.md (W-CC, W-CUR, W-INS, W-LAU, W-FAQ, W-DEV, W-HOME, W-TRB).
4. Root docs: README.md, AGENTS.md, SCRIPTS.md, UPSTREAM-SYNC.md, CONTRIBUTING.md, SECURITY.md,
   `.github` templates (R, A, P, U, C, SEC).
5. SCOPE.md (S8-S10, FD12), then FORK.md (D4 rule text, F and FD rows, then FN rows, then F0
   counts and header last). FD13-FD17 go with the matching wiki chunk.
6. docs/dev and src docs (D, X): v0.3.0.md gate first, then deletions with `Remove-Item
   -LiteralPath` plus `Test-Path` (or `git rm`).

Checks after editing (all read-only):

- Re-run the link, anchor, and path scan (scratch: `%TEMP%\ocDocCheck\scan.ps1`; if gone, check
  every relative link, wiki page link, and `#anchor` in the edited files resolve).
- `bun packages/tui/script/keybindDocs.ts --check` from `src` still passes.
- Grep the edited files for `TODO(`, `4097`, `.version/version` without `src/`, `Manage Third
  Party`, `README.OG`, and U+2014.
- Recount FORK.md levels and compare with its counts table.

Finish: one `build-notes` entry (docs-only, no bump). Report which rows were applied, skipped,
or changed, and remind the user to push the wiki.

## Follow-ups (not part of this pass)

- D10: shorter FORK.md rows that link to the wiki; a link/anchor check in `prePush.ps1`.
- K1 (agent-push name in shipped code), if not in the gate.
- Code leftovers seen while reviewing: `OPENCODE_OC_CONFIG` still read in `oc.test.ts:12-18`;
  `.github/actions/*`, `CODEOWNERS`, `TEAM_MEMBERS` are upstream CI leftovers. In `.opencode/`:
  `tool/github-triage.ts` and `tool/github-pr-search.ts` target `anomalyco/opencode` with upstream
  team names, `agent/triage.md` and `agent/duplicate-pr.md` use them, `command/changelog.md` and
  `command/translate.md` plus `glossary/` target removed upstream surfaces, `command/rmslop.md`
  diffs against `dev` (oc uses `main`), `command/ai-deps.md:5` predates the `src/` layout.
- Not checked: live behavior, GitHub Releases contents, installer UI against every Install.md
  claim, every keybind against CommandMap, Configuration.md plugin and `/reload` sections.
