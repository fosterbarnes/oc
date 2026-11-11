# Import plan

Palette **oc > Import** (`/import`): scan on demand for other live oc instances, pick one, and pull some or
all of its skills, commands, agents, config, themes, and settings into this machine.

Decisions (2026-11-11): name `Import`; v1 is tailnet only; pull only (the receiving machine approves its own
changes). LAN mDNS, pairing codes, and push are later phases.

## Status (2026-11-11): phases 1-3 implemented

Code: core `util/ocImport.ts` (collect, bundle, redact, rewrite, scan, compare, apply, undo), opencode
`server/importPeer.ts` (listener, started in `cli/cmd/serve.ts` for the resident server), TUI
`component/dialog-import.tsx` and three palette entries in `ocCommands.tsx` (Tools group).

Deviations from the sections below:
- No manifest/bundle split and no loopback `/global/peer/*` routes. The serving side has two routes,
  `/oc-import/hello` and `/oc-import/bundle` (everything, about 1.3 MB for a full config); the TUI process
  scans, compares, and applies itself through core. No HttpApi or SDK changes.
- Auth uses `tailscale status --json` (cached 30 s): the caller's IP must belong to a peer with this
  machine's `UserID`. Same check as `whois`, one CLI call.
- The listener follows oc.json `allowImport` live through a watch on the config folder.
- Items keep their root: `~/.opencode` items land in `~/.opencode`, not `~/.config/opencode`.
- Every opencode.jsonc top-level key is an item (agent/command/mcp/provider split one level down), not only
  the listed ones.
- No diff view yet; rows show new/changed, "runs code", and missing-path counts. Enter toggles, ctrl+a all,
  ctrl+u none, ctrl+s import (a filter-input dialog cannot use plain letters).
- After apply and undo the TUI calls `global.dispose` so open projects reload config, skills, and agents.

Verified: core probe (two fake machines, Windows home to Mac, redaction, comment-preserving merge, undo);
live listener probe from goonstation (403 for a non-peer IP, 200 hello and bundle for the same account, 405
for POST, oc.json on/off without restart). Not run: `scan()` and `fetchBundle()` against a real second oc,
and the dialog in an installed build.

Naming collision: the CLI already has `oc import <file>` (session JSON import,
`packages/opencode/src/cli/cmd/import.ts`). The TUI has no `/import`. Keep the palette label explicit:
"Import from another oc".

## Pieces

1. Peer listener (resident server, `oc.exe` only)
2. Scan (TUI asks the resident server; the server does the network work)
3. Manifest and bundle
4. Picker UI
5. Apply, path rewrite, backup, undo

## 1. Peer listener

- The resident server stays on `127.0.0.1:4096` behind `oc-server.secret`. The full API is never exposed
  to the network.
- A second, separate HTTP listener serves only the peer routes. It is off by default; oc.json `peer.enabled`
  (palette toggle **Allow import from this machine**) starts it.
- Bind only to the Tailscale address (`tailscale ip -4`), never `0.0.0.0`. Fixed port, default `4097`
  (oc.json `peer.port`).
- Routes, all `GET`, all read-only:
  - `/peer/hello`: `{ name, os, ocVersion, home, fingerprint }`. `name` is the hostname; `fingerprint`
    is a stable random id kept in `~/.local/state/opencode/peer-id`.
  - `/peer/manifest`: every shareable item with a sha256 (see section 3).
  - `/peer/bundle?items=...`: raw file text for the requested item ids.
- Auth on every request: `tailscale whois --json <remoteIp>`. Allow only when the caller's
  `UserProfile.LoginName` matches this machine's own Tailscale login. No tokens, no pairing in v1.
- `Global.native` gate: native `opencode` has no resident server, so it never listens. It can still scan and
  import by asking the resident server's loopback routes, or by doing the HTTP calls itself.

## 2. Scan

- Only when the Import dialog opens or the user presses `r`. Nothing scans in the background.
- `tailscale status --json` -> `Peer` entries with `Online: true` -> `GET http://<TailscaleIPs[0]>:4097/peer/hello`
  in parallel, 1.5 s timeout each. Responders are oc peers; non-responders are dropped silently.
- `tailscale` missing or logged out: the dialog shows that state and nothing else.
- Loopback routes on the resident server for the TUI: `GET /global/peer/scan`,
  `GET /global/peer/:fingerprint/manifest`, `POST /global/peer/:fingerprint/apply`.
- Rows: hostname, OS, oc version, "last seen" from the hello. Our own fingerprint is filtered out.

## 3. Manifest and bundle

Items are files, never resolved config. `{env:}` and `{file:}` stay as text.

| Category | Source (relative to the peer's `~/.config/opencode` unless noted) | Item id |
| --- | --- | --- |
| Skills | `skills/<name>/**`, `~/.opencode/skills/<name>/**` | `skill:<name>` (whole folder, one hash) |
| Commands | `commands/*.md`, `~/.opencode/commands/*.md` | `command:<name>` |
| Agents | `agents/*.md` | `agent:<name>` |
| Themes | `themes/*.json` | `theme:<name>` |
| Prompts | `prompts/**` | `prompt:<path>` |
| Config keys | `opencode.jsonc` top-level and one level down: `agent.*`, `command.*`, `mcp.*`, `provider.*`, plus whole `permission`, `keybinds`, `instructions`, `plugin` | `config:<path>` |
| TUI settings | `tui.json` keys | `tui:<key>` |
| oc settings | `oc.json` keys | `oc:<key>` |
| Instructions | `AGENTS.md` and files listed in `instructions` | `file:<path>` |
| Code (flagged) | `tool/**`, `plugins/**`, `scripts/**` | `code:<path>` |

Never sent, enforced on the serving side (not just hidden by the picker):
`auth.json`, `oc.db*`, `service.json`, `cli.json`, `oc-server.*`, `peer-id`, `node_modules`, any file a
`{file:}` reference points at, anything outside the listed roots.

Inline secrets: config values under keys matching `apiKey|token|secret|password` (case-insensitive) are
replaced with `"<redacted>"` unless they are `{env:}`/`{file:}` references. The picker shows the item as
"secret not copied".

Manifest entry: `{ id, category, label, hash, bytes, code: boolean, paths: string[] }`.

## 4. Picker UI

- Dialog 1: peer list (from scan). `enter` opens a peer.
- Dialog 2: category tree with counts. Each item is compared to the local hash:
  - New: no local item
  - Changed: local hash differs
  - Same: hidden (toggle `h` shows them)
  - Local-only items are not listed; import never deletes.
- Keys: `space` toggle, `a` all, `n` none, `enter` on an item shows a diff (side by side for text),
  `ctrl+enter` imports the selection.
- Code items (`code:*`, `config:mcp.*` with a local `command`, `config:plugin`, skills containing scripts)
  show a warning marker and the line "runs on this machine". They are selectable like everything else.
- Default selection when the dialog opens: none.

## 5. Apply

1. Fetch the bundle for the selected ids. Recompute hashes; abort if any differ from the manifest
   (peer changed mid-flow; rescan).
2. Path rewrite in every text item and config value: replace the peer's `home` prefix with ours, converting
   separators (`C:\Users\Foster\` <-> `/Users/foster/`, also the forward-slash and JSON-escaped
   forms). After the rewrite, absolute paths that do not exist locally are listed in the confirm step.
3. Backup: copy every file that will change to `~/.local/state/opencode/import/<timestamp>/` with a
   `manifest.json` of original paths. Keep the newest 10.
4. Write:
   - whole files (skills, commands, agents, themes, prompts, instructions, code): write in place under
     `~/.config/opencode`. Items from the peer's `~/.opencode` land in `~/.config/opencode` too.
   - config keys: per key through `patchJsonc` (`packages/opencode/src/config/config.ts`), which keeps
     comments and untouched keys. `tui.json` and `oc.json` go through their existing writers.
5. Reload: the global config write already disposes instances. Skills, commands, and agents get picked up
   on the next scan; themes on the next theme list read.
6. Toast with counts and an action "Undo" (toast actions exist, `ui/toast.tsx`). Palette **Undo last
   import** restores the newest backup.

Not imported: kv state (`kv.json`, `model.json`: selected theme, model). They are per machine on purpose.

## Phases

1. Listener + `hello` + scan dialog (see peers, nothing imported).
2. Manifest, picker with New/Changed, whole-file categories, backup and undo.
3. Config key merge, `tui.json`/`oc.json`, path rewrite, secret redaction.
4. Later: LAN mDNS discovery (`bonjour-service` is already a dependency, `server/mdns.ts`), 6-digit pairing
   with stored tokens and an encrypted bundle; push with an approval prompt on the target; other uses of the
   peer layer (send a session, push a plan, shared clipboard, combined usage view, update every machine).

## Risks and open points

- Windows: the `tailscale` CLI path (`C:\Program Files\Tailscale\tailscale.exe`) may not be on PATH for the
  resident server; resolve it explicitly.
- `tailscale whois` needs the local tailscaled; on macOS the App Store build exposes the CLI differently
  from the standalone build. Probe both.
- Firewall: Windows Defender prompts the first time the listener binds. Bind happens only after the user
  turns the toggle on, so the prompt appears at a moment that makes sense.
- Skill folders with binaries or large assets: cap bundle size (for example 20 MB) and show sizes in the
  picker.
- Two machines on different oc versions: `hello.ocVersion` is shown; manifest format gets a `version`
  field and the importer refuses newer formats.
- Wiki: a new page for Import once phase 2 ships (user-facing behavior lives there, not the README).
