<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">The open source AI coding agent.</p>
<p align="center">
  <a href="https://opencode.ai/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/opencode-ai"><img alt="npm" src="https://img.shields.io/npm/v/opencode-ai?style=flat-square" /></a>
  <a href="https://github.com/anomalyco/opencode/actions/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/anomalyco/opencode/publish.yml?style=flat-square&branch=dev" /></a>
</p>

[![OpenCode Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://opencode.ai)

This file is the native-OpenCode map for this checkout (Now / Keep / Upstream). It records which stock surfaces still live here, whether they should stay stock, and whether they match isolated upstream or are pinned / lagging / gone on purpose.

Fork-only OC work stays in [FORK.md](./FORK.md). Do not copy those rows here.

Last reviewed: 2026-09-21. Compared against isolated `UPSTREAM/opencode` at `5cd8e68` (same SHA as `.scripts/upstream-sync.state.json`). That nested checkout is the sync source of truth.

---

## Tracking

Labels are exact. Use them as written.

**Now** (what this tree is)

| Label | Meaning |
| --- | --- |
| **native** | Stock OpenCode. No meaningful OC change. |
| **mixed** | Native core, with OC layered on. |
| **removed** | Isolated upstream still has it. This checkout does not. |

**Keep** (policy). If this differs from **Now**, the row is a decision, not a task list.

| Label | Meaning |
| --- | --- |
| **native** | Should remain (or return to) stock. OC must not own it. |
| **mixed** | Native core stays; OC extras stay OC. |
| **removed** | Do not bring it back. |

**Upstream** (vs isolated `UPSTREAM/opencode`, not a live GitHub fetch)

| Label | Meaning |
| --- | --- |
| **same** | This aspect matches isolated upstream. |
| **lag** | Isolated upstream has newer native behavior we did not take. Not a pin. |
| **pin** | Different on purpose. Name the pin in Notes. |
| **gone** | We removed it. Upstream still has it. |

Add a row when a native surface lands, is overlaid, is pinned, or is deleted. After an upstream sync, walk the table. Change **Upstream** when native behavior moved. Change **Now** when OC starts or stops owning a surface. Lift a **pin** only when the freeze is actually dropped. OC-only features never belong here.

| Aspect | Now | Keep | Upstream | Notes |
| --- | --- | --- | --- | --- |
| Chat, tools, sessions | native | native | same | Core agent loop. |
| TUI renderer | native | native | same | Catalog `@opentui/*` **0.4.5**, matching isolated upstream. No OpenTUI resume patch. Paint, key, and `/editor` resume still need a live Windows check. |
| TUI chrome | mixed | mixed | same | Stock prompt, slash commands, sessions. OC adds timestamps, copy, some keys. |
| Session sidebar | mixed | mixed | same | Stock plugins still registered: context, MCP, LSP, todos. Stock files/footer plugins exist in source but are **not** registered; OC `sidebar-tools` replaced them. |
| Built-in agents | native | native | same | `build`, `plan`, `general`, `explore`, plus hidden compaction/title/summary. User config may `disable` Plan. |
| Markdown agents | mixed | mixed | same | Stock loads `agents/` and `agent/`. OC adds `tab_order`, `display_name`, prompt `{file:...}`, and `opencode agent validate`. |
| CLI `opencode` | mixed | mixed | same | Stock commands remain. This tree lazy-loads them (OC). No `opencode web`. Extra `oc` command is OC. |
| `opencode serve` / API | mixed | mixed | same | Stock HTTP API. OC resident server and `oc` attach sit on top. |
| MCP, plugins, skills | native | native | same | Stock. |
| Config (`opencode.json`, `tui.json`, `.opencode/`) | native | native | same | Stock locations. |
| Stock model providers | native | native | same | ChatGPT Web / Claude Web / Cursor-as-model are OC. |
| VS Code extension | native | native | same | `sdks/vscode` |
| GitHub Action | native | native | same | `github/` |
| ACP | native | native | same | Stock. |
| Desktop / Electron | removed | removed | gone | `packages/desktop` gone. |
| Web app / `opencode web` | removed | removed | gone | `packages/app` and `WebCommand` gone. `packages/web` docs source remains; it is not a shipped app. |
| Docs site source | native | native | lag | `packages/web` still has leftover desktop / `opencode web` wording. |
| Localized `README.*.md` | removed | removed | gone | Deleted in v0.1.5. Isolated upstream still has 21. |
| Install / run | mixed | mixed | gone | This checkout: `bun dev` and `.scripts` (see `SCRIPTS.md`). Upstream curl/npm/brew installers are not this fork. |

---

## This checkout

OpenCode here is CLI, TUI, and API. Desktop and `opencode web` are **removed** and should stay removed.

Run from source (Bun 1.3+):

```bash
bun install
bun dev .
```

`bun dev` is the local equivalent of the `opencode` binary. Pass a project directory, or `.` for this repo. Windows production builds and install live in [SCRIPTS.md](./SCRIPTS.md).

Official npm, brew, scoop, and `curl -fsSL https://opencode.ai/install | bash` packages install **upstream** OpenCode from [opencode.ai](https://opencode.ai), not this fork.

---

## Terminal UI

`opencode` with no subcommand starts the TUI.

- Sessions, models, slash commands (`/new`, `/sessions`, `/models`, `/undo`, `/redo`, `/editor`, `/share`, `/compact`, `/connect`, `/init`)
- `@filename` to attach files, `@agent-name` to invoke a subagent, `!command` for a one-line shell prompt
- Native sidebar plugins: context, MCP, LSP, todos. Files, git-style diffs, usage, and script launch in the sidebar are OC (`FORK.md`).

The drawing layer is OpenTUI **0.4.5**, matching isolated upstream.

---

## Agents

`Tab` / `Shift+Tab` cycle **visible primary** agents. Config can `disable` or hide an agent, including stock Plan.

**Primary**

- **build** - Default. Full tool access for development work.
- **plan** - Planning and analysis. Denies most file edits. Can still write plan markdown under `.opencode/plans/` and the global plans directory. Under the default ruleset, bash is allowed (not prompted).

**Subagents** (also `@mention`)

- **general** - Complex research and parallel multi-step work. `@general`
- **explore** - Fast codebase search. Does not edit files. `@explore`

Hidden system agents (`compaction`, `title`, `summary`) are not in the Tab cycle.

Markdown agents load from `agents/` (canonical) and `agent/` (still accepted). `opencode agent create` and `opencode agent list` are native.

Learn more about [agents](https://opencode.ai/docs/agents).

---

## CLI

The native command name is `opencode`.

| Command | What it does |
| --- | --- |
| `opencode [dir]` | Start the TUI |
| `opencode run "..."` | Non-interactive prompt |
| `opencode serve` | Headless HTTP API (commonly port 4096) |
| `opencode attach <url>` | Attach a TUI to a running server |
| `opencode agent` | Create or list agents |
| `opencode mcp` / `plugin` / `models` / `session` | MCP, plugins, models, sessions |
| `opencode github` / `acp` | GitHub Action setup and ACP |
| `opencode export` / `import` | Session export and import |

Useful TUI flags: `--continue` / `-c`, `--session`, `--model`, `--agent`.

Also in this tree: the [VS Code extension](./sdks/vscode/README.md) and the [GitHub Action](./github/README.md).

`oc`, `occ`, and `ocdebug` are OC launchers.

---

## Config

- `opencode.json` or `opencode.jsonc` - runtime, models, permissions, MCP (project and `~/.config/opencode/`)
- `tui.json` - TUI and keybinds (`~/.config/opencode/tui.json` or project)
- `.opencode/` - `agents/` (or `agent/`), `commands/`, `plugins/`, `skills/`, `tools/`, `themes/`

Add `"$schema": "https://opencode.ai/config.json"` (and `https://opencode.ai/tui.json` for the TUI file) for editor autocomplete.

---

## Documentation

Hosted OpenCode docs: [opencode.ai/docs](https://opencode.ai/docs) (upstream; may describe desktop and `opencode web`).

This checkout: [FORK.md](./FORK.md) (OC extras), [SCRIPTS.md](./SCRIPTS.md) (build, install, sync), [CONTRIBUTING.md](./CONTRIBUTING.md) (upstream contribution guide).

## Contributing

If you're interested in contributing to OpenCode, please read [CONTRIBUTING.md](./CONTRIBUTING.md) before submitting a pull request. That guide is written for upstream OpenCode. Layout and agent rules for this checkout are in [AGENTS.md](./AGENTS.md).

## Building on OpenCode

If you are working on a project that's related to OpenCode and is using "opencode" as part of its name, for example "opencode-dashboard" or "opencode-mobile", please add a note to your README to clarify that it is not built by the OpenCode team and is not affiliated with us in any way.

---

**Join our community** [Discord](https://discord.gg/opencode) | [X.com](https://x.com/opencode)
