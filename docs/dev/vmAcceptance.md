# VM acceptance checklist

In-app checks for a fresh Windows install from the setup exe, run on each edition (Win10 LTSC IoT,
Win11 LTSC IoT, Win11 Home, Win11 Pro) and before each release. The goal: everything README and
the wiki promise works, or the difference is a documented setup step.

Each run's `TESTING.md` in `D:\VirtualBox VMs\Shared Folder\ocInstallerTest` names the sections to
run. Full run on the first edition; later editions repeat sections 1, 2, 5, and 6 plus anything that
failed. Edition-sensitive rows: default terminal, Store and MSIX installs, admin prompts.

IDs refer to the inventory in the fresh-machine parity plan (I = data and install, E = env vars,
C = config, X = commands and accounts, K = keys). `-` means no inventory row yet: a failing `-` row
gets an ID. Dev and stable side by side is a check on the dev PC, not a VM row.

## 1. Install and dependencies

| ID | Action | Expected |
|---|---|---|
| I2 | Run the setup exe with defaults | Installs to `%LOCALAPPDATA%\Programs\oc`; PATH gains that folder |
| - | Leave **Set up dependencies** checked, install the default rows | Each row ends installed; admin prompts only for machine-wide installers |
| - | Steps in `TESTING.md` for this run | All pass |

## 2. First launch

| ID | Action | Expected |
|---|---|---|
| - | **Open oc and close** on the dependency window | oc opens in WezTerm; startup animation, then Home |
| - | Start menu **oc** | Same |
| - | `oc` in a new pwsh | Same; a second launch opens faster (server already running) |
| - | `opencode` in a new pwsh | Native oc opens with no background server |
| - | Send a first prompt with no provider connected | A clear "connect a provider" path, no crash |
| I1 | `oc debug paths db` | Prints `...\.local\share\opencode\oc.db` |

## 3. Providers

| ID | Action | Expected |
|---|---|---|
| X5 | Sign in to Claude Code (`claude auth login`), pick a Claude model | Reply streams; sidebar usage shows one Claude account |
| - | `/connect` an API-key provider, pick its model | Reply streams |
| - | Optional: pick a Cursor model, sign in through the browser | Reply streams |

## 4. Core loop

| ID | Action | Expected |
|---|---|---|
| - | Ask for an edit to a file | Edit applied; changed file in the sidebar |
| - | Ask the agent to ask you a question | Question dialog; the answer reaches the agent |
| - | Esc Esc during a reply | Turn stops |
| - | `/undo` | Last turn and its edit reverted |
| I4 | First file search (ask the agent to search the project) | Works; ripgrep downloads on first use. Repeat offline: a clear error, no hang |

## 5. README features

| ID | Action | Expected |
|---|---|---|
| K3 | `ctrl+return` on Home | Sends and stays on Home (see section 6 for terminals that send plain Enter) |
| - | First prompt in a new session | Session names itself `<folder> - <task>` |
| - | Change the model in one session, open another | Each keeps its own model |
| - | `occ` | Same as `oc` |
| - | Close the last oc window, run `oc` again | Opens fast; server kept running |
| - | `oc --kill-server`, then `oc` | Server stops, then starts fresh |
| - | Session list: mark one complete, pin one | Marks and pin persist after restart |
| - | Sidebar: usage, file tree, changed files, scripts, sub-agents | Each section shows data; rows are clickable |
| - | `ctrl+f` on a slash command | Favorite moves to the top of the empty slash menu |
| E3 | Click a changed-file path with no editor configured | Opens in Notepad |
| C2 | `/revive` | oc restarts in place (built-in revive) |
| I3 | Turn on start at sign-in, sign out and in | Server is running before the first `oc` |

## 6. Keys per terminal

Run each row in stock WezTerm (`wezterm -n start -- oc`), Windows Terminal, and conhost (plain
`pwsh` window). Windows Terminal 1.25+ and WezTerm with `config.enable_kitty_keyboard = true` send
full key combos; stock WezTerm, older Windows Terminal, and conhost do not.

| ID | Action | Expected |
|---|---|---|
| K1 | Busy session: type text, `alt+q` | Prompt queued; sends after the turn |
| K1 | Home: type text, `alt+q` | Session starts; you stay on Home |
| K1 | `alt+return` | Terminal toggles fullscreen (known; `alt+q` is the fallback) |
| - | First launch in a terminal without full key combos | One warning toast naming the keys and the fix for that terminal |
| - | Second launch in the same terminal | No keyboard notice |
| - | Launch in a terminal with full key combos | No keyboard notice |
| K3 | `ctrl+return` in a session | Newline with full key combos; otherwise a plain Enter (submits) |
| K4 | `shift+return`, then `ctrl+j` | Newline with full key combos; `ctrl+j` always inserts a newline |
| K5 | `ctrl+shift+h`, `ctrl+shift+b`, `ctrl+shift+return` | Home, background, mark complete with full key combos; without them they arrive as other keys (the notice says which) |
| K2 | `ctrl+shift+up/down` in a multi-line prompt | May move terminal panes or scroll; Up/Down still move the cursor |
| K6 | Tab title and `/font` in stock WezTerm | Square uncolored and `/font` does nothing without the `docs/wezterm.md` snippets |

## 7. Coexistence with stock OpenCode

Install stock OpenCode on the same VM. Its program is also called `opencode`, so run it by full path.

| ID | Action | Expected |
|---|---|---|
| I1 | Note `opencode.db` size and modified time in `%USERPROFILE%\.local\share\opencode`, then use oc (prompt, edit, new session) | `opencode.db` unchanged; oc writes only `oc.db` |
| I1 | Use stock OpenCode, then oc | Each lists only its own sessions; oc starts with no database error |
| - | Sign in to a provider in one, open the other | Login works in both (shared `auth.json`) |

## 8. Update and uninstall

| ID | Action | Expected |
|---|---|---|
| - | `/update` from the previous release (needs a published release) | Installs, reopens where you were |
| - | Run a newer setup exe while oc is open | oc windows close, upgrade completes, oc starts |
| - | Uninstall **oc** from Apps & features | Install folder and PATH entry removed; data folders and dependencies kept |
