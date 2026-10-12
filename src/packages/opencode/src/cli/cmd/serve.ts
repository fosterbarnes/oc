import { Effect } from "effect"
import { effectCmd } from "../effect-cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "@opencode-ai/core/flag/flag"
import { ServerLifecycle } from "@/server/lifecycle"
import { stopCursorProxy } from "@/provider/cursor/runtime"
import fs from "node:fs/promises"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { RESIDENT_ENV, spawnResident, writeResidentState } from "@/config/oc"

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

export async function clearResidentStateForRestart(directory = Global.Path.state) {
  try {
    await fs.rm(residentStatePath(directory), { force: true })
  } catch {}
}

export async function markResidentRestart(input: { hostname: string; port: number; directory?: string }) {
  const directory = input.directory ?? Global.Path.state
  let existing: { pid?: number; executable?: string } = {}
  try {
    existing = JSON.parse(await fs.readFile(residentStatePath(directory), "utf8"))
  } catch {}
  await writeResidentState({
    pid: existing.pid && existing.pid > 0 ? existing.pid : process.pid,
    hostname: input.hostname,
    port: input.port,
    executable: existing.executable,
    restarting: new Date().toISOString(),
    directory,
  })
}

function stopAndExit(server: { hostname: string; port: number; stop: (close?: boolean) => Promise<void> }, restart: boolean) {
  // Mark before the port closes. A launch during shutdown must see a fresh restart,
  // not a dead pid with the port already down.
  const prepare = restart ? markResidentRestart({ hostname: server.hostname, port: server.port }) : Promise.resolve()
  void prepare
    .then(() => server.stop(true))
    .then(() => stopCursorProxy())
    .then(() => (shouldClearResidentState(restart) ? clearResidentStateForRestart() : undefined))
    .then(() => (restart ? restartProcess() : undefined))
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error)
      process.exit(1)
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
    ServerLifecycle.setController({
      shutdown: () => stopAndExit(server, false),
      restart: () => stopAndExit(server, true),
    })
    console.log(`opencode server listening on http://${server.hostname}:${server.port}`)
    if (process.env[RESIDENT_ENV] === "1") {
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
