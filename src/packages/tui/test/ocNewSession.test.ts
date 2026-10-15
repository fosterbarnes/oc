import { afterEach, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { OpencodeClient } from "@opencode-ai/sdk/v2"
import { bootstrapSession, listHomeDirs } from "../src/ocNewSession"

const temps: string[] = []
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function tempHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ocNewSession-"))
  temps.push(dir)
  return dir
}

test("listHomeDirs sorts folders by name or by modified time", () => {
  const home = tempHome()
  for (const name of ["b", "a", "c"]) fs.mkdirSync(path.join(home, name))
  fs.writeFileSync(path.join(home, "file.txt"), "")
  fs.utimesSync(path.join(home, "a"), new Date(1000), new Date(1000))
  fs.utimesSync(path.join(home, "b"), new Date(3000), new Date(3000))
  fs.utimesSync(path.join(home, "c"), new Date(2000), new Date(2000))

  expect(listHomeDirs(home, "name").map((dir) => dir.name)).toEqual(["a", "b", "c"])
  expect(listHomeDirs(home, "modified").map((dir) => dir.name)).toEqual(["b", "c", "a"])
  expect(listHomeDirs(path.join(home, "missing"), "name")).toEqual([])
})

test("bootstrapSession numbers the title and routes create and prompt to the project", async () => {
  const directory = path.join(tempHome(), "crow")
  fs.mkdirSync(path.join(directory, ".config"), { recursive: true })
  fs.writeFileSync(path.join(directory, ".config", "openSidebar.json"), JSON.stringify({ keep: true }))
  const calls: Array<{ name: string; input: unknown }> = []
  const client = {
    experimental: {
      session: {
        list: async (input: unknown) => {
          calls.push({ name: "list", input })
          return { data: [{ title: "crow" }, { title: "crow2" }, { title: "other" }] }
        },
      },
    },
    session: {
      create: async (input: unknown) => {
        calls.push({ name: "create", input })
        return { data: { id: "ses_1" } }
      },
      prompt: async (input: unknown) => {
        calls.push({ name: "prompt", input })
        return { data: {} }
      },
    },
  } as unknown as OpencodeClient

  expect(await bootstrapSession(client, directory)).toBe("ses_1")
  expect(calls).toEqual([
    { name: "list", input: { roots: true, limit: 500 } },
    {
      name: "create",
      input: { directory, title: "crow3", metadata: { ocAutoRename: { state: "pending", title: "crow3" } } },
    },
    {
      name: "prompt",
      input: {
        sessionID: "ses_1",
        directory,
        noReply: true,
        parts: [{ type: "text", text: `Working directory initialized: ${directory}`, synthetic: true }],
      },
    },
  ])
  expect(JSON.parse(fs.readFileSync(path.join(directory, ".config", "openSidebar.json"), "utf8"))).toEqual({
    keep: true,
    projectDirectory: directory,
  })
})
