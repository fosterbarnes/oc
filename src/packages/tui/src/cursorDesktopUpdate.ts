import { DOWNLOAD_HELPERS, expectedVersionAssignment, runDesktopCheck, runDesktopInstall } from "./desktopUpdate"
import type { DesktopCheckResult, DesktopInstallResult } from "./desktopUpdate"

// Fixed script for the per-user Inno Setup install: registry DisplayVersion of the
// _is1 key (no process spawn, works when Cursor is closed), system-wide installs
// under Program Files are refused (no elevation), latest version plus installer URL
// from Cursor's download API, download host and final redirect host both allowlisted,
// Authenticode Valid plus exact Anysphere signer CN pin, silent install with
// /MERGETASKS=!runcode so Cursor does not relaunch, installer killed after 10 minutes,
// temp dir removed in finally. Errors go to an OCERR line and exit 1 (trap). No user
// input is interpolated; the check/install mode is selected by the $CheckOnly prefix
// line only.
const CURSOR_DESKTOP_SCRIPT = String.raw`
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
trap { Write-Output "OCERR: $($_.Exception.Message)"; exit 1 }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$UninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{DADADADA-ADAD-ADAD-ADAD-ADADADADADAD}}_is1"

function Test-CursorHost {
  param([string]$HostName)
  $h = $HostName.ToLowerInvariant()
  return $h -eq "cursor.com" -or $h -eq "cursor.sh" -or $h -eq "downloads.cursor.com" -or $h.EndsWith(".cursor.com") -or $h.EndsWith(".cursor.sh")
}

${DOWNLOAD_HELPERS}

function Get-CursorInstall {
  $key = Get-Item -LiteralPath $UninstallKey -ErrorAction SilentlyContinue
  if (-not $key) { return $null }
  $ver = [string]$key.GetValue("DisplayVersion")
  if (-not $ver) { return $null }
  $dir = [string]$key.GetValue("InstallLocation")
  if (-not $dir) {
    $unins = [string]$key.GetValue("UninstallString")
    if ($unins -match '^"([^"]+)"') { $dir = Split-Path -Parent $Matches[1] }
  }
  if (-not $dir) { return $null }
  return [pscustomobject]@{ Version = [version]$ver; Dir = $dir }
}

$found = Get-CursorInstall
if (-not $found) { throw "Cursor Desktop not installed" }
$local = $env:LOCALAPPDATA
if (-not $local -or -not $found.Dir.StartsWith("$local\", [StringComparison]::OrdinalIgnoreCase)) { throw "Cursor Desktop system install not supported" }
$installed = $found.Version

$platform = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "win32-arm64-user" } else { "win32-x64-user" }
$api = "https://cursor.com/api/download?platform=$platform&releaseTrack=stable"
try { $info = Invoke-RestMethod -Uri $api -UseBasicParsing }
catch { throw "Update check failed: $($_.Exception.Message)" }
$latestRaw = [string]$info.version
$downloadUrl = [string]$info.downloadUrl
if ($latestRaw -notmatch "^\d+(\.\d+){1,3}$") { throw "Update check failed: unexpected version '$latestRaw'" }
$latest = [version]$latestRaw
if (-not $downloadUrl.StartsWith("https://", [StringComparison]::OrdinalIgnoreCase)) { throw "Update check failed: unexpected downloadUrl" }
$dlHost = ([uri]$downloadUrl).Host
if (-not (Test-CursorHost $dlHost)) { throw "Update check failed: unexpected download host '$dlHost'" }

if ($ExpectedVersion -and [string]$latest -ne $ExpectedVersion) {
  throw "Latest version changed ($latest, expected $ExpectedVersion); confirm again"
}
if ($latest -le $installed) {
  Write-Output "Cursor Desktop is up to date ($installed)"
  exit 0
}
if ($CheckOnly) {
  Write-Output "UPDATE $installed $latest"
  exit 0
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("cursor-desktop-update-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  $file = Join-Path $tmp "CursorSetup.exe"
  Save-Download -Uri $downloadUrl -OutFile $file -AllowHost { param($h) Test-CursorHost $h }
  Write-OcStep "verifying"
  $sig = Get-AuthenticodeSignature -FilePath $file
  if ($sig.Status -ne "Valid") { throw "Signature check failed: $($sig.Status)" }
  $signer = $sig.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
  if ($signer -ne "Anysphere, Inc.") { throw "Signature signer '$signer' is not Cursor's expected signer" }
  Write-OcStep "installing"
  $proc = Start-Process -FilePath $file -ArgumentList "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/CLOSEAPPLICATIONS", "/MERGETASKS=!runcode" -PassThru
  if (-not $proc.WaitForExit(600000)) {
    $proc.Kill()
    throw "Install timed out after 10 minutes"
  }
  if ($proc.ExitCode -ne 0) { throw "Install failed: exit code $($proc.ExitCode) (is Cursor still running?)" }
  $after = Get-CursorInstall
  if (-not $after) { throw "Install finished but Cursor Desktop was not found" }
  Write-Output "Updated Cursor Desktop $installed -> $($after.Version)"
} finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
`

function cursorDesktopScript(checkOnly: boolean, expectedVersion?: string) {
  const prefix = `${checkOnly ? "$CheckOnly = $true" : "$CheckOnly = $false"}\n${expectedVersionAssignment(expectedVersion)}`
  return `${prefix}\n${CURSOR_DESKTOP_SCRIPT}`
}

const CURSOR_KEY = "cursor-desktop"

export async function checkCursorDesktop(): Promise<DesktopCheckResult> {
  return runDesktopCheck({
    key: CURSOR_KEY,
    label: "Cursor Desktop",
    script: cursorDesktopScript(true),
    extraMessages: ["Cursor Desktop system install not supported"],
  })
}

export async function installCursorDesktop(
  expectedVersion: string,
  onLine?: (line: string) => void,
): Promise<DesktopInstallResult> {
  if (!/^\d+(\.\d+){1,3}$/.test(expectedVersion)) {
    return { ok: false, alreadyRunning: false, message: "Confirmed version is invalid" }
  }
  return runDesktopInstall({
    key: CURSOR_KEY,
    label: "Cursor Desktop",
    script: cursorDesktopScript(false, expectedVersion),
    onLine,
  })
}
