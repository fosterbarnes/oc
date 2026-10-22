import { spawn } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { which } from "@opencode-ai/core/util/which"
import { setTimeout as sleep } from "node:timers/promises"
import { checkChatgptDesktop, prepareChatgptDesktop } from "./chatgptDesktopUpdate"
import { resolveCodexCli, resolveCursorCli, runCliCommand } from "./cliUpdate"
import { checkCursorDesktop, prepareCursorDesktop } from "./cursorDesktopUpdate"
import {
  checkClaudeDesktop,
  DOWNLOAD_HELPERS,
  prepareClaudeDesktop,
  PROGRESS_PREFIX,
  psString,
  scriptError,
  STEP_PREFIX,
  windowsPowershellEnv,
  type DesktopCheckResult,
  type DesktopInstallResult,
} from "./desktopUpdate"
import { checkPowershell, preparePowershell } from "./pwshUpdate"

export { psString }

// Dependency setup behind `oc oc deps` (the installer's ocSetup window is its only caller): detect
// what oc's features need and install the missing ones in table order. Apps that already have a
// harness update script reuse it with $AllowFresh and $PrepareDir; the rest download a vendor
// installer through INSTALL_SCRIPT, pinned by sha256 and/or Authenticode signer. Every download
// runs ahead of its install turn (`prepare`). Installs that share a Lock run one at a time.

export type DependencyStatus = "found" | "missing" | "outdated" | "error"
// `path` is the resolved executable for CLI rows (ocSetup points the oc shortcuts at WezTerm with it).
type Detection = { status: DependencyStatus; version?: string; latest?: string; message?: string; path?: string }
// What ocSetup's "Desktop shortcut" box launches: an exe (`target`), a CLI to run in a terminal
// (`target` + `terminal`), or an Appx app (`appId`, its AUMID). `name` alone: the row has a
// shortcut, but nothing is installed to point at yet.
export type DependencyShortcut = { name: string; target?: string; terminal?: boolean; appId?: string }
type ShortcutTarget = Omit<DependencyShortcut, "name">
// `checking`: the table line of `list`, printed before detection (see printDependencyList).
export type DependencyInfo = Omit<Detection, "status"> & {
  status: DependencyStatus | "checking"
  id: string
  label: string
  required: boolean
  defaultSelected: boolean
  needs: string[]
  shortcut?: DependencyShortcut
}
// `queued`: selected, nothing started. `ready`: downloaded and verified, waiting for its install turn.
export type InstallPhase =
  | "queued"
  | "start"
  | "downloading"
  | "verifying"
  | "ready"
  | "installing"
  | "done"
  | "failed"
  | "skipped"
export type InstallEvent = { id: string; phase: InstallPhase; received?: number; total?: number; message?: string }
type InstallResult = { ok: boolean; message: string }
type OnLine = (line: string) => void
type Env = NodeJS.ProcessEnv
type Install = (env: Env, onLine: OnLine) => Promise<InstallResult>

// What an install holds while it runs; rows sharing a lock install one at a time.
// `admin`: shows a UAC prompt, runs an MSI, or writes the machine PATH (one prompt at a time,
// Windows Installer allows one install, PATH is read-modify-write). `userPath`: writes the user PATH.
// `npm`: a global npm install (two at once into one prefix is not a documented safe case).
export type Lock = "admin" | "userPath" | "npm"

export type Dependency = {
  id: string
  label: string
  required?: boolean
  defaultSelected: boolean
  needs: string[]
  locks: Lock[]
  detect: (env: Env) => Promise<Detection>
  // Desktop shortcut; `find` runs only for installed rows and returns {} when it finds nothing.
  shortcut?: { name: string; find: (env: Env, detected: Detection) => ShortcutTarget }
} & (
  | { install: Install; prepare?: never }
  // Downloads and verifies into `dir` ahead of the install turn, then returns the install step.
  | { prepare: (dir: string, onLine: OnLine) => Promise<Install>; install?: never }
)

const VERSION_TIMEOUT_MS = 15_000
// ~1 GB across all rows; vendor CDNs cap each connection (Claude's MSIX came at ~2.6 MB/s on a VM).
const PREFETCH_LIMIT = 4
const INSTALL_TIMEOUT_MS = 20 * 60 * 1000
const GITHUB_HOSTS = ["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"]
const SILENT_INNO_ARGS = ["/VERYSILENT", "/NORESTART", "/NOCANCEL", "/SP-", "/SUPPRESSMSGBOXES"]
// voidtools has no "latest" API; bump both together from https://www.voidtools.com/downloads/.
const EVERYTHING_VERSION = "1.4.1.1032"
const EVERYTHING_SHA256 = "c42efad041d4c0bb4d4ac97ae7cbe89f153ec1fe078772392e749c7f5d5282d3"
const PWSH_EXE = path.join(process.env.ProgramFiles ?? "", "PowerShell", "7", "pwsh.exe")
const CURSOR_EXE = path.join(process.env.LOCALAPPDATA ?? "", "Programs", "cursor", "Cursor.exe")

// Windows creates %LOCALAPPDATA%\Packages\<family> when it registers an Appx for the user, so a
// missing folder means not installed; an existing one still goes through the real check.
function appxMissing(family: string) {
  return !existsSync(path.join(process.env.LOCALAPPDATA ?? "", "Packages", family))
}

export const DEPENDENCIES: Dependency[] = [
  {
    id: "pwsh",
    label: "PowerShell 7",
    required: true,
    defaultSelected: true,
    needs: [],
    locks: ["admin"],
    // The update check only knows the MSI install in Program Files\PowerShell\7 (and starts Windows
    // PowerShell, seconds on a new PC), so it runs only when that pwsh.exe exists. A pwsh from MSIX
    // or a zip still counts as found.
    detect: async (env) => {
      const checked = existsSync(PWSH_EXE) ? fromCheck(await checkPowershell()) : { status: "missing" as const }
      return checked.status === "missing" ? detectCli(which("pwsh", env), env) : checked
    },
    shortcut: {
      name: "PowerShell 7",
      find: (env) => exeAt(which("pwsh", env) ?? PWSH_EXE),
    },
    prepare: harnessPrepared(preparePowershell),
  },
  {
    id: "git",
    label: "Git for Windows",
    defaultSelected: true,
    needs: [],
    locks: ["admin"],
    detect: (env) => detectCli(which("git", env), env),
    shortcut: { name: "Git Bash", find: (_env, detected) => exeAt(gitBash(detected.path)) },
    prepare: prepared(async () => ({
      label: "Git for Windows",
      ...(await githubAsset("git-for-windows/git", /^Git-[\d.]+-64-bit\.exe$/)),
      signer: "Johannes Schindelin",
      kind: "exe",
      args: SILENT_INNO_ARGS,
      elevate: true,
    })),
  },
  {
    id: "node",
    label: "Node.js LTS",
    defaultSelected: true,
    needs: [],
    // The MSI also adds %APPDATA%\npm to the user PATH.
    locks: ["admin", "userPath"],
    detect: (env) => detectCli(which("node", env), env),
    prepare: prepared(async () => ({
      label: "Node.js",
      ...(await nodeLts()),
      signer: "OpenJS Foundation",
      kind: "msi",
      elevate: true,
    })),
  },
  {
    id: "everything",
    label: "Everything + es.exe",
    defaultSelected: true,
    needs: [],
    locks: ["admin"],
    detect: async (env) => {
      const app = everythingExe(env)
      const es = which("es", env)
      if (app && es) return { status: "found" }
      if (!app && !es) return { status: "missing" }
      return { status: "missing", message: `${app ? "es.exe" : "Everything"} not found` }
    },
    shortcut: { name: "Everything", find: (env) => exeAt(everythingExe(env)) },
    prepare: prepareEverything,
  },
  {
    id: "wezterm",
    label: "WezTerm",
    defaultSelected: true,
    needs: [],
    locks: ["admin"],
    detect: (env) => detectCli(which("wezterm", env), env),
    shortcut: {
      name: "WezTerm",
      find: (_env, detected) => exeAt(detected.path && path.join(path.dirname(detected.path), "wezterm-gui.exe")),
    },
    prepare: prepared(async () => {
      const download = await githubAsset("wezterm/wezterm", /^WezTerm-[\w-]+-setup\.exe$/)
      // WezTerm's installer is unsigned; its release ships a .sha256 file next to each asset.
      const sha256 = download.sha256 ?? (await fetchSha256(`${download.url}.sha256`))
      return { label: "WezTerm", ...download, sha256, kind: "exe", args: SILENT_INNO_ARGS, elevate: true }
    }),
  },
  // Harness rows keep one order for CLIs and desktop apps: Codex, Claude, Cursor.
  {
    id: "codexCli",
    label: "Codex CLI",
    defaultSelected: true,
    needs: ["node"],
    // npm writes only %APPDATA%\npm, which the Node.js installer already put on PATH.
    locks: ["npm"],
    detect: async (env) => detectResolved(await resolveCodexCli(env), env),
    shortcut: { name: "Codex CLI", find: terminalAt },
    install: (env, onLine) => npmGlobalInstall("Codex CLI", "@openai/codex", env, onLine),
  },
  {
    id: "claudeCli",
    label: "Claude Code CLI",
    defaultSelected: true,
    needs: ["node"],
    // npm instead of claude.ai/install.ps1: the same native binary (per-platform optional
    // dependency), documented by Anthropic, and it auto-updates. The install script's binary host
    // (Google Cloud Storage) failed on 2 VM runs in a row with an egress quota error.
    locks: ["npm"],
    detect: (env) => detectCli(which("claude", env), env),
    shortcut: { name: "Claude Code", find: terminalAt },
    install: (env, onLine) => npmGlobalInstall("Claude Code CLI", "@anthropic-ai/claude-code", env, onLine),
  },
  {
    id: "cursorCli",
    label: "Cursor CLI",
    defaultSelected: false,
    needs: [],
    // The vendor script adds its folder to the user PATH.
    locks: ["userPath"],
    detect: async (env) => detectResolved(await resolveCursorCli(env), env),
    shortcut: { name: "Cursor CLI", find: terminalAt },
    prepare: prepared(async () => ({
      label: "Cursor CLI",
      url: "https://cursor.com/install?win32=true",
      fileName: "install.ps1",
      hosts: ["cursor.com"],
      kind: "ps1",
    })),
  },
  // Both Appx desktops carry a service and are provisioned elevated (Install-MsixElevated), so they
  // take the admin lock. Their check scripts start Windows PowerShell (seconds on a new PC), so a
  // missing per-user package folder answers "missing" first.
  {
    id: "codexDesktop",
    label: "Codex (ChatGPT) desktop",
    defaultSelected: false,
    needs: [],
    locks: ["admin"],
    detect: async () =>
      appxMissing("OpenAI.Codex_2p2nqsd0c76g0") ? { status: "missing" } : fromCheck(await checkChatgptDesktop()),
    // AUMIDs: the family names pinned in the update scripts plus the Application Id (Get-StartApps).
    shortcut: { name: "ChatGPT", find: () => ({ appId: "OpenAI.Codex_2p2nqsd0c76g0!App" }) },
    prepare: harnessPrepared(prepareChatgptDesktop),
  },
  {
    id: "claudeDesktop",
    label: "Claude desktop",
    defaultSelected: false,
    needs: [],
    locks: ["admin"],
    detect: async () =>
      appxMissing("Claude_pzs8sxrjxfjjc") ? { status: "missing" } : fromCheck(await checkClaudeDesktop()),
    shortcut: { name: "Claude", find: () => ({ appId: "Claude_pzs8sxrjxfjjc!Claude" }) },
    prepare: harnessPrepared(prepareClaudeDesktop),
  },
  {
    id: "cursorDesktop",
    label: "Cursor desktop",
    defaultSelected: false,
    needs: [],
    // Per-user installer (no UAC) whose default tasks add Cursor's bin folder to the user PATH.
    locks: ["userPath"],
    // No Cursor.exe in either usual folder = missing without starting PowerShell. A custom install
    // folder shows missing; ticking it updates that install (the script finds it by its uninstall key).
    detect: async () =>
      [CURSOR_EXE, path.join(process.env.ProgramFiles ?? "", "cursor", "Cursor.exe")].some(existsSync)
        ? fromCheck(await checkCursorDesktop())
        : { status: "missing" },
    // Cursor's per-user installer location.
    shortcut: { name: "Cursor", find: () => exeAt(CURSOR_EXE) },
    prepare: harnessPrepared(prepareCursorDesktop),
  },
]

/**
 * Detects every row in parallel; `onRow` gets each row as its detection settles. Uses this
 * process's PATH: ocSetup starts the engine with Machine + User PATH from the registry, so rows
 * installed after the setup started are found. A terminal run sees that terminal's PATH.
 */
export async function listDependencies(
  deps = DEPENDENCIES,
  onRow?: (row: DependencyInfo) => void,
): Promise<DependencyInfo[]> {
  const env = process.env
  return Promise.all(
    deps.map(async (dep) => {
      const detected = await dep
        .detect(env)
        .catch((cause): Detection => ({ status: "error", message: errorText(cause) }))
      const installed = detected.status === "found" || detected.status === "outdated"
      const row = rowInfo(dep, detected, installed && dep.shortcut ? dep.shortcut.find(env, detected) : {})
      onRow?.(row)
      return row
    }),
  )
}

/**
 * `oc oc deps list` output: the table (every row `checking`) at once, then one JSON line per row
 * as its detection finishes, so ocSetup shows the rows before the slow checks end.
 */
export async function printDependencyList(print: (line: string) => void, deps = DEPENDENCIES) {
  print(JSON.stringify(deps.map((dep) => rowInfo(dep, { status: "checking" }, {}))))
  await listDependencies(deps, (row) => print(JSON.stringify(row)))
}

function rowInfo(
  dep: Dependency,
  detected: Omit<Detection, "status"> & { status: DependencyInfo["status"] },
  target: ShortcutTarget,
): DependencyInfo {
  return {
    id: dep.id,
    label: dep.label,
    required: dep.required ?? false,
    defaultSelected: dep.defaultSelected,
    needs: dep.needs,
    ...detected,
    ...(dep.shortcut && { shortcut: { name: dep.shortcut.name, ...target } }),
  }
}

/** Git Bash beside a Git for Windows install, from its `<root>\cmd\git.exe`. */
export function gitBash(git: string | undefined) {
  if (!git || path.basename(path.dirname(git)).toLowerCase() !== "cmd") return undefined
  return path.join(path.dirname(path.dirname(git)), "git-bash.exe")
}

function exeAt(file: string | null | undefined): ShortcutTarget {
  return file && existsSync(file) ? { target: file } : {}
}

// CLI rows: the detected executable, run in a terminal by the shortcut.
function terminalAt(_env: Env, detected: Detection): ShortcutTarget {
  return detected.path ? { target: detected.path, terminal: true } : {}
}

export function installDependencies(ids: string[], emit: (event: InstallEvent) => void) {
  return runInstalls(DEPENDENCIES, ids, emit, freshEnv)
}

/**
 * Installs the selected ids; true only when every one succeeded. `prepare` rows download first,
 * PREFETCH_LIMIT at a time in table order. A row waits for its locks once its selected `needs`
 * have settled (skipped if one failed) and its download is ready, so a row still downloading never
 * holds up a ready one. It takes all its locks at once when they are free and no earlier waiting
 * row wants one of them: rows sharing a lock never overlap, rows with disjoint locks run side by
 * side, no row holds one lock while waiting for another (no deadlock), and earlier rows go first
 * (node, with two locks, is not starved).
 */
export async function runInstalls(
  deps: Dependency[],
  ids: string[],
  emit: (event: InstallEvent) => void,
  refreshEnv: () => Promise<Env>,
) {
  const unknown = ids.filter((id) => !deps.some((dep) => dep.id === id))
  if (unknown.length) throw new Error(`Unknown dependency: ${unknown.join(", ")}`)
  const selected = deps.filter((dep) => ids.includes(dep.id))
  for (const dep of selected) emit({ id: dep.id, phase: "queued" })
  const lineTo = (id: string) => (line: string) => {
    const event = lineEvent(id, line)
    if (event) emit(event)
  }

  const dir = await mkdtemp(path.join(tmpdir(), "oc-deps-"))
  const prefetch = startPrefetch(selected, dir, emit, lineTo)
  const settled = new Map(selected.map((dep) => [dep.id, Promise.withResolvers<boolean>()]))
  const held = new Set<Lock>()
  // Ready rows waiting for their locks, in table order.
  const waiting: Dependency[] = []
  let released = Promise.withResolvers<void>()

  const shares = (a: Dependency, b: Dependency) => a.locks.some((lock) => b.locks.includes(lock))
  const canStart = (dep: Dependency) =>
    !dep.locks.some((lock) => held.has(lock)) &&
    !waiting.some((other) => selected.indexOf(other) < selected.indexOf(dep) && shares(other, dep))

  async function acquire(dep: Dependency) {
    waiting.push(dep)
    waiting.sort((a, b) => selected.indexOf(a) - selected.indexOf(b))
    while (!canStart(dep)) await released.promise
    waiting.splice(waiting.indexOf(dep), 1)
    for (const lock of dep.locks) held.add(lock)
  }

  function release(dep: Dependency) {
    for (const lock of dep.locks) held.delete(lock)
    released.resolve()
    released = Promise.withResolvers<void>()
  }

  async function installOne(dep: Dependency) {
    for (const need of dep.needs) {
      if (!settled.has(need) || (await settled.get(need)!.promise)) continue
      const label = deps.find((item) => item.id === need)?.label ?? need
      emit({ id: dep.id, phase: "skipped", message: `Needs ${label}, which did not install` })
      return false
    }
    // A failed download was reported when it happened.
    const install = dep.prepare ? await prefetch.get(dep.id) : dep.install
    if (!install) return false
    await acquire(dep)
    try {
      emit({ id: dep.id, phase: "start" })
      // Each install can change PATH (Node before npm for Codex), so every install re-reads it.
      const result = await refreshEnv()
        .then((env) => install(env, lineTo(dep.id)))
        .catch((cause): InstallResult => ({ ok: false, message: errorText(cause) }))
      emit({ id: dep.id, phase: result.ok ? "done" : "failed", message: result.message })
      return result.ok
    } finally {
      release(dep)
    }
  }

  async function run(dep: Dependency) {
    let ok = false
    try {
      ok = await installOne(dep)
    } finally {
      settled.get(dep.id)!.resolve(ok)
    }
  }

  try {
    await Promise.all(selected.map(run))
    const results = await Promise.all([...settled.values()].map((item) => item.promise))
    return results.every(Boolean)
  } finally {
    // Downloads for skipped rows may still be running; let them end before removing their folder.
    await prefetch.done
    await removeRunDir(dir)
  }
}

// On a VM something outside oc holds the ChatGPT MSIX for 30+ s after its install, and `rm` of it
// hangs instead of failing. So the run waits CLEANUP_LIMIT_MS at most; a folder that is not gone by
// then (or failed to delete) goes to a hidden PowerShell that retries after the engine has exited.
const CLEANUP_LIMIT_MS = 2_000

type Remove = (target: string) => Promise<void>
const removeTree: Remove = (target) => rm(target, { recursive: true, force: true })

export async function removeRunDir(dir: string, remove = removeTree, handOff = removeDirLater) {
  const limit = new AbortController()
  const removal = (async () => {
    // Row by row, so one held file still lets the other rows' installers go.
    for (const entry of await readdir(dir)) await remove(path.join(dir, entry))
    await remove(dir)
    return true
  })().catch(() => false)
  const done = await Promise.race([
    removal,
    sleep(CLEANUP_LIMIT_MS, false, { signal: limit.signal }).catch(() => false),
  ])
  limit.abort()
  if (!done) await handOff(dir)
}

// Retries every 5 s for 5 minutes in a hidden PowerShell that outlives the engine (VM run 7: the
// held ChatGPT folder went at its first try, 3 s after the handoff). Bun's `detached` spawn starts
// powershell.exe without a console and it exits at once without running, so a short launcher
// starts the retry with Start-Process instead (no inherited handles, so it cannot hold ocSetup's
// pipes). The script goes through the environment; the launch waits LAUNCH_LIMIT_MS at most.
const LAUNCH_LIMIT_MS = 5_000

async function removeDirLater(dir: string) {
  const script = `$Dir = ${psString(dir)}\n${REMOVE_DIR_LATER_SCRIPT}`
  const launch =
    "Start-Process powershell.exe -WindowStyle Hidden -ArgumentList " +
    `'-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Invoke-Expression $env:OC_CLEANUP_SCRIPT"'`
  const launcher = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", launch], {
    stdio: "ignore",
    windowsHide: true,
    env: { ...windowsPowershellEnv(), OC_CLEANUP_SCRIPT: script },
  })
  const limit = new AbortController()
  await Promise.race([
    new Promise((resolve) => launcher.once("exit", resolve).once("error", resolve)),
    sleep(LAUNCH_LIMIT_MS, undefined, { signal: limit.signal }).catch(() => undefined),
  ])
  limit.abort()
}

const REMOVE_DIR_LATER_SCRIPT = String.raw`
for ($try = 1; $try -le 60; $try++) {
  if (-not (Test-Path -LiteralPath $Dir)) { exit 0 }
  try { Remove-Item -LiteralPath $Dir -Recurse -Force -ErrorAction Stop; exit 0 }
  catch { Start-Sleep -Seconds 5 }
}
exit 1
`

// Runs every selected `prepare` in table order, PREFETCH_LIMIT at a time. `get` resolves to the
// install step, or undefined after a failure (reported at once as `failed`).
function startPrefetch(
  selected: Dependency[],
  dir: string,
  emit: (event: InstallEvent) => void,
  lineTo: (id: string) => OnLine,
) {
  const queue = selected.filter((dep) => dep.prepare)
  const results = new Map(queue.map((dep) => [dep.id, Promise.withResolvers<Install | undefined>()]))
  let next = 0
  async function worker() {
    while (next < queue.length) {
      const dep = queue[next++]!
      // One folder per row: two vendor scripts share the name install.ps1. Made synchronously so
      // downloads start in table order, inside the chain so a failure becomes this row's `failed`.
      const rowDir = path.join(dir, dep.id)
      const install = await Promise.resolve()
        .then(() => {
          mkdirSync(rowDir)
          return dep.prepare!(rowDir, lineTo(dep.id))
        })
        .then(
          (step) => {
            emit({ id: dep.id, phase: "ready" })
            return step
          },
          (cause) => {
            emit({ id: dep.id, phase: "failed", message: errorText(cause) })
            return undefined
          },
        )
      results.get(dep.id)!.resolve(install)
    }
  }
  return {
    get: (id: string) => results.get(id)!.promise,
    done: Promise.all(Array.from({ length: PREFETCH_LIMIT }, worker)),
  }
}

/** Maps a script's OCSTEP / OCPROGRESS line to an install event; other output is not reported. */
export function lineEvent(id: string, line: string): InstallEvent | undefined {
  if (line.startsWith(STEP_PREFIX)) {
    const [phase = "", ...detail] = line.slice(STEP_PREFIX.length).trim().split(/\s+/)
    if (phase !== "downloading" && phase !== "verifying" && phase !== "installing") return
    return detail.length ? { id, phase, message: detail.join(" ") } : { id, phase }
  }
  if (!line.startsWith(PROGRESS_PREFIX)) return
  const [received, total] = line.slice(PROGRESS_PREFIX.length).trim().split(/\s+/).map(Number)
  if (!Number.isFinite(received) || !Number.isFinite(total)) return
  return { id, phase: "downloading", received, total }
}

/** First version-looking token of a `--version` line (`git version 2.47.1.windows.1` -> 2.47.1). */
export function versionOf(output: string) {
  const line = output.split(/\r?\n/).find((item) => item.trim()) ?? ""
  return /\d+(?:\.\d+)+/.exec(line)?.[0] ?? /\d[\w.-]*/.exec(line)?.[0]
}

const MACHINE_ENV_KEY = String.raw`HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment`

// Machine + User PATH from the registry: the process PATH misses anything installed after it
// started. `reg query` instead of PowerShell: a PowerShell start cost ~1 s per install on a VM.
async function freshEnv(): Promise<Env> {
  const [machine, user] = await Promise.all([
    runCliCommand("reg.exe", ["query", MACHINE_ENV_KEY, "/v", "Path"], VERSION_TIMEOUT_MS),
    runCliCommand("reg.exe", ["query", String.raw`HKCU\Environment`, "/v", "Path"], VERSION_TIMEOUT_MS),
  ])
  const machinePath = machine.ok ? parseRegPath(machine.output) : undefined
  if (machinePath === undefined) {
    throw new Error(`Could not read PATH from the registry: ${machine.lastLine || machine.error || machine.code}`)
  }
  // reg exits 1 when the user has no Path value.
  if (!user.ok && user.code !== 1) {
    throw new Error(`Could not read the user PATH from the registry: ${user.lastLine || user.error || user.code}`)
  }
  const userPath = (user.ok && parseRegPath(user.output)) || ""
  const rest = Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "path")
  return { ...Object.fromEntries(rest), Path: expandEnv(`${machinePath};${userPath}`, process.env) }
}

/** The `Path` value from `reg query <key> /v Path` output, or undefined when it is absent. */
export function parseRegPath(output: string) {
  return /^\s+Path\s+REG_(?:EXPAND_)?SZ\s+(.*?)\s*$/im.exec(output)?.[1]
}

/** Expands `%NAME%` like ExpandEnvironmentStrings: names match case-insensitively, unknown stay as-is. */
export function expandEnv(value: string, env: Env) {
  const lookup = new Map(Object.entries(env).map(([key, item]) => [key.toLowerCase(), item]))
  return value.replace(/%([^%;]+)%/g, (whole, name: string) => lookup.get(name.toLowerCase()) ?? whole)
}

async function detectCli(executable: string | null, env: Env): Promise<Detection> {
  if (!executable) return { status: "missing" }
  const result = await runCliCommand(executable, ["--version"], VERSION_TIMEOUT_MS, env)
  const version = result.ok ? versionOf(result.output) : undefined
  return version ? { status: "found", version, path: executable } : { status: "found", path: executable }
}

async function detectResolved(resolved: { executable: string } | { error: string; notInstalled?: true }, env: Env) {
  if ("executable" in resolved) return detectCli(resolved.executable, env)
  return resolved.notInstalled ? { status: "missing" as const } : { status: "error" as const, message: resolved.error }
}

function fromCheck(result: DesktopCheckResult): Detection {
  if (result.ok && result.upToDate) return { status: "found", version: result.version }
  if (result.ok) return { status: "outdated", version: result.oldVersion, latest: result.newVersion }
  if (result.notInstalled) return { status: "missing" }
  return { status: "error", message: result.message }
}

// Fresh installs report "Updated X 0.0 -> <version>"; a release that landed between list and
// install reports "up to date", which is still success.
async function fromInstall(pending: Promise<DesktopInstallResult>): Promise<InstallResult> {
  const result = await pending
  if (result.ok || /is up to date/.test(result.message)) return { ok: true, message: result.message }
  return { ok: false, message: result.message }
}

function everythingExe(env: Env) {
  const roots = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter((root): root is string => !!root)
  return (
    roots.map((root) => path.join(root, "Everything", "Everything.exe")).find(existsSync) ?? which("everything", env)
  )
}

// Two conditional parts, both downloaded ahead: the Everything app when it is missing, and es.exe
// when it is not on PATH. es.exe goes next to oc.exe: the oc installer already put that folder on
// the user PATH and removes es.exe on uninstall.
async function prepareEverything(dir: string, onLine: OnLine): Promise<Install> {
  const appFile = `Everything-${EVERYTHING_VERSION}.x64-Setup.exe`
  const app: InstallerSpec | undefined = everythingExe(process.env)
    ? undefined
    : {
        label: "Everything",
        url: `https://www.voidtools.com/${appFile}`,
        fileName: appFile,
        hosts: ["www.voidtools.com", "voidtools.com"],
        sha256: EVERYTHING_SHA256,
        signer: "voidtools PTY LTD",
        kind: "exe",
        args: ["/S"],
        elevate: true,
      }
  let es: InstallerSpec | undefined
  if (!which("es", process.env)) {
    if (!/^(oc|occ|opencode)\.exe$/i.test(path.basename(process.execPath))) {
      throw new Error("es.exe install needs the installed oc.exe")
    }
    es = {
      label: "Everything + es.exe",
      ...(await githubAsset("voidtools/es", /^ES-[\d.]+\.x64\.zip$/)),
      kind: "zip",
      zipEntry: "es.exe",
      zipDest: path.dirname(process.execPath),
    }
  }
  const parts = [app, es].filter((spec): spec is InstallerSpec => !!spec)
  for (const spec of parts) {
    const fetched = await runInstallScript("download", spec, path.join(dir, spec.fileName), process.env, onLine)
    if (!fetched.ok) throw new Error(fetched.message)
  }
  return async (env, installLine) => {
    for (const spec of parts) {
      const result = await runInstallScript("install", spec, path.join(dir, spec.fileName), env, installLine)
      if (!result.ok) return result
      const exe = spec === app && everythingExe(env)
      if (exe) spawn(exe, ["-startup"], { detached: true, stdio: "ignore", windowsHide: true }).unref()
    }
    return { ok: true, message: es ? "Installed Everything + es.exe" : "Installed Everything" }
  }
}

// A harness update script's prepare (download + verify into the row's folder) as a row's `prepare`.
function harnessPrepared(
  prepare: (dir: string, onLine: OnLine) => Promise<(onLine: OnLine) => Promise<DesktopInstallResult>>,
) {
  return async (dir: string, onLine: OnLine): Promise<Install> => {
    const install = await prepare(dir, onLine)
    return (_env, installLine) => fromInstall(install(installLine))
  }
}

type Download = { url: string; fileName: string; hosts: string[]; sha256?: string; signer?: string }
type InstallerSpec = Download & {
  label: string
  kind: "exe" | "msi" | "ps1" | "zip"
  args?: string[]
  elevate?: boolean
  zipEntry?: string
  zipDest?: string
}

async function githubAsset(repo: string, pattern: RegExp): Promise<Download> {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Release lookup failed for ${repo}: HTTP ${response.status}`)
  const release = (await response.json()) as {
    assets?: { name?: string; browser_download_url?: string; digest?: string }[]
  }
  const asset = release.assets?.find((item) => typeof item.name === "string" && pattern.test(item.name))
  if (!asset?.name || !asset.browser_download_url) throw new Error(`No matching asset in the latest ${repo} release`)
  const sha256 = /^sha256:([0-9a-f]{64})$/.exec(asset.digest ?? "")?.[1]
  return { url: asset.browser_download_url, fileName: asset.name, hosts: GITHUB_HOSTS, ...(sha256 ? { sha256 } : {}) }
}

async function fetchSha256(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`Checksum download failed: HTTP ${response.status}`)
  const sha256 = /^[0-9a-f]{64}/i.exec((await response.text()).trim())?.[0]
  if (!sha256) throw new Error(`Checksum file has no sha256: ${url}`)
  return sha256
}

async function nodeLts(): Promise<Download> {
  const response = await fetch("https://nodejs.org/dist/index.json", { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`Node.js release lookup failed: HTTP ${response.status}`)
  const releases = (await response.json()) as { version?: string; lts?: string | false; files?: string[] }[]
  const release = releases.find(
    (item) => item.lts && item.files?.includes("win-x64-msi") && /^v\d+\.\d+\.\d+$/.test(item.version ?? ""),
  )
  if (!release?.version) throw new Error("No Node.js LTS release with a Windows x64 MSI")
  const fileName = `node-${release.version}-x64.msi`
  return { url: `https://nodejs.org/dist/${release.version}/${fileName}`, fileName, hosts: ["nodejs.org"] }
}

async function npmGlobalInstall(label: string, pkg: string, env: Env, onLine: OnLine): Promise<InstallResult> {
  const npm = which("npm", env)
  if (!npm) return { ok: false, message: "npm not found; install Node.js first" }
  onLine(`${STEP_PREFIX}installing`)
  const result = await runCliCommand(npm, ["install", "-g", pkg], INSTALL_TIMEOUT_MS, env)
  if (result.ok) return { ok: true, message: `Installed ${label}` }
  return { ok: false, message: result.lastLine || result.error || `npm exit code ${result.code}` }
}

// A vendor script that fails gets one more run after this wait: they are idempotent, and their own
// downloads fail transiently (a vendor binary host hit an egress quota on a VM).
const VENDOR_RETRY_MS = 15_000

// Builds a row's `prepare`: resolve the spec (release lookups), download and verify it into the
// row's folder, and return the step that installs that file.
function prepared(resolve: () => Promise<InstallerSpec>) {
  return async (dir: string, onLine: OnLine): Promise<Install> => {
    const spec = await resolve()
    const file = path.join(dir, spec.fileName)
    const fetched = await runInstallScript("download", spec, file, process.env, onLine)
    if (!fetched.ok) throw new Error(fetched.message)
    return async (env, installLine) => {
      const first = await runInstallScript("install", spec, file, env, installLine)
      if (first.ok || spec.kind !== "ps1") return first
      installLine(`${STEP_PREFIX}installing retry 2 of 2`)
      await sleep(VENDOR_RETRY_MS)
      return runInstallScript("install", spec, file, env, installLine)
    }
  }
}

async function runInstallScript(
  mode: "download" | "install",
  spec: InstallerSpec,
  file: string,
  env: Env,
  onLine: OnLine,
): Promise<InstallResult> {
  // Vendor install scripts (Claude, Cursor) are trusted by their HTTPS host; binaries need a pin.
  if (spec.kind !== "ps1" && !spec.sha256 && !spec.signer) {
    return { ok: false, message: `${spec.label} has no checksum or signer to verify` }
  }
  const prefix = [
    `$Mode = ${psString(mode)}`,
    `$File = ${psString(file)}`,
    `$Label = ${psString(spec.label)}`,
    `$Url = ${psString(spec.url)}`,
    `$FileName = ${psString(spec.fileName)}`,
    `$AllowHosts = @(${spec.hosts.map(psString).join(", ")})`,
    `$Sha256 = ${psString(spec.sha256 ?? "")}`,
    `$Signer = ${psString(spec.signer ?? "")}`,
    `$Kind = ${psString(spec.kind)}`,
    `$InstallArgs = @(${(spec.args ?? []).map(psString).join(", ")})`,
    `$Elevate = $${spec.elevate ?? false}`,
    `$ZipEntry = ${psString(spec.zipEntry ?? "")}`,
    `$ZipDest = ${psString(spec.zipDest ?? "")}`,
  ].join("\n")
  const result = await runCliCommand(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", `${prefix}\n${INSTALL_SCRIPT}`],
    INSTALL_TIMEOUT_MS,
    windowsPowershellEnv(env),
    onLine,
  )
  if (result.ok) return { ok: true, message: `Installed ${spec.label}` }
  // A vendor script's own error says why; our OCERR line only has its exit code.
  const vendorError = spec.kind === "ps1" ? scriptErrorRecord(result.output) : undefined
  return {
    ok: false,
    message:
      vendorError ?? scriptError(result.output) ?? (result.lastLine || result.error || `exit code ${result.code}`),
  }
}

/**
 * The message of a PowerShell error record from a vendor script: `<path>.ps1 : <message>`, which
 * the console wraps over several lines up to its `At <path>:<line>` line. Trimmed to 200 chars.
 */
export function scriptErrorRecord(output: string) {
  const lines = output.split(/\r?\n/)
  const start = lines.findIndex((line) => /\.ps1 : \S/.test(line))
  if (start < 0) return undefined
  const parts = [lines[start]!.replace(/^.*?\.ps1 : /, "").trim()]
  for (const line of lines.slice(start + 1)) {
    if (!line.trim() || /^\s*At /.test(line)) break
    parts.push(line.trim())
  }
  const message = parts.join(" ")
  return message.length > 200 ? `${message.slice(0, 197)}...` : message
}

function errorText(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause)
}

// $Mode "download": download to $File (host allowlist after redirects) and verify ($Sha256 and/or
// exact $Signer CN). $Mode "install": verify $File again, then install by $Kind: exe with
// $InstallArgs, msi through msiexec, ps1 (vendor install script) in a child Windows PowerShell, or
// one $ZipEntry extracted to $ZipDest. $Elevate runs the installer through a UAC prompt. The caller
// owns $File's folder. All inputs come from the prefix lines as single-quoted literals. Errors go
// to an OCERR line and exit 1 (trap).
const INSTALL_SCRIPT = String.raw`
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
trap { Write-Output "OCERR: $($_.Exception.Message)"; exit 1 }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

${DOWNLOAD_HELPERS}

function Invoke-Installer {
  param([string]$FilePath, [string[]]$Arguments)
  $start = @{ FilePath = $FilePath; ArgumentList = $Arguments; PassThru = $true; WindowStyle = "Hidden" }
  if ($Elevate) { $start.Verb = "RunAs" }
  try { $proc = Start-Process @start }
  catch {
    if ($_.Exception.Message -match "cancel") { throw "Cancelled at the admin prompt" }
    throw "Could not start the installer: $($_.Exception.Message)"
  }
  if (-not $proc.WaitForExit(900000)) {
    $proc.Kill()
    throw "Install timed out after 15 minutes"
  }
  return $proc.ExitCode
}

function Test-Installer {
  if ($Sha256 -and (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash -ne $Sha256) { throw "Checksum mismatch for $FileName" }
  if ($Signer) {
    $sig = Get-AuthenticodeSignature -FilePath $File
    if ($sig.Status -ne "Valid") { throw "Signature check failed: $($sig.Status) ($($sig.StatusMessage))" }
    $name = $sig.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
    if ($name -ne $Signer) { throw "Signature signer '$name' is not $Signer" }
  }
}

if ($Mode -eq "download") {
  Save-Download -Uri $Url -OutFile $File -AllowHost { param($h) $AllowHosts -contains $h.ToLowerInvariant() }
  Write-OcStep "verifying"
  Test-Installer
  exit 0
}

# The file may have waited in user temp since its download, so it is checked again right before it runs.
Test-Installer
if ($Elevate) { Write-OcStep "installing needs admin approval" } else { Write-OcStep "installing" }
switch ($Kind) {
  "zip" {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($File)
    try {
      $entry = $zip.Entries | Where-Object { $_.Name -eq $ZipEntry } | Select-Object -First 1
      if (-not $entry) { throw "$ZipEntry not found in $FileName" }
      New-Item -ItemType Directory -Path $ZipDest -Force | Out-Null
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $ZipDest $ZipEntry), $true)
    } finally { $zip.Dispose() }
  }
  "ps1" {
    # The script inherits SilentlyContinue: Windows PowerShell's progress bar made Cursor's 78 MB
    # Invoke-WebRequest take 22 s instead of 3 s. A script's exit N or terminating error (1) is the
    # exit code, as with -File; unlike -File, so is a failing native command it ran last.
    $command = '$ProgressPreference = ''SilentlyContinue''; $global:LASTEXITCODE = 0; & ''{0}''; exit $LASTEXITCODE' -f ($File -replace "'", "''")
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command $command
    if ($LASTEXITCODE -ne 0) { throw "Install script exited with code $LASTEXITCODE" }
  }
  "msi" {
    $code = Invoke-Installer "msiexec.exe" @("/i", ('"{0}"' -f $File), "/qn", "/norestart")
    if ($code -eq 1602) { throw "Install cancelled" }
    if ($code -eq 1618) { throw "Another installer is running; try again when it finishes" }
    if ($code -ne 0 -and $code -ne 3010) { throw "Install failed: msiexec exit code $code" }
  }
  default {
    $code = Invoke-Installer $File $InstallArgs
    if ($code -ne 0) { throw "Install failed: exit code $code" }
  }
}
Write-Output "Installed $Label"
`
