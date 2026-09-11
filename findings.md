# Findings & Decisions

## Requirements
- Update real mainline upstream at `C:\Users\user\Documents\GitHub\oc\UPSTREAM\opencode`
- Compare to custom `C:\Users\user\Documents\GitHub\oc`
- Write a plan to pull upstream fixes/new changes while preserving all custom work
- Do not apply the merge in this pass unless the user later asks

## Research Findings

### Checkouts
- Parent: `fosterbarnes/opencode` branch `main` HEAD `845bb47`. Dirty TUI/plugin/cli work plus docs/scripts. Unrelated 5-commit history (snapshot). `UPSTREAM/opencode/` is gitignored.
- Isolated upstream: `anomalyco/opencode` branch `dev`, tracking `origin/dev`.
- Previous applied baseline: `03bba464d46f3eddf74195919b1344aa937f7b11` (`.scripts/upstream-sync.state.json`).
- After this session: upstream fast-forwarded to `c2eacd72afc4a4984564c393e15ab30011057269` (`fix(console): secure server action redirects (#45374)`). 55 commits, 254 files, +3219/-2094. Checkout is clean and even with `origin/dev`.

### Existing sync machinery
- `UPSTREAM-SYNC.md` and `.scripts/syncAndInstall.ps1` already define the intended method: classify only the baseline-to-tip delta, three-way merge, stop on overlap, preserve parent-only, leave source uncommitted, then typecheck/build/install.
- Do not use `git merge --allow-unrelated-histories` against parent `main`.

### Classifier false positives (critical)
- `-DryRun` said: 238 ambiguous, 1 merged (`bun.lock`), 15 upstream-only.
- Sampled files (`packages/core/package.json`, `dialog.tsx`, `provider.ts`, `tui/package.json`, `turbo.json`, `nix/hashes.json`): parent worktree matches baseline once Git normalizes CRLF (`git hash-object` == blob SHA). Parent `core.autocrlf=true`.
- `Get-WorktreeText` / `Get-BlobText` compare raw UTF-8 strings. Worktree has CR bytes; blobs do not. `Test-SameContent` fails, so `git merge-file` sees a fake custom edit on every line.
- After normalizing `\r\n` to `\n` in those helpers (and in merge inputs), nearly all 238 should reclassify as `upstream-only` (parent matches baseline, take tip). Real overlap should be rare in this 55-commit window because custom TUI files are not in the delta.

### True custom to preserve (not in this 55-commit delta unless noted)
Parent-only / fork automation:
- `.install.ps1`, `.scripts/*` (`updateUpstream.ps1`, `syncAndInstall.ps1`, `install.ps1`, `build.ps1`, state json)
- `.version/version`, `AGENTS.md`, `SCRIPTS.md`, `buildNotes.md`, `UPSTREAM-SYNC.md`, `CONTEXT.md` as customized
- `Custom fork:` comments: TUI display version (`packages/core/src/installation/version.ts`, `packages/opencode/script/build.ts`, `packages/plugin/src/tui.ts`, `packages/tui/src/app.tsx`, adapters, sidebar/footer, fixtures)

Uncommitted parent work (must survive; none of these paths are in the 55-commit upstream file list except possibly unrelated package.json version bumps):
- TUI: `app.tsx`, `config/index.tsx`, `config/keybind.ts`, `context/local.tsx`, `context/route.tsx`, `editor.ts`, `feature-plugins/sidebar/files.tsx`, `plugin/adapters.tsx`, `routes/session/index.tsx`, `terminal-win32.ts`, `ui/dialog-select.tsx`, `ui/dialog.tsx`, `util/selection.ts`, tests, new `packages/tui/test/terminal-win32.test.ts`
- CLI: `packages/opencode/src/cli/cmd/attach.ts`, `tui.ts`
- Specs: `packages/opencode/specs/tui-plugins.md`
- Plugin: `packages/plugin/src/tui.ts`
- Local: `.opencode/tui.json`, `.scripts/syncAndInstall.ps1`, `.version/version`, `SCRIPTS.md`, `buildNotes.md`

Known durable fork behavior from history / AGENTS:
- `packages/core/src/ripgrep.ts` oversized JSON guard (`MAX_RECORD_BYTES` 64 KiB). Not in this upstream delta. Keep it.
- Custom element triple-slash refs in `packages/app/src/custom-elements.d.ts` and `packages/enterprise/src/custom-elements.d.ts`. Not in this delta.
- TUI model precedence (`resolveCurrentModel`) from Aug 23 notes. Not in this delta.

### Upstream changes worth taking (runtime / Windows TUI)
These are in the 55-commit delta and parent matches baseline after LF-normalize, so they should apply as straight replacements:
- `packages/ui/src/context/dialog.tsx`: stacked dialog focus (`modal={stack().at(-1)?.id === id}`)
- `packages/opencode/src/provider/provider.ts`: Cloudflare AI Gateway REST routing, Anthropic dashed slug
- `packages/opencode/src/cli/cmd/github.handler.ts` + function github/OIDC
- `packages/opencode/src/session/llm/request.ts`: send `x-parent-session-id` even with extra headers
- `packages/opencode/src/session/retry.ts`: Go upsell copy $10/month (harmless)
- HTTP API global handlers/groups, upgrade endpoint normalize, llm/retry tests
- `packages/core` database migration recovery (`#45061`)
- `packages/app` drop archived sessions from home immediately
- Package versions 1.18.21 -> 1.18.23 on many `package.json` plus `bun.lock` (already classified clean merge)
- Console/stats/web/docs/i18n: large but not TUI-custom; take to keep the snapshot aligned

New files (already `upstream-only`): unlock workflow, console lite-usage/server-action/pricing tests, auth-redirect, function github, stats retention migration, etc.

Deletes (will look like "parent still customizes" until CRLF is fixed, then should delete if parent==baseline):
- `packages/console/app/src/routes/black/subscribe/[plan].tsx`
- `packages/stats/app/src/routes/geo-map.ts`

### Do not
- Live `syncAndInstall.ps1` until classifier CRLF is fixed (it would stop, or if someone forced copies, merge-file would mangle files)
- Unrelated-history merge
- Commit/push unless asked
- Clobber dirty TUI files (they are outside this delta if apply stays path-scoped)

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Fetch/FF only the UPSTREAM clone | Keep custom tree untouched while recording the plan |
| Fix newline compare before any apply | 238 "overlaps" are CRLF false positives |
| Keep using delta-only classify | Parent-only and out-of-delta custom TUI never get rewritten |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Dry-run 238 ambiguous | Document CRLF bug; do not apply |

## Resources
- Custom: `C:\Users\user\Documents\GitHub\oc`
- Upstream: `C:\Users\user\Documents\GitHub\oc\UPSTREAM\opencode`
- Installed build: `C:\Users\user\Apps\opencode\opencode.exe`
- Guide: `UPSTREAM-SYNC.md`
- State: `.scripts/upstream-sync.state.json`

## Visual/Browser Findings
-

---
*Update this file after every 2 view/browser/search operations*
