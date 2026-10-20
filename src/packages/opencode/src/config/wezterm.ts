import { Revive } from "./revive"

// The restarter inherits the old pane's mux socket; pinning it keeps list/kill off the new window's mux.
export function oldPanes(restart: Pick<Revive.RestartContext, "paneID" | "tabs">) {
  const socket = process.env.WEZTERM_UNIX_SOCKET
  if (!socket) return undefined
  const list = weztermList(socket)
  return { socket, panes: Revive.ownedPanes(list, restart).map((id) => ({ id, window: windowOf(list, id) })) }
}

export function closeOwnedPanes(old: NonNullable<ReturnType<typeof oldPanes>>) {
  const list = weztermList(old.socket)
  for (const pane of old.panes.filter((pane) => windowOf(list, pane.id) === pane.window)) killPane(pane.id, old.socket)
}

function weztermList(socket: string) {
  const list = Bun.spawnSync(["wezterm", "cli", "--no-auto-start", "list", "--format", "json"], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, WEZTERM_UNIX_SOCKET: socket },
  })
  if (list.exitCode !== 0) throw new Error(`wezterm cli list failed: ${list.stderr.toString().trim()}`)
  return list.stdout.toString()
}

function windowOf(listJson: string, paneID: string) {
  return (JSON.parse(listJson) as Array<{ window_id: number; pane_id: number }>).find(
    (pane) => String(pane.pane_id) === paneID,
  )?.window_id
}

export function killPane(paneID: string, socket?: string) {
  const result = Bun.spawnSync(["wezterm", "cli", "--no-auto-start", "kill-pane", "--pane-id", paneID], {
    stdout: "pipe",
    stderr: "pipe",
    ...(socket ? { env: { ...process.env, WEZTERM_UNIX_SOCKET: socket } } : {}),
  })
  if (result.exitCode !== 0)
    throw new Error(`wezterm cli kill-pane ${paneID} failed: ${result.stderr.toString().trim() || result.exitCode}`)
}
