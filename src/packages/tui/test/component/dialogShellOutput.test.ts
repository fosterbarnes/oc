import { describe, expect, test } from "bun:test"
import path from "node:path"
import type { ToolPart } from "@opencode-ai/sdk/v2"
import { readJobLogs, shellOutputStatus } from "../../src/component/dialog-shell-output"
import { tmpdir } from "../fixture/fixture"

const part = (state: ToolPart["state"]): ToolPart => ({
  id: "prt_1",
  sessionID: "ses_1",
  messageID: "msg_1",
  type: "tool",
  tool: "bash",
  callID: "call_1",
  state,
})

describe("readJobLogs", () => {
  test("joins stdout and stderr and marks a capped tail", async () => {
    await using tmp = await tmpdir()
    const out = path.join(tmp.path, "out.log")
    const err = path.join(tmp.path, "err.log")
    await Bun.write(out, "a".repeat(90) + "LAST\n")
    await Bun.write(err, "")
    expect(await readJobLogs(out, err)).toEqual({ text: "a".repeat(90) + "LAST\n", cut: false })
    expect(await readJobLogs(out, err, 10)).toEqual({ text: "aaaaaLAST\n", cut: true })
    await Bun.write(err, "boom")
    expect((await readJobLogs(out, err))?.text).toEndWith("LAST\n--- stderr ---\nboom")
  })

  test("is undefined when the log is not on this machine", async () => {
    expect(await readJobLogs(path.join(import.meta.dir, "missing-out.log"))).toBeUndefined()
  })
})

describe("shellOutputStatus", () => {
  test("states where the command is", () => {
    const time = { start: 1 }
    expect(shellOutputStatus(undefined)).toBe("Unavailable")
    expect(shellOutputStatus(part({ status: "running", input: {}, time }))).toBe("Running")
    expect(
      shellOutputStatus(
        part({
          status: "completed",
          input: {},
          output: "",
          title: "",
          metadata: { exit: 2 },
          time: { ...time, end: 2 },
        }),
      ),
    ).toBe("Exited · code 2")
    expect(
      shellOutputStatus(
        part({
          status: "completed",
          input: {},
          output: "",
          title: "",
          metadata: { exit: null, background: { jobID: "bg_1", status: "timed_out" } },
          time: { ...time, end: 2 },
        }),
      ),
    ).toBe("Background bg_1 · timed out")
  })
})
