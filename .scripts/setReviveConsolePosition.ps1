# Saves a centered WindowPosition for the revive console windows (HKCU\Console\<title>).
# Run in a plain console window (not WezTerm); rerun after a resolution change.
$ErrorActionPreference = 'Stop'
Add-Type -Namespace Revive -Name Win -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
[DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
[DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
public struct RECT { public int Left, Top, Right, Bottom; }
'@
if (-not [Revive.Win]::SetProcessDpiAwarenessContext([IntPtr]-4)) { throw 'SetProcessDpiAwarenessContext failed.' }
$consoleWindow = [Revive.Win]::GetConsoleWindow()
if ($consoleWindow -eq [IntPtr]::Zero) { throw 'GetConsoleWindow returned no window.' }
$rect = New-Object Revive.Win+RECT
if (-not [Revive.Win]::GetWindowRect($consoleWindow, [ref]$rect)) { throw 'GetWindowRect failed.' }
$x = [int](([Revive.Win]::GetSystemMetrics(0) - ($rect.Right - $rect.Left)) / 2)
$y = [int](([Revive.Win]::GetSystemMetrics(1) - ($rect.Bottom - $rect.Top)) / 2)
foreach ($title in 'revive', 'reviveAndInstall') {
    $key = "HKCU:\Console\$title"
    New-Item -Path $key -Force | Out-Null
    Set-ItemProperty -LiteralPath $key -Name WindowPosition -Type DWord -Value (($y -shl 16) -bor $x)
}
Write-Host "Saved revive console position $x,$y"
