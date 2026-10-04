# Hard revive plan

Status 2026-10-04: Phases 1-3 implemented, awaiting live check. Soft revive not started.
Changes from the plan below:
- `.old-*` cleanup runs in worker 2 after the new terminal opens, not on next startup.
- The hidden helper (no launcher) still reopens a terminal on the old version when a step after
  shutdown fails.
- `revive.installPath` was removed in one pass with Phases 1-3.
- `/revive` is always shown. First run with no `revive.build` picks: existing source folder, download
  the public repo once to a chosen folder (default `Global.Path.data/source`; user's copy to edit,
  never pulled again), or just restart (`revive.build: false`).
- `revive.build` is `{ source, debug }`, not `cwd`/`command`/`output`. oc runs `bun install` and
  `build.ts --single` itself (no pwsh scripts); `debug: true` adds `--with-debug` and `ocdebug.exe`.
- WezTerm reopens through `wezterm-gui` so no console window appears.

Goal: `/revive` (install) and `/revive-no-install` restart oc **and the terminal window**. The TUI
closes, the same window shows verbose progress, then a fresh terminal process opens running `oc` or
`occ` (configurable) and the old window closes. A fresh terminal process picks up edited terminal
config (WezTerm bindings etc.). Install is an app feature driven by `oc.json`. It does not depend on
`.scripts\install.ps1`.

Decisions (user, 2026-10-04):
- Two workers. Worker 1 "shutter downer": TUI shutdown, verbose output stage, hand off to worker 2.
  Worker 2 "terminal restarter": kills the window that owned oc, then starts `oc` or `occ` (config,
  default `occ`).
- Build failure: show error, wait for key press, reopen the old TUI in the same window. Server never
  stopped, window not restarted.
- Source build only. No release download.
- Build runs before shutdown. Only the binary swap needs oc stopped.
- Soft revive (same window, no terminal restart) is optional, after the hard one. See the end.

## Current flow (verified)

- `oc` / `occ` -> `withExecutableDefault` (`packages/opencode/src/cli/command-loader.ts:72`) maps to
  `oc launch` / `oc previous --depth 1`.
- Both end in `attach()` (`packages/opencode/src/cli/cmd/oc.ts:38`, callers :134, :176), which calls
  `runNative` (:14): spawns the TUI child with `stdio: "inherit"`, waits, throws on non-zero exit.
  This parent owns the console for the TUI's whole life.
- `/revive-no-install` (`packages/tui/src/app.tsx:386`): `mark()` (synthetic revive divider, saved
  while the server runs), then `launchDetached(execPath, ["oc", "--revive", <base64url ReviveContext>])`.
  `revive.path` override wins when set.
- `/revive` (`app.tsx:409`): `mark()`, `launchDetached(config.reviveInstallPath)`. Hidden when unset.
- `oc --revive` (`oc.ts:259`) -> `OcConfig.revive` (`packages/opencode/src/config/oc.ts:446`):
  `shutdownAll()` -> `startServer()` -> `Revive.reopenCommand` opens a new terminal
  (`wezterm start --always-new-process`, `wt.exe -w new`, or `cmd start`) running
  `oc --revive <reopen context>`, which attaches to the exact session.
- `shutdownAll` (`oc.ts:422`): `wezterm cli kill-pane` for ledgered panes, force-kills this instance's
  ledgered TUIs **and their same-exe parent** (`TuiLedger.select`,
  `packages/opencode/src/config/tuiLedger.ts:58`), then graceful `stopServer`.
- `launchDetached` (`packages/core/src/util/launch-detached.ts`): Start-Process hop puts the target
  outside the closing terminal's job. This is how worker 2 survives the window it kills.
- TUI ledger written in `app.tsx:557` (pid, instance, executable, WezTerm `paneID`), removed on exit.
- TUI exit: `useExit()` (`packages/tui/src/context/exit.tsx`).

Constraints:
- Worker 1 is the parent of its ledgered TUI. `shutdownAll` must run only after this TUI has exited
  and removed its ledger record, or `select` kills worker 1.
- Worker 2 must not be a descendant inside the old window's job/console, or killing the window kills
  it. Use `launchDetached`.

## Workers

Worker 1, shutter downer = the `oc`/`occ` parent process (`attach()` in `oc.ts`).
- `attach()` sets `OC_SUPERVISOR_PID=<pid>` in the TUI env.
- TUI `/revive*`: `mark()`, write handoff `Global.Path.state/oc-revive/<supervisorPid>.json`
  `{ mode, directory, sessionID, terminal, paneID? }`, then `exit()`.
- After `runNative` returns: read and delete the handoff. None -> normal exit. Present -> wait for the
  TUI ledger record to clear, then run the pipeline as a child
  `runNative(["oc", "--revive", <context>])` with inherited stdio. Running it as a child of the
  current exe keeps pipeline code fresh after an install (Windows has no exec).
- Pipeline prints step lines in the window, e.g. `revive: stopping server... done (1.2s)`. Full errors.
- Ignores SIGINT while the pipeline runs.

Pipeline (`OcConfig.revive`, in the worker 1 child):
1. `install` mode only: build (Phase 2). Failure -> exit non-zero; worker 1 prints error, waits for a
   key, reattaches the old TUI. Stop.
2. `shutdownAll()`: other TUIs of this instance + server.
3. `install` mode only: binary swap (Phase 3).
4. `startServer()`.
5. Launch worker 2 with `launchDetached`, wait for it to confirm the new terminal spawned, then exit 0.

Worker 2, terminal restarter = detached `oc --revive-terminal <context>`.
Order is kill first, then open (user decision). Worker 1 resolves everything that can fail before
handing off: terminal CLI present (existing `Bun.which` check in `OcConfig.revive`), launcher exe
resolved, full reopen command built and passed in the context.
1. Kill the old window:
   - WezTerm: `wezterm cli list --format json`, find the window that holds `paneID`, then `kill-pane`
     every pane in that window.
   - Windows Terminal and plain console: kill the shell process that hosts worker 1 (the parent of
     worker 1, recorded in the context). The tab/console closes. WT closes the window when it was the
     last tab (depends on the profile's `closeOnExit`).
2. Start the new terminal through `Revive.reopenCommand`, running the configured launcher.
3. Exit.

Risk: no window is left to show a failure in step 2. Worker 2 writes each step and any error to
`Global.Path.log/revive.log`, and worker 1 prints that path before the handoff.

Launcher config: `revive.launcher: "oc" | "occ"`, default `occ`.
- `occ` -> `oc previous --depth 1`. `mark()` just wrote to the revived session, so it is the most
  recent one and reopens.
- `oc` -> `oc launch` (home screen).
- Resolve the exe beside the running one (`Revive.resolveLauncher`). Debug builds keep `ocdebug`.

Fallback: a TUI without `OC_SUPERVISOR_PID` (plain `opencode`, profile `oc <dir>` path) skips worker
1 output. It launches worker 2 directly through today's detached `oc --revive` flow, plus the
launcher config.

## Phase 1: hard `/revive-no-install`

Outcome: the TUI closes, progress shows in the same window, the server restarts, a fresh terminal
process opens running the configured launcher, and the old window closes.

1. Worker 1: `OC_SUPERVISOR_PID`, handoff file, supervisor branch in `attach()`.
2. TUI: `reviveCommands` (`app.tsx:353`) writes the handoff and exits when supervised. Otherwise the
   fallback.
3. `ReviveContext` gains `mode`, `launcher`, `shellPid?`, `paneID?`. Validate in `decodeContext`.
4. `OcConfig.revive` becomes the pipeline above (no build/swap yet). Ends by launching worker 2.
5. Worker 2 command (`--revive-terminal`) using `reopenCommand` + window kill.
6. `revive.launcher` in `OcConfig.Settings` and `readOcConfig` (`app.tsx:113`).

Checks: `revive.test.ts` for new context fields and `reopenCommand` per launcher.

Live check (user), WezTerm and Windows Terminal, started with `oc` and with `occ`:
- `/revive-no-install` shows progress in the window, a new window opens on the revived session
  (`occ`) or home (`oc`), and the old window closes.
- Change a WezTerm binding before reviving. The new window has it.
- A second oc window of this instance closes. Unrelated terminals and `ocdebug` stay open.
- Plain `opencode` TUI still revives through the fallback.

## Phase 2: configured source build

Outcome: `/revive` builds with output in the window, then continues as Phase 1. Failure follows
decision 3.

1. Config (`OcConfig.Settings.revive`):
   ```jsonc
   "revive": {
     "launcher": "occ",
     "build": {
       "cwd": "C:\\Users\\user\\Documents\\GitHub\\oc",
       "command": ["pwsh", "-NoProfile", "-File", ".scripts\\build.ps1"],
       "output": ["packages\\opencode\\dist\\opencode-windows-x64\\bin"]
     }
   }
   ```
   `command` is an argv array (no shell quoting). `output` entries are paths relative to `cwd` whose
   contents get installed in Phase 3.
2. `/revive` is visible when `revive.build` or `revive.installPath` is set. `installPath` still wins in
   this phase.
3. Build runs first in the pipeline with inherited stdio (live output, colors), exit code checked.
   Then every `output` path must exist, otherwise fail naming the missing path.
4. Failure: worker 1 prints the error, `Press any key to reopen oc`, reads one key in raw mode,
   reattaches. No shutdown, no worker 2.

Checks: config parse test for `revive.build` (bad shapes rejected with a clear error).

Live check (user): a broken build shows the error, waits, and reopens the old oc in the same window.
A good build streams output, then hard-revives.

## Phase 3: binary swap and install

Outcome: `/revive` installs the new build into the running install dir. The new window runs the new
version. `install.ps1` is no longer involved.

1. Install dir = `dirname(OcConfig.executablePath())`.
2. Before shutdown, record alias names: install-dir files with the same identity (`stat` dev+ino)
   as the running exe (today `opencode.exe`, `oc.exe`, `occ.exe`). No hardcoded names.
3. After `shutdownAll`, swap each target from `output`:
   - rename existing -> `<name>.old-<timestamp>` (works on running exes, which worker 1 still is;
     overwrite and delete don't)
   - copy new into place
   - on any failure: remove the partial copy, rename `.old-*` back, report, and skip worker 2.
     Worker 1 waits for a key, then reattaches the old version.
4. Recreate the alias hard links to the new main exe, then verify identity with `stat`.
5. `startServer()` spawns the new exe from the same path. Worker 2 starts the new launcher.
6. Startup cleanup: best-effort delete of `*.old-*` in the install dir.
7. Remove `revive.installPath` and its `app.tsx` branch. Keep the `revive.path` override. Update
   `FORK.md` (Run after turn and revive row) and `SCRIPTS.md`.

Risks:
- Renaming one hard-link name of a running image: verify the other names are then free to replace.
  Live check before building on it.
- Defender can hold a fresh exe briefly. Bounded retry on rename/copy, then fail naming the path.
- `ocdebug.exe`: swap it when listed in `output`. A running `ocdebug` keeps its old image.

Checks: unit tests for alias discovery and rollback on a temp dir (real files, no mocks).

Live check (user): `/revive` from installed oc. The new window shows the bumped sidebar version and
the revived session (`occ`). `oc.exe`/`occ.exe` launch the new build from a fresh shell. `.old-*`
files are gone after the next start.

## Later: soft revive (optional)

Same worker 1 and pipeline, but no worker 2. Worker 1 reattaches the same session in the same window.
For when the terminal itself does not need a restart. Separate command, e.g. `/revive-soft`.
