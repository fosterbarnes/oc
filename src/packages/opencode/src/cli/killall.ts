// Stops every oc/opencode, Claude, ChatGPT, Codex, and Cursor process plus everything they started, and
// logs what was running so resource leaks can be traced. The TUI's /killall and /procReport run it as
// `oc oc killall` in its own window, because it stops the oc that launched it. Identity is PID plus
// creation time (Windows and macOS reuse PIDs), so every parent link compares both, and every stop goes
// through ProcessTree.stopTree, which checks PID, creation time, and executable again first.
import fs from "fs/promises"
import os from "os"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { ProcessDarwin } from "@opencode-ai/core/util/processDarwin"
import { ProcessTree } from "@opencode-ai/core/util/processTree"

export type Platform = "win32" | "darwin"

/** One process from a snapshot. Windows-only counters stay undefined on macOS. */
export type Row = {
  pid: number
  parentPid: number
  created: string
  executable: string
  name: string
  command: string
  // Working set on Windows, resident set on macOS: the same measure under each OS's name.
  workingSetMB: number
  privateMB?: number
  handles?: number
  threads?: number
  cpuMs: number
}

export type Member = Row & { depth: number; tree: number; notes: string[]; result?: string }
export type DeadOwner = { dir: string; createdTicks: bigint }

// npm-installed CLIs and `bun run` dev copies of oc run as node/bun; their command line names them.
const ROOT_COMMAND =
  /@anthropic-ai[\\/]claude-code|@openai[\\/]codex|cursor-agent|packages[\\/]opencode[\\/]src[\\/]index\.ts/i
// oc's Claude provider passes --mcp-config from <tmp>/opencode-claude-code-<oc server pid>
// (provider/claude-code/tmp.ts).
const OWNER_DIR = /opencode-claude-code-(\d+)/
const OWNER_DIR_NAME = /^opencode-claude-code-(\d+)$/
// Native Claude Code installs run from ~/.local/share/claude/versions/<version>.
const CLAUDE_VERSION_PATH = /\/claude\/versions\/[^/]+$/
const IDLE_CPU_MS = 20
const HANDLE_WARN = 10000
// One minute in FILETIME ticks (100 ns).
const MINUTE_TICKS = 600_000_000n
const FILETIME_EPOCH_MS = 11644473600000

// Windows matches image names exactly like killall.ps1 did (case-insensitive). macOS matches exact
// executable names and app bundles: a loose `cursor.*` there would catch the system's CursorUIViewService.
const RULES = {
  win32: {
    root: (row: Row) => /^(oc|occ|opencode.*|claude|chatgpt|codex.*|cursor.*)\.exe$/i.test(row.name),
    oc: /^(oc|occ|opencode.*)\.exe$/i,
    claude: /^claude\.exe$/i,
  },
  darwin: {
    root: (row: Row) =>
      /^(oc|occ|opencode|claude|codex(-[\w-]+)?|cursor-agent)$/.test(row.name) ||
      /\/(Claude|ChatGPT|Cursor|Codex)\.app\//.test(row.executable),
    oc: /^(oc|occ|opencode)$/,
    claude: /^claude$/,
  },
}

export function isRoot(row: Row, platform: Platform) {
  return RULES[platform].root(row) || ROOT_COMMAND.test(row.command)
}

/** Parent of `row`, unless its PID now belongs to a process that started after the child. */
export function parentOf(row: Row, byPid: Map<number, Row>) {
  const parent = byPid.get(row.parentPid)
  if (!parent || parent.pid === row.pid || BigInt(parent.created || 0) > BigInt(row.created || 0)) return undefined
  return parent
}

/** Claude temp dirs whose oc server is gone, keyed by that server's PID. */
export function deadOwners(
  dirs: { name: string; createdTicks: bigint }[],
  byPid: Map<number, Row>,
  platform: Platform,
) {
  return new Map(
    dirs.flatMap((dir) => {
      const pid = Number(OWNER_DIR_NAME.exec(dir.name)?.[1])
      if (!pid) return []
      const owner = byPid.get(pid)
      const alive = owner && RULES[platform].oc.test(owner.name) && BigInt(owner.created || 0) <= dir.createdTicks
      if (alive) return []
      return [[pid, { dir: dir.name, createdTicks: dir.createdTicks }] as const]
    }),
  )
}

/**
 * Targets in parent-first tree order, plus the processes kept. Kept: this run, everything below it
 * (its console), and the shells above it up to the first oc/AI process, so the run can finish and
 * write its log. Nothing below a kept process is walked into.
 */
export function select(rows: Row[], selfPid: number, platform: Platform, dead: Map<number, DeadOwner>) {
  const byPid = new Map(rows.map((row) => [row.pid, row]))
  const children = Map.groupBy(
    rows.filter((row) => parentOf(row, byPid)).toSorted((a, b) => compareCreated(a, b)),
    (row) => row.parentPid,
  )
  const self = byPid.get(selfPid)
  if (!self) throw new Error(`Own process ${selfPid} is missing from the process list`)

  const kept = [self]
  for (const row of kept) kept.push(...(children.get(row.pid) ?? []).filter((child) => !kept.includes(child)))
  const keep = new Set(kept.map((row) => row.pid))
  for (
    let cursor = parentOf(self, byPid);
    cursor && !isRoot(cursor, platform) && !keep.has(cursor.pid);
    cursor = parentOf(cursor, byPid)
  )
    keep.add(cursor.pid)

  // Children still pointing at a dead oc PID were left behind by that oc (MCP servers and other
  // helpers no name rule catches).
  const notes = new Map<number, string[]>()
  const seeds = rows.filter((row) => {
    if (keep.has(row.pid)) return false
    const owner = dead.get(row.parentPid)
    const orphan =
      owner !== undefined && !parentOf(row, byPid) && BigInt(row.created || 0) >= owner.createdTicks - MINUTE_TICKS
    if (orphan) notes.set(row.pid, [`left behind by exited oc ${row.parentPid}`])
    return orphan || isRoot(row, platform)
  })
  const members = new Set(seeds.map((row) => row.pid))
  for (const row of seeds) {
    for (const child of children.get(row.pid) ?? []) {
      if (keep.has(child.pid) || members.has(child.pid)) continue
      members.add(child.pid)
      seeds.push(child)
    }
  }

  const ordered: Member[] = []
  const walk = (row: Row, depth: number, tree: number) => {
    ordered.push({ ...row, depth, tree, notes: notes.get(row.pid) ?? [] })
    for (const child of children.get(row.pid) ?? []) if (members.has(child.pid)) walk(child, depth + 1, tree)
  }
  seeds
    .filter((row) => !members.has(parentOf(row, byPid)?.pid ?? -1))
    .toSorted((a, b) => compareCreated(a, b))
    .forEach((top) => walk(top, 0, top.pid))
  return { keep, ordered }
}

/** Each tree's stoppable members, children before parents. Rows without a full identity are left out. */
export function stopBatches(ordered: Member[]) {
  return [...Map.groupBy(ordered.filter(stoppable), (member) => member.tree).values()].map((tree) =>
    tree.toSorted((a, b) => b.depth - a.depth),
  )
}

export function stoppable(row: Row) {
  return Boolean(row.created && row.executable)
}

function compareCreated(a: Row, b: Row) {
  const delta = BigInt(a.created || 0) - BigInt(b.created || 0)
  return delta === 0n ? 0 : delta < 0n ? -1 : 1
}

// --- Run -----------------------------------------------------------------------------------------

export type Options = { report: boolean; dryRun: boolean; yes: boolean; pause: boolean }

type Context = {
  platform: Platform
  options: Options
  log: (line?: string) => void
  detail: (line?: string) => void
  json: Record<string, unknown>
}

/** `--dry-run` prints the report and the stop order, then stops nothing and writes no files. */
export async function run(options: Options) {
  const platform = process.platform
  if (platform !== "win32" && platform !== "darwin") throw new Error("killall supports Windows and macOS only")
  const dir = logDir(platform)
  const stamp = localTime(new Date()).replace(/[-:]/g, "").replace(" ", "-")
  const lines: string[] = []
  const context: Context = {
    platform,
    options,
    log: (line = "") => {
      lines.push(line)
      console.log(line)
    },
    detail: (line = "") => {
      lines.push(line)
      if (options.dryRun) console.log(line)
    },
    json: { time: new Date().toISOString(), mode: mode(options), platform },
  }
  const failed = await killall(context).then(
    () => false,
    (error: unknown) => {
      context.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
      return true
    },
  )
  if (!options.dryRun) {
    const file = path.join(dir, `killall-${stamp}`)
    await fs.mkdir(dir, { recursive: true })
    await Bun.write(`${file}.log`, lines.join(os.EOL) + os.EOL)
    await Bun.write(`${file}.json`, JSON.stringify(context.json, null, 2))
    console.log(`Log: ${file}.log`)
  }
  if (options.pause) prompt("Press Enter to close")
  if (failed) process.exitCode = 1
}

/** Where the .log and .json files go. */
export function logDir(platform: Platform) {
  if (platform === "darwin") return path.join(Global.Path.data, "killall")
  const local = process.env.LOCALAPPDATA
  if (!local) throw new Error("LOCALAPPDATA is not set")
  return path.join(local, "oc", "killall")
}

async function killall(context: Context) {
  const platform = context.platform
  const log = context.log
  const detail = context.detail
  const before = await snapshot(platform)
  const beforeAt = Date.now()
  const byPid = new Map(before.map((row) => [row.pid, row]))
  const dead = deadOwners(await ownerDirs(), byPid, platform)
  const selection = select(before, process.pid, platform, dead)
  const ordered = selection.ordered
  const targets = new Set(ordered.map((member) => member.pid))

  // Two seconds of CPU time tell idle workers from busy ones. The slower system queries run meanwhile.
  const [memBefore, info, sample] = await Promise.all([
    memory(platform),
    systemInfo(platform),
    Bun.sleep(2000)
      .then(() => snapshot(platform))
      .then((rows) => ({ rows, ms: Date.now() - beforeAt })),
  ])
  const sampleMs = sample.ms
  const sampleByPid = new Map(sample.rows.map((row) => [row.pid, row]))
  const cpuDelta = new Map(
    before.flatMap((row) => {
      const later = sampleByPid.get(row.pid)
      return later && later.created === row.created ? [[row.pid, later.cpuMs - row.cpuMs] as const] : []
    }),
  )

  // --- Findings ----------------------------------------------------------------------------------

  const memoryLabel = platform === "win32" ? "private" : "resident"
  const memoryOf = (row: Row) => row.privateMB ?? row.workingSetMB
  const sum = (rows: Row[], pick: (row: Row) => number) => rows.reduce((total, row) => total + pick(row), 0)
  const issues: string[] = []
  const commitPct = memBefore.commitGB ? Math.round((100 * memBefore.commitGB) / memBefore.limitGB) : undefined
  if (commitPct !== undefined && commitPct >= 80)
    issues.push(`Commit charge at ${commitPct}% of the limit: allocations start failing near 100%.`)

  // Claude workers of an exited oc are reported with their owner below.
  const tops = ordered.filter((member) => member.depth === 0)
  for (const top of tops) {
    if (top.notes.length || parentOf(top, byPid) || OWNER_DIR.test(top.command)) continue
    const expected = /\bserve\b/.test(top.command) ? " (normal for the oc server, which starts detached)" : ""
    top.notes.push(`parent ${top.parentPid} exited`)
    issues.push(`${top.name} ${top.pid}: parent ${top.parentPid} exited${expected}.`)
  }

  const servers = ordered.filter((member) => RULES[platform].oc.test(member.name) && /\bserve\b/.test(member.command))
  if (servers.length > 1)
    issues.push(`${servers.length} oc servers running: ${servers.map((server) => server.pid).join(", ")}.`)

  for (const member of ordered) {
    const service = info.services.get(member.pid)
    if (service) member.notes.push(`service ${service}`)
    if ((member.handles ?? 0) > HANDLE_WARN)
      issues.push(`${member.name} ${member.pid} holds ${member.handles} handles.`)
  }
  for (const member of ordered.filter((item) => item.notes[0]?.startsWith("left behind")))
    issues.push(`${member.name} ${member.pid} (${memoryOf(member)} MB): ${member.notes[0]}.`)

  // Claude workers grouped by the oc server that owns them.
  const workers = ordered.flatMap((member) => {
    const owner = RULES[platform].claude.test(member.name) ? OWNER_DIR.exec(member.command)?.[1] : undefined
    return owner ? [{ member, owner: Number(owner) }] : []
  })
  for (const worker of workers) {
    const resume = /--resume\s+(\S+)/.exec(worker.member.command)?.[1]
    worker.member.notes.push(`worker of oc ${worker.owner}, ${resume ? `resume ${resume}` : "new session"}`)
    if (dead.has(worker.owner))
      issues.push(
        `${worker.member.name} ${worker.member.pid} (${memoryOf(worker.member)} MB) belongs to oc ${worker.owner}, which exited.`,
      )
  }
  const serverLines = [...Map.groupBy(workers, (worker) => worker.owner)].map(([owner, group]) => {
    const rows = group.map((worker) => worker.member)
    const idle = rows.filter((row) => (cpuDelta.get(row.pid) ?? IDLE_CPU_MS) < IDLE_CPU_MS)
    const idleMB = sum(idle, memoryOf)
    if (idle.length >= 2)
      issues.push(
        `oc ${owner} keeps ${idle.length} claude workers that used no CPU in 2 s, holding ${idleMB} MB ` +
          "(idleProcessTimeoutMs is off by default; the cap is 16 workers).",
      )
    return `oc ${owner}: ${rows.length} claude workers, ${sum(rows, memoryOf)} MB ${memoryLabel}, ${idle.length} idle (${idleMB} MB)`
  })
  if (dead.size)
    issues.push(
      `${dead.size} Claude temp folders from exited oc servers: ${[...dead.values()].map((item) => item.dir).join(", ")}.`,
    )

  // --- Report ------------------------------------------------------------------------------------

  const now = new Date()
  const bootAt = new Date(now.getTime() - os.uptime() * 1000)
  const allMemoryGB = round1(sum(before, memoryOf) / 1024)
  const cores = os.availableParallelism()
  log(`oc killall  ${localTime(now)}  mode: ${mode(context.options)}`)
  log(
    `Boot: ${localTime(bootAt).slice(0, 16)} (up ${duration(os.uptime() * 1000)})  elevated: ` +
      (info.elevated
        ? "yes"
        : platform === "win32"
          ? "no (services and elevated processes cannot be stopped or fully read)"
          : "no (other users' processes cannot be stopped or fully read)"),
  )
  if (platform === "win32") {
    // What commit holds besides process memory and kernel pools: shared memory, driver allocations, and the like.
    const restGB = Math.max(
      0,
      round1(memBefore.commitGB - allMemoryGB - (memBefore.pagedPoolGB ?? 0) - (memBefore.nonpagedPoolGB ?? 0)),
    )
    log(
      `Commit: ${memBefore.commitGB} / ${memBefore.limitGB} GB (${commitPct}%)  available RAM: ${memBefore.availableGB} GB`,
    )
    log(
      `  all processes' private memory ${allMemoryGB} GB, kernel paged pool ${memBefore.pagedPoolGB} GB, ` +
        `nonpaged pool ${memBefore.nonpagedPoolGB} GB, rest about ${restGB} GB`,
    )
    log(
      `System log: ${info.systemLog?.count} events, oldest ${info.systemLog?.oldest.slice(0, 10)}; ` +
        `crash/unexpected shutdown events (41, 1001, 6008) in 30 days: ${info.shutdowns.length}`,
    )
    for (const event of info.shutdowns)
      log(`  ${localTime(new Date(event.time)).slice(0, 16)}  id ${event.id}  ${event.provider}`)
  }
  if (platform === "darwin")
    log(
      `RAM: ${memBefore.totalGB} GB total, ${memBefore.availableGB} GB free  ` +
        `all processes' resident memory ${allMemoryGB} GB`,
    )
  log(
    `Targets: ${ordered.length} processes in ${tops.length} trees, ` +
      (platform === "win32"
        ? `${sum(ordered, memoryOf)} MB private, ${sum(ordered, (row) => row.workingSetMB)} MB working set`
        : `${sum(ordered, memoryOf)} MB resident`),
  )
  log()

  const mark = (row: Row) => (targets.has(row.pid) ? "*" : " ")
  log(`Top 15 by ${memoryLabel} memory (all processes, * = target)`)
  for (const row of before.toSorted((a, b) => memoryOf(b) - memoryOf(a)).slice(0, 15))
    log(`${mark(row)} ${String(memoryOf(row)).padStart(7)} MB  ${row.name} ${row.pid}`)
  log()

  log(`Top 10 by CPU over a ${(sampleMs / 1000).toFixed(1)} s sample (% of all ${cores} logical cores, * = target)`)
  const busiest = before
    .filter((row) => row.pid !== 0 && (cpuDelta.get(row.pid) ?? 0) > 0)
    .toSorted((a, b) => cpuDelta.get(b.pid)! - cpuDelta.get(a.pid)!)
    .slice(0, 10)
  for (const row of busiest)
    log(
      `${mark(row)} ${((100 * cpuDelta.get(row.pid)!) / (sampleMs * cores)).toFixed(1).padStart(6)}%  ${row.name} ${row.pid}`,
    )
  log()

  log("Claude workers by oc server")
  if (serverLines.length === 0) log("  none")
  for (const line of serverLines) log(`  ${line}`)
  log()

  log(`Issues (${issues.length})`)
  for (const issue of issues) log(`  - ${issue}`)
  log()

  detail(`Process trees (idle = under ${IDLE_CPU_MS} ms CPU in a 2 s sample)`)
  for (const member of ordered) {
    detail(formatProcess(member, cpuDelta.get(member.pid)))
    const command = member.command || member.executable
    if (command) detail(`${"  ".repeat(member.depth)}    ${command}`)
  }
  detail()
  detail(`Kept (runs this command): ${[...selection.keep].map((pid) => `${byPid.get(pid)?.name} ${pid}`).join(", ")}`)
  detail()

  const processJson = (member: Member) => ({
    pid: member.pid,
    parentPid: member.parentPid,
    tree: member.tree,
    depth: member.depth,
    name: member.name,
    executable: member.executable,
    command: member.command,
    privateMB: member.privateMB,
    workingSetMB: member.workingSetMB,
    handles: member.handles,
    threads: member.threads,
    cpuMs: member.cpuMs,
    cpuDeltaMs: cpuDelta.get(member.pid),
    created: createdMs(member) === undefined ? undefined : new Date(createdMs(member)!).toISOString(),
    notes: member.notes,
    result: member.result,
  })
  Object.assign(context.json, {
    memoryBefore: memBefore,
    [platform === "win32" ? "allProcessesPrivateGB" : "allProcessesResidentGB"]: allMemoryGB,
    issues,
  })
  context.json.processes = ordered.map(processJson)

  if (context.options.report) return
  if (ordered.length === 0) return log("Nothing to stop.")
  const batches = stopBatches(ordered)
  const unstoppable = ordered.filter((member) => !stoppable(member))
  if (context.options.dryRun) {
    log(`Dry run: would stop ${batches.flat().length} processes, each tree children first`)
    for (const batch of batches) log(`  ${batch.map((member) => `${member.name} ${member.pid}`).join(" > ")}`)
    for (const member of unstoppable) log(`  skip ${member.name} ${member.pid}: identity unavailable`)
    return
  }
  if (!context.options.yes) {
    const answer = prompt(
      `Stop these ${ordered.length} processes (${sum(ordered, memoryOf)} MB ${memoryLabel})? Type yes`,
    )
    if (answer !== "yes") return log("Cancelled: nothing stopped.")
  }

  // --- Stop --------------------------------------------------------------------------------------

  for (const member of unstoppable) member.result = "skipped: identity unavailable (cannot be read without elevation)"
  // One stopTree call per tree. If a tree fails, each of its members is retried alone so one process
  // that refuses to stop does not spare its parents.
  for (const batch of batches) {
    const failed = await ProcessTree.stopTree(batch.map(identity)).then(
      () => false,
      () => true,
    )
    for (const member of batch) {
      member.result = failed
        ? await ProcessTree.stopTree([identity(member)]).then(
            () => "stopped",
            (error: unknown) => `failed: ${error instanceof Error ? error.message : String(error)}`,
          )
        : "stopped"
    }
  }
  detail("Stop results (children first)")
  for (const member of batches.flat().concat(unstoppable)) {
    const service = member.notes.find((note) => note.startsWith("service "))?.slice("service ".length)
    if (service && member.result?.startsWith("failed:"))
      member.result += ` (stop it from an elevated PowerShell: Stop-Service ${service})`
    detail(`  ${member.name} ${member.pid}: ${member.result}`)
    if (member.result !== "stopped") console.log(`  ${member.name} ${member.pid}: ${member.result}`)
  }

  await Bun.sleep(3000)
  const [after, memAfter] = await Promise.all([snapshot(platform), memory(platform)])
  const afterByPid = new Map(after.map((row) => [row.pid, row]))
  const survivors = ordered.filter((member) => afterByPid.get(member.pid)?.created === member.created)
  const respawned = after.filter(
    (row) => byPid.get(row.pid)?.created !== row.created && !selection.keep.has(row.pid) && isRoot(row, platform),
  )
  const stopped = ordered.filter((member) => member.result === "stopped").length
  log()
  log(`Stopped or already exited: ${stopped}  failed or skipped: ${ordered.length - stopped}`)
  if (platform === "win32")
    log(
      `Commit after: ${memAfter.commitGB} / ${memAfter.limitGB} GB ` +
        `(${(memBefore.commitGB - memAfter.commitGB).toFixed(1)} GB freed)  available RAM: ${memAfter.availableGB} GB`,
    )
  if (platform === "darwin") log(`Free RAM after: ${memAfter.availableGB} GB (was ${memBefore.availableGB} GB)`)
  for (const member of survivors) log(`  Still running: ${member.name} ${member.pid}`)
  for (const row of respawned)
    log(`  Started again: ${row.name} ${row.pid} (parent ${row.parentPid} ${afterByPid.get(row.parentPid)?.name})`)

  Object.assign(context.json, {
    processes: ordered.map(processJson),
    memoryAfter: memAfter,
    survivors: survivors.map((member) => member.pid),
    respawned: respawned.map((row) => ({
      pid: row.pid,
      parentPid: row.parentPid,
      name: row.name,
      command: row.command,
    })),
  })
}

function identity(row: Row): ProcessTree.ProcessIdentity {
  return { pid: row.pid, parentPid: row.parentPid, created: row.created, executable: row.executable }
}

function mode(options: Options) {
  if (options.dryRun) return "dry run"
  if (options.report) return "report only"
  return "stop"
}

function formatProcess(member: Member, cpuDeltaMs: number | undefined) {
  const idle = cpuDeltaMs === undefined ? "" : cpuDeltaMs < IDLE_CPU_MS ? "  idle" : `  busy ${cpuDeltaMs} ms/2s`
  const fields = [
    `${"  ".repeat(member.depth)}${member.name} ${member.pid}`,
    `ppid ${member.parentPid}`,
    member.privateMB === undefined ? "" : `priv ${member.privateMB} MB`,
    `${member.privateMB === undefined ? "rss" : "ws"} ${member.workingSetMB} MB`,
    member.handles === undefined ? "" : `handles ${member.handles}`,
    member.threads === undefined ? "" : `threads ${member.threads}`,
    `cpu ${Math.round(member.cpuMs / 1000).toLocaleString("en-US")} s`,
    `age ${createdMs(member) === undefined ? "?" : duration(Date.now() - createdMs(member)!)}`,
  ].filter(Boolean)
  const notes = member.notes.length ? `  [${member.notes.join("; ")}]` : ""
  const result = member.result ? `  -> ${member.result}` : ""
  return fields.join("  ") + idle + notes + result
}

function createdMs(row: Row) {
  if (!row.created) return undefined
  return Number(BigInt(row.created) / 10000n) - FILETIME_EPOCH_MS
}

const pad = (value: number) => String(value).padStart(2, "0")

function localTime(date: Date) {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

function duration(ms: number) {
  const minutes = Math.floor(ms / 60000)
  return `${Math.floor(minutes / 1440)}d ${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`
}

const round1 = (value: number) => Math.round(value * 10) / 10
const gb = (bytes: number) => round1(bytes / 1024 ** 3)

// --- Snapshots -----------------------------------------------------------------------------------

// `created` is built exactly like ProcessTree's snapshot, so stopTree's identity check compares like for like.
const WIN_SNAPSHOT = [
  "ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | ForEach-Object { @{",
  "  pid = [int]$_.ProcessId; parentPid = [int]$_.ParentProcessId; name = [string]$_.Name",
  "  created = $(if ($_.CreationDate) { $_.CreationDate.ToFileTimeUtc().ToString() } else { '' })",
  "  executable = [string]$_.ExecutablePath; command = [string]$_.CommandLine",
  "  privateBytes = [long]$_.PrivatePageCount; workingSetBytes = [long]$_.WorkingSetSize",
  "  handles = [int]$_.HandleCount; threads = [int]$_.ThreadCount",
  "  cpuMs = [long](($_.KernelModeTime + $_.UserModeTime) / 10000)",
  "} }) -Compress",
].join("\n")

async function snapshot(platform: Platform): Promise<Row[]> {
  if (platform === "darwin") return darwinSnapshot()
  const rows = JSON.parse(await ProcessTree.runPowerShell(WIN_SNAPSHOT, "")) as (Omit<
    Row,
    "privateMB" | "workingSetMB"
  > & { privateBytes: number; workingSetBytes: number })[]
  return rows.map((row) => ({
    pid: row.pid,
    parentPid: row.parentPid,
    created: row.created,
    executable: row.executable,
    name: row.name,
    command: row.command,
    privateMB: Math.round(row.privateBytes / 1024 ** 2),
    workingSetMB: Math.round(row.workingSetBytes / 1024 ** 2),
    handles: row.handles,
    threads: row.threads,
    cpuMs: row.cpuMs,
  }))
}

// libproc gives identity (PID, parent, creation time, executable); `ps` adds command line, resident
// memory, and CPU time. A process that starts between the two reads has no `ps` columns.
async function darwinSnapshot(): Promise<Row[]> {
  const child = Bun.spawn(["/bin/ps", "-axww", "-o", "pid=", "-o", "rss=", "-o", "time=", "-o", "command="], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [code, text, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (code !== 0) throw new Error(`ps exited with code ${code}: ${stderr.trim()}`)
  const columns = new Map(
    text.split("\n").flatMap((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s?(.*)$/.exec(line)
      if (!match) return []
      return [[Number(match[1]), { rssKB: Number(match[2]), cpuMs: cpuTimeMs(match[3]), command: match[4] }] as const]
    }),
  )
  return ProcessDarwin.list().map((item) => {
    const extra = columns.get(item.pid)
    const command = extra?.command ?? ""
    return {
      pid: item.pid,
      parentPid: item.parentPid,
      created: item.created,
      executable: item.executable,
      name: darwinName(item.executable, command),
      command,
      workingSetMB: Math.round((extra?.rssKB ?? 0) / 1024),
      cpuMs: extra?.cpuMs ?? 0,
    }
  })
}

export function darwinName(executable: string, command: string) {
  if (CLAUDE_VERSION_PATH.test(executable)) return "claude"
  return path.posix.basename(executable || command.split(" ")[0] || "?")
}

/** `ps` TIME (`[dd-][hh:]mm:ss.cc`) in milliseconds. */
export function cpuTimeMs(value: string) {
  const [days, clock] = value.includes("-") ? value.split("-") : ["0", value]
  const seconds = clock.split(":").reduce((total, part) => total * 60 + Number(part), 0)
  return Math.round((Number(days) * 86400 + seconds) * 1000)
}

async function ownerDirs() {
  const root = os.tmpdir()
  const names = (await fs.readdir(root)).filter((name) => OWNER_DIR_NAME.test(name))
  const dirs = await Promise.all(
    names.map(async (name) => {
      const stat = await fs.stat(path.join(root, name)).catch(() => undefined)
      if (!stat?.isDirectory()) return []
      return [
        { name, createdTicks: BigInt(Math.floor(stat.birthtimeMs)) * 10000n + BigInt(FILETIME_EPOCH_MS) * 10000n },
      ]
    }),
  )
  return dirs.flat()
}

// --- System --------------------------------------------------------------------------------------

type Memory = {
  availableGB: number
  totalGB?: number
  commitGB: number
  limitGB: number
  pagedPoolGB?: number
  nonpagedPoolGB?: number
}

const WIN_MEMORY = [
  "$m = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory",
  "@{ commit = [long]$m.CommittedBytes; limit = [long]$m.CommitLimit; available = [long]$m.AvailableBytes;",
  "   paged = [long]$m.PoolPagedBytes; nonpaged = [long]$m.PoolNonpagedBytes } | ConvertTo-Json -Compress",
].join("\n")

// macOS has no commit limit; commit stays 0 there and the Windows-only lines are not printed.
async function memory(platform: Platform): Promise<Memory> {
  if (platform === "darwin")
    return { totalGB: gb(os.totalmem()), availableGB: gb(os.freemem()), commitGB: 0, limitGB: 0 }
  const m = JSON.parse(await ProcessTree.runPowerShell(WIN_MEMORY, "")) as Record<string, number>
  return {
    commitGB: gb(m.commit),
    limitGB: gb(m.limit),
    availableGB: gb(m.available),
    pagedPoolGB: gb(m.paged),
    nonpagedPoolGB: gb(m.nonpaged),
  }
}

const WIN_INFO = [
  "$elevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(",
  "  [Security.Principal.WindowsBuiltInRole]::Administrator)",
  "$systemLog = Get-WinEvent -ListLog System",
  "$oldest = Get-WinEvent -LogName System -MaxEvents 1 -Oldest",
  "$shutdowns = try {",
  "  @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Id = 41, 1001, 6008; StartTime = (Get-Date).AddDays(-30) })",
  "} catch {",
  "  if ($_.Exception.Message -notmatch 'No events were found') { throw }",
  "  @()",
  "}",
  "@{",
  "  elevated = $elevated",
  "  systemLog = @{ count = [long]$systemLog.RecordCount; oldest = $oldest.TimeCreated.ToString('o') }",
  "  shutdowns = @($shutdowns | ForEach-Object { @{ time = $_.TimeCreated.ToString('o'); id = $_.Id; provider = $_.ProviderName } })",
  "  services = @(Get-CimInstance Win32_Service -Filter 'ProcessId <> 0' | ForEach-Object { @{ name = $_.Name; pid = [int]$_.ProcessId } })",
  "} | ConvertTo-Json -Depth 4 -Compress",
].join("\n")

async function systemInfo(platform: Platform) {
  if (platform === "darwin")
    return {
      elevated: process.getuid?.() === 0,
      systemLog: undefined,
      shutdowns: [],
      services: new Map<number, string>(),
    }
  const info = JSON.parse(await ProcessTree.runPowerShell(WIN_INFO, "")) as {
    elevated: boolean
    systemLog: { count: number; oldest: string }
    shutdowns: { time: string; id: number; provider: string }[]
    services: { name: string; pid: number }[]
  }
  return { ...info, services: new Map(info.services.map((service) => [service.pid, service.name])) }
}

export * as Killall from "./killall"
