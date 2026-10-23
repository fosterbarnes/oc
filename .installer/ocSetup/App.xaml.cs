using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using OcSetup.Helpers;

namespace OcSetup;

public partial class App : Application
{
    // Every unhandled exception is logged and shown before the app exits. Static constructor: runs
    // before App.xaml's resources load, so theme parse errors are caught too.
    static App()
    {
        AppDomain.CurrentDomain.UnhandledException += (_, args) => Crash("appdomain", args.ExceptionObject as Exception);
        TaskScheduler.UnobservedTaskException += (_, args) => ErrorLog.Write($"unobserved task: {args.Exception}");
        // Every tooltip opens after 100 ms instead of the system hover time (about 400 ms). Must run
        // before any element reads the property, which seals its metadata.
        ToolTipService.InitialShowDelayProperty.OverrideMetadata(typeof(FrameworkElement),
            new FrameworkPropertyMetadata(100));
        // Animations (indeterminate progress bars, loading dots) at 20 fps: software rendering
        // (OnStartup) draws every frame on the CPU, and 60 fps progress bars delayed the UI thread
        // by up to ~380 ms every ~2 s on a VM.
        Timeline.DesiredFrameRateProperty.OverrideMetadata(typeof(Timeline),
            new FrameworkPropertyMetadata { DefaultValue = 20 });
    }

    protected override void OnStartup(StartupEventArgs e)
    {
        DispatcherUnhandledException += (_, args) => Crash("dispatcher", args.Exception);
        // GPU text rendering garbled the tags in a VMware VM (a "Default" tag drew "Missing").
        // This small static window gains nothing from hardware rendering.
        RenderOptions.ProcessRenderMode = RenderMode.SoftwareOnly;
        base.OnStartup(e);
    }

    private static void Crash(string source, Exception? exception)
    {
        ErrorLog.Write($"CRASH ({source}): {exception}");
        MessageBox.Show($"ocSetup crashed ({source}):\n\n{exception?.Message}\n\nLog: {ErrorLog.FilePath}", "oc Dependency Installer",
            MessageBoxButton.OK, MessageBoxImage.Error);
    }
}
