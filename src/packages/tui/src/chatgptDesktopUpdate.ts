import {
  DOWNLOAD_HELPERS,
  GET_MSIX_IDENTITY,
  runDesktopCheck,
  runDesktopInstall,
  scriptModeLines,
} from "./desktopUpdate"
import type { DesktopCheckResult, DesktopInstallResult } from "./desktopUpdate"

// Fixed script for the OpenAI Store package: highest OpenAI.Codex package with the
// exact OpenAI.Codex_2p2nqsd0c76g0 family, latest buildVersion from OpenAI's
// windows-store-update.json feed (identity and product id pinned so a changed
// schema fails closed), skip when current, floating ChatGPT-x64/arm64.msix
// download whose manifest version must be newer than the installed one (the feed is the
// Store build, which the direct MSIX can lag), manifest Name plus
// publisher pin via the ZipFile approach, Authenticode Valid required, install with
// -ForceApplicationShutdown, temp dir removed in finally. Errors go to an OCERR line
// and exit 1 (trap). No user input is interpolated; the check/install mode is
// selected by the $CheckOnly prefix line only.
const CHATGPT_DESKTOP_SCRIPT = String.raw`
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
trap { Write-Output "OCERR: $($_.Exception.Message)"; exit 1 }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$PackageName = "OpenAI.Codex"
$PackageFamilyName = "OpenAI.Codex_2p2nqsd0c76g0"
$ExpectedPublisher = "CN=50BDFD77-8903-4850-9FFE-6E8522F64D5B"
$FeedUri = "https://persistent.oaistatic.com/codex-app-prod/windows-store-update.json"

function Get-InstalledChatgptVersion {
  $pkgs = Get-AppxPackage -Name $PackageName -ErrorAction SilentlyContinue | Where-Object { $_.PackageFamilyName -eq $PackageFamilyName }
  if (-not $pkgs) { return $null }
  return ($pkgs | ForEach-Object { [version]$_.Version } | Sort-Object -Descending | Select-Object -First 1)
}

${GET_MSIX_IDENTITY}
${DOWNLOAD_HELPERS}

$installed = Get-InstalledChatgptVersion
if (-not $installed -and -not $AllowFresh) { throw "ChatGPT Desktop not installed" }
if (-not $installed) { $installed = [version]"0.0" }

try { $feed = Invoke-RestMethod -Uri $FeedUri -UseBasicParsing }
catch { throw "Update check failed: $($_.Exception.Message)" }
if ($feed -is [string]) { $feed = $feed | ConvertFrom-Json }
if ([string]$feed.packageIdentity -ne $PackageName) { throw "Update check failed: unexpected packageIdentity '$($feed.packageIdentity)'" }
if ([string]$feed.storeProductId -ne "9PLM9XGG6VKS") { throw "Update check failed: unexpected storeProductId '$($feed.storeProductId)'" }
$latestRaw = [string]$feed.buildVersion
if ($latestRaw -notmatch "^\d+(\.\d+){1,3}$") { throw "Update check failed: unexpected buildVersion '$latestRaw'" }
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

$fileName = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "ChatGPT-arm64.msix" } else { "ChatGPT-x64.msix" }
$url = "https://persistent.oaistatic.com/codex-app-prod/$fileName"
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("chatgpt-desktop-update-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  $file = Join-Path $tmp $fileName
  Save-Download -Uri $url -OutFile $file
  Write-OcStep "verifying"
  $identity = Get-MsixIdentity -Path $file
  $sig = Get-AuthenticodeSignature -FilePath $file
  if ($sig.Status -ne "Valid") { throw "Signature check failed: $($sig.Status)" }
  if ($identity.Name -ne $PackageName) { throw "Package name '$($identity.Name)' is not ChatGPT Desktop's expected package" }
  if ($identity.Publisher -ne $ExpectedPublisher) { throw "Package publisher '$($identity.Publisher)' is not ChatGPT Desktop's expected publisher" }
  # The feed is the Store build; the direct MSIX can be an older build, so only require it to be newer.
  if ($identity.Version -le $installed) { throw "The direct download ($($identity.Version)) is not newer than the installed version ($installed)" }
  Write-OcStep "installing"
  try { Add-AppxPackage -Path $file -ForceApplicationShutdown }
  catch { throw "Install failed: $($_.Exception.Message)" }
  $after = Get-InstalledChatgptVersion
  if (-not $after) { throw "Install finished but ChatGPT Desktop was not found" }
  Write-Output "Updated ChatGPT Desktop $installed -> $after"
} finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
`

function chatgptDesktopScript(checkOnly: boolean, expectedVersion?: string, allowFresh = false) {
  return `${scriptModeLines(checkOnly, expectedVersion, allowFresh)}\n${CHATGPT_DESKTOP_SCRIPT}`
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
    script: chatgptDesktopScript(false, expectedVersion),
    onLine,
  })
}

/** Installs or updates to the latest release without a prior check (`oc oc deps install`). */
export async function installChatgptDesktopLatest(onLine?: (line: string) => void): Promise<DesktopInstallResult> {
  return runDesktopInstall({
    key: CHATGPT_KEY,
    label: "ChatGPT Desktop",
    script: chatgptDesktopScript(false, undefined, true),
    onLine,
  })
}
