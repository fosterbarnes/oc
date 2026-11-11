# Export, import, and tailnet sync of settings

Replaces the Tailscale import of v0.2.357 (`docs/dev/importPlan.md`). User-facing behavior: wiki
`Configuration.md` > Moving settings between machines.

## Status (2026-11-11): implemented

Code:
- core `util/ocItems.ts`: item model, stat-cached `collect` (+ `mtimes`, `unread`), `toWire`/`fromWire`,
  `hash`, `tags`, `tree`, `excluded`/`excludeNode`/`includeNode`, `compare`, `apply` (writes + removals,
  backup, path and machine-key guards), `undo(dir?)`.
- core `util/ocPack.ts`: `.ocpack` pack/unpack.
- core `util/ocSync.ts`: settings, state, scan, manifest/etag, items, `decide`, `pull`, status, Tailscale.
- opencode `server/syncPeer.ts`: listener and 20 s loop, started by `cli/cmd/serve.ts` (resident only).
- TUI `component/itemTree.ts`, `dialog-import.tsx` (import, export, undo), `dialog-sync.tsx`; palette
  `oc.sync`, `oc.import`, `oc.export` (`/exportSettings`, since `/export` is the transcript), `oc.import_undo`.

Deviations from the original plan: import and export share `dialog-import.tsx` instead of a separate
export file; tree rows are always expanded (the dialog filter finds rows); no "Large" tag.

## Decisions

- Export file: `.ocpack` = gzip tar (`Bun.Archive`, no dependency).
- Sync is all by default, code included. Each machine excludes chunks: tree keys or tags.
- Conflicts: newest change wins; the overwritten local copy is backed up and listed for restore.
- Import/export have no network code; Tailscale is only for sync.

## Model

Every item has an id that matches across machines (`skill:config:ocUtils/foo`,
`command:config:command/x.md`, `opencode:mcp.github`, `tui:theme`). The wire form replaces the home
folder with `{{OC_HOME}}` (string leaves, forward slashes) and redacts secret values, so equal hash
means equal config on any OS. `fromWire` puts the local home back and fills redacted values from the
local item (or drops them).

State per item (`state/sync/state.json`):
- `hash`: the shared hash peers compare.
- `local`: this machine's own wire hash when the entry was last set. It can differ from `hash` after
  applying a peer's item (a secret this machine lacks, a path form). Only a change of `local` counts
  as a local edit, so applied items never bounce back. After an apply `local` is unset and the next
  scan adopts it.
- `at`: change time. New/edited items take the file mtime, but always `previous.at + 1` or later, so
  a restored old file beats the tombstone it replaces. Deletes take the detection time.
- `base`: last hash seen equal on a peer; `hash !== base` = unsynced local edit (conflict if a newer
  remote overwrites it).
- `deleted`: tombstone, kept forever (v0.2.360; was 90 days): a long-offline peer, or one that
  excluded the item meanwhile, must not bring a deleted item back. About 100 bytes each.

Scan never tombstones items of an unread source: a missing/unreadable root, or a settings file that
fails to read or parse (`collect().unread`).

## Decide (pull side, `OcSync.decide`)

Exclusion works both ways (v0.2.360): `manifest` and `items` leave out what this machine excludes,
so an excluded item stays on this machine even when edited here; a peer reads a missing entry as
"nothing to do", never as a delete.

Excluded (by remote or local tags, or key) -> skip. Same hash -> same (sets `base`). Missing locally ->
take (tombstone -> skip). Otherwise the newer `at` wins, equal `at` tie-breaks on hash string; a newer
remote over an unsynced local edit is a conflict (applied, reported).

## Transport

- Resident server only. `GET /oc-sync/manifest` (ETag; the puller sends `If-None-Match` only while
  its exclude list is unchanged), `POST /oc-sync/items` (`{ ids }` -> wire items, 20 MB cap). Bound to
  the Tailscale IPv4, port 4097; 403 unless the caller IP is a same-`UserID` peer (status cached 60 s).
- Loop every 20 s: read oc.json, stop the listener when disabled, else pull each online same-account
  peer (unreachable peers back off 5 min and stay out of the status until they answer once).
- `pull` decides against a cached scan, fetches the items, then re-decides and applies under the
  state lock against a fresh scan. Files a peer's item no longer has are removed.
- After applies, `disposeAllInstancesAndEmitGlobalDisposed` runs once no `session.status` busy event is
  open (busy entries older than 2 h are ignored).
- `OcItems.apply` is all or nothing: back up, stage every write in a `.tmp-<pid>` file (at the
  symlink's real path), then rename each into place with `retryBusy` (EPERM/EBUSY/EACCES, 5 x 100 ms).
  A failure removes the temp files, restores only the targets already changed, and deletes the
  backup folder; state is not updated, so the next tick retries cleanly.
- `state/sync/status.json`: peers, last error, overwritten edits (`backup` folder). The `/sync` dialog
  reads it and lists conflicts whose backup still exists; restore = `OcItems.undo(backup)`.

## Risks

- A deliberate mass delete propagates; every peer keeps backups.
- Code items sync everywhere unless excluded; tags make OS-specific exclusion one row.
- Clock skew decides near-simultaneous edits; the loser is backed up.
- `walk` stops 8 folders deep (unchanged from import); deeper files are not items.

## Verification record (2026-11-11)

Two fake machines (separate processes, own home/config/state) over localhost: pull with path rewrite,
local secret kept, binary file, 150-char file name, prefix exclusion, oc.json machine keys untouched,
conflicts reported, rescan adopts without bumping, reverse pull applies nothing, delete propagation
with backup, edit flows back with comments kept, broken jsonc tombstones nothing, conflict restore,
pack/unpack across homes. Real config: 143 items, 171 tree rows, pack 16 ms / 419 KB, round trip 0
changes, cached collect 3 ms. Kept tests: `core/test/util/ocItems.test.ts` (secrets, rewrite, exclude
tree), `core/test/util/ocSync.test.ts` (decide).
