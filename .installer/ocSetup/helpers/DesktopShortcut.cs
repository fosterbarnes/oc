using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
using OcSetup.Models;

namespace OcSetup.Helpers;

// Creates `Desktop\<name>.lnk` for a dependency row through IShellLinkW.
public static class DesktopShortcut
{
    private static readonly string _userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);

    /// <summary>
    /// Creates the shortcut; false when a file with that name is already on the desktop (a vendor's
    /// or the user's, never overwritten). CLI rows run in PowerShell inside WezTerm when it is
    /// installed, so the window stays open after the CLI exits. Throws when the row has no target.
    /// </summary>
    public static bool Create(DependencyShortcut shortcut, string? weztermGui, string? pwsh)
    {
        var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        var path = Path.Combine(desktop, $"{shortcut.Name}.lnk");
        if (File.Exists(path)) return false;

        var link = (IShellLinkW)new ShellLink();
        try
        {
            if (shortcut.AppId is { } appId) SetAppsFolderItem(link, appId);
            else if (shortcut.Target is null) throw new InvalidOperationException("not installed");
            else if (shortcut.Terminal) SetTerminal(link, shortcut.Target, weztermGui, pwsh);
            else SetExe(link, shortcut.Target, shortcut.Target, "");

            ((IPersistFile)link).Save(path, true);
            return true;
        }
        finally
        {
            Marshal.ReleaseComObject(link);
        }
    }

    private static void SetExe(IShellLinkW link, string exe, string icon, string arguments)
    {
        link.SetPath(exe);
        link.SetArguments(arguments);
        link.SetWorkingDirectory(_userProfile);
        link.SetIconLocation(icon, 0);
    }

    private static void SetTerminal(IShellLinkW link, string cli, string? weztermGui, string? pwsh)
    {
        var shell = pwsh ?? "powershell.exe";
        var run = $"-NoLogo -NoExit -Command \"& '{cli.Replace("'", "''")}'\"";
        if (weztermGui is null) SetExe(link, shell, shell, run);
        else SetExe(link, weztermGui, weztermGui, $"start -- \"{shell}\" {run}");
    }

    // Same link as dragging the app out of Start: Windows supplies its icon and launch.
    private static void SetAppsFolderItem(IShellLinkW link, string appId)
    {
        var result = SHParseDisplayName($@"shell:AppsFolder\{appId}", IntPtr.Zero, out var pidl, 0, out _);
        if (result != 0) throw new InvalidOperationException("app not registered for this user");
        try { link.SetIDList(pidl); }
        finally { Marshal.FreeCoTaskMem(pidl); }
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SHParseDisplayName(string name, IntPtr bindingContext, out IntPtr pidl, uint sfgaoIn, out uint sfgaoOut);

    [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
    private class ShellLink;

    // Full vtable order of IShellLinkW; only the setters are used.
    [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellLinkW
    {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder file, int size, IntPtr findData, uint flags);
        void GetIDList(out IntPtr pidl);
        void SetIDList(IntPtr pidl);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder name, int size);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string name);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder dir, int size);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string dir);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder args, int size);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string args);
        void GetHotkey(out short hotkey);
        void SetHotkey(short hotkey);
        void GetShowCmd(out int showCmd);
        void SetShowCmd(int showCmd);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder iconPath, int size, out int index);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string iconPath, int index);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string relativePath, uint reserved);
        void Resolve(IntPtr hwnd, uint flags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string file);
    }
}
