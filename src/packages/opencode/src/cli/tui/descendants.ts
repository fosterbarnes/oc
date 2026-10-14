import { ProcessTree } from "@opencode-ai/core/util/processTree"

// Snapshot while the TUI is alive; never discover a tree after its root PID can be reused.
export async function captureDescendants(rootPid = process.pid) {
  if (process.platform !== "win32") return []
  const result = await ProcessTree.runPowerShell(
    [
      `$rootPid = ${Math.trunc(rootPid)}`,
      "ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | ForEach-Object {",
      "  @{ pid = [int]$_.ProcessId; parentPid = [int]$_.ParentProcessId; created = $_.CreationDate.ToFileTimeUtc().ToString(); executable = $_.ExecutablePath;",
      // Keep every other oc/runtime helper and terminal subtree, even if launched from this TUI.
      "     protected = ($_.ProcessId -eq $PID -or ($_.ProcessId -ne $rootPid -and ($_.Name -match '^(?:opencode.*|oc|occ|wezterm.*|WindowsTerminal|wt|conhost|OpenConsole)\\.exe$' -or $_.CommandLine -match '--revive(?:-terminal)?(?:\\s|=)'))) }",
      "}) -Compress",
    ].join("\n"),
    "",
  )
  return ProcessTree.selectDescendants(JSON.parse(result) as ProcessTree.ProcessIdentity[], rootPid)
}

export async function stopDescendants(processes: ProcessTree.ProcessIdentity[]) {
  await ProcessTree.stopTree(processes)
}
