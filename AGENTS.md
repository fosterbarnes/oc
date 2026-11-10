- Layout: the Bun workspace (`packages`, `sdks`, `script`, `package.json`, `bun.lock`, `turbo.json`, `.version`, ...) lives in `src/`. Run `bun` from `src` or a package under it. Docs (build notes in `docs/buildNotes/`), `AGENTS.md`, `.github`, `.husky`, `.opencode`, and `.scripts` stay at the repo root. Package paths in these notes (`packages/...`) are relative to `src/`.
- To regenerate the legacy JavaScript SDK, run `./packages/sdk/js/script/build.ts`.
- After changing the public Protocol or Server `HttpApi`, run `bun run generate` from `packages/client`. Do not edit `src/generated` or `src/generated-effect` directly.
- Keep runtime dependencies directed from Schema to Core and Protocol, then from Core and Protocol to Server. Client runtime code may depend on Schema and Protocol but never Core or Server; `sdk-next` composes Client, Core, and Server.
- The default branch in this repo is `main`; use `main` or `origin/main` for diffs. `v1` is the branch of the `UPSTREAM\opencode` checkout (upstream `dev` is OpenCode 2).
- `UPSTREAM\opencode` (inside this repository, gitignored) is the separate upstream-only checkout. Keep custom source changes in this parent checkout; upstream synchronization must not modify parent source files.
- Bun 1.4.0 segfaults the Windows TUI (oven-sh/bun#39829, #40302): never ship an `opencode.exe` compiled with it. `.scripts\build.ps1` and `.scripts\.run.ps1` call `requireBunForCompile`, which upgrades a 1.4.0 PATH bun; oc pins `bun@1.4.2` in `src/package.json`.
- Session DB: oc uses `oc.db` (source runs `oc-local.db`) in `~\.local\share\opencode`; stock OpenCode keeps `opencode.db` there (`Database.path`, `OPENCODE_DB` overrides both). Stock 2.0.6 once migrated a shared `opencode.db` into a schema oc could not read (2026-09-27: FOREIGN KEY failures, "Unexpected server error"), so the name never follows the build channel or git branch. `DatabaseMigration.apply` still refuses unknown migration ids ("This database was changed by a newer or different OpenCode build"): a newer oc build changed the file, or `OPENCODE_DB` points at another build's file; find its `database migration started` lines in `opencode.log`. Dev and stable installs share `oc.db`. Local sqlite3 is 3.22 (no `DROP COLUMN`).
- Two binaries, one source: `oc.exe` (launcher, resident server, revive host; `occ.exe` hard link) and native `opencode.exe` (upstream in-process TUI + worker). Write every feature once. Gate on `Global.native` (from the executable name: one compile, `opencode` is a copy of `oc`; `OC_FLAVOR` env in `bun dev`) only where a feature needs the resident server. Do not reintroduce `oc single` or other env-flag runtime modes. `ocdebug` is retired; `/revive-single` builds native beside the running oc, sharing production data. Settings: both binaries share every config file, `kv.json`, and `model.json`, except theming, which is per binary (`theme`, `theme_mode`, `theme_mode_lock` kv keys and the `daily_theme` tui key get a `_native` suffix in native; `binaryKey` in `tui/src/context/theme.tsx`, `DAILY_THEME_KEY` in `tui/src/config/index.tsx`). A new setting is shared unless the user asks for it per binary; then use the same suffix.
- Safe local builds: `.scripts\build.ps1` never touches the install folder (`$installDir` in `.scripts\scriptHelper.ps1`, `%LOCALAPPDATA%\Programs\oc`); building remains user-driven. Agents must not run `.scripts\install.ps1` or `.install.ps1`, because those installers can stop the OpenCode host. After a requested build, tell the user to exit OpenCode and run the installer with `-NoBuild` from a fresh PowerShell. Former debug build/install/run scripts fail with retirement instructions.
- Script pane behavior (matches base `SCRIPTS.md`): every `.scripts\.run*.ps1` uses `runLoop` from `scriptHelper.ps1` (q quit, r/UpArrow restart; `-Console` for the TUI). `closeOut` kills the WezTerm pane when `$env:SCRIPT_OWN_PANE` is set, which the sidebar script runner (`tui/src/routes/session/sidebar-tools/scriptRunner.ts`, `OWN_PANE`) types into panes it creates. Both sides are live: v0.2.162 removed them as unused and sidebar panes stopped closing.

## Read before these activities

These rules apply to one activity each, so they live outside this file. Read the file before starting.

- Writing `buildNotes.txt` or a commit subject: `docs/dev/commitMessage.md`. Subjects are `v<version> <versionTag> [<label> > <summary>]`, not conventional commits.
- Running or writing provider, pane, or perf tests, and judging a test failure (known failures list): `docs/dev/testing.md`.
- `/agentTest` or a live check of a TUI change: `docs/dev/agentTest.md`.
- `/debug`: `docs/dev/debugRuns.md`.
- Installer VM test package: `docs/dev/vmAcceptance.md`.

## Project definition

- `FORK.md` is the living definition of this fork. Statuses describe current state; they do not authorize work. Keep fork-only work in `FORK.md`.
- `SCOPE.md` records what oc leaves out: upstream surfaces it removed, items not planned, items planned for later, and retired oc features. Every upstream sync classifies each new upstream feature as port, later, or not planned, and records the last two there. A row leaves `SCOPE.md` only by explicit decision.
- `README.md` is the public pitch: hook, standout features, requirements, install, a short behavior-changes list, and links into the wiki. It is not the reference for how oc behaves.
- The GitHub wiki (`fosterbarnes/oc.wiki`, local clone `..\oc.wiki`) is the source of truth for user-facing behavior, settings, keys, troubleshooting, and FAQ. When a change alters what users see or configure, update the wiki page, not the README. Code and agent knowledge stays in `FORK.md`, `AGENTS.md`, and `docs/buildNotes/buildNotes.md`. Wiki layout rules: `Editing-This-Wiki.md` there. Pushing the wiki is the user's action, except that `agent-push` pushes it too.

## Build notes

- Session history lives in `docs/buildNotes/buildNotes.md` (`# Historical entries (newest first)`, newest-first), not the repo root. Archives (`buildNotes.archiveN.md`) and `buildNotes.txt` live in the same folder. For insert/rotate procedure use skills `base/build-notes` and `base/build-notes-archive`, with this folder in place of the repo root.
- Summary budget: at rotation, the fresh file's cumulative summary is at most 80 lines and 12 KB, lines of at most 300 characters. Keep invariants true in the current code, standing rules not already in `AGENTS.md` or `principles.md`, and `MISTAKE`/`ERROR` rules that still apply. Drop removed or replaced features, per-version history, and anything `AGENTS.md`, `FORK.md`, or `principles.md` already states; the archives keep the full text. This narrows the skill's "no fixed max".
- Do not create notes under `.md/`.

## Revision

`src/.version/version` holds one version `X.Y.Z`. The patch component is the revision. `src/.version/versionTag` holds the random camelCase two-word tag rolled on every bump.

- Bump the revision once per session at the tail end, in the same step as the `build-notes` entry, whenever the session changed code (source, scripts, config, tests), by running `pwsh -NoProfile -File .scripts\bumpVersion.ps1` once. Never edit `version` or `versionTag` by hand; `bumpVersion.ps1 -RerollTag` rerolls only the tag.
- Skip only sessions with no code changes: read-only or docs/notes-only.
- Upstream sync also bumps when the upstream SHA advances; `pushRelease.ps1` uses the full version for tags.
- Start the buildNotes heading title with the full version and tag: `## <date> - v0.2.22 <versionTag> - <title> - <model>...`, and repeat it in the `Version:` Agent bullet.

## Branch Names

Use a short branch name of at most three words, separated by hyphens. Do not use slashes or type prefixes such as `feat/` or `fix/`.

Examples: `session-recovery`, `fix-scroll-state`, `regenerate-sdk`.

## Style Guide

### Documentation and wording

- Do not use the prohibited two-word test phrase in code, scripts, comments, logs, tests, or documentation. Use precise terms such as "basic check" or describe the validation directly.

### General Principles

- Keep things in one function unless composable or reusable
- Do not extract single-use helpers preemptively. Inline the logic at the call site unless the helper is reused, hides a genuinely complex boundary, or has a clear independent name that improves the caller.
- Avoid `try`/`catch` where possible
- Avoid using the `any` type
- Use Bun APIs when possible, like `Bun.file()`
- Rely on type inference when possible; avoid explicit type annotations or interfaces unless necessary for exports or clarity
- Prefer functional array methods (flatMap, filter, map) over for loops; use type guards on filter to maintain type inference downstream
- In `src/config`, follow the existing self-export pattern at the top of the file (for example `export * as ConfigAgent from "./agent"`) when adding a new config module.
- In Effect generators, bind services to named variables before calling methods. Do not use nested service yields such as `yield* (yield* Foo.Service).bar()`.
- Building and installing oc/opencode is strictly user driven. Never attempt to build or install opencode for them.
- Prettier (`src/package.json`) keeps `src` formatted like upstream. `.scripts\prePush.ps1` formats changed files under `src` before every push, so do not run Prettier by hand or list it as verification, and do not hand-revert Prettier changes to lines you did not touch. `src/script/format.ts` reformats the whole tree (use after a Prettier version bump). `prePush.ps1` also regenerates `packages/sdk/openapi.json` from the server routes, so do not hand-edit or restore it; route changes show up there on the next push.
- Line endings: the working tree is LF on every OS (`.gitattributes` `* text=auto eol=lf`). Content damage still matters (raw ESC bytes, stray `\r`, mangled backslashes from shell writes), so keep using the file tools.

Reduce total variable count by inlining when a value is only used once.

```ts
// Good
const journal = await Bun.file(path.join(dir, "journal.json")).json()

// Bad
const journalPath = path.join(dir, "journal.json")
const journal = await Bun.file(journalPath).json()
```

### Destructuring

Avoid unnecessary destructuring. Use dot notation to preserve context.

```ts
// Good
obj.a
obj.b

// Bad
const { a, b } = obj
```

### Imports

- Never alias imports. Do not use `import { foo as bar } from "..."` or renamed imports like `resolve as pathResolve`.
- Never use star imports. Do not use `import * as Foo from "..."` or `import type * as Foo from "..."`.
- If a namespace-style value is needed, import the module's own exported namespace by name, for example `import { Project } from "@opencode-ai/core/project"`, then reference `Project.ID`.
- Prefer dynamic imports for heavy modules that are only needed in selected code paths, especially in startup-sensitive entrypoints. Destructure dynamic import bindings near the top of the narrowest scope that needs them so they read like normal imports. Avoid inline chains such as `await import("./module").then((mod) => mod.value())` or `(await import("./module")).value()`. Keep branch-specific imports inside the branch that needs them to preserve lazy loading.

### Variables

Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.

```ts
// Good
const foo = condition ? 1 : 2

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

### Control Flow

Avoid `else` statements. Prefer early returns.

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```

### Complex Logic

When a function has several validation branches or supporting details, make the main function read as the happy path and move supporting details into small helpers below it.

```ts
// Good
export function loadThing(input: unknown) {
  const config = requireConfig(input)
  const metadata = readMetadata(input)
  return createThing({ config, metadata })
}

function requireConfig(input: unknown) {
  ...
}
```

- Keep helpers close to the code they support, below the main export when that improves readability.
- Do not over-abstract simple expressions into many single-use helpers; extract only when it names a real concept like `requireConfig` or `readMetadata`.
- Do not return `Effect` from helpers unless they actually perform effectful work. Synchronous parsing, validation, and option building should stay synchronous.
- Prefer Effect schema helpers such as `Schema.UnknownFromJsonString` and `Schema.decodeUnknownOption` over manual `JSON.parse` wrapped in `Effect.try` when parsing untrusted JSON strings.
- Add comments for non-obvious constraints and surprising behavior, not for obvious assignments or control flow.

### Schema Definitions (Drizzle)

Use snake_case for field names so column names don't need to be redefined as strings.

```ts
// Good
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
})

// Bad
const table = sqliteTable("session", {
  id: text("id").primaryKey(),
  projectID: text("project_id").notNull(),
  createdAt: integer("created_at").notNull(),
})
```

## Testing

- Avoid mocks as much as possible, you shouldn't be using globalThis.\* at all unless it's the only option.
- Test actual implementation, do not duplicate logic into tests
- Tests cannot run from repo root (root `test` script prints "do not run tests from root" and exits 1); run from package dirs like `packages/opencode`.
- `packages/opencode/test/preload.ts` sets a 30 s default timeout (Bun ignores `[test] timeout` in `bunfig.toml`), so a bare `bun test <file>` there needs no `--timeout`, and a CLI `--timeout` has no effect there (set a per-test timeout instead). Other packages still default to 5 s unless their `test` script passes one.
- Verification follows `principles.md` and the `verify` skill. Broader suites are user-driven through `.scripts/test.ps1`; there is no CI.
- Probes: scratch tests go in `src/packages/<pkg>/test/tmp/verify/` (ignored by the `tmp` rule in `.gitignore`). Run with `bun test test/tmp/verify/<file>` from the package dir, then delete the folder and confirm with `Test-Path`. TUI probes: `openPane(fixture)` from `test/provider/claude-code/paneFixture.ts` under `OC_TUI_PANE=1` (`type`, `paste`, `click`, `waitFor`, `screen`); see `tuiPane.test.ts` for use. Harness probes: fake-model scenarios against `TestLLMServer`. Never build or install.
- Known failures, fake-model, pane, perf, and cleanup rules: `docs/dev/testing.md`. Compare failures against its list; do not re-prove them with `git stash`, reverts, or baseline copies.

## Session Runtime (Hybrid V1/V2)

- Prompts, shell, compaction, revert, and the agent loop run only through legacy `packages/opencode/src/session` (`SessionPrompt`, `SessionProcessor`, `SessionRunState`). The V2 execution engine (durable `session_input` admission, `SessionExecution`, `SessionRunCoordinator`, `SessionRunner`, Context Epochs) was removed in v0.2.65. Do not reintroduce it or design for it; revisit only if upstream deprecates the legacy session path.
- Live V2-named pieces the legacy path depends on: `SessionV2` (`core/src/session.ts`: list/create/get/messages/context/history/events plus `switchAgent`/`switchModel`; the TUI calls `/api/session/:id/model` and legacy `prompt.ts` reads `SessionTable.model`), `SessionProjector` (projects `SessionV1.Event.*` into the DB), `EventV2`/`EventV2Bridge` (shared bus), `SessionWork`, `SessionStore`, `LocationServiceMap` + `location-services.ts` (PluginV2, Reference, FileSystem, Pty for legacy agent/system/file/pty code), and the `/api` routes in `packages/server` used by `tui/src/context/data.tsx`.
- Keep `session.next.*` event schemas and their projector handlers even though nothing publishes most of them. `EventV2.replay` dies on unknown durable types, so stored or synced events must stay decodable. `session_input` and other V2 tables stay; schema changes need a new migration.
- `@opencode-ai/sdk/v2` is the legacy JS SDK's current client namespace, not the V2 session engine.
