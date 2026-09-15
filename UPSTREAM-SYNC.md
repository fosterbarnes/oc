# Upstream Synchronization

This fork keeps upstream source in a separate checkout and applies upstream
changes to the customized parent only after a content comparison.

## Checkouts

- Parent custom fork: `C:\Users\user\Documents\GitHub\oc`
- Isolated upstream source: `C:\Users\user\Documents\GitHub\oc\UPSTREAM\opencode`
- Upstream remote: `https://github.com/anomalyco/opencode`
- Upstream branch: `dev`
- Parent remote: `https://github.com/fosterbarnes/opencode`
- Parent branch: `main`

## Workflow

1. Confirm the parent has no source changes and the isolated checkout is clean.
   An agent-created plan file is allowed in the parent during a planned sync.
2. Record the current parent SHA and upstream SHA.
3. From the parent root, refresh only the isolated checkout:

   ```powershell
   .\.scripts\updateUpstream.ps1
   ```

4. Confirm the refresh did not modify parent source and record the new upstream
   SHA.
5. Establish the parent snapshot baseline by comparing tracked-file hashes with
   upstream history. This repository was uploaded as a snapshot and has no Git
   merge base with upstream. Do not use `--allow-unrelated-histories` as the
   normal synchronization method.
6. Generate the upstream delta from the validated baseline to the refreshed
   upstream tip, then apply it to the parent with a content-level three-way
   merge. Preserve parent-only files and custom behavior by default. The delta
   is every file that changed on `dev`, including `feat`, `fix`, `docs`, and
   `chore`. Do not filter to bugfixes only. Do not merge unmerged GitHub
   feature branches; those land on `dev` when upstream ships them.
7. Review every overlapping hunk. Rework custom code only when required for
   upstream compatibility, and keep the smallest necessary change.
8. After a successful apply that advances the isolated `dev` SHA, bump the
   last number of `.version/version` (for example `0.0.8` to `0.0.9`). Do this
   before the Windows dist build so the TUI display version matches. Do not bump
   OpenCode's package version. `syncAndInstall.ps1` does this bump when the new
   upstream SHA differs from the stored baseline.
9. Leave the parent changes uncommitted for review. Do not reset, stash, commit,
   or push unless the user explicitly requests it.

## Custom Behavior

Protect these areas during synchronization:

- `.install.ps1` and `.scripts\*` local automation
- `.version\version` maintenance versioning
- `AGENTS.md`, `SCRIPTS.md`, `buildNotes.md`, and this guide
- TUI maintenance display-version behavior in the core, build, plugin, and TUI
  adapter/sidebar paths
- Custom declaration fixes in the app and enterprise packages

These are examples, not an exhaustive allowlist. Compare the validated
baseline, current parent, and refreshed upstream before deciding whether any
overlap is upstream drift or intentional fork behavior.

## Verification

Run these checks from the appropriate directories:

```powershell
git diff --check
bun typecheck
```

Run `bun typecheck` from each affected package directory, never from the repo
root. Parse any changed PowerShell scripts with PowerShell 7. Recheck both
checkout statuses, inspect the final diff, and confirm the isolated checkout
remains clean. Insert a newest-first session entry in `buildNotes.md` after
successful verification (immediately under `# Historical entries (newest first)`).
Record the upstream SHA, method, checks, and remaining issues.
