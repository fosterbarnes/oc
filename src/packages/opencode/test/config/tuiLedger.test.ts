import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { TuiLedger } from "../../src/config/tuiLedger"
import { tmpdir } from "../fixture/fixture"

// read() keeps only records for the running binary and instance; select() takes both as arguments.
const executable = Global.resolveExecutablePath()
const tui = { pid: 10, parentPid: 11, executable, startedAt: 10_000, created: "134100000000000010" }
const processes = [
  tui,
  { pid: 11, parentPid: 1, executable: "C:\\Other\\pwsh.exe", startedAt: 9_000, created: "134100000000000009" },
  { pid: 12, parentPid: 1, executable: "C:\\Other\\opencode.exe", startedAt: 10_000, created: "134100000000000012" },
]
const record = { pid: 10, instance: Global.Path.app, executable, startedAt: 10_000, paneID: "4" }

const oc = "C:\\Apps\\oc\\oc.exe"
const ocTui = { ...tui, executable: oc }
const ocLauncher = { ...processes[1], executable: "C:\\Apps\\oc\\occ.exe" }
const owned = { ...record, instance: "opencode", executable: oc, created: tui.created }

async function ledger(records: Record<string, unknown>) {
  const tmp = await tmpdir()
  await fs.mkdir(path.join(tmp.path, "oc-tuis"))
  for (const [file, value] of Object.entries(records))
    await Bun.write(path.join(tmp.path, "oc-tuis", file), typeof value === "string" ? value : JSON.stringify(value))
  return tmp
}

test("reads proven records and skips dead, foreign, and truncated dead records without deleting them", async () => {
  await using tmp = await ledger({
    "10.json": record,
    "10.identity.json": tui,
    "99.json": { ...record, pid: 99 },
    "12.json": { ...record, pid: 12, executable: processes[2].executable },
    "14.json": "{",
  })
  expect(await TuiLedger.read(tmp.path, processes)).toEqual([{ ...record, created: tui.created }])
  expect((await fs.readdir(path.join(tmp.path, "oc-tuis"))).sort()).toEqual(
    ["10.identity.json", "10.json", "12.json", "14.json", "99.json"].sort(),
  )
  await TuiLedger.remove(tmp.path, 10)
  await TuiLedger.remove(tmp.path, 10)
  expect(await TuiLedger.read(tmp.path, processes)).toEqual([])
})

test("fails loudly when a live record's identity cannot be proven", async () => {
  await using missing = await ledger({ "10.json": record })
  await expect(TuiLedger.read(missing.path, processes)).rejects.toThrow("identity unavailable or changed")
  await using reused = await ledger({ "10.json": record, "10.identity.json": tui })
  await expect(TuiLedger.read(reused.path, [{ ...tui, created: "134100000000000099" }])).rejects.toThrow(
    "identity unavailable or changed",
  )
  await using corrupt = await ledger({ "10.json": "{", "10.identity.json": tui })
  await expect(TuiLedger.read(corrupt.path, processes)).rejects.toThrow("identity unavailable or changed")
})

test("rejects records with a bad session, directory, or pane type", async () => {
  await using tmp = await ledger({ "10.identity.json": tui })
  const routed = { ...record, sessionID: "ses_1", directory: "C:\\Projects\\a" }
  await Bun.write(path.join(tmp.path, "oc-tuis", "10.json"), JSON.stringify(routed))
  expect(await TuiLedger.read(tmp.path, processes)).toEqual([{ ...routed, created: tui.created }])
  for (const bad of [{ sessionID: 5 }, { sessionID: "" }, { directory: null }, { directory: "" }, { paneID: "x" }]) {
    await Bun.write(path.join(tmp.path, "oc-tuis", "10.json"), JSON.stringify({ ...record, ...bad }))
    await expect(TuiLedger.read(tmp.path, processes)).rejects.toThrow("identity unavailable or changed")
  }
})

test("selects matching instance TUIs and their own launcher hard link, never self or reused pids", () => {
  const live = [ocTui, ocLauncher]
  expect(TuiLedger.select([owned], live, "opencode", oc, 100)).toEqual([10, 11])
  expect(TuiLedger.select([owned], live, "other-app", oc, 100)).toEqual([])
  expect(TuiLedger.select([owned], live, "opencode", oc, 10)).toEqual([])
  expect(TuiLedger.select([owned], live, "opencode", oc, 11)).toEqual([10])
  expect(TuiLedger.select([{ ...owned, created: undefined }], live, "opencode", oc, 100)).toEqual([])
  expect(
    TuiLedger.select([owned], [{ ...ocTui, created: "134100000000000099" }, ocLauncher], "opencode", oc, 100),
  ).toEqual([])
})

test("does not stop shells, foreign launchers, or a launcher started after its TUI", () => {
  const withParent = (parent: Partial<TuiLedger.Process>) =>
    TuiLedger.select([owned], [ocTui, { ...ocLauncher, ...parent }], "opencode", oc, 100)
  expect(withParent({ executable: "C:\\Windows\\pwsh.exe" })).toEqual([10])
  expect(withParent({ executable: "C:\\Other\\occ.exe" })).toEqual([10])
  expect(withParent({ created: "134100000000000011" })).toEqual([10])
  expect(withParent({ created: undefined })).toEqual([10])
})

test("treats occ as the oc hard link and keeps other binaries distinct", () => {
  expect(TuiLedger.sameExecutable("C:/APPS/oc/OCC.EXE", "C:\\Apps\\oc\\oc.exe")).toBe(true)
  expect(TuiLedger.sameExecutable("C:\\Apps\\oc\\opencode.exe", "C:\\Apps\\oc\\oc.exe")).toBe(false)
  expect(TuiLedger.sameExecutable("C:\\Other\\oc.exe", "C:\\Apps\\oc\\oc.exe")).toBe(false)
})

test("parses array JSON when the filtered process listing contains one match", () => {
  expect(TuiLedger.parseProcesses(JSON.stringify([processes[0]]))).toEqual([processes[0]])
  expect(TuiLedger.parseProcesses("[]")).toEqual([])
  expect(() => TuiLedger.parseProcesses(JSON.stringify(processes[0]))).toThrow()
  expect(() => TuiLedger.parseProcesses('[{"pid":1}]')).toThrow()
})
