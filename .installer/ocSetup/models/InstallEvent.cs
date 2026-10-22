namespace OcSetup.Models;

// One NDJSON line from `oc oc deps install <ids...>`.
public sealed record InstallEvent(
    string Id,
    string Phase,
    long? Received,
    long? Total,
    string? Message);
