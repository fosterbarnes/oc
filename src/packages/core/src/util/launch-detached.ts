import { spawn } from "child_process"
import path from "path"

type LaunchOptions = {
  windowStyle?: "Hidden" | "Normal"
  cwd?: string
  env?: NodeJS.ProcessEnv
  windowsVerbatimArguments?: boolean
}

/**
 * Starts a program that must outlive the caller (revive scripts shut OpenCode down).
 * `.ps1` scripts open in their own console via `start "<script name>"`; conhost applies
 * `HKCU\Console\<script name>` settings such as WindowPosition to that window.
 */
export function launchDetached(file: string, args: readonly string[] = [], options: LaunchOptions = {}) {
  const command = detachedCommand(file, args, { ...options, env: { ...process.env, ...options.env } })
  const child = spawn(command.file, command.args, command.options)
  child.unref()
  return child
}

export function detachedCommand(
  file: string,
  args: readonly string[] = [],
  input: LaunchOptions = {},
  platform = process.platform,
) {
  const options = { detached: true, stdio: "ignore", windowsHide: true,
    cwd: input.cwd, env: { ...input.env } } as const
  if (file.toLowerCase().endsWith(".ps1")) {
    return { file: "cmd.exe", args: ["/d", "/c", startScript(file, args)],
      options: { ...options, windowsVerbatimArguments: true } }
  }
  if (platform !== "win32") return { file, args: [...args], options }
  return {
    file: "pwsh",
    args: ["-NoProfile", "-NonInteractive", "-Command",
      "$parameters = @{ FilePath = $env:OC_LAUNCH_EXE; WindowStyle = $env:OC_LAUNCH_STYLE; ErrorAction = 'Stop' }; if ($env:OC_LAUNCH_ARGS) { $parameters.ArgumentList = $env:OC_LAUNCH_ARGS }; Remove-Item Env:OC_LAUNCH_EXE, Env:OC_LAUNCH_ARGS, Env:OC_LAUNCH_STYLE; Start-Process @parameters"],
    // Not detached: a DETACHED_PROCESS pwsh has no console and its Start-Process silently runs nothing.
    // The hop exits right away; Start-Process is what puts the target outside the caller's job.
    options: { ...options, detached: false, env: { ...options.env, OC_LAUNCH_EXE: file,
      OC_LAUNCH_ARGS: input.windowsVerbatimArguments ? args.join(" ") : windowsArguments(args),
      OC_LAUNCH_STYLE: input.windowStyle ?? "Hidden" } },
  }
}

// Start-Process gives native helpers their own console outside the closing terminal's job.
export function windowsArguments(args: readonly string[]) {
  return args.map((arg) => `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, "$1$1")}"`).join(" ")
}

// Verbatim command line: `start` reads its first quoted argument as the window title, so quoting must be exact.
function startScript(file: string, args: readonly string[]) {
  const title = path.basename(file, path.extname(file))
  return `start "${title}" pwsh -NoProfile -File ${[file, ...args].map((arg) => `"${arg}"`).join(" ")}`
}

export * as LaunchDetached from "./launch-detached"
