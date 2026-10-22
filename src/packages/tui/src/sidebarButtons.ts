import { SIDEBAR_BUTTONS_DEFAULT, type Resolved } from "./config"
import { persistTuiSetting } from "./ocSettings"
import type { ToastContext } from "./ui/toast"

// Shared by the palettes (alt+p), sidebar right-click, and the oc reset entry.
export function toggleSidebarButton(config: Resolved, toast: ToastContext, name: string, label: string) {
  const pinned = config.sidebar_buttons.includes(name)
  const next = pinned ? config.sidebar_buttons.filter((item) => item !== name) : [...config.sidebar_buttons, name]
  config.setSidebarButtons(next)
  void persistTuiSetting(["sidebar_buttons"], next)
  const hint = SIDEBAR_BUTTONS_DEFAULT.includes(name) ? " (oc Palette > Reset sidebar buttons restores it)" : ""
  toast.show({
    message: pinned ? `Removed "${label}" from sidebar${hint}` : `Added "${label}" to sidebar`,
    variant: "success",
  })
}

export function resetSidebarButtons(config: Resolved, toast: ToastContext) {
  config.setSidebarButtons(undefined)
  void persistTuiSetting(["sidebar_buttons"], undefined)
  toast.show({ message: "Sidebar buttons reset", variant: "success" })
}
