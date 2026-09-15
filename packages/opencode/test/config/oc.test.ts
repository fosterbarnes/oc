import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { Global, resolveAppName } from "@opencode-ai/core/global"
import * as OcConfig from "@/config/oc"

const originalConfigPath = Global.Path.config
const originalLegacyConfig = process.env.OPENCODE_OC_CONFIG
const temporaryDirectories: string[] = []

afterEach(async () => {
  ;(Global.Path as { config: string }).config = originalConfigPath
  if (originalLegacyConfig === undefined) delete process.env.OPENCODE_OC_CONFIG
  else process.env.OPENCODE_OC_CONFIG = originalLegacyConfig
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  )
})

describe("debug instance identity", () => {
  test("treats oc-debug executable and OPENCODE_INSTANCE as the debug app", () => {
    expect(resolveAppName({ execPath: "C:\\Apps\\opencode\\opencode.exe" })).toBe("opencode")
    expect(resolveAppName({ execPath: "C:\\Apps\\opencode\\ocdebug.exe" })).toBe("opencode-debug")
    expect(resolveAppName({ execPath: "C:\\Apps\\opencode\\oc-debug.exe" })).toBe("opencode-debug")
    expect(resolveAppName({ instance: "debug", execPath: "C:\\Apps\\opencode\\opencode.exe" })).toBe("opencode-debug")
    expect(OcConfig.defaultServerPort()).toBe(Global.Path.debug ? 4097 : 4096)
  })
})

describe("OC config", () => {
  test("reads launcher settings only from the native config", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-oc-"))
    temporaryDirectories.push(directory)
    ;(Global.Path as { config: string }).config = directory
    const legacy = path.join(directory, "legacy.json")
    await fs.writeFile(legacy, JSON.stringify({ homeDir: "standalone-oc" }))
    process.env.OPENCODE_OC_CONFIG = legacy

    expect(await OcConfig.read()).toEqual({})
    expect(await fs.stat(path.join(directory, "oc.json")).catch(() => undefined)).toBeUndefined()
  })

  test("writes and reads launcher settings without a PowerShell bridge", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-oc-"))
    temporaryDirectories.push(directory)
    ;(Global.Path as { config: string }).config = directory

    await OcConfig.update("homeDirSort", "modified")
    await fs.writeFile(
      path.join(directory, "oc.json"),
      `${JSON.stringify({ homeDirSort: "modified", server: { hostname: "127.0.0.1", port: 4096 } }, null, 2)}\n`,
    )
    await OcConfig.update("serverStartOnWindowsUserStart", "true")

    expect(await OcConfig.read()).toEqual({
      homeDirSort: "modified",
      server: { hostname: "127.0.0.1", port: 4096, startOnWindowsUserStart: true },
    })
  })
})
