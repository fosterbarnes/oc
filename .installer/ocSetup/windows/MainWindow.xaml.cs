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

    public MainWindow()
    {
        InitializeComponent();
        SourceInitialized += (_, _) => WindowsTitleBarTheme.ApplyImmersiveDarkMode(this);
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        DebugLog.Write($"window loaded; oc.exe exists: {File.Exists(_ocPath)}");
        if (!File.Exists(_ocPath))
        {
            StatusText.Text = "oc.exe not found next to ocSetup.exe";
            return;
        }

        await LoadRowsAsync();
    }

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
        DebugLog.Write($"install clicked: {string.Join(", ", ids)}");
        _runFailures.Clear();
        SetRunning(true);

        _runInstalled.Clear();
        var (exitCode, _) = await RunOcAsync(HandleInstallLine, ["oc", "deps", "install", .. ids]);

        SetRunning(false);
        await LoadRowsAsync();
        ShowDone(exitCode == 0);
    }

    private void ShowDone(bool ok)
    {
        DoneHeading.Text = ok ? "Setup complete" : "Setup finished with errors";
        var lines = new List<string>();
        if (_runInstalled.Count > 0) lines.Add($"Installed: {string.Join(", ", _runInstalled)}");
        lines.AddRange(_runFailures.Select(failure => $"{Label(failure.Key)}: {failure.Value}"));
        lines.Add("Terminals that were already open need a restart to see the new PATH.");
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

    private void OpenOcButton_Click(object sender, RoutedEventArgs e)
    {
        DebugLog.Write($"open oc; wezterm: {_weztermGui ?? "none"}"); // WIP: temp debug logging
        OcLauncher.Open(_ocPath, _weztermGui);
        Close();
    }

    private string Label(string id) => _rows.FirstOrDefault(row => row.Id == id)?.Label ?? id;

    private async Task LoadRowsAsync()
    {
        StatusText.Text = "Checking dependencies...";
        var lines = new List<string>();
        var (exitCode, error) = await RunOcAsync(lines.Add, ["oc", "deps", "list"]);

        var json = lines.FirstOrDefault(line => line.StartsWith('['));
        if (exitCode != 0 || json is null)
        {
            StatusText.Text = $"Could not read dependencies (exit {exitCode}). {error.Trim()}";
            return;
        }

        var items = JsonSerializer.Deserialize<DependencyItem[]>(json, _jsonOptions) ?? [];
        _rows = CreateRows(items);
        RowsList.ItemsSource = _rows;
        StatusText.Text = "";
        RefreshButtons();

        // Once WezTerm is installed, oc's shortcuts open in it.
        var wezterm = items.FirstOrDefault(item => item.Id == "wezterm" && item.Status == "found");
        _weztermGui = OcLauncher.WezTermGui(wezterm?.Path);
        if (_weztermGui is null) return;
        // Shortcut retargeting is a convenience; a COM or file error must not take the window down.
        try { OcLauncher.UseWezTermForShortcuts(_weztermGui, _ocPath); }
        catch (Exception exception) { DebugLog.Write($"shortcut retarget failed: {exception}"); }
    }

    private List<DependencyRow> CreateRows(DependencyItem[] items)
    {
        var rows = items.Select(item => new DependencyRow(item, _runFailures.GetValueOrDefault(item.Id)))
            .ToList();

        foreach (var row in rows)
        {
            row.Needed = rows.Where(other => row.Item.Needs.Contains(other.Id)).ToList();
            row.PropertyChanged += (_, e) =>
            {
                if (e.PropertyName == nameof(DependencyRow.IsChecked)) RefreshButtons();
            };
        }

        // Set after Needed is wired so that checking a default row also checks its needs.
        foreach (var defaultRow in rows.Where(candidate => candidate.DefaultChecked))
            defaultRow.IsChecked = true;

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

    private void RefreshButtons() =>
        InstallButton.IsEnabled = !_isRunning && _rows.Any(row => row.IsChecked);

    // Runs oc.exe and returns its exit code and stderr. Stdout lines go to onOutputLine on the UI
    // thread, because the awaits resume on the dispatcher.
    private static async Task<(int ExitCode, string Error)> RunOcAsync(
        Action<string> onOutputLine,
        string[] args)
    {
        var startInfo = new ProcessStartInfo(_ocPath)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        foreach (var arg in args) startInfo.ArgumentList.Add(arg);

        // WIP: temp debug logging of every oc call, its output, and its exit.
        DebugLog.Write($"run: {_ocPath} {string.Join(' ', args)}");
        var clock = Stopwatch.StartNew();
        using var process = Process.Start(startInfo) ?? throw new InvalidOperationException("oc.exe did not start.");
        DebugLog.Write($"pid {process.Id}");
        var errorTask = process.StandardError.ReadToEndAsync();
        while (await process.StandardOutput.ReadLineAsync() is { } line)
        {
            DebugLog.Write($"stdout: {line}");
            onOutputLine(line);
        }

        await process.WaitForExitAsync();
        var error = await errorTask;
        DebugLog.Write($"exit {process.ExitCode} after {clock.ElapsedMilliseconds} ms; stderr: {error}");
        return (process.ExitCode, error);
    }
}
