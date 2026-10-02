import { spawn } from "child_process"
import path from "path"

/**
 * Starts a program that must outlive the caller (revive scripts shut OpenCode down).
 * `.ps1` scripts open in their own console via `start "<script name>"`; conhost applies
 * `HKCU\Console\<script name>` settings such as WindowPosition to that window.
 */
export function launchDetached(file: string, args: readonly string[] = []) {
  const options = { detached: true, stdio: "ignore", windowsHide: true } as const
  const child = file.toLowerCase().endsWith(".ps1")
    ? spawn("cmd.exe", ["/d", "/c", startScript(file, args)], { ...options, windowsVerbatimArguments: true })
    : spawn(file, [...args], options)
  child.unref()
  return child
}

// Verbatim command line: `start` reads its first quoted argument as the window title, so quoting must be exact.
function startScript(file: string, args: readonly string[]) {
  const title = path.basename(file, path.extname(file))
  return `start "${title}" pwsh -NoProfile -File ${[file, ...args].map((arg) => `"${arg}"`).join(" ")}`
}

export * as LaunchDetached from "./launch-detached"
