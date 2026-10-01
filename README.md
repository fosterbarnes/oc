# OC

**This is the project definition for this OpenCode fork.** It tracks OC-only work. `README.OG.md` tracks native OpenCode in this checkout (what is still stock, what should stay stock, and same / pin / lag / gone vs isolated upstream).

OC is a personal, Windows-first OpenCode: native `oc` launcher, extra model providers, a workspace sidebar, custom planning agents, and local build/install tooling. Stock OpenCode still supplies the core chat, tools, and terminal UI. Everything listed below is what this project added or changed, and how complete that work is today.

Use this file to agree on what OC *is*. Statuses describe current state. They do not authorize implementation work.

Last reviewed: 2026-09-30

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
| ~done~ | 19 |
| high | 21 |
| medium | 22 |
| low | 0 |
| CRITICAL | 3 |
| **Total** | **65** |

---

## How this document works

- Names describe what you can *use*, not where the code lives.
- Related backend plumbing is folded into the user-facing feature it supports.
- Companion pieces that live next to this repo (`octray`, Everything Search, SuperPlan agents) are included when they are part of daily OC use.
- Status is conservative: tests and source are not enough for **~done~** when a rebuild, login, or interactive check is still part of the feature.
- `README.OG.md` tracks native OpenCode (Now / Keep / Upstream). Hosted docs at opencode.ai remain upstream.

---

## 1. Models and providers

Use ChatGPT, Claude, or Cursor from OpenCode without treating them as ordinary API-only vendors.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| ChatGPT Web | ~done~ | Uses a normal ChatGPT website login as a built-in model. Starts a managed Edge window only when needed. | Keep packaged with new installs. |
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
| Native `oc` launcher | ~done~ | `oc` is OpenCode itself, with settings in `~/.config/opencode/oc.json`. Launch, previous session (`occ`), diagnostics, and `oc config get/set` all work. | None realistic. |
| Run after turn and revive | ~done~ | Built-in `run_after_turn` tool runs an exe once the agent's turn ends (permission `run_after_turn`, allowed by default). `/revive-no-install` and `/revive` run oc.json `revive.exe` / `revive.installExe` directly with no agent turn; each is hidden when unset. | None realistic. A detached `pwsh` gets no console and exits without running, so queue console apps that open their own window. |
| Separate home vs OC directory | high | Bare `oc` and relative project names can use two different folders. Absolute paths stay absolute. | Latest palette settings may still need a rebuild/restart to show in the running app. |
| New-session project picker | high | Tray/palette "New session" starts the intro, then the real OpenCode project picker, then attaches to the running server. | The intermediate full-screen list was tried and dropped. Confirm the installed `oc.exe` shows the intended picker. |
| Startup loading animation | medium | Column-sweep animation while the server and session come up. | Visual sign-off in the running app is still thin. |
| Resident background server | medium | Local server stays up between launches (production port **4096**). Palette can shut down or restart it. Attach can forward model/agent. A stale server record no longer adds a 10-second wait on the first `oc` launch; a launch during an active restart still waits for the replacement. On Windows the server starts through a hidden `Start-Process` hop, so it has a hidden console (no flashing windows from its child processes) and outlives the launcher. | Full installed shutdown/restart flow is not fully signed off. |
| Start server at Windows sign-in | high | OC settings can turn sign-in auto-start on or off. | Final installed palette click is not recorded. |
| `oc --kill-server` / `--restart-server` | high | Simple flags for the tray and CLI to stop or bounce the resident server without a full TUI. | Tray wiring exists; treat as nearly done once it is used from a cold start. |
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
| Complete / failed marks | medium | Mark a session done or failed. Themed check/cross in lists and the sidebar. Marks are exclusive and stay in list order. | Installed end-to-end confirmation is missing. |
| Remember this session's model | ~done~ | Each session keeps its model and reasoning choice across agent changes and restarts. | None realistic. |
| Don't lose the attached session | medium | Refreshing the global list should not drop the session you are in. | Manual installed check was left pending. |
| Recover after server restart | high | After the resident server bounces, the TUI should reconnect, restore the prompt, and not resubmit what was typed. | A successful debug session closed the investigation. Remaining `/status` 404 noise is unrelated. Still treat as high until daily use is trusted. |
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
| Markdown agents from folders | medium | Loads agents from `agent/` and `agents/` (global or project). Bad sibling files are skipped with a path warning. `opencode agent validate` exists. | Installed command availability and UI discovery after restart were unverified. |
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
| Keys and command palette | high | Context-sensitive Ctrl+D, Ctrl+Shift+Up/Down, Ctrl+N for a new OC session. OC commands use a source order and friendly labels. `command_palette.order` in `opencode.json` can reorder commands inside a category; unlisted commands keep source order. Shut down and restart sit in the `oc` section. | Order and labels are tested. A full click-through in the installed app is not recorded. |
| Don't crash on odd tool text | medium | After the OpenTUI upgrade, non-string or nested text no longer takes down the UI. | No explicit "no regression" confirmation. |
| Diff hover colors | ~done~ | Neutral diff regions share one hover background; add/remove colors stay. | None realistic. |
| Crow session lock | medium | Each Crow tab stays on the exact OpenCode session; Tailscale callback address works. | Live integration evidence is limited. |
| Resume after `/editor` | high | After an external editor, TUI resume is whatever stock OpenTUI 0.4.5 does. The previous raw-mode resume patch and its test are gone. | Live `/editor` return is unconfirmed. Raw-mode throw on resume may come back. |
| Parallel bgShell jobs | medium | Independent work starts with concurrent `bgRun`; short commands stay as bash. | Local plugin `C:\Users\user\Documents\GitHub\bgShell\bgShell.js`. Agent `opencode-pty` removed. TUI `/pty` is human-only. |
| Plugin / session-bomb hygiene | high | Plugin list uses npm or file specs only (no plugins *folder* in the list). Ponytail is back as a normal npm plugin. Agents must not dump huge plugin errors into keeper chats. | Stops *new* landmine transcripts. Does not repair old poisoned sessions. |
| Fork display version for plugins | high | Compatible plugins can read the current model, preferred editor, and fork version. | External plugins are not broadly tested. |
| Session paint death | **CRITICAL** | Scrolling a heavy chat can blank or tear the whole TUI. Palette rows may only appear on hover until a full reopen. | Seen on the previous OpenTUI pin. Catalog is now isolated-upstream 0.4.5. Do not mark fixed until a live Windows smoke check. Not a sidebar bug. See the revert section. |
| WezTerm letter-key death | **CRITICAL** | After that same break, letters and main Enter do nothing while arrows and Ctrl+P still work. | Seen on the previous OpenTUI pin (Windows key sequences WezTerm started sending). Catalog is now 0.4.5. Do not mark fixed from the downgrade alone. |

---

## 7. Debug instance (`ocdebug`)

A second OpenCode that can run beside production.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| Isolated `ocdebug` | high | Native PATH command, own data/config, port **4097**, copies production settings on first run, can overwrite from the palette (then restart). Export/import copies sessions. | Trust it beside production in daily use. |
| Import *all* production extras | high | Import also copies agents, prompts, commands, modes, plugins, skills, tools, and themes. Debug-only files stay unless overwritten. | Restart after import. |
| Debug paint freeze (empty transcript) | **CRITICAL** | `ocdebug` currently hides user bubbles, assistant text, and tools as a diagnostic "last healthy paint." Thoughts, sidebar, and prompt remain; the real chat does not. | Frozen experiment, not a product feature. Production TUI still draws everything. |

---

## 8. Windows build, install, and logging

Build safely, install without fighting locks, and keep logs.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| PowerShell build / install / release | ~done~ | Scripts for build, debug build, install, pre-push check, push, release, upstream sync, safe shutdown, and revive. Installer rebuilds by default, stops running OC first, can keep a timestamped backup. | Agents must not run installers (they can kill the host). |
| Agent-safe build vs user install | ~done~ | Agents can build. Install later with `-NoBuild`. Debug-only install does not touch production. | None realistic. |
| `oc.exe` / `occ.exe` hard links | ~done~ | Installer links those names to the same production binary and accepts a valid link set. | None realistic. |
| Stop processes before rebuild | ~done~ | Installer stops managed processes *before* build so `ocdebug.exe` cannot lock cleanup. | None realistic. |
| Refuse crashing Bun 1.4.0 | high | Will not compile the Windows TUI with the known-bad Bun. Can upgrade to a canary. | Automatic global Bun upgrades are an operational risk. |
| Cleaner hidden Windows commands | medium | Runs the Windows shell more directly and hides extra `taskkill` windows. Process-tree helper was **removed**. | Escape-to-cancel confirmation is missing. |
| Packaged ChatGPT/Cursor helpers | high | Agentify and Cursor files sit next to the exe so they work outside the source tree. Canonical installer copies them. | Combined upstream-sync installer still may omit those folders. |
| On-disk debug logs | medium | Channel-aware logs, 20 MB rotate, palette and HTTP toggle. | Live restart and installed palette acceptance are not recorded. |

---

## 9. Keeping the fork updated

Stay close to upstream without losing custom work.

| Feature | Level | What it does | What's left |
|---|---|---|---|
| Safe upstream sync | medium | Isolated upstream checkout, content compare, preserve custom files, stop on overlap, bump maintenance version, optional build/install. | No shared Git merge base. Combined installer can omit provider runtimes. |
| Separate display version | ~done~ | Fork version in the TUI footer is independent of OpenCode's package version. | None realistic. |
| Match isolated upstream OpenTUI 0.4.5 | high | Catalog and plugin peers follow isolated upstream 0.4.5. No version-specific OpenTUI resume patch. | Paint, key, and `/editor` resume still need a live Windows check. See CRITICAL below. |
| Windows-safe generated paths | ~done~ | Fixes Windows migration path generation and invalid custom-element declarations. | None realistic. |

---

## CRITICAL issues (must see these first)

These are not extra rows. They restate the three **CRITICAL** items already counted in sections 6 and 7. They are breakages sitting on top of otherwise useful work.

| Issue | Level | What it feels like | Why it is CRITICAL |
|---|---|---|---|
| Session paint death | **CRITICAL** | Scrolling a large chat (especially a long markdown dump) blanks the screen. Palette rows may only appear on hover. It stays dead until a full close and reopen. | Proven in debug on the previous OpenTUI pin: layout numbers stay valid while the screen dies. Dummy text of the same size still dies. This is the terminal drawing layer, not "the sidebar is wrong." Catalog is now OpenTUI 0.4.5; re-validate after rebuild. |
| WezTerm letter-key death | **CRITICAL** | After that same break, `a-z` and main Enter do nothing. Arrows, numpad Enter, and Ctrl+P still work. | On the previous OpenTUI pin, WezTerm started sending Windows-style key sequences that the renderer did not decode. PowerShell 7 can still take letters while paint is already dead. Two bugs, one trigger zone. Catalog is now 0.4.5; re-validate after rebuild. |
| Debug paint freeze (empty transcript) | **CRITICAL** | Debug instance shows almost no messages on purpose. | Last diagnostic freeze after turn 58. Fine as a probe, unusable as a second OpenCode. |

Related but not labeled CRITICAL: plugin-folder config once *created* the huge transcript that makes the paint bug easy to hit. That config path is already cleaned. Old forked sessions still contain the blob.

---

## Issues that would **100%** go away on stable / v1 components

"100%" here means the failure path is in a specific unstable layer. Replacing *that* layer removes the bug. Replacing an unrelated custom feature does not.

### What "stable / v1" means in this table

| If you revert... | You leave... |
|---|---|
| **A.** The current OpenTUI 0.4.5 terminal UI for the older Go / pre-OpenTUI TUI (classic v1 UI) | Same OpenCode chat backend |
| **B.** Only *custom* TUI widgets (sidebar, timestamps, ocdebug hides) while keeping OpenTUI 0.4.5 | Same renderer |
| **C.** Custom providers, SuperPlan, `oc` launcher, etc. | Same TUI |

Only column **A** is a true renderer revert. Column **B** does **not** fix the blank screen.

| Bug | 100% gone if... | Not gone if... |
|---|---|---|
| Session paint death | Leave OpenTUI for a TUI that does not paint through this renderer (classic v1 Go TUI). Matching upstream 0.4.5 is not proof this is gone. | Only remove the sidebar, SuperPlan, or ChatGPT Web. Stock OpenTUI still died on the same blob on the previous pin. Hiding widgets in `ocdebug` only *avoids* drawing; it is not a fix. |
| WezTerm letter-key death | Leave OpenTUI's key parser (v1 TUI does not use it). Matching upstream 0.4.5 is not proof this is gone. | Disable `allow_win32_input_mode` in WezTerm (already tried; not the lever). Same OpenTUI in PowerShell can still paint-blank *without* this key bug. |
| Typing dead after `/editor` if resume throws on raw-mode | Classic v1 TUI never takes this OpenTUI resume path. The previous resume patch is removed; 0.4.5 is unpatched. | Do not treat the downgrade as a resume fix. Confirm `/editor` return after rebuild. |
| Debug paint freeze (empty transcript) | Revert the ocdebug-only hide flags to the normal session renderer. | That immediately puts `ocdebug` back on the **same** paint landmine. Solved empty-chat; not solved blank-paint. |

### Explicitly **not** 100% (do not revert the stack for these)

| Problem | Why a v1 / stable TUI revert is not a guaranteed cure |
|---|---|
| Claude Web / Cursor live login still unproven | Custom providers. Stock OpenCode never had them. |
| Resident server, tray, `oc` picker polish | Custom launcher. v1 OpenCode does not replace this product. |
| PTY "WAITING FOR PTY" then dead main prompt | Involves the PTY plugin plus TUI focus. Reconnect work later looked good; original hang is not proven to be OpenTUI-only. |
| Plugin toast dumping into chat ("session bombs") | Config and agent behavior. Any TUI version will store a huge message if the model writes one. |
| Typecheck noise in `local.tsx` | Generated client types. Unrelated to the blank screen. |
| Everything Search / WezTerm script launch | Windows extras. Independent of v1 TUI. |
| Upstream-sync installer omitting provider runtimes | Install script gap. |
| Bun 1.4.0 TUI segfault | Known Bun bug. This fork already refuses to ship that compiler. |

**Short version:** the only family of bugs that can honestly be marked "fixed by going back to stable/v1 UI" is the **OpenTUI paint and key-decode** family (blank session, hover-only palette, WezTerm letter death), if those still reproduce on 0.4.5. Matching isolated upstream 0.4.5 does not by itself mark them fixed. Everything else is custom-on-purpose or unproven.

The old process-tree helper is already gone. Extra console flashes from it are not an open revert question.

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

---

## Caveats

- This checkout does not share a Git merge base with upstream. "Custom" is judged from notes, `Custom fork:` markers, isolated packages (`agentify-runtime`, `cursor-runtime`), `.scripts`, and `~/.config/opencode` agents.
- Several "high" rows are source-complete and waiting on a rebuild (`install` stops the running app).
- Small wording, generated-client, and selector fixes are support for the features above, not their own product rows.
- `octray` and Everything Search are sibling checkouts. They still shape daily OC use.

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
