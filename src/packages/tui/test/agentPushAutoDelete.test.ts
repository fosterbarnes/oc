import { expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { openInOtherTabs } from "../src/agentPushAutoDelete"

test("only running tabs keep a pushed session open", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ocTuis-"))
  try {
    // A tab closed with its window leaves its ledger behind (the `oc - agent-push:#14b2f3f` report).
    const closed = Bun.spawn(process.platform === "win32" ? ["cmd", "/c", "exit"] : ["true"])
    await closed.exited
    const ledger = (pid: number, sessionID: string) =>
      fs.writeFileSync(path.join(dir, `${pid}.json`), JSON.stringify({ pid, sessionID }))
    ledger(closed.pid, "ses_closedTab")
    ledger(process.ppid, "ses_openTab")
    ledger(process.pid, "ses_thisTab")
    fs.writeFileSync(path.join(dir, `${process.ppid}.identity.json`), JSON.stringify({ pid: process.ppid }))
    expect([...openInOtherTabs(dir)]).toEqual(["ses_openTab"])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
