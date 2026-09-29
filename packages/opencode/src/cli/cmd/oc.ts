import type { Argv } from "yargs"
import os from "os"
import path from "path"
import fs from "fs/promises"
import { spawn } from "child_process"
import { cmd } from "./cmd"
import * as OcConfig from "@/config/oc"
import { startIntro } from "../intro"

function runtimeArgs(args: string[]) {
  return process.execPath.toLowerCase().includes("bun") && process.argv[1] ? [process.argv[1], ...args] : args
}

async function runNative(args: string[], options: { env?: Record<string, string>; capture?: boolean } = {}) {
  const child = spawn(OcConfig.executablePath(), runtimeArgs(args), {
    cwd: os.homedir(),
    env: { ...process.env, ...options.env },
    stdio: options.capture ? ["inherit", "pipe", "pipe"] : "inherit",
  })
  let stdout = ""
  let stderr = ""
  child.stdout?.on("data", (chunk) => (stdout += String(chunk)))
  child.stderr?.on("data", (chunk) => (stderr += String(chunk)))
  const code = await new Promise<number>((resolve, reject) => {
    child.once("error", reject)
    child.once("close", (value) => resolve(value ?? 1))
  })
  if (code !== 0) throw new Error(stderr.trim() || `OpenCode exited with code ${code}`)
  return stdout.trim()
}

export function resolveTargetDirectory(target: string | undefined, ocDir = os.homedir(), homeDir = os.homedir()) {
  if (!target) return path.resolve(ocDir)
  if (path.isAbsolute(target)) return path.resolve(target)
  return path.resolve(homeDir, target)
}

async function attach(
  server: { url: string; secret: string },
  settings: OcConfig.Settings,
  options: { session?: string; directory: string },
) {
  const args = ["attach", server.url, "--dir", options.directory]
  if (options.session) args.push("--session", options.session)
  if (typeof settings.sessionModel === "string") args.push("--model", settings.sessionModel)
  if (typeof settings.sessionAgent === "string") args.push("--agent", settings.sessionAgent)
  await runNative(args, {
    env: { OPENCODE_SERVER_PASSWORD: server.secret, OPENCODE_SERVER_USERNAME: "opencode" },
  })
}

const DiagnosticsCommand = cmd({
  command: "diagnostics [args...]",
  describe: "run OpenCode with captured diagnostics",
  builder: (yargs: Argv) => yargs.positional("args", { type: "string", array: true }),
  handler: async (args) => {
    const { Global } = await import("@opencode-ai/core/global")
    const runDirectory = path.join(
      Global.Path.state,
      "oc-diagnostics",
      `interactive-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    )
    await fs.mkdir(runDirectory, { recursive: true })
    const stderrPath = path.join(runDirectory, "stderr.log")
    const metadataPath = path.join(runDirectory, "run.json")
    const metadata = {
      started: new Date().toISOString(),
      executable: OcConfig.executablePath(),
      arguments: Array.isArray(args.args) ? args.args.map(String) : [],
    }
    await fs.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8")
    const child = spawn(OcConfig.executablePath(), runtimeArgs(metadata.arguments), {
      cwd: os.homedir(),
      stdio: ["inherit", "inherit", "pipe"],
      env: { ...process.env, OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS: "true" },
    })
    let stderr = ""
    child.stderr?.on("data", (chunk) => (stderr += String(chunk)))
    const code = await new Promise<number>((resolve, reject) => {
      child.once("error", reject)
      child.once("close", (value) => resolve(value ?? 1))
    })
    await fs.writeFile(stderrPath, stderr, "utf8")
    await fs.writeFile(
      metadataPath,
      `${JSON.stringify({ ...metadata, finished: new Date().toISOString(), exitCode: code }, null, 2)}\n`,
      "utf8",
    )
    if (code !== 0) throw new Error(`OpenCode exited with code ${code}. Captured stderr: ${stderrPath}`)
  },
})

const LaunchCommand = cmd({
  command: "launch [target]",
  describe:
    "open an OC project session (resident reuse requires live PID + authenticated health; stale/foreign state is not claimed)",
  builder: (yargs: Argv) =>
    yargs
      .positional("target", { type: "string", describe: "project path or home-directory child" })
      .option("palette", {
        type: "string",
        describe: 'open palette entry by title, e.g. "New session (oc)"',
      }),
  handler: async (args) => {
    const palette = typeof args.palette === "string" ? args.palette.trim() : ""
    if (palette && args.target) throw new Error("--palette cannot be used with a launch target")
    if (palette) OcConfig.resolvePaletteLaunch(palette)

    if (palette) {
      // Direct link to TUI palette entry, no clack intermediate (Image 2 not Image 1)
      const exe = OcConfig.executablePath()
      const child = Bun.spawn([exe, "--palette", palette], {
        cwd: os.homedir(),
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      })
      await child.exited
      return
    }

    const stopIntro = startIntro()
    try {
      const settings = await OcConfig.read()
      const homeDir = typeof settings.homeDir === "string" ? settings.homeDir : os.homedir()
      const ocDir = typeof settings.ocDir === "string" ? settings.ocDir : undefined
      const directory = resolveTargetDirectory(args.target, ocDir, homeDir)
      const server = await OcConfig.startServer()
      stopIntro()

      const session = args.target
        ? JSON.parse(await runNative(["session", "bootstrap", directory], { capture: true }))
        : undefined
      await attach(server, settings, { directory, session: session?.sessionID })
    } finally {
      stopIntro()
    }
  },
})

const StableCommand = cmd({
  command: "stable [target]",
  describe: "open a standalone session in this window, independent of the resident server",
  builder: (yargs: Argv) =>
    yargs
      .positional("target", { type: "string", describe: "project path or home-directory child" })
      .option("portable", { type: "boolean", describe: "use a separate session database (ocPortable.db)" }),
  handler: async (args) => {
    const settings = await OcConfig.read()
    const homeDir = typeof settings.homeDir === "string" ? settings.homeDir : os.homedir()
    const ocDir = typeof settings.ocDir === "string" ? settings.ocDir : undefined
    const tui = [resolveTargetDirectory(args.target, ocDir, homeDir)]
    if (typeof settings.sessionModel === "string") tui.push("--model", settings.sessionModel)
    if (typeof settings.sessionAgent === "string") tui.push("--agent", settings.sessionAgent)
    await runNative(tui, { env: { OC_STABLE: "1", ...(args.portable ? { OPENCODE_DB: "ocPortable.db" } : {}) } })
  },
})

const PreviousCommand = cmd({
  command: "previous",
  describe: "open a previous global session",
  builder: (yargs: Argv) => yargs.option("depth", { type: "number", default: 1 }),
  handler: async (args) => {
    const depth = Number(args.depth)
    if (!Number.isInteger(depth) || depth < 1 || depth > 50)
      throw new Error(`Previous session depth must be between 1 and 50: ${depth}`)
    const stopIntro = startIntro()
    try {
      const settings = await OcConfig.read()
      const session = await runNative(["session", "previous", "--depth", String(depth)], { capture: true })
      const server = await OcConfig.startServer()
      stopIntro()
      await attach(server, settings, { directory: os.homedir(), session })
    } finally {
      stopIntro()
    }
  },
})

const ConfigCommand = cmd({
  command: "config",
  describe: "manage OC launcher settings",
  builder: (yargs: Argv) =>
    yargs
      .command({
        command: "set <key> <value>",
        describe: "set an OC launcher setting",
        builder: (nested) =>
          nested
            .positional("key", { type: "string", choices: [...OcConfig.keys], demandOption: true })
            .positional("value", { type: "string", demandOption: true }),
        handler: async (args) => {
          await OcConfig.update(args.key as OcConfig.Key, String(args.value))
        },
      })
      .command({
        command: "get",
        describe: "print OC launcher settings",
        handler: async () => {
          console.log(JSON.stringify(await OcConfig.read(), null, 2))
        },
      })
      .demandCommand(),
  handler: async () => {},
})

export const OcCommand = cmd({
  command: "oc",
  describe: "manage OpenCode launcher settings",
  builder: (yargs: Argv) =>
    yargs
      .option("restart-server", {
        type: "boolean",
        describe: "Restart the resident oc server",
      })
      .option("kill-server", {
        type: "boolean",
        describe: "Shut down the resident oc server",
      })
      .option("shutdown-server", {
        type: "boolean",
        describe: "Shut down the resident oc server (alias for --kill-server)",
        hidden: true,
      })
      .command(ConfigCommand)
      .command({
        command: "server start",
        describe: "start or reuse the resident OpenCode server",
        handler: async () => {
          console.log(JSON.stringify(await OcConfig.startServer()))
        },
      })
      .command(LaunchCommand)
      .command(PreviousCommand)
      .command(StableCommand)
      .command(DiagnosticsCommand)
      .check((argv) => {
        const flags = Boolean(argv["restart-server"]) || Boolean(argv["kill-server"]) || Boolean(argv["shutdown-server"])
        if (flags && argv._.length > 1) throw new Error("--restart-server and --kill-server cannot be used with a launch target")
        if (argv["restart-server"] && (argv["kill-server"] || argv["shutdown-server"]))
          throw new Error("--restart-server cannot be used with --kill-server")
        return true
      }),
  handler: async (args) => {
    const doRestart = Boolean((args as Record<string, unknown>)["restart-server"])
    const doKill = Boolean((args as Record<string, unknown>)["kill-server"] || (args as Record<string, unknown>)["shutdown-server"])
    if (doRestart) {
      console.log(JSON.stringify(await OcConfig.restartServer()))
      return
    }
    if (doKill) {
      console.log(JSON.stringify(await OcConfig.stopServer()))
      return
    }
  },
})
