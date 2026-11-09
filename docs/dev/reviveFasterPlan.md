# /revive: build with the window open, compile once

Status 2026-11-09: implemented (Chunks 0-6) in one working tree, not shipped as three releases; awaiting
the user's live checks. See "Implementation notes" at the end for measurements and deviations. Builds on
the uncommitted skip-build work (`reviveSkipBuildPlan.md`); Chunk 3 moved that code into `prepare`.

Implementing and unit-testing this plan needs no SSH, VM, or second machine. The live checks need
the user (they need an install), and Windows has one live check.

## Why

`~/.local/share/opencode/log/revive.log`, last 8 macOS runs:

| step | time |
|---|---|
| `bun install` | 0.1-0.5 s |
| `build.ts --single` | **10.6-12.1 s** |
| stop oc | 0.2 s |
| install | 0.0 s |
| start server | **2.3 s**, every run |
| reopen | 0.1 s |

All of it is downtime: the TUI hands off and exits (`tui/src/reviveCommands.tsx:203-226`) before the
pipeline builds (`opencode/src/config/reviveHost.ts:114-116`). A failed build drops you at "Press any
key to reopen" (`cli/cmd/oc.ts:112`).

## Design in one paragraph

Split revive into **prepare** (anything slow or likely to fail: source choice, build, release download)
and **swap** (stop → install → start → reopen, which already exists). Prepare runs in a hidden helper
while the TUI stays open and usable. Swap starts only once prepare has produced files to install. The
pipeline then never builds: it installs the paths it is handed. That removes the `update` mode and the
`source` fields from its context. Separately, the build compiles the binary once and copies it for
`opencode`, because the two flavors differ only by a constant (Chunk 4). With the small build fixes
(Chunks 1-2), downtime should drop from ~14 s to ~2.7 s, and the build itself from ~11 s to roughly
5-6 s (estimate; Chunk 0 measures).

Rejected:

- **Compiling both flavors in parallel.** Chunk 4 makes it pointless.
- **Opening the new window before the server is ready.** It saves ~2 s but loses the rollback
  guarantee (`reviveHost.ts:136`).
- **Hard-linking `opencode` to `oc`.** On macOS, a process's path is looked up through the vnode
  name cache, which can return *either* name of a hard link. That would confuse ledger scoping
  (`TuiLedger.sameExecutable`) between oc and native. `occ` only gets away with it because
  `resolveExecutablePath` maps `occ` → `oc` anyway. Use a copy (an APFS clone, so it is free on macOS).

---

## Chunk 0: phase timings in build.ts

`src/packages/opencode/script/build.ts`: one `console.log(\`${label}: ${ms} ms\`)` each for the
`generate.ts` import, the cross-platform installs, each `Bun.build`, each `--version` check, and the
cursor-runtime copy. Add a tiny `timed(label, fn)` helper at the top. Keep it permanently.

**Done when** the `opencode` typecheck passes. The user's next `/revive` gives a baseline; note it here.

## Chunk 1: no cross-platform installs on revive builds

`build.ts:147-150` runs three `bun install --os="*" --cpu="*" <pkg>@<ver>` unless `--skip-install`.
They exist for the all-targets release build; `--single` never uses other platforms' packages. They
behave like `bun add`, so they also rewrite `src/bun.lock` and `src/packages/opencode/package.json`
with LF endings. The repo uses `* text=auto eol=crlf`, which is why both show `M` in `git status`
with an empty `git diff` after every revive. `.scripts/build.ps1:16` already makes this optional.

- `src/packages/opencode/src/config/revive.ts` `buildSteps`: add `"--skip-install"` to both build
  commands.
- `test/config/revive.test.ts` (~lines 510-570): update the expected commands.

**Done when** `bun test test/config/revive.test.ts` passes. After `git checkout -- src/bun.lock
src/packages/opencode/package.json` and one `/revive` (user), `git status` no longer lists them.

## Chunk 2: models.dev snapshot from the local cache

`script/generate.ts` downloads `https://models.dev/api.json` (~6 MB, ~0.5 s) with no timeout, so an
offline `/revive` fails. The running oc already keeps the same document at
`path.join(Global.Path.cache, "models.json")` (`core/src/models-dev.ts:161-164`, refreshed every 5 min;
today it is byte-for-byte the same size as the live file).

New order in `generate.ts`:

1. `MODELS_DEV_API_JSON` set → read it (unchanged).
2. Not a release build (`Script.release` false), `OPENCODE_MODELS_URL` unset, and the cache file
   exists → read it. Log `Loaded models.dev snapshot (cache, <mtime ISO>)`.
3. Otherwise fetch with `AbortSignal.timeout(30_000)`.

Release builds still always fetch. For the cache path, import `Global` from
`@opencode-ai/core/global` if that import has no side effects worth worrying about. Otherwise rebuild
the path with `xdg-basedir` the way `core/src/global.ts:33` does.

**Done when** the `opencode` typecheck passes. `bun run packages/opencode/script/build.ts --single
--skip-install` with Wi-Fi off (user) succeeds and logs the cache line.

## Chunk 3: prepare while the window stays open

### 3a. `ReviveHost.prepare` (`opencode/src/config/reviveHost.ts`)

```ts
/** Slow, failure-prone work before oc stops: source choice, build, or release download. Runs while
 * the TUI stays open. Returns the paths to install, or [] when there is nothing to install. */
export async function prepare(request: Revive.PrepareRequest): Promise<string[]>
```

`Revive.PrepareRequest` (`revive.ts`, with a `parsePrepare` validator alongside `parseContext`):
`{ release?: string; source?: "existing" | "download" | "none"; sourceDir?: string; result: string }`.
`result` is an absolute path under `Global.Path.state/oc-revive/`.

Body, mostly moved out of `revivePipeline`:

1. `source` handling: `downloadSource` / `saveReviveBuild` (today `reviveHost.ts:73-78`).
2. `release` set → `Revive.downloadRelease(release)` and return its paths.
3. Read `revive.build`. Unset or `false` → return `[]`.
4. Skip-build check (today `reviveHost.ts:81-91`): if the source is unchanged, log and return `[]`.
5. Hold a build lock: `withResidentLock(..., { lock: path.join(Global.Path.state, "oc-revive",
   "build.lock"), attempts: 20, busy: "Another revive is already building oc" })`. Inside it:
   - delete stage folders older than 1 h under `Global.Path.cache/oc-revive-build/`;
   - run `Revive.buildSteps(build, { outdir: <new stage folder> })`;
   - return the output paths.

The CLI flag `oc oc --revive-prepare <encoded>` goes next to `--revive` in `cli/cmd/oc.ts` (~line 423;
add it to the mutual-exclusion check at :449-453). It calls `prepare`, then writes
`JSON.stringify({ output })` to `request.result`. Any thrown error means exit code 1, and the message
goes to stderr.

`build.ts` gets `--outdir <abs>` (default `dist`): replace the literal `dist` in the output paths and
in `rm -rf dist`. `buildSteps(build, { variant?, outdir? })` passes it on and computes `output` under
it. `/revive-single` keeps building into `dist` (no `outdir`).

### 3b. Pipeline only swaps (`revivePipeline`, `revive.ts` types)

- `ReviveContext.mode`: `"install" | "no-install" | "single"`. `update`, `release`, `source` and
  `sourceDir` are removed. The new field `output?: string[]` is required for `install` and forbidden
  otherwise; every entry must be absolute and under `Global.Path.cache` (enforced in `parseContext`).
- `revivePipeline`: delete the source handling, the settings/`build` read, the skip check, the build
  command loop, and the release download. `sources = output ? await installSources(output) : undefined`
  still runs before "Stopping oc". The rest (lock, stop, install, start, rollback, handoff) is unchanged.
- `downloadSource` and `saveReviveBuild` move with prepare. `reviveSingle` keeps its own build (it already
  runs in a visible new tab with nothing stopped).
- `test/config/revive.test.ts`: rewrite the `update` cases (~:191-200) as `install` + `output` cases.
  Add rejections: `install` without `output`, `output` outside the cache, `output` on `no-install`.
  Add `parsePrepare` cases.

### 3c. TUI (`tui/src/reviveCommands.tsx`)

- New `prepare(request)`:
  - The TUI opens `Global.Path.log/revive-build.log` (truncate), spawns the helper with the same exe
    choice as `launchHelper` and `["oc", "--revive-prepare", encoded]`, `windowsHide`, stdout+stderr
    to that file, `OC_FLAVOR: "oc"`. It awaits exit.
  - While it runs: one toast, `Building oc… (log: revive-build.log)`, with a long `duration`, dismissed
    on exit.
  - Exit 0 → read and delete `result`, return `output`.
  - Nonzero → error toast with the last 5 non-empty lines of the log plus its path, and return
    `undefined`.
  - A module-level `preparing` flag rejects a second `/revive` or `/update` with a toast while one runs.
- `start("install")`: after the source dialog (unchanged), `const output = await prepare({ source… })`.
  - `undefined` → return `false`. A chain then puts its steps back exactly as today
    (`reviveChain.tsx:48-52`).
  - `[]` → `revive("no-install", …)`.
  - Otherwise → `revive("install", { …, output })`.
- `/update`: `prepare({ release })` then `revive("install", { output })`.
- Before handing off, if the current session became busy during the build, wait for it to go idle. Reuse
  the `idle()` pattern from `reviveChain.tsx:195-204` (lift it into a shared helper) and show
  `Build ready; restarting after this reply`. Other sessions behave as today.
- `mark()` now runs after prepare (it is called inside `revive`), so the divider marks the real
  restart.
- `Source` and the context comment (`reviveCommands.tsx:97-98`) follow the new shape.

Native windows need no special case: the native TUI stays up during prepare, then hands off exactly as
today. In `reviveHost.ts:63`, change "build cancelled" to "revive cancelled".

**Done when** the `opencode` and `tui` typechecks and `bun test test/config/revive.test.ts` pass, and the
user's live checks pass:

1. `/revive` after an edit: the prompt stays usable and the toast shows during the build. Then ~3 s of
   downtime and every tab comes back.
2. A syntax error in a source file, then `/revive`: error toast with the error lines, and the window never
   closes. Fix it, then `/revive` works.
3. `/revive /some-command` with a good build: the command runs after the reopen. With a broken build:
   the chain's steps come back in the prompt.
4. `/revive` with no edits: no build, a ~3 s restart.
5. `/revive` from a native window and from an `occ`-hosted window: both behave like check 1.
6. `/update` (when a release is newer) downloads with the window open, then swaps.
7. Two windows `/revive` at once: the second gets "Another revive is already building oc".

## Chunk 4: compile once, copy for `opencode`

Evidence: installed `oc` and `opencode` are both exactly 214,830,834 bytes. The `OPENCODE_FLAVOR`
define removes nothing measurable: the gated imports are dynamic, and `splitting: true` embeds every
chunk anyway. The flavor can come from the executable's own name instead, as `occ` already does.

- `core/src/global.ts:17-18`:
  ```ts
  const name = executableBasename(process.execPath)
  // Flavor follows the file's name: `opencode` is native; `oc`/`occ` are oc. `bun dev` reads OC_FLAVOR.
  export const native = name === "bun" ? process.env.OC_FLAVOR === "native" : name === "opencode"
  ```
  - Move `executableBasename` above it.
  - Delete the `OPENCODE_FLAVOR` declaration.
  - Update the comment at `:14-16`.
- `build.ts`:
  - drop the `native` variant's compile and the `OPENCODE_FLAVOR` define;
  - after the production compile and its `--version` check, create
    `<outdir>/opencode-native-<os>-<arch>[...]/bin/opencode[.exe]` with
    `fs.copyFile(src, dst, fs.constants.COPYFILE_FICLONE)` (an instant clone on APFS, a plain copy
    elsewhere) and write its `package.json` as today;
  - run `--version` on the copy too (cheap, and proves the copy runs);
  - `--native-only` still compiles once, but writes only the native folder (the oc folder goes to a
    temp folder under the outdir and is removed);
  - `--oc-only` skips the copy.
  - Output paths and release zip names stay the same, so `buildSteps`, `Revive.install`,
    `downloadRelease`, `OcRelease`, `install.ps1`, `buildInstaller.ps1` and `pushRelease.ps1` need no
    changes.
- Release builds (all targets): this halves CI compile time with the same artifacts.

Risk: a renamed binary (e.g. `opencode-dev`) runs as oc. Document it in `FORK.md`'s native section:
the native build must be named `opencode`. A symlink named anything is fine, because `process.execPath`
resolves to the target file.

**Done when** the `core` and `opencode` typechecks pass, and the live checks pass:

- Mac (user): after `/revive`, a native window opens as native (`⦿`, no resident server); `oc` hosts as
  before; `--shutdown-all` leaves native windows running; `/revive-single` leaves the running oc alone.
- Windows (user, or the `vm` skill): `.scripts/build.ps1` then `install.ps1`, and the same three checks.
- Chunk 0's timings show one compile.

## Chunk 5: no false pane-recording failures

About half the runs log `Recording the old panes: failed: wezterm cli list failed: … failed to connect to
Socket(gui-sock-N)`. The restarter first waits for the hosting launcher to exit (`reviveHost.ts:315`).
In a single-tab window, that exit ends that window's WezTerm GUI process, so the socket is gone and
nothing is left to close.

- `opencode/src/config/wezterm.ts` `oldPanes`: if the socket file no longer exists, or the list fails
  with a connect/EOF error, return `undefined`.
- `restartTerminal`: when `old` is `undefined` for that reason, log `Old window already closed`. Any
  other error still logs as failed.

**Done when** the `opencode` typecheck passes and a single-tab `/revive` (user) logs the new line.

## Chunk 6: server boot profile (investigation, no code)

`Starting server` takes 2.3 s every time, and every normal launch pays it too. The readiness poll is
100 ms (`resident.ts:319-323`), so polling is at most ~0.1 s of it.

- Run `oc serve --port 4097 --print-logs --log-level DEBUG` by hand. Note the timestamp gaps up to the
  first healthy response.
- If that doesn't explain it: `BUN_OPTIONS="--cpu-prof" oc serve --port 4097` (first confirm that
  compiled Bun 1.4.2 binaries honor `BUN_OPTIONS`), then read the top self-time entries.

**Done when** a "Findings" section here names the top 3 costs with numbers and one proposed fix each.
The fixes get their own plan.

---

## Order and shipping

- **Release 1:** Chunks 0, 1, 2, 5 (small and independent; one version bump).
- **Release 2:** Chunk 4, after Chunk 0's baseline.
- **Release 3:** Chunk 3, after Chunk 4, so the staging folder holds one compile's output.
- Chunk 6 any time.
- At each handoff: build notes (build-notes skill). Docs: `README.md`'s `/revive` line ("builds with
  the window open; restarts only when the build succeeds"), `AGENTS.md`'s debug bullet, and the revive
  section in `FORK.md`.

## Risks

- **Busy session at swap time (Chunk 3).** Waiting for idle only covers the session that ran `/revive`;
  replies in other tabs die, as they do today.
- **Edits during the background build.** The baked fingerprint is from build start, so the next
  `/revive` sees the difference and rebuilds. Correct.
- **Stage folders on Windows:** ~430 MB until the next prepare's 1 h sweep. On macOS clones make the
  native copy free. Acceptable. If not, the restarter can delete its stage after cleanup (add
  `stage` to `RestartContext`).
- **Mixed versions during the first revive across Chunk 3.** The TUI, the prepare helper and the
  pipeline all run from the same installed file, so the new fields only ever meet the same version.
  `parseContext` rejects an old-style `update` context with "Invalid revive context". That only
  happens if an old TUI hands off to a new binary, which needs a manual install mid-revive.
- **Chunk 4 flavor by name:** see the chunk. The release assets don't change, so `/update` from older
  versions keeps working.

---

## Implementation notes (2026-11-09)

Measured on this Mac (M-series, `build.ts --single --skip-install --outdir <tmp>`):

| phase | before | after |
|---|---|---|
| models.dev snapshot | ~0.5 s fetch | 3 ms (cache) |
| compile | 2 compiles | 1 compile, 3.4-3.5 s |
| native binary | second compile | APFS clone, 0 ms (byte-identical, `cmp`) |
| `--version` check | both binaries | compiled one only, 1.7 s (see below) |
| whole `--revive-prepare` (bun install + build) | ~11 s | 5.6 s, with the window open |

Flavor by name, checked on the built pair: `oc oc --help` lists the oc commands; the identical
`opencode` file runs native (no `oc` command); a symlink with another name runs as its target.

**Chunk 6 findings (server boot).** A plain `oc serve` answers its first request 0.26 s after spawn.
Resident state is written right after listen, and shutdown clears the old state, so the start does not
wait on the old server. The 2.3 s is mostly macOS scanning each **new executable path on its first
launch**: a fresh copy of `oc` takes 1.63-1.66 s for `--version`, and 0.02-0.03 s afterwards. The scan
is per path. A moved file is scanned again at its new path (1.62 s), a clone is scanned (1.95 s), and
so is a hard-linked second name (`occ`, 1.50 s). Every install creates new files, so after each revive
the server's `oc` pays it during downtime, the reopened `occ` window pays it again, and the first native
`opencode` paid 1.97 s.
- Fix applied: `warmLaunch` (`reviveHost.ts`) runs `occ --version` and `opencode --version` on macOS
  right after install, while the server start pays the `oc` scan. The reopened window and native skip
  their scans.
- Not fixable here: the `oc` scan itself. It needs the final path, which exists only after the stop.
- Possibly fixable: Developer ID signing and notarization might shorten the scan. Not tested.

Deviations:
- **Chunk 1:** `--skip-install` stopped the `package.json` rewrite, but plain `bun install` (the
  revive's first step) also rewrites `src/bun.lock` with LF. Added `src/bun.lock text eol=lf` to
  `.gitattributes`, since Bun writes LF on every OS. After `git checkout` and `bun install`, both files
  stay clean.
- **Chunk 4:** `--native-only` compiles straight into the native folder (no temp oc folder needed). The
  copy is not `--version`-checked: identical bytes, and the macOS scan cost is per path anyway.
- **Chunk 4 (not in plan):** `Global.native` treats any name other than `opencode`/`oc`/`occ` (bun,
  node) as a source run that reads `OC_FLAVOR`, so the node shim and tests behave as before.
- **Chunk 5:** a vanished socket returns `{ panes: [] }`, and the restarter logs `No old panes left to
  close` (also when the list has no owned panes).
- **Chunk 3:** stage cleanup is the 1 h sweep at the next prepare only (no restarter cleanup).

Not run here: the Windows-only tests (`windowsTest` in `revive.test.ts`, including the edited
context round-trip and build-step cases), and every live `/revive` check above.
