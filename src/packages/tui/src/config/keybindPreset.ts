export * as TuiKeybindPreset from "./keybindPreset"

import type { TuiKeybind } from "./keybind"

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
  // ctrl+d: variant cycle in the prompt, delete in the session list (dialog layer wins).
  variant_cycle: "ctrl+d,ctrl+t",
  stash_delete: "none",
  input_delete: "delete,shift+delete",
  input_line_home: "none",
  input_select_all: "ctrl+a,super+a",
  input_move_left: "left",
  input_move_up: "up,ctrl+shift+up",
  input_move_down: "down,ctrl+shift+down",
}
