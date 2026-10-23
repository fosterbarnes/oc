using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace OcSetup.ViewModels;

// One collapsible section of rows, open at first. The window keeps sections across list reloads
// (so their open state survives an install) and only replaces Rows.
public sealed class DependencySection(string label) : INotifyPropertyChanged
{
    private bool _isExpanded = true;
    private IReadOnlyList<DependencyRow> _rows = [];
    private bool? _allChecked = false;
    private bool _canSelectAll;

    public event PropertyChangedEventHandler? PropertyChanged;

    public string Label { get; } = label;
    public bool IsExpanded { get => _isExpanded; set => Set(ref _isExpanded, value); }
    public IReadOnlyList<DependencyRow> Rows { get => _rows; set => Set(ref _rows, value); }

    // Section Select all: checked when every tickable box is ticked, unchecked when none is, partly
    // checked between. Locked (required) rows are not tickable, so they never make it partly checked.
    public bool? AllChecked { get => _allChecked; private set => Set(ref _allChecked, value); }
    public bool CanSelectAll { get => _canSelectAll; private set => Set(ref _canSelectAll, value); }

    public void Refresh(bool idle)
    {
        var installs = Rows.Where(row => row.CanCheck).ToList();
        var shortcuts = Rows.Where(row => row.CanShortcut).ToList();
        var total = installs.Count + shortcuts.Count;
        CanSelectAll = idle && total > 0;
        if (!CanSelectAll) return;

        var ticked = installs.Count(row => row.IsChecked) + shortcuts.Count(row => row.WantsShortcut);
        AllChecked = ticked == 0 ? false : ticked == total ? true : null;
    }

    public void SelectAll(bool select)
    {
        foreach (var row in Rows.Where(row => row.CanCheck)) row.IsChecked = select;
        // After the installs: a missing row's shortcut box opens only once it is ticked.
        foreach (var row in Rows.Where(row => row.CanShortcut)) row.WantsShortcut = select;
    }

    private void Set<T>(ref T field, T value, [CallerMemberName] string name = "")
    {
        if (EqualityComparer<T>.Default.Equals(field, value)) return;

        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}
