// Snapshot while the TUI is alive; never discover a tree after its root PID can be reused.
export type ProcessIdentity = {
  pid: number
  parentPid: number
  created: string
  protected: boolean
  executable?: string
}

export function selectDescendants(processes: ProcessIdentity[], rootPid: number) {
  const root = processes.find((item) => item.pid === rootPid)
  if (!root) throw new Error("Single runtime process identity unavailable")
  const tree = [root]
  for (const parent of tree) {
    tree.push(
      ...processes.filter(
        (item) =>
          !item.protected &&
          item.parentPid === parent.pid &&
          BigInt(item.created) >= BigInt(parent.created) &&
          !tree.some((owned) => owned.pid === item.pid),
      ),
    )
  }
  return tree.slice(1).toReversed()
}

export async function captureDescendants(rootPid = process.pid) {
  if (process.platform !== "win32") return []
  const result = await powershell(
    [
      "$rootPid = [int]$env:OC_SHUTDOWN_ROOT",
      "ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | ForEach-Object {",
      "  @{ pid = [int]$_.ProcessId; parentPid = [int]$_.ParentProcessId; created = $_.CreationDate.ToFileTimeUtc().ToString(); executable = $_.ExecutablePath;",
      // Keep every other oc/runtime helper and terminal subtree, even if launched from this TUI.
      "     protected = ($_.ProcessId -eq $PID -or ($_.ProcessId -ne $rootPid -and ($_.Name -match '^(?:opencode.*|oc|occ|ocdebug|oc-debug|wezterm.*|WindowsTerminal|wt|conhost|OpenConsole)\\.exe$' -or $_.CommandLine -match '--revive(?:-terminal)?(?:\\s|=)'))) }",
      "}) -Compress",
    ].join("\n"),
    { OC_SHUTDOWN_ROOT: String(rootPid) },
  )
  return selectDescendants(JSON.parse(result) as ProcessIdentity[], rootPid)
}

export async function stopDescendants(processes: ProcessIdentity[]) {
  if (!processes.length) return
  await powershell(
    [
      "$items = @([Console]::In.ReadToEnd() | ConvertFrom-Json)",
      "foreach ($item in $items) {",
      "  if (-not $item.created -or -not $item.executable) { throw ('Process identity unavailable: ' + $item.pid) }",
      "  $live = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $item.pid)",
      "  if (-not $live) { continue }",
      "  if ($live.CreationDate.ToFileTimeUtc().ToString() -ne $item.created -or $live.ExecutablePath -ne $item.executable) { throw ('Process identity changed: ' + $item.pid) }",
      // Get-Process supplies a handle. Check CIM again after obtaining it, then stop through that handle.
      "  $target = Get-Process -Id $item.pid -ErrorAction SilentlyContinue",
      "  if (-not $target) {",
      "    if (Get-CimInstance Win32_Process -Filter ('ProcessId=' + $item.pid)) { throw ('Process handle unavailable: ' + $item.pid) }",
      "    continue",
      "  }",
      "  $null = $target.Handle",
      "  $live = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $item.pid)",
      "  if (-not $live) { continue }",
      "  if ($live.CreationDate.ToFileTimeUtc().ToString() -ne $item.created -or $live.ExecutablePath -ne $item.executable) { throw ('Process identity changed before stop: ' + $item.pid) }",
      "  $target.Kill()",
      "  if (-not $target.WaitForExit(5000)) { throw ('Single child did not exit: ' + $item.pid) }",
      "}",
    ].join("\n"),
    {},
    JSON.stringify(processes),
  )
}

async function powershell(script: string, env: Record<string, string>, input = "") {
  const child = Bun.spawn(
    [
      "pwsh",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$ErrorActionPreference = 'Stop'; try {\n" +
        script +
        "\n} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }",
    ],
    {
      env: { ...process.env, ...env },
      windowsHide: true,
      stdin: Buffer.from(input),
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (code !== 0) throw new Error(`Single descendant cleanup failed: ${stderr.trim() || `pwsh exited ${code}`}`)
  return stdout
}
