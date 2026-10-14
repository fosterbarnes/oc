import { spawn } from "node:child_process"

// Process identity is the PID plus its creation time. Windows reuses PIDs, so a PID alone
// never proves ownership: every stop compares creation time and executable path again.
export type ProcessIdentity = {
  pid: number
  parentPid: number
  created: string
  protected?: boolean
  executable?: string
}

const snapshotScript = (filter: string) =>
  [
    `ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process ${filter} | ForEach-Object {`,
    "  @{ pid = [int]$_.ProcessId; parentPid = [int]$_.ParentProcessId; created = $_.CreationDate.ToFileTimeUtc().ToString(); executable = $_.ExecutablePath }",
    "}) -Compress",
  ].join("\n")

// Stops children before parents. Entries that already exited are skipped. Every live entry is verified
// before any process is touched, so an unverifiable one cannot leave the tree half stopped.
const STOP = [
  "$items = @([Console]::In.ReadToEnd() | ConvertFrom-Json)",
  "$running = @{}",
  "Get-CimInstance Win32_Process | ForEach-Object { $running[[int]$_.ProcessId] = $_ }",
  "foreach ($item in $items) {",
  "  $live = $running[[int]$item.pid]",
  "  if (-not $live) { continue }",
  "  if (-not $item.created -or -not $item.executable) { throw ('Process identity unavailable: ' + $item.pid) }",
  "  if ($live.CreationDate.ToFileTimeUtc().ToString() -ne $item.created -or $live.ExecutablePath -ne $item.executable) { throw ('Process identity changed: ' + $item.pid) }",
  "}",
  "foreach ($item in $items) {",
  "  if (-not $running[[int]$item.pid]) { continue }",
  // Get-Process supplies a handle. It reads the live process table, so no result means the process
  // already exited (CIM lags behind exit and must not be used to second-guess it). A reused PID is
  // caught by the CIM identity check after the handle is held; the stop then goes through that handle.
  "  $target = Get-Process -Id $item.pid -ErrorAction SilentlyContinue",
  "  if (-not $target) { continue }",
  "  $null = $target.Handle",
  "  if ($target.HasExited) { continue }",
  "  $live = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $item.pid)",
  "  if (-not $live) { continue }",
  "  if ($live.CreationDate.ToFileTimeUtc().ToString() -ne $item.created -or $live.ExecutablePath -ne $item.executable) { throw ('Process identity changed before stop: ' + $item.pid) }",
  "  $target.Kill()",
  "  if (-not $target.WaitForExit(5000)) { throw ('Process did not exit: ' + $item.pid) }",
  "}",
  // A skipped Get-Process leaves $? false, which pwsh -Command would report as exit code 1.
  "exit 0",
].join("\n")

/**
 * Descendants of `rootPid`, deepest first. A child joins only when its parent PID matches and it was
 * created no earlier than that parent, so a reused PID cannot pull an unrelated process into the tree.
 */
export function selectDescendants(processes: ProcessIdentity[], rootPid: number) {
  const root = processes.find((item) => item.pid === rootPid)
  if (!root) throw new Error(`Process identity unavailable: ${rootPid}`)
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

/**
 * Identities of `rootPid` and its live descendants, children first, root last.
 * Callers must already know the root has not exited; a dead PID can be reused by another process.
 */
export async function captureTree(rootPid: number) {
  const processes = await snapshot()
  const root = processes.find((item) => item.pid === rootPid)
  if (!root) throw new Error(`Process identity unavailable: ${rootPid}`)
  return [...selectDescendants(processes, rootPid), root]
}

/** Stops the given identities in order. Refuses to run unless every live identity is complete. */
export async function stopTree(identities: ProcessIdentity[]) {
  if (identities.length === 0) return
  await runPowerShell(STOP, JSON.stringify(identities))
}

/** A spawned process plus wall-clock bounds (ms since epoch) taken just before and after its spawn. */
export type SpawnedRoot = { pid: number; from: number; to: number }

// Allows for CIM and Date.now() reading the system clock at slightly different moments.
const _SPAWN_SLACK_MS = 2000
// FILETIME counts 100 ns ticks from 1601-01-01; this is that epoch in Unix milliseconds.
const _FILETIME_EPOCH_MS = 11644473600000n

/**
 * Stops a spawned root and its descendants, children first. `held` reports whether the caller still holds
 * the root's process handle (Windows does not reuse a PID while a handle is open); it is checked again after
 * the snapshot. A root that exited is left alone. A live root created outside its spawn window throws.
 */
export async function killTree(root: SpawnedRoot, held: () => boolean) {
  if (!held()) return
  const processes = await snapshot()
  const live = processes.find((item) => item.pid === root.pid)
  if (!held() || !live) return
  const created = Number(BigInt(live.created) / 10000n - _FILETIME_EPOCH_MS)
  if (created < root.from - _SPAWN_SLACK_MS || created > root.to + _SPAWN_SLACK_MS) {
    throw new Error(`Process identity changed: ${root.pid}`)
  }
  await stopTree([...selectDescendants(processes, root.pid), live])
}

/** Identity of one live process, or undefined when no process has that PID. */
export async function processIdentity(pid: number) {
  const processes = JSON.parse(await runPowerShell(snapshotScript(`-Filter 'ProcessId=${pid}'`), "")) as ProcessIdentity[]
  return processes[0]
}

async function snapshot() {
  return JSON.parse(await runPowerShell(snapshotScript(""), "")) as ProcessIdentity[]
}

export function runPowerShell(script: string, input: string) {
  const wrapped =
    "$ErrorActionPreference = 'Stop'; try {\n" + script + "\n} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }"
  return new Promise<string>((resolve, reject) => {
    const child = spawn("pwsh", ["-NoProfile", "-NonInteractive", "-Command", wrapped], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk))
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk))
    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) return resolve(stdout)
      reject(new Error(`Process tree cleanup failed: ${stderr.trim() || `pwsh exited ${code}`}`))
    })
    child.stdin.end(input)
  })
}

export * as ProcessTree from "./processTree"
