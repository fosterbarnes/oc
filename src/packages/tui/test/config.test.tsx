/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { Schema } from "effect"
import {
  AttentionSoundName,
  Info,
  LeaderTimeoutDefault,
  PluginSpec,
  resolve,
  TuiConfigProvider,
  type Info as TuiConfigInfo,
  useTuiConfig,
} from "../src/config"

const decodeInfo = Schema.decodeUnknownSync(Info)
const decodePlugin = Schema.decodeUnknownSync(PluginSpec)

test("accepts all sidebar button styles and rejects unknown styles", () => {
  for (const style of ["minimal", "outlined"] as const) {
    const config = resolve(decodeInfo({ sidebar_button_style: style }), { terminalSuspend: true })
    expect(config.sidebar_button_style).toBe(style)
  }
  expect(() => decodeInfo({ sidebar_button_style: "unknown" })).toThrow()
})

test("switches sidebar button style live without mutating input", () => {
  const input: TuiConfigInfo = { sidebar_button_style: "outlined" }
  const config = resolve(input, { terminalSuspend: true })
  expect(config.sidebar_button_style).toBe("outlined")
  config.setSidebarButtonStyle("minimal")
  expect(config.sidebar_button_style).toBe("minimal")
  expect(input.sidebar_button_style).toBe("outlined")
  expect(resolve({}, { terminalSuspend: true }).sidebar_button_style).toBe("minimal")
})

test("resolves subagent tab defaults and switches them live without mutating input", () => {
  expect(resolve({}, { terminalSuspend: true }).subagent_tabs).toEqual({
    click: "inline",
    auto_open: false,
    return_to_parent: true,
  })
  const input: TuiConfigInfo = decodeInfo({ subagent_tabs: { click: "tab" } })
  const config = resolve(input, { terminalSuspend: true })
  expect(config.subagent_tabs).toEqual({ click: "tab", auto_open: false, return_to_parent: true })
  config.setSubagentTabs({ click: "inline", auto_open: true, return_to_parent: false })
  expect(config.subagent_tabs).toEqual({ click: "inline", auto_open: true, return_to_parent: false })
  expect(input.subagent_tabs).toEqual({ click: "tab" })
  expect(() => decodeInfo({ subagent_tabs: { click: "window" } })).toThrow()
})

test("defines package-owned plugin specs and attention sound names", () => {
  expect(decodePlugin("example-plugin")).toBe("example-plugin")
  expect(decodePlugin(["example-plugin", { enabled: true }])).toEqual(["example-plugin", { enabled: true }])
  expect(() => decodePlugin(["example-plugin"])).toThrow()
  expect(AttentionSoundName.literals).toEqual(["default", "question", "permission", "error", "done", "subagent_done"])
})

test("validates config constraints", () => {
  expect(
    decodeInfo({
      leader_timeout: 250,
      attention: { volume: 1, sounds: { done: "done.wav" } },
      prompt: { max_height: 10, max_width: "auto" },
      scroll_speed: 0.001,
      diff_style: "stacked",
      cursor: { blinking: false },
      plugin: ["example-plugin"],
    }),
  ).toMatchObject({
    leader_timeout: 250,
    attention: { volume: 1 },
    diff_style: "stacked",
    cursor: { blinking: false },
  })
  expect(() => decodeInfo({ leader_timeout: 0 })).toThrow()
  expect(() => decodeInfo({ attention: { volume: 1.1 } })).toThrow()
  expect(() => decodeInfo({ prompt: { max_width: 0 } })).toThrow()
  expect(() => decodeInfo({ scroll_speed: 0 })).toThrow()
  expect(() => decodeInfo({ cursor: { style: "beam" } })).toThrow()
  expect(decodeInfo({ attention: { sounds: { unknown: "sound.wav" } } })).toEqual({ attention: { sounds: {} } })
})

test("resolves host-neutral defaults", () => {
  const config = resolve({}, { terminalSuspend: true })

  expect(config.attention).toEqual({
    enabled: false,
    notifications: true,
    sound: true,
    volume: 0.4,
    sound_pack: "opencode.default",
    sounds: {},
  })
  expect(config.leader_timeout).toBe(LeaderTimeoutDefault)
  expect(config.mouse).toBe(true)
  expect(config.keybinds.has("terminal.suspend")).toBe(true)
  expect(config.keybinds.has("session.list")).toBe(true)
  expect(config.cursor).toBeUndefined()
})

test("keeps the full and oc command palettes on separate shortcuts", () => {
  const config = resolve({}, { terminalSuspend: true })

  expect(config.keybinds.get("command.palette.show")).toMatchObject([{ key: "ctrl+p" }])
  expect(config.keybinds.get("oc.settings_palette")).toMatchObject([{ key: "ctrl+o" }])
})

test("resolves overrides without mutating input", () => {
  const input: TuiConfigInfo = {
    theme: "custom",
    mouse: false,
    leader_timeout: 750,
    attention: {
      enabled: true,
      notifications: false,
      sound: false,
      volume: 0.8,
      sound_pack: "custom.pack",
      sounds: { question: "/sounds/question.wav" },
    },
    keybinds: { session_list: "ctrl+l" },
    cursor: { blinking: false },
  }
  const config = resolve(input, { terminalSuspend: true })

  expect(config).toMatchObject({
    theme: "custom",
    mouse: false,
    leader_timeout: 750,
    attention: input.attention,
    cursor: { style: "block", blinking: false },
  })
  expect(config.keybinds.get("session.list")).toHaveLength(1)
  expect(input.keybinds).toEqual({ session_list: "ctrl+l" })
})

test("resolves a session move keybind", () => {
  const config = resolve({ keybinds: { session_move: "ctrl+o" } }, { terminalSuspend: true })

  expect(config.keybinds.get("session.move")).toMatchObject([{ key: "ctrl+o" }])
})

test("resolves the session completion keybind", () => {
  const config = resolve({}, { terminalSuspend: true })

  expect(config.keybinds.get("session.complete.toggle")).toMatchObject([{ key: "ctrl+shift+return" }])
})

test("resolves the session failure keybind", () => {
  const config = resolve({}, { terminalSuspend: true })

  expect(config.keybinds.get("session.failed.toggle")).toMatchObject([{ key: "ctrl+shift+backspace" }])
})

test("resolves and overrides the manual In progress keybind", () => {
  expect(resolve({}, { terminalSuspend: true }).keybinds.get("session.in_progress.toggle")).toMatchObject([
    { key: "ctrl+shift+i" },
  ])
  expect(
    resolve({ keybinds: { session_in_progress_toggle: "ctrl+alt+i" } }, { terminalSuspend: true }).keybinds.get(
      "session.in_progress.toggle",
    ),
  ).toMatchObject([{ key: "ctrl+alt+i" }])
  expect(
    resolve({ keybinds: { session_in_progress_toggle: "none" } }, { terminalSuspend: true }).keybinds.has(
      "session.in_progress.toggle",
    ),
  ).toBe(false)
})

test("keeps cursor movement available with ctrl shift arrows", () => {
  const config = resolve({}, { terminalSuspend: true })

  expect(config.keybinds.get("input.move.up")).toMatchObject([{ key: "up,ctrl+shift+up" }])
  expect(config.keybinds.get("input.move.down")).toMatchObject([{ key: "down,ctrl+shift+down" }])
})

test("applies the oc keybind preset by default and stock keys with the opencode preset", () => {
  const oc = resolve({}, { terminalSuspend: true })
  expect(oc.keybinds.get("app.exit")).toMatchObject([{ key: "<leader>q" }])
  expect(oc.keybinds.get("model.list")).toMatchObject([{ key: "ctrl+m,<leader>m" }])

  const opencode = resolve({ keybind_preset: "opencode" }, { terminalSuspend: true })
  expect(opencode.keybinds.get("app.exit")).toMatchObject([{ key: "ctrl+c,ctrl+d,<leader>q" }])
  expect(opencode.keybinds.get("model.list")).toMatchObject([{ key: "<leader>m" }])
  expect(opencode.keybinds.get("input.move.up")).toMatchObject([{ key: "up" }])

  oc.setKeybindPreset("opencode")
  expect(oc.keybind_preset).toBe("opencode")
  expect(oc.keybinds.get("model.list")).toMatchObject([{ key: "<leader>m" }])

  const custom = resolve({ keybind_preset: "opencode", keybinds: { model_list: "ctrl+k" } }, { terminalSuspend: true })
  expect(custom.keybinds.get("model.list")).toMatchObject([{ key: "ctrl+k" }])
})

test("disables suspend and assigns ctrl+z to undo when unsupported", () => {
  const config = resolve({}, { terminalSuspend: false })

  expect(config.keybinds.has("terminal.suspend")).toBe(false)
  expect(config.keybinds.get("input.undo")).toMatchObject([{ key: "ctrl+z,ctrl+-,super+z" }])
})

test("preserves an explicit undo binding when suspend is unsupported", () => {
  const config = resolve({ keybinds: { input_undo: "ctrl+u", terminal_suspend: "ctrl+s" } }, { terminalSuspend: false })

  expect(config.keybinds.has("terminal.suspend")).toBe(false)
  expect(config.keybinds.get("input.undo")).toHaveLength(1)
  expect(config.keybinds.get("input.undo")).toMatchObject([{ key: "ctrl+u" }])
})

test("provides resolved config through Solid context", async () => {
  const config = resolve({ theme: "custom" }, { terminalSuspend: true })

  function Consumer() {
    const value = useTuiConfig()
    return <text>{`${value.theme} ${value.mouse} ${value.leader_timeout}`}</text>
  }

  const app = await testRender(() => (
    <TuiConfigProvider config={config}>
      <Consumer />
    </TuiConfigProvider>
  ))
  try {
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain(`custom true ${LeaderTimeoutDefault}`)
  } finally {
    app.renderer.destroy()
  }
})

test("requires the config provider", () => {
  expect(() => useTuiConfig()).toThrow("TuiConfigProvider is missing")
})
