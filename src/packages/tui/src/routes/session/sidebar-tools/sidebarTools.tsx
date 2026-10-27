import { For, Show, createEffect, createMemo, createSignal, onCleanup, type ParentProps } from "solid-js"
import type { BoxRenderable } from "@opentui/core"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { useProject } from "../../../context/project"
import { useSync } from "../../../context/sync"
import { useEvent } from "../../../context/event"
import { useSDK } from "../../../context/sdk"
import { useKV } from "../../../context/kv"
import { useTuiConfig } from "../../../config"
import { HeaderButton } from "./headerButton"
import { sessionDisabled } from "../../../component/dialog-session-subagents"
import { toggleSidebarButton } from "../../../sidebarButtons"
import { SidebarToggle } from "../../../feature-plugins/sidebar/toggle"
import { useTheme } from "../../../context/theme"
import { useTuiPaths } from "../../../context/runtime"
import { useLocal } from "../../../context/local"
import { usePromptRef } from "../../../context/prompt"
import { useToast } from "../../../ui/toast"
import { usePluginRuntime } from "../../../plugin/runtime"
import { useKeymapSelector, useOpencodeKeymap } from "../../../keymap"
import { InstallationDisplayVersion, InstallationVersion } from "@opencode-ai/core/installation/version"
import {
  defaultScriptSettings,
  defaultSidebarSettings,
  ensureSessionScrollbarVisible,
  hasConfiguredScripts,
  loadSidebarSettings,
  normalizeScriptSettings,
  saveUserScriptSettings,
  sessionProjectDirectory,
  sidebarConfigPaths,
  sidebarStatePath,
  writeJsonObject,
  type ScriptSettings,
  type SidebarSettings,
} from "./settings.js"
import { dedupeRootPaths, displayPath, isDirectory, normalizeRootPath, rootSections, sameRootPath } from "./roots.js"
import {
  clipEnd,
  MAX_TREE_ITEMS,
  readScripts,
  readTree,
  reconcileScripts,
  reconcileTree,
  type Script,
} from "./scripts.js"
import { createRootPicker } from "./rootPicker"
import { createScriptSettingsMenu } from "./scriptSettingsMenu"
import { createSidebarUsage } from "./sidebarUsage"
import { usageProviderForModel } from "./usage/providers"
import {
  copyToClipboard,
  fileClipboardText,
  runScript as runNativeScript,
  scriptClipboardText,
  scriptCommand,
} from "./scriptRunner.js"

const DIRECTORY_COLORS = ["#F7E9B5", "#F4E1A0", "#F1D98B", "#EED076", "#EBC861"]
const DIRECTORY_INDICATOR_COLORS = ["#DCCF99", "#D5C184", "#CEB56F", "#C7A95A", "#C09D45"]

export const USAGE_MENU_COMMAND = {
  name: "sidebar.usage",
  title: "Show usage",
  category: "oc",
  group: "Third party harness management",
  namespace: "palette",
}

function directoryColor(depth: number, colors: string[]): string {
  return colors[Math.min(depth, colors.length - 1)]
}

function midpointColor(
  first: { toInts(): [number, number, number, number]; toString(): string },
  second: string,
): string {
  const hex = second.match(/^#([\da-f]{6})$/i)?.[1]
  if (!hex) return first.toString()
  const [red, green, blue] = first.toInts()
  return `#${[red, green, blue]
    .map((value, index) =>
      Math.round((value + parseInt(hex.slice(index * 2, index * 2 + 2), 16)) / 2)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`
}

function palerColor(color: { toInts(): [number, number, number, number] }): string {
  return `#${color
    .toInts()
    .slice(0, 3)
    .map((value) =>
      Math.round(value + (255 - value) * 0.18)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`
}

function pinKey(worktree: string): string {
  return `opencode-sidebar-tools:pins:${worktree}`
}

function favoriteRootKey(worktree: string): string {
  return `opencode-sidebar-tools:favorite-file-roots:${worktree}`
}

function rootsKey(sessionID: string): string {
  return `opencode-sidebar-tools:file-roots:${sessionID}`
}

function scriptSettingsKey(worktree: string): string {
  return `opencode-sidebar-tools:script-settings:${worktree}`
}

type RootState = { customRoots: string[]; activeRoot?: string }

function globalScriptSettings(options: unknown): ScriptSettings {
  if (!options || typeof options !== "object") return defaultScriptSettings()
  const value = (options as { scripts?: unknown }).scripts
  return normalizeScriptSettings(value)
}

function globalSidebarSettings(options: unknown): SidebarSettings {
  return { ...defaultSidebarSettings(), scripts: globalScriptSettings(options) }
}

function loadRootState(kv: ReturnType<typeof useKV>, sessionID: string): RootState {
  const value = kv.get(rootsKey(sessionID), {})
  if (!value || typeof value !== "object") return { customRoots: [] }
  const state = value as { customRoots?: unknown; activeRoot?: unknown }
  const customRoots = Array.isArray(state.customRoots)
    ? state.customRoots.filter((item): item is string => typeof item === "string" && isDirectory(item))
    : []
  return {
    customRoots: [...new Set(customRoots)],
    activeRoot:
      typeof state.activeRoot === "string" && customRoots.includes(state.activeRoot) ? state.activeRoot : undefined,
  }
}

function loadPins(kv: ReturnType<typeof useKV>, worktree: string): Set<string> {
  const value = kv.get(pinKey(worktree), [])
  return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [])
}

function loadRootPins(kv: ReturnType<typeof useKV>, worktree: string): Set<string> {
  const value = kv.get(favoriteRootKey(worktree), [])
  return new Set(
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && isDirectory(item)) : [],
  )
}

function commandId(prefix: string, value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "item"
  return `sidebar.${prefix}.${safe}`
}

function footerPath(directory: string, homeDirectory: string, branch?: string): string {
  const normalized = directory.replaceAll("\\", "/")
  const home = homeDirectory.replaceAll("\\", "/").replace(/\/$/, "")
  const visible =
    normalized === home
      ? "~/"
      : normalized.startsWith(`${home}/`)
        ? `~/${normalized.slice(home.length + 1)}`
        : normalized
  return branch ? `${visible}:${branch}` : visible
}

export function SidebarTools(props: ParentProps<{ sessionID: string }>) {
  const projectContext = useProject()
  const sync = useSync()
  const event = useEvent()
  const sdk = useSDK()
  const kv = useKV()
  const { theme } = useTheme()
  const paths = useTuiPaths()
  const tuiConfig = useTuiConfig()
  const local = useLocal()
  const promptRef = usePromptRef()
  const toast = useToast()
  const keymap = useOpencodeKeymap()
  const pluginRuntime = usePluginRuntime()
  const currentSessionID = () => {
    return props.sessionID
  }
  const projectRoot = (forSessionID = currentSessionID()) => {
    return (
      sync.session.get(forSessionID)?.directory ||
      projectContext.instance.path().worktree ||
      projectContext.instance.path().directory
    )
  }
  let sessionID = currentSessionID()
  let sessionDirectory = projectRoot()
  let project = sessionDirectory
  let rootState = loadRootState(kv, sessionID)
  let root = rootState.activeRoot || project
  const pluginDefaults = globalSidebarSettings(undefined)
  const initialPromptDirectory = sessionProjectDirectory(
    sync.data.message[sessionID] ?? [],
    (messageID) => sync.data.part[messageID] ?? [],
    os.homedir(),
  )
  let configRoot = sessionDirectory === os.homedir() ? initialPromptDirectory || sessionDirectory : sessionDirectory
  const configPaths = sidebarConfigPaths(configRoot, os.homedir())
  let sidebarSettings = loadSidebarSettings(
    configRoot,
    os.homedir(),
    configPaths.user,
    configPaths.project,
    pluginDefaults,
    sidebarStatePath(paths.state, configRoot),
  )
  let projectConfigRoot = configRoot
  project = sidebarSettings.projectDirectory || configRoot
  root = sidebarSettings.fileRoots[sessionID]?.activeRoot || project
  if (!sidebarSettings.fileRoots[sessionID]) sidebarSettings.fileRoots[sessionID] = rootState
  let scriptSettings = sidebarSettings.scripts
  const hoverColor = midpointColor(theme.primary, DIRECTORY_COLORS[0])
  const headerButtonColor = palerColor(theme.accent)
  const [scripts, setScripts] = createSignal(readScripts(project, root, scriptSettings))
  const [scriptsOpen, setScriptsOpen] = createSignal(true)
  const [filesOpen, setFilesOpen] = createSignal(true)
  const [hovered, setHovered] = createSignal<string>()
  // Overflowing hovered names scroll left one cell per tick, pause at both ends, then loop.
  const [marqueeOffset, setMarqueeOffset] = createSignal(0)
  let marqueeTimer: ReturnType<typeof setInterval> | undefined
  const stopMarquee = () => {
    clearInterval(marqueeTimer)
    marqueeTimer = undefined
    setMarqueeOffset(0)
  }
  const startMarquee = (text: string, width: number) => {
    stopMarquee()
    const max = text.length - width
    if (width <= 0 || max <= 0) return
    const startPause = 3
    const endPause = 6
    let tick = 0
    marqueeTimer = setInterval(() => {
      tick = (tick + 1) % (startPause + max + endPause)
      setMarqueeOffset(Math.min(max, Math.max(0, tick - startPause)))
    }, 150)
  }
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set(["."]))
  const [tree, setTree] = createSignal(readTree(root, expanded()))
  const [pins, setPins] = createSignal<ReadonlySet<string>>(new Set(sidebarSettings.scriptPins))
  const [favorites, setFavorites] = createSignal<ReadonlySet<string>>(new Set(sidebarSettings.favoriteFileRoots))
  let refreshCommands = () => {}
  let visibilityRunning = false

  const saveProjectState = () => {
    const { scriptPins, favoriteFileRoots, recentFileRoots, fileRoots } = sidebarSettings
    writeJsonObject(sidebarStatePath(paths.state, projectConfigRoot), {
      scriptPins,
      favoriteFileRoots,
      recentFileRoots,
      fileRoots,
    })
  }

  const loadProjectOwnedState = () => {
    const legacyRootState = loadRootState(kv, sessionID)
    const legacyPins = loadPins(kv, project)
    const legacyRootPins = loadRootPins(kv, project)
    if (
      !sidebarSettings.fileRoots[sessionID] &&
      (legacyRootState.customRoots.length > 0 || legacyRootState.activeRoot)
    ) {
      sidebarSettings.fileRoots[sessionID] = legacyRootState
    }
    if (sidebarSettings.recentFileRoots.length === 0 && legacyRootState.customRoots.length > 0) {
      sidebarSettings.recentFileRoots = dedupeRootPaths(legacyRootState.customRoots)
    }
    if (sidebarSettings.scriptPins.length === 0 && legacyPins.size > 0) sidebarSettings.scriptPins = [...legacyPins]
    if (sidebarSettings.favoriteFileRoots.length === 0 && legacyRootPins.size > 0)
      sidebarSettings.favoriteFileRoots = [...legacyRootPins]
    const projectPath = sidebarConfigPaths(projectConfigRoot, os.homedir()).project
    let hasProjectScripts = false
    try {
      hasProjectScripts = hasConfiguredScripts(JSON.parse(fs.readFileSync(projectPath, "utf8")))
    } catch {
      // Missing or malformed project config is handled by the normalized defaults.
    }
    let hasUserScripts = false
    try {
      hasUserScripts = hasConfiguredScripts(
        JSON.parse(fs.readFileSync(sidebarConfigPaths(projectConfigRoot, os.homedir()).user, "utf8")),
      )
    } catch {
      // Missing or malformed user config is handled by the normalized defaults.
    }
    if (!hasProjectScripts && !hasUserScripts) {
      const legacyScripts = kv.get(scriptSettingsKey(project), undefined)
      if (legacyScripts !== undefined)
        sidebarSettings.scripts = normalizeScriptSettings(legacyScripts, sidebarSettings.scripts)
    }
    // Opening a project writes nothing unless old kv state was carried over.
    if (
      legacyRootState.customRoots.length > 0 ||
      legacyRootState.activeRoot ||
      legacyPins.size > 0 ||
      legacyRootPins.size > 0
    )
      saveProjectState()
  }

  const syncSidebarVisibility = async () => {
    if (visibilityRunning) return
    visibilityRunning = true
    try {
      for (const [id, visible] of [
        ["internal:sidebar-mcp", sidebarSettings.visibility.showMcp],
        ["internal:sidebar-lsp", sidebarSettings.visibility.showLsp],
      ] as const) {
        const plugin = pluginRuntime.status().find((item) => item.id === id)
        if (!plugin || plugin.active === visible) continue
        const changed = visible
          ? await pluginRuntime.commands().activate(id)
          : await pluginRuntime.commands().deactivate(id)
        if (!changed) toast.show({ variant: "warning", message: `Could not ${visible ? "show" : "hide"} ${id}.` })
      }
    } finally {
      visibilityRunning = false
    }
  }

  const loadProjectSettings = () => {
    sessionDirectory = projectRoot(sessionID)
    const promptDirectory = sessionProjectDirectory(
      sync.data.message[sessionID] ?? [],
      (messageID) => sync.data.part[messageID] ?? [],
      os.homedir(),
    )
    configRoot = sessionDirectory === os.homedir() ? promptDirectory || sessionDirectory : sessionDirectory
    projectConfigRoot = configRoot
    const config = sidebarConfigPaths(projectConfigRoot, os.homedir())
    sidebarSettings = loadSidebarSettings(
      projectConfigRoot,
      os.homedir(),
      config.user,
      config.project,
      pluginDefaults,
      sidebarStatePath(paths.state, projectConfigRoot),
    )
    project = sidebarSettings.projectDirectory || projectConfigRoot
    loadProjectOwnedState()
    scriptSettings = sidebarSettings.scripts
    rootState = sidebarSettings.fileRoots[sessionID] ?? { customRoots: [] }
    const nextFavorites = new Set(dedupeRootPaths(sidebarSettings.favoriteFileRoots))
    sidebarSettings.favoriteFileRoots = [...nextFavorites]
    setFavorites(nextFavorites)
    sidebarSettings.recentFileRoots = dedupeRootPaths(sidebarSettings.recentFileRoots)
    const sections = rootSections(sidebarSettings.recentFileRoots, [...nextFavorites])
    rootState = {
      customRoots: [...sections.recentRoots, ...sections.favoriteRoots],
      activeRoot: rootState.activeRoot,
    }
    root = rootState.activeRoot ? normalizeRootPath(rootState.activeRoot) : project
    setPins(new Set(sidebarSettings.scriptPins))
    void syncSidebarVisibility()
  }

  loadProjectSettings()
  ensureSessionScrollbarVisible(kv)

  const modelLabel = () => {
    const selected = local.model.current()
    if (!selected) return "unavailable"
    const provider = sync.data.provider.find((item) => item.id === selected.providerID)
    return provider?.models[selected.modelID]?.name || selected.modelID
  }

  const usage = createSidebarUsage({
    sessionID: () => sessionID,
    routeSessionID: () => props.sessionID,
    settings: () => sidebarSettings,
    hovered,
    setHovered,
    hoverColor,
  })

  const syncSession = (nextSessionID: string) => {
    const nextSessionDirectory = projectRoot(nextSessionID)
    const nextPromptDirectory = sessionProjectDirectory(
      sync.data.message[nextSessionID] ?? [],
      (messageID) => sync.data.part[messageID] ?? [],
      os.homedir(),
    )
    const nextConfigRoot =
      nextSessionDirectory === os.homedir() ? nextPromptDirectory || nextSessionDirectory : nextSessionDirectory
    if (nextConfigRoot === configRoot && nextSessionID === sessionID) return
    sessionID = nextSessionID
    project = nextConfigRoot
    loadProjectSettings()
    usage.loadSettings(sidebarSettings)
    setScriptsOpen(true)
    setFilesOpen(true)
    setExpanded(new Set(["."]))
    setScripts((prev) => reconcileScripts(prev, readScripts(project, root, scriptSettings)))
    setTree((prev) => reconcileTree(prev, readTree(root, expanded())))
    refreshCommands()
    usage.refreshOldUsage()
    void usage.refreshActiveClaudeAccount()
  }
  const refresh = () => {
    const nextSessionID = currentSessionID()
    syncSession(nextSessionID)
    setScripts((prev) => reconcileScripts(prev, readScripts(project, root, scriptSettings)))
    setTree((prev) => reconcileTree(prev, readTree(root, expanded())))
    refreshCommands()
    void syncSidebarVisibility()
  }
  const syncStoredRootState = () => {
    const sections = rootSections(sidebarSettings.recentFileRoots, [...favorites()])
    rootState = {
      customRoots: [...sections.recentRoots, ...sections.favoriteRoots],
      activeRoot: sameRootPath(root, project) ? undefined : normalizeRootPath(root),
    }
    sidebarSettings.fileRoots[sessionID] = rootState
  }

  const isFavorite = (directory: string) => [...favorites()].some((item) => sameRootPath(item, directory))

  const setRoot = (nextRoot: string) => {
    const canonical = normalizeRootPath(nextRoot)
    root = canonical
    if (!sameRootPath(canonical, project)) {
      sidebarSettings.recentFileRoots = rootSections(
        [canonical, ...sidebarSettings.recentFileRoots],
        [...favorites()],
      ).recentRoots
    }
    syncStoredRootState()
    saveProjectState()
    setExpanded(new Set(["."]))
    setScripts((prev) => reconcileScripts(prev, readScripts(project, root, scriptSettings)))
    setTree((prev) => reconcileTree(prev, readTree(root, expanded())))
    refreshCommands()
  }
  const savePins = (next: ReadonlySet<string>) => {
    sidebarSettings.scriptPins = [...next].sort()
    saveProjectState()
  }
  // Pins and favorites are replaced, not mutated, so the signal change re-renders the list and palette.
  const togglePin = (name: string) => {
    const next = new Set(pins())
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setPins(next)
    savePins(next)
    refreshCommands()
    toast.show({ variant: "success", message: `${next.has(name) ? "Pinned" : "Unpinned"} script: ${name}` })
  }
  const toggleFavorite = (customRoot: string) => {
    const canonical = normalizeRootPath(customRoot)
    const current = [...favorites()]
    const existing = current.find((item) => sameRootPath(item, canonical))
    const updated = existing ? current.filter((item) => item !== existing) : [...current, canonical]
    const next = new Set(dedupeRootPaths(updated))
    setFavorites(next)
    sidebarSettings.favoriteFileRoots = [...next].sort()
    sidebarSettings.recentFileRoots = rootSections(sidebarSettings.recentFileRoots, [...next]).recentRoots
    syncStoredRootState()
    saveProjectState()
    refreshCommands()
    toast.show({
      variant: "success",
      message: `${isFavorite(canonical) ? "Favorited" : "Unfavorited"} root: ${canonical}`,
    })
  }
  const runScript = async (script: Script) => {
    const cwd = sync.session.get(sessionID)?.directory ?? project
    const result = await runNativeScript(script, cwd || project)
    if (!result.error) {
      toast.show({ variant: "success", message: `Started ${script.name} in ${result.target}.` })
    } else {
      toast.show({ variant: "error", message: `Could not start ${script.name}: ${result.error}` })
    }
  }
  const toggleDirectory = (relativePath: string) => {
    const next = new Set<string>(expanded())
    if (next.has(relativePath)) next.delete(relativePath)
    else next.add(relativePath)
    setExpanded(next)
    setTree((prev) => reconcileTree(prev, readTree(root, next)))
  }
  const insertChatText = (sessionID: string, text: string) => {
    const ref = sessionID === currentSessionID() ? promptRef.current : undefined
    if (!ref) {
      toast.show({ variant: "warning", message: "Chat input is not ready yet." })
      return
    }
    const input = ref.current.input
    ref.set({ ...ref.current, input: input ? `${input} ${text}` : text })
  }
  const insertPath = (sessionID: string, filePath: string, absolute = false) => {
    const sessionRoot = sync.session.get(sessionID)?.directory
    const relativePath = sessionRoot ? path.relative(sessionRoot, filePath) : filePath
    const mentionPath =
      !absolute && relativePath && !path.isAbsolute(relativePath) && !relativePath.startsWith(`..${path.sep}`)
        ? relativePath
        : filePath
    insertChatText(sessionID, absolute ? `'${filePath}'` : `@${mentionPath.replaceAll(path.sep, "/")}`)
  }
  const pasteScript = (sessionID: string, script: Script) => {
    insertChatText(sessionID, script.filePath ? `'${script.filePath}'` : scriptCommand(script))
  }
  const copyText = async (text: string) => {
    const result = await copyToClipboard(text)
    toast.show(
      result.error
        ? { variant: "error", message: `Could not copy to clipboard: ${result.error}` }
        : { variant: "success", message: "Copied to clipboard" },
    )
  }
  const cycleVariant = () => {
    promptRef.current?.focus()
    const result = keymap.dispatchCommand("variant.cycle")
    if (!result.ok) {
      toast.show({ variant: "error", message: `Could not change reasoning: ${result.reason}` })
    }
  }
  const selectModel = () => {
    const result = keymap.dispatchCommand("model.list")
    if (!result.ok) toast.show({ variant: "error", message: `Could not switch model: ${result.reason}` })
  }
  const { promptForRoot, selectRoot } = createRootPicker({
    project: () => project,
    recentRoots: () => sidebarSettings.recentFileRoots,
    favorites,
    setRoot,
    toggleFavorite,
    insertPath: (filePath) => insertPath(sessionID, filePath),
  })
  const openRootPicker = () => setTimeout(selectRoot, 100)

  const saveScriptSettings = (next: ScriptSettings, message = "Script settings updated") => {
    scriptSettings = normalizeScriptSettings(next, sidebarSettings.scripts)
    sidebarSettings.scripts = scriptSettings
    saveUserScriptSettings(os.homedir(), scriptSettings)
    setScripts((prev) => reconcileScripts(prev, readScripts(project, root, scriptSettings)))
    refreshCommands()
    toast.show({ variant: "success", message })
  }
  const resetScriptSettings = () => {
    scriptSettings = normalizeScriptSettings(null, sidebarSettings.scripts)
    sidebarSettings.scripts = scriptSettings
    saveUserScriptSettings(os.homedir(), scriptSettings)
    setScripts((prev) => reconcileScripts(prev, readScripts(project, root, scriptSettings)))
    refreshCommands()
    toast.show({ variant: "success", message: "Global script settings reset" })
  }
  const { selectScriptSettings } = createScriptSettingsMenu({
    settings: () => scriptSettings,
    save: saveScriptSettings,
    reset: resetScriptSettings,
  })
  const openScriptSettings = () => setTimeout(selectScriptSettings, 100)

  const sidebarCommands = createMemo(() => {
    const rootCommands = rootSections(sidebarSettings.recentFileRoots, [...favorites()])
    const commands = [
      {
        name: "sidebar.refresh",
        title: "Refresh project sidebar",
        category: "Sidebar",
        namespace: "sidebar",
        run: refresh,
      },
      {
        name: "sidebar.script-settings",
        title: "Configure project scripts",
        category: "Project scripts",
        namespace: "sidebar",
        run: selectScriptSettings,
      },
      {
        ...USAGE_MENU_COMMAND,
        run: usage.selectUsageMenu,
      },
      {
        name: "sidebar.usage-calendar",
        title: "Show usage calendar",
        category: "Sidebar",
        namespace: "sidebar",
        run: usage.selectUsageCalendar,
      },
      {
        name: "sidebar.usage-settings",
        title: "Configure usage providers",
        category: "Sidebar",
        namespace: "sidebar",
        run: usage.selectUsageSettings,
      },
      {
        name: "sidebar.file-root.set",
        title: "Set file root",
        category: "Project files",
        namespace: "sidebar",
        run: promptForRoot,
      },
      {
        name: "sidebar.file-root.switch",
        title: "Switch file root",
        category: "Project files",
        namespace: "sidebar",
        run: selectRoot,
      },
      {
        name: "sidebar.file-root.reset",
        title: "Reset file root to project",
        category: "Project files",
        namespace: "sidebar",
        run: () => setRoot(project),
      },
      ...rootCommands.favoriteRoots.map((customRoot) => ({
        name: commandId("file-root-favorite", customRoot),
        title: `Unfavorite file root: ${customRoot}`,
        category: "Project files",
        namespace: "sidebar",
        run: () => toggleFavorite(customRoot),
      })),
      ...rootCommands.recentRoots.map((customRoot) => ({
        name: commandId("file-root-favorite", customRoot),
        title: `Favorite file root: ${customRoot}`,
        category: "Project files",
        namespace: "sidebar",
        run: () => toggleFavorite(customRoot),
      })),
      ...scripts().flatMap((script) => [
        {
          name: commandId("run", script.name),
          title: `Run script: ${script.name}`,
          category: "Project scripts",
          namespace: "sidebar",
          run: () => runScript(script),
        },
        {
          name: commandId("pin", script.name),
          title: `${pins().has(script.name) ? "Unpin" : "Pin"} script: ${script.name}`,
          category: "Project scripts",
          namespace: "sidebar",
          run: () => togglePin(script.name),
        },
      ]),
      ...tree()
        .filter((entry) => entry.directory)
        .map((entry) => ({
          name: commandId("toggle", entry.relativePath),
          title: `${expanded().has(entry.relativePath) ? "Collapse" : "Expand"}: ${entry.relativePath}`,
          category: "Project files",
          namespace: "sidebar",
          run: () => toggleDirectory(entry.relativePath),
        })),
    ]
    return commands
  })
  let commandDisposer: (() => void) | undefined
  createEffect(() => {
    commandDisposer?.()
    commandDisposer = keymap.registerLayer({ commands: sidebarCommands() })
  })
  refreshCommands = () => {
    commandDisposer?.()
    commandDisposer = keymap.registerLayer({ commands: sidebarCommands() })
  }
  onCleanup(() => commandDisposer?.())
  onCleanup(event.on("file.watcher.updated", refresh))
  onCleanup(
    event.on("tui.session.select", () =>
      queueMicrotask(() => {
        refresh()
        usage.refreshOldUsage()
      }),
    ),
  )
  onCleanup(
    event.on("message.updated", (evt) => {
      queueMicrotask(refresh)
      const info = evt.properties.info
      if (info.role !== "assistant" || info.time.completed === undefined) return
      const provider = usageProviderForModel(info.providerID)
      if (provider) usage.request([provider])
    }),
  )
  void syncSidebarVisibility()
  onCleanup(() => clearInterval(marqueeTimer))
  createEffect(() => syncSession(props.sessionID))
  const visibleScripts = createMemo(() =>
    [...scripts()].sort((a, b) => {
      const pinOrder = Number(pins().has(b.name)) - Number(pins().has(a.name))
      return pinOrder || a.name.localeCompare(b.name)
    }),
  )
  const changed = createMemo(() =>
    (sync.data.session_diff[props.sessionID] ?? []).filter((file) => file.file).slice(0, 6),
  )
  const openChangedFile = (filePath: string) => {
    void import("../../../editor")
      .then(({ openFileAtLocation }) =>
        openFileAtLocation({
          filePath,
          cwd: projectRoot(),
          editor: tuiConfig.openEditedWith,
        }),
      )
      .catch((error) =>
        toast.show({ variant: "error", message: error instanceof Error ? error.message : String(error) }),
      )
  }

  const outlinedButtons = () => tuiConfig.sidebar_button_style === "outlined"
  const subagentsLabel = () => {
    const off = sessionDisabled(sync.session.get(props.sessionID)?.metadata)
    if (off.includes("*")) return "Subagents: all off"
    return off.length > 0 ? `Subagents: ${off.length} off` : "Subagents"
  }
  // Pinned names whose command is not registered yet (e.g. a late plugin) render nothing but stay saved.
  const buttonCommands = useKeymapSelector(
    (keymap) =>
      new Map(
        keymap.getCommandEntries({ visibility: "registered" }).map((entry) => [entry.command.name, entry.command]),
      ),
  )
  const buttonLabel = (name: string, title: unknown) => {
    switch (name) {
      case "session.list":
        return "Switch Session"
      case "command.palette.show":
        return "Command Palette"
      case "oc.settings_palette":
        return "oc Palette"
      case "oc.session_subagents":
        return subagentsLabel()
    }
    return typeof title === "string" ? title : name
  }

  return (
    <>
      <box flexDirection="column" gap={0}>
        <For each={tuiConfig.sidebar_buttons}>
          {(name) => (
            <Show when={buttonCommands().get(name)}>
              {(command) => {
                const label = () => buttonLabel(name, command().title)
                return (
                  <HeaderButton
                    value={label()}
                    outlined={outlinedButtons()}
                    color={headerButtonColor}
                    hoverColor={hoverColor}
                    onClick={() => keymap.dispatchCommand(name)}
                    onRightClick={() => toggleSidebarButton(tuiConfig, toast, name, label())}
                  />
                )
              }}
            </Show>
          )}
        </For>
        <box flexDirection={outlinedButtons() ? "column" : "row"} gap={outlinedButtons() ? 0 : 1}>
          <HeaderButton
            value={modelLabel()}
            outlined={outlinedButtons()}
            color={headerButtonColor}
            hoverColor={hoverColor}
            onClick={selectModel}
          />
          <Show when={local.model.variant.list().length > 0}>
            <HeaderButton
              value={local.model.variant.current() ?? "default"}
              secondary
              outlined={outlinedButtons()}
              color={headerButtonColor}
              hoverColor={hoverColor}
              onClick={cycleVariant}
            />
          </Show>
        </box>
      </box>
      <box flexDirection="column" gap={0}>
        {usage.view()}
      </box>
      {props.children}
      <box flexDirection="column" gap={1} paddingTop={1} paddingBottom={1}>
        <box
          flexDirection="row"
          gap={1}
          paddingRight={1}
          onMouseOver={() => setHovered("scripts")}
          onMouseOut={() => setHovered()}
          onMouseDown={(event) => {
            if (event.button === 0) openScriptSettings()
          }}
        >
          <SidebarToggle
            open={scriptsOpen()}
            fg={hovered() === "scripts" ? hoverColor : theme.text}
            onMouseDown={(event) => {
              event.stopPropagation()
              if (event.button === 0) setScriptsOpen((open) => !open)
            }}
            onMouseUp={(event) => event.stopPropagation()}
          />
          <text
            fg={hovered() === "scripts" ? hoverColor : theme.accent}
            selectable={false}
            onMouseDown={(event) => {
              event.stopPropagation()
              if (event.button === 0) openScriptSettings()
            }}
          >
            <b>scripts</b>
          </text>
        </box>
        <Show when={scriptsOpen()}>
          <For each={visibleScripts()} fallback={<text fg={theme.textMuted}>No scripts found</text>}>
            {(script) => {
              // Box, not text: OpenTUI text overrides onResize and never calls onSizeChange.
              let row: BoxRenderable | undefined
              // Row width minus 1-cell padding on each side and the 2-cell pin prefix.
              const [nameWidth, setNameWidth] = createSignal(0)
              return (
                <box
                  ref={(el) => (row = el)}
                  onSizeChange={() => setNameWidth((row?.width ?? 0) - 4)}
                  paddingLeft={1}
                  paddingRight={1}
                  onMouseOver={() => {
                    setHovered(`script:${script.name}`)
                    startMarquee(script.name, nameWidth())
                  }}
                  onMouseOut={() => {
                    setHovered()
                    stopMarquee()
                  }}
                  onMouseDown={(event) => {
                    if (event.button === 2) {
                      pasteScript(props.sessionID, script)
                      void copyText(scriptClipboardText(script))
                    }
                    if (event.button === 0) void runScript(script)
                  }}
                >
                  <text
                    wrapMode="none"
                    fg={
                      hovered() === `script:${script.name}`
                        ? hoverColor
                        : pins().has(script.name)
                          ? theme.primary
                          : theme.text
                    }
                  >
                    {pins().has(script.name) ? "* " : "  "}
                    {clipEnd(
                      hovered() === `script:${script.name}` ? script.name.slice(marqueeOffset()) : script.name,
                      nameWidth(),
                    )}
                  </text>
                </box>
              )
            }}
          </For>
        </Show>
        <box
          flexDirection="row"
          gap={1}
          paddingRight={1}
          onMouseOver={() => setHovered("files")}
          onMouseOut={() => setHovered()}
          onMouseDown={(event) => {
            if (event.button === 0) openRootPicker()
          }}
        >
          <SidebarToggle
            open={filesOpen()}
            fg={hovered() === "files" ? hoverColor : theme.text}
            onMouseDown={(event) => {
              event.stopPropagation()
              if (event.button === 0) setFilesOpen((open) => !open)
            }}
            onMouseUp={(event) => event.stopPropagation()}
          />
          <text
            fg={hovered() === "files" ? hoverColor : theme.accent}
            selectable={false}
            onMouseDown={(event) => {
              if (event.button === 0) {
                event.stopPropagation()
                openRootPicker()
              }
            }}
          >
            <b>files</b>
          </text>
          <text fg={hovered() === "files" ? hoverColor : theme.textMuted}>[{path.basename(root)}]</text>
        </box>
        <Show when={filesOpen()}>
          <text fg="#AC98C7">{displayPath(root, os.homedir())}</text>
          <box flexDirection="column" gap={1}>
            <For each={tree()} fallback={<text fg={theme.textMuted}>No visible files</text>}>
              {(entry) => {
                let row: BoxRenderable | undefined
                // Row width minus 1-cell padding on each side, the indent, and the 2-cell marker.
                const [nameWidth, setNameWidth] = createSignal(0)
                return (
                  <box
                    ref={(el) => (row = el)}
                    onSizeChange={() => setNameWidth((row?.width ?? 0) - 4 - entry.depth * 2)}
                    flexDirection="row"
                    paddingLeft={1}
                    paddingRight={1}
                    onMouseOver={() => {
                      setHovered(`tree:${entry.relativePath}`)
                      startMarquee(entry.name, nameWidth())
                    }}
                    onMouseOut={() => {
                      setHovered()
                      stopMarquee()
                    }}
                    onMouseDown={(event) => {
                      if (event.button === 2) {
                        insertPath(props.sessionID, entry.fullPath, true)
                        void copyText(fileClipboardText(entry.fullPath))
                        return
                      }
                      if (entry.directory) toggleDirectory(entry.relativePath)
                      else insertPath(props.sessionID, entry.fullPath, true)
                    }}
                  >
                    <text
                      flexShrink={0}
                      fg={
                        hovered() === `tree:${entry.relativePath}`
                          ? hoverColor
                          : entry.directory
                            ? directoryColor(entry.depth, DIRECTORY_INDICATOR_COLORS)
                            : theme.text
                      }
                    >
                      {"  ".repeat(entry.depth)}
                    </text>
                    <text
                      flexShrink={0}
                      fg={
                        hovered() === `tree:${entry.relativePath}`
                          ? hoverColor
                          : entry.directory
                            ? directoryColor(entry.depth, DIRECTORY_INDICATOR_COLORS)
                            : theme.text
                      }
                    >
                      {entry.directory ? (expanded().has(entry.relativePath) ? "- " : "+ ") : "  "}
                    </text>
                    <text
                      flexShrink={1}
                      minWidth={0}
                      wrapMode="none"
                      fg={
                        hovered() === `tree:${entry.relativePath}`
                          ? hoverColor
                          : entry.directory
                            ? directoryColor(entry.depth, DIRECTORY_COLORS)
                            : theme.text
                      }
                    >
                      {clipEnd(
                        hovered() === `tree:${entry.relativePath}` ? entry.name.slice(marqueeOffset()) : entry.name,
                        nameWidth(),
                      )}
                    </text>
                  </box>
                )
              }}
            </For>
            <Show when={tree().length >= MAX_TREE_ITEMS}>
              <text fg={theme.textMuted}>File list truncated. Use refresh or collapse folders.</text>
            </Show>
          </box>
          <Show when={changed().length > 0}>
            <text fg={theme.accent}>
              <b>Changed Files</b>
            </text>
            <For each={changed()}>
              {(file) => (
                <box
                  flexDirection="row"
                  gap={1}
                  justifyContent="space-between"
                  onMouseUp={(event) => {
                    if (event.button === 0 && file.file) openChangedFile(file.file)
                  }}
                >
                  <text fg={theme.textMuted}>{file.file}</text>
                  <box flexDirection="row" gap={1} flexShrink={0}>
                    <Show when={file.additions}>
                      <text fg={theme.diffAdded}>{`+${file.additions}`}</text>
                    </Show>
                    <Show when={file.deletions}>
                      <text fg={theme.diffRemoved}>{`-${file.deletions}`}</text>
                    </Show>
                  </box>
                </box>
              )}
            </For>
          </Show>
        </Show>
      </box>
    </>
  )
}

export function SidebarToolsFooter(props: { sessionID: string }) {
  const project = useProject()
  const sync = useSync()
  const { theme } = useTheme()
  const session = sync.session.get(props.sessionID)
  const directory = session?.directory || project.instance.path().directory
  const branch = session?.directory === project.instance.path().directory ? sync.data.vcs?.branch : undefined
  return (
    <box gap={1}>
      <text>{footerPath(directory, os.homedir(), branch)}</text>
      <text fg={theme.textMuted}>
        <span style={{ fg: theme.success }}>-</span> oc v{InstallationDisplayVersion.split("-")[0]} ∙ OG v
        {InstallationVersion}
      </text>
    </box>
  )
}
