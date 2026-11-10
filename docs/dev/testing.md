# Testing: known failures, fake-model, pane, and perf checks

Read before running or writing provider, pane, or perf tests, and before judging a test failure.
The general rules (no mocks, run from package dirs, probes) are in `AGENTS.md` "Testing".

- Known failures. Compare against this list; do not re-prove these with `git stash`, reverts, or baseline copies. Remove an entry when you fix it; add one only after a confirming run. On 2026-10-27 (v0.2.319) every suite passed: opencode 5087, tui 792, schema 15, all other packages, `.scripts/tests`, `test:httpapi` (227 x3 modes), and typecheck. Only the pane entries below remain, not rerun since.
  - opencode `OC_TUI_PANE=1` `test/provider/claude-code/tuiPane.test.ts` "an API error the CLI reports twice shows once" (`FAKE-BAD-REQUEST-81` never shows; the next reply lands instead) and "claude warm-up palette opens the schedule dialog" (`Times` never appears). Failed 3 of 3 runs on 2026-10-24, v0.2.303. The `fakeModel.test.ts` twin was the CLI's tool-search fallback retrying the scripted 400 (fixed there with `ENABLE_TOOL_SEARCH: "false"`); likely the same cause here.
  - Flaky: same file, "rewinding Claude shows the provider notice in the transcript" (failed 1 of 3 runs on 2026-10-24).
  - Flaky: opencode `test/provider/claude-code/steering.test.ts` (failed 2 of 6 runs in archive11; also flakes in one `bun test` call with `fakeModel.test.ts`). Passed in the 2026-10-27 full run.
  - macOS: opencode `test/provider/claude-code/fakeModel.test.ts` "claudeTestFlow steps 1-2" (expects `/var/folders/...` as the working directory; the CLI reports `/private/var/folders/...`), "claudeTestFlow step 4" (4 requests instead of 3), and "an API error the CLI reports twice shows once" (`FAKE-BAD-REQUEST-81` never shows). All 3 fail on clean `main` too (2026-11-08, v0.2.338, Claude Code 2.1.319). The last one is probably the CLI retrying a failed streaming request without streaming, so the retry uses up the next queued reply (the model-access scenario queues its 404 twice for this reason).
  - macOS: opencode `test/provider/claude-code/steering.test.ts` (6 of its tests, from "a steer reaches the running turn at its next tool boundary" to "failed receipt save stops the turn ...") and `commandPermissions.test.ts` "command turns proxy files, reject native and execution bypasses, then restore native tools". Fail run alone and in the folder run, on unchanged provider code too (2026-11-08, v0.2.340, Claude Code 2.1.319). Not investigated.
  - Shell-dependent: same file, "cancel retires written unread input after visible content" fails nearly every run when `bun test` starts from the Claude Code Bash tool (Git Bash), on v0.2.327 code too ("abort signal received mid-turn" missing); passes 3 of 3 from PowerShell (2026-11-02, v0.2.329). Run this file from PowerShell; do not bisect a failure seen only from Bash.
- Fake-model scenarios: agents may run, on their own, `bun test` files that drive oc or the Claude Code CLI against `TestLLMServer` (`test/lib/llm-server.ts`, including its Anthropic `/v1/messages` endpoint) with isolated temp data (`XDG_*`, `CLAUDE_CONFIG_DIR`). No build, no install, no real tokens. Example: `test/provider/claude-code/fakeModel.test.ts`. Fake-model and pane tests are free: `claudeEnv` points `ANTHROPIC_BASE_URL` at `TestLLMServer`. Real-model runs (`.scripts\claudeRealFlow.ps1`, which sets `OC_REAL_MODEL=1` for `realModel.test.ts`) spend the user's Claude plan usage. Agents never run that script or set `OC_REAL_MODEL`, by any route (including `Start-Process -UseNewEnvironment`), unless the user asks for that run in the current turn. The script asks the user to type yes before spending. Agents never read or print the saved token (`%LOCALAPPDATA%\oc\claudeFlowToken`).
- Windows temp dirs sit under the real profile, so parent-folder lookups leak `C:\Users\<user>\.claude\CLAUDE.md`, `AGENTS.md`, and `~/.agents/skills` into fake-model runs. Reuse `test/provider/claude-code/chatFixture.ts`: `claudeEnv` (`CLAUDE_CODE_DISABLE_CLAUDE_MDS`), `initRepo` on a project subfolder (not the fixture home: its bun cache makes git snapshots slow), `outsideProfile` (`C:\ocTestTmp`), and `expectIsolated`.
- TUI pane checks (`test/provider/claude-code/tuiPane.test.ts`) are opt-in with `OC_TUI_PANE=1` and agents may run them. They use a test-owned headless `wezterm-mux-server` with its own config and socket; every `wezterm cli` call needs `--no-auto-start` and that explicit socket (an inherited stale `WEZTERM_UNIX_SOCKET` auto-spawns a stray server). The pane runs `bun run --cwd packages/opencode src/index.ts <project>` (bunfig preload), 160 columns (sidebar hides at <=120). Esc interrupts only on a second press within 5s. Never spawn oc without overriding `OPENCODE_DB`: the user's shell may point it at the real DB (source runs without it default to `oc-local.db` in the real data dir). On Windows WezTerm overlays the registry's `HKCU\Environment` (which may set `OPENCODE_DB`) on every pane's env, so isolation vars go in the test config's `set_environment_variables`, not only the server env.
- Performance probes (`packages/opencode/test/perf`) are opt-in with `OC_PERF_PROBE=1` and agents may run them: `pwsh -NoProfile -File src\packages\opencode\test\perf\run.ps1 <M1-M6|P1-P9|cleanup>`. Same pane, isolation, and identity-cleanup rules; runs land in `C:\ocTestTmp\ocPerfRuns`. Compare before/after only from runs on the same setup; see its `README.md`.
- Spawned oc and `claude` children get `hostEnv()` (`test/lib/cli-process.ts`), which drops inherited `CLAUDE*`/`ANTHROPIC*` vars: run from a Claude Code session they change what the CLI sends (desktop entrypoint adds a background status request).
- Pane cleanup may stop only processes the test started: anchor on the mux server's CIM creation time recorded at spawn, walk descendants whose creation is no earlier than their live parent, recheck each identity before stopping, compare CIM to CIM. Never `taskkill /T` or PID-only trees (reused PIDs reached unrelated processes). If identity cannot be proven, leave processes and fail loudly.
- Every new Claude-provider feature gets a fake-model scenario, plus a pane check when it changes what the TUI shows.

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
