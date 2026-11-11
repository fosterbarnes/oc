// Palette Sync: turn tailnet config sync on or off, exclude items from it on this machine, see peers,
// and restore local edits a newer peer change overwrote. Sync itself runs in the resident server
// (opencode `server/syncPeer.ts`); this dialog edits oc.json `sync` and reads `state/sync/status.json`.
import { createMemo, createResource, createSignal } from "solid-js"
import { OcItems } from "@opencode-ai/core/util/ocItems"
import { OcSync } from "@opencode-ai/core/util/ocSync"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { DialogConfirm } from "../ui/dialog-confirm"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { useSDK } from "../context/sdk"
import { errorMessage } from "../util/error"
import { persistOcSync } from "../ocSettings"
import { nodeByValue, treeOptions, type TreeState } from "./itemTree"

export function DialogSync() {
  const dialog = useDialog()
  const toast = useToast()
  const sdk = useSDK()
  const [settings, setSettings] = createSignal(OcSync.settings())
  const [collected] = createResource(() => OcItems.collect())
  const [status, { refetch }] = createResource(() => OcSync.readStatus())
  const items = createMemo(() => collected()?.items ?? [])
  const nodes = createMemo(() => OcItems.tree(items()))
  const tagsById = createMemo(() => new Map(items().map((item) => [item.id, OcItems.tags(item)])))

  const save = (next: OcSync.Settings) => {
    setSettings(next)
    try {
      persistOcSync(next)
    } catch (error) {
      toast.show({ variant: "error", message: `Sync setting not saved: ${errorMessage(error)}` })
    }
  }
  const isExcluded = (id: string) => OcItems.excluded(id, tagsById().get(id) ?? [], settings().exclude)
  const state = (node: OcItems.TreeNode): TreeState => {
    if (node.key.startsWith("tag:")) return settings().exclude.includes(node.key) ? "off" : "on"
    const count = node.ids.filter(isExcluded).length
    if (count === 0) return "on"
    return count === node.ids.length ? "off" : "some"
  }

  function toggleNode(node: OcItems.TreeNode) {
    const current = settings().exclude
    const off = state(node) === "off"
    save({
      ...settings(),
      exclude: off ? OcItems.includeNode(current, node, nodes()) : OcItems.excludeNode(current, node),
    })
    if (off && state(node) === "off") {
      toast.show({ variant: "info", message: `${node.title} stays excluded by a Tag row; include that tag first` })
    }
  }

  async function restore(conflict: OcSync.Conflict) {
    const message = `Put back this machine's version of ${conflict.id} and the other files that change from ${conflict.peer} overwrote. The restored files sync to your other machines as a new change.`
    if (!(await DialogConfirm.show(dialog, "Restore", message, "Restore"))) return
    dialog.replace(() => <DialogSync />)
    await OcItems.undo(conflict.backup)
      .then(async (restored) => {
        await sdk.client.global.dispose()
        toast.show({ variant: "success", message: `Restored ${restored ?? 0} files` })
      })
      .catch((error) => toast.show({ variant: "error", message: `Restore failed: ${errorMessage(error)}` }))
    void refetch()
  }

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    const current = status()
    const enabled = settings().enabled
    const header: DialogSelectOption<string>[] = [
      {
        title: `Sync with my other machines: ${enabled ? "on" : "off"}`,
        value: "toggle",
        category: "Sync",
        description: "same Tailscale account, every 20 s",
      },
    ]
    const peers: DialogSelectOption<string>[] = !enabled
      ? []
      : current?.error
        ? [{ title: current.error, value: "", inert: true, category: "Sync" }]
        : (current?.peers ?? []).length === 0
          ? [{ title: "No other oc with sync on found yet", value: "", inert: true, category: "Sync" }]
          : (current?.peers ?? []).map((peer) => ({
              title: peer.name,
              value: "",
              inert: true,
              category: "Sync",
              description: peer.error ?? (peer.ok ? `synced ${ago(peer.ok)}` : ""),
            }))
    const conflicts = current ? OcSync.openConflicts(current) : []
    const restores = conflicts.reverse().map((conflict) => ({
      title: conflict.id,
      value: `restore:${conflict.backup}:${conflict.id}`,
      category: "Overwritten local edits (enter restores)",
      description: `by ${conflict.peer} ${ago(conflict.at)}`,
    }))
    const tree = collected.loading
      ? [{ title: "Reading settings", value: "", inert: true, category: "Items" }]
      : treeOptions(nodes(), state, undefined, "Items (enter excludes or includes on this machine)")
    return [...header, ...peers, ...restores, ...tree]
  })

  return (
    <DialogSelect
      title="Sync settings"
      options={options()}
      preserveSelection
      footer={<text>{`${items().filter((item) => !isExcluded(item.id)).length} of ${items().length} items sync`}</text>}
      onSelect={(option) => {
        if (option.value === "toggle") return save({ ...settings(), enabled: !settings().enabled })
        if (option.value.startsWith("restore:")) {
          const conflict = OcSync.openConflicts(
            status() ?? { enabled: false, updated: 0, peers: [], conflicts: [] },
          ).find((entry) => option.value === `restore:${entry.backup}:${entry.id}`)
          if (conflict) void restore(conflict)
          return
        }
        const node = nodeByValue(nodes(), option.value)
        if (node) toggleNode(node)
      }}
      actions={[
        {
          command: "sync.refresh",
          title: "refresh",
          bind: "ctrl+r",
          selection: "none",
          onTrigger: () => void refetch(),
        },
      ]}
    />
  )
}

function ago(time: number) {
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`
  return `${Math.round(seconds / 86_400)}d ago`
}
