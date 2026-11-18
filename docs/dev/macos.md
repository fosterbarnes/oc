# macOS support (dev notes)

oc runs on Windows and macOS (Apple Silicon) from one source tree. Platform differences live in shared
helpers with a `win32` and a `darwin` branch; callers stay platform-neutral.

## Dev loop (Windows PC + Mac)

- Mac: `ssh mac` (alias in `~/.ssh/config`, key `~/.ssh/id_ed25519`; any shell; `ssh` skill). The Mac
  reaches this PC as `ssh goon`. Non-interactive ssh reads only
  `~/.zshenv`, whose non-interactive block puts `~/.bun/bin`, `~/.local/bin`, Homebrew, and `/usr/local/bin`
  (pwsh) on PATH. WezTerm starts pwsh directly (launchd's bare PATH, no zsh files), so the Mac pwsh
  profile (`~/.config/powershell/Microsoft.PowerShell_profile.ps1`) prepends the same folders. Build
  toolchain: Bun 1.4.2 (`src/package.json` pin), pwsh 7, git, tar.
- Windows and the Mac are both full dev machines: each has its own git clone of GitHub `origin`
  (Mac: `~/Documents/GitHub/oc`) with its own `node_modules`. Changes move between them through
  git (commit, push, pull) or `/mirror` (git bundle over ssh into the other machine's revive source,
  uncommitted work included; `FORK.md`); `/update` resets a machine's revive source to `origin/main` and rebuilds.
  The old rsync mirror from `/Volumes/C` is retired, and goonstation has no file shares since
  2026-11-12: read or copy its files over SSH (`ssh goon`, `scp`). Never `bun install` or build on the
  PC from the Mac (`node_modules` holds per-OS native packages).
- Build and install on the Mac: `pwsh -NoProfile -File ./.scripts/build.ps1`, then
  `pwsh -NoProfile -File ./.scripts/install.ps1 -NoBuild` (installs to `~/.local/bin`).
- macOS has no `timeout`; long ssh runs go in the background tool instead. A probe that leaves child
  processes holding the ssh session's stderr keeps the session open: kill them (`pkill -x sleep`).

## Platform layer

- Process identity: `core/src/util/processTree.ts` (`identitySupported`, `snapshot`, `processIdentity`,
  `stopTree`) with `processDarwin.ts` (libproc via `bun:ffi`: `proc_listallpids`, `proc_pidinfo`
  PROC_PIDTBSDINFO, `proc_pidpath`; ~3 ms for ~400 processes). `ps` `comm` is argv[0] (`zsh`), not a path,
  so it cannot be used for identity. `created` is a FILETIME tick string on both OSes. Other users'
  processes are not readable without root, so they do not appear on macOS.
- Port owner: `lsof -nP -iTCP:<port> -sTCP:LISTEN -Fpn` (`parseLsofListeners` in `resident.ts`).
- Terminals: `core/src/util/terminal.ts` kind `terminal-app` (`TERM_PROGRAM=Apple_Terminal`);
  `terminalAppScript` builds `osascript` args for a new Terminal.app window (the command line is typed into
  the new shell: no secrets; `sessionTab.ts` passes attach credentials through a self-deleting script).
- Revive in WezTerm: a GUI spawned by the detached restarter opens behind the active app, so `reopenCommand`
  uses `open -n -b com.github.wez.wezterm` (LaunchServices activates it; the caller's env is passed on).
  `--config` is a global WezTerm option and must come before `start`, or the GUI never starts and `open`
  still exits 0. `--position` is in pixels (points x backing scale); window list bounds are points.
  Pass it as `--position=x,y`: a separate `-1728,76` is parsed as a flag and the GUI exits with no
  window, again after `open` exited 0. The restarter therefore checks for a new live `wezterm-gui`.
- A bundled app started by its executable (`<app>/Contents/MacOS/<name>`, e.g. a `.run.ps1`
  `Start-Process`) opens behind the terminal: measured 2026-11-17 for WezTerm split, tab, and
  Terminal.app alike, so not oc's split code. `NSRunningApplication.activate` from the pane does not
  help; `open -a <app>` after the process checked in with LaunchServices (`lsappinfo find pid=<pid>`
  non-empty) brings that instance forward. Before check-in, `open -a` starts a second instance.
- The resident server drops `WEZTERM_UNIX_SOCKET`/`WEZTERM_PANE` from its environment: it outlives the
  window that started it, and a `wezterm cli` call on a dead socket starts a stray mux server.

## Known Mac test failures

Listed with the other known failures in `docs/dev/testing.md`.
