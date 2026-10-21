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
| `experimental.disable_paste_summary` config option | v0.2.241 | Paste summary is off by default and toggled with `/pasteSummary` (kv). The schema still accepts the key so existing configs load; the TUI ignores it. |
| Session sharing (`/share`, `/unshare`, `run --share`, share-URL import, sidebar share link) | v0.2.264 | Upstream service discontinued (`d320177aa4`). The SDK `session.share`/`unshare` routes stay: share fails, unshare clears the stored link. |

## Not planned

| Item | Since | Reason |
|---|---|---|
| Embedded web UI in the CLI | 0.3.0 | Same as the web app. |
| OpenCode 2 execution engine (durable input admission, session runner, inbox) | v0.2.65 | oc runs the v1 session loop. See `AGENTS.md` "Session Runtime". |
| Upstream update channel and `upgrade --major` | 0.3.0 | They install stock OpenCode. oc updates come from oc's own GitHub releases. |
| Option to turn off the background server | 0.3.0 | The resident server is part of oc. Native `opencode.exe` already runs without it. |
| OpenCode 2 workspace, sandbox, and environment drivers | 0.3.0 | Part of the OpenCode 2 execution engine. |
| `/goal` autonomous goal command | 0.3.0 | Upstream dropped it. |

## Planned for later

| Item | Since | What it waits on |
|---|---|---|
| Upstream install channels (npm, brew, AUR, scoop, nix, winget) | 0.3.0 | oc's own release and update flow comes first. |
| In-TUI session tabs and terminal panes | 0.3.0 | Must fit oc's real terminal tabs. |
| Remote pairing (pair, OpenTunnel, QR codes) | 0.3.0 | Local use comes first. |
| Console-managed policies and Console sign-in | 0.3.0 | Hosted service; revisit if useful without it. |
| GitHub Action (`src/github`) | 0.3.0 | Needs an oc release to point at. |
| VS Code extension (`src/sdks/vscode`) | 0.3.0 | Needs an oc release to point at. |
| Stats poster and media generation (speech, video, images) | 0.3.0 | Not core to a coding agent. |
| Work copies on git worktrees (`/work`, `/done` redesign) | 0.3.0 | Builds on the existing project copy and worktree code. |
| Mermaid and LaTeX rendering | 0.3.0 | Needs new renderer packages. |
| Diff viewer and review scopes | 0.3.0 | Upstream builds it on OpenCode 2 session data. |
| MCP Code Mode expansion | 0.3.0 | Tied to the OpenCode 2 agent runtime. |
| Skill `disable-model-invocation` frontmatter | 0.3.0 | Claude Code already honors it; oc's own skill list does not yet. |
| Repeating scheduled prompts | 0.2.213 | A repeat interval on `session_queue` rows (schema change and migration). Until then a scheduled prompt re-arms itself. |
| Native-runtime provider features (Bedrock Mantle Messages, Anthropic `between_tools`, cache kept across effort switches, Responses WebSocket, Google Interactions, provider-side compaction, tool namespaces, request tuning) | v0.2.271 | Upstream builds them in its native `ai` runtime; oc runs the AI SDK path. Revisit per feature when a model needs it. |
| ACP updates (compaction reports, model/agent sync, ACP on OpenCode 2) | v0.2.271 | ACP is not an oc focus; revisit on demand. |
| More plugin hooks and plugin storage (model request, prompt interception, title/compaction, shell create, session retry, durable storage, live package updates, git packages) | v0.2.271 | A plugin that needs them; oc's v1 hooks cover current use. |
| MCP elicitation, MCP resources as model tools, MCP auth rework | v0.2.271 | Elicitation would route to oc's question dialog; waits on a server that uses it. |
| Session navigation (projects + sessions open menu, paged history loading, `--session` creating a missing id, attach skills to prompts, per-tab drafts, `cd`-style path autocomplete, session export revamp, jump to background tool starts, session warming, turn diff route) | v0.2.271 | Fits after the current session list and transcript work settles. |
| Usage and permission views (compaction/title usage in totals, per-turn tokens and throughput, edit saved permissions, portable shell permission scanner) | v0.2.271 | Needs oc-side design for the sidebar and permission store. |
| Periodic update check with idle apply, auth export/import, Poe OAuth, background service env config | v0.2.271 | oc's update and auth flows come first; installs stay user-driven. |
| TUI look and config (OpenCode 2 theme format, new dialog designs, question form refinements, per-session terminal env, hot-reload local TUI plugins, webfetch markdown renderer) | v0.2.271 | Must fit oc's theme rules and existing dialogs. |

## Retired oc features

| Item | Retired | Replaced by |
|---|---|---|
| ChatGPT Web and Claude Web browser providers (Agentify runtime) | 2026-10-10 | Claude Code and Cursor providers |
| Single-window mode (`oc single`, `--single`, `--portable`, `mode`) | 2026-10-11 | Native `opencode` binary |
| Work copies (`/work`, `/done`) | 2026-10-13 | To be redesigned (Planned for later) |
| Manual session-handoff palette command | 2026-10-15 | Automatic Context limit handoffs remain available. |
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
