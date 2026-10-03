# oc

**This is the project definition for this OpenCode fork.** It tracks oc-only work. `README.OG.md` tracks native OpenCode in this checkout (what is still stock, what should stay stock, and same / pin / lag / gone vs isolated upstream).

oc is a personal, Windows-first OpenCode: native `oc` launcher, extra model providers, a workspace sidebar, custom planning agents, and local build/install tooling. Stock OpenCode still supplies the core chat, tools, and terminal UI. Everything listed below is what this project added or changed, and how complete that work is today.

Use this file to agree on what oc *is*. Statuses describe current state. They do not authorize implementation work.

Last reviewed: 2026-10-02

## Progress

[512,106](scc.txt) lines of code and counting...

<!-- code-count:start -->

| Language | Files | Lines | Blanks | Comments | Code |
|---|---:|---:|---:|---:|---:|
| Astro | 8 | 1,299 | 150 | 10 | 1,139 |
| CSS | 163 | 40,551 | 5,296 | 574 | 34,681 |
| Go | 5 | 902 | 54 | 3 | 845 |
| HTML | 1 | 1,161 | 79 | 0 | 1,082 |
| JavaScript | 23 | 5,259 | 419 | 63 | 4,777 |
| Nix | 3 | 258 | 23 | 26 | 209 |
| Powershell | 18 | 1,248 | 113 | 28 | 1,107 |
| SQL | 95 | 592 | 0 | 17 | 575 |
| Shell | 1 | 120 | 17 | 17 | 86 |
| TypeScript | 2,698 | 525,228 | 42,747 | 14,876 | 467,605 |
| **Total** | **3,015** | **576,618** | **48,898** | **15,614** | **512,106** |

<!-- code-count:end -->

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
| ~done~ | 18 |
| high | 18 |
| medium | 22 |
| low | 0 |
| CRITICAL | 0 |
| **Total** | **58** |

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
| Cursor as a native model | medium | Talks to local Cursor as an OpenCode model (tools, reasoning, connection proxy). The picker can show live multi-tier models (Grok 4.7 base, Fast, 500k, and Claude Opus 5.5 metadata) with matching context, wire params, and pricing. | Live auth/request proof is thin. Git/shell protocol parity is deferred. Compaction and "this is OpenCode, not Cursor IDE" guidance were added later and look solid in tests. |
| Hide Cursor's own plan mode | ~done~ | Cursor-backed chats no longer open Cursor's native plan/spec flow. OpenCode planning agents stay available. | None realistic. |
| Start helpers only when needed | high | Browser and Cursor helpers start on first use and shut down with the server. | Not every provider has a live start/stop check. |

---

## 2. Launching OpenCode, the tray, and the background server

Get into a project quickly, keep a local server running, and control it from the tray or flags.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| Native `oc` launcher | ~done~ | `oc` is OpenCode itself, with settings in `~/.config/opencode/oc.json`. Launch, previous session (`occ`), diagnostics, and `oc config get/set` all work. The `occ` desktop shortcut runs `occ.exe` directly (no PowerShell profile), and `occ` looks up the last session while the server starts. | None realistic. |
| Run after turn and revive | high | **Revive** restarts oc: `/revive-no-install` runs `.scripts\revive.ps1` (shut down, reopen); `/revive` runs `.scripts\reviveAndInstall.ps1` (build while oc is still up, shut down, install, reopen). The paths come from `oc.json` `revive.path` and `revive.installPath` (exe or `.ps1`); each command is hidden when its path is unset. The palette commands run the script directly with no agent turn and close WezTerm at once. A `.ps1` runs in its own titled console via `start`. **`run_after_turn`** is a built-in tool that lets an agent queue an exe or `.ps1` to run once its turn ends (`/agent-revive` uses it). Its permission is `run_after_turn`: the built-in default allows it, and the global `opencode.jsonc` asks except for `.scripts\revive*.ps1`. | Revive closes *every* WezTerm window, not only oc ones (band-aid with a TODO). The latest revive changes are not live-checked. TODO: `/agent-revive` and `/agent-revive-no-install` do not work in Claude Code sessions, because the oc proxy does not expose `run_after_turn`. |
| Separate home vs OC directory | high | Bare `oc` and relative project names can use two different folders. Absolute paths stay absolute. | Latest palette settings may still need a rebuild/restart to show in the running app. |
| New-session project picker | high | Tray/palette "New session" starts the intro, then the real OpenCode project picker, then attaches to the running server. | Confirm the installed `oc.exe` shows the intended picker. |
| Startup loading animation | medium | Column-sweep animation while the server and session come up. Fills and re-centers when the window is snapped or resized. | Visual sign-off in the running app is still thin. Resize fix not checked through the installed `occ` shortcut and TUI handoff. |
| Resident background server | medium | Local server stays up between launches (production port **4096**). Palette can shut down or restart it. Server shutdown and restart close session admission, wait up to 30 seconds for active-work cancellation, then dispose project resources before scheduling exit. Attach can forward model/agent. A stale server record no longer adds a 10-second wait on the first `oc` launch; a launch during an active restart still waits for the replacement. On Windows the server starts through a hidden `Start-Process` hop, so it has a hidden console (no flashing windows from its child processes) and outlives the launcher. | Full installed shutdown/restart flow is not fully signed off. The hidden PowerShell hop costs about a second; a direct native launch waits on the Bun Windows FFI fix. |
| Start server at Windows sign-in | high | OC settings can turn sign-in auto-start on or off. | Final installed palette click is not recorded. |
| `oc --kill-server` / `--restart-server` / `--shutdown-all` | high | Simple flags for the tray and CLI to stop or bounce the resident server without a full TUI. `--shutdown-all` closes WezTerm and every oc process, then stops both resident servers (used by revive). | Tray wiring exists; treat as nearly done once it is used from a cold start. |
| Faster command startup | ~done~ | Only the command asked for is loaded. `--version` is much quicker. | None realistic. |
| Windows tray (`octray`) | medium | Separate tray app: open OC, open the project picker, start the server if it is down, restart/shut down the server. | Logs, live status, and settings menu items are still thin. Not inside this git checkout. |
| No browser/desktop OpenCode app | ~done~ | This checkout no longer builds the website UI or Electron desktop app. CLI, TUI, and API remain. `README.OG.md` states that. | Some `packages/web` pages still mention desktop / `opencode web`. Intentional removal, not a missing product. |

---

## 3. Sessions and model choices

Move between projects, keep a session's model, and mark work without deleting it.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| All-projects session list | ~done~ | Browse sessions from every project and jump back to that project's folder. | None realistic. |
| Start a session with no model call | medium | Opens a project session without spending tokens. | Installed "it feels right" check is incomplete. |
| Session marks | medium | Mark a session complete, failed, or in progress (exclusive), or pin it. Agents can mark in progress; completion and reopening complete/failed sessions ask permission by default. Themed markers in lists and the sidebar. | Installed end-to-end confirmation is missing. |
| Remember this session's model | ~done~ | Each session keeps its model and reasoning choice across agent changes and restarts. | None realistic. |
| Don't lose the attached session | medium | Refreshing the global list should not drop the session you are in. | Manual installed check was left pending. |
| Recover after server restart | high | After the resident server bounces, the TUI should reconnect, restore the prompt, and not resubmit what was typed. | Still treat as high until daily reconnect after a bounce is trusted. |
| Clear interrupted questions | high | Aborting a session rejects a pending question, tells the UI, and does not leave a Cursor-backed chat stuck on that prompt. | Covered by tests. Not signed off in the installed app. |

---

## 4. Workspace sidebar and files

One sidebar for usage, files, scripts, search, and status.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| Integrated workspace sidebar | ~done~ | Native sidebar: usage, files, git changes, scripts, context, MCP, LSP, todos, footer. Usage refreshes after idle. | None realistic. |
| Click a path to open it | ~done~ | Tool paths, edited files, and changed-file rows open in the configured editor. | None realistic. |
| Windows file search and script launch | high | Fast file lookup and launching repo scripts in WezTerm (or copy). WezTerm GUI vs CLI executable mapping is fixed. | Broader daily-workflow sign-off is limited. |
| Choose which usage meters to show | medium | Sidebar can show Codex, Cursor, Go, and OpenRouter usage. Defaults are on. | Latest installed picker interaction is not recorded. |
| Everything Search (Windows) | high | Starts the Everything daemon when needed, reconnects if it drops, does not try to own shutdown. Friendly sort names work in the local checkout. | Full start/reconnect acceptance is incomplete. Lives partly in `mcp-everything-search`. |

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
| Hide stock Plan agent | ~done~ | Built-in Plan is disabled in config (`disable`). Hidden is a different switch. | None realistic. |

---

## 6. Conversation and terminal feel

Timestamps, copy, keys, diffs, plugins, and the terminal itself.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| Response timestamps | medium | Local date/time, then duration. Uses start time while the reply is still streaming. | Final look in the installed UI is not recorded. |
| Copy on release vs Ctrl+C | medium | Copy-on-release or Ctrl+C. Removed a Windows console poll that contributed to crashes. | In-TUI copy-mode checks were blocked. |
| Keys and command palette | high | Context-sensitive Ctrl+D, Ctrl+Shift+Up/Down, Ctrl+N for a new OC session. OC commands use a source order and friendly labels. `command_palette.order` in `opencode.jsonc` can reorder commands inside a category; unlisted commands keep source order. Shut down and restart sit in the `oc` section. | Order and labels are tested. A full click-through in the installed app is not recorded. |
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
| `README.md` | **This file.** Living definition of OC. |
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

