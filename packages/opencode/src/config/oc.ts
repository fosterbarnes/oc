import fs from "fs/promises"
import os from "os"
import path from "path"
import { spawn } from "child_process"
import { randomBytes } from "crypto"
import { Global } from "@opencode-ai/core/global"

export const keys = [
  "homeDir",
  "homeDirSort",
  "initModel",
  "initAgent",
  "initReasoningEffort",
  "sessionModel",
  "sessionAgent",
  "defaultSubagent",
  "defaultSubagentModel",
  "reasoningEffort",
  "serverStartOnWindowsUserStart",
] as const

export type Key = (typeof keys)[number]
export type Value = string | boolean
export type Settings = Partial<Record<Key, Value>> & {
  executable?: string
  server?: { hostname?: string; port?: number; startOnWindowsUserStart?: boolean }
}

export function defaultServerPort() {
  return Global.Path.debug ? 4097 : 4096
}

function filePath() {
  return path.join(Global.Path.config, "oc.json")
}

function productionTwin(target: string) {
  return target.replaceAll("opencode-debug", "opencode")
}

async function copyIfMissing(source: string, destination: string) {
  try {
    await fs.stat(destination)
    return
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  try {
    await fs.copyFile(source, destination)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
}

async function seedDebugFromProduction() {
  if (!Global.Path.debug) return
  await fs.mkdir(Global.Path.data, { recursive: true })
  await fs.mkdir(Global.Path.config, { recursive: true })
  await copyIfMissing(path.join(productionTwin(Global.Path.data), "auth.json"), path.join(Global.Path.data, "auth.json"))
  await copyIfMissing(
    path.join(productionTwin(Global.Path.config), "config.json"),
    path.join(Global.Path.config, "config.json"),
  )
  const destination = filePath()
  try {
    await fs.stat(destination)
    return
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  const settings = await readFile(path.join(productionTwin(Global.Path.config), "oc.json"))
  await fs.writeFile(
    destination,
    `${JSON.stringify({ ...settings, server: { ...settings.server, port: defaultServerPort() } }, null, 2)}\n`,
    "utf8",
  )
}

async function readFile(file: string) {
  try {
    const raw = await fs.readFile(file, "utf8")
    return JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "")) as Settings
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}
    throw error
  }
}

export async function read() {
  await seedDebugFromProduction()
  const file = filePath()
  try {
    return await readFile(file)
  } catch (error) {
    throw new Error(`Failed to read ${file}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export async function update(key: Key, value: string) {
  const parsed: Value = value === "true" ? true : value === "false" ? false : value
  const settings = await read()
  const next =
    key === "serverStartOnWindowsUserStart"
      ? { ...settings, server: { ...settings.server, startOnWindowsUserStart: parsed } }
      : { ...settings, [key]: parsed }
  const file = filePath()
  const temporary = `${file}.tmp-${process.pid}`
  await fs.mkdir(path.dirname(file), { recursive: true })
  try {
    await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8")
    await fs.rename(temporary, file)
  } finally {
    await fs.rm(temporary, { force: true })
  }
  return next
}

export function pathName() {
  return filePath()
}

export function executablePath() {
  return process.execPath
}

function serverStateDirectory() {
  return Global.Path.state
}

function serverStatePath() {
  return path.join(serverStateDirectory(), "oc-server.json")
}

function serverSecretPath() {
  return path.join(serverStateDirectory(), "oc-server.secret")
}

async function serverSecret() {
  const file = serverSecretPath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  try {
    const secret = (await fs.readFile(file, "utf8")).trim()
    if (secret.length >= 32) return secret
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  const secret = randomBytes(32).toString("base64")
  await fs.writeFile(file, secret, "ascii")
  if (process.platform === "win32") {
    const user = Bun.spawnSync(["whoami.exe", "/user"], { stdout: "pipe", stderr: "pipe" }).stdout.toString()
    const sid = user.match(/S-\d-\d+(?:-\d+)+/)?.[0]
    if (!sid) throw new Error("Failed to determine the current Windows user SID")
    const result = Bun.spawnSync(["icacls.exe", file, "/inheritance:r", "/grant:r", `*${sid}:F`], {
      stdout: "pipe",
      stderr: "pipe",
    })
    if (result.exitCode !== 0) throw new Error(`Failed to protect resident server secret: ${result.stderr.toString()}`)
  }
  return secret
}

async function serverHealthy(url: string, secret: string) {
  try {
    const token = Buffer.from(`opencode:${secret}`).toString("base64")
    const response = await fetch(`${url}/global/health`, {
      headers: { authorization: `Basic ${token}` },
      signal: AbortSignal.timeout(1000),
    })
    return response.ok && (await response.json()).healthy === true
  } catch {
    return false
  }
}

async function startServerUnlocked() {
  const settings = await read()
  const hostname = settings.server?.hostname || "127.0.0.1"
  const port = settings.server?.port || defaultServerPort()
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new Error(`Resident OpenCode server must use a loopback hostname: ${hostname}`)
  }
  const secret = await serverSecret()
  const url = `http://${hostname}:${port}`
  let state: { pid?: number; hostname?: string; port?: number } | undefined
  try {
    state = JSON.parse(await fs.readFile(serverStatePath(), "utf8"))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  if (state?.pid && state.hostname === hostname && state.port === port && (await serverHealthy(url, secret))) {
    return { url, secret }
  }
  if (state?.pid) {
    try {
      process.kill(state.pid)
    } catch {}
  }
  const executable = executablePath()
  const command =
    executable.toLowerCase().includes("bun") && process.argv[1]
      ? [process.argv[1], "serve", "--hostname", hostname, "--port", String(port)]
      : ["serve", "--hostname", hostname, "--port", String(port)]
  const child = spawn(executable, command, {
    cwd: os.homedir(),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: {
      ...process.env,
      OPENCODE_SERVER_PASSWORD: secret,
      OPENCODE_SERVER_USERNAME: "opencode",
      ...(Global.Path.debug ? { OPENCODE_LOG_LEVEL: process.env.OPENCODE_LOG_LEVEL || "DEBUG" } : {}),
    },
  })
  child.unref()
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await serverHealthy(url, secret)) {
      await fs.writeFile(
        serverStatePath(),
        JSON.stringify({ pid: child.pid, hostname, port, executable, started: new Date().toISOString() }, null, 2),
        "utf8",
      )
      return { url, secret }
    }
    await Bun.sleep(100)
  }
  throw new Error(`Resident OpenCode server did not become ready: ${url}`)
}

export async function startServer() {
  const lock = `${serverStatePath()}.lock`
  await fs.mkdir(path.dirname(lock), { recursive: true })
  let handle: fs.FileHandle | undefined
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      handle = await fs.open(lock, "wx")
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      await Bun.sleep(100)
    }
  }
  if (!handle) throw new Error("Timed out waiting for resident OpenCode server startup")
  try {
    return await startServerUnlocked()
  } finally {
    await handle.close()
    await fs.rm(lock, { force: true })
  }
}

export * as OcConfig from "./oc"
