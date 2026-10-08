# Automatically rename new oc sessions after the first prompt

Status: ready for implementation. Planning only; no runtime changes made.

## Goal

New sessions opened through `oc` should automatically use the same rename agent,
model selection, fallback chain, title cleanup, and folder-prefix format as `/rename`.
Start naming after the first real prompt is saved, alongside the assistant reply.
Do not wait for the reply to finish or send a second conversation prompt.

Interpretation: this applies to new oc project sessions, New oc session from the
palette, and sessions created from Home in an oc-launched TUI. Reopening an existing
session does not itself trigger naming. Include `oc stable` because it is also an
oc session launcher. A shell-only submission is not the first model prompt.

## Findings

All source paths below are relative to `C:\Users\user\Documents\GitHub\oc`.

- `src/packages/opencode/src/cli/cmd/oc.ts:69-90`: `bootstrapSession` creates a
  numbered project title, then persists a synthetic `noReply` initialization message.
- `src/packages/opencode/src/cli/cmd/oc.ts:188-194`: a targeted launch bootstraps a
  session; bare oc attaches without creating one.
- `src/packages/opencode/src/cli/cmd/session.ts:75-109`: the separate bootstrap CLI
  does the same initialization. The New oc session palette uses this path through
  `src/packages/tui/src/app.tsx:295-303,1299-1301`.
- `src/packages/tui/src/component/prompt/index.tsx:1093-1127`: Home creates its
  session before submitting a normal prompt, command, or shell request.
- `src/packages/opencode/src/session/prompt.ts:210-225`: normal title generation
  skips non-default titles. Therefore the numbered oc project title is never replaced.
- `src/packages/opencode/src/session/prompt.ts:269-331`: the internal `rename`
  effect already implements the requested behavior. Its public wrapper at line 1654
  registers work with `SessionWork`; reuse the internal effect from the running loop.
- `src/packages/opencode/src/session/prompt.ts:1214-1221`: the existing first-step
  title hook already forks naming into the service scope without delaying generation.
- `src/packages/opencode/src/session/run-state.ts:91-97,148-170`: the existing
  runner and cross-process lock own each session loop. Claim the automatic attempt
  inside that loop, before starting the background rename.
- `src/packages/opencode/src/session/session.ts:227,268-279,823-825`: session
  metadata already exists, is accepted at creation, and has a setter.
  `src/packages/sdk/js/src/v2/gen/types.gen.ts:10309-10324` confirms the SDK supports it.
- `src/packages/opencode/src/session/session.ts:719-759`: forks copy metadata and
  messages. A pending automatic rename must not transfer to a fork.
- `src/packages/tui/src/routes/session/index.tsx:594-616`: `/rename` calls the rename
  endpoint. Its progress/success toasts belong to the explicit action.

## Chosen design

Use existing session metadata to opt new oc sessions into a one-time automatic
rename. Reuse the existing server-side title hook and internal rename implementation.
No migration, public API change, new dependency, or client-side naming request.

### Metadata

Reserve one namespaced key:

```ts
metadata: { ocAutoRename: { state: "pending", title } }
```

`title` is the exact numbered placeholder when bootstrap supplies one. For Home,
omit it: the session receives its normal default title, and the claim requires
`Session.isDefaultTitle(current.title)` instead.

After claiming, preserve other metadata and change only this record's `state` to
`"attempted"`. This is persistent one-time state, including when generation fails
or the server shuts down. Do not retry automatically on later prompts or restart;
the existing `/rename` remains the explicit retry.

Validate this small metadata record before reading it. Do not infer oc origin from
a folder-name regex, initialization text, the resident server, or provider identity.

### Creation paths

1. Resident `bootstrapSession`: include the pending record in `session.create`,
   storing the numbered placeholder as `title`.
2. `SessionBootstrapCommand`: include the same record only when `--title` was not
   explicitly supplied. An explicitly supplied title is user intent.
3. In `oc.ts`, pass `OC_AUTO_RENAME=1` to the attached TUI and the standalone stable
   TUI. This is a client-origin hint only; do not set it on the shared resident server.
4. In the Home session creation request, include pending metadata when that hint
   is present. This covers normal prompts, slash-command prompts, Ctrl+Enter, and
   new sessions opened later in that TUI without adding another HTTP request.
5. In `Session.fork`, remove only `ocAutoRename` from the cloned metadata.
   Preserve all other metadata. Existing sessions opened with `oc previous` are
   not marked retroactively; new sessions created in that oc TUI are eligible.

### Server hook

At `runLoop`'s existing `step === 1` naming hook:

1. Re-read the current session instead of relying on the loop's initial snapshot.
2. For an oc-marked session, take the automatic branch before native title generation
   and before `shouldSkipRemoteTitleGeneration`. The rename model is selected
   independently of the conversation provider.
3. Require a root session, pending metadata, and exactly one real user message.
   Reuse the current real-user predicate. Synthetic initialization and revive
   messages must not count. Command-generated prompts should count as they do today.
4. Require the placeholder title to still match, or a default title for Home.
   If the user has changed it, consume the pending record and make no model request.
5. Persist `state: "attempted"` inside the owning loop before forking any network work.
   This prevents a slow naming request, reconnect, rerun, or interruption from
   starting another automatic attempt. Do not introduce another lock or in-memory set.
6. Fork the internal rename effect into the existing service scope. Register it with
   the existing `work.run` boundary inside the fork so shutdown accounts for it.
   Catch/log automatic rename failure locally without turning the conversation
   into an error. Keep interruption semantics and the current fallback chain intact.
7. For oc-marked sessions, never also run the native title generator, including on
   later turns after the attempt has been consumed. Unmarked sessions keep the
   existing title behavior.

Consume pending state before the background fork, not inside `ensureTitle` after
it has already been forked. The current runner lock is the one-time claim boundary.

### Reuse rename, preserve user edits

Add a private optional argument to the internal `rename` effect for automatic use:
an expected title and the first-prompt history snapshot. Keep the public service
signature and manual `/rename` behavior unchanged.

- Automatic naming uses the captured first-prompt history, so a fast second prompt
  or assistant response does not change what is being named.
- Derive the rename request's user/model from that snapshot; retain the configured
  rename agent, its variant, and existing fallback chain.
- Immediately before saving a generated automatic title, re-read the session and
  require its title to equal the captured expected title. If it changed while the
  model was running, return without saving. Manual `/rename` remains unconditional.
- Use existing `sessions.setTitle` and its event path. Do not write SessionTable
  directly, since that would bypass normal projection and notifications.

The last check follows this repo's existing read/patch event model. It protects
edits made during the model request; it is not a database compare-and-swap guarantee.
Do not broaden this feature into a rewrite of all session updates. If a test exposes
an actual interleaving at the save boundary, fix that boundary with a narrowly scoped
conditional title update through the existing event/projection path.

No automatic progress/success toasts: the ordinary session update refreshes the
header, session picker, sidebar, and terminal title. Explicit `/rename` keeps its UI.

## Implementation sequence

- [ ] Read affected files in full and recheck current worktree before editing.
- [ ] Add creation metadata and TUI-origin hint in `src/packages/opencode/src/cli/cmd/oc.ts`.
- [ ] Add bootstrap metadata in `src/packages/opencode/src/cli/cmd/session.ts`.
- [ ] Add conditional metadata to Home creation in
  `src/packages/tui/src/component/prompt/index.tsx`.
- [ ] Remove only the rename marker from fork metadata in
  `src/packages/opencode/src/session/session.ts`.
- [ ] Add synchronous claim at the existing loop hook and reuse guarded internal
  rename in `src/packages/opencode/src/session/prompt.ts`.
- [ ] Add focused service integration checks, preferably one
  `src/packages/opencode/test/session/autoRename.test.ts`, using existing `testEffect`
  and rename test fixture patterns. Exercise the real prompt/loop and stored metadata,
  not a copied eligibility function.
- [ ] Add the Claude fake-model scenario described below.
- [ ] Run only added or modified checks from `src/packages/opencode`.
- [ ] Document completed behavior in `FORK.md`, bump `src/.version/version` once,
  and record the implementation with the build-notes skill at final handoff.

## Acceptance checks

Use deterministic stream/deferred signals, not sleeps or real providers.

1. Bootstrap alone makes zero naming requests. First real prompt makes exactly one
   rename request, using the configured rename agent and folder-prefixed prompt.
2. Hold the naming stream open. The conversation request must start while naming
   is still blocked, proving that automatic naming does not delay the reply.
3. Release naming and verify the stored title and normal session update event.
4. A second prompt, repeated loop entry, and reopened session make no new automatic
   naming request. Persisted attempted state survives instance disposal/reload.
5. Set a manual title before the first prompt: zero rename requests. Set one while
   naming is held open: the generated title must not overwrite it.
6. All rename models fail: placeholder survives, attempt stays consumed, conversation
   still succeeds. Cover fallback through the shared implementation, extending
   `rename-fallback.test.ts` only if its behavior changes.
7. Unmarked/default sessions keep native title behavior; child sessions and forks
   do not auto-rename; explicit bootstrap `--title` is respected.
8. Home metadata is sent only from an oc-launched TUI. Normal and command prompts
   trigger naming; synthetic-only initialization and shell-only input do not.
9. Claude-provider scenario: extend
   `src/packages/opencode/test/provider/claude-code/fake-model.test.ts` using its
   isolated fixture. Verify the first Claude turn still works and rename uses its
   separate model without injecting `/rename` or creating a second Claude turn.
   Per project rules, add an opt-in pane check to `tui-pane.test.ts` verifying the
   visible title changes once. Run only the specific new scenarios.

User live check after the user builds/installs: open `oc <project>`, send a short
task, and confirm `<folder> - <description>` appears while the reply continues.
Send a second task and reopen the session; its title should stay unchanged. Also
check bare oc followed by a Home prompt and the New oc session palette path.

## Handoff

Implement this plan in the parent checkout, using legacy SessionPrompt only.
No build, install, push, migration, or SDK regeneration is required for planning.
The implementation adds no public schema fields, so generated clients should remain
unchanged. This planning session requires no version bump or build-notes entry.
Leave the existing untracked `liveContextPlan.md` untouched.
