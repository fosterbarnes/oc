import { createHash } from "crypto"
import { mkdir, readdir, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { Global } from "../global"

// Folder for images attached to prompts (config `attachment.image.save_dir`). The server saves
// pasted prompt images here and the TUI saves question-answer images; agents may read it without
// a prompt, and the TUI palette clears it.
export function imageDir(saveDir?: string) {
  if (saveDir) return path.resolve(saveDir.replace(/^~(?=$|[\\/])/, os.homedir()))
  if (process.env.LOCALAPPDATA) return path.join(process.env.LOCALAPPDATA, "oc", "images")
  return path.join(Global.Path.data, "images")
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
}

// Saved image names are `<stamp>-<hash>.<ext>`. The hash makes identical bytes reuse the existing
// file instead of writing a second copy.
export function imageFileSuffix(bytes: Uint8Array, mime: string) {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 8)
  return `-${hash}.${IMAGE_EXTENSIONS[mime] ?? "png"}`
}

export function imageFileName(suffix: string) {
  return `${new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15)}${suffix}`
}

// Writes image bytes into `dir` and returns the file path (the existing file for identical bytes).
export async function saveImage(dir: string, bytes: Uint8Array, mime: string) {
  const suffix = imageFileSuffix(bytes, mime)
  await mkdir(dir, { recursive: true })
  const existing = (await readdir(dir)).find((name) => name.endsWith(suffix))
  if (existing) return path.join(dir, existing)
  const file = path.join(dir, imageFileName(suffix))
  await writeFile(file, bytes)
  return file
}
