# Contributing to oc

oc is a personal fork of OpenCode that I've opened up. Issues and pull requests are welcome. I
ask that pull requests be intentional, tested, and scoped to what oc is for: a Windows-first
OpenCode with the features described in the [README](README.md).

Good fits:

- Bug fixes, especially Windows-specific ones
- Fixes to the Claude Code or Cursor providers
- Improvements to existing oc features (sidebar, session list, launcher, `/work`, revive)
- Documentation fixes

For a new feature, open an issue first and describe the problem and your idea. That avoids work
on something that won't be merged.

Changes to stock OpenCode behavior that oc doesn't touch usually belong upstream in
[anomalyco/opencode](https://github.com/anomalyco/opencode). oc pulls upstream changes in with
its sync scripts ([UPSTREAM-SYNC.md](UPSTREAM-SYNC.md)).

## Setup

You need Windows 10 or 11, PowerShell 7, Git, and Bun (not 1.4.0, which crashes the Windows TUI).

The Bun workspace lives in `src/`. Run `bun` from `src` or a package under it, never from the
repository root.

```powershell
cd src
bun install
cd ..
.\.scripts\.run.ps1          # runs oc from source (bun dev .)
```

Build and install scripts are described in [SCRIPTS.md](SCRIPTS.md). `.scripts\build.ps1` builds
`opencode.exe` without touching an installed copy. Note that `.scripts\install.ps1` installs to a
fixed folder for now and stops running oc processes.

Where things are:

- `src/packages/opencode`: CLI, server, sessions, providers (`src/provider/claude-code`,
  `src/provider/cursor`), oc launcher (`src/config/oc.ts`, `src/cli/cmd/oc.ts`)
- `src/packages/tui`: the terminal UI, including the sidebar (`src/routes/session/sidebar-tools`)
- `src/packages/core`: shared services, config schema, database
- `src/packages/cursor-runtime`: the Node relay for Cursor
- `.scripts`: PowerShell build, test, install, release, and sync scripts

[FORK.md](FORK.md) lists every oc feature and how complete it is.

## Tests

Run tests from a package folder, not the repository root:

```powershell
cd src\packages\opencode
bun test test\session\retry.test.ts
```

`.scripts\test.ps1` runs selected package suites, typechecks, and generated-file checks
(`-List` shows the options). Claude Code provider changes should come with a fake-model scenario
(`test/provider/claude-code/fakeModel.test.ts`); these run against a local fake server and cost
nothing.

If you change the public server API, regenerate the clients with `bun run generate` in
`src/packages/client`.

## Pull requests

- Keep each pull request small and focused on one change.
- Say what changed, why, and how you checked it. Include screenshots for UI changes.
- Use a conventional title: `type(scope): summary`, with type `feat`, `fix`, `docs`, `chore`,
  `refactor`, or `test`. Example: `fix(tui): keep sidebar scroll position`.
- Follow the code style in [AGENTS.md](AGENTS.md) (no `else`, prefer `const`, no aliased or star
  imports, Bun APIs where they fit).
- Write descriptions in your own words and keep them short.

## Reporting bugs

Use the bug report template. Include your oc version (shown in the sidebar footer as `oc vX`),
your terminal, and steps to reproduce. Logs are in `%USERPROFILE%\.local\share\opencode\log`.
