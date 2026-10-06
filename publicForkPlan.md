# Public fork migration: rough draft

Date: 2026-10-06
Status: deferred discussion draft. No migration or publication authorized by this document.

## Goal and agreed boundaries

Publish oc with genuine upstream Git ancestry and clear attribution, retaining the
custom commits in their original order with their original code changes.

- Keep the `src/` layout and its historical move intact.
- Preserve authorship, author/committer dates, commit bodies, and code history.
- Allow sensitive personal information to be redacted throughout history.
- Allow minor commit-subject renames.
- Keep buildNotes archives, redacting personal information where needed.
- Link the latest actually incorporated upstream revision, not the latest checkout.
- Fix personal absolute paths before anything becomes public. The earlier proposal
  to leave `C:\Users\user` paths in place is superseded.
- Work in an isolated copy. Preserve the original repository and unrelated work.
- Publication remains the user's action. Deleting a public test repository is not
  a reliable way to retract published information.

## Prior investigation and scratch state

These are recorded findings from this conversation, not fresh verification.
Recheck them against the repository when work resumes.

- Original custom root: `aa02899`.
- Proposed upstream parent: `5cd8e68fdd`, recorded as the last applied upstream
  revision in `.scripts/upstream-sync.state.json` and the buildNotes archives.
- Earlier scratch copy: `%TEMP%\ocForkTest`, based on committed HEAD `2e91729`.
- That snapshot reportedly contained 49 custom commits. Uncommitted work was excluded.
- A temporary replacement parent was installed in that scratch copy. It was not
  baked into rewritten history.
- Upstream checkout was at `0112a92`; checkout position does not prove incorporation.
- No later incorporated sync was found. If confirmed, attaching the root to the
  base already records the latest incorporation; no invented merge is needed.
- Prior gitleaks scan reported zero findings in the custom commit range. This does
  not establish that all personal information or binary metadata is absent.
- Prior inventory reported 19 `.lnk` files, 3 `desktop.ini` files, and personal
  absolute paths in 39 files, including scripts, configuration, notes, and binaries.
- Review draft: `%TEMP%\ocForkTest-review.md`. Temporary files may disappear; this
  document carries the important decisions forward.

## Decisions still needed

1. Personal paths: determine which historical strings are privacy redactions and
   which require functional portability fixes in a new commit. Agree on exact
   replacements before touching history. Broad replacement can break scripts.
2. Binary files: determine whether tracked executables embed personal paths or
   metadata. Agree whether to remove affected generated binaries from history or
   replace them. Text scanning alone is insufficient.
3. Confirm removal of all `.lnk` and `desktop.ini` files throughout history.
4. Review the proposed subject renames below.
5. Choose the final GitHub fork name and how active development will move onto
   the rewritten lineage. Continuing to push old history would undo the cleanup.

## Proposed sequence for a later session

### 1. Establish a fresh baseline

- Record current HEAD, branches, tags, working-tree changes, and applied upstream SHA.
- Confirm the upstream parent through sync records and tree comparison.
- Create a separate copy with independent objects, keeping originals read-only.
- Decide explicitly how any uncommitted work will be carried forward.
- Retain an untouched backup and the original-to-rewritten commit mapping privately.

### 2. Inventory and approve redactions

- Scan custom history, commit messages, tracked metadata, and binary files.
- Inventory personal paths across history, including escaped and slash variants.
- Distinguish privacy cleanup from ordinary code changes. Keep the latter in new
  commits, preserving the original sequence of code changes.
- Record exact approved removals and replacements in a private review file.
- Treat scanner results as evidence, not a complete privacy guarantee.

### 3. Prepare and rewrite the isolated copy

- Attach the original custom root to the verified upstream commit.
- Restrict history editing to custom commits. Preserve upstream commits and IDs.
- Remove approved shell metadata files from every custom commit, covering root
  paths and nested paths, including historical names.
- Apply approved sensitive-information redactions and subject-only renames.
- Preserve commits that become empty after redaction so the original sequence
  remains represented. Configure the rewrite tool accordingly.
- Bake in the ancestry link and retain the commit mapping.
- Verify tool behavior before execution, especially replacement-parent handling,
  rewrite scope, empty-commit preservation, and unchanged upstream ancestry.

### 4. Fix remaining public-readiness issues forward

- Replace remaining machine-specific paths with appropriate repository-relative,
  user-profile, or explicitly configured locations after tracing each use.
- Keep explanatory notes readable while removing approved personal identifiers.
- Prevent `.lnk` and `desktop.ini` from being tracked again.
- Resolve binary privacy concerns using the agreed approach.
- Make these ordinary new changes distinct from the historical cleanup.

### 5. Validate before publication

- Confirm the upstream base and its ancestor commit IDs remain unchanged.
- Confirm custom commits remain in order with preserved authors and dates.
- Compare each mapped commit's tree and changes, allowing only approved redactions
  and metadata removals. Inspect the first commit separately: its diff necessarily
  changes from a full snapshot to custom changes against upstream.
- Compare final trees and account for every difference.
- Re-scan rewritten history and current files for secrets and personal information,
  including commit messages and binary metadata.
- Check license notices and public attribution to upstream.
- Inspect exactly which branches and tags would be published. Do not mirror-push
  old refs or replacement refs that could expose unredacted history.
- Run only permitted, specifically introduced or edited checks for forward fixes.

### 6. Publish and transition when explicitly approved

- Create a GitHub fork of `anomalyco/opencode` to obtain the fork-network label.
- Push the reviewed rewritten branch through a user-run command or script.
- Verify upstream ancestry, commit rendering, attribution, and expected file trees.
- Move ongoing development to the rewritten history and carry over reviewed
  uncommitted work. Preserve the old repository as a private archive.
- Revisit future upstream sync mechanics with the `src/` layout; shared ancestry
  alone does not guarantee conflict-free merges after a directory move.

## Proposed subject renames

Drafts carried forward from the earlier review. Confirm against actual changes;
these descriptions have not been freshly checked in this draft-writing step.
Bodies and repeated version subjects remain unchanged.

| Original commit | Original subject | Proposed subject |
| --- | --- | --- |
| `aa02899` | initial commit | oc: customizations on top of opencode 5cd8e68fdd |
| `d5ea372` | post openCursor fold-in | fold openCursor in as a native provider |
| `e504bbe` | schmenis | agent tab order, display names, timestamps, model routing |
| `66856be` | random backup | Cursor protocol parity, debug logging, Everything MCP, SuperPlan split |
| `c0f1fe2` | in a pretty good state | lifecycle reconnect, launch directories, remove web/desktop packages |
| `4afa50d` | 0.1.3 | v0.1.3 |
| `2f5a5cd` | penis | Cursor host identity, fast project picker, Windows clipboard paths |
| `d29935d` | pre opentui downgrade | checkpoint before OpenTUI downgrade |

## Resume point

Start with the unresolved personal-path and binary-file decisions. Refresh the
baseline and inventory before relying on the old scratch clone. Nothing is ready
for public upload merely because the earlier secret scan reported no findings.
