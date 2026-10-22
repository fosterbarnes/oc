using System.Diagnostics;
using System.IO;

namespace OcSetup.Helpers;

// Starts oc (inside WezTerm when it is installed) and points the setup's oc shortcuts at WezTerm.
public static class OcLauncher
{
    // The setup's shortcuts: Start menu (per-user install) and the optional desktop icon.
    private static readonly string[] _shortcutPaths =
    [
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "oc.lnk"),
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "oc.lnk"),
    ];

    /// <summary>wezterm-gui.exe next to the detected wezterm.exe, or null.</summary>
    public static string? WezTermGui(string? weztermPath)
    {
        if (string.IsNullOrEmpty(weztermPath)) return null;
        var gui = Path.Combine(Path.GetDirectoryName(weztermPath) ?? "", "wezterm-gui.exe");
        return File.Exists(gui) ? gui : null;
    }

    /// <summary>
    /// Retargets the oc shortcuts to `wezterm-gui.exe start -- oc.exe`. Only shortcuts that still
    /// point at this oc.exe or at WezTerm are touched, so a user-edited shortcut stays as it is.
    /// </summary>
    public static void UseWezTermForShortcuts(string weztermGui, string ocExe)
    {
        var shellType = Type.GetTypeFromProgID("WScript.Shell") ?? throw new InvalidOperationException("WScript.Shell is unavailable.");
        dynamic shell = Activator.CreateInstance(shellType)!;
        foreach (var path in _shortcutPaths.Where(File.Exists))
        {
            dynamic link = shell.CreateShortcut(path);
            string target = link.TargetPath;
            var ours = string.Equals(target, ocExe, StringComparison.OrdinalIgnoreCase)
                || string.Equals(target, weztermGui, StringComparison.OrdinalIgnoreCase);
            if (!ours) continue;
            link.TargetPath = weztermGui;
            link.Arguments = $"start -- \"{ocExe}\"";
            link.WorkingDirectory = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            link.IconLocation = $"{ocExe},0";
            link.Save();
        }
    }

    /// <summary>
    /// Opens oc in a new window with PATH fresh from the registry.
    /// </summary>
    public static void Open(string ocExe, string? weztermGui)
    {
        var startInfo = weztermGui is null
            ? new ProcessStartInfo(ocExe)
            : new ProcessStartInfo(weztermGui) { ArgumentList = { "start", "--", ocExe } };
        startInfo.UseShellExecute = false;
        startInfo.WorkingDirectory = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        startInfo.Environment["Path"] = FreshPath.Read();
        Process.Start(startInfo)?.Dispose();
    }
}
