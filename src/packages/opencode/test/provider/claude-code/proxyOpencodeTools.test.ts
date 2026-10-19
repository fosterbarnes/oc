import { afterEach, expect, test } from "bun:test"
import { resolveProxyOpencodeToolDefs } from "@/provider/claude-code/proxyToolSelection"
import { setOpencodeClient } from "@/provider/claude-code/runtimeStatus"

const originalKey = process.env.TYPESAFE_API_KEY

afterEach(() => {
  setOpencodeClient({})
  if (originalKey === undefined) delete process.env.TYPESAFE_API_KEY
  else process.env.TYPESAFE_API_KEY = originalKey
})

test("jev tools missing for lack of a key get their own toast, other unknown names the generic one", () => {
  delete process.env.TYPESAFE_API_KEY
  const toasts: { title?: string; message: string }[] = []
  setOpencodeClient({ tui: { showToast: async ({ body }: { body: (typeof toasts)[number] }) => toasts.push(body) } })
  // Registry list as oc serves it without the key: no jev_* entries.
  const items = [{ id: "time", description: "Local time", parameters: { type: "object", properties: {} } }]
  const defs = resolveProxyOpencodeToolDefs({ requested: ["time", "jev_check", "nopeTool"], items })
  expect(defs.map((def) => def.name)).toEqual(["time"])
  expect(toasts.map((toast) => toast.title)).toEqual(["Jev key missing", "Config entry ignored"])
  expect(toasts[0].message).toContain("TYPESAFE_API_KEY: jev_check")
  expect(toasts[1].message).toContain(": nopeTool.")
})
