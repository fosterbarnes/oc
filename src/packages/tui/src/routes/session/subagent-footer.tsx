import { createMemo, createSignal, onCleanup, Show } from "solid-js"
import { useRouteData } from "../../context/route"
import { useSDK } from "../../context/sdk"
import { useSync } from "../../context/sync"
import { useTuiConfig } from "../../config"
import { useDialog } from "../../ui/dialog"
import { useToast } from "../../ui/toast"
import { useTheme } from "../../context/theme"
import { SplitBorder } from "../../ui/border"
import { contextUsage } from "../../util/contextUsage"
import { Locale } from "../../util/locale"
import { sessionCost, subagentLabel } from "../../util/session"
import { useTerminalDimensions } from "@opentui/solid"
import { OPENCODE_BASE_MODE, useBindings, useCommandShortcut, useOpencodeKeymap } from "../../keymap"

export function SubagentFooter() {
  const route = useRouteData("session")
  const sync = useSync()
  const messages = createMemo(() => sync.data.message[route.sessionID] ?? [])
  const session = createMemo(() => sync.session.get(route.sessionID))

  const subagentInfo = createMemo(() => {
    const s = session()
    if (!s) return { label: "Subagent", index: 0, total: 0 }
    const label = subagentLabel(s.title)

    if (!s.parentID) return { label, index: 0, total: 0 }

    const siblings = sync.data.session
      .filter((x) => x.parentID === s.parentID)
      .toSorted((a, b) => a.time.created - b.time.created)
    const index = siblings.findIndex((x) => x.id === s.id)

    return { label, index: index + 1, total: siblings.length }
  })

  const usage = createMemo(() => {
    const context = contextUsage(messages(), sync.data.provider, session()?.revert?.messageID)
    if (!context) return
    const cost = sessionCost(session(), (id) => sync.data.session.filter((item) => item.parentID === id))

    const money = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    })

    return {
      context:
        context.percent === undefined
          ? Locale.number(context.tokens)
          : `${Locale.number(context.tokens)} (${context.percent}%)`,
      cost: cost > 0 ? money.format(cost) : undefined,
    }
  })

  const { theme } = useTheme()
  const keymap = useOpencodeKeymap()
  const parentShortcut = useCommandShortcut("session.parent")
  const previousShortcut = useCommandShortcut("session.child.previous")
  const nextShortcut = useCommandShortcut("session.child.next")
  const stopShortcut = useCommandShortcut("session.child.stop")
  const [hover, setHover] = createSignal<"stop" | "parent" | "prev" | "next" | null>(null)
  useTerminalDimensions()

  // A child view has no prompt, so its interrupt key stops this subagent instead: a second press
  // within 5 s, like the prompt's interrupt. The parent and sibling subagents keep running.
  const sdk = useSDK()
  const toast = useToast()
  const dialog = useDialog()
  const tuiConfig = useTuiConfig()
  const busy = createMemo(() => (sync.data.session_status?.[route.sessionID]?.type ?? "idle") !== "idle")
  // Keyed by session: Prev/Next keep this footer mounted, and a press on one child must not arm the next.
  const [armedFor, setArmedFor] = createSignal<string>()
  const armed = () => armedFor() === route.sessionID
  let disarm: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(disarm))
  function abort() {
    clearTimeout(disarm)
    setArmedFor(undefined)
    void sdk.client.session.abort({ sessionID: route.sessionID }).then((result) => {
      if (result.error) toast.show({ message: "Could not stop this subagent", variant: "error" })
    })
  }
  function stop() {
    if (dialog.stack.length > 0) return
    if (armed()) return abort()
    clearTimeout(disarm)
    setArmedFor(route.sessionID)
    disarm = setTimeout(() => setArmedFor(undefined), 5_000)
  }
  useBindings(() => ({
    commands: [
      {
        title: "Stop subagent",
        name: "session.child.stop",
        category: "Session",
        hidden: true,
        enabled: busy(),
        run: stop,
      },
    ],
  }))
  useBindings(() => ({
    mode: OPENCODE_BASE_MODE,
    bindings: tuiConfig.keybinds.gather("session.child", ["session.child.stop"]),
  }))

  return (
    <box flexShrink={0}>
      <box
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={1}
        {...SplitBorder}
        border={["left"]}
        borderColor={theme.border}
        flexShrink={0}
        backgroundColor={theme.backgroundPanel}
      >
        <box flexDirection="row" justifyContent="space-between" gap={1}>
          <box flexDirection="row" gap={1}>
            <text fg={theme.text}>
              <b>{subagentInfo().label}</b>
            </text>
            <Show when={subagentInfo().total > 0}>
              <text style={{ fg: theme.textMuted }}>{`(${subagentInfo().index} of ${subagentInfo().total})`}</text>
            </Show>
            <Show when={usage()}>
              {(item) => (
                <text fg={theme.textMuted} wrapMode="none">
                  {[item().context, item().cost].filter(Boolean).join(" · ")}
                </text>
              )}
            </Show>
          </box>
          <box flexDirection="row" gap={2}>
            <Show when={busy()}>
              <box
                onMouseOver={() => setHover("stop")}
                onMouseOut={() => setHover(null)}
                onMouseUp={abort}
                backgroundColor={hover() === "stop" ? theme.backgroundElement : theme.backgroundPanel}
              >
                <Show
                  when={armed()}
                  fallback={
                    <text fg={theme.text}>
                      Stop <span style={{ fg: theme.textMuted }}>{stopShortcut()}</span>
                    </text>
                  }
                >
                  <text fg={theme.warning}>Press {stopShortcut()} again to stop</text>
                </Show>
              </box>
            </Show>
            <box
              onMouseOver={() => setHover("parent")}
              onMouseOut={() => setHover(null)}
              onMouseUp={() => keymap.dispatchCommand("session.parent")}
              backgroundColor={hover() === "parent" ? theme.backgroundElement : theme.backgroundPanel}
            >
              <text fg={theme.text}>
                Parent <span style={{ fg: theme.textMuted }}>{parentShortcut()}</span>
              </text>
            </box>
            <box
              onMouseOver={() => setHover("prev")}
              onMouseOut={() => setHover(null)}
              onMouseUp={() => keymap.dispatchCommand("session.child.previous")}
              backgroundColor={hover() === "prev" ? theme.backgroundElement : theme.backgroundPanel}
            >
              <text fg={theme.text}>
                Prev <span style={{ fg: theme.textMuted }}>{previousShortcut()}</span>
              </text>
            </box>
            <box
              onMouseOver={() => setHover("next")}
              onMouseOut={() => setHover(null)}
              onMouseUp={() => keymap.dispatchCommand("session.child.next")}
              backgroundColor={hover() === "next" ? theme.backgroundElement : theme.backgroundPanel}
            >
              <text fg={theme.text}>
                Next <span style={{ fg: theme.textMuted }}>{nextShortcut()}</span>
              </text>
            </box>
          </box>
        </box>
      </box>
    </box>
  )
}
