import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import { sectionOpen } from "./open"
import { SidebarToggle } from "./toggle"
import type { BuiltinTuiPlugin } from "../builtins"
import { createMemo, For, Match, Show, Switch } from "solid-js"

const id = "internal:sidebar-mcp"

function View(props: { api: TuiPluginApi }) {
  const [open, setOpen] = sectionOpen(props.api, "mcp", true)
  const theme = () => props.api.theme.current
  const list = createMemo(() => props.api.state.mcp())
  const on = createMemo(() => list().filter((item) => item.status === "connected").length)
  const bad = createMemo(
    () =>
      list().filter(
        (item) =>
          item.status === "failed" || item.status === "needs_auth" || item.status === "needs_client_registration",
      ).length,
  )

  const dot = (status: string) => {
    if (status === "connected") return theme().success
    if (status === "failed") return theme().error
    if (status === "disabled") return theme().textMuted
    if (status === "needs_auth") return theme().warning
    if (status === "needs_client_registration") return theme().error
    if (status === "connecting") return theme().warning
    return theme().textMuted
  }

  return (
    <Show when={list().length > 0}>
      <box>
        <box flexDirection="row" gap={1} onMouseDown={() => list().length > 2 && setOpen((x) => !x)}>
          <Show when={list().length > 2}>
            <SidebarToggle open={open()} fg={theme().text} />
          </Show>
          <text fg={theme().text} selectable={false}>
            <b>MCP</b>
            <Show when={!open()}>
              <span style={{ fg: theme().textMuted }}>
                {" "}
                ({on()} active{bad() > 0 ? `, ${bad()} error${bad() > 1 ? "s" : ""}` : ""})
              </span>
            </Show>
          </text>
        </box>
        <Show when={list().length <= 2 || open()}>
          <For each={list()}>
            {(item) => (
              <box flexDirection="row" gap={1} minWidth={0}>
                <text
                  flexShrink={0}
                  style={{
                    fg: dot(item.status),
                  }}
                >
                  •
                </text>
                <text fg={theme().text} wrapMode="none" truncate flexGrow={1} flexShrink={1} minWidth={0}>
                  {item.name}
                </text>
                <text fg={item.status === "failed" ? theme().error : theme().textMuted} wrapMode="none" flexShrink={0}>
                  <Switch fallback={item.status}>
                    <Match when={item.status === "connected"}>Connected</Match>
                    <Match when={item.status === "failed"}>Error</Match>
                    <Match when={item.status === "disabled"}>Disabled</Match>
                    <Match when={item.status === "needs_auth"}>Needs auth</Match>
                    <Match when={item.status === "needs_client_registration"}>Needs client ID</Match>
                    <Match when={item.status === "connecting"}>Connecting</Match>
                  </Switch>
                </text>
              </box>
            )}
          </For>
        </Show>
      </box>
    </Show>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 200,
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
