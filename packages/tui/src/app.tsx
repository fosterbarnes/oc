import { render, TimeToFirstDraw, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { registerOpencodeSpinner } from "./component/register-spinner"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { Deferred, Effect } from "effect"
import { Global } from "@opencode-ai/core/global"
import { DebugConfig } from "@opencode-ai/core/debug-config"
import { Flag } from "@opencode-ai/core/flag/flag"
import { InstallationDisplayVersion, InstallationVersion } from "@opencode-ai/core/installation/version"
import { ClipboardProvider, useClipboard } from "./context/clipboard"
import { ExitProvider, useExit } from "./context/exit"
import { EpilogueProvider } from "./context/epilogue"
import * as Selection from "./util/selection"
import { createCliRenderer, MouseButton } from "@opentui/core"
import { RouteProvider, useRoute } from "./context/route"
import {
  Switch,
  Match,
  createEffect,
  createMemo,
  ErrorBoundary,
  createSignal,
  onMount,
  onCleanup,
  batch,
  Show,
  on,
} from "solid-js"
import { TuiPathsProvider, TuiStartupProvider, TuiTerminalEnvironmentProvider, useTuiStartup } from "./context/runtime"
import { DialogProvider, useDialog } from "./ui/dialog"
import { DialogProvider as DialogProviderList } from "./component/dialog-provider"
import { ErrorComponent } from "./component/error-component"
import { PluginRouteMissing } from "./component/plugin-route-missing"
import { ProjectProvider, useProject } from "./context/project"
import { EditorContextProvider } from "./context/editor"
import { useEvent } from "./context/event"
import { SDKProvider, useSDK } from "./context/sdk"
import { StartupLoading } from "./component/startup-loading"
import { SyncProvider, useSync } from "./context/sync"
import { DataProvider } from "./context/data"
import { LocationProvider } from "./context/location"
import { LocalProvider, useLocal } from "./context/local"
import { PermissionProvider } from "./context/permission"
import { DialogModel } from "./component/dialog-model"
import { useConnected } from "./component/use-connected"
import { DialogMcp } from "./component/dialog-mcp"
import { DialogStatus } from "./component/dialog-status"
import { DialogDebug } from "./component/dialog-debug"
import { DialogThemeList } from "./component/dialog-theme-list"
import { DialogHelp } from "./ui/dialog-help"
import { DialogAgent } from "./component/dialog-agent"
import { DialogSessionList } from "./component/dialog-session-list"
import { DialogWorkspaceList } from "./component/dialog-workspace-list"
import { DialogConsoleOrg } from "./component/dialog-console-org"
import { ThemeProvider, useTheme } from "./context/theme"
import { Home } from "./routes/home"
import { Session } from "./routes/session"
import { PromptHistoryProvider } from "./component/prompt/history"
import { FrecencyProvider } from "./component/prompt/frecency"
import { PromptStashProvider } from "./component/prompt/stash"
import { DialogAlert } from "./ui/dialog-alert"
import { DialogConfirm } from "./ui/dialog-confirm"
import { ToastProvider, useToast, type ToastContext } from "./ui/toast"
import { isDefaultTitle } from "./util/session"
import { KVProvider, useKV } from "./context/kv"
import * as Model from "./util/model"
import { ArgsProvider, useArgs, type Args } from "./context/args"
import open from "open"
import { PromptRefProvider, usePromptRef } from "./context/prompt"
import { TuiConfigProvider, useTuiConfig, type TuiConfig } from "./config"
import { createTuiApiAdapters } from "./plugin/adapters"
import { createTuiApi } from "./plugin/api"
import { createPluginRuntime, PluginRuntimeProvider, usePluginRuntime, type TuiPluginHost } from "./plugin/runtime"
import { CommandPaletteDialog } from "./component/command-palette"
import {
  COMMAND_PALETTE_COMMAND,
  OPENCODE_BASE_MODE,
  OpencodeKeymapProvider,
  registerOpencodeKeymap,
  useBindings,
  useOpencodeKeymap,
} from "./keymap"

import type { EventSource } from "./context/sdk"
import { DialogVariant } from "./component/dialog-variant"
import { DialogPrompt } from "./ui/dialog-prompt"
import { DialogSelect } from "./ui/dialog-select"
import { createTuiAttention } from "./attention"
import * as TuiAudio from "./audio"
import { win32AssertRawMode } from "./terminal-win32"
import { destroyRenderer, writeTerminalEscape } from "./util/renderer"
import { detectTerminal } from "@opencode-ai/core/util/terminal"
import { cliErrorMessage, errorFormat } from "./util/error"
import { spawn } from "node:child_process"
import { launchDetached } from "@opencode-ai/core/util/launch-detached"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

registerOpencodeSpinner()

function ocConfigPath(): string {
  return path.join(Global.Path.config, "oc.json")
}

function resolveOcDirectory(value: unknown, fallback: string) {
  const directory = typeof value === "string" && value.trim() ? value.trim() : fallback
  try {
    return fs.statSync(directory).isDirectory() ? path.normalize(directory) : fallback
  } catch {
    return fallback
  }
}

function readOcConfig(): {
  executable: string
  ocDir: string
  homeDir: string
  homeDirSort: string
  serverStartOnWindowsUserStart: boolean
  revivePath: string
  // False until the first /revive saves the source choice (`revive.build` object or `false`).
  // Without it, /revive asks first (`chooseSource` in `reviveCommands`).
  reviveSourceChosen: boolean
} {
  const fallbackDir = os.homedir()
  const fallbackSort = "name"
  try {
    const parse = (file: string) => {
      const raw = fs.readFileSync(file, "utf8")
      return JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "")) as {
        executable?: unknown
        ocDir?: unknown
        homeDir?: unknown
        homeDirSort?: unknown
        server?: { startOnWindowsUserStart?: unknown }
        revive?: { path?: unknown; build?: unknown }
      }
    }
    const parsed = parse(ocConfigPath())
    const merged = {
      ...parsed,
    }
    const executable = typeof merged.executable === "string" ? merged.executable.trim() : ""
    const ocDir = resolveOcDirectory(merged.ocDir, fallbackDir)
    const homeDir = resolveOcDirectory(merged.homeDir, fallbackDir)
    const sortRaw = typeof merged.homeDirSort === "string" ? merged.homeDirSort.trim().toLowerCase() : fallbackSort
    const homeDirSort = sortRaw === "modified" ? "modified" : "name"
    const serverStartOnWindowsUserStart = merged.server?.startOnWindowsUserStart === true
    const revivePath = typeof merged.revive?.path === "string" ? merged.revive.path.trim() : ""
    const reviveSourceChosen = merged.revive?.build !== undefined
    return { executable, ocDir, homeDir, homeDirSort, serverStartOnWindowsUserStart, revivePath, reviveSourceChosen }
  } catch {
    return {
      executable: "",
      ocDir: fallbackDir,
      homeDir: fallbackDir,
      homeDirSort: fallbackSort,
      serverStartOnWindowsUserStart: false,
      revivePath: "",
      reviveSourceChosen: false,
    }
  }
}
function listOcHomeDirs(): Array<{ name: string; fullPath: string; mtimeMs: number }> {
  // Keep sort/filter aligned with OcConfig.listHomeDirs.
  const { homeDir, homeDirSort } = readOcConfig()
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(homeDir, { withFileTypes: true })
  } catch {
    return []
  }
  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const fullPath = path.join(homeDir, entry.name)
      let mtimeMs = 0
      try {
        mtimeMs = fs.statSync(fullPath).mtimeMs
      } catch {
        mtimeMs = 0
      }
      return { name: entry.name, fullPath, mtimeMs }
    })
  if (homeDirSort === "modified") {
    dirs.sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name))
  } else {
    dirs.sort((a, b) => a.name.localeCompare(b.name))
  }
  return dirs
}

const CROW_SESSION_HANDLE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function readCrowSessionHandleFromEnv(raw = process.env.CROW_SESSION_HANDLE) {
  const value = raw?.trim()
  if (!value || !CROW_SESSION_HANDLE_PATTERN.test(value)) return undefined
  return value.toLowerCase()
}

const validatedCrowSessionHandle = readCrowSessionHandleFromEnv()

/** Commands that require the TUI route session to match expectedOpenCodeSessionID. */
export const crowRemoteSessionScopedCommands = new Set([
  "session.rename",
  "session.compact",
  "session.complete.toggle",
  "session.failed.toggle",
  "agent.cycle",
  "variant.cycle",
  "session.sidebar.toggle",
])

export function mostRecentRootSessionID(
  sessions: ReadonlyArray<{ id: string; parentID?: string; time: { updated: number } }>,
) {
  return sessions
    .filter((session) => session.parentID === undefined)
    .toSorted((left, right) => right.time.updated - left.time.updated)[0]?.id
}

type CrowRouteData =
  | { type: "home" }
  | { type: "session"; sessionID: string }
  | { type: "plugin"; id: string; data?: unknown }

export function acceptsCrowTargetedCommand(input: {
  selfHandle: string | undefined
  eventHandle: string
  command: string
  expectedOpenCodeSessionID: string
  route: CrowRouteData
}) {
  if (!input.selfHandle) return false
  if (input.eventHandle.toLowerCase() !== input.selfHandle) return false
  if (input.command === "session.most_recent") return true
  if (!crowRemoteSessionScopedCommands.has(input.command)) return true
  if (input.route.type !== "session") return false
  return input.route.sessionID === input.expectedOpenCodeSessionID
}

export function handleCrowTargetedCommandExecute(input: {
  selfHandle: string | undefined
  properties: {
    command: string
    crowSessionHandle: string
    expectedOpenCodeSessionID: string
  }
  route: CrowRouteData
  sessions: ReadonlyArray<{ id: string; parentID?: string; time: { updated: number } }>
  dispatchCommand: (command: string) => void
  navigateToSession: (sessionID: string) => void
}) {
  if (
    !acceptsCrowTargetedCommand({
      selfHandle: input.selfHandle,
      eventHandle: input.properties.crowSessionHandle,
      command: input.properties.command,
      expectedOpenCodeSessionID: input.properties.expectedOpenCodeSessionID,
      route: input.route,
    })
  ) {
    return
  }
  if (input.properties.command === "session.most_recent") {
    const sessionID = mostRecentRootSessionID(input.sessions)
    if (!sessionID) return
    input.navigateToSession(sessionID)
    return
  }
  input.dispatchCommand(input.properties.command)
}

function runOcCommand(
  executable: string,
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (chunk) => (stdout += String(chunk)))
    child.stderr?.on("data", (chunk) => (stderr += String(chunk)))
    child.once("error", reject)
    child.once("close", (code) => resolve({ code: code ?? 1, stdout, stderr }))
  })
}

async function bootstrapOcSession(executable: string, directory: string, cwd: string): Promise<string> {
  const result = await runOcCommand(executable, ["session", "bootstrap", directory], cwd)
  if (result.code !== 0) throw new Error(result.stderr.trim() || `exit code ${result.code}`)
  try {
    const payload = JSON.parse(result.stdout) as { sessionID?: unknown }
    if (typeof payload.sessionID !== "string" || !payload.sessionID) throw new Error("bootstrap returned no session ID")
    return payload.sessionID
  } catch (error) {
    throw new Error(`invalid bootstrap response: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function persistOcConfig(
  key:
    | "ocDir"
    | "homeDir"
    | "homeDirSort"
    | "sessionModel"
    | "sessionAgent"
    | "defaultSubagent"
    | "defaultSubagentModel"
    | "reasoningEffort"
    | "serverStartOnWindowsUserStart",
  value: string,
  toast: ToastContext,
) {
  const config = readOcConfig()
  if (!config.executable) {
    toast.show({ message: "OpenCode executable is not configured", variant: "error" })
    return Promise.resolve(false)
  }
  const args = ["oc", "config", "set", key, value]
  const child = spawn(config.executable, args, {
    stdio: ["ignore", "ignore", "pipe"],
    cwd: os.homedir(),
    env: Global.Path.debug ? { ...process.env, OPENCODE_INSTANCE: "debug" } : process.env,
  })
  let error = ""
  return new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (success: boolean) => {
      if (settled) return
      settled = true
      resolve(success)
    }
    child.stderr?.on("data", (chunk) => {
      error += String(chunk)
    })
    child.on("error", (cause) => {
      toast.show({ message: `Failed to set oc setting: ${cause.message}`, variant: "error" })
      finish(false)
    })
    child.on("exit", (code) => {
      if (code === 0) {
        toast.show({ message: `Saved oc setting ${key}: ${value}`, variant: "success" })
        finish(true)
        return
      }
      toast.show({ message: `Failed to set oc setting: ${error.trim() || `exit code ${code}`}`, variant: "error" })
      finish(false)
    })
  })
}

// Built-in revive restarts oc and its terminal (OcConfig.revive); `revive.path` still overrides /revive-no-install.
function reviveCommands(toast: ToastContext) {
  const config = readOcConfig()
  const route = useRoute()
  const sync = useSync()
  const sdk = useSDK()
  const local = useLocal()
  const exit = useExit()
  const dialog = useDialog()
  // Saved before launch, while this server still runs. A no-reply message costs no tokens until
  // the next prompt; synthetic text then reaches the model, and the session view draws a divider.
  // Carries the current agent/model because the reopened prompt seeds them from the last user message.
  const mark = async () => {
    if (route.data.type !== "session") return
    const at = new Date()
    const time = at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    // Same oc version as the sidebar footer; InstallationVersion is the incorporated upstream release.
    const versions = `oc v${InstallationDisplayVersion.split("-")[0]} . OpenCode v${InstallationVersion}`
    const result = await sdk.client.session.prompt({
      sessionID: route.data.sessionID,
      directory: sync.session.get(route.data.sessionID)?.directory,
      agent: local.agent.current()?.name,
      model: local.model.current(),
      variant: local.model.variant.current(),
      noReply: true,
      parts: [{
        type: "text",
        text: `[oc revived at ${time} . ${versions}]`,
        synthetic: true,
        metadata: { kind: "revive", versions, at: at.getTime() },
      }],
    })
    if (result.error) toast.error(new Error(`Failed to mark revive: ${JSON.stringify(result.error)}`))
  }
  // First /revive: where oc's source comes from. Building and installing need git (download) and Bun.
  const chooseSource = async (): Promise<Source | undefined> => {
    const kind = await new Promise<Source["source"] | undefined>((resolve) => dialog.replace(() => (
      <DialogSelect
        title="Run oc from its source code?"
        renderFilter={false}
        options={[
          { value: "existing" as const, title: "Use my oc source folder", description: "build from it" },
          { value: "download" as const, title: "Download the oc source to...", description: "your copy to edit" },
          { value: "none" as const, title: "Just restart", description: "no build" },
        ]}
        onSelect={(option) => resolve(option.value)}
      />
    ), () => resolve(undefined)))
    if (kind === undefined) return
    if (kind === "none") return { source: "none" }
    const input = await DialogPrompt.show(dialog,
      kind === "existing" ? "oc source folder" : "Download the oc source to", {
        placeholder: "C:\\path\\to\\oc",
        value: kind === "download" ? path.join(Global.Path.data, "source") : "",
      })
    if (!input?.trim()) return
    const sourceDir = path.resolve(input.trim().replace(/^"(.*)"$/, "$1"))
    // Revive.BUILD_SCRIPT: the build script /revive runs.
    if (kind === "existing" && !fs.existsSync(path.join(sourceDir, "packages", "opencode", "script", "build.ts"))) {
      toast.show({ message: `Not an oc source folder (no packages\\opencode\\script\\build.ts): ${sourceDir}`,
        variant: "error" })
      return
    }
    return { source: kind, sourceDir }
  }
  // Context shape: Revive.ReviveContext in packages/opencode/src/config/revive.ts.
  type Source = { source: "existing" | "download"; sourceDir: string } | { source: "none" }
  const revive = async (mode: "install" | "no-install", source?: Source) => {
    await mark()
    const sessionID = route.data.type === "session" ? route.data.sessionID : undefined
    const terminal = detectTerminal()
    const context = {
      mode,
      terminal: terminal.kind,
      directory: (sessionID ? sync.session.get(sessionID)?.directory : undefined) ?? sdk.directory ?? process.cwd(),
      ...(sessionID ? { sessionID } : {}),
      ...(terminal.kind === "wezterm" && terminal.paneID ? { paneID: terminal.paneID } : {}),
      ...source,
    }
    // Hosted by an `oc`/`occ` launcher: hand off and exit, so it shows revive progress in this window
    // (Revive.handoffPath). Otherwise a hidden helper runs the same pipeline.
    const supervisor = process.env.OC_SUPERVISOR_PID
    if (supervisor) {
      const file = path.join(Global.Path.state, "oc-revive", `${supervisor}.json`)
      return fs.promises.mkdir(path.dirname(file), { recursive: true })
        .then(() => fs.promises.writeFile(file, JSON.stringify(context)))
        .then(() => exit(), (error) => toast.error(error))
    }
    launchDetached(process.execPath, [
      ...(/^bun(?:\.exe)?$/i.test(path.basename(process.execPath)) ? [process.argv[1]] : []),
      "oc", "--revive", Buffer.from(JSON.stringify(context)).toString("base64url"),
    ]).once("error", (error) => toast.error(error))
      .once("exit", (code) => {
        if (code) toast.error(new Error(`Revive helper launch failed: exit code ${code}`))
      })
  }
  return [
    {
      name: "oc.revive_no_install",
      title: "Revive oc without installing",
      category: "System",
      slashName: "revive-no-install",
      run: async () => {
        if (!config.revivePath) return revive("no-install")
        await mark()
        launchDetached(config.revivePath)
      },
    },
    {
      name: "oc.revive",
      title: "Revive oc",
      category: "System",
      slashName: "revive",
      run: async () => {
        // Read fresh: the first /revive saves the source choice to oc.json (revive.build).
        if (readOcConfig().reviveSourceChosen) return revive("install")
        const choice = await chooseSource()
        if (!choice) return
        dialog.clear()
        return revive("install", choice)
      },
    },
  ]
}

const appGlobalBindingCommands = [
  "session.list",
  "session.new",
  "session.quick_switch.1",
  "session.quick_switch.2",
  "session.quick_switch.3",
  "session.quick_switch.4",
  "session.quick_switch.5",
  "session.quick_switch.6",
  "session.quick_switch.7",
  "session.quick_switch.8",
  "session.quick_switch.9",
  "selection.copy_mode.toggle",
] as const

const appBindingCommands = [
  "command.palette.show",
  "oc.settings_palette",
  "oc.new_session",
  "model.default",
  "oc.reasoning_effort",
  "agent.session",
  "agent.default_subagent",
  "agent.default_subagent_model",
  "oc.home_dir",
  "oc.oc_dir",
  "oc.home_dir_sort",
  "model.list",
  "model.cycle_recent",
  "model.cycle_recent_reverse",
  "model.cycle_favorite",
  "model.cycle_favorite_reverse",
  "agent.list",
  "mcp.list",
  "agent.cycle",
  "agent.cycle.reverse",
  "variant.cycle",
  "variant.list",
  "provider.connect",
  "console.org.switch",
  "opencode.status",
  "opencode.debug",
  "opencode.debug_logging",
  "theme.switch",
  "theme.switch_mode",
  "theme.mode.lock",
  "help.show",
  "docs.open",
  "diff.open",
  "workspace.list",
  "app.debug",
  "app.console",
  "app.heap_snapshot",
  "terminal.suspend",
  "terminal.title.toggle",
  "app.toggle.animations",
  "app.toggle.file_context",
  "app.toggle.diffwrap",
  "app.toggle.paste_summary",
] as const

export type TuiInput = {
  url: string
  args: Args
  config: TuiConfig.Resolved
  onSnapshot?: () => Promise<string[]>
  onSessionChange?: (sessionID: string) => void
  directory?: string
  fetch?: typeof fetch
  headers?: RequestInit["headers"]
  events?: EventSource
  pluginHost: TuiPluginHost
}

function errorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "object" &&
    error.data !== null &&
    "message" in error.data &&
    typeof error.data.message === "string"
  ) {
    return error.data.message
  }
  return error instanceof Error ? error.message : String(error)
}

function isVersionGreater(left: string, right: string) {
  const parse = (value: string) => {
    const [core, prerelease] = value.replace(/^v/, "").split("-", 2)
    return { core: core.split(".").map((part) => Number.parseInt(part, 10) || 0), prerelease }
  }
  const a = parse(left)
  const b = parse(right)
  for (let index = 0; index < Math.max(a.core.length, b.core.length); index++) {
    const difference = (a.core[index] ?? 0) - (b.core[index] ?? 0)
    if (difference) return difference > 0
  }
  if (a.prerelease === b.prerelease) return false
  if (!a.prerelease) return true
  if (!b.prerelease) return false
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true }) > 0
}

export const run = Effect.fn("Tui.run")(function* (input: TuiInput) {
  const global = yield* Global.Service
  const exit = { epilogue: undefined as string | undefined, reason: undefined as unknown }
  const result = yield* Effect.scoped(
    Effect.gen(function* () {
      const renderer = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () =>
            createCliRenderer({
              externalOutputMode: "passthrough",
              targetFps: 60,
              gatherStats: false,
              exitOnCtrlC: false,
              useKittyKeyboard: {},
              autoFocus: false,
              openConsoleOnError: false,
              useMouse: !Flag.OPENCODE_DISABLE_MOUSE && input.config.mouse,
              consoleOptions: {
                keyBindings: [{ name: "y", ctrl: true, action: "copy-selection" }],
              },
            }),
          catch: (error) => (error instanceof Error ? error : new Error(String(error))),
        }),
        (renderer) =>
          Effect.sync(() => {
            destroyRenderer(renderer)
          }),
      )
      const terminal = detectTerminal()
      const ledgerPath = path.join(global.state, "oc-tuis", `${process.pid}.json`)
      // The ledger only scopes revive/shutdown to this instance; failing to write it must not stop the TUI.
      yield* Effect.acquireRelease(
        Effect.try({
          try: () => {
            fs.mkdirSync(path.dirname(ledgerPath), { recursive: true })
            fs.writeFileSync(ledgerPath, JSON.stringify({
              pid: process.pid,
              instance: Global.Path.app,
              executable: Global.resolveExecutablePath(process.execPath),
              startedAt: Date.now() - process.uptime() * 1000,
              ...(terminal.kind === "wezterm" && terminal.paneID ? { paneID: terminal.paneID } : {}),
            }))
          },
          catch: (error) => error,
        }).pipe(Effect.ignore),
        () => Effect.sync(() => fs.rmSync(ledgerPath, { force: true })),
      )
      win32AssertRawMode()
      const keymap = createDefaultOpenTuiKeymap(renderer)
      yield* Effect.acquireRelease(
        Effect.sync(() => registerOpencodeKeymap(keymap, renderer, input.config)),
        (unregister) => Effect.sync(unregister),
      )
      yield* Effect.addFinalizer(() =>
        Effect.promise(async () => {
          try {
            await input.pluginHost.dispose()
          } catch (error) {
            console.error("Failed to dispose TUI plugins", error)
          }
        }),
      )
      yield* Effect.addFinalizer(() => Effect.sync(TuiAudio.dispose))
      const shutdown = yield* Deferred.make<unknown>()
      const onSighup = () => destroyRenderer(renderer)
      yield* Effect.acquireRelease(
        Effect.sync(() => process.on("SIGHUP", onSighup)),
        () => Effect.sync(() => process.off("SIGHUP", onSighup)),
      )
      renderer.once("destroy", () => Deferred.doneUnsafe(shutdown, Effect.void))
      const pluginRuntime = createPluginRuntime()

      yield* Effect.tryPromise(async () => {
        // Prewarm palette before ThemeProvider mounts so `system` theme avoids a first-paint fallback flash.
        void renderer.getPalette({ size: 16 }).catch(() => undefined)
        const mode = (await renderer.waitForThemeMode(1000)) ?? "dark"
        if (renderer.isDestroyed) return

        await render(() => {
          return (
            <ExitProvider
              exit={(reason) => {
                if (renderer.isDestroyed) return
                exit.reason = reason
                destroyRenderer(renderer)
              }}
            >
              <EpilogueProvider set={(value) => (exit.epilogue = value)}>
                <ErrorBoundary fallback={(error, reset) => <ErrorComponent error={error} reset={reset} mode={mode} />}>
                  <TuiPathsProvider
                    value={{
                      cwd: process.cwd(),
                      home: global.home,
                      state: global.state,
                      worktree: global.data + "/worktree",
                    }}
                  >
                    <TuiTerminalEnvironmentProvider
                      value={{
                        platform: process.platform,
                        multiplexer: process.env.TMUX ? "tmux" : process.env.STY ? "screen" : undefined,
                        displayServer: process.env.WAYLAND_DISPLAY
                          ? "wayland"
                          : process.env.DISPLAY
                            ? "x11"
                            : undefined,
                      }}
                    >
                      <TuiStartupProvider
                        value={{
                          initialRoute: process.env.OPENCODE_ROUTE ? JSON.parse(process.env.OPENCODE_ROUTE) : undefined,
                          skipInitialLoading: Boolean(process.env.OPENCODE_FAST_BOOT),
                        }}
                      >
                        <ClipboardProvider>
                          <OpencodeKeymapProvider keymap={keymap}>
                            <ArgsProvider {...input.args}>
                              <KVProvider>
                                <ToastProvider>
                                  <RouteProvider
                                    onSessionChange={input.onSessionChange}
                                    initialRoute={
                                      input.args.continue
                                        ? {
                                            type: "session",
                                            sessionID: "dummy",
                                          }
                                        : undefined
                                    }
                                  >
                                    <TuiConfigProvider config={input.config}>
                                      <PluginRuntimeProvider value={pluginRuntime}>
                                        <SDKProvider
                                          url={input.url}
                                          directory={input.directory}
                                          fetch={input.fetch}
                                          headers={input.headers}
                                          events={input.events}
                                        >
                                          <PermissionProvider>
                                            <ProjectProvider>
                                              <SyncProvider>
                                                <DataProvider>
                                                  <ThemeProvider mode={mode}>
                                                    <LocalProvider>
                                                      <PromptStashProvider>
                                                        <DialogProvider>
                                                          <FrecencyProvider>
                                                            <PromptHistoryProvider>
                                                              <PromptRefProvider>
                                                                <EditorContextProvider>
                                                                  <LocationProvider>
                                                                    <App
                                                                      onSnapshot={input.onSnapshot}
                                                                      pluginHost={input.pluginHost}
                                                                    />
                                                                  </LocationProvider>
                                                                </EditorContextProvider>
                                                              </PromptRefProvider>
                                                            </PromptHistoryProvider>
                                                          </FrecencyProvider>
                                                        </DialogProvider>
                                                      </PromptStashProvider>
                                                    </LocalProvider>
                                                  </ThemeProvider>
                                                </DataProvider>
                                              </SyncProvider>
                                            </ProjectProvider>
                                          </PermissionProvider>
                                        </SDKProvider>
                                      </PluginRuntimeProvider>
                                    </TuiConfigProvider>
                                  </RouteProvider>
                                </ToastProvider>
                              </KVProvider>
                            </ArgsProvider>
                          </OpencodeKeymapProvider>
                        </ClipboardProvider>
                      </TuiStartupProvider>
                    </TuiTerminalEnvironmentProvider>
                  </TuiPathsProvider>
                </ErrorBoundary>
              </EpilogueProvider>
            </ExitProvider>
          )
        }, renderer)
      })
      yield* Deferred.await(shutdown)
      return { epilogue: exit.epilogue, reason: exit.reason }
    }),
  )
  yield* Effect.sync(() => {
    if (result.reason !== undefined)
      process.stderr.write((cliErrorMessage(result.reason) ?? errorFormat(result.reason)) + "\n")
    if (result.epilogue) process.stdout.write(result.epilogue + "\n")
  })
})

function App(props: { onSnapshot?: () => Promise<string[]>; pluginHost: TuiPluginHost }) {
  const startup = useTuiStartup()
  const tuiConfig = useTuiConfig()
  const route = useRoute()
  const dimensions = useTerminalDimensions()
  const renderer = useRenderer()
  const dialog = useDialog()
  const local = useLocal()
  const kv = useKV()
  const keymap = useOpencodeKeymap()
  const event = useEvent()
  const sdk = useSDK()
  const toast = useToast()
  const themeState = useTheme()
  const { theme, mode, setMode, locked, lock, unlock } = themeState
  const sync = useSync()
  const project = useProject()
  const exit = useExit()
  const promptRef = usePromptRef()
  const pluginRuntime = usePluginRuntime()
  const attention = createTuiAttention({ renderer, config: tuiConfig, kv })
  const clipboard = useClipboard()
  const copyOnSelect = () => kv.get(Selection.COPY_ON_SELECT_KEY, Selection.defaultCopyOnSelect()) as boolean
  createEffect(() => {
    sync.restart.recoveryEpoch
    if (!sync.restart.pending) promptRef.requestFocus()
  })
  onMount(() => {
    void sdk.debugLogging
      .get()
      .then((enabled) => kv.set("debug_logging", enabled))
      .catch(() => {})
  })
  const controlServer = async (action: "shutdown" | "restart") => {
    const restart = action === "restart"
    const choice = await DialogConfirm.show(
      dialog,
      restart ? "Restart Server" : "Shut Down Server",
      restart
        ? "The TUI will reconnect after the server restarts. Continue?"
        : "The current TUI will disconnect when the server shuts down. Continue?",
      "cancel",
    )
    if (choice !== true) return
    dialog.clear()
    // post-replacement recovery gating: capture epoch before replacement
    const epochBefore = (sync.restart as unknown as { epoch?: number }).epoch
    if (restart) sync.restart.begin()
    try {
      const result = restart ? await sdk.client.global.restart() : await sdk.client.global.shutdown()
      if (!result.error) return
      // stale timer/renderable protection: only cancel if epoch hasn't advanced
      const epochNow = (sync.restart as unknown as { epoch?: number }).epoch
      if (restart && epochBefore !== undefined && epochNow !== undefined && epochBefore + 1 !== epochNow) {
        // epoch already advanced by another recovery, don't disturb
      } else if (restart) sync.restart.cancel()
      if (renderer.isDestroyed) return
      toast.show({
        title: restart ? "Server Restart Failed" : "Server Shutdown Failed",
        message: errorMessage(result.error),
        variant: "error",
        duration: 10000,
      })
    } catch (error) {
      const epochNow = (sync.restart as unknown as { epoch?: number }).epoch
      if (restart && epochBefore !== undefined && epochNow !== undefined && epochBefore + 1 !== epochNow) {
      } else if (restart) sync.restart.cancel()
      if (renderer.isDestroyed) return
      toast.show({
        title: restart ? "Server Restart Failed" : "Server Shutdown Failed",
        message: errorMessage(error),
        variant: "error",
        duration: 10000,
      })
    }
  }

  createEffect(() => {
    if (!kv.ready) return
    if (kv.store[Selection.COPY_ON_SELECT_KEY] !== undefined) return
    const seeded = Selection.envCopyOnSelectSeed()
    if (seeded === undefined) return
    kv.set(Selection.COPY_ON_SELECT_KEY, seeded)
  })

  const api = createTuiApi(
    createTuiApiAdapters({
      version: InstallationVersion,
      // Custom fork: only the TUI presentation uses the maintenance display value.
      displayVersion: InstallationDisplayVersion,
      tuiConfig,
      dialog,
      keymap,
      kv,
      route,
      routes: pluginRuntime.routes,
      event,
      sdk,
      sync,
      theme: themeState,
      toast,
      renderer,
      attention,
      currentModel: local.model.current,
      Slot: pluginRuntime.Slot,
    }),
  )
  const [ready, setReady] = createSignal(false)
  props.pluginHost
    .start({
      api,
      config: tuiConfig,
      runtime: pluginRuntime,
      dispose: () => attention.dispose(),
    })
    .catch((error) => {
      console.error("Failed to load TUI plugins", error)
    })
    .finally(() => {
      setReady(true)
    })

  // Let selection copy/dismiss win ahead of normal bindings when explicit copy is required.
  const offSelectionKeys = keymap.intercept(
    "key",
    ({ event }) => {
      if (copyOnSelect()) return
      Selection.handleSelectionKey(renderer, toast, event, clipboard)
    },
    { priority: 1 },
  )
  onCleanup(() => {
    offSelectionKeys()
    attention.dispose()
  })

  // Wire up console copy-to-clipboard via opentui's onCopySelection callback
  renderer.console.onCopySelection = async (text: string) => {
    if (!text || text.length === 0) return

    await clipboard
      .write?.(text)
      .then(() => toast.show({ message: "Copied to clipboard", variant: "info" }))
      .catch(toast.error)

    renderer.clearSelection()
  }
  const [terminalTitleEnabled, setTerminalTitleEnabled] = createSignal(kv.get("terminal_title_enabled", true))
  const terminal = detectTerminal()
  const terminalTabState = { progress: 0, color: "" }
  const [pasteSummaryEnabled, setPasteSummaryEnabled] = createSignal(
    kv.get("paste_summary_enabled", !sync.data.config.experimental?.disable_paste_summary),
  )

  // Update terminal window title based on current route and session
  createEffect(() => {
    const titleEnabled = terminalTitleEnabled() && !Flag.OPENCODE_DISABLE_TERMINAL_TITLE
    const tabEnabled = titleEnabled && kv.get("terminal_tab_agent_enabled", true)
    const session = route.data.type === "session" ? sync.session.get(route.data.sessionID) : undefined
    const status = route.data.type === "session" ? sync.data.session_status[route.data.sessionID]?.type : undefined
    // Error ring only when the latest turn actually failed; aborts and the sticky "failed" mark do not count.
    const lastError =
      route.data.type === "session"
        ? (sync.data.message[route.data.sessionID] ?? []).findLast((message) => message.role === "assistant")?.error
        : undefined
    const failed = lastError !== undefined && lastError.name !== "MessageAbortedError"
    const progress = !tabEnabled ? 0 : status === "busy" || status === "retry" ? 3 : failed ? 2 : 0
    if (progress !== terminalTabState.progress) {
      writeTerminalEscape(renderer, `\x1b]9;4;${progress}\x1b\\`)
      terminalTabState.progress = progress
    }
    const agent = local.agent.current()
    const color = tabEnabled && route.data.type !== "plugin" && agent ? local.agent.color(agent.name).toInts() : undefined
    const hex = color ? `#${color.slice(0, 3).map((channel) => channel.toString(16).padStart(2, "0")).join("")}` : ""
    if (terminal.kind === "wezterm" && hex !== terminalTabState.color) {
      writeTerminalEscape(renderer, `\x1b]1337;SetUserVar=oc_agent_color=${Buffer.from(hex).toString("base64")}\x07`)
      terminalTabState.color = hex
    }
    if (!titleEnabled) return
    // Plain ■ renders everywhere; WezTerm (with the oc tab snippet) colors it via oc_agent_color.
    const prefix = color ? "■ " : ""

    if (route.data.type === "home") {
      renderer.setTerminalTitle(`${prefix}OpenCode`)
      return
    }

    if (route.data.type === "session") {
      if (!session || isDefaultTitle(session.title)) {
        renderer.setTerminalTitle(`${prefix}OpenCode`)
        return
      }

      const title = session.title.length > 40 ? session.title.slice(0, 37) + "..." : session.title
      renderer.setTerminalTitle(`${prefix}${title}`)
      return
    }

    if (route.data.type === "plugin") {
      renderer.setTerminalTitle(route.data.id)
    }
  })

  const args = useArgs()
  onMount(() => {
    batch(() => {
      if (args.agent) local.agent.set(args.agent)
      if (args.model) {
        const { providerID, modelID } = Model.parse(args.model)
        if (!providerID || !modelID)
          return toast.show({
            variant: "warning",
            message: `Invalid model format: ${args.model}`,
            duration: 3000,
          })
        local.model.set({ providerID, modelID }, { recent: true })
      }
      if (args.sessionID && !args.fork) {
        route.navigate({ type: "session", sessionID: args.sessionID })
      }
    })
    if (args.palette) {
      const title = args.palette.trim()
      setTimeout(() => {
        if (renderer.isDestroyed) return
        const entry = keymap
          .getCommandEntries({ namespace: "palette", visibility: "reachable" })
          .find((e) => (e.command.hidden !== true && e.command.name !== COMMAND_PALETTE_COMMAND ? (e.command.title as string) === title : false))
        if (entry) keymap.dispatchCommand(entry.command.name)
        else
          toast.show({
            variant: "error",
            message: `Palette entry not found: ${title}`,
            duration: 5000,
          })
      }, 0)
    }
  })

  let continued = false
  createEffect(() => {
    // When using -c, session list is loaded in blocking phase, so we can navigate at "partial"
    if (continued || sync.status === "loading" || !args.continue) return
    const match = sync.data.session
      .toSorted((a, b) => b.time.updated - a.time.updated)
      .find((x) => x.parentID === undefined)?.id
    if (match) {
      continued = true
      if (args.fork) {
        void sdk.client.session.fork({ sessionID: match }).then((result) => {
          if (result.data?.id) {
            route.navigate({ type: "session", sessionID: result.data.id })
          } else {
            toast.show({ message: "Failed to fork session", variant: "error" })
          }
        })
      } else {
        route.navigate({ type: "session", sessionID: match })
      }
    }
  })

  // Handle --session with --fork: wait for sync to be fully complete before forking
  // (session list loads in non-blocking phase for --session, so we must wait for "complete"
  // to avoid a race where reconcile overwrites the newly forked session)
  let forked = false
  createEffect(() => {
    if (forked || sync.status !== "complete" || !args.sessionID || !args.fork) return
    forked = true
    void sdk.client.session.fork({ sessionID: args.sessionID }).then((result) => {
      if (result.data?.id) {
        route.navigate({ type: "session", sessionID: result.data.id })
      } else {
        toast.show({ message: "Failed to fork session", variant: "error" })
      }
    })
  })

  createEffect(
    on(
      () => sync.status === "complete" && sync.data.provider.length === 0,
      (isEmpty, wasEmpty) => {
        // only trigger when we transition into an empty-provider state
        if (!isEmpty || wasEmpty) return
        dialog.replace(() => <DialogProviderList />)
      },
    ),
  )

  const connected = useConnected()
  const currentWorktreeWorkspace = createMemo(() => {
    const workspaceID = project.workspace.current()
    if (!workspaceID) return
    const workspace = project.workspace.get(workspaceID)
    if (workspace?.type !== "worktree" || !workspace.directory) return
    return workspace
  })
  const appCommands = createMemo(() =>
    [
      {
        name: COMMAND_PALETTE_COMMAND,
        title: "Show command palette",
        category: "System",
        hidden: true,
        run: () => {
          dialog.replace(() => <CommandPaletteDialog />)
        },
      },
      {
        name: "oc.settings_palette",
        title: "Show oc commands",
        category: "oc",
        hidden: true,
        run: () => {
          dialog.replace(() => <CommandPaletteDialog category="oc" />)
        },
      },
      ...reviveCommands(toast),
      {
        name: "session.list",
        title: "Switch session",
        category: "Session",
        suggested: sync.data.session.length > 0,
        slashName: "sessions",
        slashAliases: ["resume", "continue"],
        run: () => {
          dialog.replace(() => <DialogSessionList />)
        },
      },
      {
        name: "session.new",
        title: "New session",
        suggested: route.data.type === "session",
        category: "Session",
        slashName: "new",
        slashAliases: ["clear"],
        run: () => {
          route.navigate({
            type: "home",
          })
          dialog.clear()
        },
      },
      {
        name: "workspace.copy_path",
        title: "Copy worktree path",
        category: "Workspace",
        enabled: () => currentWorktreeWorkspace() !== undefined,
        run: async () => {
          const workspace = currentWorktreeWorkspace()
          if (!workspace?.directory) return
          await clipboard
            .write?.(workspace.directory)
            .then(() => toast.show({ message: "Copied worktree path", variant: "info" }))
            .catch(toast.error)
          dialog.clear()
        },
      },
      {
        name: "workspace.list",
        title: "Manage workspaces",
        category: "Workspace",
        hidden: !Flag.OPENCODE_EXPERIMENTAL_WORKSPACES,
        slashName: "workspaces",
        run: () => {
          dialog.replace(() => <DialogWorkspaceList />)
        },
      },
      ...Array.from({ length: 9 }, (_, i) => ({
        name: `session.quick_switch.${i + 1}`,
        title: `Switch to session in quick slot ${i + 1}`,
        category: "Session",
        hidden: true,
        run: () => {
          local.session.quickSwitch(i + 1)
        },
      })),
      {
        name: "model.list",
        title: "Switch model",
        suggested: true,
        category: "Agent",
        slashName: "models",
        // Bias /mo toward /models over /move without changing global fuzzy scoring.
        slashAliases: ["mo"],
        run: () => {
          dialog.replace(() => <DialogModel />)
        },
      },
      {
        name: "model.cycle_recent",
        title: "Model cycle",
        category: "Agent",
        hidden: true,
        run: () => {
          void local.model.cycle(1)
        },
      },
      {
        name: "model.cycle_recent_reverse",
        title: "Model cycle reverse",
        category: "Agent",
        hidden: true,
        run: () => {
          void local.model.cycle(-1)
        },
      },
      {
        name: "model.cycle_favorite",
        title: "Favorite cycle",
        category: "Agent",
        hidden: true,
        run: () => {
          void local.model.cycleFavorite(1)
        },
      },
      {
        name: "model.cycle_favorite_reverse",
        title: "Favorite cycle reverse",
        category: "Agent",
        hidden: true,
        run: () => {
          void local.model.cycleFavorite(-1)
        },
      },
      {
        name: "agent.list",
        title: "Switch agent",
        category: "Agent",
        slashName: "agents",
        run: () => {
          dialog.replace(() => <DialogAgent />)
        },
      },
      {
        name: "oc.new_session",
        title: "New oc session",
        category: "oc",
        slashName: "newOcSession",
        run: () => {
          const dirs = listOcHomeDirs()
          if (dirs.length === 0) {
            const { homeDir } = readOcConfig()
            toast.show({ message: `No folders found in ${homeDir}`, variant: "error" })
            return
          }
          dialog.replace(() => (
            <DialogSelect
              title="New oc session"
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
                const { executable } = readOcConfig()
                if (!executable) {
                  toast.show({ message: "OpenCode executable is not configured", variant: "error" })
                  return
                }
                try {
                  const sessionID = await bootstrapOcSession(executable, directory, os.homedir())
                  dialog.clear()
                  route.navigate({ type: "session", sessionID })
                } catch (error) {
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
      {
        name: "model.default",
        title: "Set default model",
        category: "oc",
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
        name: "oc.reasoning_effort",
        title: "Set default reasoning",
        category: "oc",
        slashName: "reasoningEffort",
        run: () => {
          dialog.replace(() => (
            <DialogSelect
              title="Default reasoning effort"
              options={[
                { value: "low", title: "low" },
                { value: "medium", title: "medium" },
                { value: "high", title: "high" },
                { value: "xhigh", title: "xhigh" },
                { value: "max", title: "max" },
              ]}
              onSelect={(option) => {
                void persistOcConfig("reasoningEffort", option.value, toast)
                dialog.clear()
              }}
            />
          ))
        },
      },
      {
        name: "agent.session",
        title: "Set default agent",
        category: "oc",
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
        name: "agent.default_subagent_model",
        title: "Set default sub-agent model",
        category: "oc",
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
              onSelect={async (providerID, modelID) => {
                const model = `${providerID}/${modelID}`
                const result = await sdk.client.global.config.update({
                  config: { agent: { [defaultSubagent]: { model } } },
                })
                if (result.error) {
                  toast.show({
                    message: `Failed to set native default sub-agent model: ${String(result.error)}`,
                    variant: "error",
                  })
                  return
                }
                await persistOcConfig("defaultSubagentModel", model, toast)
              }}
            />
          ))
        },
      },
      {
        name: "agent.default_subagent",
        title: "Set default sub-agent agent",
        category: "oc",
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
              title="Set default sub-agent agent"
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
                if (await persistOcConfig("defaultSubagent", option.value, toast)) dialog.clear()
              }}
            />
          ))
        },
      },
      {
        name: "oc.home_dir",
        title: "Home directory",
        category: "oc",
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
        title: "Home directory sort order",
        category: "oc",
        slashName: "homeDirSort",
        run: () => {
          dialog.replace(() => (
            <DialogSelect
              title="Home directory sort order"
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
        title: "OC directory",
        category: "oc",
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
        title: "Server auto-start",
        category: "oc",
        slashName: "serverStartOnWindowsUserStart",
        run: () => {
          const current = readOcConfig().serverStartOnWindowsUserStart
          dialog.replace(() => (
            <DialogSelect
              title="Server auto-start"
              current={current ? "true" : "false"}
              options={[
                { value: "true", title: "on" },
                { value: "false", title: "off" },
              ]}
              onSelect={(option) => {
                void persistOcConfig("serverStartOnWindowsUserStart", option.value, toast)
                dialog.clear()
              }}
            />
          ))
        },
      },
      {
        name: "server.shutdown",
        title: "Shut Down",
        category: "oc",
        hidden: process.env.OC_STABLE === "1",
        run: () => void controlServer("shutdown"),
      },
      {
        name: "server.restart",
        title: "Restart",
        category: "oc",
        hidden: process.env.OC_STABLE === "1",
        run: () => void controlServer("restart"),
      },
      {
        name: "oc.import_production_config",
        title: "Import production settings into debug",
        category: "oc",
        hidden: !Global.Path.debug,
        slashName: "importProductionConfig",
        run: async () => {
          try {
            const copied = await DebugConfig.syncFromProduction({ overwrite: true, serverPort: 4097 })
            toast.show({
              message: copied.length
                ? `Imported production settings (${copied.join(", ")}). Restart ocdebug to apply them.`
                : "No production settings were found to import",
              variant: copied.length ? "success" : "warning",
            })
          } catch (error) {
            toast.show({
              message: `Failed to import production settings: ${error instanceof Error ? error.message : String(error)}`,
              variant: "error",
            })
          }
        },
      },
      {
        name: "mcp.list",
        title: "Toggle MCPs",
        category: "Agent",
        slashName: "mcps",
        run: () => {
          dialog.replace(() => <DialogMcp />)
        },
      },
      {
        name: "agent.cycle",
        title: "Agent cycle",
        category: "Agent",
        hidden: true,
        run: () => {
          local.agent.move(1)
        },
      },
      {
        name: "variant.cycle",
        title: "Variant cycle",
        category: "Agent",
        run: () => {
          void local.model.variant.cycle()
        },
      },
      {
        name: "variant.list",
        title: "Switch model variant",
        category: "Agent",
        hidden: local.model.variant.list().length === 0,
        slashName: "variants",
        run: () => {
          if (local.model.variant.list().length === 0) {
            return toast.show({
              title: "No variants available",
              message: "The current model does not support any variants.",
              variant: "info",
            })
          }
          dialog.replace(() => <DialogVariant />)
        },
      },
      {
        name: "agent.cycle.reverse",
        title: "Agent cycle reverse",
        category: "Agent",
        hidden: true,
        run: () => {
          local.agent.move(-1)
        },
      },
      {
        name: "provider.connect",
        title: "Connect provider",
        suggested: !connected(),
        slashName: "connect",
        run: () => {
          dialog.replace(() => <DialogProviderList />)
        },
        category: "Provider",
      },
      ...(sync.data.console_state.switchableOrgCount > 1
        ? [
            {
              name: "console.org.switch",
              title: "Switch org",
              suggested: Boolean(sync.data.console_state.activeOrgName),
              slashName: "org",
              slashAliases: ["orgs", "switch-org"],
              run: () => {
                dialog.replace(() => <DialogConsoleOrg />)
              },
              category: "Provider",
            },
          ]
        : []),
      {
        name: "opencode.status",
        title: "View status",
        slashName: "status",
        run: () => {
          dialog.replace(() => <DialogStatus />)
        },
        category: "System",
      },
      {
        name: "opencode.debug",
        title: "View debug info",
        slashName: "debug",
        run: () => {
          dialog.replace(() => <DialogDebug />)
        },
        category: "System",
      },
      {
        name: "opencode.debug_logging",
        title: kv.get("debug_logging") ? "Disable debug logging" : "Enable debug logging",
        desc: "Persist debug logs for this and all future sessions until turned off",
        slashName: "debug-logging",
        category: "System",
        run: async () => {
          const enabled = !kv.get("debug_logging")
          try {
            kv.set("debug_logging", await sdk.debugLogging.set(enabled))
            toast.show({
              message: enabled ? "Debug logging on for this and future sessions" : "Debug logging off",
              variant: "info",
            })
          } catch (error) {
            toast.show({
              message: `Failed to toggle debug logging: ${error instanceof Error ? error.message : String(error)}`,
              variant: "error",
            })
          }
          dialog.clear()
        },
      },
      {
        name: "theme.switch",
        title: "Switch theme",
        slashName: "themes",
        run: () => {
          dialog.replace(() => <DialogThemeList />)
        },
        category: "System",
      },
      {
        name: "theme.switch_mode",
        title: mode() === "dark" ? "Switch to light mode" : "Switch to dark mode",
        run: () => {
          setMode(mode() === "dark" ? "light" : "dark")
          dialog.clear()
        },
        category: "System",
      },
      {
        name: "theme.mode.lock",
        title: locked() ? "Unlock theme mode" : "Lock theme mode",
        run: () => {
          if (locked()) unlock()
          else lock()
          dialog.clear()
        },
        category: "System",
      },
      {
        name: "help.show",
        title: "Help",
        slashName: "help",
        run: () => {
          dialog.replace(() => <DialogHelp />)
        },
        category: "System",
      },
      {
        name: "docs.open",
        title: "Open docs",
        run: () => {
          open("https://opencode.ai/docs").catch(() => {})
          dialog.clear()
        },
        category: "System",
      },
      {
        name: "app.exit",
        title: "Exit the app",
        slashName: "exit",
        slashAliases: ["quit", "q"],
        run: () => exit(),
        category: "System",
      },
      {
        name: "app.debug",
        title: "Toggle debug panel",
        category: "System",
        run: () => {
          renderer.toggleDebugOverlay()
          dialog.clear()
        },
      },
      {
        name: "app.console",
        title: "Toggle console",
        category: "System",
        run: () => {
          renderer.console.toggle()
          dialog.clear()
        },
      },
      {
        name: "app.heap_snapshot",
        title: "Write heap snapshot",
        category: "System",
        run: async () => {
          const files = await props.onSnapshot?.()
          toast.show({
            variant: "info",
            message: `Heap snapshot written to ${files?.join(", ")}`,
            duration: 5000,
          })
          dialog.clear()
        },
      },
      {
        name: "terminal.suspend",
        title: "Suspend terminal",
        category: "System",
        hidden: true,
        enabled: process.platform !== "win32",
        run: () => {
          renderer.suspend()
          process.once("SIGCONT", () => renderer.resume())
          process.kill(0, "SIGTSTP")
        },
      },
      {
        name: "terminal.title.toggle",
        title: terminalTitleEnabled() ? "Disable terminal title" : "Enable terminal title",
        category: "System",
        run: () => {
          setTerminalTitleEnabled((prev) => {
            const next = !prev
            kv.set("terminal_title_enabled", next)
            if (!next) renderer.setTerminalTitle("")
            return next
          })
          dialog.clear()
        },
      },
      {
        name: "terminal.tab_agent.toggle",
        title: kv.get("terminal_tab_agent_enabled", true)
          ? "Disable tab agent square and status"
          : "Enable tab agent square and status",
        category: "System",
        run: () => {
          kv.set("terminal_tab_agent_enabled", !kv.get("terminal_tab_agent_enabled", true))
          dialog.clear()
        },
      },
      {
        name: "app.toggle.animations",
        title: kv.get("animations_enabled", true) ? "Disable animations" : "Enable animations",
        category: "System",
        run: () => {
          kv.set("animations_enabled", !kv.get("animations_enabled", true))
          dialog.clear()
        },
      },
      {
        name: "selection.copy_mode.toggle",
        title: copyOnSelect() ? "Enable Ctrl+C copy" : "Enable mouse-up copy",
        category: "System",
        run: () => {
          const next = !copyOnSelect()
          kv.set(Selection.COPY_ON_SELECT_KEY, next)
          toast.show({
            message: next ? "Copy on mouse up" : "Copy with Ctrl+C",
            variant: "info",
          })
          dialog.clear()
        },
      },
      {
        name: "app.toggle.file_context",
        title: kv.get("file_context_enabled", true) ? "Disable file context" : "Enable file context",
        category: "System",
        run: () => {
          kv.set("file_context_enabled", !kv.get("file_context_enabled", true))
          dialog.clear()
        },
      },
      {
        name: "app.toggle.diffwrap",
        title: kv.get("diff_wrap_mode", "word") === "word" ? "Disable diff wrapping" : "Enable diff wrapping",
        category: "System",
        run: () => {
          const current = kv.get("diff_wrap_mode", "word")
          kv.set("diff_wrap_mode", current === "word" ? "none" : "word")
          dialog.clear()
        },
      },
      {
        name: "app.toggle.paste_summary",
        title: pasteSummaryEnabled() ? "Disable paste summary" : "Enable paste summary",
        category: "System",
        run: () => {
          setPasteSummaryEnabled((prev) => {
            const next = !prev
            kv.set("paste_summary_enabled", next)
            return next
          })
          dialog.clear()
        },
      },
      {
        name: "permission.mode",
        title:
          local.permission.mode === "auto" ? "Disable auto-approve permissions" : "Enable auto-approve permissions",
        category: "System",
        run: () => {
          local.permission.toggle()
          dialog.clear()
        },
      },
    ].map((command) => ({
      namespace: "palette",
      ...command,
    })),
  )

  useBindings(() => ({
    commands: appCommands(),
  }))

  useBindings(() => ({
    mode: OPENCODE_BASE_MODE,
    bindings: tuiConfig.keybinds.gather("app", appBindingCommands),
  }))

  useBindings(() => ({
    bindings: tuiConfig.keybinds.gather("app.global", appGlobalBindingCommands),
  }))

  useBindings(() => ({
    mode: OPENCODE_BASE_MODE,
    enabled: () => {
      const current = promptRef.current
      if (!current?.focused) return true
      return current.current.input === ""
    },
    bindings: tuiConfig.keybinds.gather("app_exit", ["app.exit"]),
  }))

  event.on("tui.command.execute", (evt, { workspace }) => {
    if (workspace !== project.workspace.current()) return
    keymap.dispatchCommand(evt.properties.command)
  })

  event.on("tui.command.execute.targeted", (evt, { workspace }) => {
    if (workspace !== project.workspace.current()) return
    handleCrowTargetedCommandExecute({
      selfHandle: validatedCrowSessionHandle,
      properties: evt.properties,
      route: route.data,
      sessions: sync.data.session,
      dispatchCommand: (command) => keymap.dispatchCommand(command),
      navigateToSession: (sessionID) => route.navigate({ type: "session", sessionID }),
    })
  })

  event.on("tui.toast.show", (evt, { workspace }) => {
    if (workspace !== project.workspace.current()) return
    toast.show({
      title: evt.properties.title,
      message: evt.properties.message,
      variant: evt.properties.variant,
      duration: evt.properties.duration,
    })
  })

  event.on("tui.session.select", (evt, { workspace }) => {
    if (workspace !== project.workspace.current()) return
    route.navigate({ type: "session", sessionID: evt.properties.sessionID })
  })

  event.on("session.deleted", (evt) => {
    if (route.data.type === "session" && route.data.sessionID === evt.properties.info.id) {
      route.navigate({ type: "home" })
      toast.show({
        variant: "info",
        message: "The current session was deleted",
      })
    }
  })

  event.on("session.error", (evt, { workspace }) => {
    if (workspace !== project.workspace.current()) return
    const error = evt.properties.error
    if (error && typeof error === "object" && error.name === "MessageAbortedError") return
    const message = errorMessage(error)

    toast.show({
      variant: "error",
      message,
      duration: 5000,
    })
  })

  event.on("installation.update-available", async (evt) => {
    console.log("installation.update-available", evt)
    const version = evt.properties.version

    const skipped = kv.get("skipped_version")
    if (skipped && !isVersionGreater(version, skipped)) return

    const choice = await DialogConfirm.show(
      dialog,
      `Update Available`,
      `A new release v${version} is available. Would you like to update now?`,
      "skip",
    )

    if (choice === false) {
      kv.set("skipped_version", version)
      return
    }

    if (choice !== true) return

    toast.show({
      variant: "info",
      message: `Updating to v${version}...`,
      duration: 30000,
    })

    const result = await sdk.client.global.upgrade({ target: version })

    if (result.error || !result.data?.success) {
      toast.show({
        variant: "error",
        title: "Update Failed",
        message: "Update failed",
        duration: 10000,
      })
      return
    }

    await DialogAlert.show(
      dialog,
      "Update Complete",
      `Successfully updated to OpenCode v${result.data.version}. Please restart the application.`,
    )

    void exit()
  })

  const plugin = createMemo(() => {
    if (!ready()) return
    if (route.data.type !== "plugin") return
    const render = pluginRuntime.routes.get(route.data.id)
    if (!render) return <PluginRouteMissing id={route.data.id} onHome={() => route.navigate({ type: "home" })} />
    return render({ params: route.data.data })
  })

  return (
    <box
      width={dimensions().width}
      height={dimensions().height}
      flexDirection="column"
      backgroundColor={theme.background}
      onMouseDown={(evt) => {
        if (copyOnSelect()) return
        if (evt.button !== MouseButton.RIGHT) return

        if (!Selection.copy(renderer, toast, clipboard)) return
        evt.preventDefault()
        evt.stopPropagation()
      }}
      onMouseUp={copyOnSelect() ? () => Selection.copy(renderer, toast, clipboard) : undefined}
    >
      <Show when={Flag.OPENCODE_SHOW_TTFD}>
        <TimeToFirstDraw />
      </Show>
      <Show when={ready()}>
        <box flexGrow={1} minHeight={0} flexDirection="column">
          <Switch>
            <Match when={route.data.type === "home"}>
              <Home />
            </Match>
            <Match when={route.data.type === "session"}>
              <Show when={route.data.type === "session" ? route.data.sessionID : undefined} keyed>
                {(_) => <Session />}
              </Show>
            </Match>
          </Switch>
          {plugin()}
        </box>
        <box flexShrink={0}>
          <pluginRuntime.Slot name="app_bottom" />
        </box>
        <pluginRuntime.Slot name="app" />
      </Show>
      <Show when={!startup.skipInitialLoading}>
        <StartupLoading ready={ready} />
      </Show>
    </box>
  )
}
