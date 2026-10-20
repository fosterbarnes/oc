import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import type { OpencodeClient } from "@opencode-ai/sdk/v2"
import { applyEdits, modify } from "jsonc-parser"
import type { ToastContext } from "./ui/toast"

function ocConfigPath(): string {
  return path.join(Global.Path.config, "oc.json")
}

export function resolveOcDirectory(value: unknown, fallback: string) {
  const directory = typeof value === "string" && value.trim() ? value.trim() : fallback
  try {
    return fs.statSync(directory).isDirectory() ? path.normalize(directory) : fallback
  } catch {
    return fallback
  }
}

export function readOcConfig(): {
  executable: string
  ocDir: string
  homeDir: string
  homeDirSort: string
  serverStartOnWindowsUserStart: boolean
  revivePath: string
  // False until the first /revive saves the source choice (`revive.build` object or `false`).
  // Without it, /revive asks first (`chooseSource` in `reviveCommands`).
  reviveSourceChosen: boolean
  // A saved source folder (`revive.build` object): /revive-single needs one.
  reviveBuild: boolean
} {
  const fallbackDir = os.homedir()
  const fallbackSort = "name"
  try {
    const parse = (file: string) => {
      const raw = fs.readFileSync(file, "utf8")
      return JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "")) as {
        executable?: unknown
        ocDir?: unknown
        homeDir?: unknown
        homeDirSort?: unknown
        server?: { startOnWindowsUserStart?: unknown }
        revive?: { path?: unknown; build?: unknown }
      }
    }
    const parsed = parse(ocConfigPath())
    const merged = {
      ...parsed,
    }
    const executable = typeof merged.executable === "string" ? merged.executable.trim() : ""
    const ocDir = resolveOcDirectory(merged.ocDir, fallbackDir)
    const homeDir = resolveOcDirectory(merged.homeDir, fallbackDir)
    const sortRaw = typeof merged.homeDirSort === "string" ? merged.homeDirSort.trim().toLowerCase() : fallbackSort
    const homeDirSort = sortRaw === "modified" ? "modified" : "name"
    const serverStartOnWindowsUserStart = merged.server?.startOnWindowsUserStart === true
    const revivePath = typeof merged.revive?.path === "string" ? merged.revive.path.trim() : ""
    const reviveSourceChosen = merged.revive?.build !== undefined
    const reviveBuild = typeof merged.revive?.build === "object" && merged.revive.build !== null
    return {
      executable,
      ocDir,
      homeDir,
      homeDirSort,
      serverStartOnWindowsUserStart,
      revivePath,
      reviveSourceChosen,
      reviveBuild,
    }
  } catch {
    return {
      executable: "",
      ocDir: fallbackDir,
      homeDir: fallbackDir,
      homeDirSort: fallbackSort,
      serverStartOnWindowsUserStart: false,
      revivePath: "",
      reviveSourceChosen: false,
      reviveBuild: false,
    }
  }
}

export function persistOcConfig(
  key: "ocDir" | "homeDir" | "homeDirSort" | "sessionModel" | "sessionAgent" | "serverStartOnWindowsUserStart",
  value: string,
  toast: ToastContext,
) {
  const config = readOcConfig()
  if (!config.executable) {
    toast.show({ message: "OpenCode executable is not configured", variant: "error" })
    return Promise.resolve(false)
  }
  const args = ["oc", "config", "set", key, value]
  const child = spawn(config.executable, args, {
    stdio: ["ignore", "ignore", "pipe"],
    cwd: os.homedir(),
    env: process.env,
  })
  let error = ""
  return new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (success: boolean) => {
      if (settled) return
      settled = true
      resolve(success)
    }
    child.stderr?.on("data", (chunk) => {
      error += String(chunk)
    })
    child.on("error", (cause) => {
      toast.show({ message: `Failed to set oc setting: ${cause.message}`, variant: "error" })
      finish(false)
    })
    child.on("exit", (code) => {
      if (code === 0) {
        toast.show({ message: `Saved oc setting ${key}: ${value}`, variant: "success" })
        finish(true)
        return
      }
      toast.show({ message: `Failed to set oc setting: ${error.trim() || `exit code ${code}`}`, variant: "error" })
      finish(false)
    })
  })
}

// Saves agent.<name>.model in the global opencode config. model is "provider/model".
// variant "" removes the agent's effort; undefined leaves it unchanged.
export async function persistAgentModel(
  client: OpencodeClient,
  name: string,
  model: string,
  toast: ToastContext,
  variant?: string,
) {
  const result = await client.global.config.update({ config: { agent: { [name]: { model, variant } } } })
  if (result.error) {
    toast.show({ message: `Failed to set ${name} model: ${String(result.error)}`, variant: "error" })
    return false
  }
  toast.show({ message: `Saved ${name} model: ${model}${variant ? `, ${variant}` : ""}`, variant: "success" })
  return true
}

// Saves settings in global tui.jsonc or tui.json (jsonc wins when loading), keeping comments.
let persistTuiSettingQueue = Promise.resolve()
export function persistTuiSetting(
  key:
    | ["keybind_preset" | "sidebar_button_style" | "smooth_streaming" | "auto_confirm_updates"]
    | ["subagent_tabs", "click" | "auto_open" | "return_to_parent"]
    | ["palette_keys"],
  value: string | boolean | Record<string, string> | undefined,
) {
  persistTuiSettingQueue = persistTuiSettingQueue
    .then(() => {
      const file =
        ["tui.jsonc", "tui.json"]
          .map((name) => path.join(Global.Path.config, name))
          .find((item) => fs.existsSync(item)) ?? path.join(Global.Path.config, "tui.json")
      const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "{}"
      const edits = modify(text, key, value, { formattingOptions: { tabSize: 2, insertSpaces: true } })
      fs.writeFileSync(file, applyEdits(text, edits))
    })
    .catch(() => {})
  return persistTuiSettingQueue
}
