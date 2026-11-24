// Sidebar settings: types, defaults, normalization, the user settings file
// (`<config>/sidebar.json`), and oc's per-project state file.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { Flock } from "@opencode-ai/core/util/flock"
import { Hash } from "@opencode-ai/core/util/hash"
import { detectTerminal, type TerminalInfo } from "@opencode-ai/core/util/terminal"
import { cursorSessionSecretPath, readCursorSessionToken, writeCursorSessionToken } from "./cursorToken"
import { dedupeRootPaths, isDirectory, normalizeRootPath, rootPathKey } from "./roots"
import { normalizeUsageSubscriptions, type UsageSubscription } from "./usage/calendar"
import { normalizeUsageProviders, type UsageProviderId } from "./usage/providers"
import type { UsageLayout } from "./usage/layout"

export type ScriptLauncher = {
  executable: string
  args: string[]
}

export type ScriptTerminal = "native" | "wezterm-tab" | "wezterm-window" | "wezterm-horizontal" | "wezterm-vertical"
export type WezTermSplitSize = { Percent: number } | { Cells: number }

export type WezTermSettings = {
  horizontal: WezTermSplitSize
  vertical: WezTermSplitSize
}

export type ScriptLanguage = {
  id: string
  title: string
  enabled: boolean
  launcher: ScriptLauncher
  extensions: string[]
}

export type ScriptSettings = {
  shell: ScriptLauncher
  terminal: ScriptTerminal
  wezterm: WezTermSettings
  languages: ScriptLanguage[]
}

export type SidebarSettings = {
  visibility: {
    showMcp: boolean
    showLsp: boolean
  }
  scripts: ScriptSettings
  scriptPins: string[]
  favoriteFileRoots: string[]
  recentFileRoots: string[]
  fileRoots: Record<string, { customRoots: string[]; activeRoot?: string }>
  /** Undefined until the user picks: the sidebar then shows every provider with a login. */
  usageProviders?: UsageProviderId[]
  usageSpacing: boolean
  /** Sidebar Usage block layout: account groups with bars, or one table line per account. */
  usageLayout: UsageLayout
  usageSubscriptions: UsageSubscription[]
}

const DEFAULT_SCRIPT_SETTINGS: ScriptSettings = {
  shell: { executable: "pwsh", args: ["-NoLogo", "-NoExit", "-Command"] },
  terminal: "native",
  wezterm: {
    horizontal: { Percent: 50 },
    vertical: { Percent: 50 },
  },
  languages: [
    {
      id: "powershell",
      title: "PowerShell 7",
      enabled: true,
      launcher: { executable: "pwsh", args: ["-NoLogo", "-NoExit", "-File"] },
      extensions: [".ps1", ".psm1"],
    },
    { id: "sh", title: "POSIX sh", enabled: true, launcher: { executable: "sh", args: [] }, extensions: [".sh"] },
    { id: "bash", title: "Bash", enabled: true, launcher: { executable: "bash", args: [] }, extensions: [".bash"] },
    { id: "zsh", title: "Zsh", enabled: true, launcher: { executable: "zsh", args: [] }, extensions: [".zsh"] },
    { id: "python", title: "Python", enabled: true, launcher: { executable: "python", args: [] }, extensions: [".py"] },
    {
      id: "node",
      title: "Node.js",
      enabled: true,
      launcher: { executable: "node", args: [] },
      extensions: [".js", ".mjs", ".cjs"],
    },
    {
      id: "typescript",
      title: "TypeScript",
      enabled: true,
      launcher: { executable: "npx", args: ["tsx"] },
      extensions: [".ts", ".mts", ".cts"],
    },
    {
      id: "cmd",
      title: "Windows cmd",
      enabled: true,
      launcher: { executable: "cmd.exe", args: ["/d", "/c"] },
      extensions: [".bat", ".cmd"],
    },
    { id: "ruby", title: "Ruby", enabled: true, launcher: { executable: "ruby", args: [] }, extensions: [".rb"] },
    { id: "php", title: "PHP", enabled: true, launcher: { executable: "php", args: [] }, extensions: [".php"] },
  ],
}

export const BUILTIN_SHELLS = [
  {
    id: "powershell",
    title: "PowerShell 7",
    launcher: { executable: "pwsh", args: ["-NoLogo", "-NoExit", "-Command"] },
  },
  { id: "sh", title: "POSIX sh", launcher: { executable: "sh", args: ["-c"] } },
  { id: "bash", title: "Bash", launcher: { executable: "bash", args: ["-c"] } },
  { id: "zsh", title: "Zsh", launcher: { executable: "zsh", args: ["-c"] } },
  { id: "cmd", title: "Windows cmd", launcher: { executable: "cmd.exe", args: ["/d", "/k"] } },
] as const

export const WEZTERM_TERMINALS = [
  { id: "wezterm-tab", title: "New tab" },
  { id: "wezterm-window", title: "New window" },
  { id: "wezterm-horizontal", title: "Horizontal split (side-by-side)" },
  { id: "wezterm-vertical", title: "Vertical split (stacked)" },
] as const

// Terminal.app has no scriptable tab or split targets; its scripts open in a new window (native launch).
export function scriptTerminals(kind: TerminalInfo["kind"] = detectTerminal().kind) {
  return kind === "generic" || kind === "terminal-app" ? [] : WEZTERM_TERMINALS
}

export function resolveScriptTerminal(terminal: ScriptTerminal, kind: TerminalInfo["kind"] = detectTerminal().kind) {
  return kind === "generic" || kind === "terminal-app" ? "native" : terminal
}

function cloneSettings(settings: ScriptSettings): ScriptSettings {
  return {
    shell: { executable: settings.shell.executable, args: [...settings.shell.args] },
    terminal: settings.terminal,
    wezterm: {
      horizontal: { ...settings.wezterm.horizontal },
      vertical: { ...settings.wezterm.vertical },
    },
    languages: settings.languages.map((language) => ({
      id: language.id,
      title: language.title,
      enabled: language.enabled,
      launcher: { executable: language.launcher.executable, args: [...language.launcher.args] },
      extensions: [...language.extensions],
    })),
  }
}

function launcher(value: unknown, fallback: ScriptLauncher): ScriptLauncher {
  if (!value || typeof value !== "object") return { executable: fallback.executable, args: [...fallback.args] }
  const input = value as { executable?: unknown; args?: unknown }
  if (typeof input.executable !== "string" || !input.executable.trim()) {
    return { executable: fallback.executable, args: [...fallback.args] }
  }
  return {
    executable: input.executable.trim(),
    args: Array.isArray(input.args)
      ? input.args.filter((arg): arg is string => typeof arg === "string")
      : [...fallback.args],
  }
}

export function normalizeExtension(value: string): string | undefined {
  const extension = value.trim().toLowerCase()
  if (!extension) return undefined
  const normalized = extension.startsWith(".") ? extension : `.${extension}`
  return /^\.[a-z0-9][a-z0-9._-]*$/.test(normalized) ? normalized : undefined
}

function language(value: unknown, fallback: ScriptLanguage | undefined): ScriptLanguage | undefined {
  if (!value || typeof value !== "object") return fallback
  const input = value as { id?: unknown; title?: unknown; enabled?: unknown; launcher?: unknown; extensions?: unknown }
  if (typeof input.id !== "string" || !input.id.trim() || typeof input.title !== "string" || !input.title.trim())
    return fallback
  const fallbackLauncher = fallback?.launcher ?? { executable: "pwsh", args: [] }
  const extensions = Array.isArray(input.extensions)
    ? [
        ...new Set(
          input.extensions
            .filter((item): item is string => typeof item === "string")
            .map(normalizeExtension)
            .filter((item): item is string => Boolean(item)),
        ),
      ]
    : (fallback?.extensions ?? [])
  return {
    id: input.id.trim(),
    title: input.title.trim(),
    enabled: typeof input.enabled === "boolean" ? input.enabled : (fallback?.enabled ?? true),
    launcher: launcher(input.launcher, fallbackLauncher),
    extensions,
  }
}

function splitSize(value: unknown, fallback: WezTermSplitSize): WezTermSplitSize {
  if (!value || typeof value !== "object") return { ...fallback }
  const input = value as { Percent?: unknown; Cells?: unknown }
  if (
    typeof input.Percent === "number" &&
    Number.isInteger(input.Percent) &&
    input.Percent > 0 &&
    input.Percent < 100
  ) {
    return { Percent: input.Percent }
  }
  if (typeof input.Cells === "number" && Number.isInteger(input.Cells) && input.Cells > 0) {
    return { Cells: input.Cells }
  }
  return { ...fallback }
}

export function defaultScriptSettings(): ScriptSettings {
  return cloneSettings(DEFAULT_SCRIPT_SETTINGS)
}

export const OPENCODE_SESSION_SCROLLBAR_KEY = "scrollbar_visible"

export function ensureSessionScrollbarVisible(kv: {
  get: (key: string, fallback?: unknown) => unknown
  set: (key: string, value: unknown) => void
}): void {
  if (kv.get(OPENCODE_SESSION_SCROLLBAR_KEY) === undefined) kv.set(OPENCODE_SESSION_SCROLLBAR_KEY, true)
}

export function defaultSidebarSettings(): SidebarSettings {
  return {
    visibility: { showMcp: true, showLsp: true },
    scripts: defaultScriptSettings(),
    scriptPins: [],
    favoriteFileRoots: [],
    recentFileRoots: [],
    fileRoots: {},
    usageProviders: undefined,
    usageSpacing: false,
    usageLayout: "grouped",
    usageSubscriptions: [],
  }
}

export function normalizeScriptSettings(value: unknown, base = defaultScriptSettings()): ScriptSettings {
  if (!value || typeof value !== "object") return cloneSettings(base)
  const input = value as { shell?: unknown; terminal?: unknown; wezterm?: unknown; languages?: unknown }
  const wezterm =
    input.wezterm && typeof input.wezterm === "object"
      ? (input.wezterm as { horizontal?: unknown; vertical?: unknown })
      : {}
  const languages = cloneSettings(base).languages
  if (Array.isArray(input.languages)) {
    for (const item of input.languages) {
      const id = (item as { id?: unknown })?.id
      // language() trims the stored id, so the builtin lookup must match on the trimmed id too.
      const normalized = language(
        item,
        languages.find((entry) => entry.id === (typeof id === "string" ? id.trim() : id)),
      )
      if (!normalized) continue
      const index = languages.findIndex((entry) => entry.id === normalized.id)
      if (index === -1) languages.push(normalized)
      else languages[index] = normalized
    }
  }
  return {
    shell: launcher(input.shell, base.shell),
    terminal:
      input.terminal === "native"
        ? "native"
        : WEZTERM_TERMINALS.some((item) => item.id === input.terminal)
          ? (input.terminal as ScriptTerminal)
          : base.terminal,
    wezterm: {
      horizontal: splitSize(wezterm.horizontal, base.wezterm.horizontal),
      vertical: splitSize(wezterm.vertical, base.wezterm.vertical),
    },
    languages,
  }
}

export function normalizeSidebarSettings(value: unknown, base = defaultSidebarSettings()): SidebarSettings {
  if (!value || typeof value !== "object")
    return {
      visibility: { ...base.visibility },
      scripts: cloneSettings(base.scripts),
      scriptPins: [...base.scriptPins],
      favoriteFileRoots: [...base.favoriteFileRoots],
      recentFileRoots: [...base.recentFileRoots],
      fileRoots: structuredClone(base.fileRoots),
      usageProviders: base.usageProviders && [...base.usageProviders],
      usageSpacing: base.usageSpacing,
      usageLayout: base.usageLayout,
      usageSubscriptions: [...base.usageSubscriptions],
    }
  const input = value as {
    visibility?: unknown
    scripts?: unknown
    scriptPins?: unknown
    favoriteFileRoots?: unknown
    recentFileRoots?: unknown
    fileRoots?: unknown
    usageProviders?: unknown
    usageSpacing?: unknown
    usageLayout?: unknown
    usageSubscriptions?: unknown
  }
  const visibility =
    input.visibility && typeof input.visibility === "object"
      ? (input.visibility as { showMcp?: unknown; showLsp?: unknown })
      : {}
  const fileRoots: SidebarSettings["fileRoots"] = { ...base.fileRoots }
  if (input.fileRoots && typeof input.fileRoots === "object") {
    for (const [sessionID, rawState] of Object.entries(input.fileRoots)) {
      if (!rawState || typeof rawState !== "object") continue
      const state = rawState as { customRoots?: unknown; activeRoot?: unknown }
      const activeRoot = typeof state.activeRoot === "string" ? normalizeRootPath(state.activeRoot) : undefined
      fileRoots[sessionID] = {
        customRoots: dedupeRootPaths(
          Array.isArray(state.customRoots)
            ? state.customRoots.filter((item): item is string => typeof item === "string")
            : [],
        ),
        activeRoot: activeRoot && isDirectory(activeRoot) ? activeRoot : undefined,
      }
    }
  }
  return {
    visibility: {
      showMcp: typeof visibility.showMcp === "boolean" ? visibility.showMcp : base.visibility.showMcp,
      showLsp: typeof visibility.showLsp === "boolean" ? visibility.showLsp : base.visibility.showLsp,
    },
    scripts: normalizeScriptSettings(input.scripts, base.scripts),
    scriptPins: Array.isArray(input.scriptPins)
      ? [...new Set(input.scriptPins.filter((item): item is string => typeof item === "string"))]
      : [...base.scriptPins],
    favoriteFileRoots: Array.isArray(input.favoriteFileRoots)
      ? dedupeRootPaths(input.favoriteFileRoots.filter((item): item is string => typeof item === "string"))
      : dedupeRootPaths(base.favoriteFileRoots),
    recentFileRoots: Array.isArray(input.recentFileRoots)
      ? dedupeRootPaths(input.recentFileRoots.filter((item): item is string => typeof item === "string"))
      : [...base.recentFileRoots],
    fileRoots,
    usageProviders: Array.isArray(input.usageProviders)
      ? normalizeUsageProviders(input.usageProviders)
      : base.usageProviders && [...base.usageProviders],
    usageSpacing: typeof input.usageSpacing === "boolean" ? input.usageSpacing : base.usageSpacing,
    usageLayout:
      input.usageLayout === "grouped" || input.usageLayout === "table" ? input.usageLayout : base.usageLayout,
    usageSubscriptions:
      "usageSubscriptions" in input
        ? normalizeUsageSubscriptions(input.usageSubscriptions)
        : [...base.usageSubscriptions],
  }
}

// User settings (visibility, scripts, usage). Not tui.json: sidebar writes would live-reload every
// open TUI.
export function sidebarUserPath(configDirectory = Global.Path.config) {
  return path.join(configDirectory, "sidebar.json")
}

// Pins, favorites, and file roots are machine state, so oc keeps them in its state folder and never
// writes into the project.
export function sidebarStatePath(stateDirectory: string, projectRoot: string) {
  return path.join(stateDirectory, "sidebar", `${Hash.fast(rootPathKey(projectRoot)).slice(0, 16)}.json`)
}

export function promptProjectDirectory(prompt: unknown, homeDirectory = os.homedir()): string | undefined {
  if (typeof prompt !== "string") return undefined
  for (const match of prompt.matchAll(/\bcd\s+(?:"([^"]+)"|'([^']+)'|(\S+))/gi)) {
    const candidate = (match[1] ?? match[2] ?? match[3]).trim().replace(/^['"]|['"]$/g, "")
    if (path.isAbsolute(candidate) && candidate !== homeDirectory && isDirectory(candidate))
      return path.normalize(candidate)
  }
  return undefined
}

export function sessionProjectDirectory(
  messages: readonly unknown[],
  partsForMessage: (messageID: string) => readonly unknown[],
  homeDirectory = os.homedir(),
): string | undefined {
  for (const message of messages) {
    if (!message || typeof message !== "object") continue
    const value = message as { id?: unknown; role?: unknown }
    if (value.role !== "user" || typeof value.id !== "string") continue
    for (const part of partsForMessage(value.id)) {
      if (!part || typeof part !== "object") continue
      const text = part as { type?: unknown; text?: unknown }
      if (text.type === "text") {
        const directory = promptProjectDirectory(text.text, homeDirectory)
        if (directory) return directory
      }
    }
  }
  return undefined
}

export function readJsonFile(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch {
    return undefined
  }
}

export function loadSidebarSettings(
  statePath: string,
  userPath = sidebarUserPath(),
  base = defaultSidebarSettings(),
): SidebarSettings {
  return normalizeSidebarSettings(readJsonFile(statePath), normalizeSidebarSettings(readJsonFile(userPath), base))
}

const USER_KEYS = [
  "visibility",
  "scripts",
  "usageProviders",
  "usageSpacing",
  "usageLayout",
  "usageSubscriptions",
] as const
type SidebarState = Pick<SidebarSettings, "scriptPins" | "favoriteFileRoots" | "recentFileRoots" | "fileRoots">

let _userWrites: Promise<void> = Promise.resolve()

/**
 * An undefined value removes the key, which returns that setting to its default. Every TUI shares
 * sidebar.json, so the read-modify-write runs under a cross-process lock and one TUI never drops
 * another's key. Queued so rapid changes land in order.
 */
export function saveUserSidebarSetting<K extends (typeof USER_KEYS)[number]>(
  key: K,
  value: SidebarSettings[K],
  filePath = sidebarUserPath(),
): Promise<void> {
  const result = _userWrites.then(() =>
    Flock.withLock(`sidebar-user:${filePath}`, async () => {
      const existing = readJsonFile(filePath)
      const base = existing && typeof existing === "object" ? (existing as Record<string, unknown>) : {}
      writeJsonObject(filePath, { ...base, [key]: value })
    }),
  )
  _userWrites = result.catch(() => undefined)
  return result
}

// TODO: remove at 0.4.0. One-time copy of the openSidebar plugin-era files into oc's own: the user file
// `~/.config/openSidebar/config.json` and its Cursor token become `sidebar.json` and the data-folder
// token; a project's `<project>/.config/openSidebar.json` and old kv pins become its state file. Old
// files are only read, never changed, so an older oc build keeps working.
export function migrateLegacySidebar(input: {
  projectRoot: string
  statePath: string
  kvState: () => SidebarState
  homeDirectory?: string
  userPath?: string
  tokenPath?: string
}): void {
  const legacyDirectory = path.join(input.homeDirectory ?? os.homedir(), ".config", "openSidebar")
  const legacyUser = upgradeLegacySidebar(readJsonFile(path.join(legacyDirectory, "config.json")))
  const legacyProject = upgradeLegacySidebar(readJsonFile(path.join(input.projectRoot, ".config", "openSidebar.json")))
  const userPath = input.userPath ?? sidebarUserPath()
  if (!fs.existsSync(userPath) && (fs.existsSync(legacyDirectory) || legacyProject.visibility !== undefined)) {
    const tokenPath = input.tokenPath ?? cursorSessionSecretPath()
    const token =
      readCursorSessionToken(path.join(legacyDirectory, "cursor-session")) ??
      (typeof legacyUser.cursorSessionToken === "string"
        ? legacyUser.cursorSessionToken.trim() || undefined
        : undefined)
    if (token && !readCursorSessionToken(tokenPath)) writeCursorSessionToken(token, tokenPath)
    // Every project file holds the same plugin-copied visibility, so it stands in for a user file without one.
    const user: Record<string, unknown> = {
      ...legacyUser,
      visibility: legacyUser.visibility ?? legacyProject.visibility,
    }
    // Written last: sidebar.json existing marks the user step done.
    writeJsonObject(
      userPath,
      Object.fromEntries(USER_KEYS.map((key) => [key, user[key]]).filter((entry) => entry[1] !== undefined)),
    )
  }
  if (fs.existsSync(input.statePath)) return
  const legacy = normalizeSidebarSettings(legacyProject, normalizeSidebarSettings(legacyUser))
  const kv = input.kvState()
  const state: SidebarState = {
    scriptPins: legacy.scriptPins.length > 0 ? legacy.scriptPins : kv.scriptPins,
    favoriteFileRoots: legacy.favoriteFileRoots.length > 0 ? legacy.favoriteFileRoots : kv.favoriteFileRoots,
    recentFileRoots: legacy.recentFileRoots.length > 0 ? legacy.recentFileRoots : kv.recentFileRoots,
    fileRoots: { ...kv.fileRoots, ...legacy.fileRoots },
  }
  if (
    state.scriptPins.length > 0 ||
    state.favoriteFileRoots.length > 0 ||
    state.recentFileRoots.length > 0 ||
    Object.keys(state.fileRoots).length > 0
  )
    writeJsonObject(input.statePath, state)
}

// Old openSidebar shapes: top-level `showMcp`/`showLsp`, `fileRootPins`, and recent roots kept only in
// `fileRoots.*.customRoots`.
function upgradeLegacySidebar(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {}
  const input = value as Record<string, unknown>
  const sessionRoots = Object.values(input.fileRoots && typeof input.fileRoots === "object" ? input.fileRoots : {})
    .map((state) => (state && typeof state === "object" ? (state as { customRoots?: unknown }).customRoots : undefined))
    .flatMap((roots) => (Array.isArray(roots) ? roots : []))
  const hasRecent = Array.isArray(input.recentFileRoots) && input.recentFileRoots.length > 0
  return {
    ...input,
    visibility:
      input.visibility ??
      (typeof input.showMcp === "boolean" || typeof input.showLsp === "boolean"
        ? { showMcp: input.showMcp, showLsp: input.showLsp }
        : undefined),
    favoriteFileRoots: input.favoriteFileRoots ?? input.fileRootPins,
    recentFileRoots: hasRecent || sessionRoots.length === 0 ? input.recentFileRoots : sessionRoots,
  }
}

export function writeJsonObject(filePath: string, value: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp-${process.pid}`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8")
  fs.renameSync(temporary, filePath)
}

export function parseLauncher(value: string): string[] | undefined {
  const tokens: string[] = []
  let token = ""
  let quote = ""
  for (const character of value.trim()) {
    if (quote) {
      if (character === quote) quote = ""
      else token += character
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (/\s/.test(character)) {
      if (token) {
        tokens.push(token)
        token = ""
      }
    } else {
      token += character
    }
  }
  if (quote) return undefined
  if (token) tokens.push(token)
  return tokens.length > 0 ? tokens : undefined
}

export function updateLanguage(
  settings: ScriptSettings,
  languageID: string,
  update: (language: ScriptLanguage) => ScriptLanguage | undefined,
): ScriptSettings {
  return {
    ...cloneSettings(settings),
    languages: settings.languages
      .map((item) => (item.id === languageID ? update(item) : item))
      .filter((item): item is ScriptLanguage => Boolean(item)),
  }
}

/** Moves an extension to one language. Scripts run with the first matching language, so no other keeps it. */
export function trackExtension(settings: ScriptSettings, languageID: string, extension: string): ScriptSettings {
  return {
    ...cloneSettings(settings),
    languages: settings.languages.map((item) => {
      const others = item.extensions.filter((value) => value !== extension)
      return { ...item, extensions: item.id === languageID ? [...others, extension] : others }
    }),
  }
}
