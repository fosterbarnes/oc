// Docked sidebar width, set from the oc "Sidebar width" palette entry
export const SIDEBAR_WIDTH_KEY = "sidebar_width"
export const SIDEBAR_WIDTH_DEFAULT = 42
export const SIDEBAR_WIDTH_MIN = 30
export const SIDEBAR_WIDTH_MAX = 80
// Columns always left for the message pane beside a docked sidebar
const _MIN_CONTENT_WIDTH = 60

export function clampSidebarWidth(value: number) {
  if (!Number.isFinite(value)) return SIDEBAR_WIDTH_DEFAULT
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(value)))
}

/** Stored width, shrunk so the message pane keeps its minimum on narrow terminals. */
export function fitSidebarWidth(stored: number, terminalWidth: number) {
  return Math.max(SIDEBAR_WIDTH_MIN, Math.min(clampSidebarWidth(stored), terminalWidth - _MIN_CONTENT_WIDTH))
}
