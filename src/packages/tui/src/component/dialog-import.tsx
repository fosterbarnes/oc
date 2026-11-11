// Palette Import and Export: move skills, commands, agents, themes, and settings between machines in
// one `.ocpack` file. Logic: core `util/ocItems.ts` (items, compare, apply, undo) and `util/ocPack.ts`.
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createMemo, createResource, createSignal } from "solid-js"
import { OcItems } from "@opencode-ai/core/util/ocItems"
import { OcPack } from "@opencode-ai/core/util/ocPack"
import { DialogSelect } from "../ui/dialog-select"
import { DialogConfirm } from "../ui/dialog-confirm"
import { DialogPrompt } from "../ui/dialog-prompt"
import { useDialog, type DialogContext } from "../ui/dialog"
import { useToast, type ToastContext } from "../ui/toast"
import { useSDK } from "../context/sdk"
import { errorMessage } from "../util/error"
import { nodeByValue, pickedState, togglePicked, treeOptions } from "./itemTree"

type Client = ReturnType<typeof useSDK>["client"]

export async function openImport(dialog: DialogContext, toast: ToastContext) {
  const file = await DialogPrompt.show(dialog, "Import oc settings file", {
    placeholder: `path to an ${OcPack.EXTENSION} file`,
    value: await newestPack(),
  })
  if (!file?.trim()) return dialog.clear()
  const target = cleanPath(file)
  const packed = await OcPack.unpack(target).catch((error: unknown) => {
    toast.show({ variant: "error", message: `Cannot read ${target}: ${errorMessage(error)}` })
    return undefined
  })
  if (!packed) return dialog.clear()
  const result = await OcItems.compare(packed.items)
  dialog.replace(() => <DialogImportPick source={packed.source.name} entries={result.entries} same={result.same} />)
}

function DialogImportPick(props: { source: string; entries: OcItems.Entry[]; same: number }) {
  const dialog = useDialog()
  const toast = useToast()
  const sdk = useSDK()
  const [picked, setPicked] = createSignal<ReadonlySet<string>>(new Set())
  const nodes = OcItems.tree(props.entries.map((entry) => entry.item))
  const byId = new Map(props.entries.map((entry) => [entry.item.id, entry]))

  const options = createMemo(() => {
    if (props.entries.length === 0) {
      return [{ title: `Nothing to import: ${props.same} items already match`, value: "", inert: true }]
    }
    return treeOptions(
      nodes,
      (node) => pickedState(node, picked()),
      (node) => {
        const entry = byId.get(node.key)
        if (!entry) return undefined
        return [
          entry.status,
          entry.item.code ? "runs code" : "",
          entry.missing.length ? `${entry.missing.length} missing paths` : "",
        ]
          .filter(Boolean)
          .join(" · ")
      },
    )
  })

  async function run() {
    const chosen = props.entries.filter((entry) => picked().has(entry.item.id))
    if (chosen.length === 0) return toast.show({ message: "Nothing selected", variant: "warning" })
    const code = chosen.filter((entry) => entry.item.code).length
    const missing = [...new Set(chosen.flatMap((entry) => entry.missing))]
    const message = [
      `Copy ${chosen.length} items from ${props.source}. Changed files are backed up first; Undo last import restores them.`,
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
    await OcItems.apply(chosen.map((entry) => entry.item))
      .then(async (applied) => {
        await sdk.client.global.dispose()
        toast.show({
          variant: "success",
          message: `Imported ${chosen.length} items from ${props.source} (${applied.files} files)`,
          action: { label: "Undo", run: () => void undoImport(toast, sdk.client) },
        })
      })
      .catch((error) => toast.show({ variant: "error", message: `Import failed: ${errorMessage(error)}` }))
  }

  return (
    <DialogSelect
      title={`Import from ${props.source}`}
      options={options()}
      preserveSelection
      footer={<text>{`${picked().size} of ${props.entries.length} selected`}</text>}
      onSelect={(option) => {
        const node = nodeByValue(nodes, option.value)
        if (node) setPicked(togglePicked(node, picked()))
      }}
      actions={[
        {
          command: "import.all",
          title: "all",
          bind: "ctrl+a",
          selection: "none",
          onTrigger: () => setPicked(new Set(props.entries.map((entry) => entry.item.id))),
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

export function DialogExport() {
  const dialog = useDialog()
  const toast = useToast()
  const [collected] = createResource(() => OcItems.collect())
  const items = createMemo((): OcItems.Item[] => collected()?.items ?? [])
  const nodes = createMemo(() => OcItems.tree(items()))
  // Everything starts picked; undefined until the user changes it.
  const [changed, setPicked] = createSignal<ReadonlySet<string>>()
  const picked = () => changed() ?? new Set(items().map((item) => item.id))

  const options = createMemo(() => {
    if (collected.loading) return [{ title: "Reading settings", value: "", inert: true }]
    if (collected.error) return [{ title: errorMessage(collected.error), value: "", inert: true }]
    return treeOptions(nodes(), (node) => pickedState(node, picked()))
  })

  async function run() {
    const chosen = items().filter((item) => picked().has(item.id))
    if (chosen.length === 0) return toast.show({ message: "Nothing selected", variant: "warning" })
    const file = await DialogPrompt.show(dialog, `Export ${chosen.length} items to`, { value: defaultExportPath() })
    if (!file?.trim()) return dialog.clear()
    dialog.clear()
    await OcPack.pack(chosen, cleanPath(file))
      .then((result) => toast.show({ variant: "success", message: `Exported ${result.items} items to ${result.file}` }))
      .catch((error) => toast.show({ variant: "error", message: `Export failed: ${errorMessage(error)}` }))
  }

  return (
    <DialogSelect
      title="Export oc settings"
      options={options()}
      preserveSelection
      footer={<text>{`${picked().size} of ${items().length} selected · secrets are never exported`}</text>}
      onSelect={(option) => {
        const node = nodeByValue(nodes(), option.value)
        if (node) setPicked(togglePicked(node, picked()))
      }}
      actions={[
        {
          command: "export.all",
          title: "all",
          bind: "ctrl+a",
          selection: "none",
          onTrigger: () => setPicked(new Set(items().map((item) => item.id))),
        },
        {
          command: "export.none",
          title: "none",
          bind: "ctrl+u",
          selection: "none",
          onTrigger: () => setPicked(new Set<string>()),
        },
        { command: "export.run", title: "export", bind: "ctrl+s", selection: "none", onTrigger: () => void run() },
      ]}
    />
  )
}

export async function undoImport(toast: ToastContext, client: Client) {
  const restored = await OcItems.undo().catch((error: unknown) => {
    toast.show({ variant: "error", message: `Undo failed: ${errorMessage(error)}` })
    return null
  })
  if (restored === null) return
  if (restored === undefined) return toast.show({ variant: "info", message: "No import to undo" })
  await client.global.dispose()
  toast.show({ variant: "success", message: `Undid last import (${restored} files restored)` })
}

function defaultExportPath() {
  const date = new Date().toISOString().slice(0, 10)
  return path.join(os.homedir(), "Downloads", `oc-${os.hostname().split(".")[0]}-${date}${OcPack.EXTENSION}`)
}

// The newest pack in Downloads, or an empty prompt.
async function newestPack() {
  const downloads = path.join(os.homedir(), "Downloads")
  const names = await fs.readdir(downloads).catch(() => [] as string[])
  const packs = await Promise.all(
    names
      .filter((name) => name.endsWith(OcPack.EXTENSION))
      .map(async (name) => {
        const file = path.join(downloads, name)
        return { file, time: (await fs.stat(file)).mtimeMs }
      }),
  )
  return packs.sort((a, b) => b.time - a.time)[0]?.file ?? ""
}

// Accepts a path typed, pasted, or dragged into the terminal: surrounding quotes, `\ ` escapes
// (not on Windows, where `\` separates folders), and a leading `~`.
function cleanPath(input: string) {
  const text = input.trim().replace(/^(['"])(.*)\1$/, "$2")
  const file = process.platform === "win32" ? text : text.replace(/\\(.)/g, "$1")
  return file === "~" || file.startsWith("~/") ? path.join(os.homedir(), file.slice(1)) : file
}
