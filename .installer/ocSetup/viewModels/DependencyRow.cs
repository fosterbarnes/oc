using System.ComponentModel;
using System.Globalization;
using System.Runtime.CompilerServices;
using OcSetup.Models;

namespace OcSetup.ViewModels;

// One dependency row. Checking a row checks its missing `Needed` rows; the window sets
// IsChecked for the defaults after wiring Needed.
public sealed class DependencyRow : INotifyPropertyChanged
{
    private bool _isChecked;
    private bool _isBusy;
    private string _statusText;
    private bool _isProgressVisible;
    private bool _isProgressIndeterminate = true;
    private double _progressValue;

    public DependencyRow(DependencyItem item, string? runStatus)
    {
        Item = item;
        _statusText = runStatus ?? ListStatus(item);
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public DependencyItem Item { get; }
    public string Id => Item.Id;
    public string Label => Item.Label;
    public IReadOnlyList<DependencyRow> Needed { get; set; } = [];

    public bool IsLocked => Item.Required && (Item.Status is "missing" or "outdated");
    public bool DefaultChecked => IsLocked || (Item.Status == "missing" && Item.DefaultSelected);
    public bool CanCheck => !_isBusy && Item.Status != "found" && !IsLocked;

    // Tag beside the label: what the setup installs unless unchecked.
    public string? TagText => Item.Required ? "Required" : Item.DefaultSelected ? "Default" : null;
    public bool HasTag => TagText is not null;
    public string? TagToolTip => Item.Required
        ? "oc needs this; always installed when missing"
        : Item.DefaultSelected ? "Checked by default when missing" : null;

    public string? ToolTip => Needed.Count == 0
        ? null
        : $"Needs {string.Join(", ", Needed.Select(need => need.Label))}";

    public bool IsChecked
    {
        get => _isChecked;
        set
        {
            if (!Set(ref _isChecked, value) || !value) return;

            foreach (var need in Needed)
            {
                if (need.Item.Status != "found") need.IsChecked = true;
            }
        }
    }

    public bool IsBusy
    {
        get => _isBusy;
        set
        {
            if (Set(ref _isBusy, value)) Notify(nameof(CanCheck));
        }
    }

    public string StatusText { get => _statusText; private set => Set(ref _statusText, value); }

    public bool IsProgressVisible
    {
        get => _isProgressVisible;
        private set => Set(ref _isProgressVisible, value);
    }

    public bool IsProgressIndeterminate
    {
        get => _isProgressIndeterminate;
        private set => Set(ref _isProgressIndeterminate, value);
    }

    public double ProgressValue { get => _progressValue; private set => Set(ref _progressValue, value); }

    public void ApplyEvent(InstallEvent install)
    {
        switch (install.Phase)
        {
            case "start":
                ShowProgress("Starting", null);
                break;
            case "downloading":
                ShowDownload(install);
                break;
            case "verifying":
                ShowProgress("Verifying", null);
                break;
            case "installing":
                ShowProgress(WithMessage("Installing", install.Message), null);
                break;
            case "done":
                ShowResult("Done");
                break;
            case "failed":
                ShowResult(WithMessage("Failed", install.Message));
                break;
            case "skipped":
                ShowResult(WithMessage("Skipped", install.Message));
                break;
        }
    }

    private void ShowDownload(InstallEvent install)
    {
        var received = install.Received ?? 0;
        if (install.Total is long total and > 0)
        {
            var percent = received * 100.0 / total;
            ShowProgress($"Downloading {percent:0}% ({Mb(received)}/{Mb(total)} MB)", percent);
            return;
        }

        ShowProgress($"Downloading {Mb(received)} MB", null);
    }

    // A null percent means indeterminate progress.
    private void ShowProgress(string text, double? percent)
    {
        StatusText = text;
        IsProgressVisible = true;
        IsProgressIndeterminate = percent is null;
        ProgressValue = percent ?? 0;
    }

    private void ShowResult(string text)
    {
        StatusText = text;
        IsProgressVisible = false;
    }

    private static string ListStatus(DependencyItem item) => item.Status switch
    {
        "found" => string.IsNullOrEmpty(item.Version) ? "Found" : $"Found {item.Version}",
        "missing" => "Missing",
        "outdated" => $"Update {item.Version} -> {item.Latest}",
        _ => item.Message ?? "Error",
    };

    private static string WithMessage(string text, string? message) =>
        string.IsNullOrEmpty(message) ? text : $"{text}: {message}";

    private static string Mb(long bytes) =>
        (bytes / 1048576.0).ToString("0.0", CultureInfo.InvariantCulture);

    private bool Set<T>(ref T field, T value, [CallerMemberName] string name = "")
    {
        if (EqualityComparer<T>.Default.Equals(field, value)) return false;

        field = value;
        Notify(name);
        return true;
    }

    private void Notify(string name) => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
