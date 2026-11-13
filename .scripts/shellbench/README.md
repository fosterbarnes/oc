# shellbench

Bun harness that times the same oc workloads on pwsh and on the stock macOS shell. Plan and
decisions: `docs/dev/shellBenchPlan.md`. Findings: `ANALYSIS.md`.

```
bun .scripts/shellbench/shellbench.ts <spawn|agent|bump|test|clone> [-n 10] [--warmup 2] [--no-pwsh]
bun .scripts/shellbench/shellbench.ts model [--read]
```

- `spawn`: an empty command on each shell (zsh, zsh login, pwsh `-NoProfile`, pwsh `-c` as the agent
  shell tool ran it on macOS before v0.2.361, pwsh plus dot-sourced `scriptHelper.ps1`).
- `agent`: Test 1, 14 real agent command shapes. Arms: `A0` `pwsh -c` (profile loads; oc's macOS
  shell tool before v0.2.361), `A1` pwsh `-NoProfile` (oc's shell tool now), `B` `/bin/zsh -c`.
- `bump`: Test 2, `bumpVersion.ps1` vs `posix/bumpVersion.sh` in throwaway repo copies: bump, reroll,
  missing word list, bad and two-line version files, padded version, and the word-list filter.
  Parity compares the version and tag files and the message, not raw output.
- `test`: Test 3, `test.ps1` vs `posix/test.sh` (single-package path, same flag names) with bare
  `bun test` as arm C: a fast and a slower test file, name filter, dry run, and four error paths.
  Parity on the pass/fail lines, wrapper lines, dry-run line, and error messages.
- `clone`: the `/clone` scripts in `~/.config/opencode/scripts` vs `posix/` there, on scratch repos
  (Local git and plain, Remote against a bare origin, three error paths) plus `openCloneTab` once per
  arm against a stub `opencode` (opens and closes one real WezTerm tab per run). Parity on the JSON
  line, the clone's files and symlinks, and its git baseline.
- `model`: Test 1b. Prints `opencode run` commands (one non-Claude model, shell tool on pwsh vs zsh,
  JSON logs into this folder) for you to run; it spends model usage, so the harness never runs them.
  `--read` summarizes the logs: seconds, shell calls, failed calls, wrong-shell syntax failures,
  tokens, answer.
- Arms alternate inside each round. Every run gets the agent markers `AGENT`, `OPENCODE`, `AI_AGENT`.
- Parity compares each arm's exit code and normalized output (LF, trailing spaces trimmed) with the
  first arm. `unstable` means an arm's output changed between its own runs.
- `--no-pwsh`: arms that do not start pwsh run with every PATH folder holding `pwsh` replaced by a
  temp folder of links to its other files, and the run fails if pwsh still resolves.
- Run it from a normal terminal pane: that is the environment oc's agent shell inherits.
- Reports and logs: `shellbench-*` here (gitignored).
