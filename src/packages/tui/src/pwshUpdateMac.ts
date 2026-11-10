import { existsSync } from "node:fs"
import { mkdtemp, realpath, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { which } from "@opencode-ai/core/util/which"
import { BREW_ENV, errorText, runCliCommand, runOrThrow as run } from "./cliUpdate"
import {
  compareDesktopVersions,
  PROGRESS_PREFIX,
  STEP_PREFIX,
  type DesktopCheckResult,
  type DesktopInstallResult,
} from "./desktopUpdate"

// PowerShell 7 on macOS, updated the way it was installed (Microsoft's install docs, 2026-09):
// - pkg: Microsoft's notarized .pkg (also what the retired Homebrew cask ran). New .pkg from the
//   GitHub release, Developer ID + notarization + exact Microsoft signer pin, then `installer`
//   behind the macOS admin password dialog (osascript "with administrator privileges").
// - brew: the community Homebrew formula; `brew upgrade powershell`, no sudo.
// - dotnet: the .NET global tool; `dotnet tool update --global PowerShell`.
// - archive (tar.gz in Microsoft's folder, no package receipt) and any other location are only
//   checked: replacing them could drop files the user keeps in $PSHOME.
// Only the `pwsh` the user runs (first on PATH) is updated; pwsh-preview is left alone.

const LABEL = "PowerShell"
const KEY = "powershell-mac"
const PKG_ID = "com.microsoft.powershell"
const PKG_PWSH = "/usr/local/microsoft/powershell/7/pwsh"
const SIGNER = "Developer ID Installer: Microsoft Corporation (UBF8T346G9)"
const GITHUB_HOSTS = new Set(["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"])
const VERSION = /^\d+\.\d+\.\d+$/
// Every method replaces files a running pwsh may still load (Homebrew deletes the old keg).
const REOPEN = "open pwsh windows need reopening to use the new version"
const NOTES = {
  pkg: `asks for your Mac password; ${REOPEN}`,
  brew: `runs brew upgrade powershell; ${REOPEN}`,
  dotnet: `runs dotnet tool update; ${REOPEN}`,
}
const inflight = new Set<string>()

export type PwshInstall =
  | { method: "pkg" | "dotnet" | "archive" | "unknown"; path: string }
  | { method: "brew"; path: string; brew: string }

type PwshStatus = { install: PwshInstall; installed: string; latest: string }

export const POWERSHELL_MAC_NOTE = REOPEN

export async function checkPowershellMac(): Promise<DesktopCheckResult> {
  if (inflight.has(KEY)) return { ok: false, alreadyRunning: true, message: `${LABEL} check already running` }
  inflight.add(KEY)
  try {
    const status = await readStatus()
    if (!status) return { ok: false, alreadyRunning: false, message: `${LABEL} not installed`, notInstalled: true }
    if (compareDesktopVersions(status.latest, status.installed) <= 0) {
      const message = `${LABEL} is up to date (${status.installed})`
      return { ok: true, alreadyRunning: false, upToDate: true, version: status.installed, message }
    }
    const install = status.install
    if (install.method === "archive" || install.method === "unknown") {
      return { ok: false, alreadyRunning: false, manual: true, message: manualMessage(status) }
    }
    return {
      ok: true,
      alreadyRunning: false,
      upToDate: false,
      oldVersion: status.installed,
      newVersion: status.latest,
      note: NOTES[install.method],
      message: `${LABEL} update available: ${status.installed} -> ${status.latest}`,
    }
  } catch (cause) {
    return { ok: false, alreadyRunning: false, message: `Failed to check ${LABEL}: ${errorText(cause)}` }
  } finally {
    inflight.delete(KEY)
  }
}

export async function installPowershellMac(
  expectedVersion: string,
  onLine?: (line: string) => void,
): Promise<DesktopInstallResult> {
  if (inflight.has(KEY)) return { ok: false, alreadyRunning: true, message: `${LABEL} update already running` }
  inflight.add(KEY)
  const fail = (message: string) => ({
    ok: false,
    alreadyRunning: false,
    message: `Failed to update ${LABEL}: ${message}`,
  })
  try {
    const status = await readStatus()
    if (!status) return fail(`${LABEL} not installed`)
    if (status.latest !== expectedVersion) {
      return fail(`latest version changed (${status.latest}, expected ${expectedVersion}); confirm again`)
    }
    if (compareDesktopVersions(status.latest, status.installed) <= 0) {
      return { ok: true, alreadyRunning: false, message: `${LABEL} is up to date (${status.installed})` }
    }
    const install = status.install
    if (install.method === "brew") await run(install.brew, ["upgrade", "powershell"], onLine, BREW_ENV)
    if (install.method === "dotnet") await run(dotnetPath(), ["tool", "update", "--global", "PowerShell"], onLine)
    if (install.method === "pkg") await installPkg(status.latest, onLine)
    if (install.method === "archive" || install.method === "unknown") return fail(manualMessage(status))
    const after = await installedVersion(install)
    if (after !== status.latest) return fail(`install finished but ${LABEL} reports ${after}`)
    return { ok: true, alreadyRunning: false, message: `Updated ${LABEL} ${status.installed} -> ${after}` }
  } catch (cause) {
    return fail(errorText(cause))
  } finally {
    inflight.delete(KEY)
  }
}

/** The pwsh first on PATH (the Dock-started oc may lack Homebrew's PATH, so known spots follow). */
export async function detectPwshInstall(): Promise<PwshInstall | undefined> {
  const home = os.homedir()
  const found =
    which("pwsh") ??
    ["/usr/local/bin/pwsh", "/opt/homebrew/bin/pwsh", path.join(home, ".dotnet", "tools", "pwsh")].find((file) =>
      existsSync(file),
    )
  if (!found) return undefined
  const real = await realpath(found).catch(() => found)
  return classifyPwshPath(real, home, (await pkgVersion()) !== undefined)
}

export function classifyPwshPath(real: string, home: string, hasPkgReceipt: boolean): PwshInstall {
  const cellar = real.indexOf("/Cellar/powershell/")
  if (cellar > 0) return { method: "brew", path: real, brew: path.join(real.slice(0, cellar), "bin", "brew") }
  if (real.startsWith(path.join(home, ".dotnet", "tools") + path.sep)) return { method: "dotnet", path: real }
  if (real === PKG_PWSH) return { method: hasPkgReceipt ? "pkg" : "archive", path: real }
  return { method: "unknown", path: real }
}

export function parsePkgInfoVersion(output: string) {
  return output.match(/^version:\s*(\d+\.\d+\.\d+)\s*$/m)?.[1]
}

export function parseReleaseTag(info: unknown) {
  const tag = typeof info === "object" && info !== null && "ReleaseTag" in info ? String(info.ReleaseTag) : ""
  const match = tag.match(/^v(\d+\.\d+\.\d+)$/)
  if (!match) throw new Error(`unexpected release tag '${tag}'`)
  return match[1]
}

/** `brew outdated --json=v2` output (stderr lines may surround it); undefined when current. */
export function parseBrewOutdated(output: string) {
  const json = output.slice(output.indexOf("{"), output.lastIndexOf("}") + 1)
  const parsed: { formulae?: { name?: string; installed_versions?: string[]; current_version?: string }[] } =
    JSON.parse(json)
  const entry = parsed.formulae?.find((formula) => formula.name === "powershell")
  if (!entry?.current_version) return undefined
  return brewVersion(entry.current_version)
}

/** Homebrew revisions (`7.6.9_1`) rebuild the same PowerShell release. */
export function brewVersion(version: string) {
  return version.replace(/_\d+$/, "")
}

export function parseDotnetToolVersion(output: string) {
  return output.match(/^powershell\s+(\d+\.\d+\.\d+)\s/im)?.[1]
}

export function latestNugetVersion(index: { versions?: string[] }) {
  return (index.versions ?? [])
    .filter((version) => VERSION.test(version))
    .sort(compareDesktopVersions)
    .at(-1)
}

/** Undefined when the package is fine, else why it must not be installed. */
export function pkgSignatureProblem(output: string) {
  const status = output.match(/^\s*Status:\s*(.+)$/m)?.[1]?.trim() ?? "no signature"
  if (status !== "signed by a developer certificate issued by Apple for distribution") {
    return `signature check failed: ${status}`
  }
  if (!/^\s*Notarization:\s*trusted by the Apple notary service\s*$/m.test(output)) return "package is not notarized"
  const signer = output.match(/^\s*1\.\s*(.+)$/m)?.[1]?.trim() ?? ""
  if (signer !== SIGNER) return `signature signer '${signer}' is not Microsoft`
  return undefined
}

export function isGithubHost(host: string) {
  return GITHUB_HOSTS.has(host.toLowerCase())
}

async function readStatus(): Promise<PwshStatus | undefined> {
  const install = await detectPwshInstall()
  if (!install) return undefined
  const installed = await installedVersion(install)
  return { install, installed, latest: await latestVersion(install, installed) }
}

async function installedVersion(install: PwshInstall) {
  const version = await (async () => {
    if (install.method === "pkg") return pkgVersion()
    if (install.method === "brew") {
      const listed = await run(install.brew, ["list", "--versions", "powershell"], undefined, BREW_ENV)
      return brewVersion(listed.trim().split(/\s+/).at(-1) ?? "")
    }
    if (install.method === "dotnet")
      return parseDotnetToolVersion(await run(dotnetPath(), ["tool", "list", "--global"]))
    const printed = await run(install.path, [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$PSVersionTable.PSVersion.ToString()",
    ])
    return printed.trim().split(/\r?\n/).at(-1)?.trim()
  })()
  if (!version || !VERSION.test(version)) throw new Error(`could not read the installed version (${install.path})`)
  return version
}

// Homebrew and NuGet lag Microsoft's release feed, so each method asks its own source.
async function latestVersion(install: PwshInstall, installed: string) {
  if (install.method === "brew") {
    await run(install.brew, ["update", "--quiet"], undefined, BREW_ENV)
    const outdated = await run(install.brew, ["outdated", "--json=v2", "--formula", "powershell"], undefined, BREW_ENV)
    return parseBrewOutdated(outdated) ?? installed
  }
  if (install.method === "dotnet") {
    const latest = latestNugetVersion(await fetchJson("https://api.nuget.org/v3-flatcontainer/powershell/index.json"))
    if (!latest) throw new Error("NuGet lists no stable PowerShell")
    return latest
  }
  return parseReleaseTag(await fetchJson("https://aka.ms/pwsh-buildinfo-stable"))
}

async function installPkg(version: string, onLine?: (line: string) => void) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "oc-powershell-update-"))
  try {
    const file = path.join(dir, "powershell.pkg")
    const arch = os.arch() === "arm64" ? "arm64" : "x64"
    await download(
      `https://github.com/PowerShell/PowerShell/releases/download/v${version}/powershell-${version}-osx-${arch}.pkg`,
      file,
      onLine,
    )
    onLine?.(`${STEP_PREFIX}verifying`)
    const problem = pkgSignatureProblem((await runCliCommand("pkgutil", ["--check-signature", file], 60_000)).output)
    if (problem) throw new Error(problem)
    onLine?.(`${STEP_PREFIX}installing needs admin approval`)
    const script = `do shell script "/usr/sbin/installer -pkg " & quoted form of ${appleString(file)} & " -target /" with administrator privileges`
    const result = await runCliCommand("osascript", ["-e", script], undefined, undefined, onLine)
    if (result.ok) return
    if (result.output.includes("(-128)")) throw new Error("cancelled at the admin prompt")
    throw new Error(`install failed: ${result.lastLine || result.error || `exit code ${result.code}`}`)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

// Same progress lines as the Windows DOWNLOAD_HELPERS, so the progress toast shows a percentage.
async function download(url: string, file: string, onLine?: (line: string) => void) {
  onLine?.(`${STEP_PREFIX}downloading`)
  const response = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) })
  const host = new URL(response.url).hostname
  if (!isGithubHost(host)) throw new Error(`download redirected to unexpected host '${host}'`)
  if (!response.ok || !response.body) throw new Error(`download failed: HTTP ${response.status}`)
  const total = Number(response.headers.get("content-length") ?? 0) || 0
  const writer = Bun.file(file).writer()
  let received = 0
  let reported = 0
  onLine?.(`${PROGRESS_PREFIX}0 ${total}`)
  const reader = response.body.getReader()
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    writer.write(next.value)
    received += next.value.length
    if (Date.now() - reported < 200) continue
    reported = Date.now()
    onLine?.(`${PROGRESS_PREFIX}${received} ${total}`)
  }
  await writer.end()
  onLine?.(`${PROGRESS_PREFIX}${received} ${total}`)
}

async function pkgVersion() {
  const result = await runCliCommand("pkgutil", ["--pkg-info", PKG_ID], 30_000)
  return result.ok ? parsePkgInfoVersion(result.output) : undefined
}

function dotnetPath() {
  const found =
    which("dotnet") ??
    ["/usr/local/share/dotnet/dotnet", path.join(os.homedir(), ".dotnet", "dotnet")].find((file) => existsSync(file))
  if (!found) throw new Error("the .NET SDK (dotnet) is missing")
  return found
}

async function fetchJson(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`update check failed: HTTP ${response.status} from ${new URL(url).hostname}`)
  return response.json()
}

function manualMessage(status: PwshStatus) {
  const versions = `${LABEL} ${status.installed} -> ${status.latest} available`
  if (status.install.method === "archive") return `${versions}; installed from a tar.gz archive, reinstall it by hand`
  return `${versions}; oc does not manage ${status.install.path}, update it by hand`
}

function appleString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}
