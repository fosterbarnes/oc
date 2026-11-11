// Palette Import: pick another oc on the same Tailscale account, then pick which of its skills,
// commands, agents, themes, and settings to copy here. Logic: core `util/ocImport.ts`.
import { createMemo, createResource, createSignal } from "solid-js"
import { OcImport } from "@opencode-ai/core/util/ocImport"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { DialogConfirm } from "../ui/dialog-confirm"
import { useDialog } from "../ui/dialog"
import { useToast, type ToastContext } from "../ui/toast"
import { useSDK } from "../context/sdk"
import { errorMessage } from "../util/error"

const _CATEGORY_ORDER = Object.keys(OcImport.CATEGORY_TITLE) as OcImport.Category[]

export function DialogImport() {
  const dialog = useDialog()
  const [peers, { refetch }] = createResource(() => OcImport.scan())

  const options = createMemo<DialogSelectOption<OcImport.Peer | undefined>[]>(() => {
    if (peers.loading) return [{ title: "Scanning tailnet", value: undefined, inert: true }]
    if (peers.error) return [{ title: errorMessage(peers.error), value: undefined, inert: true }]
    const found = peers() ?? []
    if (found.length === 0) {
      return [
        {
          title: "No oc found",
          value: undefined,
          inert: true,
          description: "the other machine needs Allow import from this machine on",
        },
      ]
    }
    return found.map((peer) => ({
      title: peer.host,
      value: peer,
      description: `${peer.hello.os} · ${peer.hello.ocVersion}`,
    }))
  })

  return (
    <DialogSelect
      title="Import from another oc"
      renderFilter={false}
      options={options()}
      actions={[
        {
          command: "import.rescan",
          title: "rescan",
          bind: "ctrl+r",
          selection: "none",
          onTrigger: () => void refetch(),
        },
      ]}
      onSelect={(option) => {
        const peer = option.value
        if (peer) dialog.replace(() => <DialogImportPick peer={peer} />)
      }}
    />
  )
}

function DialogImportPick(props: { peer: OcImport.Peer }) {
  const dialog = useDialog()
  const toast = useToast()
  const sdk = useSDK()
  const [picked, setPicked] = createSignal<ReadonlySet<string>>(new Set())
  const [result] = createResource(async () => OcImport.compare(await OcImport.fetchBundle(props.peer.ip)))

  const entries = createMemo(() =>
    [...(result()?.entries ?? [])].sort(
      (a, b) =>
        _CATEGORY_ORDER.indexOf(a.item.category) - _CATEGORY_ORDER.indexOf(b.item.category) ||
        a.item.label.localeCompare(b.item.label),
    ),
  )
  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    if (result.loading) return [{ title: `Reading ${props.peer.host}`, value: "", inert: true }]
    if (result.error) return [{ title: errorMessage(result.error), value: "", inert: true }]
    if (entries().length === 0) {
      return [{ title: `Nothing to import: ${result()?.same ?? 0} items already match`, value: "", inert: true }]
    }
    return entries().map((entry) => ({
      title: `${picked().has(entry.item.id) ? "[x]" : "[ ]"} ${entry.item.label}`,
      value: entry.item.id,
      category: OcImport.CATEGORY_TITLE[entry.item.category],
      description: [
        entry.status,
        entry.item.code ? "runs code" : "",
        entry.missing.length ? `${entry.missing.length} missing paths` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    }))
  })

  async function run() {
    const chosen = entries().filter((entry) => picked().has(entry.item.id))
    if (chosen.length === 0) return toast.show({ message: "Nothing selected", variant: "warning" })
    const code = chosen.filter((entry) => entry.item.code).length
    const missing = [...new Set(chosen.flatMap((entry) => entry.missing))]
    const message = [
      `Copy ${chosen.length} items from ${props.peer.host}. Changed files are backed up first; Undo last import restores them.`,
      code ? `${code} of them run code on this machine.` : "",
      missing.length
        ? `Paths not on this machine: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", ..." : ""}`
        : "",
      "Open projects reload afterwards.",
    ]
      .filter(Boolean)
      .join("\n\n")
    if (!(await DialogConfirm.show(dialog, "Import", message, "Import"))) return
    dialog.clear()
    await OcImport.apply(chosen.map((entry) => entry.item))
      .then(async (applied) => {
        await sdk.client.global.dispose()
        toast.show({
          variant: "success",
          message: `Imported ${chosen.length} items from ${props.peer.host} (${applied.files} files)`,
          action: { label: "Undo", run: () => void undoImport(toast, sdk.client) },
        })
      })
      .catch((error) => toast.show({ variant: "error", message: `Import failed: ${errorMessage(error)}` }))
  }

  return (
    <DialogSelect
      title={`Import from ${props.peer.host}`}
      options={options()}
      preserveSelection
      footer={<text>{`${picked().size} of ${entries().length} selected`}</text>}
      onSelect={(option) => option.value && toggle(option.value)}
      actions={[
        {
          command: "import.all",
          title: "all",
          bind: "ctrl+a",
          selection: "none",
          onTrigger: () => setPicked(new Set(entries().map((entry) => entry.item.id))),
        },
        {
          command: "import.none",
          title: "none",
          bind: "ctrl+u",
          selection: "none",
          onTrigger: () => setPicked(new Set()),
        },
        { command: "import.run", title: "import", bind: "ctrl+s", selection: "none", onTrigger: () => void run() },
      ]}
    />
  )
}

export async function undoImport(toast: ToastContext, client: ReturnType<typeof useSDK>["client"]) {
  const restored = await OcImport.undo().catch((error: unknown) => {
    toast.show({ variant: "error", message: `Undo failed: ${errorMessage(error)}` })
    return null
  })
  if (restored === null) return
  if (restored === undefined) return toast.show({ variant: "info", message: "No import to undo" })
  await client.global.dispose()
  toast.show({ variant: "success", message: `Undid last import (${restored} files restored)` })
}
