import { For, Show, createEffect, createMemo, createSignal, onCleanup, type ParentProps } from "solid-js"
import type { BoxRenderable } from "@opentui/core"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { useProject } from "../../../context/project"
import { useSync } from "../../../context/sync"
import { useEvent } from "../../../context/event"
import { useKV } from "../../../context/kv"
import { useTuiConfig } from "../../../config"
import { HeaderButton } from "./headerButton"
import { useTheme } from "../../../context/theme"
import { useTuiPaths } from "../../../context/runtime"
import { useLocal } from "../../../context/local"
import { usePromptRef } from "../../../context/prompt"
import { DialogPrompt } from "../../../ui/dialog-prompt"
import { DialogSelect, type DialogSelectProps } from "../../../ui/dialog-select"
import { useDialog } from "../../../ui/dialog"
import { useToast } from "../../../ui/toast"
import { usePluginRuntime } from "../../../plugin/runtime"
import { useOpencodeKeymap } from "../../../keymap"
import { InstallationDisplayVersion, InstallationVersion } from "@opencode-ai/core/installation/version"
import {
  BUILTIN_SHELLS,
  clearCursorSessionToken,
  defaultScriptSettings,
  defaultSidebarSettings,
  dedupeRootPaths,
  displayPath,
  ensureSessionScrollbarVisible,
  hasConfiguredScripts,
  isDirectory,
  loadSidebarSettings,
  normalizeExtension,
  normalizeRootPath,
  normalizeScriptSettings,
  parseLauncher,
  readCursorSessionToken,
  readScripts,
  readTree,
  rootSections,
  runEverythingSearch,
  sameRootPath,
  saveSidebarSettings,
  saveUserScriptSettings,
  saveUserUsageProviders,
  sessionProjectDirectory,
  sidebarConfigPaths,
  updateLanguage,
  scriptTerminals,
  resolveScriptTerminal,
  writeCursorSessionToken,
  type Script,
  type ScriptLanguage,
  type ScriptSettings,
  type SidebarSettings,
  type WezTermSplitSize,
} from "./helpers.js"
import {
  cursorSessionCookie,
  createUsageRefreshScheduler,
  orderUsageWindows,
  probeClaudeCodePool,
  probeClaudeCodeUsage,
  probeCursorUsage,
  probeOpenAIUsage,
  probeOpenCodeGoUsage,
  probeOpenRouterUsage,
  shouldRefreshUsageAfterIdle,
  shouldRefreshUsageProvider,
  updateUsageSnapshot,
  usageProviderForModel,
  USAGE_PROVIDER_OPTIONS,
  windowLabel,
  type CursorUsage,
  type ClaudeCodeUsage,
  type OpenAIUsage,
  type OpenCodeGoUsage,
  type OpenRouterUsage,
  type UsageProviderId,
  type UsageWindow,
  type UsageSnapshot,
} from "./usage.js"
import {
  copyToClipboard,
  fileClipboardText,
  runScript as runNativeScript,
  scriptClipboardText,
  scriptCommand,
} from "./script-runner.js"

const DIRECTORY_COLORS = ["#F7E9B5", "#F4E1A0", "#F1D98B", "#EED076", "#EBC861"]
const DIRECTORY_INDICATOR_COLORS = ["#DCCF99", "#D5C184", "#CEB56F", "#C7A95A", "#C09D45"]
const MAX_TREE_ITEMS = 80
const ADD_ROOT = "__sidebar_add_custom_root__"
const RESET_ROOT = "__sidebar_reset_project_root__"
const FAVORITE_HELP = "__sidebar_favorite_help__"
const FILE_ROOT_PREFIX = "file:"
const ADD_SCRIPT_EXECUTABLE = "__sidebar_add_script_executable__"
const ADD_SCRIPT_EXTENSION = "__sidebar_add_script_extension__"
const RESET_SCRIPT_SETTINGS = "__sidebar_reset_script_settings__"
const SCRIPT_SHELL_SECTION = "__sidebar_script_shell_section__"
const SCRIPT_LANGUAGE_SECTION = "__sidebar_script_language_section__"
const SCRIPT_EXTENSION_SECTION = "__sidebar_script_extension_section__"

let everythingSearchHintShown = false
const WEZTERM_SIZE_SECTION = "__sidebar_wezterm_size_section__"
const USAGE_REFRESH_INTERVAL_MS = 5 * 60 * 1000

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
  const kv = useKV()
  const { theme } = useTheme()
  const paths = useTuiPaths()
  const tuiConfig = useTuiConfig()
  const local = useLocal()
  const promptRef = usePromptRef()
  const dialog = useDialog()
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
  // OpenTUI's native truncate puts the ellipsis mid-text; clip at the end instead.
  const clipEnd = (text: string, width: number) =>
    width <= 0 || text.length <= width ? text : `${text.slice(0, Math.max(0, width - 3))}...`
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
  const [usage, setUsage] = createSignal<UsageSnapshot<OpenAIUsage>>({ ok: false })
  const [goUsage, setGoUsage] = createSignal<UsageSnapshot<OpenCodeGoUsage>>({ ok: false })
  const [openRouterUsage, setOpenRouterUsage] = createSignal<UsageSnapshot<OpenRouterUsage>>({ ok: false })
  const [cursorUsage, setCursorUsage] = createSignal<UsageSnapshot<CursorUsage>>({ ok: false })
  const [claudeCodeUsage, setClaudeCodeUsage] = createSignal<UsageSnapshot<ClaudeCodeUsage>>({ ok: false })
  const [showRemaining, setShowRemaining] = createSignal(false)
  const [showGoRemaining, setShowGoRemaining] = createSignal(false)
  const [showOrRemaining, setShowOrRemaining] = createSignal(false)
  const [showCursorRemaining, setShowCursorRemaining] = createSignal(false)
  const [usageProviders, setUsageProviders] = createSignal<UsageProviderId[]>([...sidebarSettings.usageProviders])
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set(["."]))
  const [tree, setTree] = createSignal(readTree(root, expanded()))
  let pins = new Set(sidebarSettings.scriptPins)
  let favorites = new Set(sidebarSettings.favoriteFileRoots)
  let cursorSessionToken = readCursorSessionToken(os.homedir())
  const usageRunning = new Set<UsageProviderId>()
  const usageRequestedAt: Partial<Record<UsageProviderId, number>> = {}
  const [usageNow, setUsageNow] = createSignal(Date.now())
  const usageAbort = new AbortController()
  let usageScheduler: ReturnType<typeof createUsageRefreshScheduler>
  let refreshCommands = () => {}
  let visibilityRunning = false

  const saveProjectSettings = () => {
    const paths = sidebarConfigPaths(projectConfigRoot, os.homedir())
    const projectSettings = { ...sidebarSettings }
    delete (projectSettings as { scripts?: ScriptSettings }).scripts
    delete (projectSettings as { usageProviders?: UsageProviderId[] }).usageProviders
    saveSidebarSettings(paths.project, projectSettings)
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
    if (
      !hasProjectScripts ||
      legacyRootState.customRoots.length > 0 ||
      legacyRootState.activeRoot ||
      legacyPins.size > 0 ||
      legacyRootPins.size > 0
    )
      saveProjectSettings()
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
    const paths = sidebarConfigPaths(projectConfigRoot, os.homedir())
    sidebarSettings = loadSidebarSettings(projectConfigRoot, os.homedir(), paths.user, paths.project, pluginDefaults)
    project = sidebarSettings.projectDirectory || projectConfigRoot
    loadProjectOwnedState()
    scriptSettings = sidebarSettings.scripts
    rootState = sidebarSettings.fileRoots[sessionID] ?? { customRoots: [] }
    favorites = new Set(dedupeRootPaths(sidebarSettings.favoriteFileRoots))
    sidebarSettings.favoriteFileRoots = [...favorites]
    sidebarSettings.recentFileRoots = dedupeRootPaths(sidebarSettings.recentFileRoots)
    const sections = rootSections(sidebarSettings.recentFileRoots, [...favorites])
    rootState = {
      customRoots: [...sections.recentRoots, ...sections.favoriteRoots],
      activeRoot: rootState.activeRoot,
    }
    root = rootState.activeRoot ? normalizeRootPath(rootState.activeRoot) : project
    pins = new Set(sidebarSettings.scriptPins)
    setUsageProviders([...sidebarSettings.usageProviders])
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

  const refreshUsage = async (providers = usageProviders()) => {
    await Promise.all(providers.filter((provider) => usageProviders().includes(provider)).map(async (provider) => {
      if (usageRunning.has(provider) || usageAbort.signal.aborted) return
      usageRunning.add(provider)
      usageRequestedAt[provider] = Date.now()
      try {
        const options = { signal: usageAbort.signal }
        if (provider === "openai") {
          const next = await probeOpenAIUsage(options)
          if (!usageAbort.signal.aborted) setUsage((previous) => updateUsageSnapshot(previous, next, Date.now()))
          return
        }
        if (provider === "opencode-go") {
          const next = await probeOpenCodeGoUsage(options)
          if (!usageAbort.signal.aborted) setGoUsage((previous) => updateUsageSnapshot(previous, next, Date.now()))
          return
        }
        if (provider === "openrouter") {
          const next = await probeOpenRouterUsage(options)
          if (!usageAbort.signal.aborted) setOpenRouterUsage((previous) => updateUsageSnapshot(previous, next, Date.now()))
          return
        }
        if (provider === "claude-code") {
          // Pooled accounts (the provider's `accounts` option) show as one meter.
          const accounts = sync.data.config.provider?.["claude-code"]?.options?.accounts
          const dirs = Array.isArray(accounts) ? accounts.filter((dir): dir is string => typeof dir === "string") : []
          const next = dirs.length > 1 ? await probeClaudeCodePool(dirs, options) : await probeClaudeCodeUsage(options)
          if (!usageAbort.signal.aborted) setClaudeCodeUsage((previous) => updateUsageSnapshot(previous, next, Date.now()))
          return
        }
        const next = await probeCursorUsage({ ...options, cursorSessionToken })
        const retry = !next.ok && next.reason === "reauthenticate" && !!cursorSessionToken
        if (retry) {
          clearCursorSessionToken(os.homedir())
          cursorSessionToken = undefined
        }
        const cursor = retry ? await probeCursorUsage(options) : next
        if (!usageAbort.signal.aborted) setCursorUsage((previous) => updateUsageSnapshot(previous, cursor, Date.now()))
      } finally {
        usageRunning.delete(provider)
        setUsageNow(Date.now())
      }
    }))
  }
  const refreshOldUsage = () => {
    const snapshots = {
      openai: usage(),
      "opencode-go": goUsage(),
      openrouter: openRouterUsage(),
      cursor: cursorUsage(),
      "claude-code": claudeCodeUsage(),
    }
    void refreshUsage(usageProviders().filter((provider) =>
      Date.now() - (snapshots[provider].fetchedAt ?? 0) > 60_000,
    ))
  }
  const usageColor = (snapshot: UsageSnapshot<{ ok: boolean }>) =>
    snapshot.stale || snapshot.source === "cache" || usageNow() - (snapshot.fetchedAt ?? 0) > 600_000
      ? theme.textMuted
      : theme.text
  usageScheduler = createUsageRefreshScheduler({
    refresh: refreshUsage,
    fallbackIntervalMs: USAGE_REFRESH_INTERVAL_MS,
  })
  usageScheduler.request()

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
    setScriptsOpen(true)
    setFilesOpen(true)
    setExpanded(new Set(["."]))
    setScripts(readScripts(project, root, scriptSettings))
    setTree(readTree(root, expanded()))
    refreshCommands()
    refreshOldUsage()
  }
  const refresh = () => {
    const nextSessionID = currentSessionID()
    syncSession(nextSessionID)
    setScripts(readScripts(project, root, scriptSettings))
    setTree(readTree(root, expanded()))
    refreshCommands()
    void syncSidebarVisibility()
  }
  const syncStoredRootState = () => {
    const sections = rootSections(sidebarSettings.recentFileRoots, [...favorites])
    rootState = {
      customRoots: [...sections.recentRoots, ...sections.favoriteRoots],
      activeRoot: sameRootPath(root, project) ? undefined : normalizeRootPath(root),
    }
    sidebarSettings.fileRoots[sessionID] = rootState
  }

  const isFavorite = (directory: string) => [...favorites].some((item) => sameRootPath(item, directory))

  const setRoot = (nextRoot: string) => {
    const canonical = normalizeRootPath(nextRoot)
    root = canonical
    if (!sameRootPath(canonical, project)) {
      sidebarSettings.recentFileRoots = rootSections(
        [canonical, ...sidebarSettings.recentFileRoots],
        [...favorites],
      ).recentRoots
    }
    syncStoredRootState()
    saveProjectSettings()
    setExpanded(new Set(["."]))
    setScripts(readScripts(project, root, scriptSettings))
    setTree(readTree(root, expanded()))
    refreshCommands()
  }
  const savePins = () => {
    sidebarSettings.scriptPins = [...pins].sort()
    saveProjectSettings()
  }
  const togglePin = (name: string) => {
    if (pins.has(name)) pins.delete(name)
    else pins.add(name)
    savePins()
    refreshCommands()
    toast.show({ variant: "success", message: `${pins.has(name) ? "Pinned" : "Unpinned"} script: ${name}` })
  }
  const toggleFavorite = (customRoot: string) => {
    const canonical = normalizeRootPath(customRoot)
    const existing = [...favorites].find((item) => sameRootPath(item, canonical))
    if (existing) favorites.delete(existing)
    else favorites.add(canonical)
    favorites = new Set(dedupeRootPaths([...favorites]))
    sidebarSettings.favoriteFileRoots = [...favorites].sort()
    sidebarSettings.recentFileRoots = rootSections(sidebarSettings.recentFileRoots, [...favorites]).recentRoots
    syncStoredRootState()
    saveProjectSettings()
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
  const codexWindows = (): { weekly?: UsageWindow; monthly?: UsageWindow; reauthenticate: boolean } => {
    const snapshot = usage()
    if (!snapshot.ok)
      return { weekly: undefined, monthly: undefined, reauthenticate: snapshot.reason === "reauthenticate" }
    const [shortest, longest] = orderUsageWindows([snapshot.primary, snapshot.secondary])
    return { weekly: shortest, monthly: longest, reauthenticate: false }
  }
  const promptCursorToken = () =>
    dialog.replace(() => (
      <DialogPrompt
        title="Connect Cursor usage"
        description={() => (
          <text>
            1. Open cursor.com in a browser while logged in (or stay signed into the Cursor app). 2. If the app is
            signed in, cancel and wait: the sidebar will retry from the app. 3. Otherwise: in the browser, open
            DevTools, Application (or Storage), Cookies, cursor.com, copy the value of WorkosCursorSessionToken. 4.
            Paste that value here (a long user::eyJ... string is fine).
          </text>
        )}
        placeholder="user::eyJ..."
        onConfirm={(value) => {
          const trimmed = value.trim()
          if (!cursorSessionCookie(trimmed)) {
            toast.show({ variant: "error", message: "That does not look like a Cursor session cookie" })
            return
          }
          writeCursorSessionToken(os.homedir(), trimmed)
          cursorSessionToken = trimmed
          toast.show({ variant: "success", message: "Cursor usage connected" })
          dialog.clear()
          usageScheduler.request()
        }}
        onCancel={() => dialog.clear()}
      />
    ))
  const usageRows = () => {
    const codex = codexWindows()
    const codexSide = (window: UsageWindow | undefined) =>
      window?.usedPercent === null || window?.usedPercent === undefined
        ? "unavailable"
        : `${windowLabel(window.minutes)}${showRemaining() ? 100 - window.usedPercent : window.usedPercent}%`
    const codexHasData = Boolean(codex.weekly || codex.monthly)
    const codexValue = codex.reauthenticate
      ? "run /connect"
      : !codexHasData
        ? "unavailable"
        : codex.monthly
          ? `${codexSide(codex.weekly)}, ${codexSide(codex.monthly)}`
          : codexSide(codex.weekly)
    const codexDates = [codex.weekly?.resetAt, ...(codex.monthly?.resetAt ? [codex.monthly.resetAt] : [])]
      .filter(Boolean)
      .join(", ")
    const goSnapshot = goUsage()
    const goOk = goSnapshot.ok ? goSnapshot : undefined
    const goSide = (window: UsageWindow) =>
      window.usedPercent === null
        ? "unavailable"
        : `${windowLabel(window.minutes)}${showGoRemaining() ? 100 - window.usedPercent : window.usedPercent}%`
    const goValue = !goOk
      ? "unavailable"
      : goOk.monthly
        ? `${goSide(goOk.weekly)}, ${goSide(goOk.monthly)}`
        : goSide(goOk.weekly)
    const goDates = goOk
      ? [goOk.weekly.resetAt, ...(goOk.monthly?.resetAt ? [goOk.monthly.resetAt] : [])].filter(Boolean).join(", ")
      : ""
    const orSnapshot = openRouterUsage()
    const orOk = orSnapshot.ok ? orSnapshot : undefined
    const orValue = orOk ? `${showOrRemaining() ? orOk.remainingPercent : orOk.usedPercent}%` : "unavailable"
    const cursorSnapshot = cursorUsage()
    const cursorOk = cursorSnapshot.ok ? cursorSnapshot.monthly : undefined
    const cursorSide = (label: string, used: number | null | undefined) =>
      used === null || used === undefined ? "unavailable" : `${label}${showCursorRemaining() ? 100 - used : used}%`
    const cursorValue = `${cursorSide("m", cursorOk?.usedPercent)}; ${cursorSide("api", cursorOk?.apiUsedPercent)}`
    const cursorNeedsToken =
      !cursorSnapshot.ok && (cursorSnapshot.reason === "need-token" || cursorSnapshot.reason === "reauthenticate")
    const claudeSnapshot = claudeCodeUsage()
    const claudeOk = claudeSnapshot.ok ? claudeSnapshot : undefined
    const claudeValue = claudeOk
      ? `5h${claudeOk.fiveHour.usedPercent}%, w${(claudeOk.weeklyEach ?? [claudeOk.weekly.usedPercent]).join("%/")}%`
      : "unavailable"
    const claudeDates = claudeOk
      ? [claudeOk.fiveHour.resetAt, claudeOk.weekly.resetAt].filter(Boolean).join(" / ")
      : "unavailable"
    return (
      <>
        <box
          flexDirection="row"
          gap={1}
          onMouseOver={() => setHovered("usage-settings")}
          onMouseOut={() => setHovered()}
          onMouseUp={(event) => {
            if (event.button === 0) openUsageSettings()
          }}
        >
          <text fg={hovered() === "usage-settings" ? hoverColor : theme.text}>Weekly Usage:</text>
        </box>
        <Show when={usageProviders().length === 0}>
          <box flexDirection="row" gap={1}>
            <text fg={theme.textMuted}>No usage providers selected</text>
          </box>
        </Show>
        <Show when={usageProviders().includes("openai")}>
          <box
            flexDirection="row"
            gap={1}
            onMouseOver={() => setHovered("usage")}
            onMouseOut={() => setHovered()}
            onMouseUp={(event) => {
              if (event.button === 0) setShowRemaining((value) => !value)
            }}
          >
            <text fg={usageColor(usage())}>
              {!codex.reauthenticate && codexHasData && showRemaining() ? "Codex remaining:" : "Codex:"}
            </text>
            <text fg={theme.textMuted}>{codexValue}</text>
          </box>
          <box flexDirection="row" gap={1}>
            <text fg={theme.textMuted}>
              {codexDates || (codex.reauthenticate ? "OpenAI auth required" : "unavailable")}
            </text>
          </box>
        </Show>
        <Show when={usageProviders().includes("claude-code")}>
          <box flexDirection="row" gap={1}>
            <text fg={usageColor(claudeSnapshot)}>Claude:</text>
            <text fg={theme.textMuted}>{claudeValue}</text>
          </box>
          <box flexDirection="row" gap={1}>
            <text fg={theme.textMuted}>{claudeDates}</text>
          </box>
        </Show>
        <Show when={usageProviders().includes("cursor")}>
          <box
            flexDirection="row"
            gap={1}
            onMouseOver={() => setHovered("cursor-usage")}
            onMouseOut={() => setHovered()}
            onMouseUp={(event) => {
              if (event.button === 2) {
                promptCursorToken()
                return
              }
              if (event.button === 0) {
                if (cursorNeedsToken) promptCursorToken()
                else setShowCursorRemaining((value) => !value)
              }
            }}
          >
            <text fg={usageColor(cursorSnapshot)}>{showCursorRemaining() && !cursorNeedsToken ? "Cursor remaining:" : "Cursor:"}</text>
            <text fg={theme.textMuted}>{cursorNeedsToken ? "sign in" : cursorValue}</text>
          </box>
          <box flexDirection="row" gap={1}>
            <text fg={theme.textMuted}>
              {cursorOk?.resetAt || (cursorNeedsToken ? "Cursor auth required" : "unavailable")}
            </text>
          </box>
          <Show when={!cursorSnapshot.ok && cursorSnapshot.reason === "reauthenticate"}>
            <box flexDirection="row" gap={1}>
              <text fg={theme.textMuted}>click Cursor: to paste a new cookie</text>
            </box>
          </Show>
        </Show>
        <Show when={usageProviders().includes("opencode-go")}>
          <box
            flexDirection="row"
            gap={1}
            onMouseOver={() => setHovered("go-usage")}
            onMouseOut={() => setHovered()}
            onMouseUp={(event) => {
              if (event.button === 0) setShowGoRemaining((value) => !value)
            }}
          >
            <text fg={usageColor(goSnapshot)}>{showGoRemaining() ? "OpenCode Go remaining:" : "OpenCode Go:"}</text>
            <text fg={theme.textMuted}>{goValue}</text>
          </box>
          <box flexDirection="row" gap={1}>
            <text fg={theme.textMuted}>{goDates || "unavailable"}</text>
          </box>
        </Show>
        <Show when={usageProviders().includes("openrouter")}>
          <box
            flexDirection="row"
            gap={1}
            onMouseOver={() => setHovered("or-usage")}
            onMouseOut={() => setHovered()}
            onMouseUp={(event) => {
              if (event.button === 0) setShowOrRemaining((value) => !value)
            }}
          >
            <text fg={usageColor(orSnapshot)}>{orOk && showOrRemaining() ? "OpenRouter remaining:" : "OpenRouter:"}</text>
            <text fg={theme.textMuted}>{orValue}</text>
          </box>
          <Show when={orOk}>
            <box flexDirection="row" gap={1}>
              <text fg={theme.textMuted}>{`$${orOk?.usedUsd.toFixed(2)} / $${orOk?.limitUsd.toFixed(2)}`}</text>
            </box>
          </Show>
        </Show>
      </>
    )
  }
  const toggleDirectory = (relativePath: string) => {
    const next = new Set<string>(expanded())
    if (next.has(relativePath)) next.delete(relativePath)
    else next.add(relativePath)
    setExpanded(next)
    setTree(readTree(root, next))
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
  const promptForRoot = () =>
    dialog.replace(() => (
      <DialogPrompt
        title="Set file root"
        description={() => <text>Enter an absolute or project-relative directory.</text>}
        placeholder={project}
        onConfirm={(value) => {
          const candidate = path.normalize(path.resolve(project, value.trim()))
          if (!value.trim() || !isDirectory(candidate)) {
            toast.show({ variant: "error", message: `Directory not found: ${candidate}` })
            return
          }
          setRoot(candidate)
          dialog.clear()
        }}
        onCancel={() => dialog.clear()}
      />
    ))
  let rootPickerSearchAbort: AbortController | undefined
  let rootPickerDebounce: ReturnType<typeof setTimeout> | undefined
  let rootPickerSearchGeneration = 0
  let pickerInterceptor: (() => void) | undefined
  let selectedRootPickerValue: string | undefined
  const [rootPickerOptions, setRootPickerOptions] = createSignal<
    Array<{
      title: string
      value: string
      category?: string
      footer?: string
      disabled?: boolean
      onSelect?: () => void
    }>
  >([])
  let liveRootPickerOptions: Array<{
    title: string
    value: string
    category?: string
    footer?: string
    disabled?: boolean
    onSelect?: () => void
  }> = []

  const rootDirectoryOptions = (directories: readonly string[], category: string) => {
    const options: Array<{ title: string; value: string; category: string; onSelect?: () => void }> = []
    for (const directory of directories) {
      options.push({
        title: displayPath(directory, os.homedir()),
        value: directory,
        category,
        onSelect: () => {
          setRoot(directory)
          dialog.clear()
        },
      })
    }
    return options
  }

  const buildRootPickerOptions = (groupActions = false) => {
    const actionCategory = groupActions ? "Actions" : undefined
    const sections = rootSections(sidebarSettings.recentFileRoots, [...favorites])
    const projectCanonical = normalizeRootPath(project)
    const options: Array<{
      title: string
      value: string
      category?: string
      footer?: string
      disabled?: boolean
      onSelect?: () => void
    }> = [
      {
        title: "Add custom dir...",
        value: ADD_ROOT,
        category: actionCategory,
        onSelect: () => promptForRoot(),
      },
    ]
    if (isDirectory(projectCanonical)) {
      options.push({
        title: displayPath(projectCanonical, os.homedir()),
        value: projectCanonical,
        category: "Project",
        onSelect: () => {
          setRoot(projectCanonical)
          dialog.clear()
        },
      })
    }
    options.push(...rootDirectoryOptions(sections.favoriteRoots, "Favorite"))
    options.push(...rootDirectoryOptions(sections.recentRoots, "Recent"))
    options.push({
      title: "Reset to project root",
      value: RESET_ROOT,
      category: actionCategory,
      onSelect: () => {
        setRoot(project)
        dialog.clear()
      },
    })
    options.push({
      title: "Favorite",
      value: FAVORITE_HELP,
      category: "Help",
      footer: "ctrl+f",
      onSelect: () => {},
    })
    return options
  }

  const handleRootPickerSelect = (value: string) => {
    if (value === ADD_ROOT) {
      promptForRoot()
      return
    }
    if (value === RESET_ROOT) {
      setRoot(project)
      dialog.clear()
      return
    }
    if (value.startsWith(FILE_ROOT_PREFIX)) {
      insertPath(sessionID, value.slice(FILE_ROOT_PREFIX.length))
      dialog.clear()
      return
    }
    setRoot(value)
    dialog.clear()
  }

  const applyRootPickerOptions = (
    searchOptions: Array<{
      title: string
      value: string
      category?: string
      footer?: string
      disabled?: boolean
      onSelect?: () => void
    }> = [],
  ) => {
    const searching = searchOptions.length > 0
    const next = searching ? [...searchOptions, ...buildRootPickerOptions(true)] : buildRootPickerOptions()
    liveRootPickerOptions.splice(0, liveRootPickerOptions.length, ...next)
    setRootPickerOptions(liveRootPickerOptions.slice())
    return liveRootPickerOptions
  }

  const renderRootPicker = (
    query = "",
    searchOptions: Array<{
      title: string
      value: string
      category?: string
      footer?: string
      disabled?: boolean
      onSelect?: () => void
    }> = [],
  ) => {
    const options = applyRootPickerOptions(searchOptions)
    selectedRootPickerValue = options.find(
      (option) => typeof option.value === "string" && isDirectory(option.value),
    )?.value
    pickerInterceptor?.()
    const pickerID = ++rootPickerSearchGeneration
    const interceptor = keymap.intercept("key", (context) => {
      if (
        context.event.ctrl &&
        context.event.name.toLowerCase() === "f" &&
        selectedRootPickerValue &&
        isDirectory(selectedRootPickerValue)
      ) {
        context.consume({ preventDefault: true, stopPropagation: true })
        toggleFavorite(selectedRootPickerValue)
        renderRootPicker(query, searchOptions)
      }
    })
    pickerInterceptor = interceptor
    const dialogProps = {
      title: `Project: ${project}`,
      skipFilter: true,
      get options() {
        rootPickerOptions()
        return liveRootPickerOptions
      },
      onFilter: (filterQuery: string) => {
        if (rootPickerDebounce) clearTimeout(rootPickerDebounce)
        rootPickerDebounce = setTimeout(() => {
          void (async () => {
            const generation = ++rootPickerSearchGeneration
            const trimmed = filterQuery.trim()
            if (!trimmed) {
              applyRootPickerOptions([])
              return
            }
            rootPickerSearchAbort?.abort()
            rootPickerSearchAbort = new AbortController()
            const searchRoots = dedupeRootPaths([project, ...sidebarSettings.recentFileRoots, ...favorites])
            const result = await runEverythingSearch({
              query: trimmed,
              roots: searchRoots,
              signal: rootPickerSearchAbort.signal,
            })
            if (generation !== rootPickerSearchGeneration) return
            if (result.ok === false) {
              if (result.error === "aborted") return
              if (!everythingSearchHintShown) {
                everythingSearchHintShown = true
                if (result.error === "missing-es") {
                  toast.show({ variant: "info", message: "Install es.exe and add it to PATH for file search." })
                } else if (result.error === "ipc-unavailable") {
                  toast.show({
                    variant: "info",
                    message: "Everything search needs es.exe on PATH and the Everything app running.",
                  })
                }
              }
              applyRootPickerOptions([])
              return
            }
            applyRootPickerOptions(
              result.entries.map((entry) => ({
                title: entry.directory
                  ? `${displayPath(entry.path, os.homedir())}/`
                  : displayPath(entry.path, os.homedir()),
                value: entry.directory ? entry.path : `${FILE_ROOT_PREFIX}${entry.path}`,
                onSelect: () =>
                  handleRootPickerSelect(entry.directory ? entry.path : `${FILE_ROOT_PREFIX}${entry.path}`),
              })),
            )
          })()
        }, 150)
      },
      onMove: (option: (typeof options)[number]) => {
        if (option.value === FAVORITE_HELP) {
          queueMicrotask(() => renderRootPicker(query, searchOptions))
          return
        }
        selectedRootPickerValue =
          typeof option.value === "string" && isDirectory(option.value) ? option.value : undefined
      },
      onSelect: (option: (typeof options)[number]) => {
        pickerInterceptor?.()
        pickerInterceptor = undefined
        if (typeof option.onSelect === "function") {
          option.onSelect()
          return
        }
        handleRootPickerSelect(String(option.value))
      },
    } as unknown as DialogSelectProps<string>
    dialog.replace(
      () => <DialogSelect {...dialogProps} />,
      () => {
        if (pickerID !== rootPickerSearchGeneration) return
        pickerInterceptor?.()
        pickerInterceptor = undefined
        if (rootPickerDebounce) clearTimeout(rootPickerDebounce)
        rootPickerSearchAbort?.abort()
      },
    )
  }

  const selectRoot = () => renderRootPicker()
  const openRootPicker = () => setTimeout(selectRoot, 100)

  const saveScriptSettings = (next: ScriptSettings, message = "Script settings updated") => {
    scriptSettings = normalizeScriptSettings(next, sidebarSettings.scripts)
    sidebarSettings.scripts = scriptSettings
    saveUserScriptSettings(os.homedir(), scriptSettings)
    setScripts(readScripts(project, root, scriptSettings))
    refreshCommands()
    toast.show({ variant: "success", message })
  }
  const resetScriptSettings = () => {
    scriptSettings = normalizeScriptSettings(null, sidebarSettings.scripts)
    sidebarSettings.scripts = scriptSettings
    saveUserScriptSettings(os.homedir(), scriptSettings)
    setScripts(readScripts(project, root, scriptSettings))
    refreshCommands()
    toast.show({ variant: "success", message: "Global script settings reset" })
  }
  const toggleLanguage = (languageID: string) => {
    saveScriptSettings(
      updateLanguage(scriptSettings, languageID, (language) => ({ ...language, enabled: !language.enabled })),
    )
  }
  const toggleExtension = (languageID: string, extension: string) => {
    saveScriptSettings(
      updateLanguage(scriptSettings, languageID, (language) => ({
        ...language,
        extensions: language.extensions.includes(extension)
          ? language.extensions.filter((item) => item !== extension)
          : [...language.extensions, extension],
      })),
    )
  }
  const chooseLanguageForExtension = (extension: string) => {
    const options = scriptSettings.languages.map((language) => ({
      title: language.title,
      value: language.id,
      category: language.enabled ? "Enabled languages" : "Disabled languages",
      footer: language.launcher.executable,
      disabled: !language.enabled,
    }))
    dialog.replace(() => (
      <DialogSelect
        title={`Track ${extension} with`}
        options={options}
        current={options.find((option) => !option.disabled)?.value}
        onSelect={(option) => {
          saveScriptSettings(
            updateLanguage(scriptSettings, option.value, (language) => ({
              ...language,
              extensions: language.extensions.includes(extension)
                ? language.extensions
                : [...language.extensions, extension],
            })),
            `Tracking ${extension} with ${option.title}`,
          )
          selectScriptSettings()
        }}
      />
    ))
  }
  const promptCustomExtension = (languageID?: string) =>
    dialog.replace(() => (
      <DialogPrompt
        title="Add script extension"
        description={() => <text>Enter an extension such as .ps1 or .envrc.</text>}
        placeholder=".custom"
        onConfirm={(value) => {
          const extension = normalizeExtension(value)
          if (!extension) {
            toast.show({ variant: "error", message: "Enter a valid file extension." })
            return
          }
          if (languageID) {
            saveScriptSettings(
              updateLanguage(scriptSettings, languageID, (language) => ({
                ...language,
                extensions: language.extensions.includes(extension)
                  ? language.extensions
                  : [...language.extensions, extension],
              })),
              `Tracking ${extension}`,
            )
            selectScriptSettings()
          } else {
            chooseLanguageForExtension(extension)
          }
        }}
        onCancel={selectScriptSettings}
      />
    ))
  const promptCustomExecutable = () =>
    dialog.replace(() => (
      <DialogPrompt
        title="Add custom script executable"
        description={() => <text>Enter an executable and optional arguments. The file path is appended.</text>}
        placeholder="my-runner --flag"
        onConfirm={(value) => {
          const tokens = parseLauncher(value)
          if (!tokens) {
            toast.show({ variant: "error", message: "Enter an executable." })
            return
          }
          const [executable, ...args] = tokens
          const id = `custom-${Date.now()}`
          const language: ScriptLanguage = {
            id,
            title: `Custom: ${executable}`,
            enabled: true,
            launcher: { executable, args },
            extensions: [],
          }
          saveScriptSettings(
            { ...scriptSettings, languages: [...scriptSettings.languages, language] },
            `Added ${executable}`,
          )
          promptCustomExtension(id)
        }}
        onCancel={selectScriptSettings}
      />
    ))
  const splitSizeLabel = (size: WezTermSplitSize) => ("Percent" in size ? `${size.Percent}%` : `${size.Cells} cells`)
  const promptWeztermSizeValue = (direction: "horizontal" | "vertical", mode: "Percent" | "Cells") =>
    dialog.replace(() => (
      <DialogPrompt
        title={`${direction === "horizontal" ? "Horizontal" : "Vertical"} split ${mode}`}
        description={() => (
          <text>{mode === "Percent" ? "Enter a percentage from 1 to 99." : "Enter a positive cell count."}</text>
        )}
        placeholder={mode === "Percent" ? "30" : "20"}
        onConfirm={(value) => {
          const number = Number(value.trim())
          const valid = Number.isInteger(number) && (mode === "Percent" ? number > 0 && number < 100 : number > 0)
          if (!valid) {
            toast.show({
              variant: "error",
              message:
                mode === "Percent"
                  ? "Enter a whole percentage from 1 to 99."
                  : "Enter a positive whole number of cells.",
            })
            return
          }
          const size: WezTermSplitSize = mode === "Percent" ? { Percent: number } : { Cells: number }
          saveScriptSettings(
            {
              ...scriptSettings,
              wezterm: { ...scriptSettings.wezterm, [direction]: size },
            },
            `${direction === "horizontal" ? "Horizontal" : "Vertical"} split size set to ${splitSizeLabel(size)}`,
          )
          selectScriptSettings()
        }}
        onCancel={selectScriptSettings}
      />
    ))
  const selectWeztermSizeMode = (direction: "horizontal" | "vertical") => {
    const current = scriptSettings.wezterm[direction]
    dialog.replace(() => (
      <DialogSelect
        title={`${direction === "horizontal" ? "Horizontal" : "Vertical"} split size`}
        options={[
          { title: "Percent", value: "Percent", footer: "Percent" in current ? `${current.Percent}%` : "" },
          { title: "Cells", value: "Cells", footer: "Cells" in current ? `${current.Cells} cells` : "" },
        ]}
        current={"Percent" in current ? "Percent" : "Cells"}
        onSelect={(option) => promptWeztermSizeValue(direction, option.value as "Percent" | "Cells")}
      />
    ))
  }
  const selectScriptSettings = () => {
    const defaults = defaultScriptSettings()
    const languageMap = new Map(scriptSettings.languages.map((language) => [language.id, language]))
    const extensionOptions = defaults.languages
      .flatMap((language) => {
        const current = languageMap.get(language.id)
        const extensions = [...new Set([...language.extensions, ...(current?.extensions ?? [])])]
        return extensions.map((extension) => ({
          title: extension,
          value: `extension:${language.id}:${extension}`,
          category: language.title,
          footer: current?.extensions.includes(extension) ? "tracked" : "not tracked",
        }))
      })
      .concat(
        scriptSettings.languages
          .filter((language) => !defaults.languages.some((item) => item.id === language.id))
          .flatMap((language) =>
            language.extensions.map((extension) => ({
              title: extension,
              value: `extension:${language.id}:${extension}`,
              category: language.title,
              footer: "tracked",
            })),
          ),
      )
    const splitDirection =
      scriptSettings.terminal === "wezterm-horizontal"
        ? "horizontal"
        : scriptSettings.terminal === "wezterm-vertical"
          ? "vertical"
          : undefined
    const placements = scriptTerminals()
    const selectedTarget = resolveScriptTerminal(scriptSettings.terminal)
    const splitSizeOptions = splitDirection && placements.length > 0
      ? [
          { title: "Split size", value: WEZTERM_SIZE_SECTION, disabled: true },
          {
            title: `${splitDirection === "horizontal" ? "Horizontal" : "Vertical"} split size`,
            value: `wezterm-size:${splitDirection}`,
            category: "Split size",
            footer: splitSizeLabel(scriptSettings.wezterm[splitDirection]),
          },
        ]
      : []
    const options = [
      { title: "Shell", value: SCRIPT_SHELL_SECTION, disabled: true },
      ...BUILTIN_SHELLS.map((shell) => ({
        title: shell.title,
        value: `shell:${shell.id}`,
        category: "Shell",
        footer: scriptSettings.shell.executable === shell.launcher.executable ? "selected" : shell.launcher.executable,
      })),
      ...(BUILTIN_SHELLS.some((shell) => shell.launcher.executable === scriptSettings.shell.executable)
        ? []
        : [
            {
              title: `Custom: ${scriptSettings.shell.executable}`,
              value: "shell:custom",
              category: "Shell",
              footer: "selected",
            },
          ]),
      ...(placements.length > 0 ? [{ title: "Terminal placement", value: "terminal-section", disabled: true }] : []),
      ...placements.map((terminal) => ({
        title: terminal.title,
        value: `terminal:${terminal.id}`,
        category: "Terminal placement",
        footer: selectedTarget === terminal.id ? "selected" : "",
      })),
      {
        title: "Native detached runner",
        value: "terminal:native",
        category: placements.length > 0 ? "Terminal placement" : undefined,
        footer: selectedTarget === "native" ? "selected" : "",
      },
      ...splitSizeOptions,
      { title: "Languages", value: SCRIPT_LANGUAGE_SECTION, disabled: true },
      ...scriptSettings.languages.map((language) => ({
        title: `${language.enabled ? "*" : " "} ${language.title}`,
        value: `language:${language.id}`,
        category: "Languages",
        footer: language.extensions.join(", ") || "no extensions",
      })),
      { title: "Tracked extensions", value: SCRIPT_EXTENSION_SECTION, disabled: true },
      ...extensionOptions,
      { title: "Add custom executable...", value: ADD_SCRIPT_EXECUTABLE },
      { title: "Add custom extension...", value: ADD_SCRIPT_EXTENSION },
      { title: "Reset global script settings", value: RESET_SCRIPT_SETTINGS },
    ]
    const selectedTerminal =
      selectedTarget === "native" ? "terminal:native" : `terminal:${selectedTarget}`
    const dialogProps = {
      title: `Global script settings`,
      skipFilter: true,
      options,
      current: selectedTerminal,
      onSelect: (option: (typeof options)[number]) => {
        if (option.value === ADD_SCRIPT_EXECUTABLE) promptCustomExecutable()
        else if (option.value === ADD_SCRIPT_EXTENSION) promptCustomExtension()
        else if (option.value === RESET_SCRIPT_SETTINGS) {
          resetScriptSettings()
          selectScriptSettings()
        } else if (option.value.startsWith("terminal:")) {
          const terminal = option.value.slice("terminal:".length) as ScriptSettings["terminal"]
          saveScriptSettings(
            { ...scriptSettings, terminal },
            terminal === "native" ? "Using native detached runner" : `Using terminal placement: ${option.title}`,
          )
          selectScriptSettings()
        } else if (option.value.startsWith("wezterm-size:")) {
          selectWeztermSizeMode(option.value.slice("wezterm-size:".length) as "horizontal" | "vertical")
        } else if (option.value.startsWith("shell:")) {
          const shell = BUILTIN_SHELLS.find((item) => `shell:${item.id}` === option.value)
          if (shell) {
            saveScriptSettings(
              { ...scriptSettings, shell: { ...shell.launcher, args: [...shell.launcher.args] } },
              `Using ${shell.title}`,
            )
            selectScriptSettings()
          }
        } else if (option.value.startsWith("language:")) {
          toggleLanguage(option.value.slice("language:".length))
          selectScriptSettings()
        } else if (option.value.startsWith("extension:")) {
          const [, languageID, extension] = option.value.split(":")
          toggleExtension(languageID, extension)
          selectScriptSettings()
        }
      },
    } as unknown as DialogSelectProps<string>
    dialog.replace(() => <DialogSelect {...dialogProps} />)
  }
  const openScriptSettings = () => setTimeout(selectScriptSettings, 100)

  const selectUsageSettings = () => {
    const selected = new Set(usageProviders())
    const dialogProps = {
      title: "Weekly usage providers",
      options: USAGE_PROVIDER_OPTIONS.map((provider) => ({
        title: provider.title,
        value: provider.id,
        footer: selected.has(provider.id) ? "visible" : "hidden",
        gutter: selected.has(provider.id) ? () => <text fg={theme.success}>:white_check_mark:</text> : undefined,
      })),
      onSelect: (option: { value: UsageProviderId }) => {
        const next = selected.has(option.value)
          ? usageProviders().filter((id) => id !== option.value)
          : [
              ...USAGE_PROVIDER_OPTIONS.map((provider) => provider.id).filter(
                (id) => selected.has(id) || id === option.value,
              ),
            ]
        sidebarSettings.usageProviders = next
        saveUserUsageProviders(os.homedir(), next)
        setUsageProviders(next)
        usageScheduler.request()
        selectUsageSettings()
      },
    } as unknown as DialogSelectProps<UsageProviderId>
    dialog.replace(() => <DialogSelect {...dialogProps} />)
  }
  const openUsageSettings = () => setTimeout(selectUsageSettings, 100)

  const sidebarCommands = createMemo(() => {
    const rootCommands = rootSections(sidebarSettings.recentFileRoots, [...favorites])
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
        name: "sidebar.usage-settings",
        title: "Configure weekly usage providers",
        category: "Sidebar",
        namespace: "sidebar",
        run: selectUsageSettings,
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
          title: `${pins.has(script.name) ? "Unpin" : "Pin"} script: ${script.name}`,
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
  onCleanup(event.on("tui.session.select", () => queueMicrotask(() => {
    refresh()
    refreshOldUsage()
  })))
  onCleanup(event.on("message.updated", (evt) => {
    queueMicrotask(refresh)
    const info = evt.properties.info
    if (info.role !== "assistant" || info.time.completed === undefined) return
    const provider = usageProviderForModel(info.providerID)
    if (!provider || !shouldRefreshUsageProvider(usageRequestedAt[provider], Date.now())) return
    void refreshUsage([provider])
  }))
  onCleanup(
    event.on("session.status", (evt) => {
      if (!shouldRefreshUsageAfterIdle(evt.properties, props.sessionID)) return
      usageScheduler.request()
    }),
  )
  void syncSidebarVisibility()
  const usageAgeTimer = setInterval(() => setUsageNow(Date.now()), 60_000)
  onCleanup(() => {
    clearInterval(usageAgeTimer)
    clearInterval(marqueeTimer)
    usageAbort.abort()
    usageScheduler.dispose()
    rootPickerSearchGeneration += 1
    if (rootPickerDebounce) clearTimeout(rootPickerDebounce)
    rootPickerSearchAbort?.abort()
    pickerInterceptor?.()
  })
  createEffect(() => syncSession(props.sessionID))
  const visibleScripts = createMemo(() =>
    [...scripts()].sort((a, b) => {
      const pinOrder = Number(pins.has(b.name)) - Number(pins.has(a.name))
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
          cwd: projectContext.instance.path().worktree || projectContext.instance.path().directory,
          editor: tuiConfig.openEditedWith,
        }),
      )
      .catch((error) =>
        toast.show({ variant: "error", message: error instanceof Error ? error.message : String(error) }),
      )
  }

  const outlinedButtons = () => tuiConfig.sidebar_button_style === "outlined"

  return (
    <>
      <box flexDirection="column" gap={0}>
        <HeaderButton
          value="Switch Session"
          outlined={outlinedButtons()}
          color={headerButtonColor}
          hoverColor={hoverColor}
          onClick={() => keymap.dispatchCommand("session.list")}
        />
        <HeaderButton
          value="Command Palette"
          outlined={outlinedButtons()}
          color={headerButtonColor}
          hoverColor={hoverColor}
          onClick={() => keymap.dispatchCommand("command.palette.show")}
        />
        <HeaderButton
          value="oc Palette"
          outlined={outlinedButtons()}
          color={headerButtonColor}
          hoverColor={hoverColor}
          onClick={() => keymap.dispatchCommand("oc.settings_palette")}
        />
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
        {usageRows()}
      </box>
      {props.children}
      <box flexDirection="column" gap={1} paddingTop={1} paddingBottom={1}>
        <box
          flexDirection="row"
          gap={1}
          paddingLeft={1}
          paddingRight={1}
          onMouseOver={() => setHovered("scripts")}
          onMouseOut={() => setHovered()}
          onMouseDown={(event) => {
            if (event.button === 0) openScriptSettings()
          }}
        >
          <text
            fg={hovered() === "scripts" ? hoverColor : theme.text}
            onMouseDown={(event) => {
              event.stopPropagation()
              if (event.button === 0) setScriptsOpen((open) => !open)
            }}
            onMouseUp={(event) => event.stopPropagation()}
          >
            {scriptsOpen() ? "-" : "+"}
          </text>
          <text
            fg={hovered() === "scripts" ? hoverColor : theme.accent}
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
                      : pins.has(script.name)
                        ? theme.primary
                        : theme.text
                  }
                >
                  {pins.has(script.name) ? "* " : "  "}
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
          paddingLeft={1}
          paddingRight={1}
          onMouseOver={() => setHovered("files")}
          onMouseOut={() => setHovered()}
          onMouseDown={(event) => {
            if (event.button === 0) openRootPicker()
          }}
        >
          <text
            fg={hovered() === "files" ? hoverColor : theme.text}
            onMouseDown={(event) => {
              event.stopPropagation()
              setFilesOpen((open) => !open)
            }}
            onMouseUp={(event) => event.stopPropagation()}
          >
            {filesOpen() ? "-" : "+"}
          </text>
          <text
            fg={hovered() === "files" ? hoverColor : theme.accent}
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
                  onMouseUp={() => file.file && openChangedFile(file.file)}
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
        <span style={{ fg: theme.success }}>-</span> oc v{InstallationDisplayVersion.split("-")[0]} ∙ OG v{InstallationVersion}
      </text>
    </box>
  )
}
