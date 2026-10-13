import { execFile, spawn } from "node:child_process"
import { readFile, rm } from "node:fs/promises"
import { platform, release, tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import type { HostClipboardService } from "@opentui/core"

const exec = promisify(execFile)

type Command = (command: string, args?: string[], input?: string) => Promise<Buffer>
type ClipboardContent = { data: string; mime: string; filepath?: string }
type ReadOptions = Readonly<{
  os?: NodeJS.Platform
  command?: Command
  host?: () => Promise<ClipboardContent | undefined>
  text?: () => Promise<string | undefined>
}>

function command(command: string, args: string[] = [], input?: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(command, args, { stdio: [input === undefined ? "ignore" : "pipe", "pipe", "ignore"] })
    const output: Buffer[] = []
    child.on("error", reject)
    child.stdout?.on("data", (chunk: Buffer) => output.push(chunk))
    child.on("close", (code) => {
      if (code === 0) return resolve(Buffer.concat(output))
      reject(new Error(`${command} exited with code ${code}`))
    })
    if (input !== undefined) child.stdin?.end(input)
  })
}

function writeOsc52(text: string) {
  if (!process.stdout.isTTY) return
  const sequence = `\x1b]52;c;${Buffer.from(text).toString("base64")}\x07`
  const passthrough = `\x1bPtmux;\x1b${sequence}\x1b\\`
  process.stdout.write(process.env.TMUX ? sequence + passthrough : process.env.STY ? passthrough : sequence)
}

export async function read(options: ReadOptions = {}): Promise<ClipboardContent | undefined> {
  const os = options.os ?? platform()
  const run = options.command ?? command

  if (os === "darwin") {
    const file = path.join(tmpdir(), "opencode-clipboard.png")
    try {
      await exec("osascript", [
        "-e",
        'set imageData to the clipboard as "PNGf"',
        "-e",
        `set fileRef to open for access POSIX file "${file}" with write permission`,
        "-e",
        "set eof fileRef to 0",
        "-e",
        "write imageData to fileRef",
        "-e",
        "close access fileRef",
      ])
      return { data: (await readFile(file)).toString("base64"), mime: "image/png" }
    } catch {
      // Fall through to text clipboard.
    } finally {
      await rm(file, { force: true }).catch(() => {})
    }
  }

  // Native read first: it is near-instant, while the PowerShell file-drop read costs ~300 ms.
  if (os === "win32") {
    const content = await (options.host ?? readHost)()
    if (content) return content
  }

  if (os === "win32" || release().includes("WSL")) {
    const image = await runWindowsClipboard(run)
    if (image) return image
  }

  if (platform() === "linux") {
    const wayland = await command("wl-paste", ["-t", "image/png"]).catch(() => Buffer.alloc(0))
    if (wayland.length) return { data: wayland.toString("base64"), mime: "image/png" }
    const x11 = await command("xclip", ["-selection", "clipboard", "-t", "image/png", "-o"]).catch(() =>
      Buffer.alloc(0),
    )
    if (x11.length) return { data: x11.toString("base64"), mime: "image/png" }
  }

  const text = await (options.text ?? readText)()
  if (text) return { data: text, mime: "text/plain" }
}

let hostClipboard: HostClipboardService | undefined

// OpenTUI's native reader covers PNG/DIB images and text, but not file-drop lists (CF_HDROP).
async function readHost() {
  const { createHostClipboard, decodePasteBytes } = await import("@opentui/core")
  const result = await (hostClipboard ??= createHostClipboard())
    .read({ preferredTypes: ["image/png", "text/plain"], selection: "clipboard" })
    .catch(() => undefined)
  if (result?.status !== "read" || result.representation.bytes.length === 0) return
  if (result.representation.mimeType === "image/png") {
    return { data: Buffer.from(result.representation.bytes).toString("base64"), mime: "image/png" }
  }
  return { data: decodePasteBytes(result.representation.bytes), mime: "text/plain" }
}

async function readText() {
  const { default: clipboardy } = await import("clipboardy")
  return clipboardy.read().catch(() => undefined)
}

async function runWindowsClipboard(run: Command) {
  const outputPath = path.join(tmpdir(), `opencode-clipboard-${process.pid}.png`)
  const escapedOutputPath = outputPath.replace(/'/g, "''")
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$extensions = @('.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp')",
    "$file = [System.Windows.Forms.Clipboard]::GetFileDropList() | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) -and $extensions -contains ([System.IO.Path]::GetExtension($_)).ToLowerInvariant() } | Select-Object -First 1",
    "if ($file) { Write-Output ('path:' + $file); exit }",
    "$img = [System.Windows.Forms.Clipboard]::GetImage()",
    `if ($img) { $outputPath = '${escapedOutputPath}'; $img.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png); Write-Output ('image:' + $outputPath) }`,
  ].join("; ")
  const output = await run("powershell.exe", ["-NonInteractive", "-NoProfile", "-Command", script]).catch(() =>
    Buffer.alloc(0),
  )
  const result = output.toString().trim()
  if (result.startsWith("path:")) {
    const filepath = result.slice("path:".length)
    const image = await readImageFile(filepath)
    if (image) return { ...image, filepath }
    return
  }
  if (result.startsWith("image:")) {
    const file = result.slice("image:".length)
    const image = await readImageFile(file)
    await rm(file, { force: true }).catch(() => {})
    return image
  }
}

const IMAGE_MIME: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
}

// Same shape as the macOS and Linux image reads: base64 bytes plus an image mime.
async function readImageFile(file: string) {
  const mime = IMAGE_MIME[path.extname(file).toLowerCase()]
  const bytes = await readFile(file).catch(() => undefined)
  if (!mime || !bytes) return
  return { data: bytes.toString("base64"), mime }
}

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

let copyMethod: Promise<(text: string) => Promise<void>> | undefined

function getCopyMethod() {
  return (copyMethod ??= (async () => {
    const { which } = await import("@opencode-ai/core/util/which")
    const native = copyCommand(platform(), Boolean(process.env.WAYLAND_DISPLAY), (name) => Boolean(which(name)))
    if (native?.[0] === "osascript") {
      return async (text: string) => {
        const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
        await command("osascript", ["-e", `set the clipboard to "${escaped}"`]).catch(() => undefined)
      }
    }
    if (native) {
      return async (text: string) => {
        await command(native[0], native.slice(1), text).catch(() => undefined)
      }
    }
    return async (text: string) => {
      const { default: clipboardy } = await import("clipboardy")
      await clipboardy.write(text).catch(() => undefined)
    }
  })())
}

export async function write(text: string) {
  writeOsc52(text)
  const method = await getCopyMethod()
  await method(text)
}
