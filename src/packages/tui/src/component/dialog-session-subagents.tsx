import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { createMemo, createResource, createSignal } from "solid-js"
import { useSDK } from "../context/sdk"
import { useSync } from "../context/sync"
import { useToast } from "../ui/toast"
import { errorMessage } from "../util/error"

// Value of the "All subagents" row; the server reads "*" as a deny for every subagent
const ALL = "*"

// Switches subagents off for one session only. Names go to the session's `metadata.disabledSubagents`,
// which the server turns into `task` denies each turn (opencode `disabledSubagentRules`).
export function DialogSessionSubagents(props: { sessionID: string }) {
  const sdk = useSDK()
  const sync = useSync()
  const toast = useToast()

  // Local copy so a toggle shows at once instead of after the session.updated event
  const [disabled, setDisabled] = createSignal(new Set(sessionDisabled(sync.session.get(props.sessionID)?.metadata)))

  // Fetched on open because sync.data.agent misses agents added after bootstrap
  const [agents] = createResource(() =>
    sdk.client.app
      .agents({}, { throwOnError: true })
      .then((result) => (result.data ?? []).filter((agent) => agent.mode !== "primary" && !agent.hidden))
      .catch((error) => {
        toast.error(error)
        return []
      }),
  )

  async function toggle(name: string) {
    // Drops names of agents deleted since they were switched off, so the sidebar count stays true
    // (skipped when the list failed to load, which would otherwise wipe every saved name).
    const names = agents()?.map((agent) => agent.name) ?? []
    const next = new Set([...disabled()].filter((item) => !names.length || item === ALL || names.includes(item)))
    if (disabled().has(name)) next.delete(name)
    else next.add(name)
    const previous = disabled()
    setDisabled(next)
    // Metadata is replaced whole, so carry the session's other keys over
    const { disabledSubagents: _, ...rest } = sync.session.get(props.sessionID)?.metadata ?? {}
    const result = await sdk.client.session.update({
      sessionID: props.sessionID,
      metadata: next.size > 0 ? { ...rest, disabledSubagents: [...next] } : rest,
    })
    if (!result.error) return
    setDisabled(previous)
    toast.show({ message: errorMessage(result.error), variant: "error" })
  }

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    const allOff = disabled().has(ALL)
    return [
      { title: `[${allOff ? " " : "✓"}] All subagents`, value: ALL, onSelect: () => void toggle(ALL) },
      ...(agents() ?? [])
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .map((agent) => ({
          title: `[${disabled().has(agent.name) ? " " : "✓"}] ${agent.name}`,
          value: agent.name,
          footer: allOff ? "all off" : undefined,
          onSelect: () => void toggle(agent.name),
        })),
    ]
  })

  return (
    <DialogSelect title="Session subagents" placeholder="Search subagents…" options={options()} preserveSelection />
  )
}

export function sessionDisabled(metadata: Record<string, unknown> | undefined) {
  const names = metadata?.disabledSubagents
  return Array.isArray(names) ? names.filter((name): name is string => typeof name === "string") : []
}
