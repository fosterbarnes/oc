# SCRIPTS.md - OpenCode PowerShell automation

Project automation lives in `.scripts/`. Scripts target PowerShell 7 and fail on command errors. They set the repository location before running relative commands, most call the shared `closeOut` helper after successful standalone runs, and do not publish releases unless explicitly invoked. Help and failure paths remain open.

## Files

| Path | Purpose |
|------|---------|
| `.scripts/scriptHelper.ps1` | Shared repository paths (including `$installDir`), maintenance version and tag helpers, native-command checks, `requireBunForCompile`, `closeOut`, and `runLoop`. Dot-sourcing it moves the shell into `src`. |
| `.scripts/build.ps1` | Build of the current-platform `oc` and native `opencode` executables (`-Oc`/`-Native` for one flavor). `-Release` builds release executables and archives through the existing Bun build script (not with `-Oc`/`-Native`). `-SkipInstall` passes `--skip-install` to the Bun build script. It never touches the installed runtime. |
| `.scripts/buildInstaller.ps1` | Builds the Inno Setup installer `oc_v<version>_windows-x64-setup.exe` into `.installer/Output` and removes older setup exes there. Runs `buildCompanion.ps1 -Publish` first (self-contained `ocSetup`, bundles .NET). Needs Inno Setup 6.7+, ImageMagick when the wizard images are missing, and the dist binaries from `build.ps1 -Release`. |
| `.scripts/buildCompanion.ps1` | Builds the `ocSetup` companion window. Default: incremental Debug build into `.installer/ocSetup/bin/dev` (closes a running dev copy first). `-Publish`: self-contained single-file publish into `.installer/publish` for the installer. |
| `.scripts/prePush.ps1` | Runs Turbo typecheck, the TUI keybind docs `--check`, and the doc link check (`src/script/docLinks.ts`: links and anchors in the repo docs and `../oc.wiki`), regenerates `packages/sdk/openapi.json`, and formats changed files under `src` with Prettier. It does not commit or push. |
| `.scripts/test.ps1` | Runs local package tests, HttpApi gates, typechecking, or generated-file checks. Supports package, file, test-name, category, and all-check selection. |
| `.scripts/updateUpstream.ps1` | Fetches and fast-forwards the separate `UPSTREAM\opencode` checkout without modifying this customized parent checkout. |
| `.scripts/push.ps1` | Commits parent changes with a supplied subject (first positional argument), else the message in `buildNotes.txt` at the repo root (git-ignored; line 1 subject, blank line, body) when line 1 differs from the last commit subject, else a prompted subject, then pushes the current branch. It does not rewrite `src/.version/version` or `versionTag` and does not stage `UPSTREAM/`. `-DryRun`/`-n` prints the commands only; `-Force`/`-f` is explicit. |
| `.scripts/pushRelease.ps1` | Tags and publishes to `fosterbarnes/oc` using the `src/.version/version` maintenance version and the `src/.version/versionTag` tag. Uploads the two Windows zips from `src/packages/opencode/dist` (required), any macOS `darwin` zips there, and the required `.installer/Output/oc_v<version>_windows-x64-setup.exe`. Release notes are the commit messages since the previous GitHub release. The release title is `opencode v<version> <tag>`; uploaded zip copies are renamed to `opencode-v<version>-<tag>-<rest>.<ext>`. Existing tags are not force-moved. `-DryRun` prints the title, renames, and notes range only. |
| `.scripts/bumpVersion.ps1` | Bumps the `src/.version/version` patch and rolls a new random tag into `src/.version/versionTag`. `-RerollTag` regenerates only the tag. |
| `.scripts/agentPush.ps1` | Non-interactive push for the agent-push skill. `-Context` prints branch, version, the line 1 character budget, status, new `docs/buildNotes/buildNotes.md` lines, and recent subjects (what the agent needs to write `buildNotes.txt`); `-Tags` prints 10 candidate version tags and `-SetTag <tag>` writes the one the user picked; the default mode refuses code changes without a version bump, validates the message (line 1 classifier rules in `docs/dev/commitMessage.md`, checked by `.scripts/tests/commitSubject.tests.ps1`), runs `prePush.ps1` and `push.ps1` in-process, then reports. |
| `.scripts/claudeRealFlow.ps1` | Runs the Claude provider flow against the real model, spending Claude plan usage (default steps 0-8 about $0.20-1.00, `-Step7` about $0.05-0.15, `-CheckOnly` one Haiku reply). It always asks for a typed `yes` first, so agents never run it unasked. `-Model` and `-SwitchModel` pick the flow and step 7 models. `-NewToken` ignores the saved copy, `-Forget` deletes it. |
| `.scripts/nativeTest.ps1` | Runs a dist native `opencode` in its own WezTerm window on the real profile, beside a running oc (`/agentTest`, see `docs/dev/agentTest.md`). `-Start [-Build] [-Project <dir>] [-Exe <path>]`, `-Screen` prints the pane text, `-Stop` closes it and restores the shared state files it copied. One run at a time. |
| `.scripts/shareClaudeProjects.ps1` | One-time move to shared Claude Code transcripts: merges each `~/.claudeN` folder's `projects` and `tasks` into `~/.claude` and links them back. Dry run by default; `-Apply` moves files. Never overwrites. |
| `.scripts/install.ps1` | User-only build-and-install of `oc` (+ `occ` hard link) and native `opencode`. `-Oc` or `-Native` installs one flavor. `-NoBuild`/`-nb`/`-b` installs existing artifacts. `-SkipBunInstall` skips `bun install` during the compile while still copying to `$installDir`: the PATH folder holding `oc` + `occ` (the install `oc` launches, wherever setup or an older install put it), else `%LOCALAPPDATA%\Programs\oc` on Windows (setup default) or `~/.local/bin` on macOS. Before replacing binaries it copies the current install to a timestamped `backup-*` folder next to them (newest 3 kept) and restores from it on failure. On macOS it re-signs a copied binary ad hoc when `codesign --verify` fails and prints the PATH line for your shell profile instead of editing PATH. It stops OpenCode processes and must not run from an agent. |
| `.install.ps1` (repo root) | Shortcut for `install.ps1`: runs `install.ps1 -NoBuild` by default; `-Build`/`-b` builds first; passes `-Oc`/`-Native`. Agents never run it. |
| `.scripts/.run.ps1` | `bun dev` run under `runLoop`. No arguments opens `oc launch` (resident); `-Native`/`-n` runs the native flavor (`OC_FLAVOR=native`). Extra arguments go to OpenCode. |
| `.scripts/.runCompanion.ps1` | Builds and opens the `ocSetup` companion in dev mode under `runLoop`. `-Fake [-FailId <id>,...]` fakes detection and installs, `-OcExe <path>` uses a built `oc` as the engine, `-Watch` runs `dotnet watch`. |
| `.scripts/posix/bumpVersion.sh`, `posix/test.sh`, `posix/scriptHelper.sh` | POSIX shell ports of `bumpVersion.ps1` (`--reroll-tag`) and the single-package path of `test.ps1` (`-Package`, `-File`, `-Name`, `-DryRun`) for the shellbench comparison (`docs/dev/shellBenchPlan.md`). The `.ps1` scripts stay the source of truth. |
| `.scripts/shellbench/` | Bun harness timing the same oc workloads on pwsh and the stock macOS shell: `bun .scripts/shellbench/shellbench.ts <spawn\|agent\|bump\|test\|clone> [-n 10] [--warmup 2] [--no-pwsh]` or `model [--read]`. See its `README.md`. |
| `.scripts/grepbench/` | Standalone Go harness comparing OpenCode's ripgrep grep arguments against `ug`, `ugrep`, `ugrep-indexer`, and `tgrep`: `go run . -repo <oc checkout> -n 1`. See its `README.md`. |
| `.scripts/tests/*.tests.ps1` | Script checks: `testRunner` (`test.ps1`), `commitSubject` (`agentPush.ps1` line 1 rule), `installDir` (`$installDir` lookup), `buildNotesChanged` (`push.ps1` message detection). |

## Common commands

```powershell
.\.scripts\build.ps1
.\.scripts\build.ps1 -Release
.\.scripts\.run.ps1
.\.scripts\prePush.ps1
.\.scripts\updateUpstream.ps1
.\.scripts\install.ps1
.\.scripts\install.ps1 -NoBuild
```

Builds are user-driven. Agents must not run
`install.ps1` or `.install.ps1`: those scripts can stop the OpenCode host that launched the
agent. A successful agent build should report the dist artifact paths, then ask
the user to exit OpenCode and run the install command from a fresh PowerShell:

```powershell
.\.scripts\install.ps1 -NoBuild
```

The installers refuse inherited OpenCode processes before building, stopping,
backing up, or copying files.

`oc` is production `oc.exe` (`occ.exe` is a hard link), resident server on port 4096. `opencode` is the native build: same features, in-process TUI, no resident server. `/revive-single` builds and installs only native `opencode`, then opens it beside the running oc. It shares production data. `ocdebug` is retired; old data folders and installed files are not deleted automatically.


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
| `unit` | The 13 local unit packages (`test.ps1 -List`), using `bun test --timeout 30000 --only-failures`. |
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
be invoked from any directory using its full path. Coverage is for the current OS
(Windows or macOS); run it on each OS for that OS's coverage.

The runner's targeted verification is `.scripts/tests/testRunner.tests.ps1`. The other script checks
in `.scripts/tests` are `commitSubject`, `installDir`, and `buildNotesChanged`.

## Upstream checkout

The actual upstream OpenCode source is kept in the separate checkout at
`UPSTREAM\opencode` inside this repository. This repository is the customized parent checkout.

Run `.\.scripts\updateUpstream.ps1` to fetch the nested checkout's configured
remote and fast-forward its current tracking branch. The script refuses dirty
or divergent upstream state and does not modify the parent source checkout.

For a refresh-only sync, first verify both worktrees, run the updater, record the
new upstream SHA, then compare the parent custom hunks against that refreshed
checkout. Preserve dirty parent work. Do not commit, reset, stash, or merge as
part of this operation; classify normal upstream age drift separately from
confirmed custom behavior.

There is no automated upstream apply. This fork has drifted too far from upstream for a hunk-based merge to be safe, so `updateUpstream.ps1` and the `UPSTREAM\opencode` checkout are kept only as a reference for cherry-picking upstream fixes by hand. `.scripts/upstream-sync.state.json` records `baselineSha` (last upstream SHA ported) and `snapshotSha`; see `UPSTREAM-SYNC.md`.

The standalone build is the repository's `packages/opencode/script/build.ts --single` flow (current OS and architecture only). A normal `build.ps1` run on Windows emits `src/packages/opencode/dist/opencode-windows-x64/bin/oc.exe` and `src/packages/opencode/dist/opencode-native-windows-x64/bin/opencode.exe`; on macOS the folders are `opencode-darwin-<arch>` and `opencode-native-darwin-<arch>` and the binaries have no `.exe`. `-Oc` skips native and `-Native` builds only native (`build.ts --oc-only` / `--native-only`). The installer uses Windows x64 artifacts and adds its installation folder to the user PATH when missing.

`build.ps1`, `.run.ps1`, and `nativeTest.ps1 -Build` call `requireBunForCompile` in `scriptHelper.ps1` before invoking Bun. It only acts on Windows. Stable Bun 1.4.0 (`34cbb9a40`) is rejected because it embeds the Windows TUI `bun:ffi` FTL segfault (oven-sh/bun#39829). When PATH bun is 1.4.0 or older, the script runs `bun upgrade --canary` and refuses to compile if the version is still 1.4.0. The compiled `opencode.exe` contains that Bun runtime; upgrading PATH bun after an old compile does not fix an already-installed exe.

## Version and release

`src\.version\version` is a maintenance-only semantic version for these local scripts, and `src\.version\versionTag` is the random camelCase two-word tag rolled on every bump. They are intentionally separate from OpenCode's package version. The agent runs `.scripts\bumpVersion.ps1` once per code-changing session, including one that hand-ports upstream changes (`0.2.363` -> `0.2.364`); `-RerollTag` regenerates only the tag (see `AGENTS.md` Revision). `pushRelease.ps1` titles the release `opencode v<maintenance-version> <tag>`, keeps the git tag at `v<maintenance-version>`, and uploads copies of the archives under `packages/opencode/dist` renamed to `opencode-v<ver>-<tag>-<rest>.<ext>`; `-DryRun` prints the title and renames without tagging or uploading. It does not force-move an existing tag. `push.ps1` does not rewrite these files. GitHub computes a SHA-256 for every uploaded asset and shows it on the release page; `/update` refuses a zip that does not match it, and users can compare by hand with `Get-FileHash <zip> -Algorithm SHA256`. Enable "Release immutability" in the repository settings so published assets cannot be replaced.

Do not run `push.ps1` or `pushRelease.ps1` during ordinary validation. They create commits, push branches or tags, and publish GitHub releases. `push.ps1` reads the repo-root `buildNotes.txt` (git-ignored) for the commit message (see `docs/dev/commitMessage.md`); it never modifies it.
