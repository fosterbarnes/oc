import { existsSync } from "node:fs"
import { rm } from "node:fs/promises"
import path from "node:path"
import { which } from "@opencode-ai/core/util/which"
import { BREW_ENV, errorText, runCliCommand, runOrThrow } from "./cliUpdate"
import {
  DOWNLOAD_HELPERS,
  psString,
  runDesktopInstall,
  STEP_PREFIX,
  TEST_GITHUB_HOST,
  type DesktopCheckResult,
  type DesktopInstallResult,
} from "./desktopUpdate"

// WezTerm nightly (stable has had no release since 20240203), updated the way it was installed:
// - macOS: Homebrew cask `wezterm@nightly`. Its version is `latest`, so brew cannot tell when it is
//   outdated; oc compares the commit that `wezterm --version` ends with to the commit of upstream's
//   last successful nightly CI run, then reinstalls the cask after deleting brew's cached zip (same
//   URL every night). The cask has no quit step, so a running WezTerm (and the oc inside it) keeps
//   its old files.
// - Windows: the nightly setup.exe (what oc's dependency row installs) in Program Files\WezTerm.
//   A running WezTerm keeps its .exe/.dll files open, which Windows lets be renamed but not
//   replaced; an elevated helper moves them aside, runs the installer with
//   /NOCLOSEAPPLICATIONS so Restart Manager never closes WezTerm (its Ctrl+C to a console killed
//   oc's TUI during the PowerShell MSI update), and deletes the moved files once nothing holds them.
// Any other install (the stable cask, a portable copy, a source build) is only checked.

const LABEL = "WezTerm"
const CASK = "wezterm@nightly"
const MAC_APP_CLI = "/Applications/WezTerm.app/Contents/MacOS/wezterm"
const WIN_CLI = path.join(process.env.ProgramFiles ?? "C:\\Program Files", "WezTerm", "wezterm.exe")
const WORKFLOW = process.platform === "darwin" ? "gen_macos_continuous.yml" : "gen_windows_continuous.yml"
const REOPEN = "open WezTerm windows keep the old version until WezTerm restarts"
const inflight = new Set<string>()

export const WEZTERM_NOTE =
  process.platform === "darwin" ? `runs brew reinstall --cask ${CASK}; ${REOPEN}` : `asks for admin approval; ${REOPEN}`

type Install =
  | { method: "brew"; cli: string; brew: string }
  | { method: "setup"; cli: string }
  | { method: "unknown"; cli: string }

/** `wezterm 20261108-035604-458a100c` -> `20261108-458a100c` (date and the commit it was built from). */
export function parseWeztermVersion(output: string) {
  const match = output.match(/(\d{8})-\d{6}-([0-9a-f]{8})/)
  return match ? `${match[1]}-${match[2]}` : undefined
}

/** The newest successful nightly CI run (`actions/workflows/<file>/runs`), as `<date>-<commit>`. */
export function parseNightlyRun(runs: unknown) {
  const run = (runs as { workflow_runs?: { head_sha?: string; head_commit?: { timestamp?: string } }[] })
    .workflow_runs?.[0]
  const sha = run?.head_sha?.slice(0, 8)
  const date = run?.head_commit?.timestamp?.slice(0, 10).replaceAll("-", "")
  if (!sha || !/^[0-9a-f]{8}$/.test(sha) || !date || !/^\d{8}$/.test(date)) {
    throw new Error("upstream CI listed no nightly build")
  }
  return `${date}-${sha}`
}

/** Builds are the same when they come from the same commit; the date is only for display. */
export function sameBuild(a: string, b: string) {
  return a.slice(-8) === b.slice(-8)
}

export async function checkWezterm(): Promise<DesktopCheckResult> {
  if (inflight.has("check")) return { ok: false, alreadyRunning: true, message: `${LABEL} check already running` }
  inflight.add("check")
  try {
    const install = await detectInstall()
    if (!install) return { ok: false, alreadyRunning: false, message: `${LABEL} not installed`, notInstalled: true }
    const installed = await installedVersion(install.cli)
    const latest = await latestVersion()
    if (sameBuild(installed, latest)) {
      return { ok: true, alreadyRunning: false, upToDate: true, version: installed, message: upToDate(installed) }
    }
    if (install.method === "unknown") {
      return { ok: false, alreadyRunning: false, manual: true, message: manualMessage(install.cli, installed, latest) }
    }
    return {
      ok: true,
      alreadyRunning: false,
      upToDate: false,
      oldVersion: installed,
      newVersion: latest,
      message: `${LABEL} update available: ${installed} -> ${latest}`,
    }
  } catch (cause) {
    return { ok: false, alreadyRunning: false, message: `Failed to check ${LABEL}: ${errorText(cause)}` }
  } finally {
    inflight.delete("check")
  }
}

export async function installWezterm(
  expectedVersion: string,
  onLine?: (line: string) => void,
): Promise<DesktopInstallResult> {
  const fail = (message: string) => ({
    ok: false,
    alreadyRunning: false,
    message: `Failed to update ${LABEL}: ${message}`,
  })
  if (inflight.has("install")) return { ok: false, alreadyRunning: true, message: `${LABEL} update already running` }
  inflight.add("install")
  try {
    const install = await detectInstall()
    if (!install) return fail(`${LABEL} not installed`)
    const installed = await installedVersion(install.cli)
    const latest = await latestVersion()
    if (!sameBuild(latest, expectedVersion)) return fail(`latest build changed (${latest}); confirm again`)
    if (sameBuild(installed, latest)) return { ok: true, alreadyRunning: false, message: upToDate(installed) }
    if (install.method === "unknown") return fail(manualMessage(install.cli, installed, latest))
    if (install.method === "setup")
      return await runDesktopInstall({ key: "wezterm", label: LABEL, script: setupScript, onLine })
    onLine?.(`${STEP_PREFIX}downloading`)
    const cached = await runOrThrow(install.brew, ["--cache", "--cask", CASK], undefined, BREW_ENV)
    await rm(cached.trim(), { force: true })
    await runOrThrow(install.brew, ["reinstall", "--cask", CASK], onLine, BREW_ENV)
    const after = await installedVersion(install.cli)
    if (after === installed) return fail(`reinstall finished but ${LABEL} still reports ${after}`)
    return { ok: true, alreadyRunning: false, message: `Updated ${LABEL} ${installed} -> ${after}` }
  } catch (cause) {
    return fail(errorText(cause))
  } finally {
    inflight.delete("install")
  }
}

/** Any WezTerm at all (no brew call); the check decides whether oc can update it. */
export function weztermPresent() {
  if (process.platform === "win32") return existsSync(WIN_CLI) || Boolean(which("wezterm"))
  return process.platform === "darwin" && (existsSync(MAC_APP_CLI) || Boolean(which("wezterm")))
}

async function detectInstall(): Promise<Install | undefined> {
  if (process.platform === "win32") {
    if (existsSync(WIN_CLI)) return { method: "setup", cli: WIN_CLI }
    const found = which("wezterm")
    return found ? { method: "unknown", cli: found } : undefined
  }
  if (process.platform !== "darwin") return undefined
  const brew = which("brew") ?? ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"].find((file) => existsSync(file))
  const cask = brew ? await runCliCommand(brew, ["list", "--cask", "--versions", CASK], 30_000, BREW_ENV) : undefined
  if (brew && cask?.ok && existsSync(MAC_APP_CLI)) return { method: "brew", cli: MAC_APP_CLI, brew }
  const found = existsSync(MAC_APP_CLI) ? MAC_APP_CLI : which("wezterm")
  return found ? { method: "unknown", cli: found } : undefined
}

async function installedVersion(cli: string) {
  const version = parseWeztermVersion(await runOrThrow(cli, ["--version"]))
  if (!version) throw new Error(`could not read the installed version (${cli})`)
  return version
}

async function latestVersion() {
  const url = `https://api.github.com/repos/wezterm/wezterm/actions/workflows/${WORKFLOW}/runs?branch=main&status=success&per_page=1`
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`update check failed: HTTP ${response.status} from api.github.com`)
  return parseNightlyRun(await response.json())
}

function upToDate(version: string) {
  return `${LABEL} is up to date (${version})`
}

function manualMessage(cli: string, installed: string, latest: string) {
  return `${LABEL} ${installed} -> ${latest} available; oc only updates the ${process.platform === "darwin" ? `Homebrew ${CASK} cask` : "nightly setup.exe install"}, not ${cli}`
}

// Runs elevated with the downloaded setup.exe and the install folder. A failure leaves its message
// in swap.err next to setup.exe and restores the moved files.
const SWAP_SCRIPT = String.raw`
param([string]$Setup, [string]$App)
$ErrorActionPreference = "Stop"
$moved = New-Object System.Collections.ArrayList
function Restore-Moved { foreach ($item in $moved) { if (-not (Test-Path -LiteralPath $item.To)) { Move-Item -LiteralPath $item.From -Destination $item.To } } }
trap { Set-Content -LiteralPath (Join-Path (Split-Path $Setup) "swap.err") -Value $_.Exception.Message; Restore-Moved; exit 1 }
Get-ChildItem -LiteralPath $App -Recurse -File -Filter *.oc-old | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -LiteralPath $App -Recurse -File -Include *.exe, *.dll | Where-Object { $_.Name -notlike "unins*" } | ForEach-Object {
  $from = "$($_.FullName).$([guid]::NewGuid().ToString('N')).oc-old"
  Move-Item -LiteralPath $_.FullName -Destination $from
  [void]$moved.Add([pscustomobject]@{ From = $from; To = $_.FullName })
}
$proc = Start-Process -FilePath $Setup -ArgumentList "/VERYSILENT", "/NORESTART", "/NOCANCEL", "/SP-", "/SUPPRESSMSGBOXES", "/NOCLOSEAPPLICATIONS" -Wait -PassThru
if ($proc.ExitCode -ne 0) { throw "setup.exe exit code $($proc.ExitCode)" }
Get-ChildItem -LiteralPath $App -Recurse -File -Filter *.oc-old | Remove-Item -Force -ErrorAction SilentlyContinue
`

// Windows PowerShell; downloads into $WorkDir (the caller's temp folder). WezTerm's installer is
// unsigned, so the check is the .sha256 file its release ships next to it.
function setupScript(dir: string) {
  return `$WorkDir = ${psString(dir)}\n$SwapScript = ${psString(SWAP_SCRIPT)}\n${String.raw`
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
trap { Write-Output "OCERR: $($_.Exception.Message)"; exit 1 }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$App = Join-Path $env:ProgramFiles "WezTerm"

${TEST_GITHUB_HOST}

${DOWNLOAD_HELPERS}

function Get-WeztermVersion {
  $printed = & (Join-Path $App "wezterm.exe") --version
  if (-not ($printed -match "(\d{8})-\d{6}-([0-9a-f]{8})")) { throw "Could not read the installed version" }
  return "$($Matches[1])-$($Matches[2])"
}

$before = Get-WeztermVersion
$url = "https://github.com/wezterm/wezterm/releases/download/nightly/WezTerm-nightly-setup.exe"
$file = Join-Path $WorkDir "WezTerm-nightly-setup.exe"
Save-Download -Uri "$url.sha256" -OutFile "$file.sha256" -AllowHost { param($h) Test-GithubHost $h }
Save-Download -Uri $url -OutFile $file -AllowHost { param($h) Test-GithubHost $h }
Write-OcStep "verifying"
$want = ((Get-Content -LiteralPath "$file.sha256" -Raw).Trim() -split "\s+")[0]
$got = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
if ($got -ne $want.ToUpperInvariant()) { throw "SHA-256 mismatch: got $got, release lists $want" }
$helper = Join-Path $WorkDir "swap.ps1"
Set-Content -LiteralPath $helper -Value $SwapScript -Encoding UTF8
Write-OcStep "installing needs admin approval"
$quote = { param($value) '"{0}"' -f $value }
try { $proc = Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (& $quote $helper), (& $quote $file), (& $quote $App) -Verb RunAs -WindowStyle Hidden -PassThru }
catch { throw "Cancelled at the admin prompt" }
Write-OcStep "installing"
if (-not $proc.WaitForExit(600000)) { throw "Install still running after 10 minutes" }
if ($proc.ExitCode -ne 0) {
  $detail = Get-Content -LiteralPath (Join-Path $WorkDir "swap.err") -Raw -ErrorAction SilentlyContinue
  throw "Install failed: $(if ($detail) { $detail.Trim() } else { "exit code $($proc.ExitCode)" })"
}
$after = Get-WeztermVersion
if ($after -eq $before) { throw "Install finished but WezTerm still reports $after" }
Write-Output "Updated WezTerm $before -> $after"
`}`
}
