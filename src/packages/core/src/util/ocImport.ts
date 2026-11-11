// Import: pull skills, commands, agents, themes, and settings from another oc on the same tailnet.
// The serving side (opencode `server/importPeer.ts`) answers `hello` and `bundle`; the importing side
// (TUI `component/dialog-import.tsx`) scans, compares, and applies. Plan: docs/dev/importPlan.md.
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { applyEdits, modify, parse } from "jsonc-parser"
import { Global } from "../global"
import { InstallationVersion } from "../installation/version"
import { Hash } from "./hash"
import { which } from "./which"

export const PORT = 4097
export const BUNDLE_VERSION = 1
export const REDACTED = "<redacted>"
export const ROUTE = { hello: "/oc-import/hello", bundle: "/oc-import/bundle" } as const

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
export type FileEntry = { path: string; text?: string; base64?: string }
type ItemBase = { id: string; category: Category; label: string; code: boolean }
export type FilesItem = ItemBase & { kind: "files"; root: Root; files: FileEntry[] }
export type KeyItem = ItemBase & { kind: "key"; file: KeyFile; path: string[]; value: unknown }
export type Item = FilesItem | KeyItem
export type Hello = { name: string; os: string; ocVersion: string; home: string; fingerprint: string }
export type Bundle = { version: number; hello: Hello; items: Item[]; skipped: string[] }
export type Peer = { ip: string; host: string; hello: Hello }
export type Entry = { item: Item; status: "new" | "changed"; missing: string[] }

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

const _MAX_FILE = 2 * 1024 * 1024
const _MAX_BUNDLE = 20 * 1024 * 1024
const _KEEP_BACKUPS = 10
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
// oc.json keys that describe this machine, not a preference.
const _MACHINE_OC_KEYS = new Set(["executable", "ocDir", "homeDir", "server", "revive", "allowImport"])
const _SKIP_NAME = /^(node_modules|\.git|\.DS_Store|auth\.json|\.env.*|.*\.(pem|key))$/i
const _SECRET_KEY = /api[-_]?key|token|secret|password|authorization/i
const _SCRIPT_FILE = /\.(ps1|sh|bash|zsh|py|js|mjs|cjs|ts|exe|bat|cmd)$/i

export function rootDir(root: Root) {
  return root === "config" ? Global.Path.config : path.join(Global.Path.home, ".opencode")
}

// --- Collect: the same walk serves the bundle and the local side of the comparison ---

export async function collect() {
  const skipped: string[] = []
  const items = [
    ...(await collectRoot("config", skipped)),
    ...(await collectRoot("legacy", skipped)),
    ...(await collectKeys()),
  ]
  return { items, skipped }
}

export async function bundle(): Promise<Bundle> {
  const collected = await collect()
  const items = collected.items.map((item) => (item.kind === "key" ? { ...item, value: redact(item.value) } : item))
  const size = JSON.stringify(items).length
  if (size > _MAX_BUNDLE) throw new Error(`Bundle is ${Math.round(size / 1048576)} MB; the limit is 20 MB`)
  return { version: BUNDLE_VERSION, hello: await hello(), items, skipped: collected.skipped }
}

export async function hello(): Promise<Hello> {
  return {
    name: os.hostname(),
    os: process.platform,
    ocVersion: InstallationVersion,
    home: Global.Path.home,
    fingerprint: await fingerprint(),
  }
}

async function fingerprint() {
  const file = path.join(Global.Path.state, "peer-id")
  const existing = await fs.readFile(file, "utf8").catch(() => "")
  if (existing.trim()) return existing.trim()
  const id = randomUUID()
  await fs.writeFile(file, id)
  return id
}

async function collectRoot(root: Root, skipped: string[]) {
  const base = rootDir(root)
  if (!existsSync(base)) return []
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
    (await fs.readdir(base, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => filesItem(root, base, "instruction", entry.name, [entry.name], false)),
  )
  return [...skills, ...files.flat(), ...instructions]
}

// One item per folder holding SKILL.md, with every file under it.
async function collectSkills(root: Root, base: string, dir: string, skipped: string[]): Promise<FilesItem[]> {
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
): Promise<FilesItem> {
  const files = await Promise.all(
    paths.map(async (rel) => {
      const data = await fs.readFile(path.join(base, rel))
      return data.includes(0)
        ? { path: rel, base64: data.toString("base64") }
        : { path: rel, text: data.toString("utf8") }
    }),
  )
  const display = category === "skill" ? label : label.replace(/^[^/]+\//, "")
  return { kind: "files", id: `${category}:${root}:${label}`, category, label: display, code, root, files }
}

async function collectKeys(): Promise<KeyItem[]> {
  const [config, tui, oc] = await Promise.all((["opencode", "tui", "oc"] as const).map(readKeyFile))
  const configItems = Object.entries(config).flatMap(([key, value]): KeyItem[] => {
    if (key === "$schema") return []
    if (_SPLIT_KEYS.has(key) && isRecord(value)) {
      return Object.entries(value).map(([name, inner]) => keyItem("opencode", "config", [key, name], inner))
    }
    return [keyItem("opencode", "config", [key], value)]
  })
  const tuiItems = Object.entries(tui)
    .filter(([key]) => key !== "$schema")
    .map(([key, value]) => keyItem("tui", "tui", [key], value))
  const ocItems = Object.entries(oc)
    .filter(([key]) => !_MACHINE_OC_KEYS.has(key))
    .map(([key, value]) => keyItem("oc", "oc", [key], value))
  return [...configItems, ...tuiItems, ...ocItems]
}

function keyItem(file: KeyFile, category: Category, keys: string[], value: unknown): KeyItem {
  const code =
    (keys[0] === "mcp" && isRecord(value) && (value.type === "local" || "command" in value)) || keys[0] === "plugin"
  return {
    kind: "key",
    id: `${file}:${keys.join(".")}`,
    category,
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

async function readKeyFile(file: KeyFile): Promise<Record<string, unknown>> {
  const text = await fs.readFile(keyFilePath(file), "utf8").catch(() => "{}")
  const value = parse(text, [], { allowTrailingComma: true })
  return isRecord(value) ? value : {}
}

// --- Secrets: inline credentials never leave the serving machine ---

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

// --- Paths: the peer's home folder becomes ours, with forward slashes ---

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

// Absolute paths under our home that the rewritten text points at but this machine does not have.
export function missingPaths(text: string, home: string) {
  const target = home.replaceAll("\\", "/")
  const found = text.match(new RegExp(`${escape(target)}/[^\\s"'\`<>|,;)\\]}]*`, "gi")) ?? []
  return [...new Set(found.map((item) => item.replace(/[.:]+$/, "")))].filter((item) => !existsSync(item))
}

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// --- Scan: online tailnet peers that answer `hello` ---

export function tailscaleBinary() {
  const found = which("tailscale")
  if (found) return found
  const candidates =
    process.platform === "win32"
      ? [path.join(process.env.ProgramFiles ?? "C:/Program Files", "Tailscale", "tailscale.exe")]
      : [
          "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
          "/opt/homebrew/bin/tailscale",
          "/usr/local/bin/tailscale",
        ]
  return candidates.find((candidate) => existsSync(candidate))
}

export type TailscaleStatus = {
  selfUser: number
  selfIps: string[]
  peers: { host: string; ips: string[]; online: boolean; user: number }[]
}

export async function tailscaleStatus(): Promise<TailscaleStatus> {
  const binary = tailscaleBinary()
  if (!binary) throw new Error("Tailscale CLI not found")
  const output = await run(binary, ["status", "--json"])
  const status = JSON.parse(output) as {
    BackendState?: string
    Self?: { UserID?: number; TailscaleIPs?: string[] }
    Peer?: Record<
      string,
      { HostName?: string; DNSName?: string; TailscaleIPs?: string[]; Online?: boolean; UserID?: number }
    >
  }
  if (status.BackendState !== "Running") throw new Error(`Tailscale is ${status.BackendState ?? "not running"}`)
  return {
    selfUser: status.Self?.UserID ?? -1,
    selfIps: status.Self?.TailscaleIPs ?? [],
    peers: Object.values(status.Peer ?? {}).map((peer) => ({
      host: peer.DNSName?.split(".")[0] || peer.HostName || "",
      ips: peer.TailscaleIPs ?? [],
      online: peer.Online === true,
      user: peer.UserID ?? -2,
    })),
  }
}

function run(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], timeout: 5000 })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => (stdout += String(chunk)))
    child.stderr.on("data", (chunk) => (stderr += String(chunk)))
    child.on("error", reject)
    child.on("exit", (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `${command} exited with code ${code}`)),
    )
  })
}

// Only peers signed in to the same Tailscale account; `hello` decides which of them run oc.
export async function scan(): Promise<Peer[]> {
  const status = await tailscaleStatus()
  const own = await fingerprint()
  const found = await Promise.all(
    status.peers
      .filter((peer) => peer.online && peer.user === status.selfUser)
      .map(async (peer) => {
        const ip = peer.ips.find((item) => !item.includes(":"))
        if (!ip) return []
        const response = await fetch(`http://${ip}:${PORT}${ROUTE.hello}`, { signal: AbortSignal.timeout(1500) }).catch(
          () => undefined,
        )
        if (!response?.ok) return []
        const info = (await response.json().catch(() => undefined)) as Hello | undefined
        if (!info?.fingerprint || info.fingerprint === own) return []
        return [{ ip, host: peer.host, hello: info }]
      }),
  )
  return found.flat().sort((a, b) => a.host.localeCompare(b.host))
}

export async function fetchBundle(ip: string): Promise<Bundle> {
  const response = await fetch(`http://${ip}:${PORT}${ROUTE.bundle}`, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`${ip} answered ${response.status}: ${(await response.text()).slice(0, 200)}`)
  const result = (await response.json()) as Bundle
  if (result.version !== BUNDLE_VERSION) {
    throw new Error(
      `${result.hello?.name ?? ip} sends bundle format ${result.version}; this oc reads ${BUNDLE_VERSION}`,
    )
  }
  return result
}

// --- Compare: peer items after path rewrite and secret restore, against this machine ---

export async function compare(input: Bundle) {
  const local = new Map((await collect()).items.map((item) => [item.id, item]))
  const entries = input.items.flatMap((peerItem): Entry[] => {
    const current = local.get(peerItem.id)
    const item = localize(peerItem, input.hello.home, current)
    if (current && fingerprintOf(current) === fingerprintOf(item)) return []
    const text = item.kind === "key" ? JSON.stringify(item.value) : item.files.map((file) => file.text ?? "").join("\n")
    return [{ item, status: current ? "changed" : "new", missing: missingPaths(text, Global.Path.home) }]
  })
  return { entries, same: input.items.length - entries.length }
}

function localize(item: Item, from: string, current: Item | undefined): Item {
  const to = Global.Path.home
  if (item.kind === "files") {
    return {
      ...item,
      files: item.files.map((file) =>
        file.text === undefined ? file : { ...file, text: rewriteHome(file.text, from, to) },
      ),
    }
  }
  const value = restoreRedacted(item.value, current?.kind === "key" ? current.value : undefined)
  return { ...item, value: value === undefined ? undefined : JSON.parse(rewriteHome(JSON.stringify(value), from, to)) }
}

function fingerprintOf(item: Item) {
  if (item.kind === "key") return Hash.fast(stableJson(item.value))
  const files = [...item.files].sort((a, b) => a.path.localeCompare(b.path))
  return Hash.fast(files.map((file) => `${file.path}\0${file.text ?? file.base64 ?? ""}`).join("\0"))
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (!isRecord(value)) return JSON.stringify(value) ?? "null"
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`
}

// --- Apply and undo ---

type BackupRecord = { files: { target: string; existed: boolean }[] }

function backupRoot() {
  return path.join(Global.Path.state, "import")
}

// Writes the picked items. Every file it touches is copied first; import never deletes local files.
export async function apply(items: Item[]) {
  const writes = new Map<string, () => Promise<string | Buffer>>()
  for (const item of items.filter((entry): entry is FilesItem => entry.kind === "files")) {
    for (const file of item.files) {
      const data = file.text ?? Buffer.from(file.base64 ?? "", "base64")
      writes.set(path.join(rootDir(item.root), ...file.path.split("/")), async () => data)
    }
  }
  const keyItems = items.filter((entry): entry is KeyItem => entry.kind === "key")
  for (const file of new Set(keyItems.map((item) => item.file))) {
    const target = keyFilePath(file)
    writes.set(target, async () => {
      const text = await fs.readFile(target, "utf8").catch(() => "{}")
      return keyItems
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

  const dir = path.join(backupRoot(), new Date().toISOString().replace(/[:.]/g, "-"))
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
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, content)
  }
  await pruneBackups()
  return { backup: dir, files: writes.size }
}

async function pruneBackups() {
  const dirs = (await fs.readdir(backupRoot()).catch(() => [] as string[])).sort().reverse()
  await Promise.all(
    dirs.slice(_KEEP_BACKUPS).map((name) => fs.rm(path.join(backupRoot(), name), { recursive: true, force: true })),
  )
}

export async function lastBackup() {
  const dirs = (await fs.readdir(backupRoot()).catch(() => [] as string[])).sort()
  return dirs.length ? path.join(backupRoot(), dirs[dirs.length - 1]) : undefined
}

// Restores the newest import's backup: changed files get their old content, new files are removed.
export async function undo() {
  const dir = await lastBackup()
  if (!dir) return undefined
  const record = JSON.parse(await fs.readFile(path.join(dir, "record.json"), "utf8")) as BackupRecord
  for (const [index, file] of record.files.entries()) {
    if (file.existed) await fs.copyFile(path.join(dir, "files", String(index)), file.target)
    else await fs.rm(file.target, { force: true })
  }
  await fs.rm(dir, { recursive: true, force: true })
  return record.files.length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export * as OcImport from "./ocImport"
