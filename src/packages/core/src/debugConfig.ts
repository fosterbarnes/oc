import fs from "fs/promises"
import path from "path"
import { Global } from "./global"

const CONFIG_FILES = ["config.json", "opencode.json", "opencode.jsonc", "tui.json", "tui.jsonc"]
const CONFIG_DIRECTORIES = [
  "agent",
  "agents",
  "command",
  "commands",
  "mode",
  "modes",
  "plugin",
  "plugins",
  "skill",
  "skills",
  "tool",
  "tools",
  "themes",
  "prompts",
]

type ConfigRoots = {
  data: string
  config: string
}

type LauncherSettings = Record<string, unknown> & {
  server?: Record<string, unknown>
}

export async function sync(input: {
  production: ConfigRoots
  debug: ConfigRoots
  overwrite: boolean
  serverPort: number
}) {
  await Promise.all([
    fs.mkdir(input.debug.data, { recursive: true }),
    fs.mkdir(input.debug.config, { recursive: true }),
  ])

  const copied = await Promise.all([
    copyFile(path.join(input.production.data, "auth.json"), path.join(input.debug.data, "auth.json"), input.overwrite),
    ...CONFIG_FILES.map((file) =>
      copyFile(path.join(input.production.config, file), path.join(input.debug.config, file), input.overwrite),
    ),
    ...CONFIG_DIRECTORIES.map((directory) =>
      copyDirectory(
        path.join(input.production.config, directory),
        path.join(input.debug.config, directory),
        input.overwrite,
      ),
    ),
    copyLauncher(
      path.join(input.production.config, "oc.json"),
      path.join(input.debug.config, "oc.json"),
      input.overwrite,
      input.serverPort,
    ),
  ])

  return copied.flatMap((file) => (file ? [file] : []))
}

export async function syncFromProduction(input: { overwrite: boolean; serverPort: number }) {
  if (!Global.Path.debug) return []
  return sync({
    production: {
      data: productionTwin(Global.Path.data),
      config: productionTwin(Global.Path.config),
    },
    debug: {
      data: Global.Path.data,
      config: Global.Path.config,
    },
    ...input,
  })
}

async function copyFile(source: string, destination: string, overwrite: boolean) {
  if (!overwrite && (await exists(destination))) return
  try {
    await fs.copyFile(source, destination)
    return path.basename(destination)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
}

async function copyDirectory(source: string, destination: string, overwrite: boolean) {
  if (!overwrite && (await exists(destination))) return
  try {
    await fs.cp(source, destination, { recursive: true, force: overwrite })
    return path.basename(source)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ENOENT" || (!overwrite && code === "EEXIST")) return
    throw error
  }
}

async function copyLauncher(source: string, destination: string, overwrite: boolean, serverPort: number) {
  if (!overwrite && (await exists(destination))) return
  const settings = await readJson(source)
  if (!settings) return
  await fs.writeFile(
    destination,
    `${JSON.stringify({ ...settings, server: { ...settings.server, port: serverPort } }, null, 2)}\n`,
    "utf8",
  )
  return path.basename(destination)
}

async function exists(file: string) {
  try {
    await fs.access(file)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    return false
  }
}

async function readJson(file: string) {
  try {
    const raw = await fs.readFile(file, "utf8")
    const parsed: unknown = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ""))
    return isRecord(parsed) ? parsed : undefined
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return
    throw error
  }
}

function productionTwin(target: string) {
  return target.replaceAll("opencode-debug", "opencode")
}

function isRecord(input: unknown): input is LauncherSettings {
  return typeof input === "object" && input !== null && !Array.isArray(input)
}

export * as DebugConfig from "./debugConfig"
