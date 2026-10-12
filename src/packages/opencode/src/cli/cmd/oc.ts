import type { Argv } from "yargs"
import os from "os"
import path from "path"
import fs from "fs/promises"
import { spawn } from "child_process"
import { cmd } from "./cmd"
import { OcConfig } from "@/config/oc"
import type { Revive } from "@/config/revive"
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
  options: { session?: string; directory: string; introFrame?: number },
) {
  const args = ["attach", server.url, "--dir", options.directory]
  if (options.session) args.push("--session", options.session)
  if (typeof settings.sessionModel === "string") args.push("--model", settings.sessionModel)
  if (typeof settings.sessionAgent === "string") args.push("--agent", settings.sessionAgent)
  await host(args, { OPENCODE_SERVER_PASSWORD: server.secret, OPENCODE_SERVER_USERNAME: "opencode" },
    options.introFrame, async (handoff) =>
      attach(await OcConfig.startServer(), settings, { directory: handoff.directory, session: handoff.sessionID }))
}

// Runs the TUI as a child of this launcher, then hosts any /revive the TUI handed off.
// `reopen` restores the old TUI in place when revive fails.
async function host(
  args: string[],
  env: Record<string, string>,
  introFrame: number | undefined,
  reopen: (handoff: { directory: string; sessionID?: string }) => Promise<void>,
) {
  const stopped = await runNative(args, {
    env: { ...env, OC_AUTO_RENAME: "1", OC_SUPERVISOR_PID: String(process.pid),
      ...(introFrame === undefined ? {} : { OC_INTRO_FRAME: String(introFrame) }) },
  }).then(() => undefined, (error: unknown) => ({ error }))
  const { Revive } = await import("@/config/revive")
  const raw = await takeHandoff(Revive.handoffPath(process.pid))
  if (raw === undefined) {
    if (stopped) throw stopped.error
    return
  }
  const handoff = Revive.parseContext(raw)
  if (stopped) {
    console.error(stopped.error)
    await waitForKey("Shutdown failed. Press any key to reopen oc without building.")
    await reopen(handoff)
    return
  }
  // This launcher shows pipeline output; failures reopen in place.
  const ignore = () => {}
  process.on("SIGINT", ignore)
  const context = Revive.encode({ ...handoff, supervisorPid: process.pid, shellPid: process.ppid })
  const failed = await runNative(["oc", "--revive", context]).then(() => false, () => true)
  if (failed) await waitForKey("Revive failed (details above). Press any key to reopen oc.")
  process.off("SIGINT", ignore)
  if (!failed) return
  await reopen(handoff)
}

// Same steps as `session bootstrap`, sent to the resident server instead of a second instance.
async function bootstrapSession(server: { url: string; secret: string }, directory: string) {
  const stat = await fs.stat(directory).catch(() => undefined)
  if (!stat?.isDirectory()) throw new Error(`Directory not found: ${directory}`)
  await OcConfig.writeSidebar(directory)
  const { createOpencodeClient } = await import("@opencode-ai/sdk/v2")
  const client = createOpencodeClient({
    baseUrl: server.url,
    directory,
    headers: { authorization: `Basic ${Buffer.from(`opencode:${server.secret}`).toString("base64")}` },
  })
  const sessions = await client.experimental.session.list({ roots: true, limit: 500 }, { throwOnError: true })
  const title = OcConfig.nextProjectTitle(sessions.data.map((item) => item.title), directory)
  const session = await client.session.create(
    { title, metadata: { ocAutoRename: { state: "pending", title } } },
    { throwOnError: true },
  )
  await client.session.prompt(
    {
      sessionID: session.data.id,
      noReply: true,
      parts: [{ type: "text", text: `Working directory initialized: ${directory}`, synthetic: true }],
    },
    { throwOnError: true },
  )
  return session.data.id
}

// Written by the TUI right before it exits for a revive.
async function takeHandoff(file: string) {
  const raw = await fs.readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (raw === undefined) return
  await fs.rm(file, { force: true })
  return JSON.parse(raw) as unknown
}

async function waitForKey(prompt: string) {
  console.log(prompt)
  if (!process.stdin.isTTY) return
  process.stdin.setRawMode(true)
  process.stdin.resume()
  await new Promise((resolve) => process.stdin.once("data", resolve)).finally(() => {
    process.stdin.setRawMode(false)
    process.stdin.pause()
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
      .option("session", { type: "string", describe: "resume this session without creating another" })
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
      // Opens in the native opencode window: `oc.exe --palette` would rewrite back to `oc launch`.
      const { Revive } = await import("@/config/revive")
      const exe = Revive.nativeExecutable(OcConfig.executablePath())
      const child = Bun.spawn([exe, "--palette", palette], {
        cwd: os.homedir(),
        env: { ...process.env, OC_AUTO_RENAME: "1", OC_FLAVOR: "native" },
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      })
      await child.exited
      return
    }

    await launchProject(args.target, { session: args.session })
  },
})

// A target gets a fresh bootstrapped session; no target opens the home screen.
async function launchProject(target: string | undefined, options: { session?: string }) {
  const settings = await OcConfig.read()
  const stopIntro = startIntro(settings.intro?.background)
  try {
    const homeDir = typeof settings.homeDir === "string" ? settings.homeDir : os.homedir()
    const ocDir = typeof settings.ocDir === "string" ? settings.ocDir : undefined
    const directory = resolveTargetDirectory(target, ocDir, homeDir)
    const server = await OcConfig.startServer()
    const session = options.session ?? (target ? await bootstrapSession(server, directory) : undefined)
    // Leave the intro frame up; the TUI's first alternate-screen frame continues it.
    await attach(server, settings, { directory, session, introFrame: stopIntro(false) })
  } finally {
    stopIntro()
  }
}

const PreviousCommand = cmd({
  command: "previous",
  describe: "open a previous global session",
  builder: (yargs: Argv) =>
    yargs
      .option("depth", { type: "number", default: 1 }),
  handler: async (args) => {
    const depth = Number(args.depth)
    if (!Number.isInteger(depth) || depth < 1 || depth > 50)
      throw new Error(`Previous session depth must be between 1 and 50: ${depth}`)
    const settings = await OcConfig.read()
    const stopIntro = startIntro(settings.intro?.background)
    try {
      const lookup = runNative(["session", "previous", "--depth", String(depth)], { capture: true })
      // Independent startup work: the session lookup is its own process, so overlap it with server startup.
      const [session, server] = await Promise.all([lookup, OcConfig.startServer()])
      await attach(server, settings, { directory: os.homedir(), session, introFrame: stopIntro(false) })
    } finally {
      stopIntro()
    }
  },
})

const ReviveTabsCommand = cmd({
  command: "revive-tabs <tabs>",
  describe: false,
  builder: (yargs: Argv) => yargs.positional("tabs", { type: "string", demandOption: true }),
  handler: async (args) => {
    const { Revive } = await import("@/config/revive")
    const tabs = Revive.decodeTabs(args.tabs)
    const pane = process.env.WEZTERM_PANE
    if (!pane) throw new Error("oc revive-tabs must run in a WezTerm pane")
    // Each spawn appends a tab; waiting preserves the saved order.
    for (const tab of tabs.slice(1)) {
      await spawnTab(pane, tab).catch((error: unknown) =>
        console.error(`Tab not restored: ${error instanceof Error ? error.message : String(error)}`))
    }
    const [first] = tabs
    if (first.kind === "oc") {
      await launchProject(first.sessionID ? first.directory : undefined, { session: first.sessionID })
      return
    }
    const code = await Bun.spawn(["pwsh", "-NoLogo"], { cwd: first.cwd, stdio: ["inherit", "inherit", "inherit"] }).exited
    if (code !== 0) throw new Error(`pwsh exited with code ${code}`)
  },
})

async function spawnTab(pane: string, tab: Revive.Tab) {
  const args = tab.kind === "oc"
    ? ["--cwd", tab.directory, "--", OcConfig.executablePath(),
      ...runtimeArgs(["oc", "launch",
        ...(tab.sessionID ? [tab.directory, "--session", tab.sessionID] : [])])]
    : ["--cwd", tab.cwd]
  const child = Bun.spawn(["wezterm", "cli", "spawn", "--pane-id", pane, ...args],
    { stdout: "ignore", stderr: "pipe" })
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
  if (code !== 0) {
    throw new Error(`wezterm cli spawn exited with code ${code}: ${stderr.trim()}`)
  }
}

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
      .option("shutdown-all", {
        type: "boolean",
        describe: "Shut down this instance's resident server and close its oc terminals",
      })
      .option("revive", {
        type: "string",
        hidden: true,
        describe: "Run the revive pipeline for an encoded context",
      })
      .option("revive-terminal", {
        type: "string",
        hidden: true,
        describe: "Close the old oc window and open a new terminal using an encoded context",
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
      .command(DiagnosticsCommand)
      .command(ReviveTabsCommand)
      .check((argv) => {
        const kill = Boolean(argv["kill-server"]) || Boolean(argv["shutdown-server"])
        const selected = [Boolean(argv["restart-server"]), kill, Boolean(argv["shutdown-all"]),
          argv.revive !== undefined, argv["revive-terminal"] !== undefined].filter(Boolean).length
        if (selected > 0 && argv._.length > 1)
          throw new Error("Server controls and --revive cannot be used with a launch target")
        if (selected > 1) throw new Error("Use only one server control or --revive")
        return true
      }),
  handler: async (args) => {
    if (args.revive !== undefined) {
      const { Revive } = await import("@/config/revive")
      await OcConfig.revive(Revive.decodeContext(args.revive))
      return
    }
    if (args["revive-terminal"] !== undefined) {
      const { Revive } = await import("@/config/revive")
      await OcConfig.restartTerminal(Revive.decodeRestart(args["revive-terminal"]))
      return
    }
    if ((args as Record<string, unknown>)["shutdown-all"]) {
      console.log(JSON.stringify(await OcConfig.shutdownAll()))
      return
    }
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

