# macOS and Claude Code speed: easy wins plan

Status: planned 2026-11-08 (v0.2.339 code). Two confirmed wins and one small optional one. Every number below
was measured on the dev Mac (Apple Silicon, Claude Code 2.1.319) on 2026-11-08 unless marked as an estimate.
Package paths are relative to `src/`.

## Summary

| # | Change | Where | Measured gain | Risk |
| --- | --- | --- | --- | --- |
| 1 | Paste reads the clipboard natively on macOS before trying `osascript` | `packages/tui/src/clipboard.ts` | Image paste ~810 ms to ~1.5 ms. Text paste skips a failing `osascript` (~40 ms or more) plus a `pbpaste` spawn | Low |
| 2 | A reused Claude process no longer plans a spawn it never uses | `packages/opencode/src/provider/claude-code/turnStream.ts`, `spawnPlanning.ts` | Every reused turn (all turns after a chat's first) skips 2 localhost API calls (full tool registry with JSON schemas, skills) and synchronous MCP config and skill folder reads before the message is sent. Not measured yet: measure as described in step 2 | Low |
| 3 (optional) | Start the MCP status call before resolving the turn context | `claudeCodeLanguageModel.ts` | One localhost round trip per turn (estimate 1-5 ms) | Very low |

Do 1 and 2. Do 3 only if step 2's timing shows the pre-send path is still worth trimming.

## 1. Native clipboard read on macOS

### Evidence

- `read()` in `packages/tui/src/clipboard.ts` runs an `osascript` script (`the clipboard as "PNGf"`, written to a temp file)
  first on darwin on every paste, then falls back to `clipboardy` (which spawns `pbpaste`).
- The paste key reaches this on every Cmd+V in a WezTerm oc pane (Cmd+V sends `input_paste`, see `editorPaste.ts` and
  the prompt's `prompt.paste`), so every paste pays it, text or image.
- Measured with a 749,354-byte PNG on the clipboard:
  - `osascript` script as oc runs it: 0.80 / 0.82 / 0.84 s.
  - `createHostClipboard().read({ preferredTypes: ["image/png", "text/plain"] })` from `@opentui/core` 0.5.14:
    7.6 ms cold, then 1.3-1.4 ms. Returned `image/png`, 749,354 bytes (same size as the `osascript` output).
  - `osascript -e 'return 1'` alone: 40 ms (the floor for the text case, before AppleScript fails the PNG coercion).
  - `pbpaste`: 10 ms.
- Windows already uses this reader first (`readHost`, "Native read first: it is near-instant").

### Change

In `read()`:

- Run the native read first on darwin too: change the `if (os === "win32")` guard around
  `(options.host ?? readHost)()` to `os === "win32" || os === "darwin"` and move that block above the darwin
  `osascript` block.
- Keep the `osascript` block as the fallback when the native read returns nothing (for example a clipboard that has
  only TIFF data: `as "PNGf"` converts it, the native reader asks for PNG and text only).
- Route the `osascript` call through `run` (`options.command ?? command`) instead of the module-level `exec`, so a
  test can see whether it ran. `command` resolves only on exit code 0, which matches today's catch-and-fall-through.

### Behavior notes

- Priority stays image first, then text, as today.
- One change: a clipboard holding TIFF plus text (for example cells copied from Numbers or Excel) pastes as text
  instead of an image converted by `osascript`. Text is what the user expects there; mention it in the build notes.
- A Finder file copy (file URL plus icon TIFF) pasted the icon as an image before. Check what the native reader returns
  and write the result in the build notes; do not add file-drop handling in this change.

### Checks

- `packages/tui/test/clipboard.test.ts`: add a darwin pair mirroring the Windows ones:
  - "skips osascript when the native macOS clipboard has content" (`os: "darwin"`, `host` returns text, `command`
    records a call and must not run).
  - "falls back to osascript when the native macOS clipboard is empty" (`host` returns undefined, `command` writes the
    PNG bytes to the path named in the script, result is `image/png`). Read the path from the args rather than
    duplicating the path logic.
- `bun test test/clipboard.test.ts` and `bun run typecheck` in `packages/tui`.
- Live check: needs a build. Ask the user to `/revive` and paste an image and some text in the main prompt and in a
  dialog field.

## 2. No spawn plan for a reused Claude process

### Evidence

- `TurnStream.setup()` (`turnStream.ts`, about line 350) runs
  `this.cliArgs = (await this.planSpawnFor(this.activeProcess)).cliArgs` on every turn that reuses a live `claude`
  process, before the user message is written to stdin.
- `planSpawn` with `reusing: true` still runs `assembleProxyTools` and `fetchOpencodeSkills` in parallel:
  - `loadLiveToolInfo` -> `fetchOpencodeToolList` -> `GET /experimental/tool`, which builds the whole tool registry
    and a JSON schema per tool (`server/routes/instance/httpapi/handlers/experimental.ts`), whenever `task`,
    `question`, or `proxyOpencodeTools` is configured (they are in oc's default setup).
  - `GET /skill`.
  - `effectiveMcpConfig` (synchronous reads of MCP config files, walking up for `.git`). `retireStaleProcess` already
    computes the same thing once for the hot-reload check.
  - `ensureSkillPlugin` (`readdirSync` of the account's skills folder; a rebuild when the skill set changed).
- The only reader of the result is `respawnSilentProcess` (start watchdog), which passes `this.cliArgs` to
  `respawnActiveProcess`, and that uses `old.cliArgs ?? cliArgs`. `spawnClaudeProcess` always sets
  `ap.cliArgs = [...cliArgs]`, so the planned args are never used. The comment on `planSpawn` ("Computed every turn,
  even when a live process is reused, because the start watchdog respawns with `cliArgs`") is out of date.
- The comment in `assembleProxyTools` already states the intent: "Spawn-time only; a reused process keeps its defs."

### Change

- `setup()`: both branches take the process's own args: `this.cliArgs = this.activeProcess.cliArgs ?? []` for the reused
  process, the same line the fresh branch already has. Drop the `planSpawnFor(this.activeProcess)` call.
- `planSpawn`: remove the `reusing` input and the `input.reusing ? undefined :` branch in `systemPrompt`; every caller
  now plans a real spawn. `planSpawnFor` loses its parameter (only `spawnFresh` calls it) or is inlined into
  `spawnFresh`. `switchAccount` passes `reusing: false` today; drop that field.
- Update the `planSpawn` doc comment.

### One side effect to settle first

`ensureSkillPlugin` rebuilds the plugin folder in place (fixed path `<data>/claude-code/skillPlugin`). Today a reused
turn rebuilds it when oc's skill set changed, so a live CLI that rescans plugin skills could see a new skill without a
respawn. Find out whether Claude Code does that before deciding:

- Fake-model scenario (free, `TestLLMServer`): start a chat, add an oc skill, send a second turn, and read the `skills`
  (or `slash_commands`) list in the second turn's `system`/`init` line.
- If the second init lists the new skill on the current code, keep that behavior with a fire-and-forget refresh after
  the envelope write (`void fetchOpencodeSkills(cwd).then((skills) => skills && ensureSkillPlugin(...))`), off the
  critical path. If it does not, drop the refresh: the next spawn rebuilds the folder anyway.

### Measure (before and after, same setup)

- In a fake-model scenario with two turns in one chat, time from `doStream starting` to `sent user message` on the
  second turn (provider log; `OPENCODE_CLAUDE_CODE_LOG_LEVEL=debug`, `OPENCODE_CLAUDE_CODE_LOG_DIR` in the run's temp
  dir). Report the before and after numbers in the build notes. Do not claim a gain without them.

### Checks

- `packages/opencode`: `bun run typecheck`; `bun test test/provider/claude-code/` (from PowerShell on Windows, or on the
  Mac compare against the known Mac failures in `docs/dev/macos.md` and the AGENTS.md list).
- Watchdog path still covered: find the existing start-watchdog respawn test (`grep -rn "start watchdog"` in
  `test/provider/claude-code`) and confirm it passes; it now proves the respawn uses the process's own args.
- Add one assertion where a two-turn reuse is already exercised (for example `fakeModel.test.ts`): the second turn
  makes no `/experimental/tool` request. If the scenario cannot see server routes, assert through the provider log
  line instead of adding a mock.

## 3. Optional: start the MCP status call earlier

`streamForHost` awaits `resolveTurnContext` (which calls `GET /session/{id}`) and `syncClaudeSession` before it starts
`getRuntimeMcpStatus()` and `detectCliVersion()`. Neither depends on the turn. Start both at the top of
`streamForHost` and await them where they are awaited now. A compaction turn ignores the status result, and title and
idle short-circuit turns would make one wasted local call. Gain is one localhost round trip; take it only if step 2's
measurement shows the pre-send path still matters.

## Measured and rejected (do not redo)

- `claude --version`: 10 ms (native installer binary). Caching or prewarming the version probe gains nothing on Mac.
- Keychain read for Claude usage (`security find-generic-password`): 10 ms, background only.
- `lsof` port-owner lookup (`resident.ts`): 40 ms, only at resident start/stop.
- Snapshot `git` per turn: about 60 ms in this repo (`tracking` log lines). `core.fsmonitor` stays off on purpose
  (`git/index.ts`, `snapshot/index.ts`, `worktree/index.ts` stops its daemon); do not turn it on.
- Bare Claude CLI cold start to the `init` line: about 185 ms (isolated config, dead API endpoint). Hiding it would need
  a speculative spawn before the user sends (the args depend on the turn's tools, model, and agent). Not an easy win;
  record it in `FORK.md` as a later idea only if the user asks.
- The perf probes in `packages/opencode/test/perf` are Windows-only (CIM). Mac timing uses logs and fake-model runs.

## Process

- No build or install by the agent. Typecheck and tests as above; live checks need the user's `/revive`.
- At the end: one `bumpVersion.ps1` run, one `build-notes` entry covering both changes with the measured numbers, and
  a wiki note only if paste behavior visibly changes (the TIFF-plus-text case).
- Commit subject when the user asks to push: both changes are `perf.`, and two segments may not share a label, so use
  one segment: `[perf. > Mac paste, Claude turn start]`.
