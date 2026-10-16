// P1/P2 memory attribution. Loaded before the CLI by instrumentedEntry.ts. Every 5 s each isolate
// forces GC and logs memoryUsage plus the top 20 heap object types to OC_PERF_LOG_DIR. Workers do
// not inherit CLI preloads, so with OC_PERF_INJECT_PRELOAD=1 this adds itself to each new Worker.
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
  let lastCheckpoint = ""
  const capture = (kind: string, label?: string) => {
    const start = performance.now()
    Bun.gc(true)
    const memory = process.memoryUsage()
    const heap = heapStats()
    const counts = Object.entries(heap.objectTypeCounts).sort((a, b) => b[1] - a[1])
    write({
      kind,
      label,
      gcMs: performance.now() - start,
      memory: {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        external: memory.external,
        arrayBuffers: memory.arrayBuffers ?? null,
      },
      heapSize: heap.heapSize,
      heapCapacity: heap.heapCapacity,
      extraMemorySize: heap.extraMemorySize,
      objectCount: heap.objectCount,
      top20: counts.slice(0, 20),
      wasm: counts.filter(([key]) => /wasm|webassembly/i.test(key)),
    })
  }
  write({
    kind: "boot",
    argv: process.argv,
    execArgv: process.execArgv,
    injected: process.env.OC_PERF_INJECT_PRELOAD === "1",
  })
  capture("initial")
  setInterval(() => {
    const checkpoint = `${dir}/checkpoint.json`
    const label = existsSync(checkpoint) ? (JSON.parse(readFileSync(checkpoint, "utf8")).label as string) : ""
    if (label && label !== lastCheckpoint) {
      lastCheckpoint = label
      capture("checkpoint", label)
      return
    }
    capture("periodic")
  }, 5000).unref()

  const NativeWorker = globalThis.Worker
  globalThis.Worker = new Proxy(NativeWorker, {
    construct(target, args) {
      const specifier = String(args[0])
      const options = args[1] ?? {}
      const instrumented =
        process.env.OC_PERF_INJECT_PRELOAD === "1"
          ? { ...options, preload: [options.preload ?? []].flat().concat(import.meta.path) }
          : options
      const worker = Reflect.construct(target, [args[0], instrumented]) as Worker
      write({ kind: "workerCreated", specifier, injected: process.env.OC_PERF_INJECT_PRELOAD === "1" })
      worker.addEventListener("close", () => write({ kind: "workerClosed", specifier }))
      worker.addEventListener("error", (event) => write({ kind: "workerError", specifier, message: event.message }))
      return worker
    },
  })
}
