// Config items: skills, commands, agents, themes, prompts, instructions, code, and settings keys,
// collected as portable units with ids that match across machines. Export/import (`ocPack.ts`) and
// tailnet sync (`ocSync.ts`) share this model. The wire form (`toWire`) is the same on every
// machine: home folder replaced by HOME_TOKEN, secrets redacted. Plan: docs/dev/syncPlan.md.
import { existsSync } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser"
import { Global } from "../global"
import { Hash } from "./hash"

export const REDACTED = "<redacted>"
export const HOME_TOKEN = "{{OC_HOME}}"

export type Root = "config" | "legacy"
export type Category =
  | "skill"
  | "command"
  | "agent"
  | "theme"
  | "prompt"
  | "instruction"
  | "code"
  | "config"
  | "tui"
  | "oc"
export type KeyFile = "opencode" | "tui" | "oc"
export type Source = Root | KeyFile
export type Tag = "windows" | "posix" | "localMcp"
export type FileEntry = { path: string; text?: string; base64?: string }
type ItemBase = { id: string; category: Category; label: string; code: boolean }
export type FilesItem = ItemBase & { kind: "files"; root: Root; files: FileEntry[] }
export type KeyItem = ItemBase & { kind: "key"; file: KeyFile; path: string[]; value: unknown }
export type Item = FilesItem | KeyItem
export type Entry = { item: Item; status: "new" | "changed"; missing: string[] }
// One row of the picker tree. `key` is an id prefix (ends in `:` `/` `.`), a full item id, or `tag:<Tag>`.
export type TreeNode = { key: string; title: string; depth: number; ids: string[]; parent?: string; leaf: boolean }

export const CATEGORY_TITLE: Record<Category, string> = {
  skill: "Skills",
  command: "Commands",
  agent: "Agents",
  theme: "Themes",
  prompt: "Prompts",
  instruction: "Instructions",
  config: "Config (opencode.jsonc)",
  tui: "TUI settings (tui.json)",
  oc: "oc settings (oc.json)",
  code: "Code: tools, plugins, scripts",
}
export const TAG_TITLE: Record<Tag, string> = {
  windows: "Windows-only",
  posix: "Mac/Linux-only",
  localMcp: "Local MCP servers",
}

const _MAX_FILE = 2 * 1024 * 1024
const _KEEP_BACKUPS = 10
const _ROOTS = new Set<string>(["config", "legacy"])
const _KEY_FILES = new Set<string>(["opencode", "tui", "oc"])
// Folder (relative to a root) -> category; each file is one item, except skills (one item per SKILL.md folder).
const _FILE_DIRS: [string, Category][] = [
  ["command", "command"],
  ["commands", "command"],
  ["agent", "agent"],
  ["agents", "agent"],
  ["themes", "theme"],
  ["prompts", "prompt"],
  ["tool", "code"],
  ["tools", "code"],
  ["plugin", "code"],
  ["plugins", "code"],
  ["scripts", "code"],
]
// opencode.jsonc maps split one level down so one agent or MCP server can be picked alone.
const _SPLIT_KEYS = new Set(["agent", "command", "mcp", "provider"])
// oc.json keys that describe this machine, not a preference. `sync` is per machine too.
const _MACHINE_OC_KEYS = new Set(["executable", "ocDir", "homeDir", "server", "revive", "allowImport", "sync"])
const _SKIP_NAME = /^(node_modules|\.git|\.DS_Store|auth\.json|\.env.*|.*\.(pem|key))$/i
const _SECRET_KEY = /api[-_]?key|token|secret|password|authorization/i
const _SCRIPT_FILE = /\.(ps1|sh|bash|zsh|py|js|mjs|cjs|ts|exe|bat|cmd)$/i
const _WINDOWS_FILE = /\.(ps1|psm1|bat|cmd|exe)$/i
const _POSIX_FILE = /\.(sh|bash|zsh)$/i
const _WINDOWS_PATH = /\b[a-z]:[\\/]|\.(exe|ps1|cmd|bat)\b/i

export function rootDir(root: Root) {
  return root === "config" ? Global.Path.config : path.join(Global.Path.home, ".opencode")
}

// --- Collect ---

// File reads keyed by absolute path; a rescan reads only files whose mtime or size changed.
const _cache = new Map<string, { mtimeMs: number; size: number; data: Buffer }>()

// `unread`: sources that could not be read this time (missing root, broken jsonc). Sync must not
// treat their items as deleted. `mtimes`: newest file time per item id.
export async function collect() {
  const skipped: string[] = []
  const unread = new Set<Source>()
  const found = [
    ...(await collectRoot("config", skipped, unread)),
    ...(await collectRoot("legacy", skipped, unread)),
    ...(await collectKeys(unread)),
  ]
  return {
    items: found.map((entry) => entry.item),
    mtimes: new Map(found.map((entry) => [entry.item.id, entry.mtime])),
    skipped,
    unread,
  }
}

type Found = { item: Item; mtime: number }

async function collectRoot(root: Root, skipped: string[], unread: Set<Source>): Promise<Found[]> {
  const base = rootDir(root)
  const names = await fs.readdir(base, { withFileTypes: true }).catch(() => undefined)
  if (!names) {
    unread.add(root)
    return []
  }
  const skills = await collectSkills(root, base, "skills", skipped)
  const files = await Promise.all(
    _FILE_DIRS.map(async ([dir, category]) => {
      const paths = await walk(base, dir, skipped)
      return Promise.all(
        paths
          .filter((file) => category !== "theme" || file.endsWith(".json"))
          .filter((file) => !["command", "agent"].includes(category) || file.endsWith(".md"))
          .map((file) => filesItem(root, base, category, file, [file], category === "code")),
      )
    }),
  )
  const instructions = await Promise.all(
    names
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => filesItem(root, base, "instruction", entry.name, [entry.name], false)),
  )
  return [...skills, ...files.flat(), ...instructions]
}

// One item per folder holding SKILL.md, with every file under it.
async function collectSkills(root: Root, base: string, dir: string, skipped: string[]): Promise<Found[]> {
  const full = path.join(base, dir)
  const names = await fs.readdir(full).catch(() => [] as string[])
  if (names.includes("SKILL.md")) {
    const files = await walk(base, dir, skipped)
    return [
      await filesItem(
        root,
        base,
        "skill",
        dir.slice("skills/".length),
        files,
        files.some((f) => _SCRIPT_FILE.test(f)),
      ),
    ]
  }
  const children = await Promise.all(
    names
      .filter((name) => !_SKIP_NAME.test(name))
      .map(async (name) => {
        const stat = await fs.stat(path.join(full, name)).catch(() => undefined)
        return stat?.isDirectory() ? collectSkills(root, base, `${dir}/${name}`, skipped) : []
      }),
  )
  return children.flat()
}

// Every file under `base/dir` (symlinks followed), as forward-slash paths relative to `base`.
async function walk(base: string, dir: string, skipped: string[], depth = 0): Promise<string[]> {
  if (depth > 8) return []
  const names = await fs.readdir(path.join(base, dir)).catch(() => [] as string[])
  const nested = await Promise.all(
    names
      .filter((name) => !_SKIP_NAME.test(name))
      .map(async (name) => {
        const rel = `${dir}/${name}`
        const stat = await fs.stat(path.join(base, rel)).catch(() => undefined)
        if (stat?.isDirectory()) return walk(base, rel, skipped, depth + 1)
        if (!stat?.isFile()) return []
        if (stat.size > _MAX_FILE) {
          skipped.push(rel)
          return []
        }
        return [rel]
      }),
  )
  return nested.flat()
}

async function filesItem(
  root: Root,
  base: string,
  category: Category,
  label: string,
  paths: string[],
  code: boolean,
): Promise<Found> {
  const read = await Promise.all(paths.map((rel) => readCached(path.join(base, rel))))
  const files = paths.map((rel, index) => {
    const data = read[index].data
    return data.includes(0)
      ? { path: rel, base64: data.toString("base64") }
      : { path: rel, text: data.toString("utf8") }
  })
  const display = category === "skill" ? label : label.replace(/^[^/]+\//, "")
  return {
    item: { kind: "files", id: `${category}:${root}:${label}`, category, label: display, code, root, files },
    mtime: Math.max(0, ...read.map((entry) => entry.mtimeMs)),
  }
}

async function readCached(file: string) {
  const stat = await fs.stat(file)
  const hit = _cache.get(file)
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit
  const entry = { mtimeMs: stat.mtimeMs, size: stat.size, data: await fs.readFile(file) }
  _cache.set(file, entry)
  return entry
}

async function collectKeys(unread: Set<Source>): Promise<Found[]> {
  const files = await Promise.all((["opencode", "tui", "oc"] as const).map(readKeyFile))
  return files.flatMap((read, index) => {
    const file = (["opencode", "tui", "oc"] as const)[index]
    if (!read) {
      unread.add(file)
      return []
    }
    const found = (item: KeyItem): Found => ({ item, mtime: read.mtime })
    return Object.entries(read.value).flatMap(([key, value]): Found[] => {
      if (key === "$schema") return []
      if (file === "oc" && _MACHINE_OC_KEYS.has(key)) return []
      if (file === "opencode" && _SPLIT_KEYS.has(key) && isRecord(value)) {
        return Object.entries(value).map(([name, inner]) => found(keyItem(file, [key, name], inner)))
      }
      return [found(keyItem(file, [key], value))]
    })
  })
}

function keyItem(file: KeyFile, keys: string[], value: unknown): KeyItem {
  const code =
    (keys[0] === "mcp" && isRecord(value) && (value.type === "local" || "command" in value)) || keys[0] === "plugin"
  return {
    kind: "key",
    id: `${file}:${keys.join(".")}`,
    category: file === "opencode" ? "config" : file,
    label: keys.join("."),
    code,
    file,
    path: keys,
    value,
  }
}

export function keyFilePath(file: KeyFile) {
  const names = {
    opencode: ["opencode.jsonc", "opencode.json", "config.json"],
    tui: ["tui.jsonc", "tui.json"],
    oc: ["oc.json"],
  }[file]
  const candidates = names.map((name) => path.join(Global.Path.config, name))
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

// undefined when the file exists but cannot be read or parsed (a half-saved edit must not look
// like every key was deleted). A missing file is an empty one.
async function readKeyFile(file: KeyFile) {
  const target = keyFilePath(file)
  const stat = await fs.stat(target).catch(() => undefined)
  if (!stat) return { value: {} as Record<string, unknown>, mtime: 0 }
  const read = await readCached(target).catch(() => undefined)
  if (!read) return undefined
  const errors: ParseError[] = []
  const value = parse(read.data.toString("utf8"), errors, { allowTrailingComma: true })
  if (errors.length || !isRecord(value)) return undefined
  return { value, mtime: read.mtimeMs }
}

// Which source an item id belongs to: files ids are `category:root:...`, key ids `file:...`.
export function sourceOf(id: string): Source {
  const [head, second] = id.split(":")
  return (_KEY_FILES.has(head) ? head : second) as Source
}

// --- Wire form: equal on every machine for equal config ---

export function toWire(item: Item): Item {
  const home = Global.Path.home
  if (item.kind === "key") {
    return { ...item, value: mapStrings(redact(item.value), (text) => rewriteHome(text, home, HOME_TOKEN)) }
  }
  return {
    ...item,
    files: item.files.map((file) =>
      file.text === undefined ? file : { ...file, text: rewriteHome(file.text, home, HOME_TOKEN) },
    ),
  }
}

// `local`: this machine's current item, whose secret values fill the redacted ones.
export function fromWire(item: Item, local?: Item): Item {
  const home = Global.Path.home.replaceAll("\\", "/")
  if (item.kind === "files") {
    return {
      ...item,
      files: item.files.map((file) =>
        file.text === undefined ? file : { ...file, text: file.text.replaceAll(HOME_TOKEN, home) },
      ),
    }
  }
  const value = mapStrings(item.value, (text) => text.replaceAll(HOME_TOKEN, home))
  return { ...item, value: restoreRedacted(value, local?.kind === "key" ? local.value : undefined) }
}

export function hash(item: Item) {
  if (item.kind === "key") return Hash.fast(stableJson(item.value))
  const files = [...item.files].sort((a, b) => a.path.localeCompare(b.path))
  return Hash.fast(files.map((file) => `${file.path}\0${file.text ?? file.base64 ?? ""}`).join("\0"))
}

function mapStrings(value: unknown, map: (text: string) => string): unknown {
  if (typeof value === "string") return map(value)
  if (Array.isArray(value)) return value.map((inner) => mapStrings(inner, map))
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, mapStrings(inner, map)]))
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (!isRecord(value)) return JSON.stringify(value) ?? "null"
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`
}

// --- Secrets: inline credentials never leave this machine ---

export function redact(value: unknown, key = ""): unknown {
  if (typeof value === "string") return _SECRET_KEY.test(key) && !/^\{(env|file):/.test(value) ? REDACTED : value
  if (Array.isArray(value)) return value.map((inner) => redact(inner, key))
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value).map(([name, inner]) => [name, redact(inner, name)]))
}

// Redacted leaves take this machine's value at the same path, or drop out when there is none.
export function restoreRedacted(value: unknown, local: unknown): unknown {
  if (value === REDACTED) return local
  if (Array.isArray(value)) return JSON.stringify(value).includes(REDACTED) ? local : value
  if (!isRecord(value)) return value
  const localRecord = isRecord(local) ? local : {}
  return Object.fromEntries(
    Object.entries(value).flatMap(([name, inner]) => {
      const next = restoreRedacted(inner, localRecord[name])
      return next === undefined ? [] : [[name, next]]
    }),
  )
}

// --- Paths: a home folder becomes another, with forward slashes ---

export function rewriteHome(text: string, from: string, to: string) {
  const target = to.replaceAll("\\", "/")
  if (from.replaceAll("\\", "/").toLowerCase() === target.toLowerCase()) return text
  const parts = from.split(/[\\/]+/).filter(Boolean)
  const lead = /^[\\/]/.test(from) ? "[\\\\/]+" : ""
  // `(?![\w.-])`: the home folder must end there, so `C:\Users\Foster` never matches `C:\Users\FosterX`.
  const pattern = new RegExp(
    `${lead}${parts.map(escape).join("[\\\\/]+")}(?![\\w.-])((?:[\\\\/]+[^\\s"'\`<>|]*)?)`,
    "gi",
  )
  return text.replace(pattern, (_match, rest: string) => target + rest.replace(/\\+/g, "/").replace(/\/+/g, "/"))
}

// Absolute paths under our home that the text points at but this machine does not have.
export function missingPaths(text: string, home: string) {
  const target = home.replaceAll("\\", "/")
  const found = text.match(new RegExp(`${escape(target)}/[^\\s"'\`<>|,;)\\]}]*`, "gi")) ?? []
  return [...new Set(found.map((item) => item.replace(/[.:]+$/, "")))].filter((item) => !existsSync(item))
}

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// --- Selection: tags, exclusion, picker tree ---

export function tags(item: Item): Tag[] {
  if (item.kind === "files") {
    const paths = item.files.map((file) => file.path)
    return [
      paths.some((file) => _WINDOWS_FILE.test(file)) ? "windows" : undefined,
      paths.some((file) => _POSIX_FILE.test(file)) ? "posix" : undefined,
    ].filter((tag): tag is Tag => tag !== undefined)
  }
  const local = item.path[0] === "mcp" && item.code
  return [
    _WINDOWS_PATH.test(JSON.stringify(item.value) ?? "") ? "windows" : undefined,
    local ? "localMcp" : undefined,
  ].filter((tag): tag is Tag => tag !== undefined)
}

// `exclude` holds tree keys: a prefix ending in `:` `/` `.` covers everything under it, a full id
// covers that item, `tag:<Tag>` covers every item with the tag.
export function excluded(id: string, itemTags: readonly string[], exclude: readonly string[]) {
  return exclude.some((entry) => (entry.startsWith("tag:") ? itemTags.includes(entry.slice(4)) : covers(entry, id)))
}

function covers(key: string, id: string) {
  return id === key || (/[:/.]$/.test(key) && id.startsWith(key))
}

export function excludeNode(exclude: readonly string[], node: TreeNode) {
  return [...exclude.filter((entry) => !covers(node.key, entry)), node.key]
}

// Removes the node's own entries. An excluded ancestor is replaced by the siblings along the path
// down to this node, at every level below it, so only this node comes back.
export function includeNode(exclude: readonly string[], node: TreeNode, nodes: readonly TreeNode[]) {
  if (node.key.startsWith("tag:")) return exclude.filter((entry) => entry !== node.key)
  const byKey = new Map(nodes.map((entry) => [entry.key, entry]))
  const ancestors: TreeNode[] = []
  for (let at = byKey.get(node.parent ?? ""); at; at = byKey.get(at.parent ?? "")) ancestors.unshift(at)
  const start = ancestors.findIndex((ancestor) => exclude.includes(ancestor.key))
  const kept = exclude.filter((entry) => !covers(node.key, entry))
  if (start === -1) return kept
  const siblings = ancestors.slice(start).flatMap((ancestor, index) => {
    const keep = ancestors[start + index + 1] ?? node
    return nodes.filter((entry) => entry.parent === ancestor.key && entry.key !== keep.key).map((entry) => entry.key)
  })
  return [...kept.filter((entry) => !ancestors.slice(start).some((ancestor) => ancestor.key === entry)), ...siblings]
}

type Trie = { key: string; title: string; ids: string[]; children: Map<string, Trie> }

// Category > root > folders (files) or key path (settings), then one row per tag. Levels with a
// single folder child are skipped so a one-root category lists its items directly.
export function tree(items: readonly Item[]): TreeNode[] {
  const order = Object.keys(CATEGORY_TITLE)
  const top = new Map<string, Trie>()
  const sorted = [...items].sort(
    (a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.id.localeCompare(b.id),
  )
  for (const item of sorted) {
    const head = item.kind === "files" ? `${item.category}:` : `${item.file}:`
    const segments =
      item.kind === "files" ? [item.root, ...item.id.slice(`${head}${item.root}:`.length).split("/")] : item.path
    const category: Trie = top.get(head) ?? {
      key: head,
      title: CATEGORY_TITLE[item.category],
      ids: [],
      children: new Map(),
    }
    top.set(head, category)
    category.ids.push(item.id)
    segments.reduce((level, segment, index) => {
      const key = index === segments.length - 1 ? item.id : nodeKey(item, head, segments, index)
      const node: Trie = level.children.get(key) ?? { key, title: segment, ids: [], children: new Map() }
      level.children.set(key, node)
      node.ids.push(item.id)
      return node
    }, category)
  }
  const nodes: TreeNode[] = []
  const flatten = (node: Trie, depth: number, parent?: string) => {
    nodes.push({ key: node.key, title: node.title, depth, ids: node.ids, leaf: node.children.size === 0, parent })
    for (const child of visibleChildren(node)) flatten(child, depth + 1, node.key)
  }
  for (const category of top.values()) flatten(category, 0)
  const tagged = (Object.keys(TAG_TITLE) as Tag[]).flatMap((tag): TreeNode[] => {
    const ids = sorted.filter((item) => tags(item).includes(tag)).map((item) => item.id)
    return ids.length ? [{ key: `tag:${tag}`, title: `Tag: ${TAG_TITLE[tag]}`, depth: 0, ids, leaf: false }] : []
  })
  return [...nodes, ...tagged]
}

function nodeKey(item: Item, head: string, segments: string[], index: number) {
  if (item.kind === "key") return `${head}${segments.slice(0, index + 1).join(".")}.`
  if (index === 0) return `${head}${segments[0]}:`
  return `${head}${segments[0]}:${segments.slice(1, index + 1).join("/")}/`
}

function visibleChildren(node: Trie): Trie[] {
  const children = [...node.children.values()]
  if (children.length === 1 && children[0].children.size > 0) return visibleChildren(children[0])
  return children
}

// --- Compare: incoming wire items against this machine ---

export async function compare(items: readonly Item[]) {
  const local = new Map((await collect()).items.map((item) => [item.id, item]))
  const entries = items.flatMap((wire): Entry[] => {
    const current = local.get(wire.id)
    if (current && hash(toWire(current)) === hash(wire)) return []
    const item = fromWire(wire, current)
    const text = item.kind === "key" ? JSON.stringify(item.value) : item.files.map((file) => file.text ?? "").join("\n")
    return [{ item, status: current ? "changed" : "new", missing: missingPaths(text ?? "", Global.Path.home) }]
  })
  return { entries, same: items.length - entries.length }
}

// --- Apply and undo ---

type BackupRecord = { files: { target: string; existed: boolean }[] }

export function importBackupRoot() {
  return path.join(Global.Path.state, "import")
}

// Writes `items` and deletes `remove` (files, or keys from their settings file). Every file it
// touches is copied first into a new folder under `backupRoot`; `undo` restores it.
export async function apply(
  items: readonly Item[],
  options: { remove?: readonly Item[]; backupRoot?: string; keep?: number } = {},
) {
  const remove = options.remove ?? []
  const writes = new Map<string, () => Promise<string | Buffer | undefined>>()
  for (const item of [...items, ...remove]) assertSafe(item)
  for (const item of items.filter((entry): entry is FilesItem => entry.kind === "files")) {
    for (const file of item.files) {
      const data = file.text ?? Buffer.from(file.base64 ?? "", "base64")
      writes.set(filePath(item.root, file.path), async () => data)
    }
  }
  for (const item of remove.filter((entry): entry is FilesItem => entry.kind === "files")) {
    for (const file of item.files) writes.set(filePath(item.root, file.path), async () => undefined)
  }
  const keyEdits = [
    ...items.filter((entry): entry is KeyItem => entry.kind === "key"),
    ...remove.filter((entry): entry is KeyItem => entry.kind === "key").map((item) => ({ ...item, value: undefined })),
  ]
  for (const file of new Set(keyEdits.map((item) => item.file))) {
    const target = keyFilePath(file)
    writes.set(target, async () => {
      const text = await fs.readFile(target, "utf8").catch(() => "{}")
      return keyEdits
        .filter((item) => item.file === file)
        .reduce(
          (result, item) =>
            applyEdits(
              result,
              modify(result, item.path, item.value, { formattingOptions: { insertSpaces: true, tabSize: 2 } }),
            ),
          text,
        )
    })
  }

  const backupRoot = options.backupRoot ?? importBackupRoot()
  const dir = path.join(backupRoot, new Date().toISOString().replace(/[:.]/g, "-"))
  await fs.mkdir(path.join(dir, "files"), { recursive: true })
  const record: BackupRecord = { files: [] }
  for (const [index, target] of [...writes.keys()].entries()) {
    const existed = existsSync(target)
    if (existed) await fs.copyFile(target, path.join(dir, "files", String(index)))
    record.files.push({ target, existed })
  }
  await fs.writeFile(path.join(dir, "record.json"), JSON.stringify(record, null, 2))

  for (const [target, data] of writes) {
    const content = await data()
    if (content === undefined) {
      await fs.rm(target, { force: true })
      // Only succeeds on an empty folder, so a removed skill does not leave its folder behind.
      await fs.rmdir(path.dirname(target)).catch(() => undefined)
      continue
    }
    await fs.mkdir(path.dirname(target), { recursive: true })
    const temporary = `${target}.tmp-${process.pid}`
    await fs.writeFile(temporary, content)
    await fs.rename(temporary, target)
  }
  await pruneBackups(backupRoot, options.keep ?? _KEEP_BACKUPS)
  return { backup: dir, files: writes.size }
}

// Items come from files and other machines: nothing may write outside its root or touch
// machine-only oc.json keys.
function assertSafe(item: Item) {
  if (item.kind === "files") {
    if (!_ROOTS.has(item.root)) throw new Error(`Unknown root in ${item.id}`)
    for (const file of item.files) filePath(item.root, file.path)
    return
  }
  if (!_KEY_FILES.has(item.file) || item.path.length === 0) throw new Error(`Unknown settings file in ${item.id}`)
  if (item.file === "oc" && _MACHINE_OC_KEYS.has(item.path[0])) throw new Error(`${item.id} is machine-only`)
}

function filePath(root: Root, rel: string) {
  const base = path.resolve(rootDir(root))
  const target = path.resolve(base, ...rel.split("/"))
  if (!target.startsWith(base + path.sep)) throw new Error(`Unsafe path ${rel}`)
  return target
}

async function pruneBackups(root: string, keep: number) {
  const dirs = (await fs.readdir(root).catch(() => [] as string[])).sort().reverse()
  await Promise.all(dirs.slice(keep).map((name) => fs.rm(path.join(root, name), { recursive: true, force: true })))
}

export async function lastBackup(root = importBackupRoot()) {
  const dirs = (await fs.readdir(root).catch(() => [] as string[])).sort()
  return dirs.length ? path.join(root, dirs[dirs.length - 1]) : undefined
}

// Restores one backup (default: the newest import): changed files get their old content, new
// files are removed. Returns the number of files, or undefined when there is nothing to undo.
export async function undo(dir?: string) {
  const target = dir ?? (await lastBackup())
  if (!target || !existsSync(path.join(target, "record.json"))) return undefined
  const record = JSON.parse(await fs.readFile(path.join(target, "record.json"), "utf8")) as BackupRecord
  for (const [index, file] of record.files.entries()) {
    if (!file.existed) {
      await fs.rm(file.target, { force: true })
      continue
    }
    await fs.mkdir(path.dirname(file.target), { recursive: true })
    await fs.copyFile(path.join(target, "files", String(index)), file.target)
  }
  await fs.rm(target, { recursive: true, force: true })
  return record.files.length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export * as OcItems from "./ocItems"
