import path from "path"
import fs from "fs/promises"
import { xdgData, xdgCache, xdgConfig, xdgState } from "xdg-basedir"
import os from "os"
import { Context, Effect, Layer } from "effect"
import { Flock } from "./util/flock"
import { Flag } from "./flag/flag"
import { makeGlobalNode } from "./effect/app-node"

declare global {
  const OPENCODE_FLAVOR: string
}

// Build flavor: `oc` (launcher, resident server, revive host) or `native` (opencode.exe: in-process
// TUI + worker like upstream). Compiled builds bake it in; `bun dev` reads OC_FLAVOR.
// Gate on this only where a feature needs the resident server; everything else is shared.
export const native =
  typeof OPENCODE_FLAVOR === "string" ? OPENCODE_FLAVOR === "native" : process.env.OC_FLAVOR === "native"

export function isDebugExecutable(execPath = process.execPath) {
  const base = executableBasename(execPath)
  return base === "ocdebug" || base === "oc-debug" || base === "opencode-debug"
}

function executableBasename(execPath: string) {
  const file = execPath.split(/[\\/]/).pop() ?? execPath
  const ext = path.extname(file)
  return file.slice(0, file.length - ext.length).toLowerCase()
}

// `occ.exe` is a hard link to `oc.exe`; process lookups and ledgers use the real name.
export function resolveExecutablePath(execPath = process.execPath) {
  if (executableBasename(execPath) !== "occ") return execPath
  const mod = execPath.includes("\\") ? path.win32 : path.posix
  return mod.join(mod.dirname(execPath), `oc${mod.extname(execPath)}`)
}

export function resolveAppName(input: { instance?: string; execPath?: string } = {}) {
  const env = (input.instance ?? process.env.OPENCODE_INSTANCE)?.trim().toLowerCase()
  const execPath = input.execPath ?? process.execPath
  if (env === "debug" || env === "opencode-debug" || env === "ocdebug" || isDebugExecutable(execPath)) {
    return "opencode-debug"
  }
  return "opencode"
}

const app = resolveAppName()
const data = path.join(xdgData!, app)
const cache = path.join(xdgCache!, app)
const config = path.join(xdgConfig!, app)
const state = path.join(xdgState!, app)
const tmp = path.join(os.tmpdir(), app)

const paths = {
  get home() {
    return process.env.OPENCODE_TEST_HOME ?? os.homedir()
  },
  app,
  debug: app === "opencode-debug",
  data,
  bin: path.join(cache, "bin"),
  log: path.join(data, "log"),
  repos: path.join(data, "repos"),
  cache,
  config,
  state,
  tmp,
}

export const Path = paths

Flock.setGlobal({ state })

await Promise.all([
  fs.mkdir(Path.data, { recursive: true }),
  fs.mkdir(Path.config, { recursive: true }),
  fs.mkdir(Path.state, { recursive: true }),
  fs.mkdir(Path.tmp, { recursive: true }),
  fs.mkdir(Path.log, { recursive: true }),
  fs.mkdir(Path.bin, { recursive: true }),
  fs.mkdir(Path.repos, { recursive: true }),
])

export class Service extends Context.Service<Service, Interface>()("@opencode/Global") {}

export interface Interface {
  readonly home: string
  readonly data: string
  readonly cache: string
  readonly config: string
  readonly state: string
  readonly tmp: string
  readonly bin: string
  readonly log: string
  readonly repos: string
}

export function make(input: Partial<Interface> = {}): Interface {
  return {
    home: Path.home,
    data: Path.data,
    cache: Path.cache,
    config: Flag.OPENCODE_CONFIG_DIR ?? Path.config,
    state: Path.state,
    tmp: Path.tmp,
    bin: Path.bin,
    log: Path.log,
    repos: Path.repos,
    ...input,
  }
}

const layer = Layer.effect(
  Service,
  Effect.sync(() => Service.of(make())),
)

export const node = makeGlobalNode({ service: Service, layer: layer, deps: [] })

export const layerWith = (input: Partial<Interface>) =>
  Layer.effect(
    Service,
    Effect.sync(() => Service.of(make(input))),
  )

export * as Global from "./global"
