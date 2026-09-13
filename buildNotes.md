# Build Notes

## Cumulative Summary

- `buildNotes.archive1.md` contains the complete prior history through 2026-09-09.
- The custom fork preserves its OpenCode, TUI, session, CLI, upstream-sync, and Windows build/install changes.
- The current fork also contains a built-in lazy ChatGPT Web provider using an OpenCode-owned Node child and Edge CDP.

---

## 2026-09-09 (~20:30) - fix built-in ChatGPT Web invalid URL - GPT-5.6 Luna, Thinking; Debug

### Agent
- Root cause: `providerInfo()` exposed an empty `api.url`; the OpenAI-compatible SDK rejected it before the lazy fetch wrapper could rewrite it.
- Changed `packages/opencode/src/provider/agentify.ts` to expose `http://127.0.0.1/v1` as the valid placeholder; wrapper still replaces it with the allocated child port.
- Changed runtime `main.mjs` to import `randomUUID` explicitly from `node:crypto`.
- Verification: provider tests 3 pass; runtime tests 3 pass; OpenCode typecheck passed; focused `git diff --check` passed.
- ERROR: Installed executable must be rebuilt and installed again before this fix is available in `oc`; live ChatGPT login smoke remains pending.

### User
- The `Invalid URL` failure was caused by the built-in provider publishing an empty endpoint. The source fix is ready; rebuild and reinstall before retesting ChatGPT Web.

## 2026-09-10 (~01:26) - package Agentify runtime with compiled OpenCode

### Agent
- Root cause: compiled Bun `import.meta.url` resolved to `B:/~BUN/root`, producing the nonexistent `B:\agentify-runtime\main.mjs` path.
- Changed `packages/opencode/src/provider/agentify.ts` to resolve compiled runtime assets beside `process.execPath`, while preserving source checkout resolution for development and tests.
- Changed `packages/opencode/script/build.ts` to copy `packages/agentify-runtime` beside each built executable.
- Changed `.scripts/install.ps1` to install the packaged runtime directory with the executable.
- Verification: provider tests 3 pass; typecheck 30 packages pass; clean Windows build passes `--version`; packaged smoke test spawned the runtime, passed readiness, and returned `Test received` / `Works!` from ChatGPT Web.
- Remaining: clean executable is built but not installed because the current `C:\Users\user\Apps\opencode\opencode.exe` process is still running.

## 2026-09-10 (~02:24) - prevent duplicate Agentify windows and sends

### Agent
- Removed the startup-only default ChatGPT tab; the first affinity key now claims the launch target, while later keys use separate windows.
- Forwarded session affinity through Agentify preflight calls and removed blind CDP target creation retries.
- Made ChatGPT submission single-attempt with aligned composer confirmation and no automatic resend after ambiguity or timeout.
- Skipped remote Agentify title generation and session-level Agentify retries while preserving other provider behavior.
- Verification: runtime tests 13 pass; focused OpenCode tests 112 pass and 14 skip; typecheck 30 packages pass; clean Windows build passes `--version`; final direct compiled smoke returned one ChatGPT response.
- ERROR: Installing the clean artifact remains blocked while `C:\Users\user\Apps\opencode\opencode.exe` is running as PID `29024`.

### User
- Agentify now targets one browser window per session key and submits each OpenCode message once; close OpenCode and rerun the no-build installer to activate it in `oc`.

## 2026-09-10 (~current) - activated duplicate-send fix

### Agent
- Verified the installed `C:\Users\user\Apps\opencode\opencode.exe` and packaged `agentify-runtime\main.mjs` are present.
- Verified the installed executable reports `0.0.0-main-202609100220`.
- User confirmed the end-to-end Agentify flow is working.

### User
- Confirmed ChatGPT Web requests now work after installation.

## 2026-09-10 (~current) - add Claude Web to built-in browser provider

### Agent
- Confirmed the working path is the OpenCode-owned Node runtime under `packages/agentify-runtime`, which launches managed Edge over CDP without Electron.
- Added the `agentify/claude-web` model, Claude vendor metadata, vendor-specific selectors, streaming detection, and per-session Claude affinity.
- Kept ChatGPT routing and defaults unchanged; updated runtime documentation and focused coverage for model listing, preflight routing, and selector selection.
- Verification: runtime syntax checks and 14 runtime tests pass; provider tests 3 pass; OpenCode typecheck passes; focused `git diff --check` passes.
- Remaining: rebuild/install the custom executable and perform a live Claude login/request check.

---

## 2026-09-10 (~16:28) - add managed server lifecycle controls - GPT-5.6 Luna, Thinking; Build

### Agent
- Meta: Added lifecycle controls for the resident server without adding tray UI or reconnect behavior.
- Added `ServerLifecycle` process control and managed `serve` shutdown/restart callbacks.
- Added authenticated `/global/shutdown` and `/global/restart` routes with typed unavailable errors for in-process servers.
- Extended `attach` with model and agent forwarding so the wrapper's existing session configuration survives remote attach.
- Added confirmed `server.shutdown` and `server.restart` TUI palette commands with transport error toasts.
- Regenerated SDK artifacts and added route coverage, SDK checks, and HTTP exerciser scenarios.
- Verification: OpenCode and TUI typechecks passed; focused HTTP API/SDK tests passed; HTTP coverage and auth passed; global effect scenarios passed.
- ERROR: Full effect harness reports unrelated PTY creation failures at `/pty` and `/api/pty`; source lifecycle checks pass. Installed executable rebuild/deployment remains pending.

### User
Server control
- The command palette now offers server shutdown and restart actions.
- Both actions ask for confirmation and warn that the current TUI will disconnect.
- The server can be restarted or stopped without adding a tray application.

## 2026-09-10 (~current) - close remaining vendor affinity gap

### Agent
- Fixed direct runtime requests that specify `claude-web` without a key so they select or create a Claude tab instead of falling back to ChatGPT.
- Restored URL-based matching for tabs without vendor metadata and added direct bare-query regression coverage.
- Verification: runtime syntax checks and 14 runtime tests pass; provider tests 3 pass; OpenCode typecheck passes; `git diff --check` passes.
- Remaining: rebuild/install the custom executable and perform a live Claude login/request check.

## 2026-09-10 (~current) - address Claude review findings

### Agent
- Restored ChatGPT stop-state detection when no send control is visible, kept Claude streaming detection vendor-specific, and removed streaming placeholders from Claude's final assistant selector.
- Added direct OpenAI model alias resolution, explicit-tab vendor checks, and conflict responses for controller send-state failures.
- Verification: runtime syntax checks and 14 runtime tests pass; provider tests 3 pass; OpenCode typecheck passes; `git diff --check` passes.
- Remaining: rebuild/install the custom executable and perform a live Claude login/request check.

## 2026-09-10 (~16:48) - stop running OpenCode processes before install - GPT-5.6 Luna, Thinking; Build

### Agent
- Meta: Made the standalone Windows installer release the executable only after active OpenCode processes stop.
- Added bounded `Get-Process -Name opencode` shutdown and a 30-second exit wait to `.scripts/install.ps1`, matching `syncAndInstall.ps1` behavior.
- Kept backup and copy failure handling unchanged; installer now prevents resident-server executable locks before replacement.
- Verification: installer PowerShell parsing passed; focused `git diff --check` passed.

### User
Windows installation
- Installing a new OpenCode build now stops running OpenCode processes first, so the replacement is not blocked by the resident server.

## 2026-09-10 (~17:11) - add Windows auto-start setting - GPT-5.6 Luna, Thinking; Build

### Agent
- Meta: Added TUI controls for the wrapper-owned Windows resident-server startup preference.
- Extended the OC config bridge to read and persist nested `server.startOnWindowsUserStart` as a boolean without changing unrelated settings.
- Added `Set Windows auto start` to the filtered OC command palette with current-state selection and immediate wrapper reconciliation.
- Verification: TUI typecheck passed; focused `packages/tui/test/config.test.tsx` passed 13 tests; wrapper PowerShell parse passed.
- Remaining: rebuild and reinstall the custom executable before the new palette item is available in the installed TUI.

### User
Windows startup
- The OC settings palette now includes an on/off choice for starting the resident server at Windows sign-in.

---

## 2026-09-10 (~current) - clarify OC command palette labels - GPT-5.6 Luna, Thinking; Build

### Agent
- Meta: Renamed OC palette commands for shorter, clearer settings labels while preserving command names and behavior.
- Changed `packages/tui/src/app.tsx` palette and dialog titles for sessions, defaults, server startup, home directory, sort order, and intro script.
- Changed `packages/tui/src/config/keybind.ts` descriptions to match the visible palette labels; kept `Set default sub-agent` unchanged per user direction.
- Verification: Source text inspection completed; build and tests not run because the request is wording-only and project rules require explicit execution.

### User
Command palette
- OC commands now use shorter labels such as `New session (oc)`, `Default model`, `Home directory`, and `Intro script`.
- The server setting now says `Background server auto-start (Windows only)`.
- The home-directory setting now clearly says `Home directory sort order`.

---

## 2026-09-10 (~current) - rename default sub-agent command - GPT-5.6 Luna, Thinking; Build

### Agent
- Meta: Clarified the default delegated-agent command label without changing behavior.
- Changed `packages/tui/src/app.tsx` palette and dialog titles plus `packages/tui/src/config/keybind.ts` shortcut description to `Default sub-agent mode`.
- Verification: Source text inspection completed; build and tests not run because the request is wording-only and project rules require explicit execution.

### User
Command palette
- The default sub-agent setting is now labeled `Default sub-agent mode`.

---

## 2026-09-10 (~current) - order sub-agent settings - GPT-5.6 Luna, Thinking; Build

### Agent
- Meta: Ordered related default sub-agent settings for clearer command-palette navigation.
- Moved `Default sub-agent model` before `Default sub-agent mode` in `packages/tui/src/app.tsx`; command behavior and shortcuts remain unchanged.
- Verification: Source order inspection completed; build and tests not run because the request is ordering-only and project rules require explicit execution.

### User
Command palette
- The default sub-agent model setting now appears before the default sub-agent mode setting.

---

## 2026-09-10 (~current) - move server startup command to bottom - GPT-5.6 Luna, Thinking; Build

### Agent
- Meta: Kept OC settings grouped while placing the background server startup command last.
- Moved `Background server auto-start (Windows only)` after `Intro script` in `packages/tui/src/app.tsx`; behavior and shortcut remain unchanged.
- Verification: Source order inspection completed; build and tests not run because the request is ordering-only and project rules require explicit execution.

### User
Command palette
- The background server auto-start setting now appears at the bottom of the OC command list.

---

## 2026-09-10 (~18:51) - remove standalone oc dependency - GPT-5.6 Luna, Thinking; Build

### Agent
- Meta: Made the folded OC implementation depend only on native OpenCode configuration and source code.
- Removed legacy `oc.config.json` migration and installer `OPENCODE_OC_CONFIG` overrides; native config remains `~/.config/opencode/oc.json`.
- Added native `packages/opencode/src/cli/intro.ts` loading animation with logo reveal, interior sweep, border trail, and cleanup before TUI attach.
- Started and stopped the animation around native `oc launch` and `oc previous`; removed the stale external intro-script setting and keybind.
- Added regression coverage proving a legacy config path is ignored; `bun test test/config/oc.test.ts`, OpenCode and TUI typechecks, formatting, and `git diff --check` passed.

### User
Startup and settings
- OC now reads and writes its native OpenCode settings directly without relying on the separate standalone wrapper configuration.
- Startup shows the folded-in OC loading animation while the server and session are prepared.

---

## 2026-09-10 (~current) - simplify startup animation - GPT-5.6 Luna, Thinking; Debug

### Agent
- Meta: Reduced native OC startup animation to the requested stable column sweep.
- Removed perimeter snake, wave highlight, trail timing, and related animation state from `packages/opencode/src/cli/intro.ts` because cursor rendering was unstable.
- Kept frame, interior, and logo painting together in one complete vertical column per tick; cleanup still runs before TUI attach.
- Verification: OpenCode typecheck passed, focused OC config tests passed 2 cases, and `git diff --check` passed with only existing line-ending warnings.

### User
Startup animation
- The loading animation now paints the full design one vertical column at a time.
- The outside moving snake and extra effects are temporarily removed for reliable startup rendering.

---

## 2026-09-10 (~current) - speed up startup animation - GPT-5.6 Luna, Thinking; Build

### Agent
- Meta: Tuned native OC column sweep for faster startup.
- Changed `packages/opencode/src/cli/intro.ts` interval from 40 ms to 30 ms; kept rendering and cleanup unchanged.
- Verification: Source timing inspection completed.

### User
Startup animation
- The loading animation now paints each column a little faster to match the quicker startup.

---

## 2026-09-10 (~current) - align startup frame edges - GPT-5.6 Luna, Thinking; Debug

### Agent
- Meta: Kept the user-selected 15 ms sweep rate unchanged while correcting frame edge alignment.
- Replaced row-dependent border glyphs in `packages/opencode/src/cli/intro.ts` with fixed top, bottom, left, and right edge glyphs so the frame stays one cell wide.
- Verification: OpenCode typecheck passed and `git diff --check` passed with only existing line-ending warnings.

### User
Startup animation
- The frame edge now paints as a continuous straight line instead of shifting by a cell on alternating rows.

---

## 2026-09-10 (~current) - restore original frame rendering - GPT-5.6 Luna, Thinking; Debug

### Agent
- Meta: Reverted the unsuccessful frame-edge adjustment without changing the user-selected 15 ms tick rate.
- Restored the prior row-based glyph selection in `packages/opencode/src/cli/intro.ts`.
- Verification: Source comparison and timing inspection completed.

### User
Startup animation
- Restored the previous frame rendering exactly.

---

## 2026-09-10 (~current) - update moved checkout paths

### Agent
- Updated active repository guidance, OpenCode plans, and proxy notes to the current `C:\Users\user\Documents\GitHub\oc` checkout.
- Kept archived build notes and PowerShell transcripts unchanged as historical records.
- Verification: old-path search is clean in active files; relative-path scripts required no code changes.

### User
Repository location
- Active OpenCode guidance now points to the checkout under `Documents\GitHub\oc`.

---

## 2026-09-10 (~current) - make Cursor a native optional provider

### Agent
- Imported the Cursor 0.6.2 provider/protocol source into `packages/opencode/src/provider/cursor` and kept V2 and archive checkout code out of the runtime path.
- Added the native provider adapter, built-in plugin, lazy Node HTTP/2 proxy, config migration, Windows tool/version fixes, and compiled-runtime packaging.
- Added focused Cursor provider coverage and preserved the upstream license/disclaimer notices.
- Verification: Cursor/provider tests 6 pass; OpenCode typecheck passed; Windows single-target build passed; source and packaged proxy health checks passed; `node --check` and `git diff --check` passed.
- Remaining: live Cursor authentication/request coverage was not run; unrelated config tests observe user-level instruction pollution in the test environment.

## 2026-09-10 (~current) - validate Cursor proxy startup coalescing

### Agent
- Fixed the native supervisor's unavailable-health probe and ensured failed startup cleans up its child process.
- Verification: concurrent supervisor startup passed; provider tests 6 pass; OpenCode typecheck passed; packaged runtime syntax and `git diff --check` passed.

## 2026-09-10 (~current) - confirm installed Cursor integration

### User
- Installed the rebuilt Windows executable and confirmed the native Cursor path appears to be working.

## 2026-09-10 (~current) - complete Cursor lifecycle verification

### Agent
- Added Cursor proxy cleanup to managed `serve` shutdown and a built-in Node runtime forwarding test.
- Verification: Cursor tests 3 pass; runtime test 1 pass; provider tests 102 pass; config tests 2 pass; OpenCode typecheck passed; Windows single-target build passed; packaged runtime and proxy health checks passed; `git diff --check` passed.
- Remaining: live Cursor authentication/request coverage was not run.

---

## 2026-09-10 (~current) - fold openSidebar into native TUI

### Agent
- Ported openSidebar helpers, usage probes, script execution, configuration persistence, sidebar controls, files, and footer into native TUI source.
- Replaced the overlapping native Files/Footer builtins, retained Context/MCP/LSP/Todo, removed the standalone plugin registration, and preserved the standalone repository.
- Fixed native regressions found during review: usage polling frequency, plugin footer compatibility, section ordering, prompt-part reset, picker cleanup, portable WezTerm resolution, changed-file actions/counts, and getting-started onboarding.
- Verification: TUI and OpenCode typechecks passed; focused TUI tests 75 pass and 2 skip; Windows single-target build passed with `--skip-install`; `git diff --check` passed.
- Remaining: one unrelated Windows `runtime.test.tsx` path-separator assertion expects `/` but receives `\\`; no live UI smoke test was run.

### Follow-up
- Final review correction preserved prompt parts during append, placed retained plugin content between native usage and scripts/files, added dialog-dismiss cleanup for picker resources, and kept the replacement footer aligned with openSidebar's path/version behavior.
- Verification: final TUI/OpenCode typechecks passed; focused TUI tests 75 pass and 2 skip; final Windows single-target build passed with `--skip-install`.

## 2026-09-10 (~current) - add agent message timestamps

### Agent
- Added local short-time timestamps to agent turn summaries, preserving persisted assistant creation times during replay and live turn start times during execution.
- Verification: focused scrollback tests 16 pass and 1 skip; OpenCode typecheck passed; `git diff --check` passed.

### Verification correction
- Final focused replay and scrollback tests: 30 pass and 1 skip; OpenCode typecheck passed; `git diff --check` passed.

## 2026-09-11 (~current) - add timestamps to active native TUI summaries

### Agent
- Root cause: the installed `oc` session view renders assistant summaries in `packages/tui/src/routes/session/index.tsx`, not the separate run-mode scrollback renderer.
- Added the existing local date/time format after assistant duration when timestamps are enabled, matching the user-message timestamp setting.
- Verification: TUI typecheck passed; `git diff --check` passed.
- Remaining: rebuild and reinstall the executable after this active-path fix.

## 2026-09-11 (~current) - include dates in agent timestamps

### Agent
- Changed active assistant timestamps to always use short numeric date plus local short time, such as `9/11/26 12:09 PM`.
- Verification: TUI typecheck and `test/index.test.tsx` passed; `git diff --check` passed.
- Remaining: rebuild and reinstall the executable after this formatting change.

## 2026-09-11 (~current) - place agent timestamp before duration

### Agent
- Moved the assistant timestamp before the response duration in the active native TUI summary.
- Verification: source order inspected; TUI typecheck and `test/index.test.tsx` passed; `git diff --check` passed.
- Remaining: rebuild and reinstall the executable after this ordering change.

## 2026-09-11 (~current) - use completion time for finished assistant timestamps

### Agent
- Changed the native TUI assistant summary to display `time.created` while running and switch to `time.completed` after completion, without changing the separate `--mini` renderer.
- Verification: TUI `bun typecheck`, `bun test test/index.test.tsx`, and `git diff --check` passed.
- Remaining: interactive UI smoke test and executable rebuild/reinstall were not run.

## 2026-09-11 (~current) - fix native openSidebar WezTerm runner

### Agent
- Confirmed Windows `WEZTERM_EXECUTABLE` resolved to `wezterm-gui.exe`, which rejects the `cli` subcommand; map that executable to its sibling `wezterm.exe` before launching WezTerm CLI commands.
- Added focused coverage for the Windows executable mapping.
- Verification: before/after probe showed exit code 2 with `wezterm-gui.exe` and exit code 0 with pane ID 11 from `wezterm.exe`; TUI typecheck passed; focused sidebar tests 60 pass and 2 skip; marker search clean; `git diff --check` passed.
- Remaining: fixed executable was built but not installed into `C:\Users\user\Apps\opencode`; user confirmed the rebuilt executable opened a WezTerm pane successfully.

## 2026-09-11 (~current) - make SuperPlan+ dispatch background sub-agents

### Agent
- Added an explicit Cursor-compatible parallel delegation protocol to the SPA command and SuperPlan+ agent instructions: emit independent `task` calls in the same assistant turn with `background: true`, limit fan-out to two or three missions, and record/read every result.
- Fixed the malformed `CC:\` path prefix in `spa.md`.
- Verification: `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true`; instruction files re-read; `git diff --check` passed for the project notes.
- Remaining: quit and restart OpenCode so the changed command and agent definitions load.

## 2026-09-11 (~current) - hide Windows shell cancellation helper

### Agent
- Replaced the Windows `exec("taskkill ...")` cleanup call in `packages/core/src/cross-spawn-spawner.ts` with direct hidden `taskkill` spawning, avoiding the extra `cmd.exe` shell that caused a brief console flash during Escape cancellation.
- Verification: core cross-spawn tests 24 pass; core and OpenCode typechecks passed; Windows single-target build passed with `--skip-install` and version `0.0.0-main-202609110718`; `git diff --check` passed.
- Remaining: installed executable was not replaced because active installed OpenCode processes are still running; manual Escape-cancellation UI verification remains pending.

## 2026-09-11 (~current) - avoid nested Windows shell for V2 Bash

### Agent
- Changed `packages/core/src/tool/bash.ts` to invoke the configured Windows shell executable directly with `Shell.args(...)` instead of passing the command through Effect's nested `shell` option.
- Added regression coverage in `packages/core/test/tool-bash.test.ts` and removed the completed Windows invocation TODO.
- Verification: core Bash/shell tests 22 pass; cross-spawn tests 24 pass; core and OpenCode typechecks passed; Windows single-target build passed with `--skip-install` and version `0.0.0-main-202609110759`; `git diff --check` passed.
- Remaining: rebuilt executable is not installed because active installed OpenCode processes remain running; manual background-subagent console-flash verification remains pending.

## 2026-09-11 (~current) - verify configured Windows shell resolution

### Agent
- Finalized V2 Bash shell selection through `Shell.preferred(configuredShell)` before direct Windows invocation, preserving configured shell paths while avoiding nested shell creation.
- Verification: final scoped code review found no medium or high issues; core Bash/shell tests 21 pass; cross-spawn tests 24 pass; core and OpenCode typechecks passed; Windows single-target build passed with `--skip-install` and version `0.0.0-main-202609110803`; `git diff --check` passed.
- Remaining: installed executable is unchanged because active installed OpenCode processes remain running; manual background-subagent console-flash verification remains pending.

## 2026-09-12 (~current) - add tab_order for TUI agent cycle

### Agent
- Added optional `tab_order` to the agent config schema (`packages/core/src/v1/config/agent.ts`, plus `KNOWN_KEYS` so it is not shunted into `options`) and to the V2 compat `Agent` struct and `lowerAgent` in `packages/opencode/src/config/v2-compat.ts`.
- Added `tabOrder` to `Agent.Info` in `packages/opencode/src/agent/agent.ts`, copied from config in the merge loop, and inserted as the second sort key in `Agent.list()`: default agent first, then `tab_order` ascending, then name. Agents without `tab_order` keep their previous alphabetical position after ordered ones. Works from `.md` frontmatter and `opencode.jsonc` alike.
- Verification: temporary out-of-repo bun test confirmed order `build -> zz-first(1) -> aa-second(2) -> mm-unordered -> plan`; `tsc --noEmit` shows only pre-existing errors in `packages/tui/src/component/dialog-move-session.tsx`; `test/agent/agent.test.ts` + `test/config/v2-compat.test.ts` show the same 15 pre-existing failures with and without this change (global user config leaking into test instances); Windows single-target build passed with `--skip-install` and version `0.0.0-main-202609120620`; `git diff --check` passed.
- Remaining: install the rebuilt executable (blocked while the installed OpenCode is running). User config already sets `tab_order` 1-4 on `superPlan++`, `superPlan-a`, `Go`, `Go-a` and 5-6 on `Debug`, `DebugAgent+`.

## 2026-09-12 (~current) - {file:} prompt includes for markdown agents

### Agent
- `packages/opencode/src/config/agent.ts` `load()`: a markdown agent's frontmatter `prompt` is now honored. `{file:path}` tokens in it resolve relative to the `.md` file (or `~/`, or absolute), content is inserted raw (not JSON-escaped like `ConfigVariable.substitute`), and the markdown body is appended after it. Missing files raise `InvalidError` naming the agent file. Agents without a frontmatter `prompt` behave exactly as before.
- Purpose: tabbable primary agents can live as `.md` files in `~/.config/opencode/agent/` while sharing one prompt body from `prompts/`. Migrated `superPlan++`, `superPlan-a`, `Go`, `Go-a` from `opencode.jsonc` entries to `agent/*.md` using `prompt: "{file:../prompts/sp-core.md}"` / `go-core.md`; removed the JSON entries.
- Verification: temporary out-of-repo test against the real config dir confirmed all four load, share identical prompts (15492 / 4406 chars), contain no `{file:` token, keep `tab_order` and differing `task` permissions; `sp-scout` unchanged. `tsc --noEmit` only reports pre-existing `dialog-move-session.tsx` errors. `test/config/agent-color.test.ts` + `config.test.ts`: 109 pass / 3 fail, identical with the change stashed (pre-existing). Windows single-target build passed with `--skip-install`, version `0.0.0-main-202609120639`; `git diff --check` passed.
- Remaining: install the rebuilt executable (blocked while installed OpenCode is running). Until installed, the four `.md` primaries load with an empty-ish prompt (frontmatter `prompt` is overwritten by the empty body in the old binary), so install before using them.

## 2026-09-12 (~current) - display_name for TUI agent labels

### Agent
- Added optional `display_name` (string) to the agent config schema (`packages/core/src/v1/config/agent.ts` + `KNOWN_KEYS`), to the V2 compat `Agent` struct and `lowerAgent` (`packages/opencode/src/config/v2-compat.ts`), and as `displayName` on `Agent.Info` with a merge-loop copy (`packages/opencode/src/agent/agent.ts`).
- Regenerated the JS SDK (`bun ./script/build.ts` in `packages/sdk/js`) so `packages/sdk/js/src/v2/gen/types.gen.ts` `Agent` now carries `tabOrder` and `displayName` (4 added lines).
- TUI: new `local.agent.label(name)` in `packages/tui/src/context/local.tsx` returns `displayName` when set, otherwise `Locale.titlecase(name)` as before. Used by the prompt footer (`component/prompt/index.tsx`) and assistant message headers (`routes/session/index.tsx`), so `superPlan-a` no longer renders as `SuperPlan-A`.
- Verification: TUI and OpenCode typechecks show only pre-existing errors (`dialog-move-session.tsx`, `sync.tsx` bootstrap lines 533/535, test fetch typings); Windows single-target build passed with `--skip-install` and version `0.0.0-main-202609120656`; `git diff --check` reports only pre-existing EOF blank lines.
- Remaining: install the rebuilt executable (blocked while installed OpenCode is running). User config sets `display_name` on `superPlan++`, `superPlan-a`, `Go`, `Go-a`.

## 2026-09-12 (~current) - enforce SuperPlan planning-only boundary

### Agent

- Root cause: active `superPlan-a` and `superPlan++` profiles granted `edit: allow` and `bash: allow`, while inherited defaults granted unknown tools through `* allow`; the prompt's no-execution rule was not a runtime restriction.
- Changed both profiles to deny unknown actions, allow edits only below `~/.config/opencode/plans/`, allow only read/search/git inspection shell commands, and retain approved read-only sub-agent delegation. Updated `sp-core.md` to make Stage 2 questioning mandatory before plan creation.
- Verification: loaded permission matrix passed for both profiles; `bun test test/permission/next.test.ts` passed 79 tests; `bun test test/config/markdown.test.ts` passed 37 tests; `git diff --check` passed for the notes file.
- Remaining: restart OpenCode so the active agent definitions and shared prompt reload.

## 2026-09-12 (~current) - clarify SuperPlan search tools

### Agent

- Updated `sp-core.md` to direct SuperPlan to use `rg` for shell content searches and the Everything Search MCP for external or unknown filename/path lookups.
- Verification: source inspection completed; existing SuperPlan permission and markdown tests remain passing from the preceding change.

## 2026-09-12 (~current) - archive completed planning plans

### Agent
- Updated the shared SuperPlan and SuperGo prompts so successful agent-created plans move to `C:\Users\user\.config\opencode\plans\archive\` without overwriting an existing archive; failed or blocked plans remain in place.
- Kept all existing root plans unchanged.
- Verification: prompt and agent-reference inspection passed; `git diff --check` reported only pre-existing EOF blank-line warnings in unrelated worktree files.
- Remaining: quit and restart OpenCode so the updated prompts load; no live restart was performed from this active session.

## 2026-09-12 (~current) - preserve selected model across agent changes

### Agent
- Added opt-in `ignoreAgentModels` to native `oc.json` configuration and the OC settings palette; it defaults off so existing per-agent model behavior is unchanged.
- When enabled, the TUI snapshots the active model, ignores configured agent models, and keeps one shared selection through Tab, Shift+Tab, agent-picker changes, session restoration, and model cycling.
- Verification: focused OC config tests passed 4 cases; focused TUI model tests passed 9 cases; scoped `git diff --check` passed.
- ERROR: OpenCode and TUI typechecks remain blocked by pre-existing `packages/tui/src/context/sync.tsx` promise-type errors; TUI typecheck also reports pre-existing fetch typing errors in `sync.test.tsx` and `sdk.test.tsx`. Full-repo `git diff --check` remains blocked by pre-existing trailing blank lines in `route.tsx` and `app-lifecycle.test.tsx`. Manual TUI verification and rebuild/install were not run.

## 2026-09-13 - fix OC config command parsing

### Agent
- Root cause: Yargs registered `config set` and `config get` as conflicting flat commands, so `oc config set ...` resolved to the `get` handler and printed help.
- Nested `set` and `get` under one `config` command in `packages/opencode/src/cli/cmd/oc.ts`; added `packages/opencode/test/cli/oc.test.ts` covering all OC palette setting keys and round-trip persistence.
- Verification: `bun test test/cli/oc.test.ts` passed; `bun test test/config/oc.test.ts` passed; Windows build/install completed with version `0.0.0-main-202609130744`; installed `oc config set` and `oc config get` verification passed.
- ERROR: `bun typecheck` from `packages/opencode` remains blocked by pre-existing `packages/tui/src/context/sync.tsx` errors at lines 533 and 535. Interactive command-palette smoke was not run.

### Closeout
- Confirmed the previous `sync.tsx` typecheck errors were stale; `bun typecheck` now passes from `packages/tui` without an additional source change.
- Plan archive is permitted after this successful verification.

## 2026-09-13 - persist explicit session model selection

### Agent
- Replaced the uncommitted global `ignoreAgentModels` option with a `model.json` session-ID override map. Explicit model-picker and recent/favorite-cycle choices persist the model plus variant per session, while ordinary CLI and history restoration remain non-explicit.
- Session overrides take precedence over agent model defaults, are pruned on session deletion, are mirrored through the existing V2 `session.switchModel` API, and are not created for pre-existing sessions until a new explicit choice. Variant changes update an existing override without creating one on their own.
- Verification: `bun test test/context/local.test.ts` passed 9 tests; `bun test --timeout 30000 test/config/oc.test.ts` passed 2 tests; scoped `git diff --check` passed. TUI and OpenCode typechecks remain blocked only by pre-existing `packages/tui/src/context/sync.tsx` promise-type errors; TUI also reports pre-existing fetch typing errors in `sync.test.tsx` and `sdk.test.tsx`.
- Remaining: live TUI verification with distinct agent defaults is still required before the plan can be archived.

### User confirmation
- User reports the session model persistence behavior appears to work in manual use, including the requested agent cycling and session restoration flow.
- Plan archive remains blocked by the failed package typechecks documented above.

## 2026-09-13 - clear model-selection typecheck blockers

### Agent
- Fixed the shared restart-bootstrap promise type, widened the TUI fetch test fixture to allow intentionally unhandled responses, and typed the custom SDK test fetches with Bun's required `preconnect` member.
- Corrected session model selection so failed server switches do not update local selections, pending new-session selections refresh their variant at attach time, and history/session restoration clears stale pending selections.
- Verification: TUI and OpenCode `bun typecheck` passed; focused TUI tests passed 20 tests; OpenCode config tests passed 2 tests; scoped `git diff --check` passed. Restart tests intentionally log simulated 500 responses while passing.

## 2026-09-13 - adaptive custom-sidebar usage refresh

### Agent
- Replaced the custom sidebar's fixed five-minute usage interval with a coalescing scheduler that refreshes all displayed provider quotas after the active session becomes idle and retains a five-minute fallback.
- Added focused scheduler coverage for initial refreshes, coalesced requests, fallback refreshes, disposal, and active-session idle filtering.
- Verification: `bun test test/feature-plugins/open-sidebar.test.ts` passed 62 tests with 2 skips; Prettier check passed; scoped `git diff --check` passed.
- ERROR: `bun typecheck` remains blocked by pre-existing errors in `packages/tui/src/context/sync.tsx`, `test/cli/cmd/tui/sync.test.tsx`, and `test/context/sdk.test.tsx`. Manual TUI verification was not run. The approved plan remains unarchived.

### Completion correction
- The installed sidebar was manually checked by the user and appeared correct; no visible regression was reported.
- Rerun verification: `bun test test/feature-plugins/open-sidebar.test.ts` passed 62 tests with 2 skips, `bun typecheck` passed, and scoped `git diff --check` passed.
- The earlier typecheck failure was transient and did not reproduce; the plan is now eligible for archival.
