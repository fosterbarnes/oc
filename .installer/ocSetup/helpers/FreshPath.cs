namespace OcSetup.Helpers;

// PATH as a new process would get it. This process started before oc's setup and the dependency
// installs changed PATH, so its own copy is stale.
public static class FreshPath
{
    /// <summary>Machine + User Path from the registry, environment references expanded.</summary>
    public static string Read() => string.Join(';',
        Environment.GetEnvironmentVariable("Path", EnvironmentVariableTarget.Machine),
        Environment.GetEnvironmentVariable("Path", EnvironmentVariableTarget.User));
}
