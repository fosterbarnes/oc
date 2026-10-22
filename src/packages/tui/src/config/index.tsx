export * as TuiConfig from "."

import { createBindingLookup } from "@opentui/keymap/extras"
import { Schema } from "effect"
import { createContext, createSignal, type JSX, useContext } from "solid-js"
import { TuiKeybind } from "./keybind"
import { TuiKeybindPreset } from "./keybindPreset"
import { validateHotkey } from "../hotkeyValidate"

export const AttentionSoundName = Schema.Literals([
  "default",
  "question",
  "permission",
  "error",
  "done",
  "subagent_done",
])
export type AttentionSoundName = Schema.Schema.Type<typeof AttentionSoundName>

export const PluginOptions = Schema.Record(Schema.String, Schema.Unknown)
export const PluginSpec = Schema.Union([Schema.String, Schema.mutable(Schema.Tuple([Schema.String, PluginOptions]))])

export const LeaderTimeoutDefault = 2000
export const LeaderTimeout = Schema.Int.check(Schema.isGreaterThan(0)).annotate({
  description: "Leader key timeout in milliseconds",
})

export const ScrollSpeed = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0.001))
export const ScrollAcceleration = Schema.Struct({
  enabled: Schema.Boolean.annotate({ description: "Enable scroll acceleration" }),
}).annotate({ description: "Scroll acceleration settings" })
export const DiffStyle = Schema.Literals(["auto", "stacked"]).annotate({
  description: "Control diff rendering style: 'auto' adapts to terminal width, 'stacked' always shows single column",
})
export const Cursor = Schema.Struct({
  style: Schema.optional(Schema.Literals(["block", "underline", "line", "default"])).annotate({
    description: "Cursor shape. Use 'default' to preserve the terminal setting",
  }),
  blinking: Schema.optional(Schema.Boolean).annotate({
    description: "Whether the cursor blinks. Has no effect when style is 'default'",
  }),
}).annotate({ description: "Terminal cursor settings" })

export const AttentionSounds = Schema.Record(AttentionSoundName, Schema.optionalKey(Schema.String))
export type AttentionSoundPaths = Schema.Schema.Type<typeof AttentionSounds>
export const Attention = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  notifications: Schema.optional(Schema.Boolean),
  sound: Schema.optional(Schema.Boolean),
  volume: Schema.optional(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(1))),
  sound_pack: Schema.optional(Schema.String),
  sounds: Schema.optional(AttentionSounds),
}).annotate({ description: "Attention notification and sound settings" })

const PromptSize = Schema.Int.check(Schema.isGreaterThan(0))
export const Prompt = Schema.Struct({
  max_height: Schema.optional(PromptSize).annotate({ description: "Prompt textarea max height" }),
  max_width: Schema.optional(Schema.Union([PromptSize, Schema.Literal("auto")])).annotate({
    description: "Home prompt max width: a positive integer for a fixed cap, or 'auto' to scale with terminal width",
  }),
}).annotate({ description: "Prompt size settings" })

export const SubagentTabs = Schema.Struct({
  click: Schema.optional(Schema.Literals(["inline", "tab"])).annotate({
    description: "Clicking a subagent: 'inline' (default) opens it in this view, 'tab' in a new terminal tab",
  }),
  auto_open: Schema.optional(Schema.Boolean).annotate({
    description: "Open each new subagent of the viewed session in its own terminal tab (default: false)",
  }),
  return_to_parent: Schema.optional(Schema.Boolean).annotate({
    description: "Leave a viewed subagent for its parent when it finishes (default: true)",
  }),
}).annotate({
  description: "Open subagents in WezTerm or Windows Terminal tabs; needs the resident oc server",
})

export const Info = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  openEditedWith: Schema.optional(Schema.Union([Schema.String, Schema.Record(Schema.String, Schema.String)])).annotate({
    description:
      'Editor used when opening file paths from the TUI, or a map of extension to editor with an optional default, e.g. { "default": "code", ".md": "typora" }',
  }),
  theme: Schema.optional(Schema.String),
  sidebar_button_style: Schema.optional(Schema.Literals(["minimal", "outlined"])).annotate({
    description: "Sidebar button style: minimal (default) or outlined",
  }),
  sidebar_buttons: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Sidebar buttons: palette command names in display order; omit for the defaults",
  }),
  keybind_preset: Schema.optional(Schema.Literals(TuiKeybindPreset.Names)).annotate({
    description: "Keybind layout: 'oc' (default) or 'opencode' (stock OpenCode keys)",
  }),
  keybinds: Schema.optional(TuiKeybind.KeybindOverrides),
  plugin: Schema.optional(Schema.Array(PluginSpec)),
  plugin_enabled: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
  leader_timeout: Schema.optional(LeaderTimeout),
  attention: Schema.optional(Attention),
  prompt: Schema.optional(Prompt),
  subagent_tabs: Schema.optional(SubagentTabs),
  palette_keys: Schema.optional(Schema.Record(Schema.String, Schema.String)).annotate({
    description: "Hotkeys for palette commands, keyed by command name",
  }),
  scroll_speed: Schema.optional(ScrollSpeed).annotate({ description: "TUI scroll speed" }),
  scroll_acceleration: Schema.optional(ScrollAcceleration),
  diff_style: Schema.optional(DiffStyle),
  cursor: Schema.optional(Cursor),
  mouse: Schema.optional(Schema.Boolean).annotate({ description: "Enable or disable mouse capture (default: true)" }),
  smooth_streaming: Schema.optional(Schema.Boolean).annotate({
    description: "Beta: reveal streamed replies and reasoning at a steady pace instead of in bursts (default: false)",
  }),
  daily_theme: Schema.optional(Schema.Boolean).annotate({
    description:
      "Beta: use a new built-in theme each local day, the same for every oc user; overrides theme while on (default: false)",
  }),
  auto_confirm_updates: Schema.optional(Schema.Boolean).annotate({
    description:
      "Third party updates install without the confirm dialog; this can close Claude Desktop, Cursor, and ChatGPT (default: false)",
  }),
})
export type Info = Schema.Schema.Type<typeof Info>

export const SIDEBAR_BUTTONS_DEFAULT: readonly string[] = [
  "session.list",
  "command.palette.show",
  "oc.settings_palette",
  "oc.session_subagents",
]

export type KeybindPreset = (typeof TuiKeybindPreset.Names)[number]
export type SidebarButtonStyle = NonNullable<Info["sidebar_button_style"]>
export type SubagentTabsSettings = { click: "inline" | "tab"; auto_open: boolean; return_to_parent: boolean }

export type Resolved = Omit<
  Info,
  | "attention"
  | "keybind_preset"
  | "sidebar_button_style"
  | "sidebar_buttons"
  | "subagent_tabs"
  | "palette_keys"
  | "keybinds"
  | "leader_timeout"
  | "mouse"
  | "cursor"
  | "smooth_streaming"
  | "daily_theme"
  | "auto_confirm_updates"
> & {
  keybind_preset: KeybindPreset
  sidebar_button_style: SidebarButtonStyle
  sidebar_buttons: readonly string[]
  subagent_tabs: SubagentTabsSettings
  palette_keys: Record<string, string>
  smooth_streaming: boolean
  daily_theme: boolean
  auto_confirm_updates: boolean
  setKeybindPreset: (preset: KeybindPreset) => void
  setSidebarButtonStyle: (style: SidebarButtonStyle) => void
  // undefined restores SIDEBAR_BUTTONS_DEFAULT.
  setSidebarButtons: (names: readonly string[] | undefined) => void
  setSmoothStreaming: (on: boolean) => void
  setDailyTheme: (on: boolean) => void
  setAutoConfirmUpdates: (on: boolean) => void
  setSubagentTabs: (settings: SubagentTabsSettings) => void
  setPaletteKey: (command: string, key: string | undefined) => void
  attention: {
    enabled: boolean
    notifications: boolean
    sound: boolean
    volume: number
    sound_pack: string
    sounds: AttentionSoundPaths
  }
  keybinds: TuiKeybind.BindingLookupView
  leader_timeout: number
  mouse: boolean
  cursor?: {
    style: "block" | "underline" | "line" | "default"
    blinking: boolean
  }
}

export const ResolveOptions = Schema.Struct({
  terminalSuspend: Schema.Boolean,
})
export type ResolveOptions = Schema.Schema.Type<typeof ResolveOptions>

export function resolve(input: Info, options: ResolveOptions): Resolved {
  // Both layouts are built up front so switching is a signal flip; useBindings effects re-register.
  const lookups = {
    oc: resolveKeybinds(input, options, "oc"),
    opencode: resolveKeybinds(input, options, "opencode"),
  }
  const [preset, setPreset] = createSignal<KeybindPreset>(input.keybind_preset ?? "oc")
  const [sidebarButtonStyle, setSidebarButtonStyle] = createSignal<SidebarButtonStyle>(
    input.sidebar_button_style ?? "minimal",
  )
  const [sidebarButtons, setSidebarButtons] = createSignal<readonly string[] | undefined>(input.sidebar_buttons)
  const [subagentTabs, setSubagentTabs] = createSignal<SubagentTabsSettings>({
    click: input.subagent_tabs?.click ?? "inline",
    auto_open: input.subagent_tabs?.auto_open ?? false,
    return_to_parent: input.subagent_tabs?.return_to_parent ?? true,
  })
  const [paletteKeys, setPaletteKeys] = createSignal<Record<string, string>>(input.palette_keys ?? {})
  const [smoothStreaming, setSmoothStreaming] = createSignal(input.smooth_streaming ?? false)
  const [dailyTheme, setDailyTheme] = createSignal(input.daily_theme ?? false)
  const [autoConfirmUpdates, setAutoConfirmUpdates] = createSignal(input.auto_confirm_updates ?? false)

  return {
    ...input,
    get keybind_preset() {
      return preset()
    },
    get keybinds() {
      return lookups[preset()]
    },
    setKeybindPreset: setPreset,
    get sidebar_button_style() {
      return sidebarButtonStyle()
    },
    setSidebarButtonStyle,
    get sidebar_buttons() {
      return sidebarButtons() ?? SIDEBAR_BUTTONS_DEFAULT
    },
    setSidebarButtons,
    get subagent_tabs() {
      return subagentTabs()
    },
    setSubagentTabs,
    get smooth_streaming() {
      return smoothStreaming()
    },
    setSmoothStreaming,
    get daily_theme() {
      return dailyTheme()
    },
    setDailyTheme,
    get auto_confirm_updates() {
      return autoConfirmUpdates()
    },
    setAutoConfirmUpdates,
    get palette_keys() {
      return paletteKeys()
    },
    setPaletteKey(command, key) {
      if (key === undefined && paletteKeys()[command] === undefined) return
      if (key !== undefined) {
        const leaderBinding = lookups[preset()].get("leader")[0]?.key
        const leaderKey = !leaderBinding
          ? ""
          : typeof leaderBinding === "string"
            ? leaderBinding.trim().toLowerCase()
            : ""
        const result = validateHotkey({
          key,
          leaderKey,
          ownerOf: (candidate) =>
            Object.entries(paletteKeys()).find(
              ([name, value]) => name !== command && value.trim().toLowerCase() === candidate,
            )?.[0],
          kittyKeyboard: true,
        })
        if (!result.ok) return
      }
      setPaletteKeys((current) => {
        if (key !== undefined) return { ...current, [command]: key }
        const next = { ...current }
        delete next[command]
        return next
      })
    },
    attention: {
      enabled: input.attention?.enabled ?? false,
      notifications: input.attention?.notifications ?? true,
      sound: input.attention?.sound ?? true,
      volume: input.attention?.volume ?? 0.4,
      sound_pack: input.attention?.sound_pack ?? "opencode.default",
      sounds: input.attention?.sounds ?? {},
    },
    leader_timeout: input.leader_timeout ?? LeaderTimeoutDefault,
    mouse: input.mouse ?? true,
    cursor: input.cursor
      ? {
          style: input.cursor.style ?? "block",
          blinking: input.cursor.blinking ?? true,
        }
      : undefined,
  }
}

function resolveKeybinds(input: Info, options: ResolveOptions, preset: KeybindPreset) {
  const keybinds: TuiKeybind.KeybindOverrides = {
    ...(preset === "opencode" ? {} : TuiKeybindPreset.oc),
    ...input.keybinds,
  }
  if (!options.terminalSuspend) {
    keybinds.terminal_suspend = "none"
    if (keybinds.input_undo === undefined) {
      const inputUndo = TuiKeybind.defaultValue("input_undo")
      keybinds.input_undo = ["ctrl+z", ...(typeof inputUndo === "string" ? inputUndo.split(",") : [])]
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(",")
    }
  }
  return createBindingLookup(TuiKeybind.toBindingConfig(TuiKeybind.parse(keybinds)), {
    commandMap: TuiKeybind.CommandMap,
    bindingDefaults: TuiKeybind.bindingDefaults(),
  })
}

const ConfigContext = createContext<Resolved>()

export function TuiConfigProvider(props: { config: Resolved; children: JSX.Element }) {
  return <ConfigContext.Provider value={props.config}>{props.children}</ConfigContext.Provider>
}

export function useTuiConfig() {
  const value = useContext(ConfigContext)
  if (!value) throw new Error("TuiConfigProvider is missing")
  return value
}
