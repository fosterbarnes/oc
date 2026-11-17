# Keybinds

## Basics

- `ctrl+x` is the leader key. `ctrl+x q` means: press `ctrl+x`, let go, then press `q`.
- Quit with `ctrl+x q` or `/exit`. `ctrl+c` clears the prompt; it never quits in the oc layout.
- `ctrl+o` lists oc commands. `ctrl+p` lists every command with its key.

## Layouts

oc ships two layouts. Switch with **Keybind layout** in the oc palette (`ctrl+o`) or `/keybindLayout`; it applies immediately and saves to `~/.config/opencode/tui.json`:

```json
{ "keybind_preset": "opencode" }
```

- `oc` (default): the oc layout below. Keys that replace an opencode leader key keep the leader key too.
  On macOS the oc layout moves app shortcuts from `ctrl` to `cmd` (the "oc (macOS)" column);
  terminal and typing keys stay on `ctrl`.
- `opencode`: stock OpenCode keys on every OS. oc-only commands keep their keys.

## Rebinding

Your own `keybinds` in `tui.json` win over either layout:

```json
{
  "keybinds": {
    "model_list": "ctrl+k",
    "session_rename": "none",
    "app_exit": "ctrl+q,ctrl+x q"
  }
}
```

- Names are the `keybinds` keys in `tui.json` (editors autocomplete them from the schema).
- Separate several keys with commas. `"none"` unbinds.
- `<leader>` in a value means the leader key.

## All keys

Bold marks keys where the oc layout differs from opencode. `-` means unbound.

<!-- keybinds:start -->

### Leader

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| Leader key for keybind combinations | `ctrl+x` | `ctrl+x` | `ctrl+x` |

### App

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| Exit the application | **`ctrl+x q`** | `ctrl+x q` | `ctrl+c`, `ctrl+d`, `ctrl+x q` |

### Command

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| List available commands | `ctrl+p` | **`cmd+p`** | `ctrl+p` |

### Palette

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| Set hotkey for the selected palette command | `ctrl+k` | **`cmd+k`** | `ctrl+k` |
| Add or remove the selected palette command from the sidebar | `alt+p` | `alt+p` | `alt+p` |

### Oc

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| List oc commands | `ctrl+o` | **`cmd+o`** | `ctrl+o` |
| New session (oc) | `ctrl+n` | **`cmd+n`** | `ctrl+n` |

### Diff

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| Close diff viewer | `escape`, `q` | `escape`, `q` | `escape`, `q` |
| Toggle diff viewer item | `enter`, `space` | `enter`, `space` | `enter`, `space` |
| Expand diff viewer item | `right` | `right` | `right` |
| Expand all diff viewer folders | `E` | `E` | `E` |
| Collapse diff viewer item | `left` | `left` | `left` |
| Switch diff viewer focus | `tab` | `tab` | `tab` |
| Jump to next diff hunk | `]` | `]` | `]` |
| Jump to previous diff hunk | `[` | `[` | `[` |
| Jump to next diff file | `n` | `n` | `n` |
| Jump to previous diff file | `p` | `p` | `p` |
| Toggle diff viewer file tree | `b` | `b` | `b` |
| Toggle single patch view | `s` | `s` | `s` |
| Switch diff viewer source | `d` | `d` | `d` |
| Toggle diff viewer split or unified view | `v` | `v` | `v` |
| Show more diff viewer shortcuts | `?` | `?` | `?` |

### Editor

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| Open external editor | `ctrl+x e` | `ctrl+x e` | `ctrl+x e` |

### Theme

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| List available themes | `ctrl+x t` | `ctrl+x t` | `ctrl+x t` |

### Sidebar

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| Toggle sidebar | `ctrl+x b` | `ctrl+x b` | `ctrl+x b` |

### Status

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| View status | `ctrl+x s` | `ctrl+x s` | `ctrl+x s` |

### Session

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| Export session to editor | `ctrl+x x` | `ctrl+x x` | `ctrl+x x` |
| Go to Home | `ctrl+shift+h` | **`cmd+shift+h`** | `ctrl+shift+h` |
| List all sessions | **`ctrl+s`, `ctrl+x l`** | **`cmd+s`, `ctrl+x l`** | `ctrl+x l` |
| Show session timeline | `ctrl+x g` | `ctrl+x g` | `ctrl+x g` |
| Rename session | `ctrl+r` | **`cmd+r`** | `ctrl+r` |
| Delete session | `ctrl+d` | **`cmd+d`** | `ctrl+d` |
| Mark session complete or incomplete | `ctrl+shift+return` | **`cmd+shift+return`** | `ctrl+shift+return` |
| Mark session failed or not failed | `ctrl+shift+backspace` | **`cmd+shift+backspace`** | `ctrl+shift+backspace` |
| Mark session in progress or unmarked | `ctrl+shift+i` | **`cmd+shift+i`** | `ctrl+shift+i` |
| Interrupt current session | `escape` | `escape` | `escape` |
| Move running subagents and shell commands to the background | **`ctrl+shift+b`** | **`cmd+shift+b`** | `ctrl+b` |
| Compact the session | `ctrl+x c` | `ctrl+x c` | `ctrl+x c` |
| Go to first child session | **`ctrl+b`, `ctrl+x down`** | **`cmd+b`, `ctrl+x down`** | `ctrl+x down` |
| Go to next child session | `right` | `right` | `right` |
| Go to previous child session | `left` | `left` | `left` |
| Go to parent session | `up` | `up` | `up` |
| Stop the subagent you are viewing | `escape` | `escape` | `escape` |
| Pin or unpin session in the session list | `ctrl+f` | **`cmd+f`** | `ctrl+f` |
| Switch to session in quick slot 1 | `ctrl+x 1` | `ctrl+x 1` | `ctrl+x 1` |
| Switch to session in quick slot 2 | `ctrl+x 2` | `ctrl+x 2` | `ctrl+x 2` |
| Switch to session in quick slot 3 | `ctrl+x 3` | `ctrl+x 3` | `ctrl+x 3` |
| Switch to session in quick slot 4 | `ctrl+x 4` | `ctrl+x 4` | `ctrl+x 4` |
| Switch to session in quick slot 5 | `ctrl+x 5` | `ctrl+x 5` | `ctrl+x 5` |
| Switch to session in quick slot 6 | `ctrl+x 6` | `ctrl+x 6` | `ctrl+x 6` |
| Switch to session in quick slot 7 | `ctrl+x 7` | `ctrl+x 7` | `ctrl+x 7` |
| Switch to session in quick slot 8 | `ctrl+x 8` | `ctrl+x 8` | `ctrl+x 8` |
| Switch to session in quick slot 9 | `ctrl+x 9` | `ctrl+x 9` | `ctrl+x 9` |

### Stash

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| Delete stash entry | **-** | - | `ctrl+d` |

### Queue

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| Cancel queued prompt | `ctrl+d` | **`cmd+d`** | `ctrl+d` |

### Subagent

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| Add subagent | `ctrl+a` | **`cmd+a`** | `ctrl+a` |
| Delete subagent | `ctrl+d` | **`cmd+d`** | `ctrl+d` |

### Model

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| Open provider list from model dialog | `ctrl+a` | **`cmd+a`** | `ctrl+a` |
| Toggle model favorite status | `ctrl+f` | **`cmd+f`** | `ctrl+f` |
| Choose a favorite model category | `ctrl+g` | **`cmd+g`** | `ctrl+g` |
| Move favorite model up | `shift+up` | `shift+up` | `shift+up` |
| Move favorite model down | `shift+down` | `shift+down` | `shift+down` |
| Toggle model hidden status | `ctrl+h` | **`cmd+h`** | `ctrl+h` |
| List available models | **`ctrl+m`, `ctrl+x m`** | **`cmd+m`, `ctrl+x m`** | `ctrl+x m` |
| Next recently used model | `f2` | `f2` | `f2` |
| Previous recently used model | `shift+f2` | `shift+f2` | `shift+f2` |

### Agent

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| List agents | `ctrl+x a` | `ctrl+x a` | `ctrl+x a` |
| Next agent | **`shift+tab`** | `shift+tab` | `tab` |
| Previous agent | **-** | - | `shift+tab` |

### Variant

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| Cycle model variants | **`ctrl+d`, `ctrl+t`** | **`cmd+d`, `cmd+t`** | `ctrl+t` |

### Messages

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| Scroll messages up by one page | `pageup`, `ctrl+alt+b` | `pageup`, `ctrl+alt+b` | `pageup`, `ctrl+alt+b` |
| Scroll messages down by one page | `pagedown`, `ctrl+alt+f` | `pagedown`, `ctrl+alt+f` | `pagedown`, `ctrl+alt+f` |
| Scroll messages up by one line | `ctrl+alt+y` | `ctrl+alt+y` | `ctrl+alt+y` |
| Scroll messages down by one line | `ctrl+alt+e` | `ctrl+alt+e` | `ctrl+alt+e` |
| Scroll messages up by half page | `ctrl+alt+u` | `ctrl+alt+u` | `ctrl+alt+u` |
| Scroll messages down by half page | `ctrl+alt+d` | `ctrl+alt+d` | `ctrl+alt+d` |
| Navigate to first message | `ctrl+g`, `home` | `ctrl+g`, `home` | `ctrl+g`, `home` |
| Navigate to last message | `ctrl+alt+g`, `end` | `ctrl+alt+g`, `end` | `ctrl+alt+g`, `end` |
| Navigate to next message | `alt+down` | `alt+down` | `alt+down` |
| Navigate to previous message | `alt+up` | `alt+up` | `alt+up` |
| Copy message | `ctrl+x y` | `ctrl+x y` | `ctrl+x y` |
| Undo message | `ctrl+x u` | `ctrl+x u` | `ctrl+x u` |
| Redo message | `ctrl+x r` | `ctrl+x r` | `ctrl+x r` |
| Toggle code block concealment in messages | `ctrl+x h` | `ctrl+x h` | `ctrl+x h` |

### Prompt

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| Send prompt and stay on Home | **`ctrl+return`, `alt+q`** | **`cmd+return`, `cmd+alt+q`, `alt+q`** | `ctrl+return` |
| Queue prompt while the session is busy | **`alt+q`, `alt+return`** | **`cmd+alt+q`, `alt+q`, `alt+return`** | `alt+return` |
| Schedule prompt | `alt+s` | `alt+s` | `alt+s` |
| Move to previous autocomplete item | `up`, `ctrl+p` | `up`, `ctrl+p` | `up`, `ctrl+p` |
| Move to next autocomplete item | `down`, `ctrl+n` | `down`, `ctrl+n` | `down`, `ctrl+n` |
| Hide autocomplete | `escape` | `escape` | `escape` |
| Select autocomplete item | `return` | `return` | `return` |
| Complete autocomplete item | `tab` | `tab` | `tab` |
| Toggle slash entry favorite status | `ctrl+f` | **`cmd+f`** | `ctrl+f` |

### Input

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| Clear input field | `ctrl+c` | `ctrl+c` | `ctrl+c` |
| Paste from clipboard | `ctrl+v` | `ctrl+v` | `ctrl+v` |
| Insert tab in input | **`tab`** | `tab` | - |
| Submit input | `return` | `return` | `return` |
| Insert newline in input | `shift+return`, `ctrl+return`, `ctrl+j` | `shift+return`, `ctrl+return`, `ctrl+j` | `shift+return`, `ctrl+return`, `ctrl+j` |
| Move cursor left in input | **`left`** | `left` | `left`, `ctrl+b` |
| Move cursor right in input | `right`, `ctrl+f` | `right`, `ctrl+f` | `right`, `ctrl+f` |
| Move cursor up in input | **`up`, `ctrl+shift+up`** | `up`, `ctrl+shift+up` | `up` |
| Move cursor down in input | **`down`, `ctrl+shift+down`** | `down`, `ctrl+shift+down` | `down` |
| Select left in input | `shift+left` | `shift+left` | `shift+left` |
| Select right in input | `shift+right` | `shift+right` | `shift+right` |
| Select up in input | `shift+up` | `shift+up` | `shift+up` |
| Select down in input | `shift+down` | `shift+down` | `shift+down` |
| Move to start of line in input | **-** | - | `ctrl+a` |
| Move to end of line in input | `ctrl+e` | `ctrl+e` | `ctrl+e` |
| Select to start of line in input | `ctrl+shift+a` | `ctrl+shift+a` | `ctrl+shift+a` |
| Select to end of line in input | `ctrl+shift+e` | `ctrl+shift+e` | `ctrl+shift+e` |
| Move to start of visual line in input | `alt+a` | `alt+a` | `alt+a` |
| Move to end of visual line in input | `alt+e` | `alt+e` | `alt+e` |
| Select to start of visual line in input | `alt+shift+a` | `alt+shift+a` | `alt+shift+a` |
| Select to end of visual line in input | `alt+shift+e` | `alt+shift+e` | `alt+shift+e` |
| Move to start of buffer in input | `home` | `home` | `home` |
| Move to end of buffer in input | `end` | `end` | `end` |
| Select to start of buffer in input | `shift+home` | `shift+home` | `shift+home` |
| Select to end of buffer in input | `shift+end` | `shift+end` | `shift+end` |
| Delete line in input | `ctrl+shift+d` | `ctrl+shift+d` | `ctrl+shift+d` |
| Delete to end of line in input | `ctrl+k` | `ctrl+k` | `ctrl+k` |
| Delete to start of line in input | `ctrl+u` | `ctrl+u` | `ctrl+u` |
| Backspace in input | `backspace`, `shift+backspace` | `backspace`, `shift+backspace` | `backspace`, `shift+backspace` |
| Delete character in input | **`delete`, `shift+delete`** | `delete`, `shift+delete` | `ctrl+d`, `delete`, `shift+delete` |
| Undo in input | `ctrl+-`, `super+z` | `ctrl+-`, `cmd+z` | `ctrl+-`, `super+z` |
| Redo in input | `ctrl+.`, `super+shift+z` | `ctrl+.`, `cmd+shift+z` | `ctrl+.`, `super+shift+z` |
| Move word forward in input | `alt+f`, `alt+right`, `ctrl+right` | `alt+f`, `alt+right`, `ctrl+right` | `alt+f`, `alt+right`, `ctrl+right` |
| Move word backward in input | `alt+b`, `alt+left`, `ctrl+left` | `alt+b`, `alt+left`, `ctrl+left` | `alt+b`, `alt+left`, `ctrl+left` |
| Select word forward in input | `alt+shift+f`, `alt+shift+right` | `alt+shift+f`, `alt+shift+right` | `alt+shift+f`, `alt+shift+right` |
| Select word backward in input | `alt+shift+b`, `alt+shift+left` | `alt+shift+b`, `alt+shift+left` | `alt+shift+b`, `alt+shift+left` |
| Delete word forward in input | `alt+d`, `alt+delete`, `ctrl+delete` | `alt+d`, `alt+delete`, `ctrl+delete` | `alt+d`, `alt+delete`, `ctrl+delete` |
| Delete word backward in input | `ctrl+w`, `ctrl+backspace`, `alt+backspace` | `ctrl+w`, `ctrl+backspace`, `alt+backspace` | `ctrl+w`, `ctrl+backspace`, `alt+backspace` |
| Select all in input | **`ctrl+a`, `super+a`** | `ctrl+a`, `cmd+a` | `super+a` |

### History

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| Previous history item | `up` | `up` | `up` |
| Next history item | `down` | `down` | `down` |

### Dialog

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| Move to previous dialog item | `up`, `ctrl+p` | `up`, `ctrl+p` | `up`, `ctrl+p` |
| Move to next dialog item | `down`, `ctrl+n` | `down`, `ctrl+n` | `down`, `ctrl+n` |
| Move up one page in dialog | `pageup` | `pageup` | `pageup` |
| Move down one page in dialog | `pagedown` | `pagedown` | `pagedown` |
| Move to first dialog item | `home` | `home` | `home` |
| Move to last dialog item | `end` | `end` | `end` |
| Submit selected dialog item | `return` | `return` | `return` |
| Submit dialog prompt | `return` | `return` | `return` |
| Close dialog | **-** | - | `ctrl+c` |
| Copy session name | `ctrl+c` | `ctrl+c` | `ctrl+c` |
| Toggle MCP in MCP dialog | `space` | `space` | `space` |
| Reconnect MCP in MCP dialog | `ctrl+r` | **`cmd+r`** | `ctrl+r` |
| Cycle session picker status filter | `ctrl+s` | **`cmd+s`** | `ctrl+s` |
| New project copy | `ctrl+m` | **`cmd+m`** | `ctrl+m` |
| Delete project copy | `ctrl+d` | **`cmd+d`** | `ctrl+d` |
| Refresh project copies | `ctrl+r` | **`cmd+r`** | `ctrl+r` |
| Rename favorite category | `ctrl+r` | **`cmd+r`** | `ctrl+r` |
| Set favorite category color | `ctrl+l` | **`cmd+l`** | `ctrl+l` |
| Move favorite category up | `shift+up` | `shift+up` | `shift+up` |
| Move favorite category down | `shift+down` | `shift+down` | `shift+down` |
| Delete favorite category | `ctrl+d` | **`cmd+d`** | `ctrl+d` |
| Run the selected notice's action | `ctrl+r` | **`cmd+r`** | `ctrl+r` |
| Investigate error in a new session | `i` | `i` | `i` |
| Copy error details | `c` | `c` | `c` |
| Install plugin from plugin dialog | `shift+i` | `shift+i` | `shift+i` |

### Permission

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| Toggle permission prompt fullscreen | `ctrl+f` | **`cmd+f`** | `ctrl+f` |

### Plugins

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| Toggle plugin | `space` | `space` | `space` |

### Terminal

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| Suspend terminal | `ctrl+z` | `ctrl+z` | `ctrl+z` |

### Tips

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| Toggle tips on home screen | `ctrl+x h` | `ctrl+x h` | `ctrl+x h` |

### Which

| Action | oc | oc (macOS) | opencode |
|---|---|---|---|
| Toggle which-key panel | `ctrl+alt+k` | `ctrl+alt+k` | `ctrl+alt+k` |
| Switch which-key layout | `ctrl+alt+shift+k` | `ctrl+alt+shift+k` | `ctrl+alt+shift+k` |
| Toggle which-key pending preview | `ctrl+alt+shift+p` | `ctrl+alt+shift+p` | `ctrl+alt+shift+p` |
| Previous which-key group | `ctrl+alt+left`, `ctrl+alt+[` | `ctrl+alt+left`, `ctrl+alt+[` | `ctrl+alt+left`, `ctrl+alt+[` |
| Next which-key group | `ctrl+alt+right`, `ctrl+alt+]` | `ctrl+alt+right`, `ctrl+alt+]` | `ctrl+alt+right`, `ctrl+alt+]` |
| Scroll which-key up | `ctrl+alt+up`, `ctrl+alt+p` | `ctrl+alt+up`, `ctrl+alt+p` | `ctrl+alt+up`, `ctrl+alt+p` |
| Scroll which-key down | `ctrl+alt+down`, `ctrl+alt+n` | `ctrl+alt+down`, `ctrl+alt+n` | `ctrl+alt+down`, `ctrl+alt+n` |
| Page which-key up | `ctrl+alt+pageup` | `ctrl+alt+pageup` | `ctrl+alt+pageup` |
| Page which-key down | `ctrl+alt+pagedown` | `ctrl+alt+pagedown` | `ctrl+alt+pagedown` |
| Jump to first which-key binding | `ctrl+alt+home` | `ctrl+alt+home` | `ctrl+alt+home` |
| Jump to last which-key binding | `ctrl+alt+end` | `ctrl+alt+end` | `ctrl+alt+end` |

Palette command hotkeys are stored as `palette_keys` in tui.json. From the command list, **Set hotkey for the selected palette command** (`palette.set_hotkey`) captures a chord.

<!-- keybinds:end -->
