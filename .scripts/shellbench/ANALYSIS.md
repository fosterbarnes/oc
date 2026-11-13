# shellbench findings

Plan: `docs/dev/shellBenchPlan.md`. Raw reports: `shellbench-*.md` / `.json` here (gitignored).

## 2026-11-11 - Chunk 0 + Test 1 (agent shell calls)

macOS 15.8.3, M1 Pro, Bun 1.4.2, pwsh 7.6.9, zsh 5.9. n=10 after 2 warmups, arms interleaved.

### Spawn cost (empty command, median ms)

| zsh -c | zsh -l -c | pwsh -NoProfile | pwsh -c (agent path) | pwsh + scriptHelper |
| ---: | ---: | ---: | ---: | ---: |
| 4.1 | 44.4 | 116.3 | 309.1 | 192.6 |

Matches the plan's baseline probes (4 / 45 / ~120 / ~284 / ~196).

### Agent commands (14 shapes, median ms)

| | A0 pwsh today | A1 pwsh -NoProfile | B zsh |
| --- | ---: | ---: | ---: |
| per call (range) | 295-389 | 122-203 | 4-58 |
| sum of 14 | 4,553 | 2,247 | 172 |
| parity vs A0 | reference | 14/14 same | 14/14 same |
| B with pwsh removed from PATH | | | 14/14 same, 172 ms |

- The profile costs ~160 ms per call; pwsh itself costs another ~150 ms over zsh. The work inside the
  commands is small next to either (git status is 20 ms on zsh).
- A0 and A1 resolve the same `bun`, `brew`, `git`, `rg`: oc already inherits the profile's PATH from
  its terminal, so `-NoProfile` loses nothing found in this corpus.
- B needs no pwsh at all (`--no-pwsh` run identical).

### Who actually hits the pwsh path

`oc.db` on this Mac (2026-11-09 to 11-11): 2,105 shell tool calls. 2,077 came from `claude-code`
sessions, which run Claude Code's own Bash tool on zsh, not oc's shell tool. Only 29 (one `openai`
session) went through oc's shell tool and pwsh. So on this Mac today about 1% of agent commands pay
the pwsh cost; the rest already run on the stock shell. Error rate: 9/2,077 on zsh (0.4%), 0/29 on
pwsh.

Plan rule (delta x calls per day > ~1 min): A0 to B saves ~300 ms per call. At today's ~10 pwsh
calls per day that is ~3 s per day; it clears the bar only past ~200 oc-shell-tool calls per day
(heavy non-Claude models or subagents).

### Decision inputs

- A1 (`-NoProfile` on macOS too) halves pwsh cost with no parity loss and removes profile-dependent
  behavior (the profile's `kill` function shadows `/bin/kill`). Source change: drop
  `process.platform === "win32" &&` in `cmd()` in `src/packages/opencode/src/tool/shell.ts`.
- Switching oc's Mac shell to zsh only changes non-Claude providers; Claude sessions are on zsh
  already. Whether non-Claude models do as well on zsh is Test 1b (real model spend, user-run).

### Why Claude sessions are on zsh

oc's claude-code provider runs the Claude Code CLI, whose own Bash tool uses `$SHELL` (`/bin/zsh`).
oc's `"shell"` setting never reaches it. On Windows oc sets `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`
(`provider/claude-code/spawnEnv.ts`), so there Claude Code uses its PowerShell tool.

### Decision (user, 2026-11-11): all four

- Shipped A1: `cmd()` always passes `-NoProfile` to pwsh (detached stays per platform). Probe through
  the real ShellTool with SHELL=pwsh and production-like env: `PROFILE LOADED` before, `NO PROFILE`
  after, `bun` resolves the same.
- Mac agent shell is zsh: `"shell"` removed from the shared `opencode.jsonc`, so each machine uses
  `$SHELL` (Mac `/bin/zsh`; Windows `SHELL` is `pwsh.exe` and has no zsh). Shared `AGENTS.md` and the
  Mac `principles.md` now say pwsh on Windows, zsh on macOS.
- Test 1b prepared (`model` subcommand), Test 2 run.

## 2026-11-11 - Test 2 (`bumpVersion`)

`.scripts/posix/bumpVersion.sh` + `scriptHelper.sh` (POSIX sh, `jq`/`awk`/`od` from macOS) vs the
ps1, in throwaway repo copies. n=20, median ms.

| case | pwsh | sh | parity |
| --- | ---: | ---: | --- |
| bump | 631 | 138 | same |
| reroll tag | 614 | 133 | same |
| missing word list (error) | 244 | 13 | same (version bumped, tag kept, same message) |
| bad version `abc` (error) | 241 | 10 | same |
| padded version `  0.2.361 ` | 626 | 138 | same |
| two-line version (error) | 241 | 10 | same |
| word-list filter (39,741 words) | 538 | 120 | same count |

- With pwsh off PATH: identical results (sum 558 ms vs 560).
- The sh time is mostly `jq` parsing the 44,356-entry word list (~115 ms); without it a run is
  ~10-15 ms. pwsh pays ~116 ms startup, ~75 ms for `scriptHelper.ps1`, and the rest in
  `ConvertFrom-Json`.
- Size: about the same (~60 non-comment lines each, counting only the ps1 functions bumpVersion uses).
- Porting notes: `grep -x` accepted a file where any one line was a version (the ps1 regex checks the
  whole trimmed file); fixed with a `case` check and caught by the two-line case. A `$(...)` inside
  `printf` arguments does not trip `set -e`, so results are assigned first. `LC_ALL=C` keeps `[a-z]`
  ASCII.
- Per the plan's rule, ~0.5 s once per session does not matter for speed; the result is parity plus
  "runs with no pwsh installed", both met.

## 2026-11-11 - Test 3 (`test.ps1 -Package -File`)

`.scripts/posix/test.sh` (single-package path, same flag names as `test.ps1`) vs `test.ps1`, with
bare `bun test` (same env vars, package folder) as arm C. n=10 (slower file n=3), median ms.

| case | pwsh | sh | bare bun | parity |
| --- | ---: | ---: | ---: | --- |
| fast file (schema event.test.ts, 3 tests) | 325 | 66 | 56 | same counts |
| slower file (core git.test.ts, 7 tests) | 2,071 | 1,775 | 1,795 | same counts |
| name filter + wrapper lines | 326 | 65 | | same `Running`/`Passed`/counts |
| dry run | 201 | 10 | | same command line |
| failing run (no test matches) | 357 | 65 | | same exit and message |
| file outside package | 239 | 10 | | same |
| missing file | 244 | 10 | | same |
| unknown package | 218 | 8 | | same phrase |

- Wrapper overhead (arm minus bare bun): pwsh ~270 ms on every run, sh ~10 ms (the slower file's
  sh-below-bun gap is noise at n=3).
- With pwsh off PATH: identical results.
- Size: `test.sh` 69 non-comment lines for one path; `test.ps1` 152 for all paths.
- Porting notes: BSD awk needs parentheses around a ternary after `print`. `-File` resolution is
  lexical (`.`/`..`), like `GetFullPath`, done in awk because macOS has no `realpath -m`. The
  unknown-package message points at `test.ps1 -List`, since `test.sh` has no `-List`.

## Overall (Tests 1-3)

| workload | pwsh | stock shell | outputs |
| --- | --- | --- | --- |
| agent command | 300 ms (profile) / 150 ms (`-NoProfile`) | 4-58 ms zsh | identical 14/14 |
| `bumpVersion` | 630 ms | 138 ms sh (`jq` ~115 of it) | identical 7/7 |
| test runner wrapper | +270 ms per run | +10 ms per run | identical 8/8 |

- Every POSIX port matched pwsh on outputs, files, exit codes, and messages, and ran with pwsh
  removed from PATH. Nothing needed Homebrew.
- pwsh's cost is a fixed ~120 ms start plus ~75 ms per `scriptHelper.ps1` load, paid on every call.
  It matters for frequent calls (agent commands), not for once-a-session scripts.
- Ports are about the same size as the pwsh code they mirror. The traps were all shell-specific
  (`set -e` and `$(...)`, `grep -x` per line, BSD awk syntax), and each was caught by a parity case.

## 2026-11-11 - Backlog 2 (`/clone` scripts)

`~/.config/opencode/scripts/posix/{cloneHelper,cloneProject,openCloneTab}.sh` vs the ps1 scripts
(after fixing `/cloneLocal` on macOS: robocopy there, rsync now). Scratch repos; n=10, median ms.

| case | pwsh | sh | parity |
| --- | ---: | ---: | --- |
| Local, git repo | 651 | 142 | same JSON, files, symlink, baseline tree, branch, push guard |
| Local, plain folder | 294 | 35 | same |
| Remote (bare origin, 1 unpushed, 3 uncommitted) | 828 | 177 | same, incl. `leftBehind` |
| Remote, not git / detached HEAD / no remote | 279-348 | 12-36 | same message and exit |
| openCloneTab (stub opencode, 1 run) | 974 | 682 | same output |

- With pwsh off PATH: identical.
- Before this, `/cloneLocal` could not work on the Mac at all (`robocopy` not found), and
  `newSnapshot` looked for `"$GitDir\index"`, a file name with a backslash, so it never reused the
  index. `mergeClone.ps1`, which shares the helper, still merges back (probed).
- Porting notes: JSON in the same key order via `jq` object addition; `jq -n now` for sub-second
  timing; the EXIT trap removes a half-made clone like the ps1's catch.
