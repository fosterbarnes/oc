- To regenerate the legacy JavaScript SDK, run `./packages/sdk/js/script/build.ts`.
- After changing the public Protocol or Server `HttpApi`, run `bun run generate` from `packages/client`. Do not edit `src/generated` or `src/generated-effect` directly.
- Keep runtime dependencies directed from Schema to Core and Protocol, then from Core and Protocol to Server. Client runtime code may depend on Schema and Protocol but never Core or Server; `sdk-next` composes Client, Core, and Server.
- The default branch in this repo is `main`; use `main` or `origin/main` for diffs. `dev` is the branch of the `UPSTREAM\opencode` checkout.
- `UPSTREAM\opencode` is the separate upstream-only checkout at `C:\Users\user\Documents\GitHub\oc\UPSTREAM\opencode`. Keep custom source changes in this parent checkout; upstream synchronization must not modify parent source files.
- Windows TUI segfaults on Bun 1.4.0 (`34cbb9a40`): `bun:ffi` FTL pointer args (oven-sh/bun#39829, #40302). `.scripts\build.ps1`, `buildDebug.ps1`, `.run.ps1`, and `.runDebug.ps1` call `requireBunForCompile` and will `bun upgrade --canary` when PATH bun is still 1.4.0. Do not ship `opencode.exe` compiled with 1.4.0. Stable 1.4.1 was not published as of 2026-08-31.
- Stock OpenCode shares oc's default data dir, so it can migrate `~\.local\share\opencode\opencode.db` into a schema oc cannot read (stock 2.0.6 did on 2026-09-27: FOREIGN KEY failures, "Unexpected server error"). `DatabaseMigration.apply` now refuses unknown migration ids. If oc reports "Database was migrated by a different OpenCode build", find the other version's `database migration started` lines in `opencode.log`, restore a backup, and give that build its own `XDG_DATA_HOME`. Local sqlite3 is 3.22 (no `DROP COLUMN`).
- Safe local builds: agents may run `.scripts\build.ps1` or `.scripts\buildDebug.ps1`; these never touch `C:\Users\user\Apps\opencode`. Agents must not run `.scripts\install.ps1`, `.scripts\installDebug.ps1`, `.install.ps1`, or normal `.scripts\syncAndInstall.ps1`, because those installers can stop the OpenCode host. After building, tell the user to exit OpenCode and run the relevant installer with `-NoBuild` from a fresh PowerShell.

## Project definition

- `FORK.md` is the living definition of this fork. Statuses describe current state; they do not authorize work. `README.OG.md` tracks native OpenCode in this checkout (Now / Keep / Upstream). Keep fork-only work in `FORK.md`.
- `README.md` is the public landing page. `countCode.ps1` (via `prePush.ps1`) requires its single `[number](scc.txt)` link and `code-count:start/end` markers.

## Build notes

- Session history lives in root `buildNotes.md` (`# Historical entries (newest first)`, newest-first). For insert/rotate procedure use skills `base/build-notes` and `base/build-notes-archive`.
- Do not create notes under `.md/`.

## buildNotes.txt (repo root)

- Holds the next commit message. `.scripts/push.ps1` reads it: line 1 = commit subject, one blank line, remaining lines = commit body. A positional message passed to `push.ps1` wins (subject only). The file is used only when it changed since the last commit; unchanged, it is the previous push's message, so `push.ps1` prompts instead. `push.ps1 -DryRun` prints the commands without changing anything.
- Agents write it when preparing a push (the `agent-push` skill), replacing the previous push's message. UTF-8 without BOM.
- Format follows the recent commits: line 1 `v<version>` from `.version/version`; then one block per area, each a lowercase label with a colon (`home prompt:`) followed by plain-English paragraphs about what the user sees; last paragraph starts with `Under the hood:` (internal fixes, tests, which checks passed). Cover every `buildNotes.md` entry since the last commit, merge related ones, leave out reverted work, and never claim a check that did not run.

## Revision

`.version/version` holds one version `X.Y.Z`. The patch component is the revision.

- Bump the revision once per session at the tail end, in the same step as the `build-notes` entry, whenever the session changed code (source, scripts, config, tests).
- Skip only sessions with no code changes: read-only or docs/notes-only.
- Increment the final version component. Upstream sync also increments it when the upstream SHA advances; `pushRelease.ps1` uses the full version for tags.
- Read the file immediately before writing. Keep exactly one line with a trailing newline.
- Start the buildNotes heading title with the full version: `## <date> - v0.2.22 - <title> - <model>...`, and repeat it in the `Version:` Agent bullet.

## Branch Names

Use a short branch name of at most three words, separated by hyphens. Do not use slashes or type prefixes such as `feat/` or `fix/`.

Examples: `session-recovery`, `fix-scroll-state`, `regenerate-sdk`.

## Commits and PR Titles

Use conventional commit-style messages and PR titles: `type(scope): summary`.

Valid types are `feat`, `fix`, `docs`, `chore`, `refactor`, and `test`. Scopes are optional; use the affected package or area when helpful, e.g. `core`, `opencode`, `tui`, `app`, `desktop`, `sdk`, or `plugin`.

Examples: `fix(tui): simplify thinking toggle styling`, `docs: update contributing guide`, `chore(sdk): regenerate types`.

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
- Building and installing oc/opencode/ocdebug is strictly user driven. Never attempt to build or install opencode for them.

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
- Only run checks you edit or introduce. If you edit a check, run that specific check afterward. Leave everything else to GitHub Actions.

## Session Runtime (Hybrid V1/V2)

- Prompts, shell, compaction, revert, and the agent loop run only through legacy `packages/opencode/src/session` (`SessionPrompt`, `SessionProcessor`, `SessionRunState`). The V2 execution engine (durable `session_input` admission, `SessionExecution`, `SessionRunCoordinator`, `SessionRunner`, Context Epochs) was removed in v0.2.65. Do not reintroduce it or design for it; revisit only if upstream deprecates the legacy session path.
- Live V2-named pieces the legacy path depends on: `SessionV2` (`core/src/session.ts`: list/create/get/messages/context/history/events plus `switchAgent`/`switchModel`; the TUI calls `/api/session/:id/model` and legacy `prompt.ts` reads `SessionTable.model`), `SessionProjector` (projects `SessionV1.Event.*` into the DB), `EventV2`/`EventV2Bridge` (shared bus), `SessionWork`, `SessionStore`, `LocationServiceMap` + `location-services.ts` (PluginV2, Reference, FileSystem, Pty for legacy agent/system/file/pty code), and the `/api` routes in `packages/server` used by `tui/src/context/data.tsx`.
- Keep `session.next.*` event schemas and their projector handlers even though nothing publishes most of them. `EventV2.replay` dies on unknown durable types, so stored or synced events must stay decodable. `session_input` and other V2 tables stay; schema changes need a new migration.
- `@opencode-ai/sdk/v2` is the legacy JS SDK's current client namespace, not the V2 session engine.
