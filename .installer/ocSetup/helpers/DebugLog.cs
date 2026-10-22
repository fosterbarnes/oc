using System.IO;

namespace OcSetup.Helpers;

// WIP: temp debug logging for the VM crash investigation; remove once ocSetup is stable.
// Appends timestamped lines to %TEMP%\ocSetup-debug.log.
public static class DebugLog
{
    public static readonly string FilePath = Path.Combine(Path.GetTempPath(), "ocSetup-debug.log");
    private static readonly object _lock = new();

    public static void Write(string message)
    {
        var line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} [{Environment.CurrentManagedThreadId}] {message}{Environment.NewLine}";
        lock (_lock) File.AppendAllText(FilePath, line);
    }
}
