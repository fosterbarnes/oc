import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import { sectionOpen } from "./open"
import { SidebarToggle } from "./toggle"
import type { BuiltinTuiPlugin } from "../builtins"
import { createMemo, createResource, For, Show } from "solid-js"
import path from "path"

const id = "internal:sidebar-plugins"

type Row = {
  name: string
  version?: string
  server: boolean
  tui: boolean
  status: "loaded" | "failed" | "no_entry" | "disabled"
  error?: string
}

function View(props: { api: TuiPluginApi }) {
  // Unset until clicked, so the section follows the failure state until the user chooses.
  const [open, setOpen] = sectionOpen(props.api, "plugins", undefined)
  const theme = () => props.api.theme.current
  const [server] = createResource(() => props.api.client.plugin.status().then((x) => x.data ?? []))
  const builtin = createMemo(() => (server() ?? []).filter((item) => item.source === "internal"))
  const rows = createMemo(() => {
    const tui = props.api.plugins.list().filter((item) => item.source !== "internal")
    const external = (server() ?? []).filter((item) => item.source !== "internal")
    const merged = external.map((item): Row => {
      const half = tui.find((x) => x.target === item.target)
      return {
        name: item.name,
        version: item.version ?? (item.source === "file" ? "local" : undefined),
        server: item.status === "loaded",
        tui: half?.active ?? false,
        status: item.status === "no_entry" && half?.active ? "loaded" : item.status,
        error: item.error,
      }
    })
    const tuiOnly = tui
      .filter((item) => !external.some((x) => x.target === item.target))
      .map(
        (item): Row => ({
          name: path.parse(item.spec).name,
          version: item.source === "file" ? "local" : undefined,
          server: false,
          tui: item.active,
          status: item.active ? "loaded" : "disabled",
        }),
      )
    return [...merged, ...tuiOnly]
  })
  const failed = createMemo(() => [...rows(), ...builtin()].filter((item) => item.status === "failed").length)
  const expanded = () => open() ?? failed() > 0

  const dot = (status: Row["status"]) => {
    if (status === "loaded") return theme().success
    if (status === "failed") return theme().error
    return theme().textMuted
  }

  return (
    <Show when={rows().length + builtin().length > 0}>
      <box>
        <box flexDirection="row" gap={1} onMouseDown={() => setOpen(!expanded())}>
          <SidebarToggle open={expanded()} fg={theme().text} />
          <text fg={theme().text} selectable={false}>
            <b>Plugins</b>
            <Show when={!expanded()}>
              <span style={{ fg: theme().textMuted }}>
                {" "}
                ({rows().length}
                {failed() > 0 ? `, ${failed()} failed` : ""})
              </span>
            </Show>
          </text>
        </box>
        <Show when={expanded()}>
          <For each={rows()}>
            {(item) => (
              <box flexDirection="row" gap={1}>
                <text flexShrink={0} style={{ fg: dot(item.status) }}>
                  •
                </text>
                <text fg={theme().text} wrapMode="word">
                  {item.name}{" "}
                  <span style={{ fg: theme().textMuted }}>
                    {[item.version, item.server && "server", item.tui && "tui"].filter(Boolean).join(" ")}
                    {item.status === "no_entry" ? " no server entry" : ""}
                    {item.status === "disabled" ? " disabled" : ""}
                  </span>
                  <Show when={item.error}>
                    <span style={{ fg: theme().error }}>
                      {" "}
                      <i>{item.error}</i>
                    </span>
                  </Show>
                </text>
              </box>
            )}
          </For>
          <Show when={builtin().length > 0}>
            <text fg={theme().textMuted} wrapMode="word">
              Built-in:{" "}
              <For each={builtin()}>
                {(item, index) => (
                  <span style={{ fg: item.status === "failed" ? theme().error : theme().textMuted }}>
                    {index() > 0 ? ", " : ""}
                    {item.name}
                  </span>
                )}
              </For>
            </text>
          </Show>
        </Show>
      </box>
    </Show>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 250,
    slots: {
      sidebar_content() {
        return <View api={api} />
      },
    },
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
