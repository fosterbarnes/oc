# Plan: descriptions for blank oc palette commands

Status: implemented. `Model`/`Agent` use "Model oc starts with" / "Agent oc starts with" (the keys
feed `--model`/`--agent` in `opencode/src/cli/cmd/oc.ts:50-51`); `Update all` uses
"Claude Code, Cursor CLI, Codex CLI, and the desktop apps".

## Goal

Every entry in the oc command palette section (`category: "oc"`) shows a description. Today 25 entries
always show nothing next to their title (sections A and B), 2 more go blank when unset (section C),
and their `/slash` rows fall back to repeating the title.

## How descriptions render (verified)

- Palette: `src/packages/tui/src/component/command-palette.tsx:97` shows `command.desc` when it is a
  string, else nothing.
- Slash autocomplete: `src/packages/tui/src/keymap.tsx:298-302` uses `desc`, else falls back to `title`
  (so `/about` currently reads "About").
- Convention already in the file: **setting** rows use a `get desc()` that returns the current value
  (`on`, `right`, `Minimal`, `12h · America/Chicago`). **Action** rows use a static sentence
  (`oc.stop_session_subagents`, `oc.killall`). This plan keeps both conventions and does not replace any
  value getter with a sentence, since that would hide the current setting.
- `oc-palette-entry` skill: `desc` is "short tooltip-style detail", no filler.

## Approach

One-line `desc:` additions only. No new helpers, types, or rendering changes. Keep each under about
60 characters (existing ones run 35-90). Plain verbs, no trailing period, matching existing entries.

## A. Action rows with no `desc` (add a static `desc`)

All in `src/packages/tui/src/ocCommands.tsx` unless noted. Line = the `title:` line.

| Line | Command name | Title | Proposed `desc` |
|---|---|---|---|
| 85 | `oc.new_session` | New session | Start a session in a folder under the home folder |
| 149 | `model.default` | Model | Model for new sessions (see note 3) |
| 166 | `agent.session` | Agent | Agent for new sessions (see note 3) |
| 182 | `oc.view_subagents` | Subagents | Add, remove, or change the model of delegated agents |
| 237 | `oc.notices` | Notices | Toasts and alerts shown since oc started |
| 351 | `oc.session_cleanup` | Clean up completed sessions | Archive or delete finished sessions that are not open |
| 359 | `oc.about` | About | Version, build, runtime, and repo links |
| 1055 | `oc.update_all_harnesses` | Update all | Claude Code, Cursor CLI, Codex CLI, and the Windows desktop apps (see note 1) |
| 1060 | `oc.update_claude_code` | Update Claude Code | Update the Claude Code CLI oc runs |
| 1063 | `oc.update_cursor_cli` | Update Cursor CLI | Update the Cursor agent CLI |
| 1064 | `oc.update_codex_cli` | Update Codex CLI | Update the Codex CLI |
| 1076 | `oc.update_claude_desktop` | Update Claude Desktop | Install the latest Claude Desktop app |
| 1081 | `oc.update_cursor_desktop` | Update Cursor Desktop | Install the latest Cursor app |
| 1086 | `oc.update_chatgpt_desktop` | Update ChatGPT Desktop | Install the latest ChatGPT app |
| 1091 | `oc.update_powershell` | Update PowerShell | Install the latest PowerShell 7 |
| 1137 | `server.shutdown` | Shut down | Stop the oc server; this window disconnects |
| 1145 | `server.restart` | Restart | Restart the oc server; this window reconnects |

Other files:

| File:line | Command name | Title | Proposed `desc` |
|---|---|---|---|
| `src/packages/tui/src/savedImages.ts:18` | `oc.clear_saved_images` | Clear saved images | Delete pasted images saved to the image folder |
| `src/packages/tui/src/claudeCommands.tsx:33` | `claude.account` | Switch Claude account | Account used by every Claude session |
| `src/packages/tui/src/claudeCommands.tsx:67` | `claude.sessionAccount` | Switch Claude account (this session) | Pin a Claude account to this session only |
| `src/packages/tui/src/claudeWarmup.tsx:65` | `oc.claude_warmup.<id>` (one per account) | Schedule Claude warm-up: \<label\> | Send a tiny Haiku message at set times to start the 5-hour window |
| `src/packages/tui/src/routes/session/sidebar-tools/sidebarTools.tsx:66` | `sidebar.usage` | Show usage | Plan usage and limits for each provider |

Note 1: `Update all` is a 60+ character sentence because it names four apps. Shorter alternative:
`Every CLI and desktop app listed below`. Pick one at implementation; the per-app rows already list them.

Note 2: `oc.update_claude_desktop`/`cursor_desktop`/`chatgpt_desktop`/`powershell` only exist on Windows
(`process.platform === "win32"` block), so their text does not need a platform qualifier.

Note 3: `Model` and `Agent` are settings, so by the convention they would ideally show the current
value. That needs `sessionModel` and `sessionAgent` added to `readOcConfig()` (`ocSettings.ts`: the
return type, the `parse` cast, and both return branches), because it does not expose them today.
This plan uses the static sentence to stay one-line. Optional follow-up: switch to
`get desc() { return readOcConfig().sessionModel || "not set" }` once those fields exist.

## B. Setting rows with no current value (add a value `get desc()`)

These are settings, so per the convention they show the current value, not a sentence.

| File:line | Command name | Title | Proposed `desc` |
|---|---|---|---|
| `ocCommands.tsx:368` | `oc.home_dir` | Home folder | `get desc() { return readOcConfig().homeDir }` |
| `ocCommands.tsx:420` | `oc.oc_dir` | oc folder | `get desc() { return readOcConfig().ocDir }` |
| `ocCommands.tsx:679` | `oc.subagent_tabs` | Subagent tabs | `get desc() { return tuiConfig.subagent_tabs.click === "tab" ? "opens in tab" : "opens inline" }` |

Risk: home and oc folder paths can be long. The palette description column already wraps or clips
long `desc` text (the killall `desc` is about 90 characters), so no truncation helper is needed. If it
looks bad, fall back to the sentences `Folder New session lists projects from` and `oc install folder`.

For `oc.subagent_tabs`, showing only the click target keeps it short; the dialog itself lists all three
toggles. `tuiConfig.subagent_tabs.click` is always set (`config/index.tsx:200` defaults it to
`"inline"`), so the getter never returns blank.

## C. Value getters that can return blank (add a fallback)

| File:line | Command name | Returns blank when | Change |
|---|---|---|---|
| `ocCommands.tsx:283` | `agent.default_subagent_model` | no default subagent, or that agent has no pinned model | append `?? "not set"` |
| `ocCommands.tsx:310` | `agent.default_subagent` | `default_subagent` unset in config | append `?? "not set"` |

## Out of scope (already described)

Every other `category: "oc"` entry already has a static `desc` or a value getter that always returns a
string (`Home sort order`, `Start at Windows sign-in`, `Sidebar position`, `Keybind layout`, `Tab key`,
`Sidebar buttons`, `Reset sidebar buttons`, the four toggles at 612-658, `Font`, `Time`, link rows,
`bgRun`, `Smooth streaming`, `Daily theme`, `Update model list`, `Auto confirm updates`, killall rows,
`Agent-push auto-delete`, `Claude account failover`, `Claude auto-resume`, `Context limit`, `Todos`).

Also out of scope:

- `oc.settings_palette` (`app.tsx:942`) is `hidden: true`, never shown.
- `System` category commands (revive, reload, update) are not oc-category entries.

## Implementation steps

1. Add the `desc` lines from sections A, B, C. For the four Windows update rows and the three CLI rows,
   add `desc` inside each object literal; the `.map(...)` at `ocCommands.tsx:1096` spreads it through.
2. For `claudeWarmup.tsx`, add `desc` in `warmupCommands` so every generated account row gets it.
3. `cd src/packages/tui; bun run typecheck` (or `tsgo --noEmit`) to confirm getters type-check against
   the command type.
4. Probe: open the oc palette (ctrl+p oc section) and type `/` in the prompt; every oc row shows a
   description and no slash row repeats its title. Visual check needs the user (no build per rules).

## Tests

None. Description text is wording; the verify keep bar excludes it.
