import { Global } from "@opencode-ai/core/global"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { Flag } from "@opencode-ai/core/flag/flag"
import os from "os"
import { Duration, Effect } from "effect"
import { effectCmd } from "../../effect-cmd"
import { cmd } from "../cmd"
import { UI } from "../../ui"
import { ConfigCommand } from "./config"
import { FileCommand } from "./file"
import { LSPCommand } from "./lsp"
import { RipgrepCommand } from "./ripgrep"
import { ScrapCommand } from "./scrap"
import { SkillCommand } from "./skill"
import { SnapshotCommand } from "./snapshot"
import { AgentCommand } from "./agent"
import { StartupCommand } from "./startup"
import { V2Command } from "./v2"

export const DebugCommand = cmd({
  command: "debug",
  describe: "debugging and troubleshooting tools",
  builder: (yargs) =>
    yargs
      .command(ConfigCommand)
      .command(LSPCommand)
      .command(RipgrepCommand)
      .command(FileCommand)
      .command(ScrapCommand)
      .command(SkillCommand)
      .command(SnapshotCommand)
      .command(StartupCommand)
      .command(AgentCommand)
      .command(V2Command)
      .command(InfoCommand)
      .command(PathsCommand)
      .command(ProfileCommand)
      .command(WaitCommand)
      .demandCommand(),
  async handler() {},
})

const WaitCommand = effectCmd({
  command: "wait",
  describe: "wait indefinitely (for debugging)",
  handler: Effect.fn("Cli.debug.wait")(function* () {
    yield* Effect.sleep(Duration.days(1))
  }),
})

const InfoCommand = effectCmd({
  command: "info",
  describe: "show debug information",
  handler: Effect.fn("Cli.debug.info")(function* () {
    const { Config } = yield* Effect.promise(() => import("@/config/config"))
    const { ConfigPlugin } = yield* Effect.promise(() => import("@/config/plugin"))
    const config = yield* Config.Service.use((cfg) => cfg.get())
    const termProgram = process.env.TERM_PROGRAM
      ? `${process.env.TERM_PROGRAM}${process.env.TERM_PROGRAM_VERSION ? ` ${process.env.TERM_PROGRAM_VERSION}` : ""}`
      : undefined
    const terminal = [termProgram, process.env.TERM].filter((item): item is string => Boolean(item)).join(" / ")

    console.log(`opencode version: ${InstallationVersion}`)
    console.log(`os: ${os.type()} ${os.release()} ${os.arch()}`)
    console.log(`terminal: ${terminal || "unknown"}`)
    console.log("plugins:")
    if (Flag.OPENCODE_PURE) {
      console.log("external plugins disabled (--pure)")
      return
    }
    if (!config.plugin_origins?.length) {
      console.log("none")
      return
    }
    for (const plugin of config.plugin_origins) {
      console.log(`- ${ConfigPlugin.pluginSpecifier(plugin.spec)}`)
    }
  }),
})

const ProfileCommand = cmd({
  command: "profile <pid>",
  describe: "capture a CPU profile or heap snapshot from a running oc process",
  builder: (yargs) =>
    yargs
      .positional("pid", { type: "number", demandOption: true, describe: "process id of the running oc" })
      .option("heap", { type: "boolean", default: false, describe: "write a heap snapshot instead" })
      .option("seconds", { type: "number", default: 10, describe: "CPU profile length" }),
  async handler(args) {
    const { Heap } = await import("../../heap")
    const kind = args.heap ? "heap" : "cpu"
    if (!(await Heap.request(args.pid, kind, args.seconds))) {
      UI.error(`Process ${args.pid} did not pick up the request (not a running oc, or a capture is already running)`)
      process.exitCode = 1
      return
    }
    const what = args.heap ? "Heap snapshot" : `CPU profile (${args.seconds}s)`
    console.log(`${what} requested; it is written to ${Global.Path.log} as ${kind}-${args.pid}-<time>`)
  },
})

const PathsCommand = cmd({
  command: "paths [name]",
  describe: "show global paths (data, config, cache, state, db), or only the named one",
  builder: (yargs) => yargs.positional("name", { type: "string", describe: "print only this path" }),
  async handler(args) {
    const { Database } = await import("@opencode-ai/core/database/database")
    const out = selectDebugPaths({ ...Global.Path, db: Database.path() }, args.name)
    if (!out.ok) {
      UI.error(out.error)
      process.exitCode = 1
      return
    }
    console.log(out.text)
  },
})

// `debug paths <name>` prints the bare path so scripts can capture it.
export function selectDebugPaths(paths: Record<string, string>, name?: string) {
  if (!name) {
    const text = Object.entries(paths)
      .map(([key, value]) => `${key.padEnd(10)} ${value}`)
      .join("\n")
    return { ok: true as const, text }
  }
  if (Object.hasOwn(paths, name)) return { ok: true as const, text: paths[name] }
  return { ok: false as const, error: `Unknown path "${name}". Valid names: ${Object.keys(paths).join(", ")}` }
}
