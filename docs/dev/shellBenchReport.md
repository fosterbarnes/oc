# shellbench report: pwsh vs the stock macOS shell

2026-11-11, oc v0.2.361, MacBook M1 Pro, macOS 15.8.3, pwsh 7.6.9, zsh 5.9, Bun 1.4.2.
Plan: `docs/dev/shellBenchPlan.md`. Harness and raw notes: `.scripts/shellbench/` (`README.md`,
`ANALYSIS.md`; per-run reports `shellbench-*` are gitignored).

## Summary

- Everything oc does on the Mac through pwsh can be done with the shell macOS ships, with identical
  results. Every port and every agent command matched pwsh exactly (29/29 cases), and every
  non-pwsh case also passed with pwsh removed from PATH. Nothing needed Homebrew.
- pwsh costs a fixed amount per call: ~120 ms to start, ~75 ms more to load `scriptHelper.ps1`, and
  before this work ~160 ms more for the user profile on every agent command. zsh and `/bin/sh` start
  in ~4 ms.
- That cost only matters for things that run often. Agent commands run hundreds of times a day, so
  they moved to zsh. Once-a-session scripts (`bumpVersion`, the test runner) are 0.3-0.5 s faster per
  run as plain shell, which is a nice-to-have, not a reason to switch on its own.
- Claude sessions never used pwsh on the Mac: Claude Code's own Bash tool runs `$SHELL` (zsh).
  Only non-Claude models went through oc's pwsh shell tool, about 1% of agent commands in the last
  three days.
- With a real model (Test 1b), pwsh vs zsh made no difference to the outcome: same answer, same
  single shell call, no shell syntax errors, similar time and tokens. The model used oc's built-in
  search and read tools for most of the work and the shell only to run the test.

## What changed because of it (v0.2.361)

- oc's shell tool now always starts pwsh with `-NoProfile` (it did on Windows only). This removed
  ~160 ms per pwsh agent command on macOS and stopped profile functions (a custom `kill`) from
  changing what commands do. `src/packages/opencode/src/tool/shell.ts` `cmd()`.
- The shared `opencode.jsonc` no longer sets `"shell"`, so each machine's agent shell is its login
  shell: zsh on the Mac, pwsh on Windows (checked: Windows `SHELL` is `pwsh.exe` and it has no zsh).
  The shared `AGENTS.md` and the Mac `principles.md` now say which shell to write for on each OS.
- `.scripts/posix/` holds plain-shell copies of `bumpVersion` and the test runner's single-package
  path for comparison. The `.ps1` scripts stay the ones in use.

## Tests

Medians. Every arm ran alternately in the same rounds; n=10 unless noted, after 2 warmups.

### Spawn cost (empty command)

| zsh | zsh login | pwsh `-NoProfile` | pwsh as the agent shell ran it before | pwsh + `scriptHelper.ps1` |
| ---: | ---: | ---: | ---: | ---: |
| 4 ms | 44 ms | 116 ms | 309 ms | 193 ms |

### Test 1: agent commands

14 command shapes taken from real agent use (git status/log/diff, ripgrep, reading a line range,
listing, existence check, JSON field, counting, `which`, temp-folder work, failure check, env var,
one bun test), each written for pwsh and for zsh.

| | pwsh with profile (before) | pwsh `-NoProfile` (now) | zsh (now the Mac default) |
| --- | ---: | ---: | ---: |
| per command | 295-389 ms | 122-203 ms | 4-58 ms |
| all 14 | 4.55 s | 2.25 s | 0.17 s |
| same output as before | | 14/14 | 14/14, also without pwsh |

All three resolved the same `bun`, `brew`, `git`, and `rg`, so dropping the profile lost nothing.

### Test 1b: real model, pwsh vs zsh

GPT-6 Luna (medium), two runs per shell, read-only task: find where `detachedCommand` is defined,
run its test file, report the line and the pass/fail counts. The oc log confirms the shell each run
used.

| run | seconds | shell calls | failed calls | wrong-shell syntax errors | tokens |
| --- | ---: | ---: | ---: | ---: | ---: |
| pwsh 1 | 13.4 | 1 | 1 | 0 | 40,847 |
| pwsh 2 | 10.9 | 1 | 1 | 0 | 40,493 |
| zsh 1 | 14.3 | 1 | 1 | 0 | 42,371 |
| zsh 2 | 13.3 | 1 | 1 | 0 | 41,784 |

- All four gave the same correct answer (`src/packages/core/src/util/launchDetached.ts:28`, 0 pass,
  2 fail, 1 skip). The "failed call" in each is that test file exiting 1: a known macOS failure
  (Windows-only tests), not a shell problem.
- The only shell command, `bun test test/util/launchDetached.test.ts`, reads the same in both
  shells. Search and reading went through oc's glob/grep/read tools.
- Small sample (2 runs per shell, one model, one task). It shows zsh does not hurt a non-Claude model
  on a typical lookup-and-test task. It cannot show a difference on shell-heavy tasks, where the
  per-command numbers from Test 1 apply.

### Test 2: `bumpVersion` (n=20)

| case | pwsh | `/bin/sh` | same result |
| --- | ---: | ---: | --- |
| bump | 631 ms | 138 ms | yes |
| reroll tag | 614 ms | 133 ms | yes |
| padded version file | 626 ms | 138 ms | yes |
| missing word list (error) | 244 ms | 13 ms | yes: version bumped, tag kept, same message |
| invalid version (error) | 241 ms | 10 ms | yes |
| two-line version file (error) | 241 ms | 10 ms | yes |
| word-list filter | 538 ms | 120 ms | yes: 39,741 words |

Run in throwaway repo copies; compared the version and tag files byte for byte, the output, and the
error messages. About 115 ms of the plain-shell time is `jq` reading the 44,356-entry word list.

### Test 3: test runner, one package

| case | pwsh `test.ps1` | `/bin/sh test.sh` | bare `bun test` | same result |
| --- | ---: | ---: | ---: | --- |
| fast file (3 tests) | 325 ms | 66 ms | 56 ms | yes |
| slower file (7 tests, n=3) | 2,071 ms | 1,775 ms | 1,795 ms | yes |
| name filter | 326 ms | 65 ms | | yes, incl. the wrapper's own lines |
| dry run | 201 ms | 10 ms | | yes, same command line |
| failing run | 357 ms | 65 ms | | yes |
| file outside package / missing file / unknown package | 217-244 ms | 8-10 ms | | yes |

The wrapper itself costs ~270 ms per run in pwsh and ~10 ms in plain shell, whatever the tests take.

## Findings beyond the numbers

- The pwsh profile was loaded on every Mac agent command (oc passed `-NoProfile` only on Windows).
  The unit tests could not show it: the test setup points `XDG_CONFIG_HOME` at a temp folder, which
  hides the profile. It took a probe with production-like environment to reproduce.
- Ports are about the same size as the pwsh code they replace (~60 lines for `bumpVersion`, 69 for
  the test runner's one path). The bugs found while porting were all shell traps, each caught by a
  parity case: `grep -x` accepts a file if any one line matches; a failing `$(...)` inside command
  arguments does not stop `set -e`; BSD awk rejects an unparenthesized ternary after `print`; macOS
  has no `realpath -m`.
- `opencode run` waits for stdin to close when stdin is not a terminal. Run it with `< /dev/null`
  from scripts or background jobs; the first Test 1b attempt hung for 10 minutes on this.
- Two shell tool tests (`captures stderr in output`, `reports a command killed by an external signal`)
  use POSIX syntax and fail if the Mac agent shell is pwsh. They pass on zsh, the Mac default now.

## Recommendations

1. Keep the Mac agent shell on zsh and pwsh agent commands on `-NoProfile` (both shipped).
2. Keep the `.ps1` scripts as the source of truth. Speed alone does not justify porting
   once-a-session scripts; port one only when it must run where pwsh is not installed.
3. If a no-pwsh Mac matters (an IT-managed machine), the remaining pwsh dependencies, in daily-use
   order: the sidebar script runner (types pwsh syntax into new panes), `/clone` and `/mergeClone`
   scripts, `build.ps1`, `prePush.ps1`, then WezTerm's default shell. Each can follow the same
   pattern: port beside the `.ps1`, add a parity case to shellbench, decide from the numbers.

## Follow-ups done the same day

- Sidebar script runner: works on macOS in pwsh and zsh WezTerm panes (it never ran there:
  `wezterm-gui` has no `cli`); waits for the pane's prompt and types that shell's syntax.
- `/clone` scripts: `/cloneLocal` works on macOS (rsync instead of robocopy); plain-shell copies
  match the ps1 in 7/7 cases and run 4-23x faster (`.scripts/shellbench/ANALYSIS.md`).
