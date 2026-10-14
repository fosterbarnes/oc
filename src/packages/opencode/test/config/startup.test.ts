import { expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Startup } from "@/config/startup"
import { tmpdir } from "../fixture/fixture"

function context(state: string) {
  return {
    platform: "win32" as const,
    executable: "C:\\Apps\\O'Brien $x\\oc.exe",
    powershell: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
    entrypoint: undefined,
    app: "opencode",
    state,
    config: "C:\\custom config\\opencode",
    data: "C:\\custom data\\opencode",
    cache: "C:\\custom cache\\opencode",
    cwd: "C:\\Users\\O'Brien",
    env: {
      OPENCODE_CONFIG: "C:\\custom config\\chosen.jsonc",
      OPENCODE_DB: "custom.db",
      OPENCODE_SERVER_PASSWORD: "SECRET",
      ANTHROPIC_API_KEY: "SECRET",
    },
  }
}

test("startup preserves exact debug/config context, quotes literals and excludes secrets", () => {
  const input = context("C:\\state\\opencode")
  const next = Startup.plan(input)
  expect(next.name).toStartWith("oc-opencode-")
  expect(next.command.length).toBeLessThanOrEqual(260)
  expect(next.command).toContain('"C:\\Program Files\\PowerShell\\7\\pwsh.exe"')
  expect(next.script).toContain("& 'C:\\Apps\\O''Brien $x\\oc.exe' 'oc' 'server' 'start' | Out-Null")
  expect(next.script).toContain("$env:OPENCODE_CONFIG = 'C:\\custom config\\chosen.jsonc'")
  expect(next.script).toContain("$env:OPENCODE_DB = 'custom.db'")
  expect(next.script).not.toContain("SECRET")
  expect(Startup.plan({ ...input, config: "C:\\another\\opencode" }).name).not.toBe(next.name)
  const bun = Startup.plan({ ...input, executable: "C:\\bun.exe", entrypoint: "C:\\repo space\\index.ts" })
  expect(bun.script).toContain("& 'C:\\bun.exe' 'C:\\repo space\\index.ts' 'oc' 'server' 'start'")
})

test("startup rejects unsupported platforms, inline config and oversized Run commands", () => {
  const input = context("C:\\state")
  expect(() => Startup.plan({ ...input, platform: "linux" })).toThrow("user service manager")
  expect(() => Startup.plan({ ...input, powershell: null })).toThrow("Install PowerShell 7")
  expect(() => Startup.plan({ ...input, env: { OPENCODE_CONFIG_CONTENT: "secret" } })).toThrow("Save inline")
  expect(() => Startup.plan({ ...input, state: "C:\\" + "x".repeat(240) })).toThrow("shorter path")
})

test("startup launcher parses in PowerShell without running it", async () => {
  await using tmp = await tmpdir()
  const next = Startup.plan(context(tmp.path))
  const file = path.join(tmp.path, "launcher.ps1")
  await Bun.write(file, next.script)
  const result = Bun.spawnSync(
    [
      "pwsh",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$tokens = $null; $errors = $null; $null = [System.Management.Automation.Language.Parser]::ParseFile($env:OC_TEST_SCRIPT, [ref]$tokens, [ref]$errors); if ($errors.Count) { $errors | ForEach-Object { $_.Message }; exit 1 }",
    ],
    { stdout: "pipe", stderr: "pipe", windowsHide: true, env: { ...process.env, OC_TEST_SCRIPT: file } },
  )
  expect(result.stdout.toString()).toBe("")
  expect(result.stderr.toString()).toBe("")
  expect(result.exitCode).toBe(0)
})

test("startup is idempotent and disables only the owned registration", async () => {
  await using tmp = await tmpdir()
  const input = context(tmp.path)
  const next = Startup.plan(input)
  const values = new Map<string, string>([["unrelated", "keep"]])
  let writes = 0
  const registry: Startup.Registry = {
    read: async (name) => values.get(name),
    write: async (name, value) => {
      writes++
      if (value === undefined) {
        values.delete(name)
        return
      }
      values.set(name, value)
    },
  }
  const options = { context: input, registry }
  let saved = false
  await Startup.update(
    true,
    async () => {
      saved = true
    },
    options,
  )
  expect(saved).toBe(true)
  expect(await Bun.file(next.file).text()).toBe(next.script)
  await Startup.update(true, async () => {}, options)
  expect(writes).toBe(1)
  await Startup.update(false, async () => {}, options)
  await Startup.update(false, async () => {}, options)
  expect(writes).toBe(2)
  expect(values.get("unrelated")).toBe("keep")
  expect(values.has(next.name)).toBe(false)
})

test("startup restores registration and launcher after persistence or registration failure", async () => {
  await using tmp = await tmpdir()
  const input = context(tmp.path)
  const next = Startup.plan(input)
  let value: string | undefined = "previous command"
  const registry: Startup.Registry = {
    read: async () => value,
    write: async (_name, command) => {
      value = command
    },
  }
  const options = { context: input, registry }
  await expect(
    Startup.update(
      true,
      async () => {
        throw new Error("save failed")
      },
      options,
    ),
  ).rejects.toThrow("save failed")
  expect(value).toBe("previous command")
  expect(await Bun.file(next.file).exists()).toBe(false)
  let writes = 0
  let saved = false
  await expect(
    Startup.update(
      true,
      async () => {
        saved = true
      },
      {
        context: input,
        registry: {
          read: registry.read,
          write: async (_name, command) => {
            value = command
            if (++writes === 1) throw new Error("registry denied")
          },
        },
      },
    ),
  ).rejects.toThrow("registry denied")
  expect(saved).toBe(false)
  expect(value).toBe("previous command")
  expect(await Bun.file(next.file).exists()).toBe(false)
  await Startup.update(true, async () => {}, options)
  await expect(
    Startup.update(
      false,
      async () => {
        throw new Error("save failed")
      },
      options,
    ),
  ).rejects.toThrow("save failed")
  expect(value).toBe(next.command)
  expect(await Bun.file(next.file).text()).toBe(next.script)
  await fs.rm(next.file)
  await expect(
    Startup.update(
      true,
      async () => {
        saved = true
      },
      {
        context: { ...input, executable: "C:\\other.exe" },
        registry: {
          read: registry.read,
          write: async () => {
            throw new Error("registry denied")
          },
        },
      },
    ),
  ).rejects.toThrow("rollback failed")
  expect(saved).toBe(false)
})

test("launcher write failure leaves configuration unpersisted", async () => {
  await using tmp = await tmpdir()
  const blocked = path.join(tmp.path, "blocked")
  await Bun.write(blocked, "file")
  let saved = false
  let writes = 0
  await expect(
    Startup.update(
      true,
      async () => {
        saved = true
      },
      {
        context: context(blocked),
        registry: {
          read: async () => undefined,
          write: async () => {
            writes++
          },
        },
      },
    ),
  ).rejects.toThrow()
  expect(saved).toBe(false)
  expect(writes).toBe(0)
})
