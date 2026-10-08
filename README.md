# oc

'Snapshot' of OpenCode version 1.18.29. oc aims to add new features, and enhancements to existing ones. Its base functionality has elements of v2's codebase, while still remaining rooted fundamentally in v1 practices.

## Standout features

- Claude Code models in `/models`, using your existing Claude Code login ([how](#claude-code))
- Cursor models in `/models`, using your existing Cursor login ([how](#cursor))
- One background server shared by every oc window, so launches after the first are fast ([how](#background-server))
- `occ` reopens your last session in one command ([how](#oc-and-occ) while `oc` is the default way to opencode 'normally'.
- One session list for every project, open from anywhere ([how](#session-list-and-markers))
- Mark sessions complete, failed, or in progress, and pin the ones you keep coming back to ([how](#session-list-and-markers))
- A sidebar with usage meters, a file tree, changed files, and sub-agents, all clickable ([how](#sidebar))
- Run your project's scripts from the sidebar in one click ([how](#script-runner))

## Little day-to-day workflow features

- Ability to favorite `/commands`
- 

## Fix

- Faster app startup (initial, and across sessions)
- Agent questions survive closing the window or restarting the server: reopen the session, answer, and the agent carries on
- Stopping a session clears any open question instead of leaving the chat stuck on it
- `oc <folder>` opens a ready session named after the folder (`oc`, `oc2`, ...), so OpenCode skips the model call it normally spends naming a new session


## Custom skills and commands

## Behavior changes

- `ctrl+c` and `ctrl+d` no longer quit. Quit with `ctrl+x q` or `/exit`.
- New keys (`ctrl+x` is the leader key: press it, then the next key):

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

- All keys: [docs/keybinds.md](docs/keybinds.md). Switch to stock OpenCode keys with **Keybind layout** in `ctrl+o`.
- Rebind any key in `tui.json`. `command_palette.order` in `opencode.jsonc` reorders commands inside a palette category.

## Windows specific stuff

## Non-Standout small features


## How it works

### Claude Code

oc runs the Claude Code CLI installed on your machine, signed in with your own account. Claude Code keeps its own system prompt, built-in tools, transcript, and `/compact`. oc streams the replies into the session and offers oc's skills, subagents, questions, and MCP servers as tools Claude can load.

### Cursor

oc signs in through Cursor's browser login and talks to Cursor's service directly, so the Cursor app does not need to be open. A small local relay (`cursor-runtime`, needs Node.js on PATH) carries the connection. Based on [oakimov/cursor-opencode-provider](https://github.com/oakimov/cursor-opencode-provider).

### Background server

The first `oc` you run starts one OpenCode server in the background (port 4096, this machine only, password-protected). Every `oc` window after that connects to the same server instead of starting its own, and the server keeps running after you close the last window. Stop or restart it from the command palette, with `oc --kill-server` or `oc --restart-server`, or from the tray app. OC settings can also start it when you sign in to Windows.

### oc and occ

- `oc` opens oc in your OC directory (your home folder by default).
- `oc <folder>` opens a project: an absolute path, or a folder name under your home folder.
- `occ` reopens your most recent session, from any project.
- `oc previous --depth <n>` goes further back: `--depth 2` is the session before that, up to 50.

### Session list and markers

Stock OpenCode lists only the current project's sessions. oc's session list shows sessions from every project, and picking one opens it in its own project folder.

| Key (in the session list) | Action |
|---|---|
| `ctrl+shift+return` | Mark complete (:white_check_mark:) or clear |
| `ctrl+shift+backspace` | Mark failed (:x:) or clear |
| `ctrl+shift+i` | Mark in progress (-) or clear |
| `ctrl+f` | Pin to the top of the list, or unpin |
| `ctrl+s` | Filter by: unmarked, in progress, pinned, complete, failed |

A session holds one mark at a time. By default, agents can mark their own session in progress, must ask before marking it complete or reopening a complete or failed one, and cannot mark it failed. Change this with the `session_in_progress`, `session_complete`, `session_reopen`, and `session_failed` permissions.

### Sidebar

Top to bottom:

- **Session, model, and reasoning:** click to switch session, change model, or cycle reasoning level. These follow the current session.
- **Usage:** weekly usage for Codex, Cursor, Go, and OpenRouter. Stale numbers are dimmed; hover for their age. Pick providers with `Configure weekly usage providers`.
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

## Dev Docs

- Fork features and status: [FORK.md](FORK.md)
- Stock OpenCode in this checkout: [README.OG.md](README.OG.md)
- Build, install, and upstream sync: [SCRIPTS.md](SCRIPTS.md)

## Requirements

- Windows 10/11 x64
- PowerShell 7
- Bun (not 1.4.0; see [SCRIPTS.md](SCRIPTS.md))
- scc for `prePush.ps1` line counts
- GitHub CLI for release scripts

## Versioning

- Version: `.version/version`
- Next commit message: `buildNotes.txt`
- Agent history: `buildNotes.md`

## Progress

[519,318](scc.txt) lines of code and counting...

<!-- code-count:start -->

| Language | Files | Lines | Blanks | Comments | Code |
|---|---:|---:|---:|---:|---:|
| Astro | 8 | 1,299 | 150 | 10 | 1,139 |
| CSS | 163 | 40,551 | 5,296 | 574 | 34,681 |
| Go | 5 | 902 | 54 | 3 | 845 |
| HTML | 1 | 1,161 | 79 | 0 | 1,082 |
| JavaScript | 23 | 5,259 | 419 | 63 | 4,777 |
| Nix | 3 | 258 | 23 | 26 | 209 |
| Powershell | 21 | 1,634 | 133 | 50 | 1,451 |
| SQL | 95 | 592 | 0 | 17 | 575 |
| Shell | 1 | 120 | 17 | 17 | 86 |
| TypeScript | 2,733 | 532,874 | 43,178 | 15,223 | 474,473 |
| **Total** | **3,053** | **584,650** | **49,349** | **15,983** | **519,318** |

<!-- code-count:end -->

## Writeup

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

## License

MIT, see [LICENSE](LICENSE). Based on OpenCode.
