export function cliCommand(cliPath: string, args: string[]) {
  const nodeScript = process.platform === "win32" && cliPath.toLowerCase().endsWith(".cjs")
  return {
    command: nodeScript ? process.execPath : cliPath,
    args: nodeScript ? [cliPath, ...args] : args,
    shell: process.platform === "win32" && !nodeScript,
  }
}
