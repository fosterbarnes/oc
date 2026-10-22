# Native split plan: `oc` + `opencode`

> Historical planning: source paths and line numbers reflect the earlier layout. Current behavior
> is documented in [FORK.md](../../FORK.md), the wiki, and [buildNotes.md](../buildNotes/buildNotes.md).

Status: implemented in v0.2.157. Decisions: rename oc build to `oc.exe`; `.run.ps1` defaults to oc (`-Native` flag); native tab glyph `⦿`, no footer label; native `/revive` reopens native via the sibling `oc.exe`; `oc.json` `executable` set to `oc.exe`. Native windows still write the oc-tuis ledger (scoped by executable, so oc shutdown ignores them).

## Goal

Two compiled binaries from one source tree:

- `oc.exe` (+ `occ.exe` hard link, + `ocdebug.exe`): today's oc. Launcher, resident server, attach TUIs, revive, tray flags.
- `opencode.exe`: every oc feature except the resident-server machinery. Runs the stock upstream path: in-process TUI with the server in a worker, one window = one instance.

Features are written once. The only per-binary code is a gate on one build constant, used only where something needs the resident server.

`oc single` and everything named single/portable are removed. Both binaries share the default data dir and DB (same session list). The existing cross-process session lock already guards a session open in both.

## Today (verified)

- One compile. `install.ps1` installs `opencode.exe`, hard-links `oc.exe`/`occ.exe` to it (`.scripts/install.ps1:44-72`).
- Behavior is picked by the started name: `withExecutableDefault` (`cli/commandLoader.ts:72`) rewrites `oc`/`occ` to `oc launch`/`oc previous`. `opencode` is not rewritten and already runs the stock in-process TUI.
- The oc launcher spawns `opencode.exe` for the resident server and attach TUIs: `Global.resolveExecutablePath` maps `oc`/`occ` -> `opencode` (`core/src/global.ts:21`).
- `oc single` = stock TUI + `OC_SINGLE=1` (`cli/cmd/oc.ts:54`). `OC_SINGLE` gates: index.ts rewrite skip, tui.ts close cleanup + revive handoff, app.tsx revive context/title glyph/Shut Down/Restart, footer label, startup.ts env scrub.
- `oc.json` `executable` = `$HOME/Apps/opencode/opencode.exe`; the TUI spawns it for `oc config set` (`tui/src/app.tsx:320`).
- `.run.ps1` runs `bun dev .`: execPath is bun, so no rewrite, so it is already the native path.

## Design

### 1. Build constant

- `build.ts` defines `OPENCODE_FLAVOR` (`'oc'` or `'native'`) next to `OPENCODE_VERSION`.
- `core/src/global.ts`: `export const native = typeof OPENCODE_FLAVOR === "string" ? OPENCODE_FLAVOR === "native" : process.env.OC_FLAVOR === "native"`. The env var only matters for `bun dev` runs.
- Bun `define` + minify drops the dead branches, so gated dynamic imports (resident server, launcher) are not bundled into `opencode.exe`.

### 2. Gates (the whole per-binary surface)

- `index.ts`: native skips `withExecutableDefault`/`withOcLaunchDefault` and does not register the `oc` command.
- `cli/cmd/tui.ts`: on close, native does the descendant cleanup (today's single path). No revive handoff.
- `tui/src/app.tsx`: native hides Shut Down, Restart, and revive entries; writes no oc-tuis ledger; title glyph `⦿`.
- `footer.tsx`: native shows nothing extra (upstream look), or keep a label: see question 3.
- `sessionTab.ts`: unchanged (already toasts when there is no resident server).
- Settings palette `oc config set`: native runs the update in-process instead of spawning the oc exe (reuse `OcConfig.update`).

### 3. Remove single

- `SingleCommand`, `single()` in `cli/cmd/oc.ts`; `--single`/`--portable` on `launch`/`previous`; `mode` key in `config/oc.ts`; `single`/`portable` in `Revive` context and `reopenCommand`; `OC_SINGLE` everywhere (index.ts, tui.ts, app.tsx, footer.tsx, startup.ts scrub); related tests in `revive.test.ts`.
- `shutdown.test.ts` drain-timeout test stays (drain is still used on native window close).

### 4. Executable names

- oc build compiles to `oc.exe`. `resolveExecutablePath`: `occ` -> `oc`, everything else unchanged. The resident server and attach TUIs then run as `oc.exe`, so oc's ledger, `--shutdown-all`, and revive (all scoped by `sameExecutable`) never touch native `opencode.exe` processes.
- `ocProcesses` lists by install directory, then filters by executable, so native processes in the same folder are ignored.
- Native compiles to `opencode.exe`.

### 5. Scripts

- `build.ts`: variants `oc` -> `dist/opencode-windows-x64/bin/oc.exe`, `debug` -> `ocdebug.exe`, `native` -> `dist/opencode-native-windows-x64/bin/opencode.exe`. Flags `--oc-only`, `--native-only` (alongside the existing `--debug-only`).
- `build.ps1 [-Native] [-Oc]`: default builds oc + debug + native; one switch builds only that flavor.
- `.run.ps1 [-Native]`: `-Native` sets `OC_FLAVOR=native`; default runs `bun dev . oc launch` (resident) so dev matches oc. See question 2.
- `install.ps1 [-Native] [-Oc]`: stops oc/occ/opencode/ocdebug. Migration: deletes the old `oc.exe`/`occ.exe` hard links before copying (copying onto a hard link overwrites the shared file). Copies `oc.exe` + recreates `occ.exe` link, copies `opencode.exe`. Sets `oc.json` `executable` to `oc.exe` via `oc.exe oc config set executable`, or by asking you (question 4).
- `.install.ps1` passes the flags through.

### 6. Docs

`FORK.md` row "Single-instance mode" -> "opencode (native) binary". Add the rule: every feature is written once; gate on `Global.native` only for resident-server needs. Update `README.md`, `SCRIPTS.md`, `AGENTS.md` build/install notes.

## Risks

- External references to `opencode.exe` as the oc server (tray app, wezFig Lua, shortcuts) break after the rename. Only `oc.json` was found locally; `wezterm.lua.disabled` also mentions it.
- One extra compile per default build (about +1/3 build time).
- Shared DB: a native window and an oc window on the same session; the existing lock refuses the second prompt with "Session is running in another oc window".

## Checks

- `tsgo --noEmit` for opencode, core, tui.
- `revive.test.ts` and `commandLoader` tests after removing single.
- User live check: install, then `oc` (resident, ■), `opencode` (native, ⦿, no Shut Down/Restart), `oc --shutdown-all` leaves the `opencode` window running.
