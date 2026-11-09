# macOS support (dev notes)

oc runs on Windows and macOS (Apple Silicon) from one source tree. Platform differences live in shared
helpers with a `win32` and a `darwin` branch; callers stay platform-neutral. Plan:
`~/.config/opencode/plans/macosSupport.md`.

## Dev loop (Windows VM + Mac host)

- Mac: `ssh foster@macbook.sawfish-boga.ts.net` (PowerShell profile `sshMac`; key `~/.ssh/macbook_ed25519`).
  Use the PowerShell tool for ssh: Git Bash's ssh does not read that key. Non-interactive ssh reads only
  `~/.zshenv`, whose non-interactive block puts `~/.bun/bin`, `~/.local/bin`, Homebrew, and `/usr/local/bin`
  (pwsh) on PATH. WezTerm starts pwsh directly (launchd's bare PATH, no zsh files), so the Mac pwsh
  profile (`~/.config/powershell/Microsoft.PowerShell_profile.ps1`) prepends the same folders. Build
  toolchain: Bun 1.4.2 (`src/package.json` pin), pwsh 7, git, tar.
- Windows `C:` is SMB-mounted on the Mac at `/Volumes/C`. Never `bun install` there: `node_modules` holds
  per-OS native packages. The Mac keeps a mirror with its own `node_modules` in `~/Documents/GitHub/oc`:
  `/usr/bin/rsync -rlt --exclude node_modules --exclude dist --exclude UPSTREAM --exclude .git --exclude .turbo --exclude "*.db" /Volumes/C/Users/Foster/Documents/GitHub/oc/ ~/Documents/GitHub/oc/`
  (add `--delete` only when no other agent is syncing). Not `-a`: the share reports every file as
  `rwx------`, which marks the whole tree modified; without `-p` existing files keep their git modes
  (macOS `openrsync` has no `--chmod`). The
  mirror must be a git checkout (`build.ts` reads `git branch --show-current`); it is a clone of GitHub
  `origin`, and the rsync excludes `.git`, so syncs keep it.
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

## Known Mac test failures (record once; report only new ones)

Baseline 2026-11-08, before the macOS changes, core suite: 4 fail / 1048 pass.
- `detachedCommand ps1 > keeps caller text off the cmd command line`, `... drops cmd-active characters`:
  Windows-only behavior tested on every OS.
- `pty > does not duplicate replay when data arrives before activate`, `pty > does not deliver stale output
  after detach`: also fail on Linux (`docs/dev/v0.3.0.md`).

opencode suite on clean HEAD f822a27 (2026-11-08): 24 fail / 5035 pass. After the macOS changes: no new
failures. The revive and startup tests that assume Windows paths now skip off Windows. Still failing on Mac
at HEAD and after (pre-existing, not investigated):
- Claude warm-up: `global HttpApi > returns warm-up state ...`, `... persists warm-up schedules ...`, six
  `tick: ...` tests, `sender recheck: ...`, `cli gate: 2.1.293 floor ...`.
- `cancel finalizes interrupted bash tool output ...`, `cancel interrupts loop queued behind shell`.
- `describeSpawnCwd reports which branch ...`, `describeSpawnCwd never disagrees ...` (also Linux).
- `command path rules persist on messages ...`, `session bootstrap > creates a session without model
  execution`, `opencode agent validate > multiple-invalid ...`, `agentUrl: invalidateAgentUrl > memoized
  resolve ...`.
