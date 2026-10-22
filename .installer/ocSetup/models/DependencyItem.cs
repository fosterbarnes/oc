namespace OcSetup.Models;

// One entry from `oc oc deps list`.
public sealed record DependencyItem(
    string Id,
    string Label,
    bool Required,
    bool DefaultSelected,
    string[] Needs,
    string Status,
    string? Version,
    string? Latest,
    string? Message,
    string? Path,
    DependencyShortcut? Shortcut);

// What the row's desktop shortcut launches: an exe (Target), a CLI run in a terminal
// (Target + Terminal), or an Appx app (AppId, its AUMID). Name alone: not installed yet.
public sealed record DependencyShortcut(string Name, string? Target, bool Terminal, string? AppId);
