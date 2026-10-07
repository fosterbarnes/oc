# oc

**This is the project definition for this OpenCode fork.** It tracks oc-only work. `README.OG.md` tracks native OpenCode in this checkout (what is still stock, what should stay stock, and same / pin / lag / gone vs isolated upstream).

oc is a personal, Windows-first OpenCode: native `oc` launcher, extra model providers, a workspace sidebar, custom planning agents, and local build/install tooling. Stock OpenCode still supplies the core chat, tools, and terminal UI. Everything listed below is what this project added or changed, and how complete that work is today.

Use this file to agree on what oc *is*. Statuses describe current state. They do not authorize implementation work.

Last reviewed: 2026-10-03

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
| high | 26 |
| medium | 21 |
| low | 0 |
| CRITICAL | 0 |
| **Total** | **63** |

---

## How this document works

- Names describe what you can *use*, not where the code lives.
- Related backend plumbing is folded into the user-facing feature it supports.
- Companion pieces that live next to this repo (`octray`, Everything Search, SuperPlan agents, `bgShell`) are included when they are part of daily OC use.
- Status is conservative: tests and source are not enough for **~done~** when a rebuild, login, or interactive check is still part of the feature.
- `README.OG.md` tracks native OpenCode (Now / Keep / Upstream). Hosted docs at opencode.ai remain upstream.

---

## 1. Models and providers

Use ChatGPT, Claude, or Cursor from OpenCode without treating them as ordinary API-only vendors.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| ChatGPT Web | ~done~ | Uses a normal ChatGPT website login as a built-in model. Starts a managed Edge window only when needed. | None realistic. |
| Claude Web | medium | Same browser-backed idea for Claude. | Live login and a real Claude request are still unconfirmed. |
| Claude Code as the agent | high | Claude chats run in the Claude Code CLI with its own prompt, native tools, transcript and `/compact`; oc streams it live. oc sends only the agent's own prompt. oc skills load natively through a generated `--plugin-dir` of links, and oc-only tools (subagents, questions, session tools, MCP servers) are deferred proxy tools Claude loads with ToolSearch. Claude's own task list fills oc's todo list at the end of each turn, and an oc agent's missing tools turn off the matching Claude built-ins. Live-checked with `claudeTestFlow.md` (tools, memory, interrupt, compact, revert, restart, effort switch, cache). | No Claude-backed restricted agent exists yet to live-check the agent tool limits. The task-list folder layout is undocumented Claude Code behavior. Extra Claude accounts are Mac/Linux only (the per-account wrapper is a bash script). |
| Cursor as a native model | medium | Uses a Cursor account login (browser sign-in) and talks to Cursor's service directly as an OpenCode model (tools, reasoning). The Cursor app does not need to be open. A small local Node HTTP/2 relay (`cursor-runtime`) carries the connection because Bun's client fails Cursor's TLS handshake. The picker can show live multi-tier models (Grok 4.7 base, Fast, 500k, and Claude Opus 5.5 metadata) with matching context, wire params, and pricing. | Live auth/request proof is thin. Git/shell protocol parity is deferred. Compaction and "this is OpenCode, not Cursor IDE" guidance were added later and look solid in tests. |
| Hide Cursor's own plan mode | ~done~ | Cursor-backed chats no longer open Cursor's native plan/spec flow. OpenCode planning agents stay available. | None realistic. |
| Start helpers only when needed | high | Browser and Cursor helpers start on first use and shut down with the server. | Not every provider has a live start/stop check. |

---

## 2. Launching OpenCode, the tray, and the background server

Get into a project quickly, keep a local server running, and control it from the tray or flags.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| Native `oc` launcher | ~done~ | `oc` is OpenCode itself, with settings in `~/.config/opencode/oc.json`. Launch, previous session (`occ`), diagnostics, and `oc config get/set` all work. The `occ` desktop shortcut runs `occ.exe` directly (no PowerShell profile), and `occ` looks up the last session while the server starts. | None realistic. |
| Run after turn and revive | high | **Revive** restarts this oc instance and its terminal window. When `oc`/`occ` launched the TUI, the TUI closes and that window shows step-by-step progress; then the window closes and a fresh terminal process (WezTerm, Windows Terminal, or a new console) runs `oc` or `occ` (`revive.launcher`, default `occ` = the revived session). The first `/revive` asks where oc's source comes from: use an existing source folder, download `github.com/fosterbarnes/oc` once to a chosen folder (default in oc's data folder; the user's copy to edit, never pulled again), or just restart. The answer is saved as `revive.build` (`false` = restart only). With a build configured (`revive.build: { source, debug }`), `/revive` runs `bun install` and `packages/opencode/script/build.ts --single` in the source folder, adding `--with-debug` and installing `ocdebug.exe` only when `debug` is true (output streams live; a failed build waits for a key and reopens the old oc), and swaps the new binaries into the install dir by renaming running files aside, relinking `oc.exe`/`occ.exe`, with rollback. `revive.path` still overrides `/revive-no-install`. TUIs not launched through `oc`/`occ` use a hidden helper with the same pipeline. Progress and errors go to `revive.log`. The revive mark (`[oc revived at ...]`) is written by the old build; the new build restamps its versions while it is still the newest message, so the agent sees the build that actually came back. Shutdown closes only terminals and processes recorded for this instance; `ocdebug` and unrelated windows stay open. **`run_after_turn`** queues an exe or `.ps1` after the agent turn (`/agent-revive` uses it), including Claude Code sessions when `run_after_turn` is listed in `proxyTools`. Permission: built-in default allows; global config can deny except revive scripts. | Live check hard revive in WezTerm and Windows Terminal from `oc` and `occ`, including a failing build and a real install. Claude Code `/agent-revive-no-install`. |
| Separate home vs OC directory | high | Bare `oc` and relative project names can use two different folders. Absolute paths stay absolute. | Latest palette settings may still need a rebuild/restart to show in the running app. |
| New-session project picker | high | Tray/palette "New session" starts the intro, then the real OpenCode project picker, then attaches to the running server. | Confirm the installed `oc.exe` shows the intended picker. |
| Startup loading animation | high | Column-sweep animation while the server and session come up. `intro.background` in `oc.json` uses your terminal background (default) or paints black. Fills and re-centers when the window is snapped or resized. Runs on the alternate screen; the TUI shows the same logo until it is ready, so there is no blank gap at handoff and quitting restores the terminal. | Handoff confirmed live on 0.2.87. Live look with `intro.background: "black"` and resize through `occ` not fully checked. |
| Resident background server | medium | Local server stays up between launches (production port **4096**). Palette can shut down or restart it. Server shutdown and restart close session admission, wait up to 30 seconds for active-work cancellation, then dispose project resources before scheduling exit. Attach can forward model/agent. A stale server record no longer adds a 10-second wait on the first `oc` launch; a launch during an active restart still waits for the replacement. On Windows the server starts through a hidden `Start-Process` hop, so it has a hidden console (no flashing windows from its child processes) and outlives the launcher. | Full installed shutdown/restart flow is not fully signed off. The hidden PowerShell hop costs about a second; a direct native launch waits on the Bun Windows FFI fix. |
| Start server at Windows sign-in | high | OC settings can turn sign-in auto-start on or off. | Final installed palette click is not recorded. |
| `oc --kill-server` / `--restart-server` / `--shutdown-all` | high | Simple flags for the tray and CLI to stop or bounce the resident server without a full TUI. `--shutdown-all` stops only this instance's TUIs and server (TUI ledger), not `ocdebug` or unrelated terminals; revive uses the same scoping. | Tray wiring exists; treat as nearly done once it is used from a cold start. |
| Faster command startup | ~done~ | Only the command asked for is loaded. `--version` is much quicker. | None realistic. |
| Windows tray (`octray`) | medium | Separate tray app: open OC, open the project picker, start the server if it is down, restart/shut down the server. | Logs, live status, and settings menu items are still thin. Not inside this git checkout. |
| No browser/desktop OpenCode app | ~done~ | This checkout no longer builds the website UI or Electron desktop app. CLI, TUI, and API remain. `README.OG.md` states that. | Some `packages/web` pages still mention desktop / `opencode web`. Intentional removal, not a missing product. |

---

## 3. Sessions and model choices

Move between projects, keep a session's model, and mark work without deleting it.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| All-projects session list | ~done~ | Browse sessions from every project and jump back to that project's folder. | None realistic. |
| Send prompt and stay on Home | high | On Home, Ctrl+Enter sends the prompt to a new session and keeps you on Home so you can start several in a row. On a session screen Ctrl+Enter still inserts a newline. | Unit tests cover the command; installed Home Ctrl+Enter streak is not recorded. |
| Start a session with no model call | medium | Opens a project session without spending tokens. | Installed "it feels right" check is incomplete. |
| Session marks | medium | Mark a session complete, failed, or in progress (exclusive), or pin it. Agents can mark in progress; completion and reopening complete/failed sessions ask permission by default. Themed markers in lists and the sidebar. | Installed end-to-end confirmation is missing. |
| Remember this session's model | ~done~ | Each session keeps its model and reasoning choice across agent changes and restarts. | None realistic. |
| Don't lose the attached session | medium | Refreshing the global list should not drop the session you are in. | Manual installed check was left pending. |
| Recover after server restart | high | After the resident server bounces, the TUI should reconnect, restore the prompt, and not resubmit what was typed. | Still treat as high until daily reconnect after a bounce is trusted. |
| Clear interrupted questions | high | Aborting a session rejects a pending question, tells the UI, and does not leave a Cursor-backed chat stuck on that prompt. | Covered by tests. Not signed off in the installed app. |
| Questions survive closing the window | high | Pending questions reload when you open the session again (including via `occ`). If the live request is gone, the UI rebuilds from the saved tool call and your answer continues the agent as a normal follow-up. | Live check after close via `occ` and the session list; repeat after server restart (restored-question path). |

---

## 4. Workspace sidebar and files

One sidebar for usage, files, scripts, search, and status.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| Integrated workspace sidebar | high | Native sidebar: usage, files, git changes, scripts, context, MCP, LSP, todos, footer. Model and reasoning rows follow the current session (same as the prompt footer). Usage refreshes per provider after you use it and when you return; stale or cached numbers are dimmed with age on hover. | Two sessions on different models and reasoning: switch and confirm rows match the footer. Live Claude usage refresh and dim when stale. |
| Plugins in the sidebar | low | Collapsible "Plugins" section under MCP: every configured server and TUI plugin as one row with version, `server`/`tui` badges, and load errors; built-in plugins on one muted line. Opens itself when a plugin failed. Server data comes from `GET /plugin` (`plugin.status`). | Live check with the current `opencode.jsonc` and `tui.json` plugins; confirm `weztermZoom` and bgShell merge correctly. |
| Click a path to open it | high | Tool paths, edited files, and changed-file rows open in an editor chosen by extension via `openEditedWith` (a string or a map with `default` and per-extension keys). | Live click on a `.md` and a `.ts` path. |
| Sub-agents in the sidebar | high | Lists the current session's sub-agents with name, short title, and live status; click opens the child session. Shows running agents and recent finishes that drop off after a short time. Hidden when empty. | Live SuperPlan conductor or `task_batch`; rows update and click through. |
| Windows file search and script launch | high | Fast file lookup and launching repo scripts. WezTerm gets tab, window, and split targets; Windows Terminal gets matching `wt` targets; other terminals use native launch. A saved target the current terminal cannot run falls back to native. | Fresh Windows Terminal and conhost daily workflow sign-off. |
| Choose which usage meters to show | medium | Sidebar can show Codex, Cursor, Go, and OpenRouter usage. Defaults are on. | Latest installed picker interaction is not recorded. |
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
| Tab order and friendly names | medium | Custom agents can have a Tab cycle order and a readable label. | Installed-build check is incomplete. |
| Shared prompt files | medium | An agent can pull another file with `{file:...}` (relative, home, or absolute). | Installed-runtime freshness is uncertain. |
| Cheap vs hard delegated models | medium | Primary agent stays on the selected model. Routine child work can go cheaper; hard work can go to a high-reasoning agent. | A live delegated request is not recorded. |
| SuperPlan (plan + implement) | high | Paired planning and execution. Plans are sized (`size`/`phases` frontmatter) and split into phases with file allowlists and done-when checks. `plan_execute` offers this session, a new session, phase sessions (`plan_next_phase` hands off), or a conductor that sends each phase to a `general-*` sub-agent. Go stops only on red flags; `plan_closeout` archives finished plans. Planners are read/search/plan-file only. Execution uses the exact plan file that was written, not a reconstructed name. | Full user-feature workflow is still separate from the probes that passed. |
| Archive finished plans | ~done~ | Successful temp plans move to `plans/archive/`; failed or partial plans stay. | None realistic. |
| Default child agent | medium | `default_subagent` is used when a task does not name a child type. | Installed command and live request still need confirmation. |
| SuperGo, Debug, and Luna routing | high | Config `agents/` and `prompts/` set: Go, Debug family, SuperPlan aliases. Daily Luna sessions and Luna agents use `openai/gpt-6-luna` (live-checked). Luna stays off Max / `xhigh` unless asked. | Config-level, not fork source. Fresh restart is required after prompt edits. |
| Command markers (alpha) | medium | Off by default. When on, a line in an agent's reply that is exactly `$#` plus a name runs that command from global `~/.config/opencode/markers.json` with no tool call, so build/test logs never enter the model's context. Modes: `inline` (output replaces the line), `window` (visible PowerShell window, Windows only), `afterTurn` (runs once the session is idle). Global `ask` default with per-command override uses oc's permission prompt. Only the global file is read; agents must ask before editing it. oc lists the configured commands in the agent prompt for native models and Claude Code. Palette "Command markers (alpha)" toggles it after an alpha warning. Runs log to `markers.log`. Proof of concept live-checked on Claude Code and GPT-6.1 Sol. | Native build not live-checked. Window mode on macOS/Linux. Shell tools can still write `markers.json`, and an "always" edit approval also covers it. |
| Hide stock Plan agent | ~done~ | Built-in Plan is disabled in config (`disable`). Hidden is a different switch. | None realistic. |

---

## 6. Conversation and terminal feel

Timestamps, copy, keys, diffs, plugins, and the terminal itself.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| Agent square and status in the terminal tab | high | Terminal title starts with a `■` for the active agent. WezTerm colors it with the agent color through a tab-title snippet (in `v0.3.0.md`); other terminals show it uncolored. OSC progress shows busy, idle, and error states where the terminal supports it. | Live check on Windows Terminal (square and progress ring), conhost (square), WezTerm (square color follows the agent). |
| Response timestamps | medium | Local date/time, then duration. Uses start time while the reply is still streaming. | Final look in the installed UI is not recorded. |
| Text selection and copying | high | Double-click selects a word; triple-click selects a logical line including wrapped rows; dragging after those clicks extends by words or lines. Copy-on-release and Ctrl+C both retain the highlight; Escape clears it. Message actions, tool expand/collapse, and file-open controls are separate from selectable bodies. Clipboard writes finish in gesture order. | Focused renderer checks pass. Installed WezTerm gestures, message Actions, tool controls, and resize/scroll acceptance remain. Triple-click selects lines, not linguistic sentences. |
| Keybind layouts | medium | `keybind_preset` in `tui.json`: `oc` (default, `TuiKeybindPreset.oc` over upstream defaults; Ctrl+M models, Ctrl+S sessions, Ctrl+D variant, Ctrl+C never quits) or `opencode` (stock keys plus oc-only commands). User `keybinds` win over both. oc palette **Keybind layout** (`/keybindLayout`) switches live (`TuiConfig.Resolved.setKeybindPreset`, signal-backed `keybinds` getter) and writes `keybind_preset` to global tui.jsonc/tui.json via jsonc-parser. `docs/keybinds.md` tables are generated by `packages/tui/script/keybindDocs.ts`; `prePush.ps1` fails when stale. | Preset resolution tested. Live check of both layouts in the installed TUI not recorded. |
| Keys and command palette | high | Context-sensitive Ctrl+D, Ctrl+Shift+Up/Down, Ctrl+N for a new OC session. OC commands use a source order and friendly labels. `command_palette.order` in `opencode.jsonc` can reorder commands inside a category; unlisted commands keep source order. Shut down and restart sit in the `oc` section. Slash-menu Ctrl+F toggles persistent favorites for skills, commands, MCP prompts, and oc actions; small solid-diamond favorites lead the empty search, while typed search keeps fuzzy ranking. The session slash menu reserves space above the prompt so current output stays visible; shorter terminals use a smaller menu. Multiple prompt commands such as `/spit /think` combine as labeled instructions in one turn; later pickers preserve existing text. The first command controls agent/model routing; secondary routing commands must run first or separately. | Ordering, favorite identity, Ctrl+F input ownership, slash-menu layout/bottom-follow, composition delivery, and multiline/Unicode completion and Escape are tested. Installed `/spit /think` plan delivery, slash-menu streaming visibility, toggling, selection retention, and restart persistence need a live check. A full palette click-through is not recorded. |
| Don't crash on odd tool text | medium | Coerces non-string OpenTUI text nodes (numbers become strings; null/boolean and other `add()` explosions are skipped) so nested tool output does not take down the UI. | Live "no regression" check is not recorded. |
| Diff hover colors | ~done~ | Neutral diff regions share one hover background; add/remove colors stay. | None realistic. |
| Crow session lock | medium | Each Crow tab stays on one OpenCode session via `CROW_SESSION_HANDLE`. Targeted commands only run on that handle. Optional `CROW_SESSION_ROUTE_URL` reports session changes. | Live Crow integration is limited. |
| Parallel bgShell jobs | medium | Independent work starts with concurrent `bgRun`; short commands stay as bash. | Sibling `bgShell` plugin, not this git checkout. Agent `opencode-pty` removed. TUI `/pty` is human-only. |

---

## 7. Debug instance (`ocdebug`)

A second OpenCode that can run beside production.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| Isolated `ocdebug` | high | Native PATH command, own data/config, port **4097**, copies production settings on first run, can overwrite from the palette (then restart). Export/import copies sessions. | Trust it beside production in daily use. |
| Import *all* production extras | high | Import also copies agents, prompts, commands, modes, plugins, skills, tools, and themes. Debug-only files stay unless overwritten. | Restart after import. |

---

## 8. Windows build, install, and logging

Build safely, install without fighting locks, and keep logs.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| PowerShell build / install / release | ~done~ | Scripts for build, debug build, install, pre-push check, push, release, upstream sync, and revive (`revive.ps1`, `reviveAndInstall.ps1`). Installer rebuilds by default, stops running OC first, can keep a timestamped backup. | Agents must not run installers (they can kill the host). |
| Agent-safe build vs user install | ~done~ | Agents can build. Install later with `-NoBuild`. Debug-only install does not touch production. | None realistic. |
| `oc.exe` / `occ.exe` hard links | ~done~ | Installer links those names to the same production binary and accepts a valid link set. | None realistic. |
| Stop processes before rebuild | ~done~ | Installer stops managed processes *before* build so `ocdebug.exe` cannot lock cleanup. | None realistic. |
| Refuse crashing Bun 1.4.0 | high | Will not compile the Windows TUI with the known-bad Bun. Can upgrade to a canary. | Automatic global Bun upgrades are an operational risk. |
| Cleaner hidden Windows commands | medium | Runs the Windows shell more directly and hides extra `taskkill` windows. | Escape-to-cancel confirmation is missing. |
| Packaged ChatGPT/Cursor helpers | high | Agentify and Cursor files sit next to the exe so they work outside the source tree. Canonical installer copies them. | Combined upstream-sync installer still may omit those folders. |
| On-disk debug logs | medium | Channel-aware logs, 20 MB rotate, palette and HTTP toggle. | Live restart and installed palette acceptance are not recorded. |

---

## 9. Keeping the fork updated

Stay close to upstream without losing custom work.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| Safe upstream sync | medium | Isolated upstream checkout, content compare, preserve custom files, stop on overlap, bump maintenance version, optional build/install. | No shared Git merge base. Combined installer can omit provider runtimes. |
| Separate display version | ~done~ | Fork version in the TUI footer is independent of OpenCode's package version. Compatible plugins can read the current model, preferred editor, and this display version. | None realistic. |
| Windows-safe generated paths | ~done~ | Fixes Windows migration path generation and invalid custom-element declarations. | None realistic. |

---

## Retired or superseded (not in the counts)

These used to be customizations. They are history, not a backlog.

- Standalone `oc.config.json` / `OPENCODE_OC_CONFIG` wrapper
- External intro-script setting
- Initial model / agent / reasoning palette settings (native session setup replaced them)
- Global `ignoreAgentModels` (per-session model memory replaced it)
- Standalone openSidebar plugin (native sidebar replaced it)
- Singular-only global `agent/` folder (canonical is `agents/`; projects may still discover both)
- Earlier snake/wave startup animations (column sweep remains)
- Windows `opencode-process-tree.exe` supervisor (removed; direct spawn remains)
- Open Computer Use MCP (uninstalled)
- Web UI and Electron desktop packages (removed from this checkout)
- Intermediate clack "type to filter" project list (replaced by the real TUI picker)
- Cursor native plan-mode bridge (acknowledged, not activated)
- ocdebug PowerShell wrapper function (native `ocdebug.exe` replaced it)
- OpenTUI raw-mode resume patch (removed; stock 0.4.5 resume remains)

---

## Caveats

- This checkout does not share a Git merge base with upstream. "Custom" is judged from notes, `Custom fork:` markers, isolated packages (`agentify-runtime`, `cursor-runtime`), `.scripts`, and `~/.config/opencode` agents.
- Several "high" rows are source-complete and waiting on a rebuild (`install` stops the running app).
- Small wording, generated-client, and selector fixes are support for the features above, not their own product rows.
- `octray`, Everything Search, and `bgShell` are sibling checkouts. They still shape daily OC use.

---

## Related files

| File | Role |
|---|---|
| `FORK.md` | **This file.** Living definition of OC. |
| `README.md` | Public landing page and the line count `prePush.ps1` refreshes. |
| `README.OG.md` | Native OpenCode map: Now / Keep / Upstream. Not the OC product list. |
| `SCRIPTS.md` | How to build, install, and sync. |
| `UPSTREAM-SYNC.md` | How upstream is applied without dropping custom work. |
| `AGENTS.md` | Agent working rules for this checkout. |
| `buildNotes.md` | Session history. Evidence, not product definition. |

---

## Maintenance

This file is the source of truth for what OC is and how complete each piece is.

- Change a level when new live proof arrives, or when the behavior actually changes.
- Keep retired work out of the counts.

- File new capabilities under how they are *used*.
- Keep OC-only work in this file. Native OpenCode belongs in the `README.OG.md` Tracking table (Now / Keep / Upstream).
- Session notes stay in `buildNotes.md`. This document stays the product contract.
