import { stat } from "fs/promises"
import { Effect, Semaphore } from "effect"
import { Glob } from "@opencode-ai/core/util/glob"
import { InstanceState } from "@/effect/instance-state"

// Change detection for hot-reloaded config files (commands, skills).

export type Root = { dir: string; pattern: string; dot?: boolean }

// Matching files in root order; unreadable roots yield nothing.
export async function scan(roots: Root[]) {
  const found = await Promise.all(
    roots.map((root) =>
      Glob.scan(root.pattern, { cwd: root.dir, absolute: true, include: "file", symlink: true, dot: root.dot }).catch(
        () => [] as string[],
      ),
    ),
  )
  return [...new Set(found.flat())]
}

// Cheap signature of path, mtime, and size; changes when any file is added, edited, or removed.
export async function of(files: string[]) {
  const stats = await Promise.all(files.toSorted().map((file) => stamp(file).then((s) => `${file}:${s}`)))
  return stats.join("\n")
}

// Per-file parse cache: unchanged files (same mtime and size) reuse their previous result.
export function memo<T>() {
  const cache = new Map<string, { stamp: string; value: T }>()
  return async (file: string, parse: () => Promise<T>) => {
    const current = await stamp(file)
    const hit = cache.get(file)
    if (hit && hit.stamp === current) return hit.value
    const value = await parse()
    cache.set(file, { stamp: current, value })
    return value
  }
}

// Returns a reader that rebuilds `state` when `read` no longer matches its stored fingerprint.
// One permit per directory, so concurrent readers during a change share a single rebuild.
export function reloading<A extends { fingerprint: string }, E, R, E2, R2>(
  state: InstanceState.InstanceState<A, E, R>,
  read: Effect.Effect<string, E2, R2>,
) {
  const locks = new Map<string, Semaphore.Semaphore>()
  return Effect.fnUntraced(function* () {
    const dir = yield* InstanceState.directory
    const lock = locks.get(dir) ?? Semaphore.makeUnsafe(1)
    locks.set(dir, lock)
    return yield* lock.withPermits(1)(
      Effect.gen(function* () {
        const s = yield* InstanceState.get(state)
        if ((yield* read) === s.fingerprint) return s
        yield* InstanceState.invalidate(state)
        return yield* InstanceState.get(state)
      }),
    )
  })
}

function stamp(file: string) {
  return stat(file).then(
    (s) => `${s.mtimeMs}:${s.size}`,
    () => "missing",
  )
}

export * as Fingerprint from "./fingerprint"
