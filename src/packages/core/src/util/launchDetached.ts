import { spawn, type SpawnOptions } from "child_process"
import path from "path"

type LaunchOptions = {
  windowStyle?: "Hidden" | "Normal"
  cwd?: string
  env?: NodeJS.ProcessEnv
  windowsVerbatimArguments?: boolean
  // Windows: the hop waits this long and fails if the target already exited with a nonzero code.
  settleMs?: number
}

// One shape for every branch, so callers can read any launch env var.
type DetachedCommand = { file: string; args: string[]; options: SpawnOptions & { env: NodeJS.ProcessEnv } }

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
): DetachedCommand {
  const options = { detached: true, stdio: "ignore", windowsHide: true, cwd: input.cwd, env: { ...input.env } } as const
  if (file.toLowerCase().endsWith(".ps1")) {
    return {
      file: "cmd.exe",
      args: ["/d", "/v:on", "/c", `start "${consoleTitle(file)}" pwsh -NoProfile -File !OC_LAUNCH_ARGV!`],
      options: {
        ...options,
        env: { ...options.env, OC_LAUNCH_ARGV: windowsArguments([file, ...args]) },
        windowsVerbatimArguments: true,
      },
    }
  }
  if (platform !== "win32") return { file, args: [...args], options }
  return {
    file: "pwsh",
    args: [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$parameters = @{ FilePath = $env:OC_LAUNCH_EXE; WindowStyle = $env:OC_LAUNCH_STYLE; ErrorAction = 'Stop' }; if ($env:OC_LAUNCH_ARGS) { $parameters.ArgumentList = $env:OC_LAUNCH_ARGS }; $settle = [int]$env:OC_LAUNCH_SETTLE; Remove-Item Env:OC_LAUNCH_EXE, Env:OC_LAUNCH_ARGS, Env:OC_LAUNCH_STYLE, Env:OC_LAUNCH_SETTLE -ErrorAction Ignore; $target = Start-Process @parameters -PassThru; if ($settle -gt 0) { Start-Sleep -Milliseconds $settle; if ($target.HasExited -and $target.ExitCode) { exit 2 } }",
    ],
    // Not detached: a DETACHED_PROCESS pwsh has no console and its Start-Process silently runs nothing.
    // The hop exits right away; Start-Process is what puts the target outside the caller's job.
    options: {
      ...options,
      detached: false,
      env: {
        ...options.env,
        OC_LAUNCH_EXE: file,
        OC_LAUNCH_ARGS: input.windowsVerbatimArguments ? args.join(" ") : windowsArguments(args),
        OC_LAUNCH_STYLE: input.windowStyle ?? "Hidden",
        ...(input.settleMs ? { OC_LAUNCH_SETTLE: String(input.settleMs) } : {}),
      },
    },
  }
}

// Start-Process gives native helpers their own console outside the closing terminal's job.
export function windowsArguments(args: readonly string[]) {
  return args.map((arg) => `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, "$1$1")}"`).join(" ")
}

// cmd has no `\"` escape, so caller text never goes on the .ps1 command line. The script path and
// arguments reach `start` through `!OC_LAUNCH_ARGV!`: delayed expansion runs after cmd parses
// & | < > " ^ %, and the expanded text is not parsed again. windowsArguments targets pwsh's own
// argv splitting. The title stays literal (`start` reads its first quoted argument as the title),
// minus characters cmd would act on.
function consoleTitle(file: string) {
  return path.basename(file, path.extname(file)).replace(/["%!^]/g, "")
}

export * as LaunchDetached from "./launchDetached"
