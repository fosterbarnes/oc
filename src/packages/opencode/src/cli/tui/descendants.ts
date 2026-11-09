import path from "node:path"
import { ProcessDarwin } from "@opencode-ai/core/util/processDarwin"
import { ProcessTree } from "@opencode-ai/core/util/processTree"

// Every other oc/runtime helper and terminal subtree stays, even if launched from this TUI.
const _PROTECTED_NAME = /^(?:opencode.*|oc|occ|wezterm.*)$/i
const _REVIVE_ARG = /--revive(?:-terminal)?(?:\s|=)/

// Snapshot while the TUI is alive; never discover a tree after its root PID can be reused.
export async function captureDescendants(rootPid = process.pid) {
  if (process.platform === "darwin") return captureDarwin(rootPid)
  if (process.platform !== "win32") return []
  const result = await ProcessTree.runPowerShell(
    [
      `$rootPid = ${Math.trunc(rootPid)}`,
      "ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | ForEach-Object {",
      "  @{ pid = [int]$_.ProcessId; parentPid = [int]$_.ParentProcessId; created = $_.CreationDate.ToFileTimeUtc().ToString(); executable = $_.ExecutablePath;",
      "     protected = ($_.ProcessId -eq $PID -or ($_.ProcessId -ne $rootPid -and ($_.Name -match '^(?:opencode.*|oc|occ|wezterm.*|WindowsTerminal|wt|conhost|OpenConsole)\\.exe$' -or $_.CommandLine -match '--revive(?:-terminal)?(?:\\s|=)'))) }",
      "}) -Compress",
    ].join("\n"),
    "",
  )
  return ProcessTree.selectDescendants(JSON.parse(result) as ProcessTree.ProcessIdentity[], rootPid)
}

// libproc has no command line; `ps` supplies it for the --revive check only.
function captureDarwin(rootPid: number) {
  const commands = new Map(
    Bun.spawnSync(["/bin/ps", "-axww", "-o", "pid=,command="], { stdout: "pipe", stderr: "pipe" })
      .stdout.toString()
      .split("\n")
      .flatMap((line) => {
        const match = line.match(/^\s*(\d+)\s+(.*)$/)
        return match ? [[Number(match[1]), match[2]] as const] : []
      }),
  )
  return ProcessTree.selectDescendants(
    ProcessDarwin.list().map((item) => ({
      ...item,
      protected:
        item.pid !== rootPid &&
        (_PROTECTED_NAME.test(path.basename(item.executable)) || _REVIVE_ARG.test(`${commands.get(item.pid) ?? ""} `)),
    })),
    rootPid,
  )
}

export async function stopDescendants(processes: ProcessTree.ProcessIdentity[]) {
  await ProcessTree.stopTree(processes)
}
