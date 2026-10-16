import { TextAttributes } from "@opentui/core"
import { usePaste } from "@opentui/solid"
import { createMemo, createSignal, For, onCleanup } from "solid-js"
import { useTuiConfig } from "../config"
import { selectedForeground, useTheme } from "../context/theme"
import { useBindings, useCommandShortcut } from "../keymap"
import { useDialog } from "../ui/dialog"
import { DialogSelect } from "../ui/dialog-select"
import { useToast } from "../ui/toast"
import {
  createScheduleClock,
  editScheduleClock,
  nextScheduleOccurrence,
  pasteScheduleClock,
  selectScheduleSection,
} from "./scheduleClock"

export type ScheduleTarget = "current" | "fork" | "new"
export type Schedule = { runAt: number; target: ScheduleTarget }

const TARGETS: { title: string; value: ScheduleTarget; description: string }[] = [
  { title: "This session", value: "current", description: "Send here when it is due" },
  { title: "Fork of this session", value: "fork", description: "Fork when it is due, then send" },
  { title: "New session", value: "new", description: "Start a new session when it is due" },
]

// Step one: where the prompt goes. Step two picks when.
export function DialogSchedule(props: { onSchedule: (schedule: Schedule) => void }) {
  const dialog = useDialog()
  const back = () => dialog.replace(() => <DialogSchedule onSchedule={props.onSchedule} />)
  return (
    <DialogSelect
      title="Schedule prompt: send to"
      options={TARGETS}
      onSelect={(option) =>
        dialog.replace(
          () => <DialogScheduleTime target={option.value} onSchedule={props.onSchedule} />,
          undefined,
          { back },
        )
      }
    />
  )
}

function DialogScheduleTime(props: {
  target: ScheduleTarget
  onSchedule: (schedule: Schedule) => void
}) {
  const dialog = useDialog()
  const toast = useToast()
  const { theme } = useTheme()
  const config = useTuiConfig()
  const submitShortcut = useCommandShortcut("dialog.prompt.submit")
  const [now, setNow] = createSignal(Date.now())
  const [clock, setClock] = createSignal(createScheduleClock(
    now(),
    new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12 ?? false,
  ))
  const timer = setInterval(() => setNow(Date.now()), 1000)
  onCleanup(() => clearInterval(timer))
  const next = createMemo(() => nextScheduleOccurrence(clock(), now()))
  const labels = clock().hour12 ? ["hr", "min", "sec", "AM/PM"] : ["hr", "min", "sec"]
  const format = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" })

  function schedule() {
    const runAt = nextScheduleOccurrence(clock(), Date.now())
    if (runAt === undefined) {
      toast.show({ message: "Enter a valid local clock time", variant: "warning" })
      return
    }
    dialog.clear()
    props.onSchedule({ runAt, target: props.target })
  }

  useBindings(() => ({
    mode: "modal",
    priority: 1,
    commands: [{ name: "dialog.prompt.submit", title: "Schedule prompt", category: "Dialog", run: schedule }],
    bindings: [
      ...config.keybinds.gather("dialog.prompt", ["dialog.prompt.submit"]),
      ...[
        "left", "right", "up", "down", "shift+up", "shift+down",
        "a", "p", "shift+a", "shift+p", "space", ..."0123456789",
      ].map((key) => ({
        key,
        desc: "Edit scheduled time",
        group: "Dialog",
        cmd: () => setClock((value) => editScheduleClock(
          value, key.replace("shift+", ""), key.startsWith("shift+"),
        )),
      })),
    ],
  }))
  usePaste((event) => {
    event.preventDefault()
    event.stopPropagation()
    const value = pasteScheduleClock(clock(), new TextDecoder().decode(event.bytes))
    if (value) return setClock(value)
    toast.show({ message: "Paste HH:MM:SS or HHMMSS, with optional AM/PM in 12-hour mode", variant: "warning" })
  })

  return (
    <box paddingLeft={2} paddingRight={2} paddingBottom={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>Schedule prompt: send at</text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.escape()}>esc</text>
      </box>
      <box flexDirection="row" gap={1}>
        <For each={labels}>
          {(label, index) => (
            <>
              {index() > 0 && index() < 3 ? <text fg={theme.textMuted}>:</text> : null}
              <box alignItems="center" onMouseUp={() => setClock((value) => selectScheduleSection(value, index()))}>
                <text
                  fg={clock().section === index() ? selectedForeground(theme) : theme.text}
                  bg={clock().section === index() ? theme.primary : theme.backgroundElement}
                  attributes={clock().section === index() ? TextAttributes.BOLD : undefined}
                >
                  {` ${index() === 3 ? clock().pm ? "PM" : "AM" : clock().fields[index()]} `}
                </text>
                <text fg={theme.textMuted}>{label}</text>
              </box>
            </>
          )}
        </For>
      </box>
      <text fg={next() === undefined ? theme.warning : theme.text}>
        {next() === undefined ? "Enter a valid local clock time" : `Next: ${format.format(next())}`}
      </text>
      <box>
        <text fg={theme.textMuted}>←/→ section · ↑/↓ adjust · Shift: ±1</text>
        <text fg={theme.textMuted}>hr ±1 · min/sec ±10 · type HHMMSS{clock().hour12 ? " · A/P" : ""}</text>
        <text fg={theme.textMuted}>{submitShortcut() || "enter"} schedule · esc back · paste HH:MM:SS</text>
      </box>
    </box>
  )
}
