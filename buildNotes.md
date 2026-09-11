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
