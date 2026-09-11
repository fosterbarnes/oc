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

function targetDirectory(target: string | undefined, settings: OcConfig.Settings) {
  if (!target) return os.homedir()
  if (target === "." || target === ".." || path.isAbsolute(target) || /[\\/:*?"]/.test(target))
    return path.resolve(target)
  return path.resolve(typeof settings.homeDir === "string" ? settings.homeDir : os.homedir(), target)
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
    const stateHome = process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state")
    const runDirectory = path.join(
      stateHome,
      "opencode",
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
  describe: "open an OC project session",
  builder: (yargs: Argv) =>
    yargs.positional("target", { type: "string", describe: "project path or home-directory child" }),
  handler: async (args) => {
    const stopIntro = startIntro()
    try {
      const settings = await OcConfig.read()
      const directory = targetDirectory(args.target, settings)
      const server = await OcConfig.startServer()
      const session = args.target
        ? JSON.parse(await runNative(["session", "bootstrap", directory], { capture: true }))
        : undefined
      stopIntro()
      await attach(server, settings, { directory, session: session?.sessionID })
    } finally {
      stopIntro()
    }
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

export const OcCommand = cmd({
  command: "oc",
  describe: "manage OpenCode launcher settings",
  builder: (yargs: Argv) =>
    yargs
      .command({
        command: "config set <key> <value>",
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
        command: "config get",
        describe: "print OC launcher settings",
        handler: async () => {
          console.log(JSON.stringify(await OcConfig.read(), null, 2))
        },
      })
      .command({
        command: "server start",
        describe: "start or reuse the resident OpenCode server",
        handler: async () => {
          console.log(JSON.stringify(await OcConfig.startServer()))
        },
      })
      .command(LaunchCommand)
      .command(PreviousCommand)
      .command(DiagnosticsCommand)
      .demandCommand(),
  handler: async () => {},
})
