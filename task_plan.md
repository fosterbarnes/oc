# Task Plan: Sync OpenCode custom fork with upstream

## Goal
Update the clean upstream checkout, compare it to the custom OpenCode tree, and write a merge plan that brings in upstream fixes without dropping custom work.

## Next Step
Done. Install only when the user asks.

## Current Phase
Phase 13

## Phases

### Phase 1: Requirements & Discovery
- [x] Understand user intent
- [x] Identify remotes, branches, and current SHAs
- [x] Document findings in findings.md
- **Status:** complete

### Phase 2: Update upstream checkout
- [x] Fetch origin in `C:\Users\user\Documents\GitHub\oc\UPSTREAM\opencode`
- [x] Fast-forward `dev` to `origin/dev`
- [x] Record new SHA and recent commits
- **Status:** complete

### Phase 3: Compare custom vs upstream
- [x] Run `syncAndInstall.ps1 -DryRun` against the new tip
- [x] Inventory custom-only files and dirty TUI work
- [x] Diagnose false-positive overlap (CRLF vs LF in classifier)
- **Status:** complete

### Phase 4: Write merge plan
- [x] Ordered pull-in strategy that preserves custom work
- [x] Conflict hotspots and do-not-regress list
- [x] Deliver plan in chat (do not apply merge unless asked)
- **Status:** complete

### Phase 5: Delivery
- [x] Summarize SHAs, custom deltas, and recommended merge order for the user
- **Status:** complete

### Phase 6: Classifier fix and apply (no install)
- [x] LF-normalize blob/worktree compare and merge inputs
- [x] Add `-SkipInstall` / skip `updateUpstream.ps1` closeOut fetch
- [x] DryRun until zero ambiguous stops
- [x] Apply with `-AllowDirtyParent -SkipInstall`; typecheck and build
- **Status:** complete

### Phase 7: 2026-08-28 upstream pull (no install)
- [x] Fast-forward `UPSTREAM\opencode` `dev`
- [x] DryRun from baseline `c2eacd72af`
- [x] Apply `-AllowDirtyParent -SkipFetch -SkipInstall` if no stops
- [x] Typecheck applied packages and rebuild dist exe
- **Status:** complete

### Phase 8: 2026-08-31 upstream pull (no install)
- [x] Fast-forward `UPSTREAM\opencode` `dev` to true latest
- [x] DryRun from baseline `dc4449df0d`
- [x] Apply `-AllowDirtyParent -SkipFetch -SkipInstall` if no stops
- [x] Rebuild dist exe only
- **Status:** complete

### Phase 9: 2026-08-31 evening upstream pull (no install)
- [x] Fast-forward `UPSTREAM\opencode` `dev`
- [x] DryRun from baseline `10765ff2a9`
- [x] Apply `-AllowDirtyParent -SkipFetch -SkipInstall` if no stops
- [x] Rebuild dist exe
- **Status:** complete

### Phase 10: 2026-09-05 upstream pull (no install)
- [x] Fast-forward `UPSTREAM\opencode` `dev`
- [x] DryRun from baseline `04284921ac`
- [x] Apply `-AllowDirtyParent -SkipFetch -SkipInstall` if no stops
- [x] Rebuild dist exe
- **Status:** complete

### Phase 11: 2026-09-06 upstream pull (no install)
- [x] Fast-forward `UPSTREAM\opencode` `dev`
- [x] DryRun from baseline `e2894562f8`
- [x] Apply `-AllowDirtyParent -SkipFetch -SkipInstall` if no stops
- [x] Rebuild dist exe
- **Status:** complete

### Phase 12: 2026-09-07 upstream pull (no install)
- [x] Fast-forward `UPSTREAM\opencode` `dev`
- [x] DryRun from baseline `bec9ee41af`
- [x] Apply `-AllowDirtyParent -SkipFetch -SkipInstall` if no stops
- [x] Rebuild dist exe
- **Status:** complete

### Phase 13: 2026-09-08 upstream pull (no install)
- [x] Fast-forward `UPSTREAM\opencode` `dev`
- [x] DryRun from baseline `ecbc6ccac8`
- [x] Apply `-AllowDirtyParent -SkipFetch -SkipInstall` if no stops
- [x] Rebuild dist exe
- **Status:** complete

## Key Questions
1. Which branch is true upstream (`dev` vs `main`)? Answer: `dev` on `anomalyco/opencode`.
2. How is custom related (shared git history vs copy)? Answer: snapshot fork, no merge-base. Use `syncAndInstall.ps1`, never `--allow-unrelated-histories`.
3. Which files are known custom and must never be clobbered? Answer: see findings.md preserve list.

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Plan files live in custom tree, not openCursor | That is the tree being compared and later merged |
| Update only UPSTREAM checkout in this session | AGENTS.md: do not modify parent source while syncing upstream |
| Do not apply merge to custom unless user asks | User asked for a plan, not an executed rebase |
| Fast-forward with git, not `updateUpstream.ps1` | Avoid `closeOut` killing the agent pane; same `merge --ff-only origin/dev` |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `-DryRun` reported 238 ambiguous paths | 1 | False positives: `Get-WorktreeText` keeps CR, git blobs are LF. Fix classifier before live apply |

## Notes
- Custom: `C:\Users\user\Documents\GitHub\oc` `main` @ `845bb47`
- Upstream: `C:\Users\user\Documents\GitHub\oc\UPSTREAM\opencode` `dev` @ `c2eacd72afc4a4984564c393e15ab30011057269`
- Baseline in `upstream-sync.state.json`: `03bba464d46f3eddf74195919b1344aa937f7b11`
