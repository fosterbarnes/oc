export * as TuiKeybindPreset from "./keybindPreset"

import { TuiKeybind } from "./keybind"

export const Names = ["oc", "opencode"] as const

// oc layout on top of upstream defaults ("opencode" preset). Upstream leader keys stay alongside
// their replacements so terminals that send ctrl+m as Enter, and opencode habits, still work.
export const oc: TuiKeybind.KeybindOverrides = {
  app_exit: "<leader>q",
  // ctrl+c never closes dialogs; Esc does.
  "dialog.close": "none",
  model_list: "ctrl+m,<leader>m",
  session_list: "ctrl+s,<leader>l",
  session_child_first: "ctrl+b,<leader>down",
  session_background: "ctrl+shift+b",
  // Every Windows terminal takes Alt+Enter for fullscreen. Alt+Q means "send it, I'm staying here":
  // queue in a session, send and stay on Home (their prompt layers never overlap).
  prompt_queue: "alt+q,alt+return",
  prompt_submit_background: "ctrl+return,alt+q",
  // ctrl+d: variant cycle in the prompt, delete in the session list (dialog layer wins).
  variant_cycle: "ctrl+d,ctrl+t",
  stash_delete: "none",
  // Tab types a tab in the prompt; Shift+Tab takes over agent cycling.
  agent_cycle: "shift+tab",
  agent_cycle_reverse: "none",
  input_tab: "tab",
  input_delete: "delete,shift+delete",
  input_line_home: "none",
  input_select_all: "ctrl+a,super+a",
  input_move_left: "left",
  input_move_up: "up,ctrl+shift+up",
  input_move_down: "down,ctrl+shift+down",
}

// macOS on top of the oc layout: app shortcuts move from ctrl to cmd (super; the terminal must send it,
// e.g. WezTerm with enable_kitty_keyboard). Terminal and readline keys stay on ctrl: the leader,
// ctrl+c and ctrl+z, prompt editing, list navigation (ctrl+p/ctrl+n), and transcript scrolling.
const macKeepsCtrl = new Set([
  "leader",
  "app_exit",
  "terminal_suspend",
  "dialog.close",
  "dialog.session_rename.copy",
  "dialog.select.prev",
  "dialog.select.next",
  "prompt.autocomplete.prev",
  "prompt.autocomplete.next",
])
export const mac: TuiKeybind.KeybindOverrides = {
  ...Object.fromEntries(
    Object.entries(TuiKeybind.Definitions).flatMap(([name, item]) => {
      if (macKeepsCtrl.has(name) || /^(input|messages|which_key)_/.test(name)) return []
      const value = oc[name as keyof typeof oc] ?? item.default
      if (typeof value !== "string" || !value.includes("ctrl+")) return []
      return [[name, value.replaceAll("ctrl+", "super+")]]
    }),
  ),
  // Cmd+Q quits the terminal, so the Alt+Q queue/send-and-stay key gets Cmd+Option+Q; Option+Q stays.
  prompt_queue: "super+alt+q,alt+q,alt+return",
  prompt_submit_background: "super+return,super+alt+q,alt+q",
}
