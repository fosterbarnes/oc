// macOS: where the WezTerm window hosting this process sits, so /revive can reopen it in the same place.
// The window list (CGWindowListCopyWindowInfo) gives bounds without Accessibility or Screen Recording
// permission; titles would need Screen Recording, so the window is matched by its owner pid.
import path from "path"
import { ProcessDarwin } from "./processDarwin"

/** `x`/`y` are in pixels: `wezterm start --position` takes pixels, the window list reports points. */
export type Placement = { fullScreen: true } | { x: number; y: number; cols: number; rows: number }
type Rect = { x: number; y: number; width: number; height: number }
export type Screen = Rect & { scale: number }

export function capture(paneID: string): Placement | undefined {
  if (process.platform !== "darwin") return undefined
  const gui = guiPid()
  if (!gui) return undefined
  const result = Bun.spawnSync(["osascript", "-l", "JavaScript", "-e", BOUNDS_SCRIPT, String(gui)], {
    stdout: "pipe",
    stderr: "pipe",
  })
  if (result.exitCode !== 0) return undefined
  const found = parse(result.stdout.toString()) as { window?: Rect; screens: Screen[] } | undefined
  if (!found?.window) return undefined
  const list = Bun.spawnSync(["wezterm", "cli", "--no-auto-start", "list", "--format", "json"], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const size =
    (list.exitCode === 0 ? tabSize(list.stdout.toString(), paneID) : undefined) ??
    (process.stdout.columns && process.stdout.rows
      ? { cols: process.stdout.columns, rows: process.stdout.rows }
      : undefined)
  return placement(found.window, found.screens, size)
}

/** Full screen when the window covers its whole display: a normal window can't cover the menu bar. */
export function placement(
  window: Rect,
  screens: Screen[],
  size: { cols: number; rows: number } | undefined,
): Placement | undefined {
  const centerX = window.x + window.width / 2
  const centerY = window.y + window.height / 2
  const screen =
    screens.find(
      (item) =>
        centerX >= item.x && centerX < item.x + item.width && centerY >= item.y && centerY < item.y + item.height,
    ) ?? screens[0]
  if (!screen) return undefined
  if (
    window.x === screen.x &&
    window.y === screen.y &&
    window.width === screen.width &&
    window.height === screen.height
  )
    return { fullScreen: true }
  if (!size) return undefined
  return { x: Math.round(window.x * screen.scale), y: Math.round(window.y * screen.scale), ...size }
}

/** The terminal size of the tab holding `paneID`: split panes add up, dividers included. */
export function tabSize(listJson: string, paneID: string) {
  const panes = (parse(listJson) ?? []) as Array<{
    tab_id: number
    pane_id: number
    left_col: number
    top_row: number
    size: { cols: number; rows: number }
  }>
  const tab = panes.find((pane) => String(pane.pane_id) === paneID)?.tab_id
  const inTab = panes.filter((pane) => pane.tab_id === tab)
  if (tab === undefined || inTab.length === 0) return undefined
  return {
    cols: Math.max(...inTab.map((pane) => pane.left_col + pane.size.cols)),
    rows: Math.max(...inTab.map((pane) => pane.top_row + pane.size.rows)),
  }
}

// Placement is best effort: unreadable output means /revive reopens at WezTerm's default spot, not that it fails.
function parse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// The pane's process is a descendant of its wezterm-gui. A pane served by a separate mux server has no
// GUI ancestor, so fall back to the GUI socket name (`gui-sock-<pid>`) in the pane's environment.
function guiPid() {
  const walk = (pid: number, depth: number): number | undefined => {
    if (pid <= 1 || depth > 32) return undefined
    const item = ProcessDarwin.read(pid)
    if (!item) return undefined
    if (path.basename(item.executable) === "wezterm-gui") return pid
    return walk(item.parentPid, depth + 1)
  }
  const socket = /gui-sock-(\d+)$/.exec(process.env.WEZTERM_UNIX_SOCKET ?? "")
  return walk(process.pid, 0) ?? (socket ? Number(socket[1]) : undefined)
}

// Window bounds in top-left-origin points (frontmost window of that pid first); screens converted from
// AppKit's bottom-left origin to the same space (the first screen holds the menu bar and the origin).
const BOUNDS_SCRIPT = `
ObjC.import("CoreGraphics")
ObjC.import("AppKit")
function run(argv) {
  const pid = Number(argv[0])
  const info = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1 | 16, 0))) || []
  const item = info.find((w) => w.kCGWindowOwnerPID === pid && w.kCGWindowLayer === 0)
  const list = $.NSScreen.screens
  const top = list.objectAtIndex(0).frame.size.height
  const screens = []
  for (let i = 0; i < list.count; i++) {
    const screen = list.objectAtIndex(i)
    const frame = screen.frame
    screens.push({
      x: frame.origin.x,
      y: top - frame.origin.y - frame.size.height,
      width: frame.size.width,
      height: frame.size.height,
      scale: screen.backingScaleFactor,
    })
  }
  const b = item && item.kCGWindowBounds
  return JSON.stringify({ window: b ? { x: b.X, y: b.Y, width: b.Width, height: b.Height } : undefined, screens })
}
`

export * as WeztermWindow from "./weztermWindow"
