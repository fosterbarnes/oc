export * as TuiConfig from "."

import { createBindingLookup } from "@opentui/keymap/extras"
import { Schema } from "effect"
import { createContext, createSignal, type JSX, useContext } from "solid-js"
import { TuiKeybind } from "./keybind"
import { TuiKeybindPreset } from "./keybindPreset"

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
}).annotate({
  description: "Open subagents in WezTerm or Windows Terminal tabs; needs the resident oc server",
})

export const Info = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  openEditedWith: Schema.optional(
    Schema.Union([Schema.String, Schema.Record(Schema.String, Schema.String)]),
  ).annotate({
    description:
      'Editor used when opening file paths from the TUI, or a map of extension to editor with an optional default, e.g. { "default": "code", ".md": "typora" }',
  }),
  theme: Schema.optional(Schema.String),
  sidebar_button_style: Schema.optional(Schema.Literals(["minimal", "outlined"])).annotate({
    description: "Sidebar button style: minimal (default) or outlined",
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
  scroll_speed: Schema.optional(ScrollSpeed).annotate({ description: "TUI scroll speed" }),
  scroll_acceleration: Schema.optional(ScrollAcceleration),
  diff_style: Schema.optional(DiffStyle),
  cursor: Schema.optional(Cursor),
  mouse: Schema.optional(Schema.Boolean).annotate({ description: "Enable or disable mouse capture (default: true)" }),
})
export type Info = Schema.Schema.Type<typeof Info>

export type KeybindPreset = (typeof TuiKeybindPreset.Names)[number]
export type SidebarButtonStyle = NonNullable<Info["sidebar_button_style"]>
export type SubagentTabsSettings = { click: "inline" | "tab"; auto_open: boolean }

export type Resolved = Omit<Info, "attention" | "keybind_preset" | "sidebar_button_style" | "subagent_tabs" | "keybinds" | "leader_timeout" | "mouse" | "cursor"> & {
  keybind_preset: KeybindPreset
  sidebar_button_style: SidebarButtonStyle
  subagent_tabs: SubagentTabsSettings
  setKeybindPreset: (preset: KeybindPreset) => void
  setSidebarButtonStyle: (style: SidebarButtonStyle) => void
  setSubagentTabs: (settings: SubagentTabsSettings) => void
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
  const [subagentTabs, setSubagentTabs] = createSignal<SubagentTabsSettings>({
    click: input.subagent_tabs?.click ?? "inline",
    auto_open: input.subagent_tabs?.auto_open ?? false,
  })

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
    get subagent_tabs() {
      return subagentTabs()
    },
    setSubagentTabs,
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
