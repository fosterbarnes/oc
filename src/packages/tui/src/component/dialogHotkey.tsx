import { CliRenderEvents, TextAttributes, type KeyEvent, type TerminalCapabilities } from "@opentui/core"
import { stringifyKeyStroke, type KeySequencePart, type KeyStrokeInput } from "@opentui/keymap"
import { useRenderer } from "@opentui/solid"
import { createMemo, createSignal, onCleanup, Show } from "solid-js"
import { useTuiConfig } from "../config"
import { TuiKeybind } from "../config/keybind"
import { useTheme } from "../context/theme"
import { validateHotkey } from "../hotkeyValidate"
import { LEADER_TOKEN, useOpencodeKeymap, useOpencodeModeStack } from "../keymap"
import { persistTuiSetting } from "../ocSettings"
import { useDialog } from "../ui/dialog"

const HOTKEY_CAPTURE_MODE = "hotkey-capture"
const LEADER_PREFIX = "<leader>"

function strokeKey(input: KeyStrokeInput): string {
  const parts = stringifyKeyStroke(input).split("+")
  const name = parts.pop() ?? ""
  const mods = new Set(parts)
  const ordered = [
    ...new Set(
      ["ctrl", "alt", "option", "meta", "shift", "super", "hyper"]
        .filter((mod) => mods.has(mod))
        .map((mod) => (mod === "meta" || mod === "option" ? "alt" : mod)),
    ),
  ]
  return [...ordered, name].join("+")
}

function sequenceKey(sequence: unknown): string {
  if (!Array.isArray(sequence)) return ""
  const parts = sequence.map((part: KeySequencePart) =>
    part.tokenName === LEADER_TOKEN ? LEADER_PREFIX : strokeKey(part.stroke),
  )
  if (parts[0] === LEADER_PREFIX) return LEADER_PREFIX + parts.slice(1).join(" ")
  return parts.join(" ")
}

export function DialogHotkey(props: { command: string; title: string }) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const config = useTuiConfig()
  const keymap = useOpencodeKeymap()
  const modeStack = useOpencodeModeStack()
  const renderer = useRenderer()
  const [kittyKeyboard, setKittyKeyboard] = createSignal(renderer.capabilities?.kitty_keyboard === true)
  const handleCapabilities = (capabilities: TerminalCapabilities) => {
    setKittyKeyboard(capabilities.kitty_keyboard === true)
  }
  renderer.on(CliRenderEvents.CAPABILITIES, handleCapabilities)
  const [captured, setCaptured] = createSignal<string | undefined>(undefined)
  const [leaderPending, setLeaderPending] = createSignal(false)

  const leaderBinding = config.keybinds.get(LEADER_TOKEN)[0]?.key
  const leaderKey = !leaderBinding
    ? ""
    : typeof leaderBinding === "string"
      ? leaderBinding.trim().toLowerCase()
      : strokeKey(leaderBinding)

  const entries = keymap.getCommandEntries({ visibility: "registered" })
  const titles = new Map(
    entries.map((entry) => [
      entry.command.name,
      typeof entry.command.title === "string" ? entry.command.title : entry.command.name,
    ]),
  )
  const owned = new Map<string, string>()
  const remember = (key: string, owner: string) => {
    const normalized = key.trim().toLowerCase()
    if (key && !owned.has(normalized)) owned.set(normalized, owner)
  }
  for (const [name, bindings] of keymap.getCommandBindings({
    visibility: "registered",
    commands: entries.map((entry) => entry.command.name),
  })) {
    if (name === props.command) continue
    for (const binding of bindings) {
      remember(sequenceKey(binding.sequence), titles.get(name) ?? name)
    }
  }
  for (const command of Object.values(TuiKeybind.CommandMap)) {
    if (command === props.command) continue
    for (const binding of config.keybinds.get(command)) {
      remember(sequenceKey(binding.sequence), titles.get(command) ?? command)
    }
  }
  const ownerOf = (key: string) => owned.get(key.trim().toLowerCase())

  const result = createMemo(() => {
    const key = captured()
    if (!key) return undefined
    return validateHotkey({ key, leaderKey, ownerOf, kittyKeyboard: kittyKeyboard() })
  })
  const reason = createMemo(() => {
    const current = result()
    return current && !current.ok ? current.reason : undefined
  })

  function capture(evt: KeyEvent) {
    const name = evt.name.toLowerCase()
    const modified = evt.ctrl || evt.meta || evt.option || evt.shift || evt.super || evt.hyper
    if (!modified && name === "escape") {
      dialog.escape()
      return
    }
    if (!modified && name === "backspace") {
      config.setPaletteKey(props.command, undefined)
      void persistTuiSetting(["palette_keys"], config.palette_keys)
      dialog.clear()
      return
    }
    if (!modified && (name === "return" || name === "enter")) {
      const key = captured()
      if (key && validateHotkey({ key, leaderKey, ownerOf, kittyKeyboard: kittyKeyboard() }).ok) {
        config.setPaletteKey(props.command, key)
        void persistTuiSetting(["palette_keys"], config.palette_keys)
        dialog.clear()
      } else {
        setLeaderPending(false)
      }
      return
    }
    const stroke = strokeKey({
      name: evt.name,
      ctrl: evt.ctrl,
      shift: evt.shift,
      meta: evt.meta || evt.option,
      super: evt.super,
      hyper: evt.hyper,
    })
    if (!leaderPending() && leaderKey && stroke === leaderKey) {
      setLeaderPending(true)
      return
    }
    if (leaderPending()) {
      setLeaderPending(false)
      if (stroke === leaderKey) return
      setCaptured(`${LEADER_PREFIX}${stroke}`)
      return
    }
    setCaptured(stroke)
  }

  const popMode = modeStack.push(HOTKEY_CAPTURE_MODE)
  const disposeIntercept = keymap.intercept(
    "key",
    (ctx) => {
      ctx.consume({ preventDefault: true, stopPropagation: true })
      capture(ctx.event)
    },
    { priority: 2 },
  )
  onCleanup(() => {
    renderer.off(CliRenderEvents.CAPABILITIES, handleCapabilities)
    disposeIntercept()
    popMode()
  })

  const current = () => config.palette_keys[props.command]

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          Set hotkey: {props.title}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.escape()}>
          esc
        </text>
      </box>
      <box flexDirection="column">
        <text fg={theme.textMuted}>current: {current() ?? "none"}</text>
        <Show when={leaderPending()}>
          <text fg={theme.text}>{LEADER_PREFIX}...</text>
        </Show>
        <Show when={captured()}>
          <text fg={theme.text}>{captured()}</text>
        </Show>
        <Show when={reason()}>
          <text fg={theme.error}>{reason()}</text>
        </Show>
      </box>
      <box flexDirection="row" gap={2} paddingBottom={1}>
        <text fg={theme.textMuted}>enter confirm</text>
        <text fg={theme.textMuted}>backspace clear</text>
      </box>
    </box>
  )
}
