import fs from "node:fs"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { SYSTEM_TIME_ZONE } from "@opencode-ai/core/util/timeZone"
import { DialogAbout } from "./component/dialog-about"
import { DialogAgent } from "./component/dialog-agent"
import { DialogModel } from "./component/dialog-model"
import { DialogSessionCleanup } from "./component/dialog-session-cleanup"
import { DialogSessionSubagents } from "./component/dialog-session-subagents"
import { DialogSubagents } from "./component/dialog-subagents"
import { useTuiConfig } from "./config"
import { useKV } from "./context/kv"
import { useRoute } from "./context/route"
import { useSDK } from "./context/sdk"
import { useSync } from "./context/sync"
import {
  CHATGPT_DESKTOP,
  CLAUDE_DESKTOP,
  CURSOR_DESKTOP,
  updateAllHarnesses,
  updateClaudeCode,
  updateCodexCli,
  updateCursorCli,
  updateDesktopHarness,
} from "./harnessUpdate"
import { bootstrapSession, listHomeDirs } from "./ocNewSession"
import { persistAgentModel, persistOcConfig, persistTuiSetting, readOcConfig, resolveOcDirectory } from "./ocSettings"
import { useDialog } from "./ui/dialog"
import { DialogAlert } from "./ui/dialog-alert"
import { DialogPrompt } from "./ui/dialog-prompt"
import { DialogSelect } from "./ui/dialog-select"
import { useToast } from "./ui/toast"
import { Locale } from "./util/locale"

// oc palette entries, in three runs that App spreads at their palette positions. Call inside App.
export function createOcCommands(input: {
  claudeCliPath: () => string
  controlServer: (action: "shutdown" | "restart") => Promise<void>
}) {
  const tuiConfig = useTuiConfig()
  const route = useRoute()
  const dialog = useDialog()
  const kv = useKV()
  const sdk = useSDK()
  const toast = useToast()
  const sync = useSync()
  const { claudeCliPath, controlServer } = input
  return {
    newSession: {
      name: "oc.new_session",
      title: "New session",
      category: "oc",
      slashName: "newOcSession",
      run: () => {
        const { homeDir, homeDirSort } = readOcConfig()
        const dirs = listHomeDirs(homeDir, homeDirSort)
        if (dirs.length === 0) {
          toast.show({ message: `No folders found in ${homeDir}`, variant: "error" })
          return
        }
        // Bootstrapping takes seconds; ignore repeat selections until it settles.
        let creating = false
        dialog.replace(() => (
          <DialogSelect
            title="New oc session"
            options={dirs.map((dir) => ({ value: dir.fullPath, title: dir.name }))}
            onSelect={async (option) => {
              if (creating) return
              const directory = path.normalize(option.value)
              let isDir = false
              try {
                isDir = fs.statSync(directory).isDirectory()
              } catch {
                isDir = false
              }
              if (!isDir) {
                toast.show({ message: `Directory not found: ${directory}`, variant: "error" })
                return
              }
              creating = true
              try {
                const sessionID = await bootstrapSession(sdk.client, directory)
                dialog.clear()
                route.navigate({ type: "session", sessionID })
              } catch (error) {
                creating = false
                toast.show({
                  message: `Failed to create oc session: ${error instanceof Error ? error.message : String(error)}`,
                  variant: "error",
                })
              }
            }}
          />
        ))
      },
    },
    defaults: [
      {
        name: "model.default",
        title: "Model",
        category: "oc",
        group: "Defaults",
        slashName: "sessionModel",
        run: () => {
          dialog.replace(() => (
            <DialogModel
              updateCurrent={false}
              onSelect={(providerID, modelID) => {
                void persistOcConfig("sessionModel", `${providerID}/${modelID}`, toast)
              }}
            />
          ))
        },
      },
      {
        name: "agent.session",
        title: "Agent",
        category: "oc",
        group: "Defaults",
        slashName: "sessionAgent",
        run: () => {
          dialog.replace(() => (
            <DialogAgent
              onSelect={(agent) => {
                void persistOcConfig("sessionAgent", agent, toast)
              }}
            />
          ))
        },
      },
      {
        name: "oc.view_subagents",
        title: "Subagents",
        category: "oc",
        slashName: "viewSub",
        run: () => {
          dialog.replace(() => <DialogSubagents />)
        },
      },
      {
        name: "oc.session_subagents",
        title: "Session subagents",
        desc: "Switch subagents on or off for this session",
        category: "oc",
        slashName: "sessionSub",
        enabled: () => route.data.type === "session",
        run: () => {
          if (route.data.type !== "session") return
          const sessionID = route.data.sessionID
          dialog.replace(() => <DialogSessionSubagents sessionID={sessionID} />)
        },
      },
      {
        name: "oc.notices",
        title: "Notices",
        category: "oc",
        slashName: "notices",
        run: () => {
          if (toast.notices.length === 0) return void DialogAlert.show(dialog, "Notices", "No notices since oc started")
          // Snapshot: opening an entry must not shift indexes if a toast lands meanwhile.
          const notices = [...toast.notices]
          dialog.replace(() => (
            <DialogSelect
              title="Notices"
              options={notices.map((notice, index) => ({
                value: index,
                title: notice.title ? `${notice.title}: ${notice.message}` : notice.message,
                footer: Locale.todayTimeOrDateTime(notice.time),
              }))}
              onSelect={(option) => {
                const notice = notices[option.value]!
                void DialogAlert.show(
                  dialog,
                  notice.title ?? notice.variant,
                  `${Locale.datetime(notice.time)}\n\n${notice.message}`,
                )
              }}
            />
          ))
        },
      },
      {
        name: "agent.default_subagent_model",
        title: "Subagent model",
        category: "oc",
        group: "Defaults",
        get desc() {
          return sync.data.agent.find((item) => item.name === sync.data.config.default_subagent)?.model?.modelID
        },
        slashName: "defaultSubagentModel",
        run: () => {
          const defaultSubagent = sync.data.config.default_subagent
          if (!defaultSubagent) {
            toast.show({ message: "No default sub-agent is configured", variant: "error" })
            return
          }
          const agent = sync.data.agent.find((item) => item.name === defaultSubagent)
          dialog.replace(() => (
            <DialogModel
              current={agent?.model}
              updateCurrent={false}
              onSelect={(providerID, modelID) => {
                void persistAgentModel(sdk.client, defaultSubagent, `${providerID}/${modelID}`, toast)
              }}
            />
          ))
        },
      },
      {
        name: "agent.default_subagent",
        title: "Subagent agent",
        category: "oc",
        group: "Defaults",
        get desc() {
          return sync.data.config.default_subagent
        },
        slashName: "defaultSubagent",
        run: () => {
          const options = sync.data.agent
            .filter((agent) => agent.mode !== "primary" && !agent.hidden)
            .map((agent) => ({
              value: agent.name,
              title: agent.name,
              description: agent.description,
            }))
          if (options.length === 0) {
            toast.show({ message: "No delegated agents are available", variant: "error" })
            return
          }
          dialog.replace(() => (
            <DialogSelect
              title="Subagent agent"
              current={sync.data.config.default_subagent}
              options={options}
              onSelect={async (option) => {
                const result = await sdk.client.global.config.update({ config: { default_subagent: option.value } })
                if (result.error) {
                  toast.show({
                    message: `Failed to set native default subagent: ${String(result.error)}`,
                    variant: "error",
                  })
                  return
                }
                toast.show({ message: `Saved default sub-agent: ${option.value}`, variant: "success" })
                dialog.clear()
              }}
            />
          ))
        },
      },
    ],
    settings: [
      {
        name: "oc.session_cleanup",
        title: "Clean up completed sessions",
        category: "oc",
        run: () => {
          dialog.replace(() => <DialogSessionCleanup />)
        },
      },
      {
        name: "oc.about",
        title: "About",
        category: "oc",
        slashName: "about",
        run: () => {
          dialog.replace(() => <DialogAbout />)
        },
      },
      {
        name: "oc.home_dir",
        title: "Home folder",
        category: "oc",
        group: "Folders",
        slashName: "homeDir",
        run: () => {
          const current = readOcConfig().homeDir
          dialog.replace(() => (
            <DialogPrompt
              title="Home directory"
              placeholder={current}
              onConfirm={(value) => {
                const trimmed = value.trim()
                if (!trimmed) return
                const resolved = resolveOcDirectory(trimmed, "")
                if (!resolved) {
                  toast.show({ message: `Directory not found: ${trimmed}`, variant: "error" })
                  return
                }
                void persistOcConfig("homeDir", resolved, toast)
                dialog.clear()
              }}
            />
          ))
        },
      },
      {
        name: "oc.home_dir_sort",
        title: "Home sort order",
        category: "oc",
        group: "Layout",
        get desc() {
          return readOcConfig().homeDirSort
        },
        slashName: "homeDirSort",
        run: () => {
          dialog.replace(() => (
            <DialogSelect
              title="Home sort order"
              options={[
                { value: "name", title: "name" },
                { value: "modified", title: "modified" },
              ]}
              onSelect={(option) => {
                void persistOcConfig("homeDirSort", option.value, toast)
                dialog.clear()
              }}
            />
          ))
        },
      },
      {
        name: "oc.oc_dir",
        title: "oc folder",
        category: "oc",
        group: "Folders",
        slashName: "ocDir",
        run: () => {
          const current = readOcConfig().ocDir
          dialog.replace(() => (
            <DialogPrompt
              title="oc directory"
              placeholder={current}
              onConfirm={(value) => {
                const trimmed = value.trim()
                if (!trimmed) return
                const resolved = resolveOcDirectory(trimmed, "")
                if (!resolved) {
                  toast.show({ message: `Directory not found: ${trimmed}`, variant: "error" })
                  return
                }
                void persistOcConfig("ocDir", resolved, toast)
                dialog.clear()
              }}
            />
          ))
        },
      },
      {
        name: "oc.server_startup",
        title: "Start at Windows sign-in",
        category: "oc",
        group: "Server",
        get desc() {
          return readOcConfig().serverStartOnWindowsUserStart ? "on" : "off"
        },
        slashName: "serverStartOnWindowsUserStart",
        run: () => {
          const current = readOcConfig().serverStartOnWindowsUserStart
          dialog.replace(() => (
            <DialogSelect
              title="Start server at Windows sign-in"
              current={current ? "true" : "false"}
              options={[
                { value: "true", title: "on" },
                { value: "false", title: "off" },
              ]}
              onSelect={async (option) => {
                if (await persistOcConfig("serverStartOnWindowsUserStart", option.value, toast)) dialog.clear()
              }}
            />
          ))
        },
      },
      {
        name: "oc.sidebar_position",
        title: "Sidebar position",
        category: "oc",
        group: "Layout",
        get desc() {
          return kv.get("sidebar_position", "right")
        },
        slashName: "sidebarPosition",
        run: () => {
          dialog.replace(() => (
            <DialogSelect
              title="Sidebar position"
              current={kv.get("sidebar_position", "right")}
              options={[
                { value: "right", title: "right" },
                { value: "left", title: "left" },
                { value: "top", title: "top" },
                { value: "bottom", title: "bottom" },
              ]}
              onSelect={(option) => {
                kv.set("sidebar_position", option.value)
                dialog.clear()
              }}
            />
          ))
        },
      },
      {
        name: "oc.keybind_preset",
        title: "Keybind layout",
        category: "oc",
        group: "Layout",
        get desc() {
          return tuiConfig.keybind_preset
        },
        slashName: "keybindLayout",
        run: () => {
          dialog.replace(() => (
            <DialogSelect
              title="Keybind layout"
              current={tuiConfig.keybind_preset}
              options={[
                {
                  value: "oc" as const,
                  title: "oc",
                  description: "ctrl+m models, ctrl+s sessions, ctrl+c never quits",
                },
                { value: "opencode" as const, title: "opencode", description: "Stock OpenCode keys" },
              ]}
              onSelect={(option) => {
                dialog.clear()
                tuiConfig.setKeybindPreset(option.value)
                try {
                  persistTuiSetting(["keybind_preset"], option.value)
                } catch (cause) {
                  const message = cause instanceof Error ? cause.message : String(cause)
                  toast.show({ message: `Keybind layout applied but not saved: ${message}`, variant: "error" })
                  return
                }
                toast.show({ message: `Keybind layout: ${option.value}`, variant: "success" })
              }}
            />
          ))
        },
      },
      {
        name: "oc.sidebar_button_style",
        title: "Sidebar buttons",
        category: "oc",
        group: "Layout",
        get desc() {
          return tuiConfig.sidebar_button_style === "minimal" ? "Minimal" : "Outline"
        },
        slashName: "sidebarButtonStyle",
        run: () => {
          dialog.replace(() => (
            <DialogSelect
              title="Sidebar button style"
              current={tuiConfig.sidebar_button_style}
              options={[
                { value: "outlined" as const, title: "Outline" },
                { value: "minimal" as const, title: "Minimal" },
              ]}
              onSelect={(option) => {
                dialog.clear()
                tuiConfig.setSidebarButtonStyle(option.value)
                try {
                  persistTuiSetting(["sidebar_button_style"], option.value)
                } catch (cause) {
                  const message = cause instanceof Error ? cause.message : String(cause)
                  toast.show({ message: `Sidebar button style applied but not saved: ${message}`, variant: "error" })
                  return
                }
                toast.show({ message: `Sidebar button style: ${option.title}`, variant: "success" })
              }}
            />
          ))
        },
      },
      {
        name: "oc.subagent_usage",
        get title() {
          return kv.get("subagent_usage_enabled", true) ? "Hide subagent usage" : "Show subagent usage"
        },
        category: "oc",
        group: "Layout",
        desc: "Context % of each subagent in the prompt bar",
        slashName: "subagentUsage",
        run: () => {
          kv.set("subagent_usage_enabled", !kv.get("subagent_usage_enabled", true))
          dialog.clear()
        },
      },
      {
        name: "oc.subagent_card_rows",
        get title() {
          const rows = kv.get("subagent_card_rows", 4)
          return `Subagent live rows: ${rows ? rows : "off"}`
        },
        category: "oc",
        group: "Layout",
        desc: "Rows of tool calls, thinking, and output shown for each running subagent",
        slashName: "subagentRows",
        run: () => {
          const steps = [0, 3, 4, 6]
          const index = steps.indexOf(kv.get("subagent_card_rows", 4))
          kv.set("subagent_card_rows", steps[(index + 1) % steps.length])
          dialog.clear()
        },
      },
      {
        name: "oc.subagent_tabs",
        title: "Subagent tabs",
        category: "oc",
        group: "Layout",
        slashName: "subagentTabs",
        run: () => {
          // Each pick flips one setting, then reopens on the same row so both can change in one visit.
          const show = (current?: "click" | "auto_open" | "return_to_parent") => {
            const settings = tuiConfig.subagent_tabs
            dialog.replace(() => (
              <DialogSelect
                title="Subagents"
                current={current}
                options={[
                  {
                    value: "click" as const,
                    title: `Click opens: ${settings.click === "tab" ? "Tab" : "Inline"}`,
                    description: "Where a clicked subagent opens",
                  },
                  {
                    value: "auto_open" as const,
                    title: `Auto-open new subagents: ${settings.auto_open ? "On" : "Off"}`,
                    description: "Open each new subagent of the viewed session in its own tab",
                  },
                  {
                    value: "return_to_parent" as const,
                    title: `Return to parent when done: ${settings.return_to_parent ? "On" : "Off"}`,
                    description: "Leave a viewed subagent for its parent when it finishes",
                  },
                ]}
                onSelect={(option) => {
                  const value =
                    option.value === "click" ? (settings.click === "tab" ? "inline" : "tab") : !settings[option.value]
                  tuiConfig.setSubagentTabs({ ...settings, [option.value]: value })
                  try {
                    persistTuiSetting(["subagent_tabs", option.value], value)
                  } catch (cause) {
                    const message = cause instanceof Error ? cause.message : String(cause)
                    toast.show({ message: `Subagent tabs applied but not saved: ${message}`, variant: "error" })
                  }
                  show(option.value)
                }}
              />
            ))
          }
          show()
        },
      },
      {
        name: "oc.time",
        title: "Time",
        category: "oc",
        group: "Layout",
        get desc() {
          return `${Locale.clock()} · ${Locale.zone()}`
        },
        slashName: "time",
        run: () => {
          // Saves to global config `time`, applies locally at once, then reopens on the same row.
          const save = async (patch: { clock?: Locale.Clock; timezone?: string }, current: "clock" | "zone") => {
            const result = await sdk.client.global.config.update({ config: { time: patch } })
            if (result.error) {
              toast.show({ message: `Failed to save time setting: ${String(result.error)}`, variant: "error" })
              return
            }
            Locale.setTimeSettings({ clock: Locale.clock(), timezone: Locale.zone(), ...patch })
            show(current)
          }
          const pickZone = () => {
            const now = new Date()
            dialog.replace(() => (
              <DialogSelect
                title="Time zone"
                current={Locale.zone()}
                options={[
                  { value: "auto", title: "auto", description: SYSTEM_TIME_ZONE },
                  ...Intl.supportedValuesOf("timeZone").map((zone) => ({
                    value: zone,
                    title: zone,
                    description: utcOffset(zone, now),
                  })),
                ]}
                onSelect={(option) => void save({ timezone: option.value }, "zone")}
              />
            ))
          }
          const show = (current?: "clock" | "zone") => {
            dialog.replace(() => (
              <DialogSelect
                title="Time"
                current={current}
                options={[
                  {
                    value: "clock",
                    title: `Clock: ${Locale.clock() === "12h" ? "12-hour" : "24-hour"}`,
                    onSelect: () => void save({ clock: Locale.clock() === "12h" ? "24h" : "12h" }, "clock"),
                  },
                  {
                    value: "zone",
                    title: `Time zone: ${Locale.zone() === "auto" ? `auto (${SYSTEM_TIME_ZONE})` : Locale.zone()}`,
                    onSelect: pickZone,
                  },
                  {
                    value: "now",
                    title: `Now: ${Locale.format(Date.now(), {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      timeZoneName: "shortOffset",
                    })}`,
                    inert: true,
                  },
                ]}
              />
            ))
          }
          show()
        },
      },
      {
        name: "oc.bgrun",
        title: "bgRun",
        category: "oc",
        group: "Tools (experimental)",
        get desc() {
          const permission = sync.data.config.permission
          return typeof permission !== "object" || permission.bgRun !== "deny" ? "on" : "off"
        },
        slashName: "bgRun",
        run: () => {
          // A "deny" permission removes the tool from the agent's tool list, not just its calls.
          const permission = sync.data.config.permission
          const current = typeof permission !== "object" || permission.bgRun !== "deny"
          dialog.replace(() => (
            <DialogSelect
              title="bgRun tool"
              current={current ? "true" : "false"}
              options={[
                { value: "true", title: "on" },
                { value: "false", title: "off" },
              ]}
              onSelect={async (option) => {
                dialog.clear()
                const on = option.value === "true"
                if (on === current) return
                const action = on ? "allow" : "deny"
                const result = await sdk.client.global.config.update({
                  config: { permission: { bgRun: action, bgStatus: action, bgKill: action } },
                })
                toast.show(
                  result.error
                    ? { message: `Failed to update bgRun: ${String(result.error)}`, variant: "error" }
                    : { message: `bgRun ${on ? "on" : "off"}`, variant: "success" },
                )
              }}
            />
          ))
        },
      },
      {
        name: "oc.smooth_streaming",
        title: "Smooth streaming",
        category: "oc",
        group: "Beta",
        get desc() {
          return tuiConfig.smooth_streaming ? "on" : "off"
        },
        slashName: "smoothStreaming",
        run: () => {
          dialog.replace(() => (
            <DialogSelect
              title="Smooth streaming"
              current={tuiConfig.smooth_streaming}
              options={[
                { value: true, title: "on", description: "Reveal replies and reasoning at a steady pace" },
                { value: false, title: "off", description: "Show text as soon as it arrives" },
              ]}
              onSelect={(option) => {
                dialog.clear()
                tuiConfig.setSmoothStreaming(option.value)
                try {
                  persistTuiSetting(["smooth_streaming"], option.value)
                } catch (cause) {
                  const message = cause instanceof Error ? cause.message : String(cause)
                  toast.show({ message: `Smooth streaming applied but not saved: ${message}`, variant: "error" })
                  return
                }
                toast.show({ message: `Smooth streaming ${option.title}`, variant: "success" })
              }}
            />
          ))
        },
      },
      ...[
        {
          name: "oc.update_all_harnesses",
          title: "Update all",
          run: () => void updateAllHarnesses(claudeCliPath(), toast, dialog),
        },
        {
          name: "oc.update_claude_code",
          title: "Update Claude Code",
          run: () => updateClaudeCode(claudeCliPath(), toast),
        },
        { name: "oc.update_cursor_cli", title: "Update Cursor CLI", run: () => updateCursorCli(toast) },
        { name: "oc.update_codex_cli", title: "Update Codex CLI", run: () => updateCodexCli(toast) },
        ...(process.platform === "win32"
          ? [
              {
                name: "oc.update_claude_desktop",
                title: "Update Claude Desktop",
                run: () => updateDesktopHarness(CLAUDE_DESKTOP, toast, dialog),
              },
              {
                name: "oc.update_cursor_desktop",
                title: "Update Cursor Desktop",
                run: () => updateDesktopHarness(CURSOR_DESKTOP, toast, dialog),
              },
              {
                name: "oc.update_chatgpt_desktop",
                title: "Update ChatGPT Desktop",
                run: () => updateDesktopHarness(CHATGPT_DESKTOP, toast, dialog),
              },
            ]
          : []),
      ].map((command) => ({ ...command, category: "oc", group: "Third party harness updates" })),
      {
        name: "server.shutdown",
        title: "Shut down",
        category: "oc",
        group: "Server",
        hidden: Global.native,
        run: () => void controlServer("shutdown"),
      },
      {
        name: "server.restart",
        title: "Restart",
        category: "oc",
        group: "Server",
        hidden: Global.native,
        run: () => void controlServer("restart"),
      },
    ],
  }
}

// `UTC-05:00` for a zone at the given moment; `longOffset` names UTC itself plain `GMT`.
function utcOffset(zone: string, at: Date) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value
  return name === "GMT" ? "UTC+00:00" : name?.replace("GMT", "UTC")
}
