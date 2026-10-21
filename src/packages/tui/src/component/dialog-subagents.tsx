import { TextAttributes } from "@opentui/core"
import { stringifyKeyStroke } from "@opentui/keymap"
import type { Agent } from "@opencode-ai/sdk/v2"
import { DialogSelect, type DialogSelectOption, type DialogSelectRef } from "../ui/dialog-select"
import { createResource, createMemo, createSignal, createEffect } from "solid-js"
import { useDialog } from "../ui/dialog"
import { useSDK, type ClaudeAccountOption } from "../context/sdk"
import { useTheme } from "../context/theme"
import { useClipboard } from "../context/clipboard"
import { useToast } from "../ui/toast"
import { useSync } from "../context/sync"
import { useTuiConfig } from "../config"
import { errorMessage } from "../util/error"
import { persistAgentModel } from "../ocSettings"
import { DialogModel } from "./dialog-model"
import { DialogSubagentEfforts } from "./dialog-subagent-efforts"
import { DialogPrompt } from "../ui/dialog-prompt"

// Value of the "Add subagent" row, so row actions can ignore it
const ADD = "__add__"
// Order for efforts the model's own variant list does not include
const EFFORT_ORDER = ["none", "minimal", "low", "medium", "high", "xhigh", "max"]

// No effort first, then the model's variant order, then unknown efforts by EFFORT_ORDER (unlisted last)
function effortRank(variant: string | undefined, variants: string[]) {
  if (!variant) return -1
  if (variants.includes(variant)) return variants.indexOf(variant)
  const known = EFFORT_ORDER.indexOf(variant)
  return variants.length + (known < 0 ? EFFORT_ORDER.length : known)
}

function shortModelName(modelID: string): string {
  let short = modelID
  if (short.startsWith("claude-")) short = short.slice("claude-".length)
  short = short.replace(/-(\d+)-(\d+)$/, ".$1.$2")
  return short
}

// List of delegated agents grouped by model. Fetched fresh on open because
// sync.data.agent is only loaded at bootstrap and misses agents added by /addSub later.
// highlight moves the cursor to that agent once the list loads (set after an add).
export function DialogSubagents(props: { highlight?: string }) {
  const dialog = useDialog()
  const sdk = useSDK()
  const sync = useSync()
  const { theme } = useTheme()
  const clipboard = useClipboard()
  const toast = useToast()
  const tuiConfig = useTuiConfig()
  dialog.setSize("large")

  const [loadError, setLoadError] = createSignal<unknown>()
  const [toDelete, setToDelete] = createSignal<string>()
  const [selectedValue, setSelectedValue] = createSignal(ADD)
  const [ref, setRef] = createSignal<DialogSelectRef<string>>()
  let pendingHighlight = props.highlight

  // Keyed on configReloadEpoch: a global config write reloads agents server-side after the PATCH
  // returns, so a refetch right after a model change would still read the old list.
  const [agents, { refetch: refetchAgents }] = createResource(
    () => sync.configReloadEpoch,
    () =>
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

  const [editableNames, { refetch: refetchEditable }] = createResource(() =>
    sdk.client.app.agent.sub
      .list({}, { throwOnError: true })
      .then((result) => new Set(result.data ?? []))
      .catch((error) => {
        toast.error(error)
        return new Set<string>()
      }),
  )

  // Static config lookup, as in the model category dialog, so row titles never track the binding layer
  const deleteHint = createMemo(() => {
    const key = tuiConfig.keybinds.get("subagent.delete")[0]?.key
    return !key ? "" : typeof key === "string" ? key : stringifyKeyStroke(key)
  })

  function findAgent(name: string) {
    return agents()?.find((agent) => agent.name === name)
  }

  function modelInfo(model: NonNullable<Agent["model"]>) {
    const provider = sync.data.provider.find((item) => item.id === model.providerID)
    const info = provider?.models[model.modelID]
    return {
      name: info?.name ?? model.modelID,
      provider: provider?.name ?? model.providerID,
      variants: info?.variants ? Object.keys(info.variants) : [],
    }
  }

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    if (showError()) return []
    const rows = (agents() ?? [])
      .filter((agent) => agent.mode !== "primary" && !agent.hidden)
      .map((agent) => {
        const model = agent.model ? modelInfo(agent.model) : undefined
        const group = agent.native ? "Native" : (model?.provider ?? "Default model")
        const subgroup = agent.native ? "" : (model?.name ?? "")
        return { agent, model, group, subgroup, order: effortRank(agent.variant, model?.variants ?? []) }
      })
      .sort(
        (a, b) =>
          Number(b.agent.native ?? false) - Number(a.agent.native ?? false) ||
          a.group.localeCompare(b.group) ||
          a.subgroup.localeCompare(b.subgroup) ||
          a.order - b.order ||
          a.agent.name.localeCompare(b.agent.name),
      )
    // Layout comes only from structured fields (provider, model, variant), never the free-text description
    return rows.map(({ agent, model, group, subgroup }) => {
      const deleting = toDelete() === agent.name
      return {
        title: deleting ? `Press ${deleteHint()} again to delete ${agent.name}` : agent.name,
        bg: deleting ? theme.error : undefined,
        value: agent.name,
        category: group,
        subcategory: subgroup || undefined,
        subcategoryColor: theme.textMuted,
        footer: agent.native ? model && [model.name, agent.variant].filter(Boolean).join(", ") : agent.variant,
      }
    })
  })

  const allOptions = createMemo<DialogSelectOption<string>[]>(() => {
    if (showError()) return options()
    return [{ title: "Add subagent…", value: ADD }, ...options()]
  })

  createEffect(() => {
    if (!pendingHighlight || !agents()) return
    const name = pendingHighlight
    pendingHighlight = undefined
    setTimeout(() => ref()?.moveTo(name), 0)
  })

  function reopen(highlight?: string) {
    dialog.replace(() => <DialogSubagents highlight={highlight} />)
  }

  function startAdd() {
    dialog.replace(
      () => (
        <DialogModel updateCurrent={false} onSelect={(providerID, modelID) => chooseEfforts(providerID, modelID)} />
      ),
      undefined,
      { back: () => reopen() },
    )
  }

  // Native agents (general, explore) have no sub entry; Enter rebinds their model in the global config
  function changeModel(agent: Agent) {
    dialog.replace(
      () => (
        <DialogModel
          current={agent.model}
          updateCurrent={false}
          onSelect={(providerID, modelID) => chooseEffort(agent, providerID, modelID)}
        />
      ),
      undefined,
      { back: () => reopen(agent.name) },
    )
  }

  // "" = Auto: the agent has no fixed effort, so each task call may pass provider/model#effort
  function chooseEffort(agent: Agent, providerID: string, modelID: string) {
    async function save(variant: string) {
      await persistAgentModel(sdk.client, agent.name, `${providerID}/${modelID}`, toast, variant)
      reopen(agent.name)
    }
    const { variants } = modelInfo({ providerID, modelID })
    if (variants.length === 0) {
      void save("")
      return
    }
    const sameModel = agent.model?.providerID === providerID && agent.model?.modelID === modelID
    dialog.replace(
      () => (
        <DialogSelect
          title="Reasoning"
          current={sameModel ? (agent.variant ?? "") : ""}
          options={[{ title: "Auto", value: "" }, ...variants.map((variant) => ({ title: variant, value: variant }))]}
          onSelect={(option) => void save(option.value)}
        />
      ),
      undefined,
      { back: () => changeModel(agent) },
    )
  }

  function chooseEfforts(providerID: string, modelID: string) {
    const model = modelInfo({ providerID, modelID })
    if (model.variants.length === 0) {
      void chooseAccount(providerID, modelID, [undefined])
      return
    }
    dialog.replace(
      () => (
        <DialogSubagentEfforts
          model={model.name}
          efforts={model.variants}
          onConfirm={(selected) => void chooseAccount(providerID, modelID, selected)}
        />
      ),
      undefined,
      { back: () => reopen() },
    )
  }

  // Claude entries may prefer one pool account (`claudeAccount`); skipped with fewer than two accounts.
  async function chooseAccount(providerID: string, modelID: string, efforts: Array<string | undefined>) {
    const accounts =
      providerID === "claude-code"
        ? await sdk.claudeAccount.state().catch((error) => {
            toast.error(error)
            return undefined
          })
        : []
    if (!accounts) {
      reopen()
      return
    }
    if (accounts.length < 2) {
      void continueAdd(providerID, modelID, efforts)
      return
    }
    const back = modelInfo({ providerID, modelID }).variants.length
      ? () => chooseEfforts(providerID, modelID)
      : () => reopen()
    dialog.replace(
      () => (
        <DialogSelect
          title="Claude account"
          current=""
          options={[
            { title: "No preference", value: "" },
            ...accounts.map((account) => ({ title: account.label, value: account.id })),
          ]}
          onSelect={(option) =>
            void continueAdd(
              providerID,
              modelID,
              efforts,
              accounts.find((account) => account.id === option.value),
            )
          }
        />
      ),
      undefined,
      { back },
    )
  }

  async function continueAdd(
    providerID: string,
    modelID: string,
    selectedEfforts: Array<string | undefined>,
    account?: ClaudeAccountOption,
  ) {
    const displayName = modelInfo({ providerID, modelID }).name
    const accountName = account?.label.replace(/^\./, "").toLowerCase()
    const short = [shortModelName(modelID), accountName].filter(Boolean).join("-")
    const effort = selectedEfforts.length === 1 ? selectedEfforts[0] : undefined
    const defaultName = effort ? `general-${short}-${effort}` : `general-${short}`
    const label = [displayName, account && `prefers ${account.label}`].filter(Boolean).join(", ")

    const baseName = (await DialogPrompt.show(dialog, "Name", { value: defaultName }))?.trim()
    if (!baseName) {
      reopen()
      return
    }

    const added: string[] = []
    for (const effort of selectedEfforts) {
      const entryName = selectedEfforts.length === 1 ? baseName : effort ? `${baseName}-${effort}` : baseName
      try {
        await sdk.client.app.agent.sub.add(
          {
            name: entryName,
            model: `${providerID}/${modelID}`,
            variant: effort,
            description: effort ? `${label}, ${effort}.` : `${label}.`,
            claudeAccount: account?.id,
          },
          { throwOnError: true },
        )
        added.push(entryName)
        toast.show({ message: `Added ${entryName}`, variant: "success" })
      } catch (error) {
        toast.error(error)
      }
    }
    reopen(added[0])
  }

  async function remove(name: string) {
    if (toDelete() !== name) {
      setToDelete(name)
      return
    }
    setToDelete(undefined)
    try {
      await sdk.client.app.agent.sub.remove({ name }, { throwOnError: true })
      toast.show({ message: `Deleted ${name}`, variant: "success" })
    } catch (error) {
      toast.error(error)
    }
    void refetchAgents()
    void refetchEditable()
  }

  return (
    <DialogSelect
      ref={setRef}
      title="Subagents"
      placeholder="Search subagents…"
      options={allOptions()}
      renderFilter={!showError()}
      locked={showError()}
      nested
      preserveSelection
      onMove={(option) => {
        setToDelete(undefined)
        setSelectedValue(option.value)
      }}
      onSelect={(option) => {
        if (option.value === ADD) {
          startAdd()
          return
        }
        const agent = findAgent(option.value)
        if (agent?.native) {
          changeModel(agent)
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
          command: "subagent.add",
          title: "add",
          selection: "none",
          onTrigger: startAdd,
        },
        {
          command: "subagent.delete",
          title: "delete",
          hidden: (option) => !option || option.value === ADD || !editableNames()?.has(option.value),
          onTrigger: (option) => void remove(option.value),
        },
      ]}
      footerHints={
        selectedValue() === ADD
          ? []
          : [{ title: findAgent(selectedValue())?.native ? "change model" : "copy", label: "enter" }]
      }
    />
  )
}
