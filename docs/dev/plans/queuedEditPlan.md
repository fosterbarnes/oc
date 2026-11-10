# Plan: Edit/Delete on a QUEUED message fails with "Session is busy"

## Symptom

Claude Code session, turn running. Operator sends a message, it shows `QUEUED`. Click it, choose
Edit (or Delete). Toast: `Not deleted, the model already has this message: Session is busy: ses_...`.
The message stays queued; the prompt is not filled.

## Root cause

A message sent mid-turn is a "steer" (`provider/claude-code/steering.ts`). It passes through three
states, but the TUI shows only two:

| State | Where it is | Retractable | TUI badge |
| --- | --- | --- | --- |
| held | `Steering.held` in oc | yes | QUEUED |
| written | Claude CLI stdin, unread | no (cannot un-write a pipe) | QUEUED |
| read | Claude has it (`steered` metadata) | no | SENT |

`Steering.admit` (`steering.ts:86`) holds a steer only while oc runs a proxied tool
(`host.busy()` = `inStreamCalls > 0`, `turnStream.ts:303`). Otherwise it calls `flush()` at once,
which writes it to stdin and adds it to `writtenIds`. The CLI only reads stdin messages at its next
tool boundary, so the message sits unread (QUEUED) for the whole time Claude thinks or runs a
CLI-native tool (Bash, Read, ...). That is the common case, and the one in the screenshot.

Delete path: `deleteMessage` (`server/.../handlers/session.ts:499`) -> session busy ->
`unsendable` -> `sink.retract` -> `writtenIds.has(id)` -> `false` -> `BusyError`. The TUI
(`tui/src/routes/session/dialog-message.tsx:30`) offers Edit/Delete for every unsteered message after
the pending one (`routes/session/index.tsx:1587`), so it promises an action the server refuses for
the "written" state.

## Fix: hold every steer until the next tool boundary

Make "held" the default instead of the exception. Claude cannot read a steer before its next tool
boundary anyway, so writing it earlier buys nothing except a stuck, unretractable message.

1. `steering.ts` `admit`: always push to `held`; drop the `if (!this.host.busy()) this.flush()`.
   Update the `admit` doc comment and the class header (held until a tool boundary, not only during
   proxied tools).
2. `turnStream.ts` `completeToolUse` (`:1136`): after the proxy early return (`:1151-1156`), call
   `this.steering.flush()` for a main-thread CLI-run tool, so the steer is in stdin while the CLI
   runs that tool and gets read at its result. Skip it for subagent tool uses (check how the caller
   at `:986` and `onAssistant` `:1124` pass `parent_tool_use_id`; the CLI drains stdin only at the
   main loop's boundaries). Proxied tools keep their existing flush before the result
   (`:1586`), which is why the flush must come after the proxy return: flushing at a proxied
   `tool_use` would throw away the long retract window a subagent batch gives today.
3. Existing flush points stay: proxied tool result (`:1586`, `:1590`) and `completeResult`
   (`:1336`, end of turn: the CLI runs the steer as its next turn and this step keeps streaming).

Race, already handled: a very fast native tool (ms) can finish before the write lands. The CLI then
reads the steer at the following boundary or runs it as the next turn after `result`;
`completeResult` sees `hasUnread` and keeps streaming. Delivery is never lost, only possibly one
boundary later.

Check interrupt/stop paths with held steers: `retire` only fires on `hasUnread` (written steers);
held steers are still unanswered user messages in the DB, so oc's loop runs them after the turn,
exactly as proxied-held steers do today. Confirm `clear()` (`:587`, account switch) still covers
them.

## Fix: honest toast for the remaining refusal

The window between a `tool_use` and Claude reading the steer still refuses. Replace the toast in
`dialog-message.tsx:36` so it does not dump `Session is busy: ses_...`: for the busy refusal show
`Too late to take back: Claude is reading this message`; any other error keeps
`errorMessage(result.error)`. Detect busy from the declared busy API error the handler maps through
`SessionError.mapBusy` (`handlers/session-errors.ts`), not from string matching. No TUI state
change for the badge: QUEUED now really means retractable almost all of the time.

## Verification

- Extend `test/provider/claude-code/steering.test.ts` (17 existing held/retract cases): a steer
  admitted while not busy stays held (no stdin write), is retractable, and is written on the next
  CLI-run `tool_use`; a steer at a proxied `tool_use` stays held until that tool's result. This
  guards the bug, so it meets the keep bar.
- Run `bun test test/provider/claude-code/steering.test.ts` and `fakeModel.test.ts` from
  `src/packages/opencode`. Compare failures with `docs/dev/testing.md`.
- Optional pane probe (`tuiPane.test.ts` already reaches "take back and put in the prompt"): send
  a message during a fake turn that is thinking, choose Edit, expect the prompt filled and the
  message gone.
- Live check needs a real Claude turn: user sends a message during a long Bash call, clicks Edit.

## Out of scope / open question

Non-Claude providers have no steer sink, so `unsendable` always returns false and Edit/Delete on a
QUEUED message always fails while busy. The TUI still offers both. Either hide them when the session
model is not Claude Code, or make native-loop deletion safe (the loop reads queued user messages at
each step start). Decide before touching it.
