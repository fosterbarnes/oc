import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { which } from "@opencode-ai/core/util/which"
import { checkChatgptDesktop, installChatgptDesktopLatest } from "./chatgptDesktopUpdate"
import { resolveCodexCli, resolveCursorCli, runCliCommand } from "./cliUpdate"
import { checkCursorDesktop, installCursorDesktopLatest } from "./cursorDesktopUpdate"
import {
  checkClaudeDesktop,
  DOWNLOAD_HELPERS,
  installClaudeDesktopLatest,
  PROGRESS_PREFIX,
  scriptError,
  STEP_PREFIX,
  windowsPowershellEnv,
  type DesktopCheckResult,
  type DesktopInstallResult,
} from "./desktopUpdate"
import { checkPowershell, installPowershellLatest } from "./pwshUpdate"

// Dependency setup behind `oc oc deps` (the installer's ocSetup window is its only caller): detect
// what oc's features need and install the missing ones one at a time, in table order. Apps that
// already have a harness update script reuse it with $AllowFresh; the rest download a vendor
// installer through INSTALL_SCRIPT, pinned by sha256 and/or Authenticode signer.

export type DependencyStatus = "found" | "missing" | "outdated" | "error"
// `path` is the resolved executable for CLI rows (ocSetup points the oc shortcuts at WezTerm with it).
type Detection = { status: DependencyStatus; version?: string; latest?: string; message?: string; path?: string }
export type DependencyInfo = Detection & {
  id: string
  label: string
  required: boolean
  defaultSelected: boolean
  needs: string[]
}
export type InstallPhase = "start" | "downloading" | "verifying" | "installing" | "done" | "failed" | "skipped"
export type InstallEvent = { id: string; phase: InstallPhase; received?: number; total?: number; message?: string }
type InstallResult = { ok: boolean; message: string }
type OnLine = (line: string) => void
type Env = NodeJS.ProcessEnv

export type Dependency = {
  id: string
  label: string
  required?: boolean
  defaultSelected: boolean
  needs: string[]
  detect: (env: Env) => Promise<Detection>
  install: (env: Env, onLine: OnLine) => Promise<InstallResult>
}

const VERSION_TIMEOUT_MS = 15_000
const INSTALL_TIMEOUT_MS = 20 * 60 * 1000
const GITHUB_HOSTS = ["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"]
const SILENT_INNO_ARGS = ["/VERYSILENT", "/NORESTART", "/NOCANCEL", "/SP-", "/SUPPRESSMSGBOXES"]
// voidtools has no "latest" API; bump both together from https://www.voidtools.com/downloads/.
const EVERYTHING_VERSION = "1.4.1.1032"
const EVERYTHING_SHA256 = "c42efad041d4c0bb4d4ac97ae7cbe89f153ec1fe078772392e749c7f5d5282d3"

export const DEPENDENCIES: Dependency[] = [
  {
    id: "pwsh",
    label: "PowerShell 7",
    required: true,
    defaultSelected: true,
    needs: [],
    // The update check only knows the MSI install; a pwsh from MSIX or a zip still counts as found.
    detect: async (env) => {
      const checked = fromCheck(await checkPowershell())
      return checked.status === "missing" ? detectCli(which("pwsh", env), env) : checked
    },
    install: (_env, onLine) => fromInstall(installPowershellLatest(onLine)),
  },
  {
    id: "git",
    label: "Git for Windows",
    defaultSelected: true,
    needs: [],
    detect: (env) => detectCli(which("git", env), env),
    install: async (env, onLine) =>
      runInstaller(
        {
          label: "Git for Windows",
          ...(await githubAsset("git-for-windows/git", /^Git-[\d.]+-64-bit\.exe$/)),
          signer: "Johannes Schindelin",
          kind: "exe",
          args: SILENT_INNO_ARGS,
          elevate: true,
        },
        env,
        onLine,
      ),
  },
  {
    id: "node",
    label: "Node.js LTS",
    defaultSelected: true,
    needs: [],
    detect: (env) => detectCli(which("node", env), env),
    install: async (env, onLine) =>
      runInstaller(
        { label: "Node.js", ...(await nodeLts()), signer: "OpenJS Foundation", kind: "msi", elevate: true },
        env,
        onLine,
      ),
  },
  {
    id: "everything",
    label: "Everything + es.exe",
    defaultSelected: true,
    needs: [],
    detect: async (env) => {
      const app = everythingExe(env)
      const es = which("es", env)
      if (app && es) return { status: "found" }
      if (!app && !es) return { status: "missing" }
      return { status: "missing", message: `${app ? "es.exe" : "Everything"} not found` }
    },
    install: installEverything,
  },
  {
    id: "wezterm",
    label: "WezTerm",
    defaultSelected: true,
    needs: [],
    detect: (env) => detectCli(which("wezterm", env), env),
    install: async (env, onLine) => {
      const download = await githubAsset("wezterm/wezterm", /^WezTerm-[\w-]+-setup\.exe$/)
      // WezTerm's installer is unsigned; its release ships a .sha256 file next to each asset.
      const sha256 = download.sha256 ?? (await fetchSha256(`${download.url}.sha256`))
      return runInstaller(
        { label: "WezTerm", ...download, sha256, kind: "exe", args: SILENT_INNO_ARGS, elevate: true },
        env,
        onLine,
      )
    },
  },
  // Harness rows keep one order for CLIs and desktop apps: Codex, Claude, Cursor.
  {
    id: "codexCli",
    label: "Codex CLI",
    defaultSelected: true,
    needs: ["node"],
    detect: async (env) => detectResolved(await resolveCodexCli(env), env),
    install: async (env, onLine) => {
      const npm = which("npm", env)
      if (!npm) return { ok: false, message: "npm not found; install Node.js first" }
      onLine(`${STEP_PREFIX}installing`)
      const result = await runCliCommand(npm, ["install", "-g", "@openai/codex"], INSTALL_TIMEOUT_MS, env)
      if (result.ok) return { ok: true, message: "Installed Codex CLI" }
      return { ok: false, message: result.lastLine || result.error || `npm exit code ${result.code}` }
    },
  },
  {
    id: "claudeCli",
    label: "Claude Code CLI",
    defaultSelected: true,
    needs: ["git"],
    detect: (env) => detectCli(which("claude", env), env),
    install: (env, onLine) =>
      runInstaller(
        {
          label: "Claude Code CLI",
          url: "https://claude.ai/install.ps1",
          fileName: "install.ps1",
          hosts: ["claude.ai", "downloads.claude.ai"],
          kind: "ps1",
        },
        env,
        onLine,
      ),
  },
  {
    id: "cursorCli",
    label: "Cursor CLI",
    defaultSelected: false,
    needs: [],
    detect: async (env) => detectResolved(await resolveCursorCli(env), env),
    install: (env, onLine) =>
      runInstaller(
        {
          label: "Cursor CLI",
          url: "https://cursor.com/install?win32=true",
          fileName: "install.ps1",
          hosts: ["cursor.com"],
          kind: "ps1",
        },
        env,
        onLine,
      ),
  },
  {
    id: "codexDesktop",
    label: "Codex (ChatGPT) desktop",
    defaultSelected: false,
    needs: [],
    detect: async () => fromCheck(await checkChatgptDesktop()),
    install: (_env, onLine) => fromInstall(installChatgptDesktopLatest(onLine)),
  },
  {
    id: "claudeDesktop",
    label: "Claude desktop",
    defaultSelected: false,
    needs: [],
    detect: async () => fromCheck(await checkClaudeDesktop()),
    install: (_env, onLine) => fromInstall(installClaudeDesktopLatest(onLine)),
  },
  {
    id: "cursorDesktop",
    label: "Cursor desktop",
    defaultSelected: false,
    needs: [],
    detect: async () => fromCheck(await checkCursorDesktop()),
    install: (_env, onLine) => fromInstall(installCursorDesktopLatest(onLine)),
  },
]

export async function listDependencies(deps = DEPENDENCIES): Promise<DependencyInfo[]> {
  const env = await freshEnv()
  return Promise.all(
    deps.map(async (dep) => ({
      id: dep.id,
      label: dep.label,
      required: dep.required ?? false,
      defaultSelected: dep.defaultSelected,
      needs: dep.needs,
      ...(await dep.detect(env).catch((cause): Detection => ({ status: "error", message: errorText(cause) }))),
    })),
  )
}

export function installDependencies(ids: string[], emit: (event: InstallEvent) => void) {
  return runInstalls(DEPENDENCIES, ids, emit, freshEnv)
}

/** Installs the selected ids in table order; true only when every one succeeded. */
export async function runInstalls(
  deps: Dependency[],
  ids: string[],
  emit: (event: InstallEvent) => void,
  refreshEnv: () => Promise<Env>,
) {
  const unknown = ids.filter((id) => !deps.some((dep) => dep.id === id))
  if (unknown.length) throw new Error(`Unknown dependency: ${unknown.join(", ")}`)
  const failed = new Set<string>()
  // Each install can change PATH (Node before npm for Codex), so detection re-reads it every step.
  let env = await refreshEnv()
  for (const dep of deps.filter((item) => ids.includes(item.id))) {
    const blocker = dep.needs.find((id) => failed.has(id))
    if (blocker) {
      failed.add(dep.id)
      const label = deps.find((item) => item.id === blocker)?.label ?? blocker
      emit({ id: dep.id, phase: "skipped", message: `Needs ${label}, which did not install` })
      continue
    }
    emit({ id: dep.id, phase: "start" })
    const result = await dep
      .install(env, (line) => {
        const event = lineEvent(dep.id, line)
        if (event) emit(event)
      })
      .catch((cause): InstallResult => ({ ok: false, message: errorText(cause) }))
    if (!result.ok) failed.add(dep.id)
    emit({ id: dep.id, phase: result.ok ? "done" : "failed", message: result.message })
    env = await refreshEnv()
  }
  return failed.size === 0
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

/** A PowerShell single-quoted literal. PowerShell also treats curly single quotes as quotes. */
export function psString(value: string) {
  return `'${value.replace(/['‘’‚‛]/g, "$&$&")}'`
}

// Machine + User PATH from the registry: the process PATH misses anything installed after it started.
async function freshEnv(): Promise<Env> {
  const result = await runCliCommand(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')",
    ],
    VERSION_TIMEOUT_MS,
    windowsPowershellEnv(),
  )
  if (!result.ok) {
    throw new Error(`Could not read PATH from the registry: ${result.lastLine || result.error || result.code}`)
  }
  const rest = Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "path")
  return { ...Object.fromEntries(rest), Path: result.output.trim() }
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

// es.exe goes next to oc.exe: the oc installer already put that folder on the user PATH and
// removes es.exe on uninstall.
async function installEverything(env: Env, onLine: OnLine): Promise<InstallResult> {
  if (!everythingExe(env)) {
    const fileName = `Everything-${EVERYTHING_VERSION}.x64-Setup.exe`
    const result = await runInstaller(
      {
        label: "Everything",
        url: `https://www.voidtools.com/${fileName}`,
        fileName,
        hosts: ["www.voidtools.com", "voidtools.com"],
        sha256: EVERYTHING_SHA256,
        signer: "voidtools PTY LTD",
        kind: "exe",
        args: ["/S"],
        elevate: true,
      },
      env,
      onLine,
    )
    if (!result.ok) return result
    const app = everythingExe(env)
    if (app) spawn(app, ["-startup"], { detached: true, stdio: "ignore", windowsHide: true }).unref()
  }
  if (which("es", env)) return { ok: true, message: "Installed Everything" }
  const exe = path.basename(process.execPath)
  if (!/^(oc|occ|opencode)\.exe$/i.test(exe)) return { ok: false, message: "es.exe install needs the installed oc.exe" }
  return runInstaller(
    {
      label: "Everything + es.exe",
      ...(await githubAsset("voidtools/es", /^ES-[\d.]+\.x64\.zip$/)),
      kind: "zip",
      zipEntry: "es.exe",
      zipDest: path.dirname(process.execPath),
    },
    env,
    onLine,
  )
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

async function runInstaller(spec: InstallerSpec, env: Env, onLine: OnLine): Promise<InstallResult> {
  // Vendor install scripts (Claude, Cursor) are trusted by their HTTPS host; binaries need a pin.
  if (spec.kind !== "ps1" && !spec.sha256 && !spec.signer) {
    return { ok: false, message: `${spec.label} has no checksum or signer to verify` }
  }
  const prefix = [
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
  return {
    ok: false,
    message: scriptError(result.output) ?? (result.lastLine || result.error || `exit code ${result.code}`),
  }
}

function errorText(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause)
}

// Download (host allowlist after redirects), verify ($Sha256 and/or exact $Signer CN), then
// install by $Kind: exe with $InstallArgs, msi through msiexec, ps1 (vendor install script) in a
// child Windows PowerShell, or one $ZipEntry extracted to $ZipDest. $Elevate runs the installer
// through a UAC prompt. All inputs come from the prefix lines as single-quoted literals. Errors go
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

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("oc-deps-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  $file = Join-Path $tmp $FileName
  Save-Download -Uri $Url -OutFile $file -AllowHost { param($h) $AllowHosts -contains $h.ToLowerInvariant() }
  Write-OcStep "verifying"
  if ($Sha256 -and (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $Sha256) { throw "Checksum mismatch for $FileName" }
  if ($Signer) {
    $sig = Get-AuthenticodeSignature -FilePath $file
    if ($sig.Status -ne "Valid") { throw "Signature check failed: $($sig.Status)" }
    $name = $sig.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
    if ($name -ne $Signer) { throw "Signature signer '$name' is not $Signer" }
  }
  if ($Elevate) { Write-OcStep "installing needs admin approval" } else { Write-OcStep "installing" }
  switch ($Kind) {
    "zip" {
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      $zip = [System.IO.Compression.ZipFile]::OpenRead($file)
      try {
        $entry = $zip.Entries | Where-Object { $_.Name -eq $ZipEntry } | Select-Object -First 1
        if (-not $entry) { throw "$ZipEntry not found in $FileName" }
        New-Item -ItemType Directory -Path $ZipDest -Force | Out-Null
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $ZipDest $ZipEntry), $true)
      } finally { $zip.Dispose() }
    }
    "ps1" {
      & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $file
      if ($LASTEXITCODE -ne 0) { throw "Install script exited with code $LASTEXITCODE" }
    }
    "msi" {
      $code = Invoke-Installer "msiexec.exe" @("/i", ('"{0}"' -f $file), "/qn", "/norestart")
      if ($code -eq 1602) { throw "Install cancelled" }
      if ($code -eq 1618) { throw "Another installer is running; try again when it finishes" }
      if ($code -ne 0 -and $code -ne 3010) { throw "Install failed: msiexec exit code $code" }
    }
    default {
      $code = Invoke-Installer $file $InstallArgs
      if ($code -ne 0) { throw "Install failed: exit code $code" }
    }
  }
  Write-Output "Installed $Label"
} finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
`
