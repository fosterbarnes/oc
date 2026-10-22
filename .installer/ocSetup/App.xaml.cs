using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using OcSetup.Helpers;

namespace OcSetup;

public partial class App : Application
{
    // WIP: temp debug logging. Every unhandled exception is logged and shown before the app exits.
    // Static constructor: runs before App.xaml's resources load, so theme parse errors are caught too.
    static App()
    {
        DebugLog.Write($"--- start: {Environment.ProcessPath} | base {AppContext.BaseDirectory} | {Environment.OSVersion} | .NET {Environment.Version}");
        AppDomain.CurrentDomain.UnhandledException += (_, args) => Crash("appdomain", args.ExceptionObject as Exception);
        TaskScheduler.UnobservedTaskException += (_, args) => DebugLog.Write($"unobserved task: {args.Exception}");
    }

    protected override void OnStartup(StartupEventArgs e)
    {
        DebugLog.Write("OnStartup");
        DispatcherUnhandledException += (_, args) => Crash("dispatcher", args.Exception);
        // GPU text rendering garbled the tags in a VMware VM (a "Default" tag drew "Missing").
        // This small static window gains nothing from hardware rendering.
        RenderOptions.ProcessRenderMode = RenderMode.SoftwareOnly;
        base.OnStartup(e);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        DebugLog.Write($"--- exit code {e.ApplicationExitCode}");
        base.OnExit(e);
    }

    private static void Crash(string source, Exception? exception)
    {
        DebugLog.Write($"CRASH ({source}): {exception}");
        MessageBox.Show($"ocSetup crashed ({source}):\n\n{exception?.Message}\n\nLog: {DebugLog.FilePath}", "oc dependencies",
            MessageBoxButton.OK, MessageBoxImage.Error);
    }
}
