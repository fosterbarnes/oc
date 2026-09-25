import { Effect } from "effect"
import { effectCmd } from "../effect-cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "@opencode-ai/core/flag/flag"
import { ServerLifecycle } from "@/server/lifecycle"
import { stop as stopAgentify } from "@/provider/agentify"
import { stopCursorProxy } from "@/provider/cursor/runtime"
import fs from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"
import { Global } from "@opencode-ai/core/global"
import { RESIDENT_ENV } from "@/config/oc"

export function serveArguments() {
  const commandIndex = process.argv.indexOf("serve")
  return commandIndex === -1 ? ["serve"] : process.argv.slice(commandIndex)
}

export function restartProcess() {
  const args = serveArguments()
  const executable = Global.resolveExecutablePath()
  const command = executable.toLowerCase().includes("bun") && process.argv[1] ? [process.argv[1], ...args] : args
  const child = spawn(executable, command, {
    detached: true,
    stdio: "ignore",
    windowsHide: process.platform === "win32",
  })
  child.unref()
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

export async function writeResidentState(input: {
  pid: number
  hostname: string
  port: number
  executable?: string
  restarting?: string
  directory?: string
}) {
  const file = residentStatePath(input.directory ?? Global.Path.state)
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`
  const body = {
    pid: input.pid,
    hostname: input.hostname,
    port: input.port,
    executable: input.executable,
    restarting: input.restarting,
    started: new Date().toISOString(),
  }
  await fs.writeFile(temporary, `${JSON.stringify(body, null, 2)}\n`, "utf8")
  await fs.rm(file, { force: true })
  try {
    await fs.rename(temporary, file)
  } catch (error) {
    await fs.rm(temporary, { force: true })
    throw error
  }
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
    .then(() => stopAgentify())
    .then(() => stopCursorProxy())
    .then(() => (shouldClearResidentState(restart) ? clearResidentStateForRestart() : undefined))
    .then(() => {
      if (restart) restartProcess()
      process.exit(0)
    })
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
