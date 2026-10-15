/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { KVProvider, useKV } from "../../src/context/kv"
import { ThemeProvider, useTheme } from "../../src/context/theme"
import { TuiConfigProvider } from "../../src/config"
import { tmpdir } from "../fixture/fixture"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"
import { TestTuiContexts } from "../fixture/tui-environment"
import { wait } from "../cli/cmd/tui/sync-fixture"

test("kv saves merge into keys another process wrote", async () => {
  await using tmp = await tmpdir()
  const file = path.join(tmp.path, "kv.json")
  await Bun.write(file, "{}")
  const kvs: ReturnType<typeof useKV>[] = []
  function Probe() {
    kvs.push(useKV())
    return <box />
  }

  const app = await testRender(() => (
    <TestTuiContexts paths={{ state: tmp.path }}>
      <KVProvider>
        <Probe />
      </KVProvider>
      <KVProvider>
        <Probe />
      </KVProvider>
    </TestTuiContexts>
  ))
  const read = () => Bun.file(file).json() as Promise<Record<string, unknown>>
  try {
    await wait(() => kvs.length === 2 && kvs.every((kv) => kv.ready))
    kvs[0]!.set("theme", "drac")
    await wait(() => kvs[0]!.get("theme") === "drac")
    await Bun.sleep(100)
    kvs[1]!.set("theme_native", "nord")
    await Bun.sleep(100)
    expect(await read()).toEqual({ theme: "drac", theme_native: "nord" })

    kvs[0]!.set("theme", undefined)
    await Bun.sleep(100)
    expect(await read()).toEqual({ theme_native: "nord" })
  } finally {
    app.renderer.destroy()
  }
})

test.skipIf(Global.native)("oc defaults to drac and saves opencode.exe's theme separately", async () => {
  await using tmp = await tmpdir()
  const file = path.join(tmp.path, "kv.json")
  await Bun.write(file, "{}")
  let theme!: ReturnType<typeof useTheme>
  function Probe() {
    theme = useTheme()
    return <box />
  }

  const app = await testRender(() => (
    <TestTuiContexts paths={{ state: tmp.path }}>
      <TuiConfigProvider config={createTuiResolvedConfig()}>
        <KVProvider>
          <ThemeProvider mode="dark" source={{ discover: async () => ({}) }}>
            <Probe />
          </ThemeProvider>
        </KVProvider>
      </TuiConfigProvider>
    </TestTuiContexts>
  ))
  try {
    await wait(() => theme !== undefined)
    expect(theme.selected).toBe("drac")
    expect(theme.native()).toBe("opencode")

    expect(theme.setNative("nord")).toBe(true)
    await Bun.sleep(100)
    expect(theme.selected).toBe("drac")
    expect(theme.native()).toBe("nord")
    expect(await Bun.file(file).json()).toEqual({ theme_native: "nord" })
  } finally {
    app.renderer.destroy()
  }
})
