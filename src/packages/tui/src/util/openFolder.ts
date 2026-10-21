import { spawn } from "node:child_process"

// System file manager for a folder: Explorer on Windows, Finder on macOS, xdg-open elsewhere.
export function folderOpener(directory: string, platform: NodeJS.Platform = process.platform) {
  if (platform === "win32") return { command: "explorer.exe", args: [directory] }
  if (platform === "darwin") return { command: "open", args: [directory] }
  return { command: "xdg-open", args: [directory] }
}

// Resolves once the file manager starts. Its exit code is ignored: explorer.exe exits 1 on success.
export function openFolder(directory: string) {
  const { command, args } = folderOpener(directory)
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore" })
    child.once("error", reject)
    child.once("spawn", () => {
      child.unref()
      resolve()
    })
  })
}
