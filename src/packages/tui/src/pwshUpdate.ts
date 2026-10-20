import { DOWNLOAD_HELPERS, expectedVersionAssignment, runDesktopCheck, runDesktopInstall } from "./desktopUpdate"
import type { DesktopCheckResult, DesktopInstallResult } from "./desktopUpdate"

// Fixed script for the machine-wide PowerShell 7 MSI install: installed version from the MSI's
// PowerShellCore\InstalledVersions entry for Program Files\PowerShell\7, latest stable from
// Microsoft's buildinfo feed, MSI from the GitHub release with the final download host
// allowlisted, Authenticode Valid plus exact Microsoft signer CN pin, then an elevated silent
// msiexec (UAC prompt). The MSI restores its saved install options (PATH, context menus,
// remoting, Microsoft Update) on upgrade, so none are passed. MSIRESTARTMANAGERCONTROL=
// DisableShutdown stops Windows Installer from closing running pwsh processes, oc's own parent
// shell included; files they hold are replaced at the next reboot (exit 3010). Microsoft ships
// no MSI from 7.7, so the check refuses those versions. Errors go to an OCERR line and exit 1
// (trap). No user input is interpolated; the check/install mode is selected by the $CheckOnly
// prefix line only.
const PWSH_SCRIPT = String.raw`
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
trap { Write-Output "OCERR: $($_.Exception.Message)"; exit 1 }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$InstallDir = Join-Path $env:ProgramFiles "PowerShell\7"

function Test-GithubHost {
  param([string]$HostName)
  $h = $HostName.ToLowerInvariant()
  return $h -eq "github.com" -or $h -eq "objects.githubusercontent.com" -or $h -eq "release-assets.githubusercontent.com"
}

${DOWNLOAD_HELPERS}

function Get-InstalledPwshVersion {
  $entries = Get-ChildItem -LiteralPath "HKLM:\SOFTWARE\Microsoft\PowerShellCore\InstalledVersions" -ErrorAction SilentlyContinue | ForEach-Object { Get-ItemProperty -LiteralPath $_.PSPath }
  $match = $entries | Where-Object { $_.InstallLocation -and $_.InstallLocation.TrimEnd("\") -eq $InstallDir -and $_.SemanticVersion -match "^\d+\.\d+\.\d+$" } | Select-Object -First 1
  if (-not $match) { return $null }
  return [version]$match.SemanticVersion
}

$installed = Get-InstalledPwshVersion
if (-not $installed) { throw "PowerShell not installed" }

try { $info = Invoke-RestMethod -Uri "https://aka.ms/pwsh-buildinfo-stable" -UseBasicParsing }
catch { throw "Update check failed: $($_.Exception.Message)" }
$tag = [string]$info.ReleaseTag
if (-not ($tag -match "^v(\d+\.\d+\.\d+)$")) { throw "Update check failed: unexpected release tag '$tag'" }
$latest = [version]$Matches[1]

if ($ExpectedVersion -and [string]$latest -ne $ExpectedVersion) {
  throw "Latest version changed ($latest, expected $ExpectedVersion); confirm again"
}
if ($latest -le $installed) {
  Write-Output "PowerShell is up to date ($installed)"
  exit 0
}
if ($latest -ge [version]"7.7") { throw "PowerShell $latest has no MSI package; reinstall from the MSIX package" }
if ($CheckOnly) {
  Write-Output "UPDATE $installed $latest"
  exit 0
}

$arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
$url = "https://github.com/PowerShell/PowerShell/releases/download/v$latest/PowerShell-$latest-win-$arch.msi"
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("pwsh-update-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  $file = Join-Path $tmp "PowerShell.msi"
  Save-Download -Uri $url -OutFile $file -AllowHost { param($h) Test-GithubHost $h }
  Write-OcStep "verifying"
  $sig = Get-AuthenticodeSignature -FilePath $file
  if ($sig.Status -ne "Valid") { throw "Signature check failed: $($sig.Status)" }
  $signer = $sig.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
  if ($signer -ne "Microsoft Corporation") { throw "Signature signer '$signer' is not Microsoft" }
  Write-OcStep "installing needs admin approval"
  try { $proc = Start-Process -FilePath "msiexec.exe" -ArgumentList "/i", ('"{0}"' -f $file), "/qn", "/norestart", "MSIRESTARTMANAGERCONTROL=DisableShutdown" -Verb RunAs -PassThru }
  catch { throw "Cancelled at the admin prompt" }
  if (-not $proc.WaitForExit(600000)) { throw "Install still running after 10 minutes" }
  $code = $proc.ExitCode
  if ($code -eq 1602) { throw "Install cancelled" }
  if ($code -eq 1618) { throw "Another installer is running; try again when it finishes" }
  if ($code -ne 0 -and $code -ne 3010) { throw "Install failed: msiexec exit code $code" }
  $after = Get-InstalledPwshVersion
  if ($after -ne $latest) { throw "Install finished but PowerShell reports $after" }
  $note = if ($code -eq 3010) { " (restart Windows to finish)" } else { "" }
  Write-Output "Updated PowerShell $installed -> $after$note"
} finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
`

function pwshScript(checkOnly: boolean, expectedVersion?: string) {
  const prefix = `${checkOnly ? "$CheckOnly = $true" : "$CheckOnly = $false"}\n${expectedVersionAssignment(expectedVersion)}`
  return `${prefix}\n${PWSH_SCRIPT}`
}

const PWSH_KEY = "powershell"

export async function checkPowershell(): Promise<DesktopCheckResult> {
  return runDesktopCheck({ key: PWSH_KEY, label: "PowerShell", script: pwshScript(true) })
}

export async function installPowershell(
  expectedVersion: string,
  onLine?: (line: string) => void,
): Promise<DesktopInstallResult> {
  if (!/^\d+(\.\d+){1,3}$/.test(expectedVersion)) {
    return { ok: false, alreadyRunning: false, message: "Confirmed version is invalid" }
  }
  return runDesktopInstall({ key: PWSH_KEY, label: "PowerShell", script: pwshScript(false, expectedVersion), onLine })
}
