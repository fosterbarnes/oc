import { spawn } from "node:child_process"
import { platform } from "node:os"
import { which } from "./which"

// Native system clipboard write, shared by the TUI and the `clipboard` tool. No OSC 52 here: the
// server has no terminal, so the TUI adds that itself.

export function copyCommand(
  os: NodeJS.Platform,
  wayland: boolean,
  has: (name: string) => boolean,
): string[] | undefined {
  if (os === "darwin" && has("osascript")) return ["osascript"]
  if (os === "linux" && wayland && has("wl-copy")) return ["wl-copy"]
  if (os === "linux" && has("xclip")) return ["xclip", "-selection", "clipboard"]
  if (os === "linux" && has("xsel")) return ["xsel", "--clipboard", "--input"]
  if (os === "win32" && has("powershell.exe")) {
    return [
      "powershell.exe",
      "-NonInteractive",
      "-NoProfile",
      "-Command",
      "[Console]::InputEncoding = [System.Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())",
    ]
  }
}

let cached: string[] | undefined

// Throws when no clipboard command exists or the command fails.
export async function writeNative(text: string) {
  const native = (cached ??= copyCommand(platform(), Boolean(process.env.WAYLAND_DISPLAY), (name) =>
    Boolean(which(name)),
  ))
  if (!native) {
    throw new Error(`no clipboard command found${platform() === "linux" ? " (install wl-copy, xclip, or xsel)" : ""}`)
  }
  if (native[0] === "osascript") {
    const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
    return run("osascript", ["-e", `set the clipboard to "${escaped}"`])
  }
  return run(native[0], native.slice(1), text)
}

function run(command: string, args: string[], input?: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: [input === undefined ? "ignore" : "pipe", "ignore", "pipe"] })
    const stderr: Buffer[] = []
    child.on("error", reject)
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk))
    child.on("close", (code) => {
      if (code === 0) return resolve()
      const detail = Buffer.concat(stderr).toString().trim()
      reject(new Error(`${command} exited with code ${code}${detail ? `: ${detail}` : ""}`))
    })
    if (input !== undefined) child.stdin?.end(input)
  })
}
