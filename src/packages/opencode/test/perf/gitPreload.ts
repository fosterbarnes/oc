// P7 git cost: logs every git spawn (Bun.spawn / Bun.spawnSync) to OC_PERF_LOG_DIR/git-spawn.jsonl
// and adds itself to each new Worker so the server worker is counted too.
import { appendFileSync } from "node:fs"

const dir = process.env.OC_PERF_LOG_DIR
if (dir && process.env.OC_PERF_GIT === "1") {
  const file = `${dir}/git-spawn.jsonl`
  const looksGit = (value: unknown): boolean => {
    if (typeof value === "string")
      return /(^|[\\/])git(\.exe)?$/i.test(value.trim()) || /(^|[\\/])git(\.exe)?\s/i.test(value)
    if (Array.isArray(value) && value.length) return looksGit(value[0]) || value.some((part) => looksGit(part))
    if (value && typeof value === "object" && "cmd" in value) return looksGit(value.cmd)
    return false
  }
  const note = (kind: string, argv: unknown) => {
    if (!looksGit(argv)) return
    appendFileSync(
      file,
      JSON.stringify({
        time: Date.now(),
        kind,
        argv: Array.isArray(argv) ? argv.map(String) : String(argv),
        pid: process.pid,
      }) + "\n",
    )
  }
  const spawn = Bun.spawn.bind(Bun)
  const spawnSync = Bun.spawnSync.bind(Bun)
  Object.assign(Bun, {
    spawn: (...args: Parameters<typeof spawn>) => {
      note("Bun.spawn", args[0])
      return spawn(...args)
    },
    spawnSync: (...args: Parameters<typeof spawnSync>) => {
      note("Bun.spawnSync", args[0])
      return spawnSync(...args)
    },
  })
  const NativeWorker = globalThis.Worker
  globalThis.Worker = new Proxy(NativeWorker, {
    construct(target, args) {
      const options = args[1] ?? {}
      return Reflect.construct(target, [
        args[0],
        { ...options, preload: [options.preload ?? []].flat().concat(import.meta.path) },
      ])
    },
  })
}
