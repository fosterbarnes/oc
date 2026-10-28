// Live TUI config: tui.json saves swap the resolved config in place (upstream 014908a8d7).
// Readers keep one stable object; property reads go through a signal, so reactive readers
// (keybind layers, sidebar settings) pick up the new values without a restart.
import { statSync, watch, type FSWatcher } from "fs"
import path from "path"
import { createSignal } from "solid-js"

export type ConfigWatch<T> = {
  files: string[]
  reload: () => Promise<T>
}

export function createLiveConfig<T extends object>(initial: T) {
  const [current, setCurrent] = createSignal(initial)
  const config = new Proxy({} as T, {
    get: (_, key) => Reflect.get(current(), key),
    has: (_, key) => Reflect.has(current(), key),
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (_, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(current(), key)
      return descriptor && { ...descriptor, configurable: true }
    },
  })
  return { config, replace: (next: T) => setCurrent(() => next) }
}

/**
 * Watches each file's directory (editors often replace the file), debounces bursts of events, and
 * fires only when a file's modified time or size moved, or it appeared or disappeared.
 */
export function watchConfigFiles(files: string[], onChange: () => void, delay = 150) {
  const byDir = Map.groupBy(files, (file) => path.dirname(file))
  let timer: ReturnType<typeof setTimeout> | undefined
  let stamps = files.map(stamp)
  // Windows also reports a read's last-access update as a change (NTFS, at most hourly), so a new
  // TUI's startup read used to reload every open TUI. Compare after the burst settles.
  const reloadIfChanged = () => {
    const next = files.map(stamp)
    if (next.every((value, index) => value === stamps[index])) return
    stamps = next
    onChange()
  }
  const watchers = [...byDir].flatMap(([dir, list]): FSWatcher[] => {
    const names = new Set(list.map((file) => path.basename(file)))
    try {
      const watcher = watch(dir, (_, name) => {
        if (name && !names.has(name.toString())) return
        clearTimeout(timer)
        timer = setTimeout(reloadIfChanged, delay)
      })
      // A removed directory ends its watch instead of throwing an unhandled error event
      watcher.on("error", () => watcher.close())
      return [watcher]
    } catch {
      // Directory does not exist (no global or project config yet)
      return []
    }
  })
  return () => {
    clearTimeout(timer)
    for (const watcher of watchers) watcher.close()
  }
}

function stamp(file: string) {
  const stat = statSync(file, { throwIfNoEntry: false })
  return stat && `${stat.mtimeMs}:${stat.size}`
}
