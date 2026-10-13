// Runs one command per message off the main thread and posts its result. On Windows the first
// pwsh spawn in a Bun process blocks the spawning thread ~0.4s, which froze the launcher intro.
// Kept dependency-free so the worker starts fast.
declare var self: Worker

self.onmessage = (event: MessageEvent<string[]>) => {
  const result = Bun.spawnSync(event.data, { stdout: "pipe", stderr: "pipe", windowsHide: true })
  postMessage({ exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() })
}
