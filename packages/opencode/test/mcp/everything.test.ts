import { expect, test } from "bun:test"
import { Effect } from "effect"
import { Everything } from "@/mcp/everything"
import { Process } from "@/util/process"

test("launches the configured Everything executable with background flags", async () => {
  if (process.platform !== "win32") return

  const calls: { command: string[]; options: Process.Options }[] = []
  const child = { unref: () => undefined } as unknown as Process.Child
  await Effect.runPromise(
    Everything.ensureRunning(
      { EVERYTHING_EXE_PATH: "C:\\portable\\Everything.exe" },
      {
        exists: async () => true,
        spawn: (command, options) => {
          calls.push({ command, options })
          return child
        },
      },
    ),
  )

  expect(calls).toMatchObject([
    {
      command: ["C:\\portable\\Everything.exe", "-first-instance", "-startup"],
      options: { detached: true, stdin: "ignore", stdout: "ignore", stderr: "ignore" },
    },
  ])
})

test("reports a missing configured Everything executable", async () => {
  if (process.platform !== "win32") return

  await expect(
    Effect.runPromise(
      Everything.ensureRunning({ EVERYTHING_EXE_PATH: "C:\\missing\\Everything.exe" }, { exists: async () => false }),
    ),
  ).rejects.toThrow("EVERYTHING_EXE_PATH")
})
