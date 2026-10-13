import os from "os"
import path from "path"
import { Global } from "../global"

// Folder for images attached to prompts (config `attachment.image.save_dir`). The server saves
// pasted images here, agents may read it without a prompt, and the TUI palette clears it.
export function imageDir(saveDir?: string) {
  if (saveDir) return path.resolve(saveDir.replace(/^~(?=$|[\\/])/, os.homedir()))
  if (process.env.LOCALAPPDATA) return path.join(process.env.LOCALAPPDATA, "oc", "images")
  return path.join(Global.Path.data, "images")
}
