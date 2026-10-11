import type { TuiPluginApi } from "@opencode-ai/plugin/tui"

/** Collapsed/expanded state of a sidebar section, remembered across sessions and restarts in the TUI kv store. */
export function sectionOpen<T extends boolean | undefined>(api: TuiPluginApi, section: string, fallback: T) {
  const key = `sidebar_open_${section}`
  const open = (): boolean | T => api.kv.get(key, fallback)
  const setOpen = (next: boolean | ((value: boolean | T) => boolean)) =>
    api.kv.set(key, typeof next === "function" ? next(open()) : next)
  return [open, setOpen] as const
}
