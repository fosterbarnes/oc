# WezTerm

oc is used daily in WezTerm. Put config in `~/.wezterm.lua` or `~/.config/wezterm/wezterm.lua`, then reload WezTerm.

## Kitty keyboard protocol

Stock WezTerm does not send full key combos. Turn them on:

```lua
config.enable_kitty_keyboard = true
```

Restart WezTerm afterwards. Without it some oc keys arrive as other keys:

| You press | oc receives | Effect |
|---|---|---|
| `ctrl+m` (models) | `return` | Sends the prompt |
| `ctrl+shift+h` (Home) | `backspace` | Deletes a character |
| `ctrl+shift+b` (background) | `ctrl+b` | Opens the first subagent |
| `shift+return` (newline) | `return` | Sends the prompt |

oc shows a one-time notice when the terminal does not answer the protocol query. Either way, `ctrl+x m` opens models and `ctrl+j` inserts a newline. `alt+q` queues a prompt in a busy session and sends-and-stays on Home in every terminal; `alt+return` is fullscreen in WezTerm.

## macOS cmd keys

On macOS the oc layout puts its shortcuts on `cmd` (`cmd+o`, `cmd+p`, `cmd+m`, ...). oc gets `cmd` only through the kitty keyboard protocol above, and WezTerm keeps some `cmd` keys for itself. Send those to oc panes (user variable `oc_tui=1`) and keep the WezTerm action elsewhere:

```lua
-- SendKey drops SUPER (WezTerm 20240203), so send the kitty sequence a pass-through Cmd key gets.
local function oc_or(key, action)
  return wezterm.action_callback(function(window, pane)
    if pane:get_user_vars().oc_tui == '1' then
      window:perform_action(act.SendString(string.format('\x1b[%d;9u', key:byte())), pane)
    else
      window:perform_action(action, pane)
    end
  end)
end

for key, action in pairs {
  m = act.Hide,
  n = act.SpawnWindow,
  t = act.SpawnTab 'CurrentPaneDomain',
  r = act.ReloadConfiguration,
  h = act.HideApplication,
  k = act.ClearScrollback 'ScrollbackOnly',
  f = act.Search { CaseSensitiveString = '' },
} do
  table.insert(config.keys, { key = key, mods = 'SUPER', action = oc_or(key, action) })
end
```

`config.keys` must exist before the loop. If the config is a file loaded with `dofile`, call `wezterm.add_to_config_reload_watch_list(path)` on it, or edits only apply after a WezTerm restart. `cmd+c`, `cmd+v`, `cmd+w`, `cmd+q`, and `cmd+1`-`cmd+9` stay with WezTerm.

## Tab color square

When the terminal helper reports WezTerm, oc sets the user variable `oc_agent_color` (`OSC 1337 SetUserVar`) to the active agent's hex color. The tab title still starts with a plain `■ ` (or `⦿ ` in a native `opencode` window). A `format-tab-title` handler strips that prefix and redraws the marker in `oc_agent_color`. Without this snippet the square stays uncolored.

Add `title_pane` at the top level of the config and merge the handler body into an existing `format-tab-title` handler, or use it as the handler. In a split tab, `title_pane` picks oc's pane (user variable `oc_tui=1`), so the tab keeps oc's title and color when a shell pane beside it is focused:

```lua
local wezterm = require 'wezterm'

local function title_pane(tab)
  local active = tab.active_pane
  if active.user_vars.oc_tui == '1' then
    return active.title, active.user_vars.oc_agent_color
  end
  local mux_tab = wezterm.mux.get_tab(tab.tab_id)
  for _, info in ipairs(mux_tab and mux_tab:panes_with_info() or {}) do
    local vars = info.pane:get_user_vars()
    if vars.oc_tui == '1' then return info.pane:get_title(), vars.oc_agent_color end
  end
  return active.title, active.user_vars.oc_agent_color
end

wezterm.on('format-tab-title', function(tab, tabs, panes, config, hover, max_width)
  local title, agent_color = title_pane(tab)
  local marker = '■'
  if title:sub(1, #'⦿ ') == '⦿ ' then
    marker = '⦿'
    title = title:sub(#'⦿ ' + 1)
  else
    title = (title:gsub('^■ ', ''))
  end
  if agent_color and agent_color:match('^#%x%x%x%x%x%x$') then
    return {
      { Foreground = { Color = agent_color } },
      { Text = ' ' .. marker },
      { Foreground = { Color = '#D0D0D0' } },
      { Text = ' ' .. title .. ' ' },
    }
  end
end)
```

Expect the square to change color when you switch agents (for example with Tab).

## Font

oc palette **Font** (`/font`) picks a monospace family, weight, and size. oc saves the choice and sends it as the user variable `oc_font` (JSON `{family, weight, size}`, empty to reset) when you change it and when oc starts. WezTerm applies fonts per window, so every tab in that window changes, and the font stays after oc exits until **Reset to terminal default**. Without this handler nothing changes:

```lua
wezterm.on('user-var-changed', function(window, pane, name, value)
  if name ~= 'oc_font' then return end
  local overrides = window:get_config_overrides() or {}
  overrides.font, overrides.font_size = nil, nil
  if value ~= '' then
    local ok, spec = pcall(wezterm.serde.json_decode, value)
    if not ok or type(spec) ~= 'table' then return end
    if type(spec.family) == 'string' then
      overrides.font = wezterm.font(spec.family, { weight = spec.weight or 'Regular' })
    end
    overrides.font_size = tonumber(spec.size)
  end
  window:set_config_overrides(overrides)
end)
```

The family list comes from `wezterm ls-fonts --list-system`, filtered to fonts whose files mark them fixed pitch.
