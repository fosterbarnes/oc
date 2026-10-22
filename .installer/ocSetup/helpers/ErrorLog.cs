using System.IO;

namespace OcSetup.Helpers;

// Crashes and errors the window swallows (shortcut retargeting) go to %TEMP%\ocSetup-error.log.
public static class ErrorLog
{
    public static readonly string FilePath = Path.Combine(Path.GetTempPath(), "ocSetup-error.log");
    private static readonly object _lock = new();

    public static void Write(string message)
    {
        var line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} {message}{Environment.NewLine}";
        lock (_lock) File.AppendAllText(FilePath, line);
    }
}
