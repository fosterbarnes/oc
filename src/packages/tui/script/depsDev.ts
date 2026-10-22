#!/usr/bin/env bun
// The `oc oc deps` engine run from source for ocSetup's `--dev` mode (.scripts\.runCompanion.ps1).
// Same output contract as DepsCommand in packages/opencode/src/cli/cmd/oc.ts (list: the table
// line, then one line per row as detected; see printDependencyList):
//   depsDev.ts [--fake] [--fail <id>]... list | install <ids..>
// --fake keeps the real table and scheduler (order, needs, lanes, prefetch) and replaces only
// detection and the download/install work, so nothing is installed. Fake installs are remembered
// in %TEMP%\ocSetup-fake-state.json until .runCompanion.ps1 starts a new fake run.
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { parseArgs } from "node:util"
import {
  DEPENDENCIES,
  installDependencies,
  printDependencyList,
  runInstalls,
  type Dependency,
  type InstallEvent,
} from "../src/dependencies"
import { PROGRESS_PREFIX, STEP_PREFIX } from "../src/desktopUpdate"

type Detection = Awaited<ReturnType<Dependency["detect"]>>
type OnLine = (line: string) => void

const { values, positionals } = parseArgs({
  options: { fake: { type: "boolean" }, fail: { type: "string", multiple: true } },
  allowPositionals: true,
})
const [command, ...ids] = positionals
const emit = (event: InstallEvent) => console.log(JSON.stringify(event))

const STATE_FILE = path.join(tmpdir(), "ocSetup-fake-state.json")
// One row per UI state; rows not listed are missing.
const FAKE_STATUS: Record<string, Detection> = {
  pwsh: { status: "found", version: "7.5.4" },
  git: { status: "found", version: "2.51.0" },
  node: { status: "outdated", version: "20.18.0", latest: "22.20.0" },
  everything: { status: "missing", message: "es.exe not found" },
  claudeDesktop: { status: "error", message: "Fake check failed" },
}
const DOWNLOAD_MB = 40
const failing = new Set(values.fail ?? [])

function installedIds(): string[] {
  return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : []
}

// `fail`: throw mid-download, like a broken download in a prefetched row would.
async function fakeDownload(onLine: OnLine, fail = false) {
  onLine(`${STEP_PREFIX}downloading`)
  for (let mb = 0; mb <= DOWNLOAD_MB; mb += 5) {
    if (fail && mb === 20) throw new Error("Fake download failure")
    onLine(`${PROGRESS_PREFIX}${mb * 1_048_576} ${DOWNLOAD_MB * 1_048_576}`)
    await Bun.sleep(150)
  }
  onLine(`${STEP_PREFIX}verifying`)
  await Bun.sleep(400)
}

async function fakeInstall(dep: Dependency, onLine: OnLine) {
  onLine(`${STEP_PREFIX}installing`)
  await Bun.sleep(1500)
  if (failing.has(dep.id)) return { ok: false, message: "Fake install failure" }
  // Synchronous read-modify-write: parallel lanes share this one thread.
  writeFileSync(STATE_FILE, JSON.stringify([...installedIds(), dep.id]))
  return { ok: true, message: `Installed ${dep.label}` }
}

function fake(dep: Dependency): Dependency {
  const base = {
    ...dep,
    detect: async (): Promise<Detection> =>
      installedIds().includes(dep.id)
        ? { status: "found", version: "1.0.0" }
        : (FAKE_STATUS[dep.id] ?? { status: "missing" }),
    // Placeholder targets keep the shortcut column live; dev mode never writes shortcuts.
    shortcut: dep.shortcut && { name: dep.shortcut.name, find: () => ({ target: `C:\\dev\\${dep.id}.exe` }) },
  }
  if (dep.prepare) {
    return {
      ...base,
      install: undefined,
      prepare: async (_dir: string, onLine: OnLine) => {
        await fakeDownload(onLine, failing.has(dep.id))
        return (_env: NodeJS.ProcessEnv, installLine: OnLine) => fakeInstall(dep, installLine)
      },
    }
  }
  return {
    ...base,
    prepare: undefined,
    install: async (_env, onLine) => {
      // Install-only rows (Codex CLI's npm install) download inside their install turn.
      await fakeDownload(onLine)
      return fakeInstall(dep, onLine)
    },
  }
}

const deps = values.fake ? DEPENDENCIES.map(fake) : DEPENDENCIES
if (command === "list") {
  await printDependencyList(console.log, deps)
} else if (command === "install" && ids.length) {
  const ok = values.fake ? await runInstalls(deps, ids, emit, async () => ({})) : await installDependencies(ids, emit)
  if (!ok) process.exitCode = 1
} else {
  console.error("Usage: depsDev.ts [--fake] [--fail <id>]... list | install <ids..>")
  process.exitCode = 2
}
