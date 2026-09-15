# RULES FOR AGENTS - WRITTEN BY HUMAN. NEVER MESS WITH THIS SECTION

1. You may not delete previous sections that are not yours
2. Insert new session notes immediately under `# Historical entries (newest first)`. Newest entries stay on top. Do not append at the end of this file.
3. You should date and time the notes
4. Reference previous notes and other relevant sections
5. Make sure mistakes and errors are EXTRA highlighted, so we never make the same mistake twice
6. NEVER, EVER, EVER, UNDER ANY CIRCUMSTANCES DELETE ANYTHING FROM THIS FILE

# AGENT NOTES BEGIN HERE - THIS IS WHERE YOU WRITE

File layout: rules and summaries above; historical session entries below, newest first. Agents add each new entry at the top of that historical section so the insert line and the start-reading line stay the same.

## Entry format (working example)

Copy this shape for every session that changes the repo. Agent workflow rules live in `AGENTS.md`.

```

---

## YYYY-MM-DD (~HH:MM) - short plain-English title - Model name, Thinking; Plan

### Agent
- Meta: one-line session context (model / effort / mode / tokens est)
- Verb-led bullets with file/type/method names, root cause as a clause, invariants

### User
Category label
- Plain-language what changed for someone using the app
```

## Archive Rotation

- The active `buildNotes.md` is the working history file.
- When the entire active file exceeds 1,000 lines, archive it before adding more session history. Count every line: human rules, summaries, entries, blank lines, and separators.
- Rename the complete file unchanged to the next available archive name: `buildNotes.archive1.md`, then `buildNotes.archive2.md`, then `buildNotes.archive3.md`, and so on.
- Find the highest existing archive number and use the next number. Do not reuse a missing number.
- Never delete, truncate, overwrite, or compact an archive. The archive must preserve the previous active file verbatim.
- Create a fresh `buildNotes.md` with the human rules, a cumulative summary, then `# Historical entries (newest first)` and session entries newest-first under that heading.
- The cumulative summary must cover all previous archives, not only the newest archive.
- Include both a compact `## Agent` summary and a normal plain-English `## User` summary.
- Do not impose a fixed maximum size on the cumulative summary. Keep it as compact as possible without losing information needed for future work.
- Read only the active `buildNotes.md` by default. Start reading historical entries at `# Historical entries (newest first)`. Read archived files when the active summary lacks required context.

### Cumulative Summary Shape

```md
# Cumulative Summary

## Agent
- Added `Thing::run`: shared path handling; removes duplicate logic
- Fixed null path crash: early return at boundary
- Kept `LegacyMode`: external callers depend on it

## User
- Startup now handles missing paths without crashing
- Shared path handling removes duplicate behavior
```

## Agent Note Language

- Keep `### Agent` notes dense, factual, and written for the next agent.
- Use short, agent-forward vocabulary: `Added`, `Fixed`, `Removed`, `Moved`, `Changed`, `Kept`, `Blocked`, `TODO`, `Risk`, `Note`, `MISTAKE`, and `ERROR`.
- Omit articles and filler words when meaning stays clear: `Fixed null path crash; early return` is preferred over `Fixed the crash caused by a null path by returning early`.
- Keep one idea per bullet.
- Include file, type, method, cause, result, invariant, or risk only when useful for future work.
- Do not shorten away information needed to continue safely.
- Use `MISTAKE:` for an agent-caused mistake, process violation, or incorrect change. Make it explicit and explain the prevention rule.
- Use `ERROR:` for an observed product, build, runtime, or tooling failure that is not necessarily caused by the agent.
- Keep the `Meta` line compact. Include model, mode, and token estimate only when useful.
- Keep `### User` notes in normal plain English. Do not use grug shorthand in User notes.

Example compact Agent notes:

```md
### Agent
- Meta: GPT-5.6 Luna; build; tokens est
- Fixed `Thing::run`: null path crash; early return
- Added `Parser::read`: shared by A/B; removes dupes
- Kept `LegacyMode`: external callers depend on it
- MISTAKE: edited release notes; agents must paste release text in chat only
```

### MISTAKES - NEVER REPEAT
- Agents have wiped buildNotes files in other repos. INSERT ONLY during normal work: add a new entry immediately under `# Historical entries (newest first)`. Never truncate, overwrite, rewrite, compact, or append at EOF. Never use the Write tool on an existing `buildNotes.md` unless the user explicitly orders a one-time migration. The documented archive rotation is the approved migration when the line threshold is exceeded.
- NO EM DASHES (U+2014) anywhere. Use `-` or `:`.
- Do not edit `buildNotes.txt` from agent sessions; paste release notes in chat for the user.
- Do not create `.md/buildNotes.md`, `.md/.buildNotes.md`, or `.md/buildNotes.txt`. Agent history and user release notes are root `buildNotes.md` and root `buildNotes.txt`.

### Project invariants (do not regress)
- Isolated upstream lives at `UPSTREAM\opencode`; custom source stays in the parent checkout. Sync via `UPSTREAM-SYNC.md` / `.scripts\syncAndInstall.ps1`; no unrelated-history merge; do not commit/push unless asked.
- Version SoT is `.version\version` (maintenance display only; do not bump OpenCode package version). Agents never edit `buildNotes.txt`.
- Default branch is `dev`. Do not ship `opencode.exe` compiled with Bun 1.4.0 (`bun:ffi` TUI crash).
- Do not treat empty tool lists as compaction. Protect local `.scripts`, `.version`, `AGENTS.md`, `SCRIPTS.md`, `buildNotes.md`, `UPSTREAM-SYNC.md`, `CONTEXT.md`, TUI display-version, and custom declaration fixes during upstream apply.
- Installer may stop running `opencode` processes; do not kill them from other agent work. Live install often blocked while `C:\Users\user\Apps\opencode\opencode.exe` is in use.

# Cumulative Summary

- `buildNotes.archive1.md`: 2026-08-20 through 2026-09-09 (1023 lines). `buildNotes.archive2.md`: 2026-09-09 through 2026-09-15 (682 lines; SHA256 `15BF8525C5DD8367654E679F4FB15CC58B0268F2A5C1063B84A4F62BF2E2B869`). Do not edit archives.

## Agent
- Added local `.scripts` (build/check/run/install/push/updateUpstream/syncAndInstall), `.install.ps1`, `.version\version`, `UPSTREAM-SYNC.md`; `-Release` sets `OPENCODE_RELEASE`; install builds by default (`-NoBuild`/`-nb`); timestamped `.bak`; fail-closed dirty parent.
- Added isolated `UPSTREAM\opencode` refresh; content-level three-way apply; persist SHA in `.scripts\upstream-sync.state.json`; bump last `.version\version` number on successful apply that advances `dev`.
- Embedded maintenance version in compiled TUI footer via optional `TuiApp.displayVersion`; CLI `OPENCODE_VERSION` unchanged.
- Added `resolveCurrentModel`; CLI model before agent/recent; validate stored per-agent models; optional `TuiState.currentModel`.
- Removed 100ms `GetConsoleMode` poll (`win32InstallCtrlCGuard`); Bun 1.4.0 `bun:ffi` still unsafe to ship.
- Added native session bootstrap CLI; global `/experimental/session` list; `mergeSessionList` keeps attached/hydrated sessions; ignore workspace `query.directory` on global list.
- Added `sessionComplete` / `sessionFailed` (mutual exclusive, preserve `time.updated`); tools default-deny; TUI toggles `ctrl+shift+return` / `ctrl+shift+backspace`.
- Lazy CLI command loader: TUI path loads TUI only; `--version` ~153ms to ~37ms.
- Added `ctrl+shift+up/down` input aliases.
- Added built-in Agentify: `packages/agentify-runtime` Node+Edge CDP; `agentify.ts` lazy supervisor; `agentify/chatgpt-web` then `agentify/claude-web`; empty `api.url` caused Invalid URL, placeholder `http://127.0.0.1/v1`; compiled runtime beside `process.execPath`; copy runtime in `build.ts` / `install.ps1`; one window per affinity; single-attempt send.
- Added `ServerLifecycle`, `/global/shutdown` `/global/restart`, TUI confirm palette; `install.ps1` waits for `opencode` exit.
- Added `server.startOnWindowsUserStart`; folded standalone `oc.config.json` into `~/.config/opencode/oc.json`; native intro column sweep in `cli/intro.ts`.
- Native Cursor provider under `packages/opencode/src/provider/cursor` (0.6.2 then 0.6.7 catalog/pricing/Fast, SSRF/symlink/git-cred hardening, agent.v1 shell/git_diff, lazy Node HTTP/2 proxy); tools=[] must not wait forever for catalogs; do not infer compact from empty tools.
- Folded openSidebar into native TUI; WezTerm: map `wezterm-gui.exe` to sibling `wezterm.exe`.
- Assistant timestamps: `time.created` while running, `time.completed` after; date+time before duration.
- Agent config: `tab_order`, `{file:}` prompt includes, `display_name` / TUI `local.agent.label`; Markdown agents under `~/.config/opencode/agents\` (plural).
- SuperPlan planning-only perms (edit only under `~\.config\opencode\plans\`); `rg` + Everything MCP; archive completed plans to `plans\archive\`; split `sp.md`/`sp-a.md`/`go.md`/`go-a.md`; Go-a Tier 2/3 only; no Luna Max/`xhigh` (Luna `openai/gpt-5.6-luna` `variant: high`).
- Session model: `model.json` per-session override, not global `ignoreAgentModels`; failed switch must not update local selection.
- Sidebar: idle-coalesced usage refresh; `usageProviders` picker (Codex/Cursor/Go/OpenRouter default on).
- `oc config set/get` nested under one Yargs `config` command.
- SuperPlan+ : parallel `task` with `background: true`; `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true`.
- Windows spawn: hide cancellation without extra `cmd`; V2 Bash `Shell.args` + `Shell.preferred`; process-tree helper `opencode-process-tree.exe` (protocol 1, x64/arm64); no `CREATE_NO_WINDOW` for Git (MSYS2 conhost); attach parent console + `SW_HIDE`; no AllocConsole (unhides on job kill); inherit parent console else `CREATE_NO_WINDOW`. Installed helper SHA256 `0615E5AEC4F21B67F0CA2F37D7B81705A68549688DF5B5D3A10303F947C43543`.
- Everything MCP: Windows auto-start `EVERYTHING_EXE_PATH` or installed paths, `-first-instance -startup`, reconnect, no shutdown ownership.
- Debug logging: channel-aware, 20 MB rotate, `/debug-logging`, palette toggle.
- SSE: clear `headerTimeout` when headers resolve; `enabled_providers: []` is empty allowlist / `NoProvidersError`.
- ERROR / remaining: `packages/tui/src/context/local.tsx:188` has blocked OpenCode typecheck in some sessions; live Cursor/ChatGPT/Everything/no-flash smoke often pending; install often blocked by running `opencode.exe`; Everything recovery and process-tree no-flash plans unarchived; full `bun test` has unrelated event-manifest/session-bootstrap/plugin failures.
- Checkout path is `C:\Users\user\Documents\GitHub\oc`.

## User
Local tooling
- Scripts can build, check, run, install, and sync this OpenCode fork from PowerShell. Install rebuilds unless you pass `-nb`. Upstream updates go through a separate checkout, then a careful apply into this fork.

Version and settings
- The TUI footer shows the fork maintenance version. A model you pass at start beats saved agent defaults until you change it in the session. Per-session model picks persist. OC settings live in OpenCode's own config, not a separate wrapper file.

Sessions and startup
- You can start a project session without calling a model. Sessions from every project show in one list. Complete and failed marks stay visible without archiving. Startup loads fewer CLI commands, so version checks are faster.

Providers
- ChatGPT Web and Claude Web are built-in browser models that start Edge on first use. Cursor is an optional native provider. Server shutdown/restart and Windows auto-start live in the command palette.

Agents and sidebar
- Custom agents load from the plural `agents` folder, can share prompt files, and can show friendly names and a Tab order. SuperPlan stays read/search/plan-only. SuperGo has separate Go and Go-a prompts. The sidebar can pick which weekly usage providers to show, and Everything Search can be started automatically on Windows.

Windows
- Hidden Git and shell work tries to avoid extra console windows. A process-tree helper ships beside `opencode.exe`. Installing a new build stops running OpenCode first.

# Historical entries (newest first)

---

## 2026-09-15 (~03:36) - newest-first buildNotes insert - Cursor Grok 4.6, Thinking; Agent

### Agent
- Meta: User-ordered notes-layout apply after SuperPlan `2026-09-15-buildnotes-newest-first.md`.
- Changed `buildNotes.md` layout: rules/summaries then `# Historical entries (newest first)`; insert under that heading; do not append at EOF.
- Changed MISTAKES from APPEND ONLY to INSERT ONLY at the historical heading.
- Added `AGENTS.md` Build notes section; retuned `UPSTREAM-SYNC.md` verification to insert newest-first.
- Kept archives and `buildNotes.txt` unchanged.

### User
Project notes
- New session notes now go at the top of the history section, right under the historical-entries heading.
- Agents can start reading the latest work at that same heading instead of scrolling to the end of the file.

---

## 2026-09-15 (~03:26) - archive and compact buildNotes.md - Cursor Grok 4.6, Thinking; Plan

### Agent
- Meta: User-ordered archive rotation (file-length compact); not a source/product change.
- Copied active `buildNotes.md` verbatim to `buildNotes.archive2.md` (SHA256 match `15BF8525...`); left `buildNotes.archive1.md` untouched.
- Wrote fresh `buildNotes.md` with human rules, archive-rotation contract, OC invariants, and cumulative Agent/User summaries covering archive1+archive2.
- Kept `buildNotes.txt` unchanged. No commit/push/build.

### User
Project notes
- Older session history now lives in `buildNotes.archive1.md` and `buildNotes.archive2.md`.
- The live notes file is short again and starts with the archive rules so the next overflow can rotate to `buildNotes.archive3.md`.

