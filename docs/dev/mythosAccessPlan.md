# Plan: clear "no model access" note for Claude models (Mythos)

## Problem

On an account without Mythos access, a turn on Claude Mythos 5.1 ends like this:

> There's an issue with the selected model (claude-mythos-5-1). It may not exist or you may not have access to it. Run --model to pick a different model.

The reply looks like a normal answer (Build footer, no error state). It doesn't name the account, and it points at `--model`, a flag oc users never type. Mythos is invite-only (Project Glasswing). oc lists it for every Claude account on purpose (`CATALOG_TWINS` in `packages/opencode/src/provider/claude-code/models.ts`), because nothing short of sending a request can tell oc whether an account has access.

## What we checked (Claude Code 2.1.319)

- The CLI knows `claude-mythos-5-1` (its model table and `$h.MYTHOS_ID`), so the id is right.
- For an API 404 the CLI builds that text and tags the synthetic assistant message `error: "model_not_found"` (same path as `authentication_failed`, `billing_error`, ...). oc already reads that field for account blocks: `accountBlockKind` in `cliEvents.ts`, read in `turnStream.ts` `handleMessage` and `onResult`.

## Fix (one small change, same pattern as account blocks)

Treat `model_not_found` as a failed turn and add an oc note that names the account, the model, and the real way out.

1. `models.ts`: export a lookup from a Mythos id to its Fable twin, built from `CATALOG_TWINS`, e.g. `catalogTwin(id): string | undefined`. Strip `-fast` with the existing `parseModelId` first, so `claude-mythos-5-1-fast` maps to `claude-fable-5-1-fast`. No new table.
2. `cliEvents.ts`, next to the account-block section:
   - `isModelNotFound(msg)`: `msg.type === "assistant" && msg.error === "model_not_found"`.
   - `formatModelAccessNote({ account, model, twin? })` reusing `ACCOUNT_BLOCK_MARKER`:
     - twin known: `the Claude account "<account>" cannot use Claude Mythos 5.1 (access is invite-only). Pick Claude Fable 5.1, the same model with Anthropic's standard safety checks, and resend your message.`
     - otherwise: `the Claude account "<account>" cannot use <model>. Pick another model and resend your message.`
   - Use the catalog display names, without the `(N×)` suffix, when they are cheap to reach; otherwise the ids. Don't add a new lookup path just for names.
3. `turnStream.ts`:
   - In `handleMessage`, beside `this.accountBlock = ...`, set `this.modelNotFound ||= isModelNotFound(msg)`. Leave the message alone so the CLI's own text still renders, as account blocks do.
   - In `onResult`, right after the account-block block: when `this.modelNotFound && msg.is_error`, set `this.resultFailure ??= "model_not_found"`, add the note via `this.out.note(...)` (account label from `poolAccountLabel(this.account)`; model = the turn's CLI model id, the one `cliArgs`/`spawnPlanning` pass as `--model`), and `log.warn` once. `resultFailure` already turns that into an error finish (`isError`, `resultSubtype`), so the turn stops looking like a normal reply.
   - If the CLI does not set `is_error` on this result, gate on `this.modelNotFound` alone. Check this in the fake-model run (step 4) before choosing.
4. Tests:
   - `test/provider/claude-code/cliEvents.test.ts`: detection (`model_not_found` assistant yes; other errors and non-assistant no) and both note texts, including the `-fast` twin.
   - `test/provider/claude-code/fakeModel.test.ts`: script `llm.error(404, { type: "error", error: { type: "not_found_error", message: "model: claude-mythos-5-1" } })`, run a turn on `claude-mythos-5-1`, and expect the note exactly once, naming Claude Fable 5.1, with the turn finished as an error. Copy the `FAKE-BAD-REQUEST-81` scenario setup (`ENABLE_TOOL_SEARCH: "false"` so the CLI does not retry).
   - No pane check needed: the note goes through the existing `out.note` path, which the TUI already renders.
5. Docs: add a short troubleshooting entry to the wiki ("There's an issue with the selected model" means the account has no access; Mythos is invite-only; use Fable). Then version bump and a buildNotes entry per `AGENTS.md`.

## Deliberately not doing

- **Hiding Mythos or checking access ahead of time.** Access can only be confirmed by a real request, which costs plan usage. The model list is shared, not per account. Accounts that do have access must keep seeing Mythos.
- **Remembering "no access" per account and greying it out in the picker.** That adds state, a stale-data problem once access is granted, and picker UI, all for an error that costs one cheap failed turn. Revisit only if users keep hitting it.
- **Switching to Fable or to another account automatically.** That would silently change the model. The note points at the switch and the user makes it.
- **Hiding the CLI's own text.** It has already streamed, and account blocks keep it too. The oc note right below gives the correct fix.

## Done when

- The cliEvents unit tests and the fake-model scenario pass (`bun test test/provider/claude-code/cliEvents.test.ts test/provider/claude-code/fakeModel.test.ts` from `src/packages/opencode`).
- `bun run typecheck` passes in `packages/opencode`.
- Manual (user): a Mythos turn on a non-Glasswing account shows the note and an error finish, and a Fable 5.1 resend works.
