import { Effect } from "effect"
import { effectCmd } from "../effect-cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "@opencode-ai/core/flag/flag"
import { ServerLifecycle } from "@/server/lifecycle"
import { stop as stopAgentify } from "@/provider/agentify"
import { stopCursorProxy } from "@/provider/cursor/runtime"
import { spawn } from "node:child_process"
import { Global } from "@opencode-ai/core/global"

function serveArguments() {
  const commandIndex = process.argv.indexOf("serve")
  return commandIndex === -1 ? ["serve"] : process.argv.slice(commandIndex)
}

function restartProcess() {
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

function stopAndExit(server: { stop: (close?: boolean) => Promise<void> }, restart: boolean) {
  void server
    .stop(true)
    .then(() => stopAgentify())
    .then(() => stopCursorProxy())
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

    yield* Effect.never
  }),
})
