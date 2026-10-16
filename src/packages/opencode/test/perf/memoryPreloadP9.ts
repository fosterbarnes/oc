// P9 serve memory: lighter than memoryPreload.ts (no object counts, no Worker injection). Loaded
// through the fixture home's bunfig.toml; every 5 s logs memoryUsage under the current checkpoint.
import { appendFileSync, existsSync, readFileSync } from "node:fs"
import { isMainThread, threadId } from "node:worker_threads"
import { heapStats } from "bun:jsc"

const dir = process.env.OC_PERF_LOG_DIR
if (dir) {
  const file = `${dir}/mem-${process.pid}-${threadId}.jsonl`
  const write = (value: object) =>
    appendFileSync(
      file,
      JSON.stringify({ time: Date.now(), pid: process.pid, threadId, isMainThread, main: Bun.main, ...value }) + "\n",
    )
  const capture = (kind: string, label?: string) => {
    const start = performance.now()
    Bun.gc(true)
    const memory = process.memoryUsage()
    const heap = heapStats()
    write({
      kind,
      label,
      gcMs: performance.now() - start,
      memory: { rss: memory.rss, heapUsed: memory.heapUsed, heapTotal: memory.heapTotal, external: memory.external },
      heapSize: heap.heapSize,
    })
  }
  write({ kind: "boot", argv: process.argv })
  capture("initial")
  setInterval(() => {
    const checkpoint = `${dir}/checkpoint.json`
    const label = existsSync(checkpoint) ? (JSON.parse(readFileSync(checkpoint, "utf8")).label as string) : ""
    capture(label ? "checkpoint" : "periodic", label || undefined)
  }, 5000).unref()
}
