import type { TuiPlugin, TuiPluginApi, TuiState } from "@opencode-ai/plugin/tui"
import { sectionOpen } from "./open"
import { SidebarToggle } from "./toggle"
import type { BuiltinTuiPlugin } from "../builtins"
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { Locale } from "../../util/locale"

const isIdle = (label: string) => label === "done" || label === "failed" || label === "stopped"

export function visibleSubagents(
  state: { session: Pick<TuiState["session"], "get" | "messages" | "children" | "status" | "permission" | "question"> },
  sessionID: string,
  now: number,
) {
  const root = state.session.get(sessionID)?.parentID ?? sessionID
  const turn = state.session
    .messages(root)
    .reduce((latest, message) => (message.role === "user" ? Math.max(latest, message.time.created) : latest), 0)
  return state.session
    .children(root)
    .flatMap((child) => {
      const status = state.session.status(child.id)?.type
      const messages = state.session.messages(child.id)
      const latest = messages.findLast((message) => message.role === "assistant")
      const label =
        state.session.permission(child.id).length || state.session.question(child.id).length
          ? "waiting"
          : status === "retry"
            ? "retrying"
            : status === "busy"
              ? "working"
              : child.sessionFailed
                ? "failed"
                : latest?.error?.name === "MessageAbortedError"
                  ? "stopped"
                  : latest?.error
                    ? "failed"
                    : "done"
      const finished = latest?.time.completed ?? child.time.updated
      if (isIdle(label) && (now - finished >= 120_000 || turn > finished)) return []
      return [{ child, label }]
    })
    .toSorted((a, b) => a.child.time.created - b.child.time.created)
}

const _FILTERS = ["all", "running", "idle"] as const
export type SubagentFilter = (typeof _FILTERS)[number]
const _FILTER_KEY = "sidebar_subagents_filter"

/** running = working, retrying, or waiting on the user; idle = done, failed, or stopped. */
export function filterSubagents<T extends { label: string }>(list: T[], filter: SubagentFilter) {
  if (filter === "all") return list
  return list.filter((item) => isIdle(item.label) === (filter === "idle"))
}

function View(props: { api: TuiPluginApi; session_id: string }) {
  const [open, setOpen] = sectionOpen(props.api, "subagents", true)
  const [now, setNow] = createSignal(Date.now())
  const timer = setInterval(() => setNow(Date.now()), 5_000)
  onCleanup(() => clearInterval(timer))
  const theme = () => props.api.theme.current
  const all = createMemo(() => visibleSubagents(props.api.state, props.session_id, now()))
  const filter = (): SubagentFilter => {
    const value = props.api.kv.get<string>(_FILTER_KEY, "all")
    return _FILTERS.find((item) => item === value) ?? "all"
  }
  const list = createMemo(() => filterSubagents(all(), filter()))
  const cycleFilter = () => props.api.kv.set(_FILTER_KEY, _FILTERS[(_FILTERS.indexOf(filter()) + 1) % _FILTERS.length])

  return (
    <Show when={all().length > 0}>
      <box>
        <box flexDirection="row" gap={1} onMouseDown={() => list().length > 2 && setOpen((value) => !value)}>
          <Show when={list().length > 2}>
            <SidebarToggle open={open()} fg={theme().text} />
          </Show>
          <text fg={theme().text} selectable={false}>
            <b>Sub-agents</b>
          </text>
          <text
            fg={theme().textMuted}
            selectable={false}
            onMouseDown={(evt) => {
              evt.stopPropagation()
              cycleFilter()
            }}
          >
            [{filter()}]
          </text>
        </box>
        <Show when={list().length === 0}>
          <text fg={theme().textMuted}>No {filter()} sub-agents</text>
        </Show>
        <Show when={list().length <= 2 || open()}>
          <For each={list()}>
            {(item) => (
              <box onMouseUp={() => props.api.route.navigate("session", { sessionID: item.child.id })}>
                <text
                  fg={
                    item.label === "failed"
                      ? theme().error
                      : item.label === "stopped"
                        ? theme().textMuted
                        : item.label === "done"
                          ? theme().success
                          : item.label === "working"
                            ? theme().warning
                            : theme().accent
                  }
                >
                  {props.api.state.session.agentLabel(item.child.agent ?? "subagent")} . {item.label}
                </text>
                <text fg={theme().textMuted}>{Locale.truncate(item.child.title, 36)}</text>
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
    order: 350,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: BuiltinTuiPlugin = { id: "internal:sidebar-subagents", tui }
export default plugin
