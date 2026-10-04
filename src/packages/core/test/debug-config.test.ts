import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { DebugConfig } from "@opencode-ai/core/debug-config"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  )
})

describe("debug config sync", () => {
  test("seeds missing files, preserves existing files, and normalizes the debug port", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-debug-config-"))
    temporaryDirectories.push(root)
    const production = { data: path.join(root, "production-data"), config: path.join(root, "production-config") }
    const debug = { data: path.join(root, "debug-data"), config: path.join(root, "debug-config") }
    await Promise.all([
      fs.mkdir(production.data, { recursive: true }),
      fs.mkdir(production.config, { recursive: true }),
    ])
    await fs.writeFile(path.join(production.data, "auth.json"), "production-auth")
    await fs.writeFile(path.join(production.config, "config.json"), "production-config")
    await fs.writeFile(path.join(production.config, "tui.json"), "production-tui")
    await fs.writeFile(
      path.join(production.config, "oc.json"),
      JSON.stringify({ executable: "opencode.exe", server: { port: 4096 } }),
    )
    await fs.mkdir(debug.config, { recursive: true })
    await fs.writeFile(path.join(debug.config, "config.json"), "debug-config")

    await DebugConfig.sync({ production, debug, overwrite: false, serverPort: 4097 })

    expect(await fs.readFile(path.join(debug.config, "config.json"), "utf8")).toBe("debug-config")
    expect(await fs.readFile(path.join(debug.data, "auth.json"), "utf8")).toBe("production-auth")
    expect(JSON.parse(await fs.readFile(path.join(debug.config, "oc.json"), "utf8"))).toEqual({
      executable: "opencode.exe",
      server: { port: 4097 },
    })

    await fs.writeFile(path.join(production.config, "config.json"), "updated-production-config")
    await DebugConfig.sync({ production, debug, overwrite: true, serverPort: 4097 })

    expect(await fs.readFile(path.join(debug.config, "config.json"), "utf8")).toBe("updated-production-config")
  })

  test("copies recognized config directories recursively", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-debug-config-"))
    temporaryDirectories.push(root)
    const production = { data: path.join(root, "production-data"), config: path.join(root, "production-config") }
    const debug = { data: path.join(root, "debug-data"), config: path.join(root, "debug-config") }
    const directories = [
      "agent",
      "agents",
      "command",
      "commands",
      "mode",
      "modes",
      "plugin",
      "plugins",
      "skill",
      "skills",
      "tool",
      "tools",
      "themes",
      "prompts",
    ]

    await Promise.all(
      directories.map(async (directory) => {
        const nested = path.join(production.config, directory, "nested")
        await fs.mkdir(nested, { recursive: true })
        await fs.writeFile(path.join(nested, "entry.txt"), directory)
      }),
    )
    await fs.mkdir(path.join(debug.config, "agents", "nested"), { recursive: true })
    await fs.writeFile(path.join(debug.config, "agents", "nested", "entry.txt"), "debug")

    const copied = await DebugConfig.sync({ production, debug, overwrite: false, serverPort: 4097 })

    expect(copied).toEqual(expect.arrayContaining(directories))
    await Promise.all(
      directories.map(async (directory) => {
        const file = path.join(debug.config, directory, "nested", "entry.txt")
        expect(await fs.readFile(file, "utf8")).toBe(directory === "agents" ? "debug" : directory)
      }),
    )

    await fs.writeFile(path.join(production.config, "agents", "nested", "entry.txt"), "updated")
    await DebugConfig.sync({ production, debug, overwrite: true, serverPort: 4097 })

    expect(await fs.readFile(path.join(debug.config, "agents", "nested", "entry.txt"), "utf8")).toBe("updated")
  })
})
