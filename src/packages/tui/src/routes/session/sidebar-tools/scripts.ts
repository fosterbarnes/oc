// Script discovery (package.json and .scripts), the file tree, and row reconciliation.
import fs from "node:fs"
import path from "node:path"
import {
  defaultScriptSettings,
  type ScriptLanguage,
  type ScriptLauncher,
  type ScriptSettings,
  type ScriptTerminal,
  type WezTermSplitSize,
} from "./settings"

const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", "build", "coverage"])
export const MAX_TREE_ITEMS = 80
const PACKAGE_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"])

export type Script = {
  name: string
  command: string
  filePath?: string
  launcher: ScriptLauncher
  terminal: ScriptTerminal
  weztermSize: WezTermSplitSize
}
export type TreeEntry = { name: string; relativePath: string; fullPath: string; directory: boolean; depth: number }

function packageManager(directory: string): string {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"))
    if (typeof packageJson.packageManager === "string") {
      const manager = packageJson.packageManager.split("@")[0]
      if (PACKAGE_MANAGERS.has(manager)) return manager
    }
  } catch {
    // Lockfiles are the fallback when package.json is absent or invalid.
  }

  for (const [file, manager] of [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["package-lock.json", "npm"],
  ] as const) {
    if (fs.existsSync(path.join(directory, file))) return manager
  }
  return "npm"
}

function shellPath(filePath: string): string {
  return `"${filePath.replaceAll('"', '\\"')}"`
}

function fileScript(filePath: string, languages: readonly ScriptLanguage[]): Script | undefined {
  const fileName = path.basename(filePath).toLowerCase()
  const language = languages.find(
    (item) => item.enabled && item.extensions.some((extension) => fileName.endsWith(extension)),
  )
  return language
    ? {
        name: path.relative(path.dirname(path.dirname(filePath)), filePath),
        command: shellPath(filePath),
        filePath,
        launcher: language.launcher,
        terminal: "native",
        weztermSize: { Percent: 50 },
      }
    : undefined
}

function readPackageScripts(directory: string, shell: ScriptLauncher): Script[] {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"))
    if (!packageJson.scripts || typeof packageJson.scripts !== "object") return []
    const manager = packageManager(directory)
    return Object.keys(packageJson.scripts)
      .filter((name) => /^[a-zA-Z0-9_:.\/-]+$/.test(name))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({
        name,
        command: `${manager} run ${name}`,
        launcher: shell,
        terminal: "native",
        weztermSize: { Percent: 50 },
      }))
  } catch {
    return []
  }
}

function readFileScripts(root: string, languages: readonly ScriptLanguage[]): Script[] {
  const scriptsDirectory = path.basename(root) === ".scripts" ? root : path.join(root, ".scripts")
  try {
    return fs
      .readdirSync(scriptsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => fileScript(path.join(scriptsDirectory, entry.name), languages))
      .filter((script): script is Script => Boolean(script))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

export function readScripts(
  projectRoot: string,
  fileRoot = projectRoot,
  settings: ScriptSettings = defaultScriptSettings(),
): Script[] {
  return [...readPackageScripts(projectRoot, settings.shell), ...readFileScripts(fileRoot, settings.languages)].map(
    (script) => ({
      ...script,
      terminal: settings.terminal,
      weztermSize:
        settings.terminal === "wezterm-horizontal"
          ? settings.wezterm.horizontal
          : settings.terminal === "wezterm-vertical"
            ? settings.wezterm.vertical
            : settings.wezterm.horizontal,
    }),
  )
}

export function readTree(root: string, expanded: ReadonlySet<string>): TreeEntry[] {
  const entries: TreeEntry[] = []

  function visit(directory: string, depth: number): void {
    if (entries.length >= MAX_TREE_ITEMS) return
    let children: fs.Dirent[]
    try {
      children = fs.readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }

    children
      .filter((entry) => !entry.isDirectory() || !IGNORED_DIRECTORIES.has(entry.name))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      .forEach((entry) => {
        if (entries.length >= MAX_TREE_ITEMS) return
        const relativePath = path.relative(root, path.join(directory, entry.name)) || entry.name
        const directoryEntry = entry.isDirectory()
        entries.push({
          name: entry.name,
          relativePath,
          fullPath: path.join(directory, entry.name),
          directory: directoryEntry,
          depth,
        })
        if (directoryEntry && expanded.has(relativePath)) visit(path.join(directory, entry.name), depth + 1)
      })
  }

  visit(root, 0)
  return entries
}

// OpenTUI's native truncate puts the ellipsis mid-text; clip at the end instead.
// Unmeasured rows (width <= 0) render empty so repeated refreshes do not flash full paths before clipping.
export function clipEnd(text: string, width: number): string {
  if (text.length <= width) return text
  if (width <= 0) return ""
  if (width < 3) return text.slice(0, width)
  return `${text.slice(0, width - 3)}...`
}

function scriptKey(script: Script): string {
  if (script.filePath) return `file:${script.filePath}`
  return `package:${script.name}`
}

function treeKey(entry: TreeEntry): string {
  return JSON.stringify([entry.relativePath, entry.fullPath])
}

export function reconcileScripts(prev: Script[], next: Script[]): Script[] {
  return reconcileByKey(prev, next, scriptKey, scriptsEqual)
}

export function reconcileTree(prev: TreeEntry[], next: TreeEntry[]): TreeEntry[] {
  return reconcileByKey(prev, next, treeKey, treeEntriesEqual)
}

function reconcileByKey<T>(
  prev: T[],
  next: T[],
  key: (item: T) => string,
  equal: (first: T, second: T) => boolean,
): T[] {
  const byKey = new Map<string, T>()
  for (const item of prev) {
    if (!byKey.has(key(item))) byKey.set(key(item), item)
  }
  const result = next.map((item) => {
    const prior = byKey.get(key(item))
    if (prior && equal(prior, item)) return prior
    return item
  })
  if (result.length === prev.length && result.every((item, index) => item === prev[index])) return prev
  return result
}

function scriptsEqual(first: Script, second: Script): boolean {
  if (first.name !== second.name) return false
  if (first.command !== second.command) return false
  if (first.filePath !== second.filePath) return false
  if (first.terminal !== second.terminal) return false
  if (!launchersEqual(first.launcher, second.launcher)) return false
  if (!weztermSizesEqual(first.weztermSize, second.weztermSize)) return false
  return true
}

function treeEntriesEqual(first: TreeEntry, second: TreeEntry): boolean {
  if (first.name !== second.name) return false
  if (first.relativePath !== second.relativePath) return false
  if (first.fullPath !== second.fullPath) return false
  if (first.directory !== second.directory) return false
  if (first.depth !== second.depth) return false
  return true
}

function launchersEqual(first: ScriptLauncher, second: ScriptLauncher): boolean {
  if (first.executable !== second.executable) return false
  if (first.args.length !== second.args.length) return false
  return first.args.every((arg, index) => arg === second.args[index])
}

function weztermSizesEqual(first: WezTermSplitSize, second: WezTermSplitSize): boolean {
  if ("Percent" in first && "Percent" in second) return first.Percent === second.Percent
  if ("Cells" in first && "Cells" in second) return first.Cells === second.Cells
  return false
}
