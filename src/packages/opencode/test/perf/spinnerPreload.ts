// P4 spinner cost: logs each spinner timer wake (a timer callback that calls `.tick(`) and each
// OpenTUI render frame (`CliRenderer.loop`) to OC_PERF_LOG_DIR/spinner-wakes.jsonl.
import { appendFileSync } from "node:fs"
import path from "node:path"

const dir = process.env.OC_PERF_LOG_DIR
if (dir && process.env.OC_PERF_SPINNER === "1") {
  const file = `${dir}/spinner-wakes.jsonl`
  const wrap = <T extends (handler: TimerHandler, delay?: number, ...args: unknown[]) => unknown>(orig: T) =>
    ((fn: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (typeof fn !== "function" || !fn.toString().includes(".tick(")) return orig(fn, delay, ...args)
      const tagged = function (this: unknown, ...inner: unknown[]) {
        appendFileSync(file, JSON.stringify({ time: Date.now(), kind: "tick" }) + "\n")
        return fn.apply(this, inner)
      }
      return orig(tagged, delay, ...args)
    }) as T
  Object.assign(globalThis, { setTimeout: wrap(globalThis.setTimeout), setInterval: wrap(globalThis.setInterval) })

  type Renderer = { prototype?: { loop?: (...args: unknown[]) => unknown } }
  const patch = (CliRenderer: Renderer) => {
    const orig = CliRenderer.prototype?.loop
    if (!orig || (orig as { ocPerf?: boolean }).ocPerf) return
    const wrapped = function (this: unknown, ...args: unknown[]) {
      appendFileSync(file, JSON.stringify({ time: Date.now(), kind: "frame" }) + "\n")
      return orig.apply(this, args)
    }
    ;(wrapped as { ocPerf?: boolean }).ocPerf = true
    CliRenderer.prototype!.loop = wrapped
  }
  // The TUI loads OpenTUI from the tui package, so patch that copy.
  void import(path.resolve(import.meta.dir, "../../../tui/node_modules/@opentui/core/index.bun.js"))
    .then((mod: { CliRenderer?: Renderer }) => {
      if (mod.CliRenderer) patch(mod.CliRenderer)
    })
    .catch(() => {})
}
