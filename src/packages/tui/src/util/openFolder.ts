import { spawn } from "node:child_process"

// System file manager for a folder: Explorer on Windows, Finder on macOS, xdg-open elsewhere.
// Explorer splits an unquoted argument on commas, so a path with one is quoted and passed verbatim
// (`verbatim`; Windows paths cannot contain `"`). Its trailing `\` is trimmed so it cannot escape the
// closing quote; such a path is never a drive root. Other paths keep Node's own quoting.
export function folderOpener(directory: string, platform: NodeJS.Platform = process.platform) {
  if (platform === "win32" && directory.includes(","))
    return { command: "explorer.exe", args: [`"${directory.replace(/\\+$/, "")}"`], verbatim: true }
  if (platform === "win32") return { command: "explorer.exe", args: [directory] }
  if (platform === "darwin") return { command: "open", args: [directory] }
  return { command: "xdg-open", args: [directory] }
}

// Resolves once the file manager starts. Its exit code is ignored: explorer.exe exits 1 on success.
export function openFolder(directory: string) {
  const opener = folderOpener(directory)
  return new Promise<void>((resolve, reject) => {
    const child = spawn(opener.command, opener.args, {
      detached: true,
      stdio: "ignore",
      windowsVerbatimArguments: "verbatim" in opener,
    })
    child.once("error", reject)
    child.once("spawn", () => {
      child.unref()
      resolve()
    })
  })
}
