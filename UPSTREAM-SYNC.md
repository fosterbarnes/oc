# Upstream Synchronization

This fork keeps upstream source in a separate checkout as a reference. The fork
has drifted too far from upstream for an automated or whole-delta apply, so
upstream fixes are cherry-picked into the customized parent by hand.

## Checkouts

- Parent custom fork: this repository
- Isolated upstream source: `UPSTREAM\opencode` inside this repository (gitignored)
- Upstream remote: `https://github.com/anomalyco/opencode`
- Upstream branch: `v1`
- Parent remote: `https://github.com/fosterbarnes/oc`
- Parent branch: `main`

## Workflow

1. Confirm the parent has no source changes and the isolated checkout is clean.
   An agent-created plan file is allowed in the parent during a planned port.
2. Record the current parent SHA and upstream SHA.
3. From the parent root, refresh only the isolated checkout:

   ```powershell
   .\.scripts\updateUpstream.ps1
   ```

4. Confirm the refresh did not modify parent source and record the new upstream
   SHA.
5. Diff upstream from `baselineSha` in `.scripts\upstream-sync.state.json`,
   the last upstream SHA ported into this fork, to see what changed since.
   `snapshotSha` in the same file is the upstream commit the first oc commit
   was built on (its Git parent) and never changes. Record what was ported in
   the `docs/buildNotes/buildNotes.md` session entry. oc's history sits on top of upstream, so
   Git has a real merge base, but the layout moved to `src/` and the fork has
   drifted too far for a plain `git merge`. Keep porting by hand.
6. Pick the upstream changes worth porting and cherry-pick them into the
   parent by hand, adapting paths to this layout (the Bun workspace lives in
   `src/`). Preserve parent-only files and custom behavior by default. Do not
   port unmerged GitHub feature branches; wait until upstream ships them.
7. Review every place a ported change overlaps custom code. Rework custom code
   only when required for upstream compatibility, and keep the smallest
   necessary change.
8. After hand-porting upstream changes, run `.scripts\bumpVersion.ps1` to
   bump the last number of `.version/version` (for example `0.0.8` to
   `0.0.9`) and roll a new tag into `.version/versionTag`. Do this before
   the Windows dist build so the TUI display version matches. OpenCode's
   package version (the package.json `version` fields and the `.opencode`
   plugin pin) tracks the upstream release the port synced through. After
   porting up to an upstream release, update `baselineSha` by hand to that
   release's upstream SHA and set the package version to that release. Once
   the port is committed, record it in Git with a tree-preserving merge so the
   merge base advances:
   `git fetch https://github.com/anomalyco/opencode <sha>`, then
   `git merge -s ours --no-ff <sha> -m "Record upstream sync through <short sha>"`.
9. Leave the parent changes uncommitted for review. Do not reset, stash, commit,
   or push unless the user explicitly requests it.

## Custom Behavior

Protect these areas when porting upstream changes:

- `.install.ps1` and `.scripts\*` local automation
- `.version\version` and `.version\versionTag` maintenance versioning
- `AGENTS.md`, `SCRIPTS.md`, `docs/buildNotes/`, `README.md`, `FORK.md`, `SCOPE.md`, and this guide
- TUI maintenance display-version behavior in the core, build, plugin, and TUI
  adapter/sidebar paths

Do not port changes into upstream areas this fork removed on purpose: the
browser app (`packages/app`), desktop (`packages/desktop`), the hosted SaaS and
deployment tree (`packages/console`, `stats`, `enterprise`, `slack`,
`function`, `containers`, `identity`, `sst.config.ts`, `infra/`, and every
`sst-env.d.ts`), the docs site (`packages/web`), and `packages/storybook`.
Skip those paths in the diff. Share commands and the share client were removed
too (upstream discontinued the share service, `d320177aa4`).

These are examples, not an exhaustive allowlist. Compare the validated
baseline, current parent, and refreshed upstream before deciding whether any
overlap is upstream drift or intentional fork behavior.

Classify every new upstream feature in the diff (v1 and, for ideas, `origin/dev`
OpenCode 2) as port, later, or not planned. Record later and not planned items in
`SCOPE.md` with a one-line reason, so the same feature is not evaluated twice.
OpenCode 2 code uses a different layout and session engine; borrowing from it
means rewriting onto oc's v1 session loop, never reintroducing the V2 engine.

## Verification

Agents run only newly added tests, selecting those cases in existing files.
There is no CI: broader suites are user-driven through `.scripts\test.ps1`, and
`prePush.ps1` typechecks before every push. Do not run them unless explicitly requested.
Recheck both checkout statuses, inspect the final diff, and confirm the isolated
checkout remains clean. Insert a newest-first session entry in `docs/buildNotes/buildNotes.md` after
permitted verification (immediately under `# Historical entries (newest first)`).
Record the upstream SHA, method, checks, and remaining issues.
