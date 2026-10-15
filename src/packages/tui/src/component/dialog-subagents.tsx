import { TextAttributes } from "@opentui/core"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { createResource, createMemo, createSignal } from "solid-js"
import { useDialog } from "../ui/dialog"
import { useSDK } from "../context/sdk"
import { useTheme } from "../context/theme"
import { useClipboard } from "../context/clipboard"
import { useToast } from "../ui/toast"
import { useSync } from "../context/sync"
import { errorMessage } from "../util/error"
import { DialogModel } from "./dialog-model"
import { DialogSubagentEfforts } from "./dialog-subagent-efforts"
import { DialogConfirm } from "../ui/dialog-confirm"
import { DialogPrompt } from "../ui/dialog-prompt"

function shortModelName(modelID: string): string {
  let short = modelID
  if (short.startsWith("claude-")) short = short.slice("claude-".length)
  short = short.replace(/-(\d+)-(\d+)$/, ".$1.$2")
  return short
}

// List of delegated agents grouped by model. Fetched fresh on open because
// sync.data.agent is only loaded at bootstrap and misses agents added by /addSub later.
export function DialogSubagents() {
  const dialog = useDialog()
  const sdk = useSDK()
  const sync = useSync()
  const { theme } = useTheme()
  const clipboard = useClipboard()
  const toast = useToast()
  dialog.setSize("large")

  const [loadError, setLoadError] = createSignal<unknown>()

  const [agents] = createResource(() =>
    sdk.client.app
      .agents({}, { throwOnError: true })
      .then((result) => result.data ?? [])
      // Catch so an errored resource never re-throws inside the memo and tears down the dialog.
      .catch((error) => {
        setLoadError(error)
        return undefined
      }),
  )

  const showError = createMemo(() => Boolean(loadError()))

  const [editableNames] = createResource(() =>
    sdk.client.app.agent.sub
      .list({}, { throwOnError: true })
      .then((result) => new Set(result.data ?? []))
      .catch((error) => {
        toast.error(error)
        return new Set<string>()
      }),
  )

  const titleWidth = createMemo(() =>
    Math.max(0, ...(agents() ?? []).filter((a) => a.mode !== "primary" && !a.hidden).map((a) => a.name.length)),
  )

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    if (showError()) return []
    const list = (agents() ?? []).filter((agent) => agent.mode !== "primary" && !agent.hidden)
    return list
      .map((agent) => ({
        agent,
        category: agent.native
          ? "native"
          : agent.model
            ? `${agent.model.providerID}/${agent.model.modelID}`
            : "default model",
      }))
      .sort((a, b) => a.category.localeCompare(b.category) || a.agent.name.localeCompare(b.agent.name))
      .map(({ agent, category }) => ({
        title: agent.name.padEnd(titleWidth()),
        description: agent.variant ?? "-",
        footer: agent.description
          ?.replace(/\s+/g, " ")
          .trim()
          .split(/(?<=\.)\s/)[0],
        value: agent.name,
        category,
      }))
  })

  const allOptions = createMemo<DialogSelectOption<string>[]>(() => {
    if (showError()) return options()
    const addRow: DialogSelectOption<string> = {
      title: "Add subagent",
      description: "Choose model",
      value: "__add__",
      category: "Actions",
    }
    return [addRow, ...options()]
  })

  function reopen() {
    dialog.replace(() => <DialogSubagents />)
  }

  async function continueAdd(providerID: string, modelID: string, selectedEfforts: Array<string | undefined>) {
    const info = sync.data.provider.find((provider) => provider.id === providerID)?.models[modelID]
    const displayName = info?.name ?? modelID
    const short = shortModelName(modelID)

    let defaultName: string
    if (selectedEfforts.length === 1) {
      const effort = selectedEfforts[0]
      defaultName = effort ? `general-${short}-${effort}` : `general-${short}`
    } else {
      defaultName = `general-${short}`
    }

    const nameInput = await DialogPrompt.show(dialog, "Name", { value: defaultName })
    if (!nameInput) {
      reopen()
      return
    }
    const baseName = nameInput.trim()
    if (!baseName) {
      reopen()
      return
    }

    for (const effort of selectedEfforts) {
      const entryName = selectedEfforts.length === 1 ? baseName : effort ? `${baseName}-${effort}` : baseName
      try {
        await sdk.client.app.agent.sub.add(
          {
            name: entryName,
            model: `${providerID}/${modelID}`,
            variant: effort,
            description: effort ? `${displayName}, ${effort}.` : `${displayName}.`,
          },
          { throwOnError: true },
        )
        toast.show({ message: `Added ${entryName}`, variant: "success" })
      } catch (error) {
        toast.error(error)
      }
    }
    reopen()
  }

  async function startAdd(providerID: string, modelID: string) {
    const info = sync.data.provider.find((provider) => provider.id === providerID)?.models[modelID]
    const variants = info?.variants ? Object.keys(info.variants) : []
    if (variants.length > 0) {
      dialog.replace(() => (
        <DialogSubagentEfforts
          efforts={variants}
          onConfirm={(selected) => void continueAdd(providerID, modelID, selected)}
        />
      ), undefined, { back: reopen })
      return
    }
    void continueAdd(providerID, modelID, [undefined])
  }

  return (
    <DialogSelect
      title="Subagents"
      placeholder="Search subagents…"
      options={allOptions()}
      renderFilter={!showError()}
      locked={showError()}
      onSelect={(option) => {
        if (option.value === "__add__") {
          dialog.replace(() => (
            <DialogModel updateCurrent={false} onSelect={(providerID, modelID) => void startAdd(providerID, modelID)} />
          ), undefined, { back: reopen })
          return
        }
        void clipboard
          .write?.(option.value)
          .then(() => toast.show({ message: `Copied ${option.value}`, variant: "info" }))
          .catch(toast.error)
      }}
      emptyView={
        showError() ? (
          <box paddingLeft={4} paddingRight={4}>
            <text fg={theme.error} attributes={TextAttributes.BOLD}>
              Could not load subagents
            </text>
            <text fg={theme.textMuted}>{errorMessage(loadError())}</text>
          </box>
        ) : undefined
      }
      actions={[
        {
          command: "subagent.delete",
          title: "delete",
          disabled: (option) => {
            if (!option) return true
            if (option.value === "__add__") return true
            return !editableNames()?.has(option.value)
          },
          onTrigger: async (option) => {
            const name = option.value
            if (name === "__add__") return
            const ok = await DialogConfirm.show(dialog, "Delete subagent", `Delete ${name}?`)
            if (!ok) {
              reopen()
              return
            }
            try {
              await sdk.client.app.agent.sub.remove({ name }, { throwOnError: true })
              toast.show({ message: `Deleted ${name}`, variant: "success" })
            } catch (error) {
              toast.error(error)
            }
            reopen()
          },
        },
      ]}
    />
  )
}
