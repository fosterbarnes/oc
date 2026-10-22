#requires -Version 7.0
[CmdletBinding()]
param([Alias('h')][switch]$Help)

$ErrorActionPreference = 'Stop'
if ($Help) {
    Write-Host @'
Usage: buildInstaller.ps1 [-h]

Builds the oc setup exe into .installer\Output from the dist binaries and removes older setup
exes there. ocSetup.exe is published self-contained (it bundles .NET), so the setup needs
nothing preinstalled.
Run .scripts\build.ps1 -Release first.
'@
    return
}
. "$PSScriptRoot\scriptHelper.ps1"

$appVersion = requireVersion

# Inno Setup 6.7 or newer: the installer script uses WizardBackColor, which 6.7 added.
$innoUninstallKey = 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1'
$innoKey = Get-ItemProperty -LiteralPath $innoUninstallKey -ErrorAction SilentlyContinue
$isccPath = (Get-Command ISCC.exe -ErrorAction SilentlyContinue)?.Source
$isccFromPath = [bool]$isccPath
if (-not $isccPath -and $innoKey.InstallLocation) { $isccPath = Join-Path $innoKey.InstallLocation 'ISCC.exe' }
if (-not $isccPath) { $isccPath = 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe' }
if (-not (Test-Path -LiteralPath $isccPath -PathType Leaf)) { throw "Inno Setup compiler not found: $isccPath" }
if ($innoKey) {
    $innoVersion = [version]$innoKey.DisplayVersion
    if ($innoVersion -lt [version]'6.7') { throw "Inno Setup $innoVersion is older than 6.7; update it (see plan section 0)" }
} elseif ($isccFromPath) {
    Write-Host "Inno Setup uninstall key is missing; skipping the version check for ISCC on PATH."
} else {
    throw "Cannot verify the Inno Setup version: $innoUninstallKey is missing. Install Inno Setup 6.7 or newer (see plan section 0)."
}

$ocBin = "$distFolder\opencode-windows-x64\bin"
$nativeBin = "$distFolder\opencode-native-windows-x64\bin"
foreach ($required in @("$ocBin\oc.exe", "$ocBin\cursor-runtime", "$nativeBin\opencode.exe")) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Missing $required. Run .scripts\build.ps1 -Release first." }
}

# Wizard images are generated from the committed icon once and kept in the gitignored images folder.
$imagesFolder = "$installerFolder\images"
$wizardLargePng = "$imagesFolder\installer-wizard-large.png"
$wizardSmallPng = "$imagesFolder\installer-wizard-small.png"
if (-not (Test-Path -LiteralPath $wizardLargePng) -or -not (Test-Path -LiteralPath $wizardSmallPng)) {
    if (-not (Get-Command magick -ErrorAction SilentlyContinue)) { throw 'ImageMagick (magick) is not on PATH; it is needed to create the wizard images.' }
    New-Item -ItemType Directory -Path $imagesFolder -Force | Out-Null
    $iconPng = "$srcRoot\.res\icon256.png"
    runNativeCommand magick @($iconPng, '-resize', '256x256', $wizardSmallPng) 'ImageMagick wizard small resize'
    runNativeCommand magick @($iconPng, '-background', 'black', '-gravity', 'center', '-resize', '240x459', '-extent', '240x459', $wizardLargePng) 'ImageMagick wizard large resize'
}

New-Item -ItemType Directory -Path $installerOutput -Force | Out-Null
$isccDefines = @(
    "/DAppVersion=$appVersion"
    "/DOcBin=$($ocBin -replace '\\','/')"
    "/DNativeBin=$($nativeBin -replace '\\','/')"
    "/DSetupIconFile=$($srcRoot -replace '\\','/')/.res/icon.ico"
    "/DWizardImageFile=$($wizardLargePng -replace '\\','/')"
    "/DWizardSmallImageFile=$($wizardSmallPng -replace '\\','/')"
    "/DLicenseFile=$($repoRoot -replace '\\','/')/LICENSE"
)

$publishFolder = "$installerFolder\publish"
runNativeCommand dotnet @(
    'publish', "$installerFolder\ocSetup\ocSetup.csproj", '-c', 'Release', '-r', 'win-x64', '-o', $publishFolder,
    '--self-contained', 'true', '-p:PublishSingleFile=true', '-p:IncludeNativeLibrariesForSelfExtract=true',
    '-p:EnableCompressionInSingleFile=true'
) 'dotnet publish ocSetup'
$isccArgs = @($isccDefines) + "/DOcSetupExe=$($publishFolder -replace '\\','/')/ocSetup.exe"
runNativeCommand $isccPath (@($isccArgs) + "$installerFolder\oc.installer.iss") 'ISCC'

# Only after a successful build: pushRelease.ps1 uploads every exe in Output.
$setupName = "oc_v${appVersion}_windows-x64-setup.exe"
foreach ($oldSetup in Get-ChildItem -LiteralPath $installerOutput -File -Filter 'oc_v*_windows-x64-setup.exe') {
    if ($oldSetup.Name -eq $setupName) { continue }
    Remove-Item -LiteralPath $oldSetup.FullName -Force
    if (Test-Path -LiteralPath $oldSetup.FullName) { throw "Could not remove old setup $($oldSetup.FullName)" }
    Write-Host "Removed old setup $($oldSetup.Name)"
}

closeOut 3
