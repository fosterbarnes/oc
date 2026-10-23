using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Windows;
using OcSetup.Helpers;
using OcSetup.Models;
using OcSetup.ViewModels;

namespace OcSetup.Windows;

public partial class MainWindow : Window
{
    private static readonly string _ocPath = Path.Combine(AppContext.BaseDirectory, "oc.exe");
    // `ocSetup.exe --dev <command...>` (.scripts\.runCompanion.ps1): the engine is that command
    // instead of `oc.exe oc deps`, and nothing outside the window is written (shortcut retarget,
    // desktop shortcuts) or started (oc). The two always go together.
    private static readonly string[] _devEngine =
        Environment.GetCommandLineArgs() is [_, "--dev", _, ..] commandLine ? commandLine[2..] : [];
    private static readonly bool _isDev = _devEngine.Length > 0;
    private static readonly string[] _engine = _isDev ? _devEngine : [_ocPath, "oc", "deps"];
    // How long engine output is still read after the engine exits (see RunEngineAsync).
    private const int _DRAIN_MS = 2000;
    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    // Failure text from the last install run, kept on rows after the list reloads.
    private readonly Dictionary<string, string> _runFailures = [];
    private readonly List<string> _runInstalled = [];
    private string? _weztermGui;
    private IReadOnlyList<DependencyRow> _rows = [];
    private bool _isRunning;
    // The current list load: Install stays disabled while it runs and Open oc awaits it.
    private Task _loadTask = Task.CompletedTask;
    private bool _isLoading;

    public MainWindow()
    {
        InitializeComponent();
        SourceInitialized += (_, _) => WindowsTitleBarTheme.ApplyImmersiveDarkMode(this);

        if (_isDev) Title += " (dev)";

        // Started here rather than on Loaded so the check overlaps building the window.
        if (File.Exists(_engine[0])) _loadTask = LoadRowsAsync();
        else StatusText.Text = _isDev ? $"Engine not found: {_engine[0]}" : "oc.exe not found next to ocSetup.exe";
    }

    // Awaited here so an exception from the first load still reaches the dispatcher handler.
    private async void Window_Loaded(object sender, RoutedEventArgs e) => await _loadTask;

    // Closing is the only path for both the X button and Close. The install process is not
    // killed: it may be in the middle of an installer.
    private void Window_Closing(object? sender, CancelEventArgs e)
    {
        if (!_isRunning) return;

        e.Cancel = MessageBox.Show(this, "An install is still running. Close anyway?", Title,
            MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes;
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e) => Close();

    private async void InstallButton_Click(object sender, RoutedEventArgs e)
    {
        var ids = _rows.Where(row => row.IsChecked).Select(row => row.Id).ToArray();
        var shortcutIds = _rows.Where(row => row.WantsShortcut).Select(row => row.Id).ToArray();
        _runFailures.Clear();
        _runInstalled.Clear();

        var installed = true;
        if (ids.Length > 0)
        {
            SetRunning(true);
            var (exitCode, _) = await RunEngineAsync(HandleInstallLine, ["install", .. ids]);
            SetRunning(false);
            installed = exitCode == 0;
        }

        if (shortcutIds.Length == 0)
        {
            // The summary comes from the install events; the list refreshes behind it.
            ShowDone(installed, ids.Length > 0, []);
            _loadTask = LoadRowsAsync();
            await _loadTask;
            return;
        }

        // Rows installed just now only get their shortcut target from the reloaded list.
        if (ids.Length > 0)
        {
            _loadTask = LoadRowsAsync();
            await _loadTask;
        }
        var (created, shortcutLines) = CreateShortcuts(shortcutIds);
        ShowDone(installed && created, ids.Length > 0, shortcutLines);
    }

    // Creates the ticked shortcuts; false when one could not be made (an existing one is not a failure).
    private (bool Ok, List<string> Lines) CreateShortcuts(string[] ids)
    {
        if (_isDev)
        {
            var wanted = _rows.Where(row => ids.Contains(row.Id) && row.Item.Shortcut is not null).ToList();
            foreach (var row in wanted) row.WantsShortcut = false;
            return (true, [$"Desktop shortcuts not created (dev): {string.Join(", ", wanted.Select(row => row.Item.Shortcut!.Name))}"]);
        }

        var pwsh = _rows.FirstOrDefault(row => row.Id == "pwsh")?.Item.Shortcut?.Target;
        var created = new List<string>();
        var lines = new List<string>();
        var ok = true;
        foreach (var row in _rows.Where(row => ids.Contains(row.Id) && row.Item.Shortcut is not null))
        {
            var shortcut = row.Item.Shortcut!;
            try
            {
                if (DesktopShortcut.Create(shortcut, _weztermGui, pwsh)) created.Add(shortcut.Name);
                else lines.Add($"{shortcut.Name} shortcut: already on the desktop");
            }
            catch (Exception exception)
            {
                lines.Add($"{shortcut.Name} shortcut: {exception.Message}");
                ok = false;
            }
            row.WantsShortcut = false;
        }

        if (created.Count > 0) lines.Insert(0, $"Desktop shortcuts: {string.Join(", ", created)}");
        return (ok, lines);
    }

    private void ShowDone(bool ok, bool ranInstall, IEnumerable<string> shortcutLines)
    {
        DoneHeading.Text = ok ? "Setup complete" : "Setup finished with errors";
        var lines = new List<string>();
        if (_runInstalled.Count > 0) lines.Add($"Installed: {string.Join(", ", _runInstalled)}");
        lines.AddRange(_runFailures.Select(failure => $"{Label(failure.Key)}: {failure.Value}"));
        lines.AddRange(shortcutLines);
        if (ranInstall) lines.Add("Terminals that were already open need a restart to see the new PATH.");
        DoneDetails.Text = string.Join(Environment.NewLine, lines);
        SetDoneVisible(true);
    }

    private void SetDoneVisible(bool done)
    {
        DonePanel.Visibility = done ? Visibility.Visible : Visibility.Collapsed;
        ListPanel.Visibility = done ? Visibility.Collapsed : Visibility.Visible;
        BottomBar.Visibility = ListPanel.Visibility;
        StatusText.Text = "";
    }

    private void BackButton_Click(object sender, RoutedEventArgs e) => SetDoneVisible(false);

    // Waits for the post-install list so a just-installed WezTerm is used and the shortcuts point at it.
    private async void OpenOcButton_Click(object sender, RoutedEventArgs e)
    {
        OpenOcButton.IsEnabled = false;
        await _loadTask;
        if (!_isDev) OcLauncher.Open(_ocPath, _weztermGui);
        Close();
    }

    private string Label(string id) => _rows.FirstOrDefault(row => row.Id == id)?.Label ?? id;

    private async Task LoadRowsAsync()
    {
        _isLoading = true;
        LoadingDots.Visibility = Visibility.Visible;
        RefreshButtons();
        try { await ReadRowsAsync(); }
        finally
        {
            _isLoading = false;
            LoadingDots.Visibility = Visibility.Collapsed;
            RefreshButtons();
        }
    }

    // `list` prints the table (every row "checking") first, then one line per row as it is
    // detected. Rows stay busy until the last one: defaults and needs read the detected statuses.
    private async Task ReadRowsAsync()
    {
        StatusText.Text = "Checking dependencies";
        var hasTable = false;
        var (exitCode, error) = await RunEngineAsync(HandleListLine, ["list"]);

        if (exitCode != 0 || !hasTable || _rows.Any(row => row.IsChecking))
        {
            StatusText.Text = $"Could not read dependencies (exit {exitCode}). {error.Trim()}";
            return;
        }

        foreach (var row in _rows) row.IsBusy = false;
        // Set after Needed is wired so that checking a default row also checks its needs.
        foreach (var defaultRow in _rows.Where(candidate => candidate.DefaultChecked))
            defaultRow.IsChecked = true;
        StatusText.Text = "";

        // Once WezTerm is installed, oc's shortcuts open in it.
        var wezterm = _rows.FirstOrDefault(row => row.Id == "wezterm" && row.Item.Status == "found");
        _weztermGui = OcLauncher.WezTermGui(wezterm?.Item.Path);
        if (_weztermGui is null || _isDev) return;
        // Shortcut retargeting is a convenience; a COM or file error must not take the window down.
        try { OcLauncher.UseWezTermForShortcuts(_weztermGui, _ocPath); }
        catch (Exception exception) { ErrorLog.Write($"shortcut retarget failed: {exception}"); }

        void HandleListLine(string line)
        {
            if (line.StartsWith('['))
            {
                _rows = CreateRows(JsonSerializer.Deserialize<DependencyItem[]>(line, _jsonOptions) ?? []);
                RowsList.ItemsSource = _rows;
                ListHeader.Visibility = Visibility.Visible;
                hasTable = true;
            }
            else if (hasTable && line.StartsWith('{'))
            {
                var item = JsonSerializer.Deserialize<DependencyItem>(line, _jsonOptions)!;
                _rows.First(row => row.Id == item.Id).Update(item);
            }
        }
    }

    // Busy rows from the list's table line; ReadRowsAsync frees them and sets the defaults.
    private List<DependencyRow> CreateRows(DependencyItem[] items)
    {
        var rows = items.Select(item => new DependencyRow(item, _runFailures.GetValueOrDefault(item.Id)) { IsBusy = true })
            .ToList();

        foreach (var row in rows)
        {
            row.Needed = rows.Where(other => row.Item.Needs.Contains(other.Id)).ToList();
            row.PropertyChanged += (_, e) =>
            {
                if (e.PropertyName is nameof(DependencyRow.IsChecked) or nameof(DependencyRow.WantsShortcut))
                    RefreshButtons();
            };
        }

        return rows;
    }

    // Each event is one NDJSON line; non-JSON lines are skipped.
    private void HandleInstallLine(string line)
    {
        if (!line.StartsWith('{')) return;

        var install = JsonSerializer.Deserialize<InstallEvent>(line, _jsonOptions)!;
        var row = _rows.First(candidate => candidate.Id == install.Id);
        row.ApplyEvent(install);

        if (install.Phase is "failed" or "skipped") _runFailures[install.Id] = row.StatusText;
        if (install.Phase == "done") _runInstalled.Add(row.Label);
    }

    private void SetRunning(bool running)
    {
        _isRunning = running;
        foreach (var row in _rows) row.IsBusy = running;
        RefreshButtons();
    }

    private void RefreshButtons()
    {
        var installs = _rows.Any(row => row.IsChecked);
        InstallButton.Content = installs ? "Install selected" : "Create shortcuts";
        InstallButton.IsEnabled = !_isRunning && !_isLoading && (installs || _rows.Any(row => row.WantsShortcut));
        RefreshSelectAll();
    }

    // Checked when every tickable box is ticked, unchecked when none is, partly checked between.
    // Locked (required) rows are not tickable, so they never make it partly checked.
    private void RefreshSelectAll()
    {
        var installs = _rows.Where(row => row.CanCheck).ToList();
        var shortcuts = _rows.Where(row => row.CanShortcut).ToList();
        var total = installs.Count + shortcuts.Count;
        SelectAllBox.IsEnabled = !_isRunning && !_isLoading && total > 0;
        if (!SelectAllBox.IsEnabled) return;

        var ticked = installs.Count(row => row.IsChecked) + shortcuts.Count(row => row.WantsShortcut);
        SelectAllBox.IsChecked = ticked == 0 ? false : ticked == total ? true : null;
    }

    // A partly checked box clicks to checked (IsThreeState is off).
    private void SelectAllBox_Click(object sender, RoutedEventArgs e)
    {
        var select = SelectAllBox.IsChecked == true;
        foreach (var row in _rows.Where(row => row.CanCheck)) row.IsChecked = select;
        // After the installs: a missing row's shortcut box opens only once it is ticked.
        foreach (var row in _rows.Where(row => row.CanShortcut)) row.WantsShortcut = select;
    }

    // Runs the engine (`oc.exe oc deps` or the dev command) and returns its exit code and stderr.
    // Stdout lines go to onOutputLine on the UI thread, because the awaits resume on the dispatcher.
    private static async Task<(int ExitCode, string Error)> RunEngineAsync(
        Action<string> onOutputLine,
        string[] args)
    {
        var startInfo = new ProcessStartInfo(_engine[0])
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        foreach (var arg in _engine[1..].Concat(args)) startInfo.ArgumentList.Add(arg);
        // `list` detects with this PATH (the engine does not re-read it), so tools installed after
        // this window opened are found.
        startInfo.Environment["Path"] = FreshPath.Read();

        // Off the UI thread: the first start of a new oc.exe waited ~0.7 s on a VM (Defender scan),
        // and the first list starts from the constructor, before the first frame.
        using var process = await Task.Run(() => Process.Start(startInfo))
            ?? throw new InvalidOperationException($"{Path.GetFileName(_engine[0])} did not start.");
        var errorTask = process.StandardError.ReadToEndAsync();
        // The run ends when the engine exits, plus a short drain: what it wrote before exiting is
        // already in the pipe, while a process that inherited the pipe (started by an installer) can
        // keep it open long after. On a VM the window waited on the pipe and never showed the summary.
        var exitedAndDrained = process.WaitForExitAsync().ContinueWith(_ => Task.Delay(_DRAIN_MS)).Unwrap();
        while (true)
        {
            var read = process.StandardOutput.ReadLineAsync();
            if (await Task.WhenAny(read, exitedAndDrained) != read) break;
            if (await read is not { } line) break;
            onOutputLine(line);
        }

        await process.WaitForExitAsync();
        var error = await Task.WhenAny(errorTask, exitedAndDrained) == errorTask ? await errorTask : "";
        return (process.ExitCode, error);
    }
}
