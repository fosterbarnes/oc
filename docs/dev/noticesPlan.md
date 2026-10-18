# Plan: provider-neutral notices

Status: implemented in v0.2.233 (2026-10-18). Live check pending (see Checks). The desktop
notification and sound parts need `attention.enabled: true` in `tui.json` (default off).

## Problem

A toast "proxy call still waiting, no deadline" looked like a failure. It was a Claude Code bridge
log line that the plugin logger turns into a toast. v0.2.233 reworded it and added the **Notices**
list, but the result is still Claude-only behavior inside a multi-provider app:

- Questions asked by OpenAI, Cursor, Codex and other models never get a "still waiting" reminder.
  Claude questions do, only because the proxy broker happens to watch its open calls.
- Every Claude plugin `log.warn`/`log.error` (about 70 call sites) becomes a toast
  (`surface()` in `src/packages/opencode/src/provider/claude-code/logger.ts`). No other provider
  toasts its internal warnings.

## Rule this plan applies

What the user sees must not depend on the provider. Each user-facing notice lives in one
shared place: oc's attention system (`src/packages/tui/src/feature-plugins/system/notifications.ts`,
which already pings "Question needs input" for every provider). Provider internals log, and they
toast only for a problem the user must act on, in plain words.

## Target behavior

| Situation | Any provider sees |
|---|---|
| Question asked | Existing: OS notification when the terminal is unfocused, plus the question sound. Unchanged. |
| Question still unanswered after 5 min | Once: info toast "Question waiting" / `"<session title>" has waited 5 min for your answer.`, shown only if you are not viewing that session. OS notification and sound only when the terminal is unfocused. |
| Claude bridge call open a long time / near its deadline | Log only. A call the deadline kills shows as a tool error in the transcript, like any provider's tool error. |
| Claude internal warning | Log only (opencode.log). |
| Claude problem the user must act on | Explicit plain-English toast at that call site. |
| Any toast | Listed in **Notices** (`/notices`). Warning/error toasts show "/notices to read again". Already shipped, keep. |

## Steps

### 1. Shared question reminder (TUI)

File: `src/packages/tui/src/feature-plugins/system/notifications.ts`.

- Replace the `questions` Set with a `Map<requestID, Timer>`. On `question.asked` (when new) arm
  `setTimeout(remind, questionReminderMs)` and `unref()` it. On `question.replied` and
  `question.rejected`, clear the timer and delete the entry.
- `remind`: delete the entry, then
  - if `api.route.current` is not `{ name: "session", params.sessionID === sessionID }`, call
    `api.ui.toast({ variant: "info", title: "Question waiting", message })`, where `message` is
    `"<title>" has waited 5 min for your answer.` (title from `api.state.session.get`; fall back
    to `A question has waited 5 min for your answer.` when the session is unknown);
  - call `api.attention.notify` with the same title/message, `notification: { when: "blurred" }`,
    `sound: { name: "question", when: "blurred" }`. A focused user gets no sound.
- Fire once per question. No repeat: the form is on screen and Notices keeps the toast.
- `const QUESTION_REMINDER_MS = 5 * 60_000` plus a test-only setter
  `_setQuestionReminderMs(ms)`, the same pattern as `_setProxyDeadlineRecheckMs` in
  `proxyDeadline.ts`.
- Known gap, accepted: a question that was already pending when the TUI started (no
  `question.asked` event) gets no reminder.

Tests: extend `src/packages/tui/test/cli/cmd/tui/notifications.test.ts` (its fixture already fakes
`attention`, `event`, `state.session`; add `ui.toast` and `route.current` to the
`createTuiPluginApi` call):
- reminder fires once after the delay with the session title, as an info toast;
- replied or rejected before the delay: no reminder;
- viewing that session: no toast, attention still called.

### 2. Claude proxy broker goes quiet

File: `src/packages/opencode/src/provider/claude-code/proxyBroker.ts`.

- Remove `toastProxyWait` and its imports (`rawOpencodeClient`, `showToast`, `formatDuration`).
- Keep both `log.notice` lines (stall heartbeat, deadline approaching) as the record. Reword the
  two comments: the heartbeat is a log record for diagnosing a wedged bridge, not a user notice.
- `test/provider/claude-code/broker.test.ts`: delete the test "a waiting question toasts as info,
  naming its session by title" and its `setOpencodeClient`/`createOpencodeClient` imports; keep
  the `/NOTICE/` assertions.

### 3. Claude logger stops toasting; warnings go to opencode.log

File: `src/packages/opencode/src/provider/claude-code/logger.ts`.

- Delete `surface()`, `_TOAST_REPEAT_MS`, `lastToastAt` (and its reset in
  `_resetLoggerForTests`), and the `showToast` import with its circular-import comment.
- In `emit`, for warn and error outside debug mode, mirror the line to oc's main log so it is
  always recorded, like every other subsystem:
  `AppRuntime.runFork(Effect.logWarning(msg, data).pipe(Effect.annotateLogs({ channel: "claude-code" })))`
  (`logError` for error). `AppRuntime` is in `src/packages/opencode/src/effect/app-runtime.ts`,
  used this way in `cli/tui/worker.ts`. Load it with a dynamic import on the first warn/error.
  A static import from `logger.ts` would make a startup cycle, because app-runtime reaches the
  provider modules that import the logger.
- `plugin.log` stays as it is (opt-in detailed Claude log).
- `test/provider/claude-code/logger.test.ts`: rewrite "mode=silent with a TUI client: warn/error
  toast once per window, not stderr" to assert that warn/error send no `/tui/show-toast` request
  and write nothing to stderr. The opencode preload points `XDG_DATA_HOME` at a temp dir, so the
  mirror cannot touch the real opencode.log. Confirm that before running.
- Keep `showToast`'s optional `title` parameter in `runtimeStatus.ts`; step 4 uses it.

Alternative if the dynamic import of app-runtime proves awkward: always write warn/error to
`plugin.log` even when `file` is off. Simpler, but it is a second log file users and agents must
know about. Prefer opencode.log.

### 4. Audit call sites that lose their toast

Go through every `log.warn`/`log.error` under `src/packages/opencode/src/provider/claude-code`
(list: `rg -n 'log\.(warn|error)\(' src/packages/opencode/src/provider/claude-code`). Default is
log only. Add an explicit `showToast(<plain sentence>, "warning" | "error", "<short title>")` only
when the user must act and nothing else already tells them (for example a thrown error that
becomes a `session.error` toast). Verify each one in code before deciding. Starting guess:

| Call site | Proposed |
|---|---|
| `agentModels.ts` unknown model / unknown effort override | Toast: agent config names a model or effort that does not exist; default used. |
| `proxyToolSelection.ts` unknown `proxyOpencodeTools`, name clash; `spawnPlanning.ts` unknown `proxyTools`, none recognised | Toast once per distinct message: config entry ignored, name it. |
| `messageBuilder.ts` remote-URL image, unsupported media type, malformed data URI | Toast: the image was not sent to Claude, and why. Check first whether the transcript already says so. |
| `turnStream.ts` errors that end a turn (`claude process still silent after respawn`, `no active process to respawn`, `failed to re-send envelope`, `failed to set up doStream`) | Log only, if the turn ends with an error part (then `session.error` already toasts). Otherwise toast. |
| `warmup/index.ts` | Log only; the warm-up palette shows its own state. Verify. |
| everything else (file I/O, parse, fetch, process lifecycle, scratch dirs) | Log only. |

`sessionSync.ts` already shows its two toasts explicitly; leave them.

### 5. Docs and notes

- Wiki `..\oc.wiki\Troubleshooting.md`: keep the Notices paragraph. Keep "Question waiting",
  reworded for all providers ("shows once, 5 minutes after a question is asked, if you are in
  another session"). Remove "Tool still running" and "Tool near time limit". Add entries for any
  toast step 4 creates.
- `FORK.md`: update the "Notices (toast history)" row: shared question reminder, Claude internals
  log to opencode.log (`channel=claude-code`), list of remaining Claude toasts.
- Version bump and `docs/buildNotes/buildNotes.md` entry per `AGENTS.md`.

## Checks

- `bun test test/cli/cmd/tui/notifications.test.ts` from `src/packages/tui`.
- `bun test test/provider/claude-code/broker.test.ts test/provider/claude-code/logger.test.ts`
  from `src/packages/opencode`.
- `bun run typecheck` in `src/packages/tui` and `src/packages/opencode`.
- User live check after their rebuild:
  1. In an OpenAI or Cursor session, have the model ask a question. Switch to another session
     and wait 5 min. One "Question waiting" toast names the session.
  2. Repeat with a Claude Code model. Same single toast, no "Tool still running" or
     "proxy call still waiting" toast.
  3. `/notices` lists the toast.
  4. Claude warn/error lines now appear in `opencode.log` with `channel=claude-code`. The stall
     heartbeat stays a NOTICE in `plugin.log` only.

## Out of scope

- A shared "subagent has been silent for N minutes" detector for all providers. It would
  replace what the Claude stall heartbeat tried to do for `task`. Worth a separate plan if
  stuck subagents recur.
- Rewriting Cursor/Codex provider logging.
