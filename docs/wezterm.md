# WezTerm

oc is used daily in WezTerm. Put config in `~/.wezterm.lua` or `~/.config/wezterm/wezterm.lua`, then reload WezTerm.

## Tab color square

When the terminal helper reports WezTerm, oc sets the user variable `oc_agent_color` (`OSC 1337 SetUserVar`) to the active agent's hex color. The tab title still starts with a plain `■ ` (or `⦿ ` in a native `opencode` window). A `format-tab-title` handler strips that prefix and redraws the marker in `oc_agent_color`. Without this snippet the square stays uncolored.

Add this inside an existing `format-tab-title` handler, or use it as the handler:

```lua
local wezterm = require 'wezterm'

wezterm.on('format-tab-title', function(tab, tabs, panes, config, hover, max_width)
  local agent_color = tab.active_pane.user_vars.oc_agent_color
  local title = tab.active_pane.title
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
