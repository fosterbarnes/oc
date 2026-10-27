import { render, TimeToFirstDraw, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { registerOpencodeSpinner } from "./component/register-spinner"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { stringifyKeyStroke, type KeySequencePart } from "@opentui/keymap"
import { Deferred, Effect } from "effect"
import { Global } from "@opencode-ai/core/global"
import { Flag } from "@opencode-ai/core/flag/flag"
import { InstallationDisplayVersion, InstallationVersion } from "@opencode-ai/core/installation/version"
import { ClipboardProvider, useClipboard } from "./context/clipboard"
import { ExitProvider, useExit } from "./context/exit"
import { EpilogueProvider } from "./context/epilogue"
import { Selection } from "./util/selection"
import { Locale } from "./util/locale"
import { CliRenderEvents, createCliRenderer, MouseButton, type MouseEvent } from "@opentui/core"
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
import { TuiPathsProvider, TuiStartupProvider, TuiTerminalEnvironmentProvider } from "./context/runtime"
import { DialogProvider, useDialog } from "./ui/dialog"
import { DialogProvider as DialogProviderList } from "./component/dialog-provider"
import { ErrorComponent } from "./component/error-component"
import { PluginRouteMissing } from "./component/plugin-route-missing"
import { ProjectProvider, useProject } from "./context/project"
import { EditorContextProvider } from "./context/editor"
import { useEvent } from "./context/event"
import { SDKProvider, useSDK } from "./context/sdk"
import { IntroLogo, hideIntroLogo } from "./component/introLogo"
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
import { DialogConfirm } from "./ui/dialog-confirm"
import { createTodoCommand } from "./todos"
import { createAgentPushAutoDelete } from "./agentPushAutoDelete"
import { createClearSavedImagesCommand } from "./savedImages"
import { createContextLimitCommands } from "./contextLimit"
import { createClaudeWarmupCommands } from "./claudeWarmup"
import { createClaudeAccountCommands } from "./claudeCommands"
import { Toast, ToastProvider, useToast } from "./ui/toast"
import { isDefaultTitle } from "./util/session"
import { KVProvider, useKV } from "./context/kv"
import * as Model from "./util/model"
import { ArgsProvider, useArgs, type Args } from "./context/args"
import { LINK_CLICK_KEY, openLink } from "./util/browser"
import { PromptRefProvider, usePromptRef } from "./context/prompt"
import { TuiConfigProvider, useTuiConfig, type TuiConfig } from "./config"
import { TuiKeybind } from "./config/keybind"
import { createLiveConfig, watchConfigFiles, type ConfigWatch } from "./config/live"
import { showFailureToast } from "./component/dialog-error-details"
import { releaseNotesAfterUpdate } from "./component/dialog-release-notes"
import { createFailureAnnouncer, mcpFailures, serverPluginFailures } from "./failureToasts"
import { createTuiApiAdapters } from "./plugin/adapters"
import { createTuiApi } from "./plugin/api"
import { createPluginRuntime, PluginRuntimeProvider, usePluginRuntime, type TuiPluginHost } from "./plugin/runtime"
import { CommandPaletteDialog } from "./component/command-palette"
import {
  COMMAND_PALETTE_COMMAND,
  findPaletteEntry,
  LEADER_TOKEN,
  OPENCODE_BASE_MODE,
  OpencodeKeymapProvider,
  registerOpencodeKeymap,
  useBindings,
  useOpencodeKeymap,
} from "./keymap"

import type { EventSource } from "./context/sdk"
import { DialogVariant } from "./component/dialog-variant"
import { createTuiAttention } from "./attention"
import * as TuiAudio from "./audio"
import { win32AssertRawMode } from "./terminal-win32"
import { destroyRenderer, writeTerminalEscape } from "./util/renderer"
import { fontEscape, TERMINAL_FONT_KEY } from "./util/terminalFont"
import { detectTerminal } from "@opencode-ai/core/util/terminal"
import { cliErrorMessage, errorFormat } from "./util/error"
import { validateHotkey } from "./hotkeyValidate"
import { handleCrowTargetedCommandExecute, validatedCrowSessionHandle } from "./crow"
import { createOcCommands } from "./ocCommands"
import { persistTuiSetting } from "./ocSettings"
import { reviveCommands, SKIPPED_VERSION, updateNotice } from "./reviveCommands"
import fs from "node:fs"
import path from "node:path"

registerOpencodeSpinner()

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
  "oc.todos.toggle",
  "oc.new_session",
  "model.default",
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
  configWatch?: ConfigWatch<TuiConfig.Resolved>
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

// Read by revive and shutdown (packages/opencode/src/config/tuiLedger.ts). Session fields follow the route.
type Ledger = {
  pid: number
  instance: string
  executable: string
  startedAt: number
  paneID?: string
  weztermSocket?: string
  sessionID?: string
  directory?: string
}

// The ledger only scopes revive/shutdown to this instance; failing to write it must not stop the TUI.
function writeLedger(record: Ledger) {
  try {
    const file = path.join(Global.Path.state, "oc-tuis", `${process.pid}.json`)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(record))
  } catch {}
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
      // Several components subscribe to renderer events; the default limit of 10 warns into the TUI.
      renderer.setMaxListeners(15)
      const terminal = detectTerminal()
      const ledgerPath = path.join(global.state, "oc-tuis", `${process.pid}.json`)
      const ledger: Ledger = {
        pid: process.pid,
        instance: Global.Path.app,
        executable: Global.resolveExecutablePath(process.execPath),
        startedAt: Date.now() - process.uptime() * 1000,
        // Outside WezTerm, `wezterm cli` can't find this GUI's socket; shutdownAll closes the pane via it.
        ...(terminal.kind === "wezterm" && terminal.paneID
          ? { paneID: terminal.paneID, weztermSocket: process.env.WEZTERM_UNIX_SOCKET }
          : {}),
      }
      yield* Effect.acquireRelease(
        Effect.sync(() => writeLedger(ledger)),
        () => Effect.sync(() => fs.rmSync(ledgerPath, { force: true })),
      )
      win32AssertRawMode()
      const keymap = createDefaultOpenTuiKeymap(renderer)
      const liveConfig = createLiveConfig(input.config)
      yield* Effect.acquireRelease(
        Effect.sync(() => registerOpencodeKeymap(keymap, renderer, liveConfig.config)),
        (unregister) => Effect.sync(unregister),
      )
      // tui.json saves apply in place; renderer options (mouse) still need a restart
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const configWatch = input.configWatch
          if (!configWatch) return () => {}
          let pending: Promise<unknown> = Promise.resolve()
          return watchConfigFiles(configWatch.files, () => {
            pending = pending
              .then(configWatch.reload)
              .then(liveConfig.replace)
              .catch((error) => console.error("Failed to reload TUI config", error))
          })
        }),
        (unwatch) => Effect.sync(unwatch),
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
        // Nothing paints until this resolves; ConPTY usually swallows the query, so keep it short.
        const mode = (await renderer.waitForThemeMode(100)) ?? "dark"
        if (renderer.isDestroyed) return

        await render(() => {
          return (
            <>
              <IntroLogo />
              <ExitProvider
                exit={(reason) => {
                  if (renderer.isDestroyed) return
                  exit.reason = reason
                  destroyRenderer(renderer)
                }}
              >
                <EpilogueProvider set={(value) => (exit.epilogue = value)}>
                  <ErrorBoundary
                    fallback={(error, reset) => <ErrorComponent error={error} reset={reset} mode={mode} />}
                  >
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
                            initialRoute: process.env.OPENCODE_ROUTE
                              ? JSON.parse(process.env.OPENCODE_ROUTE)
                              : undefined,
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
                                      <TuiConfigProvider config={liveConfig.config}>
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
                                                                        ledger={ledger}
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
            </>
          )
        }, renderer)
      })
      yield* Deferred.await(shutdown)
      return { epilogue: exit.epilogue, reason: exit.reason }
    }),
  )
  yield* Effect.sync(() => {
    if (result.reason !== undefined) {
      process.stderr.write((cliErrorMessage(result.reason) ?? errorFormat(result.reason)) + "\n")
      process.exitCode = 1
    }
    if (result.epilogue) process.stdout.write(result.epilogue + "\n")
  })
})

function App(props: { onSnapshot?: () => Promise<string[]>; pluginHost: TuiPluginHost; ledger: Ledger }) {
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
  let systemThemeTimeout: ReturnType<typeof setTimeout> | undefined
  const prepareSystemTheme = () => {
    // The native writer can still be flushing the frame when FRAME fires. Keep OSC probes behind visible app output.
    systemThemeTimeout = setTimeout(themeState.prepareSystem, 50)
  }
  onMount(() => renderer.once(CliRenderEvents.FRAME, prepareSystemTheme))
  onCleanup(() => {
    renderer.off(CliRenderEvents.FRAME, prepareSystemTheme)
    if (systemThemeTimeout) clearTimeout(systemThemeTimeout)
  })
  const sync = useSync()
  const project = useProject()
  const exit = useExit()
  const promptRef = usePromptRef()
  const pluginRuntime = usePluginRuntime()
  const attention = createTuiAttention({ renderer, config: tuiConfig, kv })
  const clipboard = useClipboard()
  const copyOnSelect = () => kv.get(Selection.COPY_ON_SELECT_KEY, Selection.defaultCopyOnSelect()) as boolean
  // Markdown tags URLs with link ids in the render buffer; a plain left click on one opens it.
  // opentui flags every mouseup on selectable text as dragging, so a click is a down and up on
  // the same cell.
  let linkDown: { x: number; y: number } | undefined
  const openClickedLink = (evt: MouseEvent) => {
    const down = linkDown
    linkDown = undefined
    if (evt.button !== MouseButton.LEFT || !kv.get(LINK_CLICK_KEY, true)) return false
    if (down?.x !== evt.x || down.y !== evt.y) return false
    const url = renderer.getLinkAt(evt.x, evt.y)
    if (!url) return false
    renderer.clearSelection()
    openLink(kv, url).catch(toast.error)
    evt.preventDefault()
    evt.stopPropagation()
    return true
  }
  const claudeCliPath = () => {
    const cliPath = sync.data.config.provider?.["claude-code"]?.options?.cliPath
    return typeof cliPath === "string" ? cliPath : "claude"
  }
  // Keeps the ledger on the session this tab shows, so a revive reopens this tab on it.
  createEffect(() => {
    const sessionID = route.data.type === "session" ? route.data.sessionID : undefined
    writeLedger({
      ...props.ledger,
      directory: (sessionID ? sync.session.get(sessionID)?.directory : undefined) ?? sdk.directory,
      ...(sessionID ? { sessionID } : {}),
    })
  })
  let initialPaletteKeys = true
  createEffect(() => {
    const paletteKeys = tuiConfig.palette_keys
    if (initialPaletteKeys) {
      initialPaletteKeys = false
      return
    }
    void persistTuiSetting(["palette_keys"], paletteKeys).catch(() => {})
  })
  createEffect(() => {
    sync.restart.recoveryEpoch
    if (!sync.restart.pending) promptRef.requestFocus()
  })
  // Config `time` drives every displayed time; on the native build this thread also sets the worker's zone.
  createEffect(() => Locale.setTimeSettings(sync.data.config.time))
  onMount(() => {
    void sdk.debugLogging
      .get()
      .then((enabled) => kv.set("debug_logging", enabled))
      .catch(() => {})
    const leaderBinding = tuiConfig.keybinds.get("leader")[0]?.key
    const leaderKey = !leaderBinding ? "" : typeof leaderBinding === "string" ? leaderBinding.trim().toLowerCase() : ""
    const kittyKeyboard = renderer.capabilities?.kitty_keyboard === true
    const entries = keymap.getCommandEntries({ visibility: "registered" })
    const titles = new Map(
      entries.map((entry) => [
        entry.command.name,
        typeof entry.command.title === "string" ? entry.command.title : entry.command.name,
      ]),
    )
    const sequenceKey = (sequence: readonly KeySequencePart[]) => {
      const parts = sequence.map((part) => {
        if (part.tokenName === LEADER_TOKEN) return "<leader>"
        const stroke = stringifyKeyStroke(part.stroke).split("+")
        const name = stroke.pop() ?? ""
        const mods = new Set(stroke)
        return [
          ...new Set(
            ["ctrl", "alt", "option", "meta", "shift", "super", "hyper"]
              .filter((mod) => mods.has(mod))
              .map((mod) => (mod === "meta" || mod === "option" ? "alt" : mod)),
          ),
          name,
        ].join("+")
      })
      return parts[0] === "<leader>" ? "<leader>" + parts.slice(1).join(" ") : parts.join(" ")
    }
    const dropped: string[] = []
    for (const [command, key] of Object.entries(tuiConfig.palette_keys)) {
      const owned = new Map<string, string>()
      const remember = (sequence: readonly KeySequencePart[], owner: string) => {
        const normalized = sequenceKey(sequence).trim().toLowerCase()
        if (normalized && !owned.has(normalized)) owned.set(normalized, titles.get(owner) ?? owner)
      }
      for (const [name, bindings] of keymap.getCommandBindings({
        visibility: "registered",
        commands: entries.map((entry) => entry.command.name),
      })) {
        if (name === command) continue
        for (const binding of bindings) remember(binding.sequence, name)
      }
      for (const name of Object.values(TuiKeybind.CommandMap)) {
        if (name === command) continue
        for (const binding of tuiConfig.keybinds.get(name)) remember(keymap.parseKeySequence(binding.key), name)
      }
      let parsed = true
      try {
        keymap.parseKeySequence(key)
      } catch {
        parsed = false
      }
      const result = parsed
        ? validateHotkey({
            key,
            leaderKey,
            ownerOf: (key) => owned.get(key.trim().toLowerCase()),
            kittyKeyboard,
          })
        : { ok: false as const, reason: "invalid key sequence" }
      if (result.ok) continue
      dropped.push(`${command}: ${result.reason}`)
      tuiConfig.setPaletteKey(command, undefined)
    }
    if (dropped.length) {
      toast.show({
        message: `Ignored invalid palette hotkeys: ${dropped.join("; ")}`,
        variant: "error",
        duration: 15_000,
      })
    }
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
  // Plugin and MCP failures: error toast -> details dialog (copy, investigate in a new session)
  const announceFailure = createFailureAnnouncer((failure) => showFailureToast(toast, dialog, failure))
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
      hideIntroLogo()
      const failures = props.pluginHost.failures?.() ?? []
      announceFailure(
        "tui-plugin",
        failures.map((item) => ({ ...item, key: item.error })),
      )
    })
  createEffect(() => {
    if (sync.status === "loading") return
    announceFailure("mcp", mcpFailures(sync.data.mcp))
  })
  createEffect(
    on(
      () => sync.status === "loading",
      (loading) => {
        if (loading) return
        void sdk.client.plugin
          .status()
          .then((result) => announceFailure("server-plugin", serverPluginFailures(result.data ?? [])))
          .catch((error) => console.error("Failed to read server plugin status", error))
      },
    ),
  )

  // Retained selection owns copy/dismiss before modal-close or session-abort bindings.
  const offSelectionKeys = Selection.registerKeys(keymap, renderer, toast, clipboard)
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
  // Lets the WezTerm config forward Ctrl+V to oc, which reads file-drop and image clipboards itself.
  if (terminal.kind === "wezterm") writeTerminalEscape(renderer, "\x1b]1337;SetUserVar=oc_tui=MQ==\x07")
  // Without the kitty keyboard protocol some oc chords arrive as other keys; say so once per
  // terminal kind. kitty_keyboard starts false and OpenTUI reads terminal replies for 5 s.
  const keyboardNotice = setTimeout(() => {
    const key = `keyboard_notice_${terminal.kind}`
    if (renderer.isDestroyed || !kv.ready || kv.get(key) || renderer.capabilities?.kitty_keyboard !== false) return
    kv.set(key, true)
    const keys = "sending some oc keys as other keys: Ctrl+M as Enter, Ctrl+Shift+H as Backspace, Shift+Enter as Enter."
    const message = {
      wezterm: `WezTerm is ${keys} Add config.enable_kitty_keyboard = true to wezterm.lua and restart WezTerm.`,
      "windows-terminal": `Windows Terminal is ${keys} Update Windows Terminal to 1.25 or newer.`,
      generic: `This terminal is ${keys} WezTerm (with enable_kitty_keyboard) or Windows Terminal 1.25+ send them.`,
    }[terminal.kind]
    toast.show({ title: "Keyboard", message, variant: "warning", duration: 20_000 })
  }, 6_000)
  onCleanup(() => clearTimeout(keyboardNotice))
  // Font overrides are per WezTerm window, so the font stays after exit; an empty value
  // goes out only on Reset, never at startup, so other oc tabs in the window keep theirs.
  let sentFont = ""
  createEffect(() => {
    if (terminal.kind !== "wezterm") return
    const escape = fontEscape(kv.get(TERMINAL_FONT_KEY))
    if (escape === sentFont || (!sentFont && escape === fontEscape(undefined))) return
    writeTerminalEscape(renderer, escape)
    sentFont = escape
  })

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
    const color =
      tabEnabled && route.data.type !== "plugin" && agent ? local.agent.color(agent.name).toInts() : undefined
    const hex = color
      ? `#${color
          .slice(0, 3)
          .map((channel) => channel.toString(16).padStart(2, "0"))
          .join("")}`
      : ""
    if (terminal.kind === "wezterm" && hex !== terminalTabState.color) {
      writeTerminalEscape(renderer, `\x1b]1337;SetUserVar=oc_agent_color=${Buffer.from(hex).toString("base64")}\x07`)
      terminalTabState.color = hex
    }
    if (!titleEnabled) return
    // Plain ■ renders everywhere; WezTerm (with the oc tab snippet) colors it via oc_agent_color.
    // A native (opencode) window uses ⦿ in place of ■, same agent color.
    const prefix = color ? (Global.native ? "⦿ " : "■ ") : ""

    if (route.data.type === "home") {
      renderer.setTerminalTitle(`${prefix}OpenCode`)
      return
    }

    if (route.data.type === "session") {
      if (!session || isDefaultTitle(session.title)) {
        renderer.setTerminalTitle(`${prefix}OpenCode`)
        return
      }

      const title = session.title.length > 40 ? session.title.slice(0, 37) + "…" : session.title
      renderer.setTerminalTitle(`${prefix}${title}`)
      return
    }

    if (route.data.type === "plugin") {
      renderer.setTerminalTitle(route.data.id)
    }
  })

  const args = useArgs()
  // Home seeds `--prompt` itself; a resumed or forked session gets it through the route.
  const startupPrompt = args.prompt ? { input: args.prompt, parts: [] } : undefined
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
        route.navigate({ type: "session", sessionID: args.sessionID, prompt: startupPrompt })
      }
    })
    if (args.palette) {
      const ref = args.palette.trim()
      setTimeout(() => {
        if (renderer.isDestroyed) return
        const entry = findPaletteEntry(keymap, ref)
        if (entry) keymap.dispatchCommand(entry.command.name)
        else
          toast.show({
            variant: "error",
            message: `Palette entry not found: ${ref}`,
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
            route.navigate({ type: "session", sessionID: result.data.id, prompt: startupPrompt })
          } else {
            toast.show({ message: "Failed to fork session", variant: "error" })
          }
        })
      } else {
        route.navigate({ type: "session", sessionID: match, prompt: startupPrompt })
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
        route.navigate({ type: "session", sessionID: result.data.id, prompt: startupPrompt })
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
  const todoCommand = createTodoCommand()
  const agentPushAutoDeleteCommand = createAgentPushAutoDelete()
  const clearSavedImagesCommand = createClearSavedImagesCommand()
  const contextLimitCommands = createContextLimitCommands()
  const claudeWarmup = createClaudeWarmupCommands()
  const claudeAccountCommands = createClaudeAccountCommands()
  const ocCommands = createOcCommands({ claudeCliPath, controlServer })
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
          void claudeWarmup.refresh()
          dialog.replace(() => <CommandPaletteDialog />)
        },
      },
      {
        name: "oc.settings_palette",
        title: "Show oc commands",
        category: "oc",
        hidden: true,
        run: () => {
          void claudeWarmup.refresh()
          dialog.replace(() => <CommandPaletteDialog category="oc" />)
        },
      },
      ...reviveCommands(toast),
      {
        name: "oc.reload",
        title: "Reload oc config",
        category: "System",
        slashName: "reload",
        run: async () => {
          const result = await sdk.client.instance.reload({ workspace: project.workspace.current() })
          if (result.error) {
            const detail =
              cliErrorMessage(result.error) ??
              ("message" in result.error ? result.error.message : JSON.stringify(result.error))
            return toast.error(new Error(`Reload failed: ${detail}`))
          }
          const refreshed = await sync.bootstrap({ fatal: false })
          if (!refreshed) return toast.error(new Error("Config reloaded, but the TUI failed to refresh its state"))
          toast.show({ message: "Reloaded oc config", variant: "success" })
        },
      },
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
        title: "Home",
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
      ocCommands.newSession,
      ...ocCommands.defaults,
      contextLimitCommands.contextLimit,
      todoCommand,
      agentPushAutoDeleteCommand,
      clearSavedImagesCommand,
      ...ocCommands.settings,
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
        slashAliases: ["thinking", "effort"],
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
        name: "theme.switch_native",
        title: "Switch opencode theme",
        hidden: Global.native,
        run: () => {
          dialog.replace(() => <DialogThemeList native />)
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
          openLink(kv, "https://opencode.ai/docs").catch(toast.error)
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
        name: "permission.mode",
        title:
          local.permission.mode === "auto" ? "Disable auto-approve permissions" : "Enable auto-approve permissions",
        category: "System",
        run: () => {
          local.permission.toggle()
          dialog.clear()
        },
      },
      ...claudeWarmup.commands(),
      ...claudeAccountCommands(),
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

  useBindings(() => {
    const commands = new Set(keymap.getCommands().map((command) => command.name))
    const leaderBinding = tuiConfig.keybinds.get("leader")[0]?.key
    const leaderKey = !leaderBinding ? "" : typeof leaderBinding === "string" ? leaderBinding.trim().toLowerCase() : ""
    const kittyKeyboard = renderer.capabilities?.kitty_keyboard === true
    return {
      mode: OPENCODE_BASE_MODE,
      enabled: () => {
        if (dialog.stack.length > 0) return false
        const current = promptRef.current
        if (!current?.focused) return true
        return current.current.input === ""
      },
      bindings: Object.entries(tuiConfig.palette_keys)
        .filter(([command, key]) => {
          if (!commands.has(command) || !key.trim()) return false
          try {
            keymap.parseKeySequence(key)
          } catch {
            return false
          }
          return validateHotkey({
            key,
            leaderKey,
            ownerOf: () => undefined,
            kittyKeyboard,
          }).ok
        })
        .map(([cmd, key]) => ({ key, cmd })),
    }
  })

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
      const title = evt.properties.info.title
      route.navigate({ type: "home" })
      toast.show({
        variant: "info",
        message: title ? `Session "${title}" was deleted` : "The current session was deleted",
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

  createEffect(
    on(ready, (value) => {
      if (!value || sync.data.config.autoupdate === false) return
      void updateNotice(toast, kv.get(SKIPPED_VERSION))
    }),
  )
  createEffect(
    on(
      () => ready() && kv.ready,
      (value) => {
        if (value) void releaseNotesAfterUpdate(kv, dialog, toast)
      },
    ),
  )

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
        if (evt.button === MouseButton.LEFT) linkDown = { x: evt.x, y: evt.y }
        if (copyOnSelect()) return
        Selection.copyOnMouseDown(renderer, toast, evt, clipboard)
      }}
      onMouseUp={(evt) => {
        if (openClickedLink(evt)) return
        if (copyOnSelect()) Selection.copyOnMouseUp(renderer, toast, evt, clipboard)
      }}
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
      <Toast />
    </box>
  )
}
