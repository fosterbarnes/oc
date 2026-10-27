import { Effect } from "effect"
import { effectCmd } from "../effect-cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "@opencode-ai/core/flag/flag"
import { ServerLifecycle } from "@/server/lifecycle"
import { stopCursorProxy } from "@/provider/cursor/runtime"
import { CuaDriver } from "@/tool/cuaDriver"
import fs from "node:fs/promises"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { RESIDENT_ENV, residentRestartFresh, spawnResident, writeResidentState } from "@/config/resident"

export { writeResidentState }

export function serveArguments() {
  const commandIndex = process.argv.indexOf("serve")
  return commandIndex === -1 ? ["serve"] : process.argv.slice(commandIndex)
}

export function restartProcess() {
  const args = serveArguments()
  const executable = Global.resolveExecutablePath()
  const command = executable.toLowerCase().includes("bun") && process.argv[1] ? [process.argv[1], ...args] : args
  return spawnResident(executable, command)
}

function residentStatePath(directory = Global.Path.state) {
  return path.join(directory, "oc-server.json")
}

export function shouldClearResidentState(restart: boolean) {
  return !restart
}

// Only the process a record names may clear it: an old server must not drop its replacement's record.
export async function clearResidentStateForRestart(directory = Global.Path.state, pid = process.pid) {
  try {
    const state = JSON.parse(await fs.readFile(residentStatePath(directory), "utf8")) as {
      pid?: number
      restarting?: string
    }
    if (state.pid !== pid) return
    // A CLI restart marks state before asking this process to shut down.
    if (residentRestartFresh(state.restarting)) return
    await fs.rm(residentStatePath(directory), { force: true })
  } catch {}
}

// Stamps a restart on this process's own record; a record owned by another pid is left alone.
export async function markResidentRestart(input: { hostname: string; port: number; directory?: string; pid?: number }) {
  const directory = input.directory ?? Global.Path.state
  const pid = input.pid ?? process.pid
  let existing: { pid?: number; executable?: string; created?: string } = {}
  try {
    existing = JSON.parse(await fs.readFile(residentStatePath(directory), "utf8"))
  } catch {}
  if (existing.pid && existing.pid !== pid) return
  await writeResidentState({
    pid,
    hostname: input.hostname,
    port: input.port,
    executable: existing.executable,
    created: existing.created,
    restarting: new Date().toISOString(),
    directory,
  })
}

export function stopAndExit(
  server: { hostname: string; port: number; stop: (close?: boolean) => Promise<void> },
  restart: boolean,
  resident: boolean,
  exit: (code: number) => void = process.exit,
) {
  // Mark before the port closes. A launch during shutdown must see a fresh restart,
  // not a dead pid with the port already down. A nonresident serve shares the state
  // directory but never touches the resident record.
  const prepare =
    restart && resident ? markResidentRestart({ hostname: server.hostname, port: server.port }) : Promise.resolve()
  return prepare
    .then(() => server.stop(true))
    .then(() => stopCursorProxy())
    .then(() => CuaDriver.stopCuaDriver())
    .then(() => (resident && shouldClearResidentState(restart) ? clearResidentStateForRestart() : undefined))
    .then(() => (restart ? restartProcess() : undefined))
    .then(() => exit(0))
    .catch((error) => {
      console.error(error)
      exit(1)
    })
}

export const ServeCommand = effectCmd({
  command: "serve",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "starts a headless opencode server",
  // Server loads instances per-request via x-opencode-directory header — no
  // need for an ambient project InstanceContext at startup.
  instance: false,
  handler: Effect.fn("Cli.serve")(function* (args) {
    const { Server } = yield* Effect.promise(() => import("../../server/server"))
    if (!Flag.OPENCODE_SERVER_PASSWORD) {
      console.log("Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.")
    }
    const opts = yield* resolveNetworkOptions(args)
    const server = yield* Effect.promise(() => Server.listen(opts))
    const resident = process.env[RESIDENT_ENV] === "1"
    ServerLifecycle.setController({
      markRestart: () =>
        resident ? markResidentRestart({ hostname: server.hostname, port: server.port }) : Promise.resolve(),
      shutdown: () => void stopAndExit(server, false, resident),
      restart: () => void stopAndExit(server, true, resident),
    })
    console.log(`opencode server listening on http://${server.hostname}:${server.port}`)
    if (resident) {
      yield* Effect.promise(() =>
        writeResidentState({
          pid: process.pid,
          hostname: server.hostname,
          port: server.port,
          executable: Global.resolveExecutablePath(),
        }),
      )
    }

    yield* Effect.never
  }),
})
