import { spawn } from "node:child_process"
import { readFile, rm } from "node:fs/promises"
import { platform, release, tmpdir } from "node:os"
import path from "node:path"
import type { HostClipboardService } from "@opentui/core"

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

// Reaches the terminal the user sits at, including over SSH, where a native copy cannot.
export function writeOsc52(text: string) {
  if (!process.stdout.isTTY) return
  const sequence = `\x1b]52;c;${Buffer.from(text).toString("base64")}\x07`
  const passthrough = `\x1bPtmux;\x1b${sequence}\x1b\\`
  process.stdout.write(process.env.TMUX ? sequence + passthrough : process.env.STY ? passthrough : sequence)
}

export async function read(options: ReadOptions = {}): Promise<ClipboardContent | undefined> {
  const os = options.os ?? platform()
  const run = options.command ?? command

  // Native read first: it is near-instant, while osascript costs ~800 ms for an image and the PowerShell
  // file-drop read ~300 ms.
  if (os === "win32" || os === "darwin") {
    const content = await (options.host ?? readHost)()
    if (content) return content
  }

  // Fallback for what the native read skips, such as a TIFF-only clipboard (`as "PNGf"` converts it).
  if (os === "darwin") {
    const file = path.join(tmpdir(), "opencode-clipboard.png")
    try {
      await run("osascript", [
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

export async function write(text: string) {
  writeOsc52(text)
  const { writeNative } = await import("@opencode-ai/core/util/clipboard")
  await writeNative(text).catch(async () => {
    const { default: clipboardy } = await import("clipboardy")
    await clipboardy.write(text).catch(() => undefined)
  })
}
