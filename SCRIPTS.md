# SCRIPTS.md - OpenCode PowerShell automation

Project automation lives in `.scripts/`. Scripts target PowerShell 7 and fail on command errors. They set the repository location before running relative commands, call the shared `closeOut` helper after successful standalone runs, and do not publish releases unless explicitly invoked. Help and failure paths remain open.

## Files

| Path | Purpose |
|------|---------|
| `.scripts/scriptHelper.ps1` | Shared repository paths, maintenance version validation, and native-command checks. |
| `.scripts/build.ps1` | Agent-safe build of the current-platform production and debug executables. `-Release` builds the release executable and archives through the existing Bun build script. It never touches the installed runtime. |
| `.scripts/buildDebug.ps1` | Agent-safe debug-only build. It never touches the production dist artifact or installed runtime. |
| `.scripts/.run.ps1` | Runs the repository's normal `bun dev .` entry point and forwards arguments. |
| `.scripts/prePush.ps1` | Runs Turbo typecheck, then refreshes the README code count and `scc.txt`. It does not commit or push. |
| `.scripts/countCode.ps1` | Uses `scc` on PATH to refresh the README code count and root `scc.txt` language report. Runnable independently. |
| `.scripts/updateUpstream.ps1` | Fetches and fast-forwards the separate `UPSTREAM\opencode` checkout without modifying this customized parent checkout. |
| `.scripts/syncAndInstall.ps1` | Fail-closed upstream sync into this custom fork, then verify, backup, stop `opencode.exe`, and install. |
| `.scripts/push.ps1` | Commits parent changes with a supplied subject, else the message in `buildNotes.txt` (line 1 subject, blank line, body) when it changed since the last commit, else a prompted subject, then pushes the current branch. It does not rewrite `.version/version` and does not stage `UPSTREAM/`. `-DryRun` prints the commands only; `-Force` is explicit. |
| `.scripts/pushRelease.ps1` | Tags and publishes archives from `packages/opencode/dist` to `fosterbarnes/oc` using the `.version/version` maintenance version. Existing tags are not force-moved. |
| `.scripts/install.ps1` | User-only build-and-install of both `opencode.exe` and `ocdebug.exe`. `-NoBuild`/`-nb` installs existing artifacts. It stops OpenCode processes and must not run from an agent. |
| `.scripts/revive.ps1` | `/revive-no-install`: `oc --shutdown-all`, start the resident server, reopen oc through `Desktop\occ.lnk`. No elevation. |
| `.scripts/reviveAndInstall.ps1` | `/revive`: build while oc runs, `oc --shutdown-all`, `install.ps1 -NoBuild`, then reopen like `revive`. |
| `.scripts/setReviveConsolePosition.ps1` | One-time: saves a centered `HKCU\Console\<title>` WindowPosition for the revive console windows. Rerun after a resolution change. |
| `.scripts/installDebug.ps1` | User-only debug install. Builds (unless `-NoBuild`/`-nb`) and replaces only `ocdebug.exe`; production OpenCode processes are left alone. |
| `.scripts/.runDebug.ps1` | Same as `.run.ps1`, with `OPENCODE_INSTANCE=debug` and DEBUG logs. |

## Common commands

```powershell
.\.scripts\build.ps1
.\.scripts\buildDebug.ps1
.\.scripts\build.ps1 -Release
.\.scripts\.run.ps1
.\.scripts\prePush.ps1
.\.scripts\updateUpstream.ps1
.\.scripts\syncAndInstall.ps1 -DryRun
.\.scripts\syncAndInstall.ps1 -AllowDirtyParent -SkipFetch -SkipInstall
.\.scripts\syncAndInstall.ps1
.\.scripts\install.ps1
.\.scripts\install.ps1 -NoBuild
.\.scripts\installDebug.ps1
.\.scripts\.runDebug.ps1
```

Agents may run `build.ps1` and `buildDebug.ps1`. They must not run
`install.ps1`, `installDebug.ps1`, `.install.ps1`, or normal
`syncAndInstall.ps1`: those scripts can stop the OpenCode host that launched the
agent. A successful agent build should report the dist artifact paths, then ask
the user to exit OpenCode and run the install command from a fresh PowerShell:

```powershell
.\.scripts\install.ps1 -NoBuild
# or, for debug only:
.\.scripts\installDebug.ps1 -NoBuild
```

The installers refuse inherited OpenCode processes before building, stopping,
backing up, or copying files. `syncAndInstall.ps1 -SkipInstall` remains the
non-install upstream sync/build path.

`oc` is unchanged: production `opencode.exe`, resident server on port 4096. `ocdebug` is a native PATH command; bare and project/path invocations open `oc launch`, while explicit commands pass through. It uses `opencode-debug` data/config/state, a resident server on port **4097**, DEBUG logs, and copies production user settings/authentication on first run. The TUI can overwrite debug settings from production, then requires an `ocdebug` restart. Session handoff uses `opencode export <session-id>` followed by `ocdebug import <file>`. `.scripts\install.ps1` installs both exes. `.scripts\installDebug.ps1` only stops/replaces `ocdebug.exe`.


## Upstream checkout

The actual upstream OpenCode source is kept in the separate checkout at
`C:\Users\user\Documents\GitHub\oc\UPSTREAM\opencode`. This repository is the customized parent checkout.

Run `.\.scripts\updateUpstream.ps1` to fetch the nested checkout's configured
remote and fast-forward its current tracking branch. The script refuses dirty
or divergent upstream state and does not modify the parent source checkout.

For a refresh-only sync, first verify both worktrees, run the updater, record the
new upstream SHA, then compare the parent custom hunks against that refreshed
checkout. Preserve dirty parent work. Do not commit, reset, stash, or merge as
part of this operation; classify normal upstream age drift separately from
confirmed custom behavior.

`syncAndInstall.ps1` is the combined updater. Install directory, executable name, backup suffix, and the snapshot baseline live in the `CONFIG` block at the top of that script (default install `C:\Users\user\Apps\opencode\opencode.exe`). It refuses a dirty parent unless `-AllowDirtyParent` is passed after review. `Custom fork:` comments are review metadata only; overlapping hunks always stop. Text compare treats CRLF and LF as the same so Windows checkouts are not fake overlaps. `-DryRun` classifies and reports without fetch, source application, `Stop-Process`, backup, or install. `-SkipFetch` applies against the current isolated checkout. `-SkipInstall` stops after verify/build without touching the installed exe. After a clean apply it runs `git diff --check`, parses changed PowerShell files, `bun typecheck` from each affected package directory (never the repo root), then the existing Windows single-executable build. Only then (unless `-SkipInstall`) does it stop all `opencode.exe` processes, copy the current install to `opencode.exe.bak`, and install the new binary. If that `.bak` already exists, the previous backup is renamed with a timestamp unless `-OverwriteBackup` replaces it in place. Source changes stay uncommitted.

The standalone build is the repository's `packages/opencode/script/build.ts --single` flow. A normal `build.ps1` run emits `dist/opencode-windows-x64/bin/opencode.exe` and `dist/opencode-debug-windows-x64/bin/ocdebug.exe`; `buildDebug.ps1` emits only the latter. The install script only supports the current Windows architecture and does not alter PATH.

`build.ps1`, `buildDebug.ps1`, `.run.ps1`, and `.runDebug.ps1` call `requireBunForCompile` in `scriptHelper.ps1` before invoking Bun. Stable Bun 1.4.0 (`34cbb9a40`) is rejected because it embeds the Windows TUI `bun:ffi` FTL segfault (oven-sh/bun#39829). When PATH bun is 1.4.0 or older, the script runs `bun upgrade --canary` and refuses to compile if the version is still 1.4.0. The compiled `opencode.exe` contains that Bun runtime; upgrading PATH bun after an old compile does not fix an already-installed exe.

## Version and release

`.version\version` is a maintenance-only semantic version for these local scripts. It is intentionally separate from OpenCode's package version. The agent increments the last number once per code-changing session and when an upstream apply advances isolated `dev` (`0.0.8` -> `0.0.9`); no script bumps it (see `AGENTS.md` Revision). `pushRelease.ps1` uses `v<maintenance-version>` and uploads archive files under `packages/opencode/dist` to `fosterbarnes/oc`. It does not force-move an existing tag. `push.ps1` does not rewrite this file.

Do not run `push.ps1` or `pushRelease.ps1` during ordinary validation. They create commits, push branches or tags, and publish GitHub releases. `push.ps1` reads `buildNotes.txt` for the commit message (see `AGENTS.md`); it never modifies it.

## Code count

Run `.\.scripts\countCode.ps1` to refresh just the count, or `.\.scripts\prePush.ps1`
to refresh it after the existing checks pass. Requires `scc` on PATH.
The README uses the report's **Code** total, excluding blank and comment lines,
and displays a language table with all six report columns. The script changes only
the number in the `[number](scc.txt)` link and the table between
`<!-- code-count:start -->` and `<!-- code-count:end -->`.
Keep the link and markers; surrounding wording and placement can be edited freely.
Counts maintained source, tests, and scripts across this checkout, including inherited
OpenCode source. Includes TS/TSX, JS/MJS/CJS, CSS, HTML, Astro, SQL, PowerShell, shell,
Go, and Nix. Honors ignore files and excludes `UPSTREAM`, dependencies, build output,
and generated client directories (`gen`, `generated`, `generated-effect`).

## Excluded base scripts

The base installer, updater, README-rewrite, and version-bump scripts were not imported because this repository has no matching artifacts or version workflow. Their .NET, Avalonia, Inno Setup, ImageMagick, and updater behavior does not apply here.
