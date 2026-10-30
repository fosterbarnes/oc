# Scope

What oc leaves out on purpose. [FORK.md](./FORK.md) lists what oc adds; this file lists what it
removed from upstream OpenCode, what it will not add, what it set aside for later, and which oc
features were retired.

A row leaves this file only by an explicit decision. Every upstream sync classifies each new
upstream feature as port, later, or not planned, and records the last two here
([UPSTREAM-SYNC.md](./UPSTREAM-SYNC.md)).

Since and Retired give the oc release where it happened. `before vX` means the exact release was
not recorded; v0.2.174 is when this file was created.

oc is based on OpenCode v1 and its session loop. Ideas from OpenCode 2 are rewritten onto that
loop; the OpenCode 2 execution engine itself is not brought back.

## Removed from upstream

| Item | Since | Reason |
|---|---|---|
| Desktop app (Electron, `packages/desktop`) | v0.1.2 | oc is a terminal app. |
| Web app and `opencode web` (`packages/app`) | v0.1.2 | oc is a terminal app. |
| opencode.ai website and docs site (`packages/web`, `packages/docs`) | v0.2.172 (docs v0.2.174) | They describe upstream. oc's user docs are the GitHub wiki. |
| Console, Zen and Go pages, stats site (`packages/console`, `stats`) | v0.2.172 | Upstream's hosted services. Stock model providers still work. |
| Enterprise, Slack, function, containers, identity, storybook packages | v0.2.172 | Serve upstream's hosted services or web UI. |
| Web UI component packages (`packages/ui`, `packages/session-ui`) | v0.2.174 | Only the web and desktop apps used them. The TUI keeps its notification sounds. |
| Upstream release, publish, translation, and download-stats scripts | v0.2.174 | Built for upstream's npm packages and website. |
| Localized `README.*.md` | v0.1.5 | oc docs are English only. |
| `experimental.disable_paste_summary` config option | v0.2.241 | Paste summary is off by default and toggled with `/pasteSummary` (kv). The schema still accepts the key so existing configs load; the TUI ignores it. |
| Session sharing (`/share`, `/unshare`, `run --share`, share-URL import, sidebar share link) | v0.2.264 | Upstream service discontinued (`d320177aa4`). The SDK `session.share`/`unshare` routes stay: share fails, unshare clears the stored link. |

## Not planned

| Item | Since | Reason |
|---|---|---|
| Embedded web UI in the CLI | v0.2.174 | Same as the web app. |
| OpenCode 2 execution engine (durable input admission, session runner, inbox) | v0.2.65 | oc runs the v1 session loop. See `AGENTS.md` "Session Runtime". |
| Upstream update channel and `upgrade --major` | v0.2.174 | They install stock OpenCode. oc updates come from oc's own GitHub releases. |
| Option to turn off the background server | v0.2.174 | The resident server is part of oc. Native `opencode.exe` already runs without it. |
| OpenCode 2 workspace, sandbox, and environment drivers | v0.2.174 | Part of the OpenCode 2 execution engine. |
| `/goal` autonomous goal command | v0.2.174 | Upstream dropped it. |

## Planned for later

| Item | Since | What it waits on |
|---|---|---|
| Upstream install channels (npm, brew, AUR, scoop, nix, winget) | v0.2.174 | oc's own release and update flow comes first. |
| In-TUI session tabs and terminal panes | v0.2.174 | Must fit oc's real terminal tabs. |
| Remote pairing (pair, OpenTunnel, QR codes) | v0.2.174 | Local use comes first. |
| Console-managed policies and Console sign-in | v0.2.174 | Hosted service; revisit if useful without it. |
| GitHub Action (`src/github`) | v0.2.174 | Needs an oc release to point at. |
| VS Code extension (`src/sdks/vscode`) | v0.2.174 | Needs an oc release to point at. |
| Stats poster and media generation (speech, video, images) | v0.2.174 | Not core to a coding agent. |
| Work copies on git worktrees (`/work`, `/done` redesign) | v0.2.174 | Builds on the existing project copy and worktree code. |
| Mermaid and LaTeX rendering | v0.2.174 | Needs new renderer packages. |
| Diff viewer and review scopes | v0.2.174 | Upstream builds it on OpenCode 2 session data. |
| MCP Code Mode expansion | v0.2.174 | Tied to the OpenCode 2 agent runtime. |
| Skill `disable-model-invocation` frontmatter | v0.2.174 | Claude Code already honors it; oc's own skill list does not yet. |
| Repeating scheduled prompts | v0.2.213 | A repeat interval on `session_queue` rows (schema change and migration). Until then a scheduled prompt re-arms itself. |
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
| ChatGPT Web and Claude Web browser providers (Agentify runtime) | v0.2.141 | Claude Code and Cursor providers |
| Single-window mode (`oc single`, `--single`, `--portable`, `mode`) | v0.2.157 | Native `opencode` binary |
| Work copies (`/work`, `/done`) | v0.2.171 | To be redesigned (Planned for later) |
| Manual session-handoff palette command | v0.2.215 | Automatic Context limit handoffs remain available. |
| Command markers (`$#name` preset commands) | v0.2.168 | Agent shell and edit tools could still write `markers.json` |
| SuperPlan and SuperGo planning agents (`plan_next_phase`, `plan_closeout` tools) | v0.2.281 | Stock Plan agent |
| Bash-only Claude `account` wrapper | v0.2.162 | Claude account pool |
| `/manageThirdPartyHarnesses` submenu | v0.2.165 | Palette heading |
| Standalone `oc.config.json` / `OPENCODE_OC_CONFIG` wrapper | before v0.1.1 | `oc.json` |
| External intro-script setting | before v0.1.1 | Built-in intro |
| Initial model / agent / reasoning palette settings | before v0.2.174 | Native session setup |
| Global `ignoreAgentModels` | before v0.1.1 | Per-session model memory |
| Standalone openSidebar plugin | before v0.2.174 | Native sidebar |
| Singular-only global `agent/` folder | before v0.2.174 | `agents/` (projects may still use both) |
| Snake and wave startup animations | before v0.1.1 | Column sweep |
| Windows `opencode-process-tree.exe` supervisor | before v0.1.1 | Direct spawn |
| Open Computer Use MCP | before v0.1.2 | None (uninstalled) |
| Intermediate clack "type to filter" project list | v0.1.4 | Real TUI picker |
| Cursor native plan-mode bridge | before v0.2.141 | Stock Plan agent |
| ocdebug PowerShell wrapper function | before v0.1.2 | Native `ocdebug.exe` |
| Native `ocdebug.exe` flavor and isolated debug profile | v0.2.181 | `/revive-single` native test builds sharing production data |
| OpenTUI raw-mode resume patch | v0.1.4 | Stock OpenTUI resume |
| bgShell plugin (`bgRun`, `bgStatus`, `bgKill` sibling plugin) | v0.2.177 | Built-in background shell: `bash` with `background: true`. Migration: `bgRun` becomes `bash` with `background: true`; `bgStatus` and `bgKill` keep their names. |
