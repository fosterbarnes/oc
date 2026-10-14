# Scope

What oc leaves out on purpose. [FORK.md](./FORK.md) lists what oc adds; this file lists what it
removed from upstream OpenCode, what it will not add, what it set aside for later, and which oc
features were retired.

A row leaves this file only by an explicit decision. Every upstream sync classifies each new
upstream feature as port, later, or not planned, and records the last two here
([UPSTREAM-SYNC.md](./UPSTREAM-SYNC.md)).

oc is based on OpenCode v1 and its session loop. Ideas from OpenCode 2 are rewritten onto that
loop; the OpenCode 2 execution engine itself is not brought back.

## Removed from upstream

| Item | Since | Reason |
|---|---|---|
| Desktop app (Electron, `packages/desktop`) | v0.1 | oc is a terminal app. |
| Web app and `opencode web` (`packages/app`) | v0.1 | oc is a terminal app. |
| opencode.ai website and docs site (`packages/web`, `packages/docs`) | 0.3.0 | They describe upstream. oc's user docs are the GitHub wiki. |
| Console, Zen and Go pages, stats site (`packages/console`, `stats`) | 0.3.0 | Upstream's hosted services. Stock model providers still work. |
| Enterprise, Slack, function, containers, identity, storybook packages | 0.3.0 | Serve upstream's hosted services or web UI. |
| Web UI component packages (`packages/ui`, `packages/session-ui`) | 0.3.0 | Only the web and desktop apps used them. The TUI keeps its notification sounds. |
| Upstream release, publish, translation, and download-stats scripts | 0.3.0 | Built for upstream's npm packages and website. |
| Localized `README.*.md` | v0.1.5 | oc docs are English only. |

## Not planned

| Item | Since | Reason |
|---|---|---|
| Embedded web UI in the CLI | 0.3.0 | Same as the web app. |
| OpenCode 2 execution engine (durable input admission, session runner, inbox) | v0.2.65 | oc runs the v1 session loop. See `AGENTS.md` "Session Runtime". |
| Upstream update channel and `upgrade --major` | 0.3.0 | They install stock OpenCode. oc updates come from oc's own GitHub releases. |
| Option to turn off the background server | 0.3.0 | The resident server is part of oc. Native `opencode.exe` already runs without it. |
| OpenCode 2 workspace, sandbox, and environment drivers | 0.3.0 | Part of the OpenCode 2 execution engine. |
| `/goal` autonomous goal command | 0.3.0 | Upstream dropped it; oc's SuperGo agents cover the use. |

## Planned for later

| Item | Since | What it waits on |
|---|---|---|
| Upstream install channels (npm, brew, AUR, scoop, nix, winget) | 0.3.0 | oc's own release and update flow comes first. |
| In-TUI session tabs and terminal panes | 0.3.0 | Must fit oc's real terminal tabs. |
| Remote pairing (pair, OpenTunnel, QR codes) | 0.3.0 | Local use comes first. |
| Console-managed policies and Console sign-in | 0.3.0 | Hosted service; revisit if useful without it. |
| Share links (`/share`) | 0.3.0 | They publish to opencode.ai pages. |
| GitHub Action (`src/github`) | 0.3.0 | Needs an oc release to point at. |
| VS Code extension (`src/sdks/vscode`) | 0.3.0 | Needs an oc release to point at. |
| Stats poster and media generation (speech, video, images) | 0.3.0 | Not core to a coding agent. |
| Work copies on git worktrees (`/work`, `/done` redesign) | 0.3.0 | Builds on the existing project copy and worktree code. |
| Mermaid and LaTeX rendering | 0.3.0 | Needs new renderer packages. |
| Diff viewer and review scopes | 0.3.0 | Upstream builds it on OpenCode 2 session data. |
| MCP Code Mode expansion | 0.3.0 | Tied to the OpenCode 2 agent runtime. |
| Skill `disable-model-invocation` frontmatter | 0.3.0 | Claude Code already honors it; oc's own skill list does not yet. |
| Replace the sidebar Plugins section with a load-failure toast | 0.3.0 | `/plugins` already lists plugins. |

## Retired oc features

| Item | Retired | Replaced by |
|---|---|---|
| ChatGPT Web and Claude Web browser providers (Agentify runtime) | 2026-10-10 | Claude Code and Cursor providers |
| Single-window mode (`oc single`, `--single`, `--portable`, `mode`) | 2026-10-11 | Native `opencode` binary |
| Work copies (`/work`, `/done`) | 2026-10-13 | To be redesigned (Planned for later) |
| Command markers (`$#name` preset commands) | 2026-10-12 | Agent shell and edit tools could still write `markers.json` |
| Bash-only Claude `account` wrapper | | Claude account pool |
| `/manageThirdPartyHarnesses` submenu | | Palette heading |
| Standalone `oc.config.json` / `OPENCODE_OC_CONFIG` wrapper | | `oc.json` |
| External intro-script setting | | Built-in intro |
| Initial model / agent / reasoning palette settings | | Native session setup |
| Global `ignoreAgentModels` | | Per-session model memory |
| Standalone openSidebar plugin | | Native sidebar |
| Singular-only global `agent/` folder | | `agents/` (projects may still use both) |
| Snake and wave startup animations | | Column sweep |
| Windows `opencode-process-tree.exe` supervisor | | Direct spawn |
| Open Computer Use MCP | | None (uninstalled) |
| Intermediate clack "type to filter" project list | | Real TUI picker |
| Cursor native plan-mode bridge | | OpenCode planning agents |
| ocdebug PowerShell wrapper function | | Native `ocdebug.exe` |
| Native `ocdebug.exe` flavor and isolated debug profile | 2026-10-14 | `/revive-single` native test builds sharing production data |
| OpenTUI raw-mode resume patch | | Stock OpenTUI resume |
| bgShell plugin (`bgRun`, `bgStatus`, `bgKill` sibling plugin) | 0.2.177 | Built-in background shell: `bash` with `background: true`. Migration: `bgRun` becomes `bash` with `background: true`; `bgStatus` and `bgKill` keep their names. |
