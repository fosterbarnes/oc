import { expect, test } from "bun:test"
import { AgentEnv } from "@/util/agent-env"

test("agent env drops the resident server's credentials and keeps the rest", () => {
  const env = AgentEnv.inherited({
    OPENCODE_SERVER_PASSWORD: "SECRET",
    OPENCODE_SERVER_USERNAME: "opencode",
    OC_RESIDENT: "1",
    OPENCODE_DB: "C:\\data\\oc.db",
    PATH: "C:\\bin",
  })
  expect(env).toEqual({ OPENCODE_DB: "C:\\data\\oc.db", PATH: "C:\\bin" })
})
