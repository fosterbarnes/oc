import { readdir, unlink } from "node:fs/promises"
import path from "node:path"
import { imageDir } from "@opencode-ai/core/util/imageDir"
import { useSync } from "./context/sync"
import { useDialog } from "./ui/dialog"
import { DialogConfirm } from "./ui/dialog-confirm"
import { useToast } from "./ui/toast"

const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"])

export function createClearSavedImagesCommand() {
  const sync = useSync()
  const dialog = useDialog()
  const toast = useToast()

  return {
    name: "oc.clear_saved_images",
    title: "Clear saved images",
    category: "oc",
    async run() {
      const dir = imageDir(sync.data.config.attachment?.image?.save_dir)
      const files = await savedImageFiles(dir)
      const count = files.length
      const noun = count === 1 ? "image" : "images"
      if (count === 0) {
        toast.show({ message: `No saved images in ${dir}`, variant: "info" })
        return
      }
      const confirmed = await DialogConfirm.show(
        dialog,
        "Clear saved images",
        `Delete ${count} saved ${noun} in ${dir}?`,
      )
      if (confirmed !== true) return
      await Promise.all(files.map((file) => unlink(file)))
        .then(() => toast.show({ message: `Deleted ${count} saved ${noun}`, variant: "success" }))
        .catch(toast.error)
    },
  }
}

// Top-level image files only: subfolders and non-image files in a user-set save_dir are left alone.
// A missing folder means nothing is saved yet.
async function savedImageFiles(dir: string) {
  const entries = await readdir(dir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return []
    throw error
  })
  return entries
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(dir, entry.name))
}
