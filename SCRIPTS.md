# SCRIPTS.md - OpenCode PowerShell automation

Project automation lives in `.scripts/`. Scripts target PowerShell 7 and fail on command errors. They set the repository location before running relative commands, call the shared `closeOut` helper after successful standalone runs, and do not publish releases unless explicitly invoked. Help and failure paths remain open.

## Files

| Path | Purpose |
|------|---------|
| `.scripts/scriptHelper.ps1` | Shared repository paths, maintenance version validation, and native-command checks. |
| `.scripts/build.ps1` | Agent-safe build of the current-platform `oc`, native `opencode`, and debug executables (`-Oc`/`-Native` for one flavor). `-Release` builds the release executable and archives through the existing Bun build script. `-SkipInstall` passes `--skip-install` to the Bun build script (skips `bun install` of compile deps). It never touches the installed runtime. |
| `.scripts/buildDebug.ps1` | Agent-safe debug-only build. It never touches the production dist artifact or installed runtime. |
| `.scripts/prePush.ps1` | Runs Turbo typecheck and the TUI keybind docs `--check`, then refreshes the README code count and `scc.txt`. It does not commit or push. |
| `.scripts/test.ps1` | Runs local package tests, HttpApi gates, typechecking, or generated-file checks. Supports package, file, test-name, category, and all-check selection. |
| `.scripts/countCode.ps1` | Uses `scc` on PATH to refresh the README code count and root `scc.txt` language report. Runnable independently. |
| `.scripts/updateUpstream.ps1` | Fetches and fast-forwards the separate `UPSTREAM\opencode` checkout without modifying this customized parent checkout. |
| `.scripts/push.ps1` | Commits parent changes with a supplied subject, else the message in `buildNotes.txt` (line 1 subject, blank line, body) when it changed since the last commit, else a prompted subject, then pushes the current branch. It does not rewrite `.version/version` or `versionTag` and does not stage `UPSTREAM/`. `-DryRun` prints the commands only; `-Force` is explicit. |
| `.scripts/pushRelease.ps1` | Tags and publishes archives from `src/packages/opencode/dist` to `fosterbarnes/oc` using the `.version/version` maintenance version and the `.version/versionTag` tag. The release title is `opencode v<version> <tag>`; uploaded copies are renamed to `opencode-v<version>-<tag>-<rest>.<ext>`. Existing tags are not force-moved. `-DryRun` prints the title and renames only. |
| `.scripts/bumpVersion.ps1` | Bumps the `.version/version` patch and rolls a new random tag into `.version/versionTag`. `-RerollTag` regenerates only the tag. |
| `.scripts/agentPush.ps1` | Non-interactive push for the agent-push skill. `-Context` prints branch, version, status, new `buildNotes.md` lines, and recent subjects (what the agent needs to write `buildNotes.txt`); the default mode validates the message, runs `prePush.ps1` and `push.ps1` in-process, then reports. |
| `.scripts/claudeRealFlow.ps1` | Runs the Claude provider flow against the real model, spending Claude plan usage (default steps 0-8 about $0.20-1.00, `-Step7` about $0.05-0.15, `-CheckOnly` one Haiku reply). It always asks for a typed `yes` first, so agents never run it unasked. `-NewToken` ignores the saved copy, `-Forget` deletes it. |
| `.scripts/install.ps1` | User-only build-and-install of `oc.exe` (+ `occ.exe` hard link), `ocdebug.exe`, and native `opencode.exe`. `-Oc` or `-Native` installs one flavor. `-NoBuild`/`-nb` installs existing artifacts. `-SkipBunInstall` skips `bun install` during the compile while still copying to `Apps\opencode`. Before replacing binaries it copies the current install to a timestamped `backup-*` folder next to them (newest 3 kept) and restores from it on failure. It stops OpenCode processes and must not run from an agent. |
| `.scripts/revive.ps1` | Replaces built-in `/revive-no-install` only when set as `oc.json` `revive.path`: `oc --shutdown-all`, start the resident server, reopen oc through `Desktop\occ.lnk`. No elevation. |
| `.scripts/reviveAndInstall.ps1` | Manual build, `oc --shutdown-all`, `install.ps1 -NoBuild`, then reopen like `revive`. `/revive` no longer uses it or any `.scripts` file; it builds natively from `oc.json` `revive.build.source`. |
| `.scripts/setReviveConsolePosition.ps1` | One-time: saves a centered `HKCU\Console\<title>` WindowPosition for the revive console windows. Rerun after a resolution change. |
| `.scripts/installDebug.ps1` | User-only debug install. Builds (unless `-NoBuild`/`-nb`) and replaces only `ocdebug.exe`; production OpenCode processes are left alone. |
| `.scripts/.run.ps1` | `bun dev` run. No arguments opens `oc launch` (resident); `-Native`/`-n` runs the native flavor (`OC_FLAVOR=native`). |
| `.scripts/.runDebug.ps1` | Same as `.run.ps1`, with `OPENCODE_INSTANCE=debug` and DEBUG logs. |

## Common commands

```powershell
.\.scripts\build.ps1
.\.scripts\buildDebug.ps1
.\.scripts\build.ps1 -Release
.\.scripts\.run.ps1
.\.scripts\prePush.ps1
.\.scripts\updateUpstream.ps1
.\.scripts\install.ps1
.\.scripts\install.ps1 -NoBuild
.\.scripts\installDebug.ps1
.\.scripts\.runDebug.ps1
```

Agents may run `build.ps1` and `buildDebug.ps1`. They must not run
`install.ps1`, `installDebug.ps1`, or `.install.ps1`: those scripts can stop the OpenCode host that launched the
agent. A successful agent build should report the dist artifact paths, then ask
the user to exit OpenCode and run the install command from a fresh PowerShell:

```powershell
.\.scripts\install.ps1 -NoBuild
# or, for debug only:
.\.scripts\installDebug.ps1 -NoBuild
```

The installers refuse inherited OpenCode processes before building, stopping,
backing up, or copying files.

`oc` is production `oc.exe` (`occ.exe` is a hard link), resident server on port 4096. `opencode` is the native build: same features, in-process TUI, no resident server. `ocdebug` is a native PATH command; bare and project/path invocations open `oc launch`, while explicit commands pass through. It uses `opencode-debug` data/config/state, a resident server on port **4097**, DEBUG logs, and copies production user settings/authentication on first run. The TUI can overwrite debug settings from production, then requires an `ocdebug` restart. Session handoff uses `opencode export <session-id>` followed by `ocdebug import <file>`. `.scripts\install.ps1` installs both exes. `.scripts\installDebug.ps1` only stops/replaces `ocdebug.exe`.


## Local tests and checks

Cloud workflows are removed. Run checks manually with PowerShell 7; Bun, Node 24+
(provider tests), Git (generation checks), and workspace dependencies must already
be installed. The runner does not install or upgrade tools.

```powershell
.\.scripts\test.ps1 -List
.\.scripts\test.ps1 -Package core
.\.scripts\test.ps1 -Package schema -File test/event.test.ts
.\.scripts\test.ps1 -Package schema -File test/event.test.ts -Name 'definition is pure'
.\.scripts\test.ps1 -Package core,schema
.\.scripts\test.ps1 -Category unit,providers
.\.scripts\test.ps1 -Category httpapi
.\.scripts\test.ps1 -Category typecheck
.\.scripts\test.ps1 -Category generated
.\.scripts\test.ps1 -All
.\.scripts\test.ps1 -All -DryRun | Format-Table Name,Category,Command
```

No arguments or `-Help` prints usage. `-File` is relative to the selected package;
`-Name` is a native test-name regex. Both require exactly one `-Package`.
`-DryRun` returns the selected commands without executing them.

| Category | Checks |
|----------|--------|
| `unit` | The 20 former unit-matrix packages, using `bun test --timeout 30000 --only-failures`. |
| `providers` | Node tests in `cursor-runtime`. |
| `httpapi` | Existing coverage, authentication, and Effect exerciser gates in `opencode`. |
| `typecheck` | Workspace Turbo typecheck, with `--continue=always`. |
| `generated` | Regenerate client, legacy SDK, and OpenAPI; check tracked and untracked outputs. |

`-All` includes every category, including generation. Generation rewrites output
files and compiles the legacy SDK; it refuses staged, unstaged, or untracked changes
in the client generated directories or SDK tree before starting. Resulting changes
are left for inspection, never reset automatically.

Checks run sequentially, stream their output, and stop on the first failing command
with a nonzero exit status. The runner restores the caller's directory and the
temporary Actions/file-watcher environment settings on success or failure. It can
be invoked from any directory using its full path. Coverage is for the current OS;
run separately on Linux with PowerShell to get Linux coverage.

The runner's targeted verification is `.scripts/tests/testRunner.tests.ps1`.

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

There is no automated upstream apply. This fork has drifted too far from upstream for a hunk-based merge to be safe, so `updateUpstream.ps1` and the `UPSTREAM\opencode` checkout are kept only as a reference for cherry-picking upstream fixes by hand.

The standalone build is the repository's `packages/opencode/script/build.ts --single` flow. A normal `build.ps1` run emits `dist/opencode-windows-x64/bin/oc.exe`, `dist/opencode-native-windows-x64/bin/opencode.exe`, and `dist/opencode-debug-windows-x64/bin/ocdebug.exe`; `-Oc` skips native, `-Native` builds only native (`build.ts --oc-only` / `--native-only`), and `buildDebug.ps1` emits only `ocdebug.exe`. The install script only supports the current Windows architecture and does not alter PATH.

`build.ps1`, `buildDebug.ps1`, `.run.ps1`, and `.runDebug.ps1` call `requireBunForCompile` in `scriptHelper.ps1` before invoking Bun. Stable Bun 1.4.0 (`34cbb9a40`) is rejected because it embeds the Windows TUI `bun:ffi` FTL segfault (oven-sh/bun#39829). When PATH bun is 1.4.0 or older, the script runs `bun upgrade --canary` and refuses to compile if the version is still 1.4.0. The compiled `opencode.exe` contains that Bun runtime; upgrading PATH bun after an old compile does not fix an already-installed exe.

## Version and release

`.version\version` is a maintenance-only semantic version for these local scripts, and `.version\versionTag` is the random camelCase two-word tag rolled on every bump. They are intentionally separate from OpenCode's package version. The agent runs `.scripts\bumpVersion.ps1` once per code-changing session, including one that hand-ports upstream changes (`0.0.8` -> `0.0.9`); `-RerollTag` regenerates only the tag (see `AGENTS.md` Revision). `pushRelease.ps1` titles the release `opencode v<maintenance-version> <tag>`, keeps the git tag at `v<maintenance-version>`, and uploads copies of the archives under `packages/opencode/dist` renamed to `opencode-v<ver>-<tag>-<rest>.<ext>`; `-DryRun` prints the title and renames without tagging or uploading. It does not force-move an existing tag. `push.ps1` does not rewrite these files.

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
