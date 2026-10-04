import path from "node:path"
import { Effect } from "effect"
import { Process } from "@/util/process"

export const NAME = "everything-search"

type Exists = (file: string) => Promise<boolean>
type Spawn = (cmd: string[], options: Process.Options) => Process.Child

interface Boundary {
  readonly exists?: Exists
  readonly spawn?: Spawn
}

export function ensureRunning(environment?: NodeJS.ProcessEnv, boundary: Boundary = {}) {
  if (process.platform !== "win32") return Effect.void

  return Effect.tryPromise({
    try: async () => {
      const executable = await resolveExecutable(environment, boundary.exists ?? ((file) => Bun.file(file).exists()))
      const child = (boundary.spawn ?? Process.spawn)([executable, "-first-instance", "-startup"], {
        detached: true,
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      })
      child.unref()
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  })
}

export async function resolveExecutable(environment: NodeJS.ProcessEnv = process.env, exists: Exists) {
  const env = { ...process.env, ...environment }
  const override = env.EVERYTHING_EXE_PATH?.trim()
  if (override) {
    const executable = path.resolve(override)
    if (await exists(executable)) return executable
    throw new Error(`Everything executable not found at EVERYTHING_EXE_PATH: ${executable}`)
  }

  const candidates = [env.ProgramW6432, env.ProgramFiles, env["ProgramFiles(x86)"]]
    .filter((value): value is string => !!value)
    .map((directory) => path.join(directory, "Everything", "Everything.exe"))
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate
  }
  throw new Error("Everything.exe was not found. Set EVERYTHING_EXE_PATH to its installation path.")
}

export * as Everything from "./everything"
