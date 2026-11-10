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
  serverStartAtLogin: boolean
  // False until the first /revive saves the source choice (`revive.build` object or `false`).
  // Without it, /revive asks first (`chooseSource` in `reviveCommands`).
  reviveSourceChosen: boolean
  // A saved source folder (`revive.build` object): /revive-single needs one.
  reviveBuild: boolean
  // That folder's path (`revive.build.source`): /update syncs it to GitHub main.
  reviveSource: string | undefined
  // `ask`: a Claude usage limit mid-turn asks which account to continue on (opencode `turnStream`).
  claudeFailover: "auto" | "ask"
  // With claude-code `apiAccount` set and every account limited: use API credits (opencode `turnStream`).
  claudeApiRollover: "ask" | "always" | "off"
  // Claude account names keyed by the `accounts` entry as written (opencode accounts.ts).
  claudeAccountNames: Record<string, string>
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
        server?: { startAtLogin?: unknown; startOnWindowsUserStart?: unknown }
        revive?: { build?: unknown }
        claudeFailover?: unknown
        claudeApiRollover?: unknown
        claudeAccountNames?: unknown
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
    // `startOnWindowsUserStart` is the old key; opencode OcConfig.update drops it on the next save.
    const serverStartAtLogin = (merged.server?.startAtLogin ?? merged.server?.startOnWindowsUserStart) === true
    const reviveSourceChosen = merged.revive?.build !== undefined
    const reviveBuild = typeof merged.revive?.build === "object" && merged.revive.build !== null
    const source = reviveBuild ? (merged.revive?.build as { source?: unknown }).source : undefined
    const reviveSource = typeof source === "string" && source.trim() ? source : undefined
    const claudeFailover = merged.claudeFailover === "ask" ? "ask" : "auto"
    const claudeApiRollover =
      merged.claudeApiRollover === "always" || merged.claudeApiRollover === "off" ? merged.claudeApiRollover : "ask"
    const names = merged.claudeAccountNames
    const claudeAccountNames =
      names && typeof names === "object"
        ? Object.fromEntries(
            Object.entries(names).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
          )
        : {}
    return {
      executable,
      ocDir,
      homeDir,
      homeDirSort,
      serverStartAtLogin,
      reviveSourceChosen,
      reviveBuild,
      reviveSource,
      claudeFailover,
      claudeApiRollover,
      claudeAccountNames,
    }
  } catch {
    return {
      executable: "",
      ocDir: fallbackDir,
      homeDir: fallbackDir,
      homeDirSort: fallbackSort,
      serverStartAtLogin: false,
      reviveSourceChosen: false,
      reviveBuild: false,
      reviveSource: undefined,
      claudeFailover: "auto",
      claudeApiRollover: "ask",
      claudeAccountNames: {},
    }
  }
}

export function persistOcConfig(
  key:
    | "ocDir"
    | "homeDir"
    | "homeDirSort"
    | "sessionModel"
    | "sessionAgent"
    | "serverStartAtLogin"
    | "claudeFailover"
    | "claudeApiRollover",
  value: string,
  toast: ToastContext,
) {
  // `executable` in oc.json is an optional override; nothing writes it, so default to the running binary.
  // Native opencode refuses `oc` commands, so it uses the `oc` binary installed beside it.
  // Under `bun dev` bun reruns the entry script (as `runtimeArgs` in opencode cli/cmd/oc.ts) with the oc flavor.
  const bunDev = /^bun(?:\.exe)?$/i.test(path.basename(process.execPath)) && process.argv[1]
  const executable =
    readOcConfig().executable ||
    (bunDev || !Global.native
      ? Global.resolveExecutablePath()
      : path.join(path.dirname(process.execPath), `oc${path.extname(process.execPath)}`))
  const args = ["oc", "config", "set", key, value]
  const child = spawn(executable, bunDev && executable === process.execPath ? [process.argv[1], ...args] : args, {
    stdio: ["ignore", "ignore", "pipe"],
    cwd: os.homedir(),
    env: { ...process.env, OC_FLAVOR: "oc" },
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
    | [
        | "keybind_preset"
        | "sidebar_button_style"
        | "smooth_streaming"
        | "daily_theme"
        | "daily_theme_native"
        | "auto_confirm_updates",
      ]
    | ["subagent_tabs", "click" | "auto_open" | "return_to_parent"]
    | ["palette_keys"]
    | ["sidebar_buttons"],
  value: string | boolean | Record<string, string> | readonly string[] | undefined,
) {
  persistTuiSettingQueue = persistTuiSettingQueue
    .then(() => {
      const file =
        ["tui.jsonc", "tui.json"]
          .map((name) => path.join(Global.Path.config, name))
          .find((item) => fs.existsSync(item)) ?? path.join(Global.Path.config, "tui.json")
      const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "{}"
      const edits = modify(text, key, value, { formattingOptions: { tabSize: 2, insertSpaces: true } })
      const next = applyEdits(text, edits)
      // An unchanged file must not be rewritten: every TUI's config watcher reloads on the write.
      if (next !== text) fs.writeFileSync(file, next)
    })
    .catch(() => {})
  return persistTuiSettingQueue
}
