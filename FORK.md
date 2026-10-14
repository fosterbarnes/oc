# oc

**This is the project definition for this OpenCode fork.** It tracks oc-only work. [SCOPE.md](./SCOPE.md) tracks what oc leaves out of upstream OpenCode.

oc is a personal, Windows-first OpenCode: native `oc` launcher, extra model providers, a workspace sidebar, custom planning agents, and local build/install tooling. Stock OpenCode still supplies the core chat, tools, and terminal UI. Everything listed below is what this project added or changed, and how complete that work is today.

Use this file to agree on what oc *is*. Statuses describe current state. They do not authorize implementation work.

Last reviewed: 2026-10-13 (v0.2.176). The 0.2 lock checklist (verify / finish / defer per row) lives in `.opencode/plans/lockCheck.md`.

---

## Completion level

These labels are exact. Use them as written.

| Level | Meaning |
|---|---|
| **low** | Clear intent, but not working. |
| **medium** | Works for the most part; legacy, incomplete, or needs touch-ups. |
| **high** | Almost there; small remaining polish or live checks. |
| **CRITICAL** | Major issue that must be addressed immediately. |
| **~done~** | Complete to a realistic best version, with real use or equivalent proof. |

Counts below are for **active** rows only. Retired work is listed separately and is not counted.

| Level | Count |
|---|---:|
| ~done~ | 16 |
| high | 46 |
| medium | 19 |
| low | 1 |
| CRITICAL | 0 |
| **Total** | **82** |

---

## How this document works

- Names describe what you can *use*, not where the code lives.
- Related backend plumbing is folded into the user-facing feature it supports.
- Companion pieces that live next to this repo (`octray`, Everything Search, SuperPlan agents) are included when they are part of daily OC use.
- Status is conservative: tests and source are not enough for **~done~** when a rebuild, login, or interactive check is still part of the feature.
- `SCOPE.md` lists what oc leaves out. Hosted docs at opencode.ai describe upstream, not oc.

---

## 1. Models and providers

Use Claude Code or Cursor from OpenCode without treating them as ordinary API-only vendors.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| Claude Code as the agent | high | Claude chats run in the Claude Code CLI with its own prompt, native tools, transcript and `/compact`; oc streams it live. oc sends only the agent's own prompt. oc skills load natively through a generated `--plugin-dir` of links, and oc-only tools (subagents, questions, session tools, MCP servers) are deferred proxy tools Claude loads with ToolSearch. Claude's own task list fills oc's todo list at the end of each turn, and an oc agent's missing tools turn off the matching Claude built-ins. The context meter updates during a turn and shows the compacted size after `/compact`. Slash-command turns with their own permissions load oc's file tools up front, and a new slash command replaces the previous command's rules. Live-checked with `docs/dev/claudeTestFlow.md` (tools, memory, interrupt, compact, revert, restart, effort switch, cache). | No Claude-backed restricted agent exists yet to live-check the agent tool limits. The task-list folder layout is undocumented Claude Code behavior. |
| Claude account pool | high | Several Claude logins act as one account (`accounts`: a list of Claude config dirs). A chat stays on one login until the CLI rejects a request for usage, then continues the same turn on the next login with oc's catch-up and what the turn already did. The current login survives `/revive` and server restarts, and logins already at 100% are skipped. Palette **Switch Claude account** (and the per-session variant) picks one by hand; the sidebar shows a row per account, marks the active one with `«`, and refreshes on switch. | Covered by fake-CLI tests; no real usage-limit switch recorded. `persistSessions`/`persistPool` are last-writer-wins when `oc` and native `opencode` run at once. |
| Schedule Claude warm-up | high | **Third party harness management** has one **Schedule Claude warm-up: <label>** entry per connected subscription login. Global account folders have stable identities; project-only overrides do not schedule greetings. Off initially. **Every day** or **By weekday** accepts up to four `HH:mm` times per day in the server's local time zone. Save enables nonempty schedules; Pause retains times; an empty schedule disables sending. Missed times are skipped. Listener-owned, locked claims prevent duplicate attempts across hosts; resident `oc` continues with every TUI closed, while native `opencode` needs its host alive. Tiny account-pinned Haiku greetings stay outside chats. Live **Est. reset** previews are conditional on starting a new five-hour window. Latest outcome says **Prompt sent**, never promises that a window moved. | Scheduler/store, API, isolated fake-model, and pane checks pass; wiki documented. Installed schedule/pause/sleep and real subscription reset alignment remain user-owned. |
| Cursor as a native model | medium | Uses a Cursor account login (browser sign-in) and talks to Cursor's service directly as an OpenCode model (tools, reasoning). The Cursor app does not need to be open. A small local Node HTTP/2 relay (`cursor-runtime`) carries the connection because Bun's client fails Cursor's TLS handshake. The picker can show live multi-tier models (Grok 4.7 base, Fast, 500k, and Claude Opus 5.5 metadata) with matching context, wire params, and pricing. | Live auth/request proof is thin. Git diff parity is implemented; shell exec variants stay deferred. Compaction and "this is OpenCode, not Cursor IDE" guidance were added later and look solid in tests. |
| Hide Cursor's own plan mode | ~done~ | Cursor-backed chats no longer open Cursor's native plan/spec flow. OpenCode planning agents stay available. | None realistic. |
| Start Cursor helper only when needed | high | The Cursor helper starts on first use and shuts down with the server. | Live Cursor start/stop check remains. |
| Update Claude Code from the palette | high | Palette heading **Third party harness management** entry **Update Claude Code** runs the Claude Code CLI's own update and reports the result. Running chats keep the old CLI until their process restarts. | Live check after a rebuild. |
| Update Cursor CLI from the palette | high | Palette heading **Third party harness management** entry **Update Cursor CLI** runs the installed Cursor terminal CLI `update` command. It prefers `cursor-agent`, otherwise a PATH `agent` that mentions Cursor in `about`/`--version`. It does not update the Cursor editor `cursor` CLI or download installers. | Live check after a rebuild. |
| Update Claude Desktop from the palette (Windows) | high | Palette heading **Third party harness management** entry **Update Claude Desktop** (Windows only) checks Anthropic's latest MSIX redirect against the installed `Claude_pzs8sxrjxfjjc` package, always confirms first (updating closes Claude Desktop), then installs only that confirmed version (refuses if latest changed), verifying Authenticode plus the publisher family hash with `Add-AppxPackage -ForceApplicationShutdown`. Reports "not installed" and install errors verbatim; never fresh-installs. | Live check after a rebuild, including the elevation-failure message. |
| Update Cursor Desktop from the palette (Windows) | high | Palette heading **Third party harness management** entry **Update Cursor Desktop** (Windows only) checks Cursor's download API against the installed per-user Inno Setup entry, always confirms first (updating closes Cursor and anything running inside it), then installs only that confirmed version (refuses if latest changed), verifying Authenticode plus the Anysphere signer, silently with `/MERGETASKS=!runcode` so Cursor does not relaunch. Reports "not installed" and "system install not supported" plus install errors verbatim; never fresh-installs. | Live check after a rebuild. |
| Update Codex CLI from the palette | high | Palette heading **Third party harness management** entry **Update Codex CLI** runs the installed Codex CLI `update` command, resolving `codex` on PATH (preferring `codex.cmd` next to a PowerShell-only shim on Windows). Reports the version change or "version unchanged", and update errors verbatim. | Live check after a rebuild. |
| Update ChatGPT Desktop from the palette (Windows) | high | Palette heading **Third party harness management** entry **Update ChatGPT Desktop** (Windows only) checks OpenAI's windows-store-update.json feed against the installed `OpenAI.Codex_2p2nqsd0c76g0` package, always confirms first (updating closes ChatGPT/Codex Desktop), then installs only that confirmed feed version (refuses if latest changed), verifying the manifest name plus publisher pin on the floating ChatGPT-x64/arm64.msix with `Add-AppxPackage -ForceApplicationShutdown`. Reports "not installed" and install errors verbatim; never fresh-installs. | Live check after a rebuild. |

---

## 2. Launching OpenCode, the tray, and the background server

Get into a project quickly, keep a local server running, and control it from the tray or flags.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| Native `oc` launcher | ~done~ | `oc` is OpenCode itself, with settings in `~/.config/opencode/oc.json`. Launch, previous session (`occ`), diagnostics, and `oc config get/set` all work. The `occ` desktop shortcut runs `occ.exe` directly (no PowerShell profile), and `occ` looks up the last session while the server starts. | None realistic. |
| Run after turn and revive | high | **Revive** restarts this oc instance and its terminal window. When `oc`/`occ` launched the TUI, the TUI closes and that window shows step-by-step progress; then the window closes and a fresh terminal process (WezTerm, Windows Terminal, or a new console) runs `oc` or `occ` (`revive.launcher`, default `occ` = the revived session). The first `/revive` asks where oc's source comes from: use an existing source folder, download `github.com/fosterbarnes/oc` once to a chosen folder (default in oc's data folder; the user's copy to edit, never pulled again), or just restart. The answer is saved as `revive.build` (`false` = restart only). With a build configured (`revive.build: { source }`), `/revive` runs `bun install` and `packages/opencode/script/build.ts --single` in the source folder (output streams live; a failed build waits for a key and reopens the old oc), and swaps the new binaries (`oc.exe`, native `opencode.exe`) into the install dir by renaming running files aside, relinking `occ.exe`, with rollback. `revive.path` still overrides `/revive-no-install`. TUIs not launched through `oc`/`occ` use a hidden helper with the same pipeline. Progress and errors go to `revive.log`. The revive mark (`[oc revived at ...]`) is written by the old build; the new build restamps its versions while it is still the newest message, so the agent sees the build that actually came back. Shutdown closes only terminals and processes recorded for this instance; unrelated windows stay open. In a multi-tab WezTerm window, `/revive` opens a new window with this instance's oc tabs in order (each back on its session), then closes only those panes in the old window; shells, native, and other instances keep running there. **`run_after_turn`** queues an exe or `.ps1` after the agent turn (`/agent-revive` uses it), including Claude Code sessions when `run_after_turn` is listed in `proxyTools`. Permission: built-in default allows; global config can deny except revive scripts. | Live check hard revive in WezTerm and Windows Terminal from `oc` and `occ`, including a failing build and a real install. Claude Code `/agent-revive-no-install`. WezTerm tab order is assumed from `wezterm cli list`; an owned pane in a split tab moves on its own. |
| Reload project config | high | `/reload` (next to Revive) calls `POST /instance/reload` and reloads the project's config, agents, commands, skills, providers, MCP servers, and server plugins without rebuilding. Refused while session work runs in that project (other projects do not block it); while it runs, new session requests for that project get a busy (409) refusal instead of waiting; invalid config keeps the old state and shows the error. Does not reload plugin module code, process env, launcher settings, or TUI plugins (use `/revive`). | Live check pending. |
| Update from oc releases | high | Each TUI start checks `fosterbarnes/oc` GitHub releases once and shows a notice when a newer oc exists (`autoupdate: false` turns it off; a skipped version stays quiet). `/update` confirms, then runs the `/revive` install pipeline with the downloaded release instead of a source build: download and unpack before anything stops, stop oc, swap `oc.exe`, `opencode.exe` with rollback, reopen the terminal. Upstream package-manager upgrades are disabled (`Installation.method` is always unknown); `opencode upgrade` only reports. | No public release exists yet to check against; live check after the first one: notice, skip, `/update` from `oc` and native `opencode`. |
| Separate home vs OC directory | high | Bare `oc` and relative project names can use two different folders. Absolute paths stay absolute. | Latest palette settings may still need a rebuild/restart to show in the running app. |
| New-session project picker | high | Tray/palette "New session" starts the intro, then the real OpenCode project picker, then attaches to the running server. | Confirm the installed `oc.exe` shows the intended picker. |
| Startup loading animation | high | Column-by-column logo reveal with a scanner while the server and session come up; a startup pause resumes at the next column instead of skipping. `intro.background` in `oc.json` uses your terminal background (default) or paints black. Fills and re-centers when the window is snapped or resized. Runs on the alternate screen; the TUI shows the same logo until it is ready, so there is no blank gap at handoff and quitting restores the terminal. | Handoff confirmed live on 0.2.87. Reveal timing reworked in 0.2.167 (uncommitted): live look, plus `intro.background: "black"` and resize through `occ`. |
| Resident background server | medium | Local server stays up between launches (production port **4096**). Palette can shut down or restart it. Server shutdown and restart close session admission, wait up to 30 seconds for active-work cancellation, then dispose project resources before scheduling exit. Attach can forward model/agent. A stale server record no longer adds a 10-second wait on the first `oc` launch; a launch during an active restart still waits for the replacement. On Windows the server starts through a hidden `Start-Process` hop, so it has a hidden console (no flashing windows from its child processes) and outlives the launcher. | Full installed shutdown/restart flow is not fully signed off. The hidden PowerShell hop costs about a second; a direct native launch waits on the Bun Windows FFI fix. |
| Native `opencode` binary | medium | One source tree compiles two programs: `oc.exe` (+ `occ.exe` hard link) with the launcher, resident server, and revive host, and `opencode.exe`, which runs the upstream in-process TUI + worker with every other oc feature. The build constant `OPENCODE_FLAVOR` (`Global.native`; `OC_FLAVOR` in `bun dev`) is the only switch: write features once and gate on it only where they need the resident server. Native drops the `oc` command and launcher rewrites, hides server Shut Down/Restart, uses `⦿` in the tab title, stops its work and child processes on close (up to 3 seconds), and `/revive` hands off to the sibling `oc.exe`, which reopens `opencode`. Both share one session database; a session running in another window is refused with "Session is running in another oc window". Replaces `oc single` (removed with `--single`, `--portable`, and the `mode` key). | Live check of an installed pair: `oc` resident, `opencode` native, `oc --shutdown-all` leaving `opencode` running, native `/revive`. A native window does not see live updates when another window runs the same session. Each window starts its own plugins and MCP servers. |
| Start server at Windows sign-in | high | OC settings can turn sign-in auto-start on or off; the palette saves `server.startOnWindowsUserStart` in `oc.json`, and `config/startup.ts` registers it: an immutable pwsh launcher under the instance state dir plus an HKCU `...\Run` value, with rollback on failure (Windows-only, pwsh required, no inline config, 260-char Run limit). | Installed sign-off is missing: enable on a real machine, sign out and back in, and confirm the resident server comes up with the right instance env. |
| `oc --kill-server` / `--restart-server` / `--shutdown-all` | high | Simple flags for the tray and CLI to stop or bounce the resident server without a full TUI. `--shutdown-all` stops only this instance's TUIs and server (TUI ledger), not unrelated terminals; revive uses the same scoping. | Tray wiring exists; treat as nearly done once it is used from a cold start. |
| Faster command startup | ~done~ | Only the command asked for is loaded. `--version` is much quicker. | None realistic. |
| Windows tray (`octray`) | medium | Separate tray app: open OC, open the project picker, start the server if it is down, restart/shut down the server. | Frozen as-is for 0.2 (decided 2026-10-12); outside the 0.3 public scope. Logs, live status, and settings menu items are thin. Not inside this git checkout. |
| No browser/desktop OpenCode app | ~done~ | This checkout no longer builds the website UI or Electron desktop app. CLI, TUI, and API remain. `SCOPE.md` records it. | Intentional removal, not a missing product. The upstream docs site, hosted SaaS, and SST deployment source are also removed. |

---

## 3. Sessions and model choices

Move between projects, keep a session's model, and mark work without deleting it.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| All-projects session list | ~done~ | Browse sessions from every project and jump back to that project's folder. | None realistic. |
| Send prompt and stay on Home | high | On Home, Ctrl+Enter sends the prompt to a new session and keeps you on Home so you can start several in a row. On a session screen Ctrl+Enter still inserts a newline. | Unit tests cover the command; installed Home Ctrl+Enter streak is not recorded. |
| Start a session with no model call | medium | Opens a project session without spending tokens. | Installed "it feels right" check is incomplete. |
| Session marks | medium | Mark a session complete, failed, or in progress (exclusive), or pin it. Sending a prompt marks the session in progress, reopening complete/failed ones. Agents cannot mark complete or failed unless `session_complete`/`session_failed` is allowed (default `deny`; a command can allow it for its own turn). Themed markers in lists and the sidebar. | Installed end-to-end confirmation is missing. |
| Remember this session's model | ~done~ | Each session keeps its model and reasoning choice across agent changes and restarts. | None realistic. |
| Don't lose the attached session | medium | Refreshing the global list should not drop the session you are in. | Manual installed check was left pending. |
| Recover after server restart | high | After the resident server bounces, the TUI should reconnect, restore the prompt, and not resubmit what was typed. | Still treat as high until daily reconnect after a bounce is trusted. |
| Clear interrupted questions | high | Aborting a session rejects a pending question, tells the UI, and does not leave a Cursor-backed chat stuck on that prompt. | Covered by tests. Not signed off in the installed app. |
| Questions survive closing the window | high | Pending questions reload when you open the session again (including via `occ`). If the live request is gone, the UI rebuilds from the saved tool call and your answer continues the agent as a normal follow-up. | Live check after close via `occ` and the session list; repeat after server restart (restored-question path). |
| Work copies (`/work`, `/done`) | removed | Removed before 0.3.0; to be redesigned from scratch. | None. |
| Context limit: compact or hand off | high | Palette **Context limit** sets a token threshold globally or per provider, with action Compact, Handoff, or Off. Handoff starts a follow-up session with a summary and the original turn's permissions; **Hand off session** does it on demand. Saving the setting does not interrupt running agents. | Live Claude handoff proven; live Cursor handoff not recorded. |
| `/btw` side questions | high | `/btw <question>` (or `/btw` alone for an input box) asks the current model one side question using the session's history; the answer shows in a dialog and is not added to the conversation or prompt history. Works while the session is busy; Esc cancels. Text only, 120 s limit. API providers only: Claude Code and Cursor show `/btw is not available on <provider> yet`. Endpoint `POST /session/:sessionID/generate`. | Live check pending. |
| Queue prompts while busy | high | Alt+Enter in a session queues the prompt (Home keeps newline; plain Enter still steers the running turn). Queued prompts are stored in the database (`session_queue`) and send in order after each successful turn. Errors and a confirmed Esc interrupt pause the queue; after a server restart or `/revive` the queue is paused until Resume. The prompt footer shows the count and pause reason; the queue manager (keybind `session_queued_prompts`, unbound by default; Ctrl+D cancels an entry) edits, cancels, and resumes. A due auto-resume waits while the queue has entries. | Two-process edge cases; live check pending. |
| Auto-resume after Claude usage reset | high | When every Claude account hits its usage limit, the session queues a resume that fires after the reset ("Usage limit reset. Continue where you left off."). Busy sessions and failed fires retry with backoff; it stops after 5 consecutive auto-resumes or when you send a message yourself. Off by default; turn on with `PUT session/resume/state` (optional `prompt`), inspect with `GET`, cancel an entry with `POST session/resume/cancel`. | Toggle in the Session commands ("Enable/Disable auto-resume after usage reset"); installed live check pending (limit event, wait for reset, session continues on its own). |

### Automatic oc session names

New oc project sessions, the New oc session picker, and Home sessions created in an
oc-launched TUI use `/rename`'s configured agent and model fallbacks automatically
after the first real prompt. Naming runs alongside the reply and uses the first
prompt, with a `<folder> - <description>` title. Initialization and shell-only
input do not trigger naming.

The attempt is saved once per session. Reopening, later prompts, and naming failures
do not repeat it; `/rename` remains available for another attempt. Explicit bootstrap
titles and manual edits made before or during naming are preserved. Forks do not
inherit the automatic naming request. Stock OpenCode titles and oc names share one generator (`title()` in `session/prompt.ts`), and an automatic title never overwrites a manual rename made meanwhile. Installed launcher acceptance remains a user check.

---

## 4. Workspace sidebar and files

One sidebar for usage, files, scripts, search, and status.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| Integrated workspace sidebar | high | Native sidebar: usage, files, git changes, scripts, context, MCP, LSP, todos, footer. Position is left, right, top, or bottom (`sidebar_position`). Top/bottom size to content, up to half the terminal height (minimum 8 rows), and scroll. Narrow left/right overlay closes on backdrop click. Model and reasoning rows follow the current session (same as the prompt footer). Usage refreshes per provider after you use it and when you return; stale or cached numbers are dimmed with age on hover. | Two sessions on different models and reasoning: switch and confirm rows match the footer. Live Claude usage refresh and dim when stale. |
| Plugins in the sidebar | low | Collapsible "Plugins" section under MCP: every configured server and TUI plugin as one row with version, `server`/`tui` badges, and load errors; built-in plugins on one muted line. Opens itself when a plugin failed. Server data comes from `GET /plugin` (`plugin.status`). | Live check with the current `opencode.jsonc` and `tui.json` plugins; confirm `weztermZoom` merges correctly. |
| Click a path to open it | high | Tool paths, edited files, and changed-file rows open in an editor chosen by extension via `openEditedWith` (a string or a map with `default` and per-extension keys). | Live click on a `.md` and a `.ts` path. |
| Sub-agents in the sidebar | high | Lists the current session's sub-agents with name, short title, and live status; click opens the child session. Shows running agents and recent finishes that drop off after a short time. Hidden when empty. | Live SuperPlan conductor or `task_batch`; rows update and click through. |
| Sub-agents in their own terminal tabs | high | `subagent_tabs.click: "tab"` opens a clicked sub-agent in a new WezTerm or Windows Terminal tab; `subagent_tabs.auto_open` opens each new one automatically; `session_child_tabs` opens all running ones. Palette **Subagent tabs** (`/subagentTabs`) switches these live. Needs the resident server; native `opencode` windows stay inline. | Installed acceptance in WezTerm and Windows Terminal. The server password is visible in the tab's process arguments; tabs disconnect if the server exits. |
| Windows file search and script launch | high | Fast file lookup and launching repo scripts. WezTerm gets tab, window, and split targets; Windows Terminal gets matching `wt` targets; other terminals use native launch. A saved target the current terminal cannot run falls back to native. | Fresh Windows Terminal and conhost daily workflow sign-off. |
| Usage meters and Usage menu | medium | Sidebar **Usage** shows Claude, Codex, Cursor, Go, and OpenRouter usage (each can be hidden; defaults on), with hour/week window labels and per-account Claude rows. Clicking it (or palette **Show usage**) opens a menu with used and remaining percent and full reset dates per provider, a used/remaining toggle, and a provider-spacing toggle. Collapsed sidebar sections are remembered. | Latest installed picker interaction is not recorded. |
| Everything Search (Windows) | high | Starts the Everything daemon when needed, reconnects if it drops, does not try to own shutdown. Friendly sort names work in the local checkout. | Full start/reconnect acceptance is incomplete. Lives partly in `mcp-everything-search`. |

### Todos

Todos are off by default. The command palette's **oc** category offers **Enable todos**
or **Disable todos** and saves the global `todos` preference in `opencode.jsonc`.
Project configuration can override that default with `"todos": true` or `false`.
The toggle confirms a configuration reload because active sessions may stop.

When disabled, oc does not offer `todowrite`, Claude Code's native todo tools are
disabled, provider todo mirroring stops, and the built-in sidebar list is hidden.
Saved lists and historical tool rows remain. Enabling still respects agent and
session permissions. Palette persistence and installed provider/sidebar behavior
need a live check after rebuilding.

---

## 5. Agents, planning, and who does the work

Drop in Markdown agents, share prompts, and run SuperPlan / SuperGo / Debug as a coordinated team.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| Markdown agent files | medium | Bad sibling files in `agent/` and `agents/` are skipped with a path warning. `opencode agent validate` exists. Stock OpenCode already loads those folders. | Installed command availability and UI discovery after restart were unverified. |
| Agent file hot reload | high | Agent and mode markdown in existing config dirs reload on the next agent lookup (`Fingerprint.reloading` in `agent/agent.ts`; `Config.agents()` replays the startup merge order via `agentLayers`). A broken file keeps its last good agents and toasts. Plugin additions, field overrides, and deletions survive; untouched fields still reload from markdown. Claude Code's proxy `task` description lists the new names only after the CLI respawns, but dispatch validates live. | Not covered: `{file:...}` prompt targets, JSON `agent` blocks, and brand-new config dirs (use `/reload`). Live check of `/addSub` then a same-session dispatch pending. |
| Tab order and friendly names | medium | Custom agents can have a Tab cycle order and a readable label. | Installed-build check is incomplete. |
| Shared prompt files | medium | An agent can pull another file with `{file:...}` (relative, home, or absolute). | Installed-runtime freshness is uncertain. |
| Cheap vs hard delegated models | medium | Primary agent stays on the selected model. Routine child work can go cheaper; hard work can go to a high-reasoning agent. | A live delegated request is not recorded. |
| Task model override | high | `task` accepts optional `model` (`provider/model` or `provider/model#variant`), validated before any permission prompt or child session, for that call only. Agent permissions and prompt are unchanged; no parent effort is inherited; `task_id` must name a same-agent direct child. On Claude, an explicit model beats an agent's `forceModel` and `defaultSubagentModel` for that turn. The task row shows `provider/model#variant`. | Live check pending. |
| SuperPlan (plan + implement) | high | Paired planning and execution. Plans are sized (`size`/`phases` frontmatter) and split into phases with file allowlists and done-when checks. `plan_execute` offers this session, a new session, phase sessions (`plan_next_phase` hands off), or a conductor that sends each phase to a `general-*` sub-agent. Go stops only on red flags; `plan_closeout` archives finished plans. Planners are read/search/plan-file only. Execution uses the exact plan file that was written, not a reconstructed name. | Full user-feature workflow is still separate from the probes that passed. |
| Archive finished plans | ~done~ | Successful temp plans move to `plans/archive/`; failed or partial plans stay. | None realistic. |
| Default child agent | medium | `default_subagent` is used when a task does not name a child type. | Installed command and live request still need confirmation. |
| SuperGo, Debug, and Luna routing | high | Config `agents/` and `prompts/` set: Go, Debug family, SuperPlan aliases. Daily Luna sessions and Luna agents use `openai/gpt-6-luna` (live-checked). Luna stays off Max / `xhigh` unless asked. | Config-level, not fork source. Fresh restart is required after prompt edits. |
| Plan-only command permissions | high | A command can carry its own permission rules for that turn only (for example `/spit` may write Markdown plans in the plans folder and nothing else). Rules flow into subtasks, compaction, and tools, and do not carry into the next ordinary turn. Claude Code restricted turns use oc's proxy tools. | Subtask and compaction carryover traced in code, not exercised live. |
| Tool input repair | high | Builtin, plugin, and MCP tool arguments get deterministic shape repair before validation and execution (`tool/inputRepair.ts`). Advertised schemas are unchanged. Extra keys are dropped only when the original schema closes the object. Permission checks run on repaired arguments. | Code-mode child calls are not covered. Live check pending. |
| Time tool | ~done~ | `time` returns the local date, time, and time zone offset for very few tokens; the clock is kept out of the system prompt so caching holds. Claude Code sees it as a proxy tool when `time` is in `proxyTools`. | None realistic. |
| Hide stock Plan agent | ~done~ | Built-in Plan is disabled in config (`disable`). Hidden is a different switch. | None realistic. |

---

## 6. Conversation and terminal feel

Timestamps, copy, keys, diffs, plugins, and the terminal itself. WezTerm is the primary terminal target; other terminals get best-effort support (README `## Terminal`).

| Feature | Level | What it does | What's left |
|---|---|---|---|
| Agent square and status in the terminal tab | high | Terminal title starts with a `■` for the active agent. WezTerm colors it with the agent color through a tab-title snippet (in `docs/dev/v0.3.0.md`); other terminals show it uncolored. OSC progress shows busy, idle, and error states where the terminal supports it. | Live check on Windows Terminal (square and progress ring), conhost (square), WezTerm (square color follows the agent). |
| Response timestamps | medium | Local date/time, then duration. Uses start time while the reply is still streaming. | Final look in the installed UI is not recorded. |
| Text selection and copying | high | Double-click selects a word; triple-click selects a logical line including wrapped rows; dragging after those clicks extends by words or lines. Copy-on-release and Ctrl+C both retain the highlight; Escape clears it. Clickable items (messages, tool rows, subagent rows, buttons) are not text-selectable: a click runs the action instead. Ordinary text stays double-click selectable. Clipboard writes finish in gesture order. | Focused renderer checks pass. Installed WezTerm gestures, message Actions, tool controls, and resize/scroll acceptance remain. Triple-click selects lines, not linguistic sentences. |
| Keybind layouts | medium | `keybind_preset` in `tui.json`: `oc` (default, `TuiKeybindPreset.oc` over upstream defaults; Ctrl+M models, Ctrl+S sessions, Ctrl+D variant, Ctrl+C never quits) or `opencode` (stock keys plus oc-only commands). User `keybinds` win over both. oc palette **Keybind layout** (`/keybindLayout`) switches live (`TuiConfig.Resolved.setKeybindPreset`, signal-backed `keybinds` getter) and writes `keybind_preset` to global tui.jsonc/tui.json via jsonc-parser. `docs/keybinds.md` tables are generated by `packages/tui/script/keybindDocs.ts`; `prePush.ps1` fails when stale. | Preset resolution tested. Live check of both layouts in the installed TUI not recorded. |
| Keys and command palette | high | Context-sensitive Ctrl+D, Ctrl+Shift+Up/Down, Ctrl+N for a new OC session. OC commands use a source order and friendly labels, grouped under Defaults, Folders, Layout, Server, and Tools (experimental) headings; settings rows show their current value. `command_palette.order` in `opencode.jsonc` can reorder commands inside a category; unlisted commands keep source order. Shut down and restart sit in the `oc` section. From the command list, **Set hotkey** (`palette.set_hotkey`, Ctrl+K) captures a chord (ctrl/alt/meta/super required unless a leader sequence) and stores it in `palette_keys`; those bindings do not fire while the prompt has text or a dialog is open. Slash-menu Ctrl+F toggles persistent favorites for skills, commands, MCP prompts, and oc actions; small solid-diamond favorites lead the empty search, while typed search keeps fuzzy ranking. The session slash menu reserves space above the prompt so current output stays visible; shorter terminals use a smaller menu. Multiple prompt commands such as `/spit /think` combine as labeled instructions in one turn; later pickers preserve existing text. The first command controls agent/model routing; secondary routing commands must run first or separately. | Ordering, favorite identity, Ctrl+F input ownership, slash-menu layout/bottom-follow, composition delivery, and multiline/Unicode completion and Escape are tested. Installed `/spit /think` plan delivery, slash-menu streaming visibility, toggling, selection retention, palette hotkey capture, and restart persistence need a live check. A full palette click-through is not recorded. |
| Don't crash on odd tool text | medium | Coerces non-string OpenTUI text nodes (numbers become strings; null/boolean and other `add()` explosions are skipped) so nested tool output does not take down the UI. | Live "no regression" check is not recorded. |
| Images in prompts | high | In WezTerm, Ctrl+V attaches a copied image file (ShareX "Copy file", Explorer) or raw image data. Attached images are saved to `%LOCALAPPDATA%\oc\images` (`attachment.image.save_dir`), or the original file is used, and the agent gets the path; models without vision get the path instead of an error. Palette **Clear saved images** empties the folder. | Uncommitted (0.2.166). Live paste in WezTerm. Saved images stay until cleared; deleting or reverting a session leaves them. |
| Diff hover colors | ~done~ | Neutral diff regions share one hover background; add/remove colors stay. | None realistic. |
| Crow session lock | medium | Each Crow tab stays on one OpenCode session via `CROW_SESSION_HANDLE`. Targeted commands only run on that handle. Optional `CROW_SESSION_ROUTE_URL` reports session changes. | Live Crow integration is limited. |
| Built-in background shell | high | `bash` takes `background: true`: the job starts, returns a job id at once, logs stdout/stderr under `shellJobs/<session>/<job>` in oc's state folder, and the TUI shows its status and live tail. `bgStatus` lists jobs with tails; `bgKill` stops a job's process tree (identity-checked, never `taskkill /T`). When a job ends, a notice is added to the session and wakes it (busy or idle). Server exit kills jobs and keeps logs; session delete removes logs; a restart marks running jobs interrupted; logs older than 7 days are removed. `/bgRun` still toggles `bgRun`/`bgStatus`/`bgKill`; background runs now ask for approval by default (`/bgRun on` allows). Claude Code: opt in with `proxyOpencodeTools: ["bash", "bgStatus", "bgKill"]`. | Live check pending. |

---

## 7. Test builds (`/revive-single`)

Try a change beside production without stopping it. Replaces the removed `ocdebug` instance.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| `/revive-single` | medium | Opens a new tab (WezTerm, Windows Terminal) or console window that builds only native `opencode.exe` from `revive.build.source` (`build.ts --single --native-only`), installs just that file with rollback, then runs it in the same directory and session. The current window, other oc windows, and the resident server keep running. A failed build waits for Enter and leaves the old `opencode.exe`. Shares production data; needs a saved source (run `/revive` once). | Live check in WezTerm, Windows Terminal, and a plain console. |

---

## 8. Windows build, install, and logging

Build safely, install without fighting locks, and keep logs.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| PowerShell build / install / release | ~done~ | Scripts for build, install, pre-push check, push, release, upstream refresh, and revive (`revive.ps1`, `reviveAndInstall.ps1`). Installer rebuilds by default, stops running OC first, can keep a timestamped backup. Former debug scripts fail with retirement instructions. | Agents must not run installers (they can kill the host). |
| Build vs user install | ~done~ | Builds never touch installed files. Install later with `-NoBuild` after exiting oc. | None realistic. |
| `oc.exe` / `occ.exe` hard links | ~done~ | Installer links those names to the same production binary and accepts a valid link set. | None realistic. |
| Stop processes before rebuild | ~done~ | Installer stops managed processes *before* build so running executables cannot lock cleanup. | None realistic. |
| Refuse crashing Bun 1.4.0 | high | Will not compile the Windows TUI with the known-bad Bun. Can upgrade to a canary. | Automatic global Bun upgrades are an operational risk. |
| Cleaner hidden Windows commands | medium | Runs the Windows shell more directly and hides extra `taskkill` windows. | Escape-to-cancel confirmation is missing. |
| Packaged Cursor helper | high | Cursor files sit next to the exe so they work outside the source tree. Canonical installer copies them. | None realistic. |
| On-disk debug logs | medium | Channel-aware logs, 20 MB rotate, palette and HTTP toggle. | Live restart and installed palette acceptance are not recorded. |

---

## 9. Keeping the fork updated

Stay close to upstream without losing custom work.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| Separate display version | ~done~ | Fork version in the TUI footer is independent of OpenCode's package version. Compatible plugins can read the current model, preferred editor, and this display version. | None realistic. |
| Windows-safe generated paths | ~done~ | Fixes Windows migration path generation and invalid custom-element declarations. | None realistic. |

---

## Retired or superseded

Retired oc features, removed upstream surfaces, and items not planned or planned for later live
in [SCOPE.md](./SCOPE.md).

---

## Caveats

- Upstream is ported by hand: an isolated upstream checkout is kept as a reference, fixes are cherry-picked, custom files are preserved, and the maintenance version is bumped (`UPSTREAM-SYNC.md`).
- This checkout does not share a Git merge base with upstream. "Custom" is judged from notes, `Custom fork:` markers, isolated packages (`cursor-runtime`), `.scripts`, and `~/.config/opencode` agents.
- Several "high" rows are source-complete and waiting on a rebuild (`install` stops the running app).
- Small wording, generated-client, and selector fixes are support for the features above, not their own product rows.
- `octray` and Everything Search are sibling checkouts. They still shape daily OC use.

---

## Related files

| File | Role |
|---|---|
| `FORK.md` | **This file.** Living definition of OC. |
| `README.md` | Public pitch, links into the wiki, and the line count `prePush.ps1` refreshes. |
| `oc.wiki` (GitHub wiki) | Source of truth for user-facing behavior, settings, keys, troubleshooting, and FAQ. |
| `SCOPE.md` | What oc leaves out: removed upstream surfaces, not planned, planned for later, retired oc features. |
| `SCRIPTS.md` | How to build, install, and sync. |
| `UPSTREAM-SYNC.md` | How upstream is applied without dropping custom work. |
| `AGENTS.md` | Agent working rules for this checkout. |
| `docs/buildNotes/buildNotes.md` | Session history. Evidence, not product definition. |

---

## Maintenance

This file is the source of truth for what OC is and how complete each piece is.

- Change a level when new live proof arrives, or when the behavior actually changes.
- Keep retired work out of the counts.

- File new capabilities under how they are *used*.
- Keep OC-only work in this file. Exclusions and retired work belong in `SCOPE.md`.
- Session notes stay in `docs/buildNotes/buildNotes.md`. This document stays the product contract.
