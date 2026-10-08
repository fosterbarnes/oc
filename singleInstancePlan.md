# Single-instance oc mode - plan

Status: plan only, no source changed. Date: 2026-10-08. Author: Opus 5.5.

## Goal

A single-instance oc window behaves to the user like native OpenCode: one window, one process tree,
same session database (`opencode.db`), no dependency on the resident server (port 4096). It can do
everything a resident-attached session can do. Closing the window safely stops in-flight work and
releases everything it owned.

## Key finding: most of this already exists as `oc stable`

Added 2026-09-28 (`buildNotes.archive4.md:1059`, plan `~\.config\opencode\plans\2026-09-28-oc-stable.md`).

- `oc stable [target] [--portable]` - `StableCommand` in `opencode/src/cli/cmd/oc.ts:204`. Spawns
  `opencode.exe <dir>` with `OC_STABLE=1`, forwards `sessionModel`/`sessionAgent`.
- `opencode/src/index.ts:18-24` - `OC_STABLE=1` skips `withExecutableDefault`/`withOcLaunchDefault`,
  so the child runs native `TuiThreadCommand` (`cli/cmd/tui.ts`): TUI on the main thread, full
  server in a Bun `Worker` (`cli/tui/worker.ts`), HTTP over in-memory RPC fetch. No port, no attach.
- Cross-process session lock: `session/run-state.ts:149-153` `Flock "session:<id>"`, stale 15 s.
  Resident and stable cannot both run the same session.
- TUI: palette Shut Down/Restart hidden and footer shows `stable` (`tui/src/app.tsx:1707,1714`,
  `tui/src/routes/session/footer.tsx:56`).

So the architecture the user described is already the native one. The work is closing gaps,
not building a new runtime. Do not add a second in-process host; reuse `TuiThreadCommand`.

## Gaps (verified in code)

1. Unsafe close. `tui.ts:226-232` `stop()` calls worker `shutdown` (`worker.ts:72`), which only
   runs `InstanceRuntime.disposeAllInstances()`. It skips `ServerShutdown.prepare`
   (`server/shutdown.ts:6`), which the resident server uses: close `SessionWork` admission, await
   cancellation cleanup (30 s cap), then `disposeAllInstancesAndEmitGlobalDisposed()`. The 5 s
   `withTimeout` then `worker.terminate()` can cut a running turn mid-write (partial assistant
   message, tool part stuck "running", orphaned Claude CLI / MCP / PTY children).
2. Window close (X button / console close) on Windows. Only `SIGHUP` is handled
   (`tui/src/app.tsx:698-701` destroys the renderer, which lets `tui.ts` `finally` run). Windows
   gives a console process ~5 s after `CTRL_CLOSE_EVENT` before hard kill. Need to verify Bun maps
   that to `SIGHUP` on Windows; if not, the `finally` never runs.
3. Revive. Stable has no `OC_SUPERVISOR_PID`, so revive takes the detached-helper path, and
   `Revive` relaunch (`config/revive.ts:145`) reopens `oc launch` / `oc previous` = resident mode.
   A stable window revives into a resident window.
4. New oc session (Ctrl+N, `tui/src/app.tsx:1266`) calls `bootstrapOcSession(executable, ...)`.
   Inherited `OC_STABLE=1` makes the new window stable too (noted Risk in archive4:1068). Needs a
   deliberate rule, not an accident.
5. Naming / entry point. Only reachable via `oc stable`; nothing in the profile, `oc config`, or
   docs presents it as a mode. `FORK.md` has no row for it.
6. Lock refusal UX. Running a session owned by the other mode surfaces as a defect via
   `promptAsync` `Cause.pretty` (may include a stack) - archive4:1068.
7. Live view of other writers. A stable window does not receive bus events from the resident
   server (or another stable window) writing the same DB. Viewing a session another process is
   running shows stale content until reopened. Acceptable for v1; document it.

## Plan

### Step 1 - safe shutdown in the worker (core fix, shared path)

- `cli/tui/worker.ts` `rpc.shutdown`: replace `InstanceRuntime.disposeAllInstances()` with
  `AppRuntime.runPromise(ServerShutdown.prepare())`, keep `server.stop(true)` and handler removal.
  This is the same drain the resident server uses, so both modes share one shutdown path.
- Lower the drain cap for the interactive case. `prepare` hardcodes 30 s; the Windows close
  window is ~5 s. Add a `timeout` parameter to `ServerShutdown.prepare` (default 30 s, resident
  callers unchanged) and pass ~3 s from the worker. Cancellation itself (abort fibers, mark parts
  interrupted, kill child processes) is fast; the cap only bounds a stuck tool.
- `cli/cmd/tui.ts` `stop()`: raise `withTimeout` from 5000 to cap + 1 s (~4 s) so the drain is
  not cut by the outer timeout. Keep `worker.terminate()` as the last resort.
- This also fixes native-mode close for every user of `TuiThreadCommand`, not only stable.

### Step 2 - console close on Windows

- Verify first (scratch script, not a test): does Bun 1.4.x on Windows emit `SIGHUP` on console
  close? Run a tiny script that writes a file from a `SIGHUP` handler, close the window, check
  the file. Also check `SIGBREAK`.
- If `SIGHUP` fires: nothing to add beyond Step 1; ensure total shutdown < 5 s.
- If not: add the missing signal in the same `acquireRelease` in `tui/src/app.tsx:698`. Do not
  add an FFI `SetConsoleCtrlHandler` unless no signal arrives (Bun FFI is fragile on Windows, see
  `AGENTS.md` Bun 1.4.0 note).

### Step 3 - make it a first-class mode

- Rename `oc stable` to `oc single` (decided). Update `StableCommand` -> `SingleCommand`,
  the `index.ts:21` `"stable"` shorthand -> `"single"`, footer label `stable` -> `single`, and
  rename env `OC_STABLE` -> `OC_SINGLE` across `index.ts`, `oc.ts`, `tui/src/app.tsx`,
  `footer.tsx` (grep `OC_STABLE` for all hits). No alias for `stable`.
- Add `oc config set mode single|resident` (new key in `config/oc.ts` `keys`, default
  `resident`; opt-in, decided). When `single`,
  `oc launch` / `oc previous` / bare `oc` route to the single path instead of `startServer()` +
  `attach`. `LaunchCommand` keeps `bootstrapSession` semantics: in single mode run
  `session bootstrap` via the child (it already exists as a CLI command) or pass the target dir and
  let the TUI create the session, whichever is simpler after reading `session bootstrap`.
- `oc previous` in single mode: `runNative(["session","previous",...])` then spawn single with
  `--session <id>` (`TuiThreadCommand` already supports `--session`).

### Step 4 - revive and new-session follow the mode

- `config/revive.ts:145`: pick `single` args when the reviving window has `OC_SINGLE=1` (add
  `single: boolean` to the revive context; `app.tsx:472` builds it).
- Give single windows a supervisor so revive is hosted in-window like resident:
  `SingleCommand` already runs through `runNative`; pass `OC_SUPERVISOR_PID` and reuse the
  `takeHandoff` loop from `attach()` (`oc.ts:38-66`). Extract the handoff tail of `attach()` into
  one helper used by both - that is a real reuse, not speculative.
- Ctrl+N: follow the configured mode (Step 3) rather than inherited env. Read `mode` from oc
  config in `bootstrapOcSession` caller.

### Step 5 - lock refusal UX

- In `session/run-state.ts` `owned()`, fail with a typed `Schema.TaggedErrorClass`
  (`SessionBusyElsewhere`) instead of a defect; surface as a toast "Session is running in another
  oc window". Find where `promptAsync` maps errors and add the case there.

### Step 6 - docs

- `FORK.md`: add a row "Single-instance mode" with status and the gap-7 limitation.
- `README.md` only if it documents launch modes today (check; do not add filler).
- Profile function (e.g. `ocs`) only with user approval - user-owned file.

## Tests (smallest relevant)

- Fake-model scenario (`test/provider/claude-code/fake-model.test.ts` pattern, `chat-fixture.ts`
  isolation): start a single TUI-equivalent worker, begin a long turn against `TestLLMServer`,
  call `shutdown`, assert: session work closed within cap, assistant message finalized (no part
  left `running`), Claude CLI child gone, `Flock session:<id>` released (re-acquire succeeds).
- Unit: `ServerShutdown.prepare` timeout parameter honored.
- Unit: launch routing by `mode` (pure function, like `withOcLaunchDefault` tests).
- Pane check (`OC_TUI_PANE=1`, `tui-pane.test.ts`) optional: footer `single` label + palette
  hides server controls. Never spawn without overriding `OPENCODE_DB`.

## User live checks (after user builds/installs)

1. `oc single <proj>`: send a long prompt, close the window with X mid-stream. Reopen with
   resident `oc`: the session shows the turn as interrupted, not stuck busy; Task Manager shows no
   leftover `claude`/MCP processes from that window.
2. Same, but quit with Ctrl+C / `/exit`.
3. Resident server stopped (`oc --kill-server`): single still works end to end (prompt, tools,
   MCP, subagents, revive).
4. Open the same session in resident and single; prompt in both: second gets the friendly
   "running in another window" toast.
5. `/revive` from single reopens single.

## Risks

- Plugins/MCP start a full copy per single window (memory, duplicate MCP servers). Inherent to
  single-instance; document.
- Two writers on one SQLite DB: already the case today with single + resident; WAL + Flock cover
  turn-level conflicts. Do not add more locking unless a live check shows corruption.
- Drain cap too short for slow tool cleanup -> falls back to terminate (same as today, no worse).

## Out of scope

- Live cross-process event sync (gap 7). Would need DB polling or a shared bus; revisit only if
  the user needs to watch one session from two windows.
- Removing the resident server.

## Decisions (user, 2026-10-08)

1. Command is `oc single`; `oc stable` is renamed, no alias.
2. Single mode is opt-in via `oc config set mode single`; bare `oc` stays resident by default.
3. Ctrl+N follows the configured mode, not the current window.
