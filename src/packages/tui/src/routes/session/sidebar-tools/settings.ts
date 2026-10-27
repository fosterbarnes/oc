// openSidebar settings: types, defaults, normalization, the user/project config files, and oc's
// per-project state file.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hash } from "@opencode-ai/core/util/hash"
import { detectTerminal, type TerminalInfo } from "@opencode-ai/core/util/terminal"
import { dedupeRootPaths, isDirectory, normalizeRootPath, rootPathKey } from "./roots"
import { normalizeUsageSubscriptions, type UsageSubscription } from "./usage/calendar"
import { DEFAULT_USAGE_PROVIDERS, normalizeUsageProviders, type UsageProviderId } from "./usage/providers"

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
  projectDirectory?: string
  visibility: {
    showMcp: boolean
    showLsp: boolean
  }
  scripts: ScriptSettings
  scriptPins: string[]
  favoriteFileRoots: string[]
  recentFileRoots: string[]
  fileRoots: Record<string, { customRoots: string[]; activeRoot?: string }>
  usageProviders: UsageProviderId[]
  usageSpacing: boolean
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

export function scriptTerminals(kind: TerminalInfo["kind"] = detectTerminal().kind) {
  return kind === "generic" ? [] : WEZTERM_TERMINALS
}

export function resolveScriptTerminal(terminal: ScriptTerminal, kind: TerminalInfo["kind"] = detectTerminal().kind) {
  return kind === "generic" ? "native" : terminal
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
    usageProviders: [...DEFAULT_USAGE_PROVIDERS],
    usageSpacing: false,
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
      const normalized = language(
        item,
        languages.find((entry) => entry.id === (item as { id?: unknown })?.id),
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
      projectDirectory: base.projectDirectory,
      visibility: { ...base.visibility },
      scripts: cloneSettings(base.scripts),
      scriptPins: [...base.scriptPins],
      favoriteFileRoots: [...base.favoriteFileRoots],
      recentFileRoots: [...base.recentFileRoots],
      fileRoots: structuredClone(base.fileRoots),
      usageProviders: [...base.usageProviders],
      usageSpacing: base.usageSpacing,
      usageSubscriptions: [...base.usageSubscriptions],
    }
  const input = value as {
    projectDirectory?: unknown
    visibility?: unknown
    showMcp?: unknown
    showLsp?: unknown
    scripts?: unknown
    scriptPins?: unknown
    favoriteFileRoots?: unknown
    fileRootPins?: unknown
    recentFileRoots?: unknown
    fileRoots?: unknown
    usageProviders?: unknown
    usageSpacing?: unknown
    usageSubscriptions?: unknown
  }
  const visibility =
    input.visibility && typeof input.visibility === "object"
      ? (input.visibility as { showMcp?: unknown; showLsp?: unknown })
      : {}
  const fileRoots: SidebarSettings["fileRoots"] = { ...base.fileRoots }
  const migratedRecentRoots: string[] = []
  if (input.fileRoots && typeof input.fileRoots === "object") {
    for (const [sessionID, rawState] of Object.entries(input.fileRoots)) {
      if (!rawState || typeof rawState !== "object") continue
      const state = rawState as { customRoots?: unknown; activeRoot?: unknown }
      const customRoots = dedupeRootPaths(
        Array.isArray(state.customRoots)
          ? state.customRoots.filter((item): item is string => typeof item === "string")
          : [],
      )
      migratedRecentRoots.push(...customRoots)
      const activeRoot = typeof state.activeRoot === "string" ? normalizeRootPath(state.activeRoot) : undefined
      fileRoots[sessionID] = {
        customRoots,
        activeRoot: activeRoot && isDirectory(activeRoot) ? activeRoot : undefined,
      }
    }
  }
  let recentFileRoots = Array.isArray(input.recentFileRoots)
    ? dedupeRootPaths(input.recentFileRoots.filter((item): item is string => typeof item === "string"))
    : [...base.recentFileRoots]
  if (recentFileRoots.length === 0 && migratedRecentRoots.length > 0) {
    recentFileRoots = dedupeRootPaths(migratedRecentRoots)
  }
  const rawFavorites = Array.isArray(input.favoriteFileRoots) ? input.favoriteFileRoots : input.fileRootPins
  const normalizedFavorites = Array.isArray(rawFavorites)
    ? dedupeRootPaths(rawFavorites.filter((item): item is string => typeof item === "string"))
    : dedupeRootPaths(base.favoriteFileRoots)
  return {
    projectDirectory:
      typeof input.projectDirectory === "string" && isDirectory(input.projectDirectory)
        ? input.projectDirectory
        : base.projectDirectory,
    visibility: {
      showMcp:
        typeof visibility.showMcp === "boolean"
          ? visibility.showMcp
          : typeof input.showMcp === "boolean"
            ? input.showMcp
            : base.visibility.showMcp,
      showLsp:
        typeof visibility.showLsp === "boolean"
          ? visibility.showLsp
          : typeof input.showLsp === "boolean"
            ? input.showLsp
            : base.visibility.showLsp,
    },
    scripts: normalizeScriptSettings(input.scripts, base.scripts),
    scriptPins: Array.isArray(input.scriptPins)
      ? [...new Set(input.scriptPins.filter((item): item is string => typeof item === "string"))]
      : [...base.scriptPins],
    favoriteFileRoots: normalizedFavorites,
    recentFileRoots,
    fileRoots,
    usageProviders:
      "usageProviders" in input
        ? normalizeUsageProviders(input.usageProviders, base.usageProviders)
        : [...base.usageProviders],
    usageSpacing: typeof input.usageSpacing === "boolean" ? input.usageSpacing : base.usageSpacing,
    usageSubscriptions:
      "usageSubscriptions" in input
        ? normalizeUsageSubscriptions(input.usageSubscriptions)
        : [...base.usageSubscriptions],
  }
}

export function sidebarConfigPaths(
  projectRoot: string,
  homeDirectory = os.homedir(),
): { user: string; project: string } {
  return {
    user: path.join(homeDirectory, ".config", "openSidebar", "config.json"),
    project: path.join(projectRoot, ".config", "openSidebar.json"),
  }
}

// Pins, favorites, and file roots are machine state, so oc keeps them in its state folder and never
// writes into the project; the project file above is a hand-written override oc only reads.
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

export function hasConfiguredScripts(value: unknown): boolean {
  return Boolean(
    value && typeof value === "object" && "scripts" in value && (value as { scripts?: unknown }).scripts !== undefined,
  )
}

export function loadSidebarSettings(
  projectRoot: string,
  homeDirectory = os.homedir(),
  userPath = sidebarConfigPaths(projectRoot, homeDirectory).user,
  projectPath = sidebarConfigPaths(projectRoot, homeDirectory).project,
  base = defaultSidebarSettings(),
  statePath?: string,
): SidebarSettings {
  const user = readJsonFile(userPath)
  const project = readJsonFile(projectPath)
  const userSettings = normalizeSidebarSettings(user, base)
  const projectSettings = normalizeSidebarSettings(project, userSettings)
  return statePath ? normalizeSidebarSettings(readJsonFile(statePath), projectSettings) : projectSettings
}

export function saveUserScriptSettings(homeDirectory: string, scripts: ScriptSettings): void {
  const filePath = path.join(homeDirectory, ".config", "openSidebar", "config.json")
  const existing = readJsonFile(filePath)
  const base = existing && typeof existing === "object" ? (existing as Record<string, unknown>) : {}
  writeJsonObject(filePath, { ...base, scripts })
}

export function saveUserUsageProviders(homeDirectory: string, usageProviders: UsageProviderId[]): void {
  const filePath = path.join(homeDirectory, ".config", "openSidebar", "config.json")
  const existing = readJsonFile(filePath)
  const base = existing && typeof existing === "object" ? (existing as Record<string, unknown>) : {}
  writeJsonObject(filePath, { ...base, usageProviders: [...usageProviders] })
}

export function saveUserUsageSpacing(homeDirectory: string, usageSpacing: boolean): void {
  const filePath = path.join(homeDirectory, ".config", "openSidebar", "config.json")
  const existing = readJsonFile(filePath)
  const base = existing && typeof existing === "object" ? (existing as Record<string, unknown>) : {}
  writeJsonObject(filePath, { ...base, usageSpacing })
}

export function saveUserUsageSubscriptions(homeDirectory: string, usageSubscriptions: UsageSubscription[]): void {
  const filePath = path.join(homeDirectory, ".config", "openSidebar", "config.json")
  const existing = readJsonFile(filePath)
  const base = existing && typeof existing === "object" ? (existing as Record<string, unknown>) : {}
  writeJsonObject(filePath, { ...base, usageSubscriptions: [...usageSubscriptions] })
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
