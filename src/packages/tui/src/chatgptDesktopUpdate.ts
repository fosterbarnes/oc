import {
  DOWNLOAD_HELPERS,
  GET_MSIX_IDENTITY,
  INSTALL_MSIX_ELEVATED,
  prepareDesktopInstall,
  runDesktopCheck,
  runDesktopInstall,
  scriptModeLines,
} from "./desktopUpdate"
import type { DesktopCheckResult, DesktopInstallResult, ScriptWork } from "./desktopUpdate"

// Fixed script for the OpenAI Store package: highest OpenAI.Codex package with the
// exact OpenAI.Codex_2p2nqsd0c76g0 family, latest = the version of the floating
// ChatGPT-x64/arm64.msix itself, read from its blob metadata headers with a HEAD request
// (identity and architecture pinned so changed metadata fails closed; the Store feed's
// buildVersion can be ahead of this file, which made a fresh install read "outdated"), skip
// when current, downloaded manifest version must equal that latest, manifest Name plus
// publisher pin via the ZipFile approach, Authenticode Valid required, elevated provisioning
// then per-user registration (Install-MsixElevated), all in the caller's $WorkDir. Errors go
// to an OCERR line and exit 1 (trap). No user input is interpolated;
// the mode is selected by the scriptModeLines prefix only.
const CHATGPT_DESKTOP_SCRIPT = String.raw`
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
trap { Write-Output "OCERR: $($_.Exception.Message)"; exit 1 }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$PackageName = "OpenAI.Codex"
$PackageFamilyName = "OpenAI.Codex_2p2nqsd0c76g0"
$ExpectedPublisher = "CN=50BDFD77-8903-4850-9FFE-6E8522F64D5B"
$Arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
$fileName = "ChatGPT-$Arch.msix"
$url = "https://persistent.oaistatic.com/codex-app-prod/$fileName"

function Get-InstalledChatgptVersion {
  $pkgs = Get-AppxPackage -Name $PackageName -ErrorAction SilentlyContinue | Where-Object { $_.PackageFamilyName -eq $PackageFamilyName }
  if (-not $pkgs) { return $null }
  return ($pkgs | ForEach-Object { [version]$_.Version } | Sort-Object -Descending | Select-Object -First 1)
}

${GET_MSIX_IDENTITY}
${DOWNLOAD_HELPERS}
${INSTALL_MSIX_ELEVATED}

$installed = Get-InstalledChatgptVersion
if (-not $installed -and -not $AllowFresh) { throw "ChatGPT Desktop not installed" }
if (-not $installed) { $installed = [version]"0.0" }

try { $head = Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) WindowsPowerShell/$($PSVersionTable.PSVersion) oc-setup" }
catch { throw "Update check failed: $($_.Exception.Message)" }
$meta = @{}
foreach ($key in "x-ms-meta-package_identity", "x-ms-meta-architecture", "x-ms-meta-package_version") { $meta[$key] = [string]$head.Headers[$key] }
if ($meta["x-ms-meta-package_identity"] -ne $PackageName) { throw "Update check failed: unexpected package identity '$($meta["x-ms-meta-package_identity"])'" }
if ($meta["x-ms-meta-architecture"] -ne $Arch) { throw "Update check failed: unexpected architecture '$($meta["x-ms-meta-architecture"])'" }
$latestRaw = $meta["x-ms-meta-package_version"]
if ($latestRaw -notmatch "^\d+(\.\d+){1,3}$") { throw "Update check failed: unexpected package version '$latestRaw'" }
$latest = [version]$latestRaw

if ($ExpectedVersion -and [string]$latest -ne $ExpectedVersion) {
  throw "Latest version changed ($latest, expected $ExpectedVersion); confirm again"
}
if ($latest -le $installed) {
  Write-Output "ChatGPT Desktop is up to date ($installed)"
  exit 0
}
if ($CheckOnly) {
  Write-Output "UPDATE $installed $latest"
  exit 0
}

$file = Join-Path $WorkDir $fileName
if (-not $Prepared) { Save-Download -Uri $url -OutFile $file }
Write-OcStep "verifying"
$identity = Get-MsixIdentity -Path $file
$sig = Get-AuthenticodeSignature -FilePath $file
if ($sig.Status -ne "Valid") { throw "Signature check failed: $($sig.Status) ($($sig.StatusMessage))" }
if ($identity.Name -ne $PackageName) { throw "Package name '$($identity.Name)' is not ChatGPT Desktop's expected package" }
if ($identity.Publisher -ne $ExpectedPublisher) { throw "Package publisher '$($identity.Publisher)' is not ChatGPT Desktop's expected publisher" }
# A new upload between the HEAD request and the download changes the version.
if ([version]$identity.Version -ne $latest) { throw "Latest version changed ($($identity.Version), expected $latest); confirm again" }
if ($PrepareOnly) { Write-Output "PREPARED $latest"; exit 0 }
# A per-user Add-AppxPackage fails with 0x80073D28 (seen on a fresh VM), as Claude's did.
Install-MsixElevated -File $file -FamilyName $PackageFamilyName -WorkDir $WorkDir
$after = Get-InstalledChatgptVersion
if (-not $after) { throw "Install finished but ChatGPT Desktop was not found" }
Write-Output "Updated ChatGPT Desktop $installed -> $after"
`

function chatgptDesktopScript(checkOnly: boolean, expectedVersion?: string, allowFresh = false, work?: ScriptWork) {
  return `${scriptModeLines(checkOnly, expectedVersion, allowFresh, work)}\n${CHATGPT_DESKTOP_SCRIPT}`
}

const CHATGPT_KEY = "chatgpt-desktop"

export async function checkChatgptDesktop(): Promise<DesktopCheckResult> {
  return runDesktopCheck({ key: CHATGPT_KEY, label: "ChatGPT Desktop", script: chatgptDesktopScript(true) })
}

export async function installChatgptDesktop(
  expectedVersion: string,
  onLine?: (line: string) => void,
): Promise<DesktopInstallResult> {
  if (!/^\d+(\.\d+){1,3}$/.test(expectedVersion)) {
    return { ok: false, alreadyRunning: false, message: "Confirmed version is invalid" }
  }
  return runDesktopInstall({
    key: CHATGPT_KEY,
    label: "ChatGPT Desktop",
    script: (dir) => chatgptDesktopScript(false, expectedVersion, false, { dir }),
    onLine,
  })
}

/** Downloads the latest release into `dir` and returns its install step (`oc oc deps install`). */
export function prepareChatgptDesktop(dir: string, onLine?: (line: string) => void) {
  return prepareDesktopInstall({
    key: CHATGPT_KEY,
    label: "ChatGPT Desktop",
    script: (expectedVersion, work) => chatgptDesktopScript(false, expectedVersion, true, work),
    dir,
    onLine,
  })
}
