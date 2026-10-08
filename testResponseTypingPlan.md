# Fix automatic-rename test response typing

Status: implemented in v0.2.128. Both edited scenarios passed (2 tests, 16
assertions). Package typecheck awaits a user-requested check or pre-push run
under the project's only-edited-checks rule. Implementation details below are
retained for reference.

## Goal

Resolve the seven TS18048/TS2532 errors blocking pre-push checks while preserving
the existing automatic-rename tests and their HTTP failure behavior.

## Diagnosis

Both affected tests create an SDK client with `throwOnError: true`, then access
response `.data` as though its type carries that setting. It does not.

The generated SDK methods each declare their own
`ThrowOnError extends boolean = false` parameter. They infer it from the second
request-options argument, independently of client configuration. For example,
`Session.list` and `Session.create` in
`src/packages/sdk/js/src/v2/gen/sdk.gen.ts:3510-3599` forward those options to
the HTTP client. `RequestResult` in
`src/packages/sdk/js/src/v2/gen/client/types.gen.ts:90-123` makes `data` required
only when that request's `ThrowOnError` is `true`.

Client-wide configuration already makes these requests throw at runtime. The
test calls simply do not communicate that guarantee to the method types.

## Chosen fix

Pass `{ throwOnError: true }` as the second argument on the affected SDK calls.
This uses the existing API, aligns compile-time and runtime behavior, and adds
no helpers, dependencies, extra requests, or SDK changes.

```ts
const sessions = (yield* Effect.promise(() =>
  sdk.session.list(undefined, { throwOnError: true }),
)).data

const result = yield* Effect.promise(() =>
  sdk.session.get({ sessionID }, { throwOnError: true }),
)
```

Keep client-level `throwOnError: true`: other calls in the scenario still rely
on it. Do not add `!`, casts, optional chaining, or empty-array defaults to
silence these errors. Missing data must not quietly become a passing assertion
or a polling timeout when an HTTP request has actually failed.

## Implementation

### 1. Claude automatic-rename scenario

File: `src/packages/opencode/test/provider/claude-code/fake-model.test.ts`

Only edit the first scenario,
`oc automatic rename uses a separate model alongside the first Claude turn and survives restart`.

Add request-level options to these five calls:

- `sdk.session.create(...)`: response used for `session.data.id` at line 37.
- First real `sdk.session.prompt(...)`: response used for `first.data.parts`
  at line 54. The synthetic initialization prompt needs no typing change.
- Immediate `sdk.session.get({ sessionID })`: title assertion at line 55.
- Polled `sdk.session.get({ sessionID })`: title predicate at line 58.
- `sdk.session.messages({ sessionID })`: filtering at line 65.

Preserve the deferred rename response, finalizer, polling deadline, isolated
environment, restart, assertions, and model-call counts exactly as they are.
The polled request should return `undefined` only while a valid session still
has its old title; request failures should throw immediately.

### 2. Bootstrap scenario

File: `src/packages/opencode/test/session/autoRenameBootstrap.test.ts`

Change `sdk.session.list()` to
`sdk.session.list(undefined, { throwOnError: true })` at line 24. This resolves
both `.find(...)` diagnostics at lines 26 and 29.

### 3. Verification

Run from `src/packages/opencode`, using the harness background mechanism if
available for long-running checks:

```powershell
bun test test/session/autoRenameBootstrap.test.ts
bun test test/provider/claude-code/fake-model.test.ts --test-name-pattern "oc automatic rename uses a separate model alongside the first Claude turn and survives restart"
```

These execute only the edited scenarios. Reuse their existing real CLI and
fake-model fixtures; do not add duplicate tests or run real models. Confirm
the Claude scenario actually ran: a missing CLI causes a skip, which must be
reported as unavailable runtime verification rather than a pass.

The user has requested resolution of the pre-push typecheck blocker. Verify
that package's existing `bun run typecheck` after the edits; if project rules
require approval for this unedited check, obtain it or leave the exact command
for the user. Do not claim the blocker is cleared without typecheck evidence.
No build or install is needed. Stop and report if a check still fails after
two fix attempts.

### 4. Handoff

- Inspect the diff; expected implementation scope is six request-option
  additions across two test files.
- Preserve all unrelated work, including the uncommitted native time tool.
- Record completion through `build-notes` and bump the revision once for the
  implementing session, reading `src/.version/version` immediately beforehand.
- Do not modify `buildNotes.txt` or retry the push unless the user invokes
  `agent-push` again. Its current draft claims pre-push checks passed, but the
  previous run failed; a future push must prepare a fresh truthful message.

## Acceptance criteria

- All seven recorded diagnostics disappear without altering generated SDK code.
- Both edited scenarios retain their original behavior and assertions.
- HTTP failures remain immediate failures, including inside rename polling.
- No new abstraction, fallback, non-null assertion, dependency, or production
  behavior change is introduced.
- Targeted execution and typecheck results are reported accurately, including
  skips or unavailable verification.

## Scope boundary

This plan fixes the seven automatic-rename test typing errors. The native time
tool's missing dedicated Claude fake-model scenario is separate work and is
not needed to correct this type-inference issue.
