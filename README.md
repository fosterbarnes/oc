# oc

<!-- TODO(user): write the hook yourself (1-2 sentences on what oc is). Current text kept until then. -->
'Snapshot' of OpenCode version 1.18.29. oc aims to add new features, and enhancements to existing ones. Its base functionality has elements of v2's codebase, while still remaining rooted fundamentally in v1 practices.

## Standout features

- Claude Code models in `/models`, using your own Claude Code login ([how](#claude-code))
- Cursor models in `/models`, using your Cursor login (beta) ([how](#cursor))
- `oc <folder>` opens a ready session; `occ` reopens your last one ([how](#oc-and-occ))
- One background server shared by every window, so launches after the first are fast (beta) ([how](#background-server))
- One session list for every project ([how](#session-list-and-markers))
- Mark sessions complete, failed, or in progress, and pin them (beta) ([how](#session-list-and-markers))
- `/work` moves a session into a git copy of the project; `/done` merges the changes back ([how](#work-and-done))
- A sidebar with usage meters, sub-agents, a file tree, and changed files, all clickable ([how](#sidebar))
- Run your project's scripts from the sidebar in one click ([how](#script-runner))
- `/commands` and skills reload as you edit them, no restart needed ([how](#commands-and-skills))
- Combine commands and skills in one prompt, like `/spit /think` ([how](#commands-and-skills))

## Quality of life

### Sessions
- `ctrl+return` on Home sends the prompt and keeps you on Home, so you can start several in a row
- New sessions name themselves after your first prompt (`<folder> - <task>`)
- Each session remembers its own model and reasoning level
- Agent questions survive closing the window: reopen the session and answer

### Launching
- `ctrl+n` picks a folder and starts a session there
- Startup animation with no blank gap before the app appears
- Faster startup for every command
- `/revive` restarts or rebuilds oc in place
- `oc single` runs everything in one window with no background server, like stock OpenCode (beta)

### Claude Code
- The context % updates live during Claude Code turns
- Update Claude Code from the oc menu

### Commands and tools
- Favorite `/commands` and skills with `ctrl+f`
- A `time` tool tells agents your local time for about 12 tokens
- Command markers: agents run your preset commands with one line instead of a tool call, and long output is cut to its end (alpha)

### Look and feel
- The terminal tab shows a square in the agent's color, plus busy and idle progress
- Replies show a timestamp and how long they took (beta)
- Double-click selects a word, triple-click a line, and copying keeps the highlight
- Reorder favorite models and hide models you never use
- Changed files open in the editor you pick for each file type

## Requirements

- Windows 10 or 11, x64
- PowerShell 7 (`pwsh`) on PATH

Some features need extra software:

| Feature | Needs |
|---|---|
| Claude Code models | Claude Code CLI (`claude`), installed and signed in |
| Cursor models | Node.js on PATH and a Cursor account |
| `/work` and `/done` | Git, and the project must be a git repository |
| Sidebar file search | [Everything](https://www.voidtools.com/) running, with `es.exe` on PATH |
| Scripts opening in a new tab or split | WezTerm or Windows Terminal |
| `/revive` rebuilding oc | Bun (not 1.4.0) and a copy of oc's source |

## Install

<!-- TODO(release): there is no public installer yet. The release zip has no oc.exe/occ.exe,
and .scripts/install.ps1 targets a fixed personal folder. Update these steps when that is fixed. -->

1. Download the latest `windows-x64` zip from [Releases](https://github.com/fosterbarnes/oc/releases).
2. Extract it to a folder you keep, for example `%LOCALAPPDATA%\oc`.
3. Add that folder to your PATH.
4. Open a new PowerShell 7 window and run `oc`.

The first launch starts the background server. Later launches connect to it, so they open faster.

To use Claude Code models, install and sign in to the Claude Code CLI first. To use Cursor
models, pick a Cursor model in `/models` and sign in through your browser.

## Behavior changes

Things that work differently from stock OpenCode:

- **Quitting:** `ctrl+c` clears the prompt and never quits. Quit with `ctrl+x q` or `/exit`.
- **Keys:** many keys differ (table below). Switch to stock OpenCode keys with **Keybind layout** in `ctrl+o`.
- **Closing the last window doesn't stop oc:** the background server keeps running, so the next
  launch opens where you left off. Stop it with `oc --kill-server` or from `ctrl+o`.
- **The session list shows every project,** not just the folder you're in. Picking a session opens
  it in its own folder.
- **oc sessions are named `<folder> - <task>`** after your first prompt, using `/rename`'s model.
- **Sending a prompt marks the session in progress.** Agents can't mark it complete or failed
  unless you allow it ([how](#session-list-and-markers)).

New keys (`ctrl+x` is the leader key: press it, then the next key):

| Key | Where | Action |
|---|---|---|
| `ctrl+return` | Home | Send the prompt to a new session and stay on Home |
| `ctrl+n` | Anywhere | Pick a folder in your home directory and start a session there |
| `ctrl+o` | Anywhere | List oc commands |
| `ctrl+x d` / `v` / `w` | Anywhere | Set the default model / reasoning effort / agent |
| `ctrl+x j` / `k` | Anywhere | Set the default sub-agent / sub-agent model |
| `ctrl+x o` / `i` | Anywhere | Set the home directory / how its folders are sorted in the `ctrl+n` list |
| `ctrl+s`, `ctrl+f`, `ctrl+shift+return` / `backspace` / `i` | Session list | Filter, pin, and mark sessions ([how](#session-list-and-markers)) |
| `shift+up` / `shift+down` | Model list | Move a favorite model up or down |
| `ctrl+h` | Model list | Hide or show a model |
| `ctrl+shift+up` / `ctrl+shift+down` | Prompt | Move the cursor up or down a line |
| `ctrl+m` / `ctrl+s` / `ctrl+b` | Anywhere | Model list / session list / first child session |
| `ctrl+d` | Prompt | Cycle the model variant |
| `ctrl+shift+h` | Anywhere | Go to Home |

- All keys: [docs/keybinds.md](docs/keybinds.md). Switch to stock OpenCode keys with **Keybind layout** in `ctrl+o`.
- Rebind any key in `tui.json`. `command_palette.order` in `opencode.jsonc` reorders commands inside a palette category.

## How it works

### oc and occ

- `oc` opens oc in your OC directory (your home folder by default).
- `oc <folder>` opens a project: an absolute path, or a folder name under your home folder. The
  session is ready before the window appears.
- `occ` reopens your most recent session, from any project.
- `oc previous --depth <n>` goes further back: `--depth 2` is the session before that, up to 50.

### Background server

The first `oc` you run starts one OpenCode server in the background (port 4096, this machine
only, password-protected). Every `oc` window after that connects to the same server instead of
starting its own, and the server keeps running after you close the last window.

- `oc --restart-server` restarts it and keeps your windows open.
- `oc --kill-server` stops it and closes this instance's oc windows.
- `oc --shutdown-all` closes this instance's oc windows and terminal panes, then stops the server.
  Other programs and the debug instance are left alone.
- Shut down and restart are also in `ctrl+o`.

Change the port with `server.port` in `~/.config/opencode/oc.json`.

**Start server at Windows sign-in** in `ctrl+o` registers startup for your Windows account.
It starts the background server without opening a window. Turn it off to remove that startup
entry. Production and debug have separate entries. If you enabled the old, inactive setting,
select on again after updating to register it.

### Single mode

`oc single [folder]` runs a whole oc session inside one window, like stock OpenCode: same session
list, no background server. `oc config set mode single` makes `oc` and `occ` always open single
windows; `--single` does it once. `--portable` uses a separate `ocPortable.db` database. Closing a
single window stops running work cleanly. Single windows show `single` in the footer and a `⦿`
instead of a square in the terminal tab. (beta)

A session can only run in one oc process at a time; another process gets "Session is running in
another oc process".

### Session list and markers

Stock OpenCode lists only the current project's sessions. oc's session list shows sessions from
every project, and picking one opens it in its own project folder.

| Key (in the session list) | Action |
|---|---|
| `ctrl+shift+return` | Mark complete (:white_check_mark:) or clear |
| `ctrl+shift+backspace` | Mark failed (:x:) or clear |
| `ctrl+shift+i` | Mark in progress (-) or clear |
| `ctrl+f` | Pin to the top of the list, or unpin |
| `ctrl+s` | Filter by: unmarked, in progress, pinned, complete, failed |

A session holds one mark at a time. Sending a prompt marks the session in progress, including a
session that was complete or failed. Agents can't mark a session complete or failed unless you
allow the `session_complete` or `session_failed` permission, for example only for one command
(see [Commands and skills](#commands-and-skills)).

**Names:** sessions opened with `oc <folder>`, the `ctrl+n` picker, or Home in an oc window are
named `<folder> - <task>` after your first prompt, using `/rename`'s model. Names you set yourself
are kept. `/rename` tries again at any time.

**Questions:** if an agent asks a question and you close the window or the server restarts,
reopen the session and answer; the agent carries on. Stopping a session clears an open question.

### `/work` and `/done`

`/work` copies the project into a git worktree next to it and moves the session there. The copy
includes your staged, unstaged, and untracked changes; your own folder and git index are not
touched. Ignored regular root `.env*` files are copied; other ignored files are not. If the
project has a `package.json`, the copy gets a `bun install`. `/work` waits until the current turn
is idle. The agent is told it is in a copy: changes merge back unstaged, it must not commit, and
it should call `work_done` when finished (or you can run `/done`). `/work` is user-only.

`/done` queues merge-back until the current turn succeeds, then brings the copy's changes into
the original folder as unstaged edits, leaves your own work there alone, moves the session back,
and deletes the copy. It never commits. Differences in whitespace or line endings alone are
ignored. If both sides changed the same lines, your folder is left untouched, the copy gets
conflict markers (binaries, deletions, and renames have none), and the agent is asked to inspect
both sides, resolve every listed path, and call `work_done` with those paths. The server retries
after that turn; at most two resolution rounds. A bare `/done` does not certify pending
conflicts. A copy made from a copy returns to the copy it came from; finish nested copies before
their parent. If cleanup fails after a successful merge, `/done` again from the parent finishes
it. After a server restart, run `/done` again to resume.

### Sidebar

Top to bottom:

- **Session, model, and reasoning:** click to switch session, change model, or cycle reasoning level. These follow the current session.
- **Usage:** weekly usage for Codex, Cursor, Go, and OpenRouter, plus Claude if you turn it on (it reads Claude Code's saved login token to fetch the numbers). Stale numbers are dimmed; hover for their age. Pick providers with `Configure weekly usage providers`.
- **Context, MCP, and LSP** (from stock OpenCode).
- **Sub-agents:** the session's running and recently finished sub-agents. Click one to open it.
- **Todos** (from stock OpenCode).
- **Scripts:** see [Script runner](#script-runner).
- **Files:** a tree of the project, or any folder you set as the file root. Click a file to put its path in your prompt; right-click to also copy it. Search uses [Everything](https://www.voidtools.com/) (needs `es.exe` on PATH and Everything running).
- **Changed files:** click to open in your editor (`openEditedWith`, set per file extension).
- **Footer:** project path and git branch.

Settings are saved to `~/.config/openSidebar/config.json`, or `.config/openSidebar.json` in a project to override them there.

### Script runner

The sidebar lists two kinds of scripts:

- `package.json` scripts, run with the project's package manager (bun, pnpm, yarn, or npm, from the lock file).
- Files in the project's `.scripts` folder, run by extension: PowerShell, sh, Bash, Zsh, Python, Node, TypeScript, cmd, Ruby, and PHP by default.

Click a script to run it. Right-click to paste it into your prompt and copy it. Pinned scripts (`*`) sort first.

`Configure project scripts` sets the shell, which languages and extensions count (add your own), and where scripts open. In WezTerm or Windows Terminal that can be a new tab, a new window, or a split; elsewhere they open in their own window.

### Claude Code

oc runs the Claude Code CLI installed on your machine, signed in with your own account. Claude
Code keeps its own system prompt, built-in tools, transcript, and `/compact`. oc streams the
replies into the session, and the context % updates while a turn is still running.

- **Skills:** oc's skills load as native Claude Code skills.
- **oc tools:** oc offers some of its own tools to Claude through the `proxyTools` setting. The
  default is subagents (`Task`), `run_after_turn`, and `time`; add `Question` for oc's question
  prompts. Subagents started this way show up in oc's sidebar.
- **Todos:** with todos on, Claude's task list fills oc's todo list at the end of each turn.
- **Start fresh:** a new Claude conversation in an existing chat gets your last exchange, so it
  isn't starting blind.
- **Update:** `ctrl+o` has an **Update Claude Code** entry that runs `claude update`.

If Claude says your account isn't logged in, run `claude auth login` and resend your message.
Extra Claude accounts (`account` option) only work on macOS and Linux for now.

### Cursor

oc signs in through Cursor's browser login and talks to Cursor's service directly, so the Cursor
app does not need to be open. A small local relay (`cursor-runtime`, needs Node.js on PATH)
carries the connection; it starts the first time you use a Cursor model and stops with the
server. Cursor's own plan mode is turned off so oc's planning agents stay in charge. Based on
[oakimov/cursor-opencode-provider](https://github.com/oakimov/cursor-opencode-provider). (beta)

### Commands and skills

<!-- TODO(user): explain why combining /commands and skills is useful. Screenshot:
C:\Users\user\Downloads\wezterm-gui_ENeKaRMapw.png -> move to docs/assets/. -->

- **Hot reload:** edit a command or skill file and the next `/` menu has the change. If a file
  breaks, oc keeps the last version that worked and shows a toast.
- **Labels:** the `/` menu marks where each entry comes from: `:(oc)`, `:(command)`, `:(mcp)`,
  `:(skill)`. A command wins over a skill with the same name.
- **Favorites:** `ctrl+f` in the `/` menu pins an entry to the top of the empty search.
- **Combining:** type several, like `/spit /think`, and they are sent as one turn with labeled
  instructions. The first command decides the agent and model.
- **Per-command permissions:** a `permission:` block in a command file's frontmatter (`allow` or
  `deny` per tool) applies only to that command's turn. For example, a planning command can allow
  writing plan files and nothing else, or a command can allow `session_complete`.

### Command markers (alpha)

Off by default. Turn them on with **Command markers (alpha)** in `ctrl+o`, then list your commands
in `~/.config/opencode/markers.json`:

```json
{
  "enabled": true,
  "ask": false,
  "commands": {
    "build": { "run": ["pwsh", "-File", ".scripts/build.ps1"], "mode": "inline", "description": "Build the project" }
  }
}
```

When an agent writes a line that is just `$#build`, oc runs it with no tool call:

- `inline`: the last 4,000 characters of output replace the line (30-second timeout by default).
- `window`: opens a visible PowerShell window (Windows only).
- `afterTurn`: runs once the session is idle.

`ask: true` (globally or per command) asks you first. Runs are logged to `markers.log`.

### Revive

`/revive` restarts this oc instance and its terminal window, then reopens `occ` (your last
session) or `oc` (set `revive.launcher`). The first time, it asks where oc's source is: an
existing folder, a fresh download of this repo, or no source (restart only). With a source, it
runs `bun install` and builds oc, swaps in the new files with rollback if anything fails, and
then restarts. `/revive-no-install` only restarts. Progress goes to `revive.log`.

### Windows integration

- **Terminal tab:** the title starts with `■` in the active agent's color, and busy, idle, and
  error states show as tab progress where the terminal supports it. WezTerm colors the square
  through a tab-title snippet in [v0.3.0.md](v0.3.0.md).
- **WezTerm and Windows Terminal:** scripts can open in a new tab, window, or split.
- **File search:** the sidebar uses [Everything](https://www.voidtools.com/) through `es.exe`.
- **No flashing consoles:** the background server and its child processes run hidden.
- **PowerShell 7** is required; the launcher uses `pwsh` to start the server.

## Configuration

oc reads stock OpenCode settings as usual. These are the ones oc adds. Config files live in
`%USERPROFILE%\.config\opencode\`.

**`oc.json`** (launcher; `oc config get` / `oc config set <key> <value>`):

| Key | Values | What it does |
|---|---|---|
| `ocDir` | folder | Where bare `oc` opens. Default: your home folder |
| `homeDir` | folder | Parent folder for `oc <name>` and the `ctrl+n` list. Default: your home folder |
| `homeDirSort` | `name`, `modified` | How the `ctrl+n` list is sorted |
| `reasoningEffort` | `low`, `medium`, `high`, `xhigh`, `max`, `default` | Default reasoning for models supporting that variant; explicit session and model choices win |
| `mode` | `resident`, `single` | Background server (default) or single windows |
| `server.port` | number | Background server port. Default 4096 (debug 4097) |
| `server.startOnWindowsUserStart` | boolean | Sign-in startup preference; use the palette or `oc config set serverStartOnWindowsUserStart true/false` to update registration |
| `revive.launcher` | `occ`, `oc` | What `/revive` reopens. Default `occ` |
| `revive.build` | `false` or `{ "source": "<folder>", "debug": false }` | Where `/revive` builds from; `false` = restart only |
| `intro.background` | `terminal`, `black` | Startup animation background |

**`opencode.jsonc`**:

| Key | What it does |
|---|---|
| `todos` | `true` turns on todo tools and the sidebar todo list. Default `false` |
| `command_palette.order` | Reorders commands inside a palette category: `{ "command.name": 1 }` |
| `instructionsByModel` | Extra instruction files per model glob, e.g. `{ "openai/gpt-*": ["~/prompts/gpt.md"] }` |
| `default_subagent` | Subagent used when a task doesn't name one |
| `agent.<name>.tab_order` / `display_name` | Tab order and readable label for custom agents |
| `permission.session_complete` / `session_failed` | Let agents mark sessions. Default `deny` |
| `permission.run_after_turn` | Let agents queue a program to run after their turn. Default `allow` |
| `provider.claude-code.options.proxyTools` | oc tools offered to Claude. Default `["Task", "run_after_turn", "time"]` |
| `provider.claude-code.options.cliPath` | Path to the `claude` executable |
| `provider.claude-code.options.turnStats` | Show cost, time, and tokens under each Claude reply |
| `provider.claude-code.options.webSearch` | `claude`, `disabled`, or an oc tool name for web search |

**`tui.json`**:

| Key | What it does |
|---|---|
| `keybind_preset` | `oc` (default) or `opencode` keys |
| `keybinds` | Rebind any key; see [docs/keybinds.md](docs/keybinds.md) |
| `openEditedWith` | Editor for clicked files: a command, or `{ "default": "...", ".md": "..." }` per extension |
| `sidebar_button_style` | `minimal` (default) or `outlined` |
| `subagent_tabs.click` | `inline` (default) opens a clicked subagent in place; `tab` opens it in a new WezTerm or Windows Terminal tab |
| `subagent_tabs.auto_open` | Open each new subagent of the viewed session in its own tab. Default `false` |
| `keybinds.session_child_tabs` | Open the running subagents that have no tab yet. Unbound by default |

Subagent tabs attach to the resident oc server, so they don't work in `oc single` windows. The oc
palette's **Subagent tabs** entry (`/subagentTabs`) toggles both `subagent_tabs` settings and saves
them; **Open running subagents in tabs** runs the keybind's action from the palette.

**`~/.config/openSidebar/config.json`** (sidebar; a project can override it with
`.config/openSidebar.json`): `usageProviders` (`openai`, `cursor`, `opencode-go`, `openrouter`,
`claude-code`), `scripts.shell`, `scripts.terminal` (`native`, `wezterm-tab`, `wezterm-window`,
`wezterm-horizontal`, `wezterm-vertical`), and `scripts.languages` (add your own extensions and
launchers). Most of these are easier to set through the sidebar's configure entries.

## Troubleshooting

**"Resident port 127.0.0.1:4096 is occupied..."** Another program, or an oc server this launcher
doesn't own, is using the port. Close it, or set a different `server.port` in `oc.json`.

**"Database was migrated by a different OpenCode build"** oc and stock OpenCode share the same
data folder by default, and a newer stock OpenCode changed the database. Restore a backup of
`opencode.db` and give the other build its own folders (see below).

**Running oc next to stock OpenCode:** both use `%USERPROFILE%\.local\share\opencode` (data) and
`%USERPROFILE%\.config\opencode` (config). To keep them apart, start one of them with different
`XDG_DATA_HOME`, `XDG_CONFIG_HOME`, and `XDG_STATE_HOME` values, and make sure `OPENCODE_DB` isn't
set to a shared path.

**"Cursor requires Node.js for its HTTP/2 transport"** Install Node.js and make sure `node` is on
PATH.

**"Install es.exe and add it to PATH for file search"** or **"Everything search needs es.exe..."**
Install [Everything](https://www.voidtools.com/) and its command-line tool, keep Everything
running, and put `es.exe` on PATH.

**Claude account "is not logged in"** Run `claude auth login`, then resend your message.

**"Session is running in another oc process"** Another oc process holds this session's lock.
Use its window, or wait for its running work to finish.

**Logs** are in `%USERPROFILE%\.local\share\opencode\log`: `opencode.log`, `revive.log`, and
`markers.log`. Turn on debug logging from `ctrl+o`.

## FAQ

**Do I need Claude Code, Cursor, and ChatGPT subscriptions?** No. oc works with any model stock
OpenCode supports. The Claude Code and Cursor models are extras for people who already pay for
those plans.

**Does this replace OpenCode?** No. oc is a fork of OpenCode 1.18.29 with extra features. Stock
OpenCode is still the stable, general option.

**Is using my Claude subscription this way allowed?**
<!-- TODO(user): review this answer before publishing. Sources: https://code.claude.com/docs/en/legal-and-compliance
and https://www.theregister.com/software/2026/02/20/anthropic-clarifies-ban-on-third-party-tool-access-to-claude/5014546 -->
For chat, oc runs the official, unmodified Claude Code CLI, which you sign in to through
Anthropic's own login. Anthropic's Claude Code terms describe signing in to the unmodified Claude
Code CLI with your own subscription as allowed, and forbid third-party apps that use subscription
credentials directly. One exception to be aware of: the optional Claude usage meter in the sidebar
(off by default) reads the CLI's saved token to fetch your usage numbers. The Cursor provider talks to Cursor's service in an
unofficial way. oc is not affiliated with Anthropic, Cursor, or OpenAI; you are responsible for
following each provider's terms.

**Why doesn't `ctrl+c` quit?** In oc's key layout it clears the prompt. Quit with `ctrl+x q` or
`/exit`, or switch to stock keys with **Keybind layout** in `ctrl+o`.

**Why is oc still running after I closed the window?** That's the background server; it makes the
next launch fast. Stop it with `oc --kill-server`, or use `oc single` if you'd rather not have it.

**Is there a macOS or Linux version?** Not currently. oc is built and tested on Windows only.

## Companion tools

These are separate projects that work with oc. They are not bundled with it.

<!-- TODO(user): add links once these are public, or remove any you won't publish. -->

- **octray:** Windows tray app to open oc, open the project picker, and start, restart, or stop
  the background server.
- **SuperPlan, SuperGo, and Debug agents:** planning and execution agent profiles that use oc's
  plan tools (`plan_execute`, `plan_next_phase`, `plan_closeout`).
- **bgShell:** plugin that runs independent commands as parallel background jobs.
- **Crow:** keeps each Crow tab on one oc session.
- **Everything search MCP:** MCP server for fast file search through Everything.

## Developing

- What oc adds and how complete each part is: [FORK.md](FORK.md)
- Stock OpenCode in this checkout: [README.OG.md](README.OG.md)
- Build, install, test, and release scripts: [SCRIPTS.md](SCRIPTS.md)
- Keeping up with upstream OpenCode: [UPSTREAM-SYNC.md](UPSTREAM-SYNC.md)

The Bun workspace lives in `src/`; run `bun` from `src` or a package under it. You'll need:

- Bun, but not 1.4.0: it crashes the Windows TUI. The build scripts upgrade Bun to a canary
  release automatically if they find 1.4.0.
- scc, for the line counts `prePush.ps1` writes into this README.
- GitHub CLI, for the release scripts.

The version is in `src/.version/version`, the next commit message in `buildNotes.txt`, and the
development history in `buildNotes.md`.

## Progress

[522,628](scc.txt) lines of code and counting...

<!-- code-count:start -->

| Language | Files | Lines | Blanks | Comments | Code |
|---|---:|---:|---:|---:|---:|
| Astro | 8 | 1,299 | 150 | 10 | 1,139 |
| CSS | 163 | 40,551 | 5,296 | 574 | 34,681 |
| Go | 5 | 902 | 54 | 3 | 845 |
| HTML | 1 | 1,161 | 79 | 0 | 1,082 |
| JavaScript | 10 | 1,766 | 132 | 56 | 1,578 |
| Nix | 3 | 258 | 23 | 26 | 209 |
| Powershell | 22 | 1,146 | 81 | 61 | 1,004 |
| SQL | 95 | 592 | 0 | 17 | 575 |
| Shell | 1 | 120 | 17 | 17 | 86 |
| TypeScript | 2,756 | 540,512 | 43,556 | 15,527 | 481,429 |
| **Total** | **3,064** | **588,307** | **49,388** | **16,291** | **522,628** |

<!-- code-count:end -->

## Why I made oc

<!-- TODO(user): some writeup bullets no longer match the app. "`oc <folder>` names the new session
after the folder (`oc`, `oc2`, ...)": oc sessions are now named `<folder> - <task>` automatically.
"Agents can mark their own session as in progress, and mark it complete": sending a prompt marks
in progress; agents can't mark complete unless the session_complete permission allows it.
"break any TOS": see the FAQ answer instead of asserting this. "(future wiki goes here)": wiki
link once it exists. The OpenAI/ChatGPT plan bullet refers to Codex through stock OpenCode, which
still works; ChatGPT Web was removed in v0.2.141. -->

<details>
<summary>Read the writeup</summary>

oc came about naturally. I had been toying around with OpenCode v1 TUI for a few weeks, and was very impressed with how it worked compared to alternative mainstream options (Codex desktop app, Claude Code desktop app, Cursor AI desktop app). At this point, my custom modifications and lite 'enhancements' to OpenCode were scoped to plugins. This worked for a time, but I found my goals becoming larger and larger in scope and ambition. At this point I found that source code edits were required to achieve my goals in way of getting the features and behavior I imagined and desired. There's not much documentation or version-tracking of this era of oc, considering it was intended to be a completely self-contained personal project. However, my goals are much different now.

As I chipped away towards adding new 'native' features to the OpenCode TUI, and stripping some that I had no intention of using at the moment like the built-in web GUI, I realized that I may be creating something that other people may have frequent if not daily use for, as I have found myself. This project won't be for everyone, but I hope some may find that it is exactly for them : )

Native OpenCode presents you with a raw, blank canvas to inspire your own ideas. I love that philosophy of open source software, and how v2 expands on it further by making everything a plugin. 

oc is not a replacement for the native, stable experience. Native OpenCode will continue (in my eyes) to be the best 'start from here' custom harness project. oc intends to give you a slight 'push' in a targeted direction, giving you more of a jumping-off point if that's something you're into. 

The goal is for oc to be a competent, feature-rich tool out of the box that a certain type of person will get a lot of real-world use out of. Users are and always will be encouraged to change things to their liking and add features, but the idea is to offer a project that hopefully lets users focus on the things they truly want, the things that truly interest and inspire them. 

The intent is for users to reinvent the wheel as infrequently as possible if they'd like to, or to switch direction and change how the wheel works, which is also a completely acceptable approach.

In its current state, I believe oc to be a faster, smarter, more performant take on OpenCode version 1, with some ideas taken from OpenCode v2. (todo: put the top 'benchmarks' and comparisons to OpenCode v1 Windows vs oc Windows. I don't have these yet). 

Instead of having to remember how each mainstream harness's quirks work while writing every prompt, managing skills and plugins across apps, and losing time with sluggish, bloated app launches frequently, I just wanted a simple system that allows me to interact with each of these things under the same general workflow under OpenCode. This project's intended workflow is rooted in native OpenCode practices, but you may find that certain things work a little bit differently than you may be used to.

For example:

- Keybinds/keyboard combos are generally designed very differently. There is a config option to use binds closer to what OpenCode native designed, so keep that in mind if you find yourself unhappy with the keyboard shortcuts.
- Closing the last window doesn't stop the running session. The oc server keeps running in the background, so your next launch opens fast and exactly where you left off.
- The session list shows sessions from every project, not just the folder you're `cd`'d into. Picking a session still opens it in its own folder, synced by config.
- `oc <folder>` names the new session after the folder (`oc`, `oc2`, ...) instead of asking a model to come up with a name. After the first prompt, you can have the session auto-named with `/rename`. Sessions that weren't started with `oc <folder>` or the `oc new session` command palette entry are still auto-renamed by native OpenCode.
- Agents can mark their own session as in progress, and mark it complete when done. If more work comes up after supposed completion, they re-mark it as in progress.
- More info can be found in the (future wiki goes here)

Another thing you may not be used to lol... if you have an existing Cursor AI subscription plan or Claude Code subscription plan, oc knows how to interact with Cursor and Claude Code harnesses. (not talking API keys. those work out of the box with OpenCode. I'm talking monthly/yearly subscriptions)
At the end of the day, this means that you may select any model from some subscriptions you already pay for under the same exact /models menu where your native-to-OpenCode models live. While this may FEEL like you are 'hacking' around the system to somehow get external-harnessed-models to somehow 'expose' the underlying model API or system to 'get in'.... that's not how it works at all lmao.

It's really just a simple deterministic system designed around harness interaction, skills, and tool translation. The intention is not to replace the products it works with, or break any TOS while operating with them. The intention is to give a user a more streamlined, simplified general workflow solution, while leaving harness-specific features like computer use and others to their respective 'host' harness.

That's also why, to get the full experience, oc assumes the user has:

- OpenAI ChatGPT Codex $20 monthly plan
- Claude Code $20 monthly plan
- Cursor AI $20 monthly plan

You may have one, two, all three, or none and oc will still work, but oc was designed for this model access environment. Many of its tools were built to make efficient use of three separate $20 desktop app plans under one simple coding harness.

Day to day, I find my usage goes like this (written while Opus 5.5 is leading):

- Exhaust the 5-hour Claude Code usage with Opus 5.5. Offload some work to Sol 6.1 (native OpenCode Codex connection) and Muse 1.3 free (native OpenCode connection). Occasionally use Grok 4.6 for review and debugging (Cursor AI integration).
- Exhaust the Codex session usage limit. Same workflow as above, minus Opus as the forerunner: swap scope and prompting style a bit and use Sol 6.1 low-med as main, with Luna or Muse when difficulty/scope allows.
- By this point, either my Claude Code or OpenAI usage has reset to 0% for the current window, so the main workflow stays the same. On very, very heavy work days, however, I may exhaust both Claude Code and Codex usage for the current window. This is where Cursor comes in. Cursor provides very, very generous Grok 4.6 usage, which can be used as a main in a pinch, or if you allocate your Cursor API usage carefully, you can resume using Opus 5.5 under Cursor's $20 plan. Because Cursor's usage window is monthly, it naturally fills in the gaps when you exhaust other temporary limits. If you keep all platforms in mind from the get-go and become less reactive to usage windows, you'll rarely run into usage issues that block you from working at any given moment.

While you may have tried or used various OpenCode plugins whose end goals are similar regarding third-party harness 'connections', while using these I found minor problems at seemingly every turn. A lot of effort went into trying to figure out how these plugins worked, what to keep and iterate on, and what to start over from scratch. This is not a dig on any of those existing open-source plugins, they have been a crucial resource and have implicit contribution to some of oc's features. If you are working on a similar idea and have found some flaws in my system, please consider submitting either an issue or a pull request. I kindly ask that PRs may be intentional, tested, and scoped to the general intentions of this project.

Beyond this, I've added features that help my everyday workflow, and I hope that they help yours too. Thank you for reading this if you did, and I hope you have some use for what I'm offering. If not, that's okay too. If you'd like to help out, issues and PRs are always open. 

</details>

## License and credits

MIT, see [LICENSE](LICENSE). oc is based on [OpenCode](https://github.com/anomalyco/opencode)
(MIT). The Cursor provider is derived from
[oakimov/cursor-opencode-provider](https://github.com/oakimov/cursor-opencode-provider) 0.6.7
(MIT); its license and notices are kept in `src/packages/opencode/src/provider/cursor/`.

oc is an unofficial project. It is not affiliated with or endorsed by the OpenCode team,
Anthropic, Cursor, or OpenAI. You are responsible for following each provider's terms.
