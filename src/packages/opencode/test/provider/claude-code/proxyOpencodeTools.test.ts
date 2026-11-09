import { afterEach, expect, test } from "bun:test"
import { resolveProxyOpencodeToolDefs } from "@/provider/claude-code/proxyToolSelection"
import { setOpencodeClient } from "@/provider/claude-code/runtimeStatus"
import { CuaDriver } from "@/tool/cuaDriver"

const originalKey = process.env.TYPESAFE_API_KEY

afterEach(() => {
  setOpencodeClient({})
  if (originalKey === undefined) delete process.env.TYPESAFE_API_KEY
  else process.env.TYPESAFE_API_KEY = originalKey
})

test("jev tools missing for lack of a key are skipped without a toast, other unknown names get the generic one", () => {
  delete process.env.TYPESAFE_API_KEY
  const toasts: { title?: string; message: string }[] = []
  setOpencodeClient({ tui: { showToast: async ({ body }: { body: (typeof toasts)[number] }) => toasts.push(body) } })
  // Registry list as oc serves it without the key: no jev_* entries.
  const items = [{ id: "time", description: "Local time", parameters: { type: "object", properties: {} } }]
  const defs = resolveProxyOpencodeToolDefs({ requested: ["time", "jev_check", "nopeTool"], items })
  expect(defs.map((def) => def.name)).toEqual(["time"])
  expect(toasts.map((toast) => toast.title)).toEqual(["Config entry ignored"])
  expect(toasts[0].message).toContain(": nopeTool.")
})

// Only meaningful where cua-driver is not installed (the registry then hides cua_*).
test.skipIf(CuaDriver.driverPath() !== undefined)("cua tools without cua-driver are skipped without a toast", () => {
  const toasts: { title?: string; message: string }[] = []
  setOpencodeClient({ tui: { showToast: async ({ body }: { body: (typeof toasts)[number] }) => toasts.push(body) } })
  const items = [{ id: "time", description: "Local time", parameters: { type: "object", properties: {} } }]
  const defs = resolveProxyOpencodeToolDefs({ requested: ["time", "cua_windows", "cua_act"], items })
  expect(defs.map((def) => def.name)).toEqual(["time"])
  expect(toasts).toEqual([])
})
