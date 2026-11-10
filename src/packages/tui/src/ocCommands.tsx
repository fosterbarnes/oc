import fs from "node:fs"
import path from "node:path"
import { TextAttributes } from "@opentui/core"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Global } from "@opencode-ai/core/global"
import { SYSTEM_TIME_ZONE } from "@opencode-ai/core/util/timeZone"
import { DialogAbout } from "./component/dialog-about"
import { DialogAgent } from "./component/dialog-agent"
import { DialogModel } from "./component/dialog-model"
import { DialogSessionCleanup } from "./component/dialog-session-cleanup"
import { DialogSessionSubagents } from "./component/dialog-session-subagents"
import { DialogSubagents } from "./component/dialog-subagents"
import { Spinner } from "./component/spinner"
import { DAILY_THEME_KEY, useTuiConfig } from "./config"
import { useKV } from "./context/kv"
import { useRoute } from "./context/route"
import { useSDK } from "./context/sdk"
import { useSync } from "./context/sync"
import { useTheme } from "./context/theme"
import { bootstrapSession, listHomeDirs } from "./ocNewSession"
import { IMAGE_PASTE_PREVIEW_KEY, PASTE_SUMMARY_KEY, PROMPT_TAB_KEY, type PromptTabAction } from "./prompt/part"
import { dailyTheme, dayNumber } from "./theme/daily"
import { persistAgentModel, persistOcConfig, persistTuiSetting, readOcConfig, resolveOcDirectory } from "./ocSettings"
import { resetSidebarButtons } from "./sidebarButtons"
import { detectInstalled, isInstalled, updateAll, updateOne, updateTargets } from "./thirdPartyUpdates"
import {
  clampSidebarWidth,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_KEY,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
} from "./sidebarWidth"
import { useDialog } from "./ui/dialog"
import { DialogAlert } from "./ui/dialog-alert"
import { DialogPrompt } from "./ui/dialog-prompt"
import { DialogSelect } from "./ui/dialog-select"
import { DialogStepper } from "./ui/dialog-stepper"
import { TOAST_DISPLAY_KEY, useToast } from "./ui/toast"
import { LINK_BROWSER_KEY, LINK_CLICK_KEY, scanBrowsers } from "./util/browser"
import { Locale } from "./util/locale"
import { writeTerminalEscape } from "./util/renderer"
import {
  fontEscape,
  listMonospaceFonts,
  TERMINAL_FONT_KEY,
  type FontFamily,
  type TerminalFont,
} from "./util/terminalFont"
import { detectTerminal, terminalAppScript } from "@opencode-ai/core/util/terminal"
import { launchDetached } from "@opencode-ai/core/util/launchDetached"
import { ProcessTree } from "@opencode-ai/core/util/processTree"
import { useRenderer } from "@opentui/solid"
import { createSignal, Show } from "solid-js"
import { DialogConfirm } from "./ui/dialog-confirm"
import { weztermExecutable } from "./routes/session/sidebar-tools/scriptRunner"

const _TAB_OPTIONS: { value: PromptTabAction; title: string; description: string }[] = [
  { value: "text", title: "text", description: "Insert a tab" },
  { value: "agent", title: "agent", description: "Next agent" },
  { value: "variant", title: "reasoning", description: "Next reasoning effort" },
  { value: "favorite", title: "favorites", description: "Next favorite model" },
]

// oc palette entries, in three runs that App spreads at their palette positions. Call inside App.
export function createOcCommands(input: {
  claudeCliPath: () => string
  controlServer: (action: "shutdown" | "restart") => Promise<void>
  reloadInstance: (success: string) => Promise<void>
}) {
  const tuiConfig = useTuiConfig()
  const route = useRoute()
  const dialog = useDialog()
  const kv = useKV()
  const sdk = useSDK()
  const toast = useToast()
  const sync = useSync()
  const renderer = useRenderer()
  const { theme } = useTheme()
  const { claudeCliPath, controlServer, reloadInstance } = input
  // Third party updates: an entry shows only when its program is on this machine.
  const targets = updateTargets(claudeCliPath)
  const refreshUpdateTargets = () => void detectInstalled(targets)
  refreshUpdateTargets()
  return {
    refreshUpdateTargets,
    newSession: {
      name: "oc.new_session",
      title: "New session",
      desc: "Start a session in a folder under the home folder",
      category: "oc",
      group: "Session",
      slashName: "newOcSession",
      run: () => {
        const { homeDir, homeDirSort } = readOcConfig()
        const dirs = listHomeDirs(homeDir, homeDirSort)
        if (dirs.length === 0) {
          toast.show({ message: `No folders found in ${homeDir}`, variant: "error" })
          return
        }
        // From a session, start on the home folder that holds it.
        const sessionDirectory =
          route.data.type === "session" ? sync.session.get(route.data.sessionID)?.directory : undefined
        const current = sessionDirectory
          ? dirs.find((dir) => FSUtil.contains(dir.fullPath, sessionDirectory))?.fullPath
          : undefined
        // Booting a cold project takes seconds; the folder name drives the spinner and locks the list.
        const [creating, setCreating] = createSignal<string>()
        dialog.replace(() => (
          <DialogSelect
            title="New oc session"
            titleView={
              <box flexDirection="row" gap={1}>
                <text fg={theme.text} attributes={TextAttributes.BOLD}>
                  New oc session
                </text>
                <Show when={creating()}>{(name) => <Spinner>Creating session in {name()}</Spinner>}</Show>
              </box>
            }
            locked={creating() !== undefined}
            current={current}
            options={dirs.map((dir) => ({ value: dir.fullPath, title: dir.name }))}
            onSelect={async (option) => {
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
              setCreating(option.title)
              try {
                const sessionID = await bootstrapSession(sdk.client, directory)
                dialog.clear()
                route.navigate({ type: "session", sessionID })
              } catch (error) {
                setCreating(undefined)
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
        desc: "Model oc starts with",
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
        desc: "Agent oc starts with",
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
        desc: "Add, remove, or change the model of delegated agents",
        category: "oc",
        group: "Subagents",
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
        group: "Subagents",
        slashName: "sessionSub",
        enabled: () => route.data.type === "session",
        run: () => {
          if (route.data.type !== "session") return
          const sessionID = route.data.sessionID
          dialog.replace(() => <DialogSessionSubagents sessionID={sessionID} />)
        },
      },
      {
        name: "oc.stop_session_subagents",
        title: "Stop session subagents",
        desc: "Abort every child of this session; keeps the parent and its history",
        category: "oc",
        group: "Subagents",
        slashName: "stopSub",
        enabled: () => route.data.type === "session",
        run: async () => {
          if (route.data.type !== "session") return
          const current = sync.session.get(route.data.sessionID)
          const root = current?.parentID ?? route.data.sessionID
          const children = sync.data.session.filter((session) => session.parentID === root)
          if (children.length === 0) {
            toast.show({ message: "No subagents in this session", variant: "info" })
            return
          }
          const confirmed = await DialogConfirm.show(
            dialog,
            "Stop session subagents",
            `Abort ${children.length} subagent session${children.length === 1 ? "" : "s"}? The parent chat and its history stay.`,
          )
          if (!confirmed) return
          dialog.clear()
          const results = await Promise.all(children.map((child) => sdk.client.session.abort({ sessionID: child.id })))
          const failed = results.filter((result) => result.error).length
          toast.show({
            message: failed
              ? `Stopped ${children.length - failed} of ${children.length} subagents`
              : `Stopped ${children.length} subagent${children.length === 1 ? "" : "s"}`,
            variant: failed ? "error" : "success",
          })
        },
      },
      {
        name: "oc.notices",
        title: "Notices",
        desc: "Toasts and alerts shown since oc started",
        category: "oc",
        group: "Session",
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
                description: notice.action?.label,
                footer: Locale.todayTimeOrDateTime(notice.time),
              }))}
              actions={[
                {
                  command: "dialog.notices.action",
                  title: "run action",
                  hidden: (option) => !option || !notices[option.value]?.action,
                  onTrigger: (option) => {
                    const action = notices[option.value]?.action
                    if (!action) return
                    dialog.clear()
                    action.run()
                  },
                },
              ]}
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
        group: "Subagents",
        get desc() {
          return (
            sync.data.agent.find((item) => item.name === sync.data.config.default_subagent)?.model?.modelID ?? "not set"
          )
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
        group: "Subagents",
        get desc() {
          return sync.data.config.default_subagent ?? "not set"
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
        desc: "Archive or delete finished sessions that are not open",
        category: "oc",
        group: "Session",
        run: () => {
          dialog.replace(() => <DialogSessionCleanup />)
        },
      },
      {
        name: "oc.about",
        title: "About",
        desc: "Version, build, runtime, and repo links",
        category: "oc",
        group: "About",
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
        get desc() {
          return readOcConfig().homeDir
        },
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
        group: "Folders",
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
        title: "User folder",
        category: "oc",
        group: "Folders",
        get desc() {
          return readOcConfig().ocDir
        },
        slashName: "ocDir",
        run: () => {
          const current = readOcConfig().ocDir
          dialog.replace(() => (
            <DialogPrompt
              title="User folder"
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
        title: "Start server at sign-in",
        category: "oc",
        group: "Server and processes",
        get desc() {
          return readOcConfig().serverStartAtLogin ? "on" : "off"
        },
        slashName: "serverStartAtLogin",
        run: () => {
          const current = readOcConfig().serverStartAtLogin
          dialog.replace(() => (
            <DialogSelect
              title="Start server at sign-in"
              current={current ? "true" : "false"}
              options={[
                { value: "true", title: "on" },
                { value: "false", title: "off" },
              ]}
              onSelect={async (option) => {
                if (await persistOcConfig("serverStartAtLogin", option.value, toast)) dialog.clear()
              }}
            />
          ))
        },
      },
      {
        name: "oc.sidebar_position",
        title: "Sidebar position",
        category: "oc",
        group: "Sidebar",
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
        name: "oc.sidebar_mode",
        title: "Sidebar visibility",
        category: "oc",
        group: "Sidebar",
        get desc() {
          return kv.get("sidebar_mode", "auto")
        },
        slashName: "sidebarVisibility",
        run: () => {
          dialog.replace(() => (
            <DialogSelect
              title="Sidebar visibility"
              current={kv.get("sidebar_mode", "auto")}
              options={[
                { value: "auto", title: "auto", description: "Docked above 120 columns, overlay below" },
                { value: "always", title: "always", description: "Docked at any terminal width" },
              ]}
              onSelect={(option) => {
                kv.set("sidebar_mode", option.value)
                dialog.clear()
              }}
            />
          ))
        },
      },
      {
        name: "oc.toast_display",
        title: "Notice display",
        category: "oc",
        group: "Appearance",
        // Any value but "floating" (including an older "sidebar") means above the prompt.
        get desc() {
          return kv.get(TOAST_DISPLAY_KEY, "prompt") === "floating" ? "floating" : "prompt"
        },
        slashName: "noticeDisplay",
        run: () => {
          dialog.replace(() => (
            <DialogSelect
              title="Notice display"
              current={kv.get(TOAST_DISPLAY_KEY, "prompt") === "floating" ? "floating" : "prompt"}
              options={[
                { value: "prompt", title: "prompt", description: "Right above the prompt box" },
                { value: "floating", title: "floating", description: "Floating box at the top right" },
              ]}
              onSelect={(option) => {
                kv.set(TOAST_DISPLAY_KEY, option.value)
                dialog.clear()
              }}
            />
          ))
        },
      },
      {
        name: "oc.sidebar_width",
        title: "Sidebar width",
        category: "oc",
        group: "Sidebar",
        get desc() {
          const position = kv.get("sidebar_position", "right")
          const width = String(clampSidebarWidth(kv.get(SIDEBAR_WIDTH_KEY, SIDEBAR_WIDTH_DEFAULT)))
          return position === "top" || position === "bottom" ? `${width} (unused at ${position})` : width
        },
        slashName: "sidebarWidth",
        run: () => {
          dialog.replace(() => (
            <DialogStepper
              title="Sidebar width"
              value={clampSidebarWidth(kv.get(SIDEBAR_WIDTH_KEY, SIDEBAR_WIDTH_DEFAULT))}
              min={SIDEBAR_WIDTH_MIN}
              max={SIDEBAR_WIDTH_MAX}
              onChange={(value) => kv.set(SIDEBAR_WIDTH_KEY, value)}
            />
          ))
        },
      },
      {
        name: "oc.keybind_preset",
        title: "Keybind layout",
        category: "oc",
        group: "Prompt",
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
                  description:
                    process.platform === "darwin"
                      ? "cmd+m models, cmd+s sessions, ctrl+c never quits"
                      : "ctrl+m models, ctrl+s sessions, ctrl+c never quits",
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
        name: "oc.prompt_tab_action",
        title: "Tab key",
        category: "oc",
        group: "Prompt",
        get desc() {
          const current = kv.get(PROMPT_TAB_KEY, "text")
          return _TAB_OPTIONS.find((option) => option.value === current)?.title ?? "text"
        },
        slashName: "tabKey",
        run: () => {
          dialog.replace(() => (
            <DialogSelect
              title="Tab key"
              current={kv.get(PROMPT_TAB_KEY, "text")}
              options={_TAB_OPTIONS}
              onSelect={(option) => {
                kv.set(PROMPT_TAB_KEY, option.value)
                dialog.clear()
              }}
            />
          ))
        },
      },
      {
        name: "oc.sidebar_button_style",
        title: "Sidebar buttons",
        category: "oc",
        group: "Sidebar",
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
        name: "oc.sidebar_buttons_reset",
        title: "Reset sidebar buttons",
        category: "oc",
        group: "Sidebar",
        desc: "Restore Switch Session, Command Palette, oc Palette, Subagents",
        slashName: "sidebarReset",
        run: () => {
          dialog.clear()
          resetSidebarButtons(tuiConfig, toast)
        },
      },
      {
        name: "oc.subagent_usage",
        get title() {
          return kv.get("subagent_usage_enabled", true) ? "Hide subagent usage" : "Show subagent usage"
        },
        category: "oc",
        group: "Subagents",
        desc: "Context % of each subagent in the prompt bar",
        slashName: "subagentUsage",
        run: () => {
          kv.set("subagent_usage_enabled", !kv.get("subagent_usage_enabled", true))
          dialog.clear()
        },
      },
      {
        // Upstream name, so the `app_toggle_paste_summary` keybind still resolves.
        name: "app.toggle.paste_summary",
        get title() {
          return kv.get(PASTE_SUMMARY_KEY, false) ? "Disable paste summary" : "Enable paste summary"
        },
        category: "oc",
        group: "Prompt",
        desc: "Collapse long pastes in the prompt to a [Pasted ~N lines] placeholder",
        slashName: "pasteSummary",
        run: () => {
          kv.set(PASTE_SUMMARY_KEY, !kv.get(PASTE_SUMMARY_KEY, false))
          dialog.clear()
        },
      },
      {
        name: "oc.image_paste_preview",
        get title() {
          return kv.get(IMAGE_PASTE_PREVIEW_KEY, false) ? "Disable image paste preview" : "Enable image paste preview"
        },
        category: "oc",
        group: "Prompt",
        desc: "Open the image preview when an image is pasted. Clicking an [Image N] chip always previews it",
        slashName: "imagePreview",
        run: () => {
          kv.set(IMAGE_PASTE_PREVIEW_KEY, !kv.get(IMAGE_PASTE_PREVIEW_KEY, false))
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
        group: "Subagents",
        desc: "Rows of tool calls, thinking, and output shown for each running subagent",
        slashName: "subagentRows",
        run: () => {
          dialog.replace(() => (
            <DialogSelect
              title="Subagent live rows"
              current={kv.get("subagent_card_rows", 4)}
              options={[0, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rows) => ({
                value: rows,
                title: rows ? String(rows) : "off",
              }))}
              onSelect={(option) => {
                kv.set("subagent_card_rows", option.value)
                dialog.clear()
              }}
            />
          ))
        },
      },
      {
        name: "oc.subagent_tabs",
        title: "Subagent tabs",
        category: "oc",
        group: "Subagents",
        get desc() {
          return tuiConfig.subagent_tabs.click === "tab" ? "opens in tab" : "opens inline"
        },
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
        name: "oc.font",
        title: "Font",
        category: "oc",
        group: "Appearance",
        get desc() {
          const font: TerminalFont | undefined = kv.get(TERMINAL_FONT_KEY)
          if (!font) return "Terminal default"
          return [font.family, font.weight, font.size && `${font.size}pt`].filter(Boolean).join(" · ")
        },
        slashName: "font",
        run: () => {
          if (detectTerminal().kind !== "wezterm") {
            toast.show({ message: "Font requires WezTerm", variant: "warning" })
            return
          }
          // app.tsx sends the saved value to WezTerm; each pick reopens on the same row.
          const save = (patch: TerminalFont, current: string) => {
            kv.set(TERMINAL_FONT_KEY, { ...kv.get(TERMINAL_FONT_KEY), ...patch })
            show(current)
          }
          const pickFamily = (fonts: FontFamily[], font: TerminalFont) =>
            dialog.replace(() => (
              <DialogSelect
                title="Font family"
                current={font.family}
                options={fonts.map((item) => ({ value: item.name, title: item.name }))}
                onSelect={(option) => {
                  const weights = fonts.find((item) => item.name === option.value)?.weights ?? []
                  const weight = [font.weight, "Regular"].find((item) => item && weights.includes(item)) ?? weights[0]
                  save({ family: option.value, weight }, "family")
                }}
              />
            ))
          const pickWeight = (fonts: FontFamily[], font: TerminalFont) =>
            dialog.replace(() => (
              <DialogSelect
                title="Font weight"
                current={font.weight}
                options={(fonts.find((item) => item.name === font.family)?.weights ?? []).map((weight) => ({
                  value: weight,
                  title: weight,
                }))}
                onSelect={(option) => save({ weight: option.value }, "weight")}
              />
            ))
          const pickSize = (font: TerminalFont) =>
            dialog.replace(() => (
              <DialogPrompt
                title="Font size (pt)"
                value={font.size === undefined ? undefined : String(font.size)}
                placeholder="4 to 48"
                numeric={{ min: 4, max: 48, step: 1 }}
                onConfirm={(value) => {
                  const size = Number(value.trim())
                  if (!Number.isFinite(size) || size < 4 || size > 48) {
                    toast.show({ message: `Font size must be 4 to 48: ${value.trim()}`, variant: "error" })
                    return
                  }
                  save({ size }, "size")
                }}
              />
            ))
          const show = (current?: string) => {
            const font: TerminalFont = kv.get(TERMINAL_FONT_KEY) ?? {}
            dialog.replace(() => (
              <DialogSelect
                title="Font"
                current={current}
                options={[
                  { value: "family", title: `Family: ${font.family ?? "Terminal default"}` },
                  ...(font.family ? [{ value: "weight", title: `Weight: ${font.weight ?? "Regular"}` }] : []),
                  { value: "size", title: `Size: ${font.size ? `${font.size}pt` : "Terminal default"}` },
                  ...(font.size
                    ? [
                        { value: "larger", title: "Size +0.5" },
                        { value: "smaller", title: "Size -0.5" },
                      ]
                    : []),
                  { value: "reset", title: "Reset to terminal default" },
                ]}
                onSelect={async (option) => {
                  if (option.value === "size") return pickSize(font)
                  if (option.value === "larger" || option.value === "smaller") {
                    const size = (font.size ?? 0) + (option.value === "larger" ? 0.5 : -0.5)
                    return save({ size: Math.min(48, Math.max(4, size)) }, option.value)
                  }
                  if (option.value === "reset") {
                    // Sent here too: a tab whose KV predates another tab's pick sees no change to react to.
                    writeTerminalEscape(renderer, fontEscape(undefined))
                    kv.set(TERMINAL_FONT_KEY, undefined)
                    return show("reset")
                  }
                  const fonts = await listMonospaceFonts().catch((cause) => {
                    const message = cause instanceof Error ? cause.message : String(cause)
                    toast.show({ message: `Could not list fonts: ${message}`, variant: "error" })
                  })
                  if (!fonts) return
                  if (option.value === "family") pickFamily(fonts, font)
                  else pickWeight(fonts, font)
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
        group: "Appearance",
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
        name: "oc.link_click",
        get title() {
          return kv.get(LINK_CLICK_KEY, true) ? "Disable click to open links" : "Enable click to open links"
        },
        category: "oc",
        group: "Prompt",
        desc: "Left click a link in chat to open it",
        slashName: "linkClick",
        run: () => {
          kv.set(LINK_CLICK_KEY, !kv.get(LINK_CLICK_KEY, true))
          dialog.clear()
        },
      },
      {
        name: "oc.link_browser",
        title: "Link browser",
        category: "oc",
        group: "Prompt",
        get desc() {
          return kv.get(LINK_BROWSER_KEY) || "system default"
        },
        slashName: "linkBrowser",
        run: async () => {
          const browsers = await scanBrowsers()
          dialog.replace(() => (
            <DialogSelect
              title="Open links with"
              current={kv.get(LINK_BROWSER_KEY, "")}
              options={[
                { value: "", title: "System default" },
                ...browsers.map((browser) => ({ value: browser.path, title: browser.name, description: browser.path })),
              ]}
              onSelect={(option) => {
                kv.set(LINK_BROWSER_KEY, option.value)
                dialog.clear()
              }}
            />
          ))
        },
      },
      {
        name: "oc.bgrun",
        title: "bgRun",
        category: "oc",
        group: "Tools",
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
        group: "Appearance",
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
      {
        name: "oc.daily_theme",
        title: "Daily theme",
        category: "oc",
        group: "Appearance",
        get desc() {
          return tuiConfig.daily_theme ? `on: ${dailyTheme(dayNumber(new Date()))}` : "off"
        },
        slashName: "dailyTheme",
        run: () => {
          dialog.replace(() => (
            <DialogSelect
              title="Daily theme"
              current={tuiConfig.daily_theme}
              options={[
                { value: true, title: "on", description: "Use today's built-in theme, the same for every oc user" },
                { value: false, title: "off", description: "Use your selected theme" },
              ]}
              onSelect={(option) => {
                dialog.clear()
                tuiConfig.setDailyTheme(option.value)
                void persistTuiSetting([DAILY_THEME_KEY], option.value)
                toast.show({
                  message: option.value ? `Daily theme on: ${dailyTheme(dayNumber(new Date()))}` : "Daily theme off",
                  variant: "success",
                })
              }}
            />
          ))
        },
      },
      {
        name: "oc.update_all_harnesses",
        title: "Update all",
        get desc() {
          const labels = targets.filter(isInstalled).map((target) => target.label)
          return labels.length > 0 ? labels.join(", ") : "Nothing oc can update is installed"
        },
        category: "oc",
        group: "Updates",
        run: () => void updateAll(targets, toast, dialog, tuiConfig.auto_confirm_updates),
      },
      ...targets.map((target) => ({
        name: `oc.update_${target.id}`,
        title: `Update ${target.label}`,
        desc: target.desc,
        category: "oc",
        group: "Updates",
        get hidden() {
          return !isInstalled(target)
        },
        run: () => void updateOne(target, toast, dialog, tuiConfig.auto_confirm_updates),
      })),
      {
        name: "oc.update_models",
        title: "Update model list",
        desc: "From the models.dev catalog; not while a session is running",
        category: "oc",
        group: "Updates",
        slashName: "updateModels",
        run: () => void reloadInstance("Model list updated"),
      },
      {
        name: "oc.auto_confirm_updates",
        title: "Auto confirm updates",
        category: "oc",
        group: "Updates",
        get desc() {
          return tuiConfig.auto_confirm_updates ? "on" : "off"
        },
        slashName: "autoConfirmUpdates",
        run: () => {
          dialog.replace(() => (
            <DialogSelect
              title="Auto confirm updates"
              current={tuiConfig.auto_confirm_updates}
              options={[
                {
                  value: true,
                  title: "on",
                  description: "Install right away; can close Claude Desktop, Cursor, and ChatGPT without asking",
                },
                { value: false, title: "off", description: "Ask before installing apps" },
              ]}
              onSelect={(option) => {
                dialog.clear()
                tuiConfig.setAutoConfirmUpdates(option.value)
                try {
                  persistTuiSetting(["auto_confirm_updates"], option.value)
                } catch (cause) {
                  const message = cause instanceof Error ? cause.message : String(cause)
                  toast.show({ message: `Auto confirm updates applied but not saved: ${message}`, variant: "error" })
                  return
                }
                toast.show({ message: `Auto confirm updates ${option.title}`, variant: "success" })
              }}
            />
          ))
        },
      },
      {
        name: "oc.jev_key",
        title: "Jev key",
        category: "oc",
        group: "Tools",
        get desc() {
          return storedJevKey() ? "set" : "not set"
        },
        slashName: "jevKey",
        run: () => {
          const saveKey = () =>
            dialog.replace(() => (
              <DialogPrompt
                title="Jev key"
                placeholder="TypeSafe API key (console.typesafe.ai/keys)"
                onConfirm={async (value) => {
                  const key = value.trim()
                  if (!key) return
                  const result = await sdk.client.auth.set({ providerID: "typesafe", auth: { type: "api", key } })
                  if (result.error) {
                    toast.show({ message: `Failed to save Jev key: ${String(result.error)}`, variant: "error" })
                    return
                  }
                  dialog.clear()
                  toast.show({ message: "Saved Jev key; jev_* tools are on", variant: "success" })
                }}
              />
            ))
          if (!storedJevKey()) return saveKey()
          dialog.replace(() => (
            <DialogSelect
              title="Jev key"
              options={[
                { value: "set", title: "Replace key" },
                {
                  value: "clear",
                  title: "Clear key",
                  description: "TYPESAFE_API_KEY, if set where oc runs, still applies",
                },
              ]}
              onSelect={async (option) => {
                if (option.value === "set") return saveKey()
                const result = await sdk.client.auth.remove({ providerID: "typesafe" })
                if (result.error) {
                  toast.show({ message: `Failed to clear Jev key: ${String(result.error)}`, variant: "error" })
                  return
                }
                dialog.clear()
                toast.show({ message: "Cleared Jev key", variant: "success" })
              }}
            />
          ))
        },
      },
      {
        name: "server.shutdown",
        title: "Shut down",
        desc: "Stop the oc server; this window disconnects",
        category: "oc",
        group: "Server and processes",
        hidden: Global.native,
        run: () => void controlServer("shutdown"),
      },
      {
        name: "server.restart",
        title: "Restart",
        desc: "Restart the oc server; this window reconnects",
        category: "oc",
        group: "Server and processes",
        hidden: Global.native,
        run: () => void controlServer("restart"),
      },
      ...(ProcessTree.identitySupported
        ? [
            {
              name: "oc.killall",
              title: "Kill all AI processes",
              desc:
                "oc, Claude, ChatGPT, Codex, Cursor, and everything they started; logs to " +
                (process.platform === "win32" ? "%LOCALAPPDATA%\\oc\\killall" : "~/.local/share/opencode/killall"),
              slashName: "killall",
              run: async () => {
                const confirmed = await DialogConfirm.show(
                  dialog,
                  "Kill all AI processes",
                  "Stops every oc, opencode, Claude, ChatGPT, Codex, and Cursor process and everything they " +
                    "started, including this window. Unsaved work in those apps is lost.",
                )
                if (!confirmed) return
                dialog.clear()
                launchKillall(["--yes", "--pause"])
              },
            },
            {
              name: "oc.process_report",
              title: "Log AI process report",
              desc: "Same log as Kill all AI processes, stops nothing",
              slashName: "procReport",
              run: () => launchKillall(["--report", "--pause"]),
            },
          ].map((command) => ({ ...command, category: "oc", group: "Server and processes" }))
        : []),
    ],
  }
}

// `oc oc killall` stops this oc too, so it runs in its own window that outlives the TUI: a console on
// Windows, a new WezTerm window when this TUI runs in WezTerm on macOS, otherwise a Terminal.app window.
// Only the oc executable has `oc` commands; a native window hands off to the oc beside it.
function launchKillall(args: string[]) {
  const bun = /^bun(?:\.exe)?$/i.test(path.basename(process.execPath))
  const exe =
    Global.native && !bun
      ? path.join(path.dirname(process.execPath), `oc${path.extname(process.execPath)}`)
      : Global.resolveExecutablePath(process.execPath)
  const command = [...(bun ? [process.argv[1]] : []), "oc", "killall", ...args]
  const env = { OC_FLAVOR: "oc" }
  if (process.platform === "win32") return launchDetached(exe, command, { windowStyle: "Normal", env })
  if (detectTerminal().kind === "wezterm")
    return launchDetached(weztermExecutable(), [
      "cli",
      "spawn",
      "--new-window",
      "--",
      "/usr/bin/env",
      "OC_FLAVOR=oc",
      exe,
      ...command,
    ])
  return launchDetached("osascript", terminalAppScript([exe, ...command], { env }))
}

// Whether a Jev key is saved in auth.json (`typesafe`, read by opencode `tool/jevClient.ts`). The key itself is never shown.
function storedJevKey() {
  try {
    const entry = JSON.parse(fs.readFileSync(path.join(Global.Path.data, "auth.json"), "utf8"))?.typesafe
    return entry?.type === "api" && typeof entry.key === "string" && entry.key.trim() !== ""
  } catch {
    return false
  }
}

// `UTC-05:00` for a zone at the given moment; `longOffset` names UTC itself plain `GMT`.
function utcOffset(zone: string, at: Date) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value
  return name === "GMT" ? "UTC+00:00" : name?.replace("GMT", "UTC")
}
