# shellbench: pwsh vs the stock macOS shell

Status (2026-11-11): all tests done (Chunk 0, Tests 1, 1b, 2, 3). Write-up:
`docs/dev/shellBenchReport.md`. `-NoProfile` shipped, Mac agent shell is zsh. Next: a backlog item,
chosen with the user. Mac only.

## Goal

Compare three real oc workloads run two ways on this Mac:

- **A (today)**: pwsh 7 (`/usr/local/bin/pwsh`) as the agent shell and script language.
- **B (stock macOS, what IT ships)**: `/bin/zsh` as the agent shell, POSIX `/bin/sh` scripts, stock
  tools only.

New B code is written beside the pwsh code, never instead of it. No `.ps1` is edited or removed
during the experiment.

## Where pwsh sits on the Mac today

| Layer | Where | Runs |
| --- | --- | --- |
| Agent shell tool | `~/.config/opencode/opencode.jsonc` `"shell": "pwsh"`; `cmd()` in `src/packages/opencode/src/tool/shell.ts` | every agent command |
| Dev scripts | `.scripts/*.ps1`, most dot-source `.scripts/scriptHelper.ps1` (327 lines) | per script run |
| Workflow scripts | `~/.config/opencode/scripts/*.ps1` (cloneProject, openCloneTab, mergeClone, syncFreeSubs) | per `/clone`, `/mergeClone` |
| Terminal | WezTerm `default_prog` = pwsh (`~/Documents/GitHub/wezFig/wezterm.lua`); `OWN_PANE` in `src/packages/tui/src/routes/session/sidebar-tools/scriptRunner.ts` types pwsh syntax into panes | interactive |
| Not on the Mac path | `config/startup.ts` registry, `config/resident.ts` Get-NetTCPConnection, `util/launchDetached.ts` Windows hop, `util/processTree.ts` Windows snapshot, `util/archive.ts` | Windows only, out of scope |

The darwin TypeScript runtime already uses native paths (libproc, lsof, launchd plist, osascript;
`docs/dev/macos.md`). The A/B is about the shell layers, not oc's server code.

## Baseline probes (2026-11-11, 5-10 runs each, rough)

| Spawn | ms per call |
| --- | --- |
| `zsh -c exit` | 4 |
| `zsh -l -c exit` (login) | 45 |
| `pwsh -NoLogo -NoProfile -NonInteractive -Command exit` | ~120 |
| pwsh through the agent shell tool's Mac path | ~284 |
| `pwsh -NoProfile` + dot-source `scriptHelper.ps1` | ~196 |

**Finding: on macOS every agent pwsh call loads the user profile.** `cmd()` in `tool/shell.ts`
passes `-NoProfile` only when `process.platform === "win32"`. On darwin it runs
`ChildProcess.make(command, [], { shell })`, which spawns `pwsh -c <command>`, and pwsh then loads
`~/.config/powershell/Microsoft.PowerShell_profile.ps1`. Verified: the profile function
`WaitForProgram` resolves inside an agent-path call. That is ~160 ms of the ~284 ms, and the
profile's `kill` function shadows `/bin/kill` in agent commands. A search of `oc.db` found no agent
command that relies on a profile function.

## Rules for every chunk

- B scripts live in `.scripts/posix/` with the same basename as the `.ps1` they mirror. The `.ps1`
  stays the source of truth.
- B uses stock macOS only: `/bin/zsh`, `/bin/sh` (bash 3.2 in POSIX mode), `/usr/bin/jq` (ships
  with macOS 15), BSD `sed`/`awk`/`grep`/`od`, plus `git` and `bun`. No Homebrew packages. Scripts
  start `#!/bin/sh` + `set -eu`, stay POSIX (no arrays: build argument lists with `set --`), and
  quote every expansion.
  - Why `/bin/sh` for scripts while zsh is the agent shell: POSIX sh runs unchanged under any shell
    an IT image ships, on the Debian VM, and in Git Bash on Windows.
- Every B case also runs with pwsh hidden from `PATH` (`--no-pwsh`) to prove B does not need it.
- Never run B scripts against the real repo state when they write files: use a throwaway copy.
- Code-changing chunks follow `AGENTS.md` (bump version, build note). Do not build or install oc.
- Stop rule: if a parity check still fails after two fix attempts, stop and report.

## Chunk 0: harness

`.scripts/shellbench/`, modeled on `.scripts/grepbench/`:

- `shellbench.ts` (Bun, no dependencies), `README.md`, `ANALYSIS.md` (findings per chunk).
- Reports `shellbench.json` and `shellbench-report.md`, gitignored next to the grepbench lines in
  `.gitignore`.

```
bun .scripts/shellbench/shellbench.ts <spawn|agent|bump|test> [-n 10] [--warmup 2] [--no-pwsh]
```

- A case is `{ name, arms: { [arm]: { argv } | { shell, command } , cwd?, env?, reset? } }`.
  `reset` runs untimed before each timed run (Test 2 uses it to restore files).
- Per arm: warmups, then `n` timed `Bun.spawnSync` runs (`performance.now()` around the spawn).
  Keep exit code and normalized output (trim, LF line endings, collapse trailing spaces) plus its
  hash.
- Report per case and arm: median, p90, min, ratio to the first arm, parity (`same`, or `differs`
  with a 3-line diff), and a totals row.
- `--no-pwsh` reruns the B arm with a `PATH` that has no pwsh directory and fails the case if pwsh
  still resolves.
- Run it from a normal WezTerm pane: that is the environment oc's agent shell inherits.

Done when the `spawn` test reproduces the baseline table above within about 20%.

## Test 1: agent shell calls (no translation: config and argv only)

The highest-frequency path. `oc.db` holds 2,084 shell tool calls so far.

Arms (argv mirrors `cmd()` in `tool/shell.ts`; quote the line number in the harness comment):

- **A0 today**: `spawn(command, [], { shell: "/usr/local/bin/pwsh" })`, profile loads.
- **A1 pwsh without profile**: `pwsh -NoLogo -NoProfile -NonInteractive -Command <command>`, what
  Windows already does.
- **B**: `spawn(command, [], { shell: "/bin/zsh" })`.

Corpus: real agent command shapes, each with a pwsh form (A0, A1) and a zsh form (B). cwd is the repo
root. Pick paths so both forms print the same thing; parity is part of the result.

| # | Task | pwsh | zsh |
| --- | --- | --- | --- |
| 1 | status | `git status --short` | same |
| 2 | log | `git log --oneline -5` | same |
| 3 | diff stat | `git diff --stat HEAD~1` | same |
| 4 | search | `rg -n launchDetached src/packages/core/src` | same |
| 5 | read range | `Get-Content -LiteralPath <f> \| Select-Object -Skip 99 -First 40` | `sed -n 100,139p <f>` |
| 6 | list | `Get-ChildItem -Name src/packages` | `ls -1 src/packages` |
| 7 | exists | `Test-Path -LiteralPath src/.version/version` | `[ -e src/.version/version ] && echo True \|\| echo False` |
| 8 | JSON field | `(Get-Content -Raw src/package.json \| ConvertFrom-Json).packageManager` | `jq -r .packageManager src/package.json` |
| 9 | count | `@(git ls-files \| Where-Object { $_ -like '*.ps1' }).Count` | `git ls-files \| grep -c '\.ps1$'` |
| 10 | which | `(Get-Command bun).Source` | `command -v bun` |
| 11 | temp work | `$d = New-Item -ItemType Directory -Force (Join-Path ([IO.Path]::GetTempPath()) "sb$PID"); Set-Content (Join-Path $d f) hi; Remove-Item -LiteralPath $d -Recurse -Force; 'ok'` | `d=$(mktemp -d) && echo hi > "$d/f" && rm -rf "$d" && echo ok` |
| 12 | failure check | `git rev-parse --verify nope 2>$null; if ($LASTEXITCODE) { 'missing' }` | `git rev-parse --verify nope 2>/dev/null \|\| echo missing` |
| 13 | env | `$env:HOME` | `echo "$HOME"` |
| 14 | one test | `bun test test/event.test.ts` in `src/packages/schema` | same |

Add a `session` row: all 14 back to back, the shape of a short agent turn.

Check before recommending A1: rows 10 and `Get-Command brew` must resolve the same tools in A0 and
A1 (the profile also prepends PATH folders; oc normally inherits them from its WezTerm pwsh).

### Test 1b: real model run (optional, user-run)

Same fixed task, 2 runs per arm, in a scratch `/clone`. The arm is set by the scratch project's
`opencode.jsonc` `"shell"` plus one `AGENTS.md` line naming the shell, so project rules override the
"Prefer pwsh" line in `principles.md` without touching global config. Suggested task: "Find where
`launchDetached` is defined, run the tests that cover it, and report pass/fail with the line."
Collect from `oc run --format json`: wall time, shell calls, failed shell calls, calls that failed
on shell syntax, tokens. This spends model usage and agents must not start `oc run` from a shell,
so the harness only prints the commands for the user to run.

### Decision after Test 1

- A1 within ~100 ms per call of B on the `session` row, and no PATH difference: ship the small source
  fix (drop the `process.platform === "win32" &&` guard in `cmd()` so pwsh always gets
  `-NoProfile`), keep `"shell": "pwsh"`.
- B clearly faster and 1b shows no more failed calls: switch the Mac to `"shell": "zsh"` (one config
  line) and make the "Prefer pwsh" line in `principles.md` per OS. `ShellPrompt.render` already gives
  zsh the bash-style tool prompt (`src/packages/opencode/src/tool/shell/prompt.ts`).
- The A1 fix is worth shipping on its own whenever pwsh remains the agent shell anywhere.

## Test 2: session-end chore: `bumpVersion`

Every code-changing session runs it once. It is the typical shape of oc's scripts: load
`scriptHelper`, read and write files, parse JSON, pick randomly, validate with a regex.

Translate:

- `.scripts/posix/scriptHelper.sh`: only what bumpVersion needs (paths from the script's own
  location, `requireVersion`, `incrementMaintenancePatch`, `getVersionTags` for one tag,
  `setVersionTag`). Nothing speculative.
- `.scripts/posix/bumpVersion.sh [--reroll-tag]`.
- Words: `.res/yapBot.json` is a JSON array (44,356 entries, some symbols). Filter like the ps1:
  `jq -r '.[] | select(type == "string" and test("^[A-Za-z]+$"))'`.
- Random index: `od -An -N4 -tu4 /dev/urandom` modulo the word count (modulo bias does not matter for
  a tag; say so in a comment).
- Write with `printf '%s\n'`: LF, no BOM, same bytes as `WriteAllText`.
- Same output and failures: `Maintenance version a -> b (tag)`, `Version tag <tag>` for reroll,
  nonzero exit with the same message for a missing word list or a malformed version.

Run both in a throwaway copy: `mktemp -d`, copy `.scripts/`, `src/.version/`, and `.res/yapBot.json`
with the same layout. Both scripts find the repo from their own location, so they edit the copy.
`reset` restores `version` before each timed run.

Parity (in the harness): version file bytes, tag matches `^[a-z]+[A-Z][a-z]*$`, no BOM, one trailing
LF, stdout shape, exit code and message for a missing `yapBot.json` and for `version` = `abc`.

Arms: A `pwsh -NoProfile -File .scripts/bumpVersion.ps1`, B `/bin/sh .scripts/posix/bumpVersion.sh`,
n=20, plus `--no-pwsh`.

## Test 3: check runner: `test.ps1 -Package <p> -File <f>`

The dev loop's "run the tests for what I changed". Shows what the wrapper costs around real work.

Translate only the single-package path to
`.scripts/posix/test.sh -p <package> [-f <file>] [-n <name regex>] [--dry-run]`:

- cwd `src/packages/<p>`; runs
  `bun test --timeout 30000 --only-failures [--test-name-pattern <n>] [./<file relative to package>]`.
- `-f` must resolve inside the package and exist; same messages as `test.ps1`.
- Child env: `GITHUB_ACTIONS=false`, `OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER=false` (the
  non-Windows value). No restore step: only the child sees them.
- Provider packages (`node --test`), categories, and `-All` are out of scope: refuse with a message
  pointing at `test.ps1`.
- Exit code propagates; `--dry-run` prints the single command line.

Arms: A `pwsh -NoProfile -File .scripts/test.ps1 -Package schema -File test/event.test.ts`, B
`/bin/sh .scripts/posix/test.sh -p schema -f test/event.test.ts`, C bare `bun test ...` in the
package (the floor). n=10 on that fast file, n=3 on one slower test file picked in Chunk 0. Report
wrapper overhead = arm minus C. Parity: same pass/fail summary line and exit code; `-DryRun`
command vs `--dry-run` line; a bad `-File` gives the same message and a nonzero exit.

## Reading the results

- Speed matters only where calls are frequent: count a per-call delta when delta x calls per day
  exceeds about a minute, or when a single run feels slower (over about 1 s). Test 1 can clear that
  bar; Tests 2 and 3 probably will not, so judge them on parity, lines of code (ps1 vs sh), and
  whether they run with no pwsh installed.
- For every chunk record: medians, parity failures, line counts, any non-stock tool needed, and
  surprises (quoting, BSD vs GNU flags, bash 3.2 limits).

## Backlog (after the three tests, one per session, ranked by daily use)

1. Done (v0.2.361): sidebar script runner. `preparePane` in `scriptRunner.ts` reads the new pane's
   tty, waits for the shell's prompt (non-canonical mode held ~100 ms), and types pwsh or POSIX
   syntax by the tty's session leader. Also fixed: on macOS `WEZTERM_EXECUTABLE` is `wezterm-gui`,
   whose `cli` exits 2, so WezTerm script runs had always failed there.
2. Done (v0.2.361): `cloneHelper`, `cloneProject`, `openCloneTab` ported to
   `~/.config/opencode/scripts/posix/`; shellbench `clone`: 7/7 same (also without pwsh), sh 4-23x
   faster (Local git 651 vs 142 ms, Remote 828 vs 177 ms). Found and fixed in the ps1: `/cloneLocal`
   used robocopy, so it always failed on macOS (now rsync off Windows), and `newSnapshot` built the
   index path with `\`. `mergeClone.ps1` (not ported) still merges back after the helper fix.
   `mergeClone` port is next only if a no-pwsh Mac is needed.
3. `build.ps1` as a thin posix wrapper (bun compile dominates; mainly a no-pwsh check).
4. `prePush.ps1` (typecheck, OpenAPI regenerate, Prettier batches).
5. WezTerm `default_prog` zsh vs pwsh: startup time and PATH parity. Lives in the wezFig repo.

A `.ps1` stays the default until the user decides to swap that one script.

## Out of scope

Windows pwsh paths, removing any `.ps1`, installer and companion, `pwshUpdate*.ts` (the pwsh updater
stays while pwsh is a dependency).

## Results

(Per chunk: date, version, results table, parity failures, decision.)

### 2026-11-11 - v0.2.361 - Chunk 0 + Test 1

Details: `.scripts/shellbench/ANALYSIS.md`.

| median ms | A0 pwsh today | A1 pwsh -NoProfile | B zsh |
| --- | ---: | ---: | ---: |
| per agent call | 295-389 | 122-203 | 4-58 |
| 14 calls | 4,553 | 2,247 | 172 |
| parity vs A0 | reference | 14/14 | 14/14 (also with pwsh off PATH) |

- Harness differences from the plan: arms are argv only (no `reset` until Test 2 needs it); the
  `session` row is the sum of medians; reports are per test (`shellbench-<test>[-nopwsh].*`).
- New fact: 2,077 of 2,105 agent shell calls in `oc.db` came from Claude Code sessions, which use
  Claude Code's own zsh Bash tool. Only non-Claude providers (29 calls) go through oc's pwsh shell
  tool. The pwsh agent cost is real per call but small per day at current use.
- Decision (user): all of them. Shipped A1 (`cmd()` always passes `-NoProfile`); removed `"shell"`
  from the shared `opencode.jsonc` so each machine uses `$SHELL` (Mac zsh, Windows pwsh); shared
  `AGENTS.md` and Mac `principles.md` updated to match; Test 1b prepared; Test 2 run.
- Claude Code under oc was never on pwsh on the Mac: it uses its own Bash tool on `$SHELL`. Only on
  Windows does oc set `CLAUDE_CODE_USE_POWERSHELL_TOOL=1` (`provider/claude-code/spawnEnv.ts`).

### 2026-11-11 - v0.2.361 - Test 2 (`bumpVersion`)

Details: `.scripts/shellbench/ANALYSIS.md`. 7/7 cases same (files, messages, exit codes), also with
pwsh off PATH. Median: bump 631 ms pwsh vs 138 ms sh (sh time is mostly `jq` reading the word list);
error paths 241 vs 10 ms. Same size (~60 lines). Next: Test 3, or Test 1b results first.

- Deviation: Test 1b runs in the real repo (read-only task) with the arm set by
  `OPENCODE_CONFIG_CONTENT` and one prompt line naming the shell, not a scratch `/clone`; nothing in
  the task writes files, and the env override changes no config file.

### 2026-11-11 - v0.2.361 - Test 3 (`test.ps1 -Package -File`)

Details and the overall table: `.scripts/shellbench/ANALYSIS.md`. 8/8 cases same (pass/fail
counts, wrapper lines, dry-run line, four error paths), also with pwsh off PATH. Wrapper overhead
over bare `bun test`: pwsh ~270 ms per run, sh ~10 ms. `test.sh` is 69 lines for one path.

- Deviation: `test.sh` takes the same flag names as `test.ps1` (`-Package`, `-File`, `-Name`,
  `-DryRun`) instead of `-p/-f/-n/--dry-run`, so the two read the same and give the same messages.
- Added a minimal POSIX `closeOut` (kill the sidebar-made pane on success) to `scriptHelper.sh`,
  because `test.ps1` ends with `closeOut 0`. Not exercised by the bench (the harness clears
  `SCRIPT_OWN_PANE` so no run can kill its own pane).
- Takeaway across Tests 1-3: every port matched pwsh exactly and ran without pwsh; pwsh costs a
  fixed ~120-270 ms per call, which matters only for frequent calls. Next step is the user's pick
  from the backlog below (sidebar script panes are first by daily use).

### 2026-11-11 - v0.2.361 - Test 1b (real model)

GPT-6 Luna medium, 2 runs per shell: same correct answer, 1 shell call each (`bun test ...`, same
syntax in both shells), 0 wrong-shell syntax errors, 11-14 s, 40-42k tokens. Search and reads used
oc's own tools. Inconclusive for shell-heavy work, no harm from zsh on a typical task. The printed
commands now end in `< /dev/null` (`opencode run` waits for a non-TTY stdin to close; the first
attempt hung).
