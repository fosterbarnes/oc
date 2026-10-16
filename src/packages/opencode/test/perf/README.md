# Performance probes

Opt-in, Windows-only probes that drive oc from source against `TestLLMServer` and sample CPU,
private memory, and IO writes from CIM. No build, no install, no real model. Moved here from the
review kit in `%TEMP%\ocPerfProbe`; baselines are in the perf review plan
(`~\.config\opencode\plans\perfReview\stage0.probes.md` and the `stageN.findings.md` files).

Needs Bun 1.4.1, `bun install` done in `src`, `wezterm-mux-server` on PATH (pane metrics), and the
`claude` CLI (P8). From the repo root:

```powershell
pwsh -NoProfile -File src\packages\opencode\test\perf\run.ps1 M1
pwsh -NoProfile -File src\packages\opencode\test\perf\run.ps1 cleanup
```

`run.ps1` sets `OC_PERF_PROBE=1` and `OC_PERF_METRIC`, runs `probe.test.ts` (or `cleanup.test.ts`),
and prints the run directory. Runs go to `C:\ocTestTmp\ocPerfRuns` (override with `OC_PERF_OUT`);
`latest.txt` and `<metric>-run.txt` there point at the newest run. Without `OC_PERF_PROBE=1` both
test files skip, so the package suite never runs them.

## Metrics

| Metric | What it measures |
|---|---|
| M1 | Idle CPU/memory for 60 s after 10 turns, sidebar visible |
| M2 | Busy for 60 s: stream open, no tokens |
| M3 | 200 KB markdown reply in 400-byte chunks paced at 20 ms; wall time to screen |
| M4 | 150 short turns in a fresh session; memory every 25 turns |
| M5 | Not implemented (reports skipped) |
| M6 | Startup: CIM snapshot at launch +5 s and time to Home |
| `all` | M1-M4 and M6 in one pane (M4 after `/new`) |
| P1 | Memory per isolate after first draw and after 25 turns (`instrumentedEntry.ts` + `memoryPreload.ts`; GC forced every 5 s) |
| P2 | Session switching memory curve. Blocked: pane navigation failed twice; no numbers exist |
| P3 | 200 KB plain prose vs fenced code, separate panes; OpenConsole write bytes as the ConPTY proxy |
| P4 | Spinner timer wakes and render frames: (a) busy stream, (b) one running `bash`, (c) four parallel `bash` (`spinnerPreload.ts`) |
| P6 | Four parallel `explore` subagents with 12 s model holds (`eventPreload.ts`; its SSE counter saw no events in the baseline) |
| P7 | Disk and git per turn on a 2,000-file repo, snapshot on vs off (`gitPreload.ts`) |
| P8 | `opencode serve` + SDK on the Claude provider: CLI children cold vs warm, after 90 s idle, survivors after graceful and hard stop. No TUI |
| P9 | `opencode serve` + SDK: memory and MCP children (`mcpStub.ts`) across six projects, idle, deletes, instance dispose. No TUI |

## Method

- Pane metrics run a test-owned headless `wezterm-mux-server` (own config and socket, 160x40) with
  `bun run --cwd packages/opencode <entry> <project>`; every `wezterm cli` call passes
  `--no-auto-start` and the explicit socket. The native TUI runs its server in a worker thread of
  the same Bun process.
- Samples every 2 s from CIM cumulative counters. CPU is delta CPU seconds per wall second x 100
  (100% = one core, all threads). Private memory is MiB. Bun's write counter mixes DB, logs, and
  pipes; OpenConsole's write counter is the proxy for terminal bytes.
- Source runs, not the compiled exe: compare before and after on the same setup only.

## Isolation and cleanup

- The project is a git repo under `outsideProfile` (`C:\ocTestTmp`). Home, `OPENCODE_DB`, XDG
  dirs, Claude config, mux socket, and logs live in the run directory, and the pane gets them
  through the WezTerm config's `set_environment_variables` (Windows overlays `HKCU\Environment`).
  Every metric ends with `expectIsolated` on the fake model's inputs.
- `processTree.ps1` anchors on the mux server's (or serve's) CIM creation time, admits descendants
  created no earlier than their parent, and rechecks each identity before stopping it. If identity
  cannot be proven it throws and leaves processes running. Never PID-only, never `taskkill /T`.
- `audit.ps1 -RunDirectory <run>...` lists recorded processes still alive with the same identity,
  for runs whose cleanup failed.
