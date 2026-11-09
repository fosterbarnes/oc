# /revive: skip the build when the source is unchanged, and remove dead revive paths

Status 2026-11-09: implemented (chunks 1-6); awaiting the user's live `/revive` check (Chunk 3).
Deviation: staging a change does not change the fingerprint (the tree hash is content-only, which is
correct); the test asserts that instead.

Implementing and verifying this plan needs no SSH, VM, or second machine.

## Goals

1. `/revive` with no code changes since the installed build: skip rebuilding oc, but still do everything
   else revive does.
2. `/revive` with code changes: rebuild, as today.
3. Keep it clean and simple. Untangle the needless complexity around it, without inventing new things.
4. `/revive-no-install` stays, because the user restarts with uncommitted edits on purpose.

## Design

**The cause of the complexity:** an installed oc does not know what source it was built from. Its
version (`0.2.343`) changes only on a manual bump. Comparing with GitHub or `HEAD` gets pulls,
uncommitted edits, and `/debug` → `/imp` reverts wrong, and a stamp file would need invalidation rules.

**Fix:** the build bakes a source fingerprint into the binary, next to the version it already bakes
(`build.ts` `define`, ~line 212). `/revive` compares that baked value with the folder's fingerprint now.
If they are equal, it skips the build. If they differ, or either one is unknown, it builds.

**Why the baked value is always the right one:** the revive pipeline always runs as a fresh process
started from the installed executable's path.

- Hosted: the launcher spawns `OcConfig.executablePath()` with `oc --revive`
  (`cli/cmd/oc.ts` `runNative`, line 20; called at line 108).
- Hidden helper: the TUI starts its own `process.execPath`, or the `oc` beside native `opencode`
  (`tui/src/reviveCommands.tsx` `launchHelper`).

So the constant describes the file installed now, whoever installed it (`/revive`, `/revive-update`,
`install.ps1`, the installer). It needs no stamp file and no invalidation. The first `/revive` after this
ships runs on a binary without a fingerprint (`""`), so it builds.

**Fingerprint:** the git tree hash of the working folder, taken with a temporary index:

```
real=$(git -C <dir> rev-parse --git-path index)   # resolve against <dir>
cp "$real" <tmp>                                  # optional stat cache: only changed files get rehashed
GIT_INDEX_FILE=<tmp> git -C <dir> -c core.safecrlf=false add -A
GIT_INDEX_FILE=<tmp> git -C <dir> write-tree      # → tree hash
```

- Covers committed, staged, unstaged, and untracked files, and respects `.gitignore` (`dist/`,
  `node_modules`). Content-addressed, so an edit followed by a revert gives back the original hash.
- `git add -A` stages the whole working tree from any subfolder, so `build.ts` (run from
  `src/packages/opencode`) and revive (run on `revive.build.source`) get the same hash.
- It never touches the real index or any file. Measured at 23-36 ms on this repo.
- Any failure gives `""`, which means unknown, which means build. The worst case is today's behaviour.

---

## Chunk 1: `sourceTree` helper

New file `src/packages/core/src/util/sourceTree.ts`:

```ts
/** Git tree hash of everything in `dir`'s working tree (tracked + untracked, .gitignore respected); "" if unknown. */
export async function sourceTree(dir: string): Promise<string>
```

- Use the steps above with `Bun.spawn`. Keep stdout and drop stderr, which carries the CRLF warnings.
- Temp index: `path.join(os.tmpdir(), \`oc-source-tree-${process.pid}-${Date.now()}\`)`. Pass it as an
  absolute `GIT_INDEX_FILE` and `rm` it in `finally`. If copying the real index fails, carry on: it is
  slower but still correct.
- Any error, non-zero exit, or empty output returns `""`.

Tests in `src/packages/core/test/util/sourceTree.test.ts` (temp repo: `git init`, set a local
user.name and user.email, commit one file):

- two calls give the same hash;
- editing a tracked file, adding an untracked file, or staging a change each change the hash;
- a gitignored file does not change it;
- edit then revert gives the original hash;
- calling it from a subfolder gives the same hash as from the root;
- `git status --porcelain` output is the same before and after a call;
- a folder that is not a repo returns `""`.

**Done when** `bun test test/util/sourceTree.test.ts` and `bun run typecheck` pass in
`src/packages/core`.

## Chunk 2: bake the fingerprint into the build

- `src/packages/opencode/script/build.ts`: before the target loop, add
  `const sourceTreeHash = await sourceTree(dir)`, imported from `@opencode-ai/core/util/sourceTree`
  (opencode already depends on `@opencode-ai/core`). Revive runs `bun install` before `build.ts`, so a
  lockfile rewrite is already in the hash. `generate.ts` writes no tracked files.
- Add `OPENCODE_SOURCE_TREE: \`'${sourceTreeHash}'\`` to the existing `define` block.
- `src/packages/core/src/installation/version.ts`: declare `const OPENCODE_SOURCE_TREE: string` and
  export
  `InstallationSourceTree = typeof OPENCODE_SOURCE_TREE === "string" ? OPENCODE_SOURCE_TREE : ""`.

**Done when** the `core` and `opencode` typechecks pass.

## Chunk 3: skip the build in revive

`src/packages/opencode/src/config/reviveHost.ts`, `revivePipeline`. Replace

```ts
const build = context.mode === "install" ? Revive.parseBuild(settings.revive?.build) : undefined
```

with

```ts
const configured = context.mode === "install" ? Revive.parseBuild(settings.revive?.build) : undefined
// This oc was built from exactly this source: restart without rebuilding (like /revive-no-install).
const unchanged =
  !!configured && InstallationSourceTree !== "" && InstallationSourceTree === (await sourceTree(configured.source))
if (unchanged)
  await log.write(`Source unchanged since the installed build (${InstallationSourceTree.slice(0, 7)}); skipping build`)
const build = unchanged ? undefined : configured
```

Nothing else changes. With `build` undefined, the existing code already takes the no-install path: no
install lock, no `installDir` in the restart context, no rollback. It still stops oc, starts the server,
reopens the window with its tabs, and settles chained steps. The hosted, hidden-helper, native, and
chained revives all go through this function.

**Done when** the `opencode` typecheck passes, and the user's live check succeeds (it needs an install,
so the agent cannot run it):

1. `/revive` builds. The running oc has no fingerprint yet.
2. `/revive` with no edits: the revive window shows "Source unchanged … skipping build", there is no
   `bun install` or build output, and every tab reopens.
3. Edit a file and `/revive` builds. Revert the edit and `/revive` builds again, because the installed
   build has the edit.
4. `/revive /some-command` on the skip path still sends `/some-command` after the reopen.

## Chunk 4: docs for chunks 1-3

- `README.md`: change "`/revive` restarts or rebuilds oc in place" to "`/revive` restarts oc in
  place, rebuilding only when the source changed".
- `AGENTS.md` debug bullet: after "`/revive` builds this repo and installs `oc.exe` and `opencode.exe`"
  add "(it skips the build when the source is unchanged since the installed build)".

## Chunk 5: remove `revive.path`

Why it is safe without checking any machine: `revive.path` only replaces `/revive-no-install` with a
custom script. Its intended script, `.scripts/revive.ps1`, runs `oc --shutdown-all` and then reopens
oc, which is what the built-in `/revive-no-install` already does. With the setting gone, any `oc.json`
that still has it falls back to the built-in restart. Nothing breaks, and the leftover key is ignored.

- `src/packages/tui/src/ocSettings.ts`: drop `revivePath` from the type, the parse (`revive?.path`), and
  the defaults.
- `src/packages/tui/src/reviveCommands.tsx` `start()`: the `no-install` branch becomes
  `if (mode === "no-install") return revive("no-install", { sessionID, resume, next }).then(() => true)`.
  Change the top comment to `// Built-in revive restarts oc and its terminal (ReviveHost.revive).`
  Remove the `launchDetached` import if nothing else in the file uses it.
- Comments only (the code stays, because `/revive-single` and fast settles still need it):
  - `src/packages/core/src/util/reviveResume.ts:84`: change "alive for `revive.path` and
    /revive-single" to "alive for /revive-single".
  - `src/packages/tui/src/reviveChain.tsx:191`: "A fast settle can land before this watcher exists."
- Delete `.scripts/revive.ps1`, `.scripts/reviveAndInstall.ps1` (`SCRIPTS.md` already says nothing uses
  it), and `.scripts/setReviveConsolePosition.ps1` (it only positions those two scripts' consoles).
  Delete `startOcWindow` from `.scripts/scriptHelper.ps1`, since those two scripts are its only callers.
  Also delete any variable only it used (grep `occShortcut` first).
- Docs: remove the three rows in `SCRIPTS.md`. Update the mentions in `FORK.md:249`,
  `docs/dev/publicReadiness.md:60`, and `docs/dev/v0.3.0.md:338,407`.

**Done when** the `tui` and `core` typechecks pass, and
`grep -rn "revive\.path\|revivePath\|revive\.ps1\|reviveAndInstall\|startOcWindow\|setReviveConsolePosition" --exclude-dir=node_modules --exclude-dir=.git .`
matches only `buildNotes*` and this plan.

## Chunk 6: remove the legacy `shell` tab kind

Evidence: `revive.ts:58` says shell tabs are "no longer produced", and they stopped in v0.2.174
(2026-10-13, per `git log -S`). The tab list is written and read within the few seconds of one revive.

- `src/packages/opencode/src/config/revive.ts`: `Tab` becomes
  `{ kind: "oc"; directory: string; sessionID?: string; paneID?: string }`. **Keep the `kind` field**,
  because the first revive across this change has the old binary writing and the new one reading. In
  `tab()`, delete the `shell` arm, and delete the back-compat comment above `Tab`.
- `src/packages/opencode/src/cli/cmd/oc.ts` `revive-tabs` (~line 300): call
  `launchProject(first.directory, { session: first.sessionID })` unconditionally. Delete the
  shell-spawn lines and the `tab.kind === "oc" ? … : …` branch in `spawnTab`.
- `src/packages/opencode/test/config/revive.test.ts`: remove any shell-tab cases.

**Done when** the `opencode` typecheck and `bun test test/config/revive.test.ts` pass.

---

## Order and shipping

- The chunks have to go 1 → 2 → 3 → 4. Chunks 5 and 6 are independent of them and of each other.
- Ship everything as one version bump, then add a `buildNotes.md` entry at handoff (build-notes skill).
- The user runs the Chunk 3 live check: two `/revive`s, the first to install the fingerprinted build and
  the second to see the skip.

## Risks

- **A wrong skip.** This needs the baked fingerprint to equal the folder while the binary came from
  different code. Every installer bakes the hash of the folder it actually built from, so the only way
  is a CI release whose checkout matches your folder exactly. In that case the code really is the same,
  so skipping is correct.
- **`/revive-single`, then `/revive` with the folder back at the `oc` binary's tree.** The build is
  skipped and native `opencode` stays on the other build. This is rare. Run `/revive-single` again, or
  edit any file.
- **git missing or a slow disk.** The helper returns `""` and the build runs, as today.

## Size

About 30 lines for the helper, 4 in the build, 6 in revive, plus the tests. Chunks 5 and 6 delete about
60 lines and three scripts. There are no new runtime files, settings, commands, or schema changes.
