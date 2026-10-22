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
    string? Path);
