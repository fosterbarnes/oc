# Testing: known failures, fake-model, pane, and perf checks

Read before running or writing provider, pane, or perf tests, and before judging a test failure.
The general rules (no mocks, run from package dirs, probes) are in `AGENTS.md` "Testing".

- Known failures. Compare against this list; do not re-prove these with `git stash`, reverts, or baseline copies. Remove an entry when you fix it; add one only after a confirming run. On 2026-10-27 (v0.2.319) every suite passed: opencode 5087, tui 792, schema 15, all other packages, `.scripts/tests`, `test:httpapi` (227 x3 modes), and typecheck. Only the pane entries below remain, not rerun since.
  - Fixed 2026-11-17: tuiPane "claude warm-up palette opens the schedule dialog" counted Down presses past a "Time format" row the schedule dialog no longer has (selection starts on the mode row), so it landed on Save; it also reopened the palette over the open dialog, whose own "Search" box matched the wait. Pane suite 16/16 on macOS.
- On macOS, `keychainStubEnv` (`test/lib/cli-process.ts`) puts a failing `security` stub first on PATH for every `cliIt` and pane run, so nothing a test starts reaches the real Keychain or shows "Keychain Not Found"; calls are logged to `<home>/security.log`.
  - Flaky: same file, "rewinding Claude shows the provider notice in the transcript" (failed 1 of 3 runs on 2026-10-24).
  - Fixed 2026-11-17 (v0.2.376), the former macOS fakeModel/steering/warm-up entries: the cli fixture home was not realpath'd (`/var` vs `/private/var`); fake summaries lacked `<summary>` tags (CLI 2.1.322 re-asks); fake 400/404s were queued per retry (now `llm.errorEvery`); plugin.log reads raced its 100 ms flush; held steers were written in the same tick as the proxy result (product fix: `stdinFence`); spawns inherited a parent Claude Code session's env (product fix: `HOST_SESSION_ENV`).
  - Shell-dependent: `steering.test.ts`, "cancel retires written unread input after visible content" fails nearly every run when `bun test` starts from the Claude Code Bash tool (Git Bash), on v0.2.327 code too ("abort signal received mid-turn" missing); passes 3 of 3 from PowerShell (2026-11-02, v0.2.329). Run this file from PowerShell; do not bisect a failure seen only from Bash.
- Fake-model scenarios: agents may run, on their own, `bun test` files that drive oc or the Claude Code CLI against `TestLLMServer` (`test/lib/llm-server.ts`, including its Anthropic `/v1/messages` endpoint) with isolated temp data (`XDG_*`, `CLAUDE_CONFIG_DIR`). No build, no install, no real tokens. Example: `test/provider/claude-code/fakeModel.test.ts`. Fake-model and pane tests are free: `claudeEnv` points `ANTHROPIC_BASE_URL` at `TestLLMServer`. Real-model runs (`.scripts\claudeRealFlow.ps1`, which sets `OC_REAL_MODEL=1` for `realModel.test.ts`) spend the user's Claude plan usage. Agents never run that script or set `OC_REAL_MODEL`, by any route (including `Start-Process -UseNewEnvironment`), unless the user asks for that run in the current turn. The script asks the user to type yes before spending. Agents never read or print the saved token (`%LOCALAPPDATA%\oc\claudeFlowToken`).
- Windows temp dirs sit under the real profile, so parent-folder lookups leak `C:\Users\<user>\.claude\CLAUDE.md`, `AGENTS.md`, and `~/.agents/skills` into fake-model runs. Reuse `test/provider/claude-code/chatFixture.ts`: `claudeEnv` (`CLAUDE_CODE_DISABLE_CLAUDE_MDS`), `initRepo` on a project subfolder (not the fixture home: its bun cache makes git snapshots slow), `outsideProfile` (`C:\ocTestTmp`), and `expectIsolated`.
- TUI pane checks (`test/provider/claude-code/tuiPane.test.ts`) are opt-in with `OC_TUI_PANE=1` and agents may run them. They use a test-owned headless `wezterm-mux-server` with its own config and socket; every `wezterm cli` call needs `--no-auto-start` and that explicit socket (an inherited stale `WEZTERM_UNIX_SOCKET` auto-spawns a stray server). The pane runs `bun run --cwd packages/opencode src/index.ts <project>` (bunfig preload), 160 columns (sidebar hides at <=120). Esc interrupts only on a second press within 5s. Never spawn oc without overriding `OPENCODE_DB`: the user's shell may point it at the real DB (source runs without it default to `oc-local.db` in the real data dir). On Windows WezTerm overlays the registry's `HKCU\Environment` (which may set `OPENCODE_DB`) on every pane's env, so isolation vars go in the test config's `set_environment_variables`, not only the server env.
- Performance probes (`packages/opencode/test/perf`) are opt-in with `OC_PERF_PROBE=1`, Windows only, and agents may run them: `pwsh -NoProfile -File src\packages\opencode\test\perf\run.ps1 <all|M1-M6|P1-P11|cleanup>` (no P5; P11 spends real model usage). Same pane, isolation, and identity-cleanup rules; runs land in `C:\ocTestTmp\ocPerfRuns`. Compare before/after only from runs on the same setup; see its `README.md`.
- Spawned oc and `claude` children get `hostEnv()` (`test/lib/cli-process.ts`), which drops inherited `CLAUDE*`/`ANTHROPIC*` vars: run from a Claude Code session they change what the CLI sends (desktop entrypoint adds a background status request).
- Pane cleanup may stop only processes the test started: anchor on the mux server's CIM creation time recorded at spawn, walk descendants whose creation is no earlier than their live parent, recheck each identity before stopping, compare CIM to CIM. Never `taskkill /T` or PID-only trees (reused PIDs reached unrelated processes). If identity cannot be proven, leave processes and fail loudly.
- Every new Claude-provider feature gets a fake-model scenario, plus a pane check when it changes what the TUI shows.

## Known Mac test failures (record once; report only new ones)

- 2026-11-17: `test/config/tui.test.ts` "resolves keybind lookup from canonical keybinds" expects
  `ctrl+shift+h` for `session.new`; the macOS preset returns `super+shift+h`. Stale platform-specific
  expectation (intended keybind change), confirmed in `bun test test/config test/commandPermissions.test.ts
  test/commandPermissionsFlow.test.ts`: 328 pass, 16 skip, 1 fail.

Baseline 2026-11-08, before the macOS changes, core suite: 4 fail / 1048 pass.
- `detachedCommand ps1 > keeps caller text off the cmd command line`, `... drops cmd-active characters`:
  Windows-only behavior tested on every OS.
- `pty > does not duplicate replay when data arrives before activate`, `pty > does not deliver stale output
  after detach`: also fail on Linux (seen in Ubuntu runs, not verified locally).

opencode suite on clean HEAD f822a27 (2026-11-08): 24 fail / 5035 pass. After the macOS changes: no new
failures. The revive and startup tests that assume Windows paths now skip off Windows. Still failing on Mac
at HEAD and after (pre-existing, not investigated):
- Claude warm-up: `global HttpApi > returns warm-up state ...`, `... persists warm-up schedules ...`, six
  `tick: ...` tests, `sender recheck: ...`, `cli gate: 2.1.293 floor ...`.
- `cancel interrupts loop queued behind shell`.
- `describeSpawnCwd reports which branch ...`, `describeSpawnCwd never disagrees ...` (also Linux).
- `session bootstrap > creates a session without model
  execution`, `opencode agent validate > multiple-invalid ...`, `agentUrl: invalidateAgentUrl > memoized
  resolve ...`.
