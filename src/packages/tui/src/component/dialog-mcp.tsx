import { createMemo, createSignal } from "solid-js"
import { useLocal } from "../context/local"
import { useSync } from "../context/sync"
import { map, pipe, entries, sortBy } from "remeda"
import { DialogSelect, type DialogSelectRef, type DialogSelectOption } from "../ui/dialog-select"
import { useTheme } from "../context/theme"
import { TextAttributes } from "@opentui/core"
import { useSDK } from "../context/sdk"

function Status(props: { enabled: boolean; loading: boolean; connecting: boolean }) {
  const { theme } = useTheme()
  if (props.connecting) {
    return <span style={{ fg: theme.warning }}>◌ Connecting</span>
  }
  if (props.loading) {
    return <span style={{ fg: theme.textMuted }}>⋯ Loading</span>
  }
  if (props.enabled) {
    return <span style={{ fg: theme.success, attributes: TextAttributes.BOLD }}>✓ Enabled</span>
  }
  return <span style={{ fg: theme.textMuted }}>○ Disabled</span>
}

export function DialogMcp() {
  const local = useLocal()
  const sync = useSync()
  const sdk = useSDK()
  const { theme } = useTheme()
  const [, setRef] = createSignal<DialogSelectRef<unknown>>()
  const [loading, setLoading] = createSignal<ReadonlySet<string>>(new Set())

  const options = createMemo(() => {
    // Track sync data and loading state to trigger re-render when they change
    const mcpData = sync.data.mcp
    const loadingMcp = loading()

    return pipe(
      mcpData ?? {},
      entries(),
      sortBy(([name]) => name),
      map(([name, status]) => ({
        value: name,
        title: name,
        description: status.status === "failed" ? "failed" : status.status,
        footer: (
          <Status
            enabled={local.mcp.isEnabled(name)}
            loading={loadingMcp.has(name)}
            connecting={status.status === "connecting"}
          />
        ),
        details: "error" in status ? [status.error] : undefined,
        detailsColor: theme.error,
        detailsWrap: true,
        category: undefined,
      })),
    )
  })

  // Each server runs independently; ignore repeats while its own action or handshake runs
  const run = async (name: string, label: string, action: () => Promise<unknown>) => {
    if (loading().has(name) || sync.data.mcp[name]?.status === "connecting") return

    setLoading((prev) => new Set(prev).add(name))
    try {
      await action()
      // Refresh MCP status from server
      const status = await sdk.client.mcp.status()
      if (status.data) {
        sync.set("mcp", status.data)
      } else {
        console.error("Failed to refresh MCP status: no data returned")
      }
    } catch (error) {
      console.error(`Failed to ${label} MCP:`, error)
    } finally {
      setLoading((prev) => {
        const next = new Set(prev)
        next.delete(name)
        return next
      })
    }
  }

  const actions = createMemo(() => [
    {
      command: "dialog.mcp.toggle",
      title: "toggle",
      onTrigger: (option: DialogSelectOption<string>) =>
        run(option.value, "toggle", () => local.mcp.toggle(option.value)),
    },
    {
      command: "dialog.mcp.reconnect",
      title: "reconnect",
      onTrigger: (option: DialogSelectOption<string>) =>
        run(option.value, "reconnect", () => sdk.client.mcp.reconnect({ name: option.value })),
    },
  ])

  return (
    <DialogSelect
      ref={setRef}
      title="MCP servers"
      options={options()}
      actions={actions()}
      onSelect={(_option) => {
        // Don't close on select, only on escape
      }}
    />
  )
}
