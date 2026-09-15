param(
  [ValidateSet("x64", "arm64")]
  [string] $Architecture = "x64",
  [Parameter(Mandatory = $true)]
  [string] $Output
)

$ErrorActionPreference = "Stop"
$source = Join-Path $PSScriptRoot "process-tree-supervisor.cpp"
$outputDirectory = Split-Path -Parent $Output
if (-not (Test-Path -LiteralPath $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}
$object = Join-Path $outputDirectory "process-tree-supervisor.obj"
$platform = if ($Architecture -eq "arm64") { "ARM64" } else { "x64" }
$vsdevCandidates = @(
  "C:\Program Files\Microsoft Visual Studio\18\Community\Common7\Tools\VsDevCmd.bat",
  "C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat",
  "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe"
)
$vsdev = $vsdevCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $vsdev) { throw "Visual Studio developer command file was not found" }
if ($vsdev.EndsWith("vswhere.exe")) {
  $installation = & $vsdev -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  if (-not $installation) { throw "Visual Studio installation with MSVC was not found" }
  $vsdev = Join-Path $installation "Common7\Tools\VsDevCmd.bat"
}
$command = 'call "' + $vsdev + '" -arch=' + $Architecture + ' -host_arch=x64 && cl.exe /nologo /std:c++17 /O2 /EHsc /DUNICODE /D_UNICODE "' + $source + '" /Fo:"' + $object + '" /Fe:"' + $Output + '" /link /SUBSYSTEM:WINDOWS /ENTRY:wWinMainCRTStartup /MACHINE:' + $platform + ' shell32.lib kernel32.lib user32.lib'
& cmd.exe /d /s /c $command
if ($LASTEXITCODE -ne 0) { throw "MSVC failed with exit code $LASTEXITCODE" }
if (Test-Path -LiteralPath $object) { Remove-Item -LiteralPath $object -Force }
