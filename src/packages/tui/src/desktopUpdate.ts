import { runCliCommand, type CliCommandResult } from "./cliUpdate"

const inflight = new Set<string>()

export type DesktopCheckParse =
  | { ok: true; upToDate: true; version: string }
  | { ok: true; upToDate: false; oldVersion: string; newVersion: string }
  | { ok: false; message: string; notInstalled?: true }

export type DesktopCheckResult =
  | { ok: true; alreadyRunning: false; upToDate: true; version: string; message: string }
  | { ok: true; alreadyRunning: false; upToDate: false; oldVersion: string; newVersion: string; message: string }
  | { ok: false; alreadyRunning: boolean; message: string; notInstalled?: true }

export type DesktopInstallResult = {
  ok: boolean
  alreadyRunning: boolean
  message: string
}

export function compareDesktopVersions(a: string, b: string): number {
  const left = a.split(".").map(Number)
  const right = b.split(".").map(Number)
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i++) {
    const x = left[i] ?? Number.NaN
    const y = right[i] ?? Number.NaN
    const nx = Number.isNaN(x) ? 0 : x
    const ny = Number.isNaN(y) ? 0 : y
    if (nx !== ny) return nx < ny ? -1 : 1
  }
  return 0
}

// Progress lines from DOWNLOAD_HELPERS; `updateProgress.ts` reads them live, results ignore them.
export const STEP_PREFIX = "OCSTEP: "
export const PROGRESS_PREFIX = "OCPROGRESS: "

function nonEmptyLines(output: string) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith(STEP_PREFIX) && !line.startsWith(PROGRESS_PREFIX))
}

// The update scripts catch their own errors, print the message on an OCERR line, and exit 1.
const SCRIPT_ERROR_PREFIX = "OCERR: "

export function scriptError(output: string) {
  return nonEmptyLines(output)
    .filter((line) => line.startsWith(SCRIPT_ERROR_PREFIX))
    .at(-1)
    ?.slice(SCRIPT_ERROR_PREFIX.length)
}

export function parseDesktopCheckOutput(
  output: string,
  label = "Claude Desktop",
  extraMessages: string[] = [],
): DesktopCheckParse {
  const lines = nonEmptyLines(output)
  for (const line of lines) {
    const match = line.match(/^UPDATE\s+(\S+)\s+(\S+)\s*$/)
    if (!match) continue
    const oldVersion = match[1]
    const newVersion = match[2]
    if (compareDesktopVersions(newVersion, oldVersion) <= 0) {
      return { ok: true, upToDate: true, version: oldVersion }
    }
    return { ok: true, upToDate: false, oldVersion, newVersion }
  }
  const upToDate = new RegExp(`^${escapeRegExp(label)} is up to date \\(([^)]+)\\)`)
  for (const line of lines) {
    const match = line.match(upToDate)
    if (match) return { ok: true, upToDate: true, version: match[1] }
  }
  const notInstalled = `${label} not installed`
  for (const line of lines) {
    if (line.includes(notInstalled)) return { ok: false, message: notInstalled, notInstalled: true }
    for (const message of extraMessages) {
      if (line.includes(message)) return { ok: false, message }
    }
  }
  return {
    ok: false,
    message: scriptError(output) ?? lines.at(-1) ?? `${label} check produced no output`,
  }
}

export function parseDesktopInstallOutput(output: string, label = "Claude Desktop"): { ok: boolean; message: string } {
  const lines = nonEmptyLines(output)
  const updated = new RegExp(`^Updated ${escapeRegExp(label)} \\S+ -> \\S+`)
  for (const line of lines) {
    if (updated.test(line)) return { ok: true, message: line }
  }
  return {
    ok: false,
    message: scriptError(output) ?? lines.at(-1) ?? `${label} install produced no output`,
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export const GET_MSIX_IDENTITY = String.raw`
function Get-MsixIdentity {
  param([string]$Path)
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($Path)
  try {
    $entry = $zip.Entries | Where-Object { $_.FullName -eq "AppxManifest.xml" } | Select-Object -First 1
    if (-not $entry) { throw "AppxManifest.xml not found in package" }
    $reader = New-Object System.IO.StreamReader($entry.Open())
    try { [xml]$manifest = $reader.ReadToEnd() }
    finally { $reader.Dispose() }
    return [pscustomobject]@{ Name = [string]$manifest.Package.Identity.Name; Version = [version]$manifest.Package.Identity.Version; Publisher = [string]$manifest.Package.Identity.Publisher }
  } finally { $zip.Dispose() }
}
`

// Write-OcStep names the current phase (downloading, verifying, installing; text after the first
// word is detail). Save-Download streams the file with HttpClient so it can print OCPROGRESS
// "<received> <total>" lines (total 0 when the server sends no length): on each whole percent at
// most every 200 ms, else every second. AllowHost, when given, checks the final host after
// redirects before the body is read. Both write straight to stdout: Write-Output inside a function
// would become its return value.
export const DOWNLOAD_HELPERS = String.raw`
function Write-OcStep {
  param([string]$Step)
  [Console]::Out.WriteLine("OCSTEP: $Step")
  [Console]::Out.Flush()
}

function Save-Download {
  param([string]$Uri, [string]$OutFile, [scriptblock]$AllowHost)
  Write-OcStep "downloading"
  Add-Type -AssemblyName System.Net.Http
  $client = New-Object System.Net.Http.HttpClient
  # The default 100 s limit could cut a large download on a slow link; the caller's 10 min kill bounds it.
  $client.Timeout = [System.Threading.Timeout]::InfiniteTimeSpan
  $response = $null
  try {
    try { $response = $client.GetAsync($Uri, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult() }
    catch { throw "Download failed: $($_.Exception.GetBaseException().Message)" }
    if (-not $response.IsSuccessStatusCode) { throw "Download failed: HTTP $([int]$response.StatusCode)" }
    $finalHost = $response.RequestMessage.RequestUri.Host
    if ($AllowHost -and -not (& $AllowHost $finalHost)) { throw "Download redirected to unexpected host '$finalHost'" }
    $total = [long]$response.Content.Headers.ContentLength
    $source = $null
    $target = $null
    try {
      $source = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
      $target = [System.IO.File]::Create($OutFile)
      $buffer = New-Object byte[] 81920
      $received = [long]0
      $lastPercent = -1
      $lastMs = [long]0
      $clock = [System.Diagnostics.Stopwatch]::StartNew()
      [Console]::Out.WriteLine("OCPROGRESS: 0 $total")
      while (($read = $source.Read($buffer, 0, $buffer.Length)) -gt 0) {
        $target.Write($buffer, 0, $read)
        $received += $read
        $ms = $clock.ElapsedMilliseconds
        $percent = if ($total -gt 0) { [int][Math]::Floor(100 * $received / $total) } else { -1 }
        if (($percent -ne $lastPercent -and $ms - $lastMs -ge 200) -or $ms - $lastMs -ge 1000) {
          [Console]::Out.WriteLine("OCPROGRESS: $received $total")
          [Console]::Out.Flush()
          $lastPercent = $percent
          $lastMs = $ms
        }
      }
      [Console]::Out.WriteLine("OCPROGRESS: $received $total")
      [Console]::Out.Flush()
    } catch { throw "Download failed: $($_.Exception.GetBaseException().Message)" }
    finally {
      if ($target) { $target.Dispose() }
      if ($source) { $source.Dispose() }
    }
  } finally {
    if ($response) { $response.Dispose() }
    $client.Dispose()
  }
}
`

export async function runDesktopCheck(input: {
  key: string
  label: string
  script: string
  extraMessages?: string[]
}): Promise<DesktopCheckResult> {
  if (inflight.has(input.key)) {
    return { ok: false, alreadyRunning: true, message: `${input.label} check already running` }
  }
  inflight.add(input.key)
  try {
    const result = await runPowershell(input.script)
    if (!result.ok && !scriptError(result.output)) {
      return {
        ok: false,
        alreadyRunning: false,
        message: `Failed to check ${input.label}: ${failureDetail(result)}`,
      }
    }
    const parsed = parseDesktopCheckOutput(result.output, input.label, input.extraMessages)
    if (!parsed.ok) {
      const message = `Failed to check ${input.label}: ${parsed.message}`
      return parsed.notInstalled
        ? { ok: false, alreadyRunning: false, message, notInstalled: true }
        : { ok: false, alreadyRunning: false, message }
    }
    if (parsed.upToDate) {
      return {
        ok: true,
        alreadyRunning: false,
        upToDate: true,
        version: parsed.version,
        message: `${input.label} is up to date (${parsed.version})`,
      }
    }
    return {
      ok: true,
      alreadyRunning: false,
      upToDate: false,
      oldVersion: parsed.oldVersion,
      newVersion: parsed.newVersion,
      message: `${input.label} update available: ${parsed.oldVersion} -> ${parsed.newVersion}`,
    }
  } finally {
    inflight.delete(input.key)
  }
}

export async function runDesktopInstall(input: {
  key: string
  label: string
  script: string
  onLine?: (line: string) => void
}): Promise<DesktopInstallResult> {
  if (inflight.has(input.key)) {
    return { ok: false, alreadyRunning: true, message: `${input.label} update already running` }
  }
  inflight.add(input.key)
  try {
    const result = await runPowershell(input.script, input.onLine)
    if (!result.ok && !scriptError(result.output)) {
      return {
        ok: false,
        alreadyRunning: false,
        message: `Failed to update ${input.label}: ${failureDetail(result)}`,
      }
    }
    const parsed = parseDesktopInstallOutput(result.output, input.label)
    if (!parsed.ok) {
      return { ok: false, alreadyRunning: false, message: `Failed to update ${input.label}: ${parsed.message}` }
    }
    return { ok: true, alreadyRunning: false, message: parsed.message }
  } finally {
    inflight.delete(input.key)
  }
}

// A PSModulePath inherited from PowerShell 7 makes Windows PowerShell 5.1 load 7's
// Microsoft.PowerShell.Security, which fails ("AuditToString is already present") and breaks
// Get-AuthenticodeSignature. Without the variable, 5.1 builds its own default path.
export function windowsPowershellEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => key.toLowerCase() !== "psmodulepath"))
}

function runPowershell(script: string, onLine?: (line: string) => void) {
  return runCliCommand(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    undefined,
    windowsPowershellEnv(),
    onLine,
  )
}

// A script killed mid-download ends on a progress line, which says nothing about the failure.
function failureDetail(result: CliCommandResult) {
  return nonEmptyLines(result.output).at(-1) || result.error || `exit code ${result.code}`
}

export function expectedVersionAssignment(version?: string) {
  if (!version || !/^\d+(\.\d+){1,3}$/.test(version)) return '$ExpectedVersion = ""'
  return `$ExpectedVersion = "${version}"`
}

// Fixed script modeled on Anthropic's Install-Claude.ps1, trimmed to user scope:
// highest Claude_pzs8sxrjxfjjc package, official latest-release redirect pinned to
// downloads.claude.ai, skip when current, Authenticode Valid with the signer subject equal
// to the manifest publisher, plus publisher family-hash pin, install with
// -ForceApplicationShutdown, temp dir removed in finally. Errors go to an OCERR line and
// exit 1 (trap). No user input is interpolated; the check/install mode is selected by the
// $CheckOnly prefix line only.
const DESKTOP_SCRIPT = String.raw`
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
trap { Write-Output "OCERR: $($_.Exception.Message)"; exit 1 }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$PublisherId = "pzs8sxrjxfjjc"
$PackageFamilyName = "Claude_$PublisherId"

function Get-InstalledClaudeVersion {
  $pkgs = Get-AppxPackage -Name Claude -ErrorAction SilentlyContinue | Where-Object { $_.PackageFamilyName -eq $PackageFamilyName }
  if (-not $pkgs) { return $null }
  return ($pkgs | ForEach-Object { [version]$_.Version } | Sort-Object -Descending | Select-Object -First 1)
}

function Get-MsixPublisherId {
  param([string]$Publisher)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { $hash = $sha.ComputeHash([System.Text.Encoding]::Unicode.GetBytes($Publisher)) }
  finally { $sha.Dispose() }
  $bits = ""
  foreach ($b in $hash[0..7]) { $bits += [Convert]::ToString($b, 2).PadLeft(8, "0") }
  $bits += "0"
  $alphabet = "0123456789abcdefghjkmnpqrstvwxyz"
  $out = ""
  for ($i = 0; $i -lt 65; $i += 5) { $out += $alphabet[[Convert]::ToInt32($bits.Substring($i, 5), 2)] }
  return $out
}

${GET_MSIX_IDENTITY}
${DOWNLOAD_HELPERS}

$installed = Get-InstalledClaudeVersion
if (-not $installed) { throw "Claude Desktop not installed" }

$arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
$redirect = "https://claude.ai/api/desktop/win32/$arch/msix/latest/redirect"
$request = [System.Net.WebRequest]::Create($redirect)
$request.Method = "GET"
$request.AllowAutoRedirect = $false
$response = $request.GetResponse()
try { $location = $response.Headers["Location"] }
finally { $response.Close() }
if (-not $location) { throw "Update check failed: no redirect from $redirect" }
$target = [uri]$location
if ($target.Scheme -ne "https" -or $target.Host -ne "downloads.claude.ai") { throw "Update check failed: unexpected redirect target '$location'" }
$latest = $null
if ($location -match "/(\d+(?:\.\d+){1,3})/[^/]*\.msix") { $latest = [version]$Matches[1] }
if (-not $latest) { throw "Update check failed: no version in redirect target" }

if ($ExpectedVersion -and [string]$latest -ne $ExpectedVersion) {
  throw "Latest version changed ($latest, expected $ExpectedVersion); confirm again"
}
if ($latest -le $installed) {
  Write-Output "Claude Desktop is up to date ($installed)"
  exit 0
}
if ($CheckOnly) {
  Write-Output "UPDATE $installed $latest"
  exit 0
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("claude-desktop-update-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  $file = Join-Path $tmp "Claude.msix"
  Save-Download -Uri $location -OutFile $file
  Write-OcStep "verifying"
  $sig = Get-AuthenticodeSignature -FilePath $file
  if ($sig.Status -ne "Valid") { throw "Signature check failed: $($sig.Status)" }
  $identity = Get-MsixIdentity -Path $file
  if ($sig.SignerCertificate.Subject -ne $identity.Publisher) {
    throw "Signer '$($sig.SignerCertificate.Subject)' does not match package publisher '$($identity.Publisher)'"
  }
  if ((Get-MsixPublisherId -Publisher $identity.Publisher) -ne $PublisherId) {
    throw "Package publisher '$($identity.Publisher)' is not Claude's expected publisher"
  }
  if ($identity.Version -le $installed) { throw "Downloaded package is not newer ($($identity.Version))" }
  Write-OcStep "installing"
  try { Add-AppxPackage -Path $file -ForceApplicationShutdown }
  catch { throw "Install failed: $($_.Exception.Message)" }
  $after = Get-InstalledClaudeVersion
  if (-not $after) { throw "Install finished but Claude Desktop was not found" }
  Write-Output "Updated Claude Desktop $installed -> $after"
} finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
`

function desktopScript(checkOnly: boolean, expectedVersion?: string) {
  const prefix = `${checkOnly ? "$CheckOnly = $true" : "$CheckOnly = $false"}\n${expectedVersionAssignment(expectedVersion)}`
  return `${prefix}\n${DESKTOP_SCRIPT}`
}

const CLAUDE_KEY = "claude-desktop"

export async function checkClaudeDesktop(): Promise<DesktopCheckResult> {
  return runDesktopCheck({ key: CLAUDE_KEY, label: "Claude Desktop", script: desktopScript(true) })
}

export async function installClaudeDesktop(
  expectedVersion: string,
  onLine?: (line: string) => void,
): Promise<DesktopInstallResult> {
  if (!/^\d+(\.\d+){1,3}$/.test(expectedVersion)) {
    return { ok: false, alreadyRunning: false, message: "Confirmed version is invalid" }
  }
  return runDesktopInstall({
    key: CLAUDE_KEY,
    label: "Claude Desktop",
    script: desktopScript(false, expectedVersion),
    onLine,
  })
}
