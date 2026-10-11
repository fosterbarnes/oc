import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { TuiLedger } from "../../src/config/tuiLedger"
import { tmpdir } from "../fixture/fixture"

const executable = "C:\\Apps\\oc\\opencode.exe"
const record = { pid: 10, instance: "opencode", executable, startedAt: 10_000, paneID: "4" }
const processes = [
  { pid: 10, parentPid: 11, executable, startedAt: 10_000 },
  { pid: 11, parentPid: 1, executable: "C:\\Apps\\oc\\occ.exe", startedAt: 9_000 },
  { pid: 12, parentPid: 1, executable: "C:\\Other\\opencode.exe", startedAt: 10_000 },
  { pid: 13, parentPid: 1, executable: "C:\\Apps\\oc\\ocdebug.exe", startedAt: 10_000 },
]

test("reads per-pid records, removes dead, reused, malformed records and unlinks on exit", async () => {
  await using tmp = await tmpdir()
  const root = path.join(tmp.path, "oc-tuis")
  expect(await TuiLedger.read(tmp.path, processes)).toEqual([])
  await fs.mkdir(root)
  await Bun.write(path.join(root, "10.json"), JSON.stringify(record))
  await Bun.write(path.join(root, "99.json"), JSON.stringify({ ...record, pid: 99 }))
  await Bun.write(path.join(root, "12.json"), JSON.stringify({ ...record, pid: 12 }))
  await Bun.write(path.join(root, "14.json"), "{")
  expect(await TuiLedger.read(tmp.path, processes)).toEqual([record])
  expect(await fs.readdir(root)).toEqual(["10.json"])
  await TuiLedger.remove(tmp.path, 10)
  await TuiLedger.remove(tmp.path, 10)
  expect(await TuiLedger.read(tmp.path, processes)).toEqual([])
})

test("selects only matching instance TUIs and their own launcher parent", () => {
  const records = [record,
    { ...record, pid: 12, executable: processes[2].executable },
    { ...record, pid: 13, instance: "opencode-debug", executable: processes[3].executable },
    { ...record, pid: 99 },
  ]
  expect(TuiLedger.select(records, processes, "opencode", executable, 100)).toEqual([10, 11])
  expect(TuiLedger.select(records, processes, "opencode-debug", processes[3].executable, 100)).toEqual([13])
  expect(TuiLedger.select(records, processes, "opencode", executable, 10)).toEqual([])
  expect(TuiLedger.select(records, processes, "opencode", executable, 11)).toEqual([10])
})

test("does not kill shells, foreign launcher paths, or an unrecorded same-executable process", () => {
  expect(TuiLedger.select([record], [
    processes[0], { ...processes[1], executable: "C:\\Other\\occ.exe" },
    { pid: 15, parentPid: 1, executable, startedAt: 10_000 },
  ], "opencode", executable, 100)).toEqual([10])
  expect(TuiLedger.select([record], [
    processes[0], { ...processes[1], executable: "C:\\Windows\\pwsh.exe" },
  ], "opencode", executable, 100)).toEqual([10])
})

test("rejects reused TUI and launcher pids even at the same executable path", async () => {
  await using tmp = await tmpdir()
  await fs.mkdir(path.join(tmp.path, "oc-tuis"))
  await Bun.write(path.join(tmp.path, "oc-tuis", "10.json"), JSON.stringify(record))
  const reused = [{ ...processes[0], startedAt: 20_000 }, processes[1]]
  expect(TuiLedger.select([record], reused, "opencode", executable, 100)).toEqual([])
  expect(await TuiLedger.read(tmp.path, reused)).toEqual([])
  expect(await fs.readdir(path.join(tmp.path, "oc-tuis"))).toEqual([])
  expect(TuiLedger.select([record], [processes[0], { ...processes[1], startedAt: 20_000 }],
    "opencode", executable, 100)).toEqual([10])
})

test("resolves production hard-link names in records, processes, and launcher parents", async () => {
  await using tmp = await tmpdir()
  await fs.mkdir(path.join(tmp.path, "oc-tuis"))
  const alias = { ...record, executable: "C:/APPS/oc/OC.EXE" }
  await Bun.write(path.join(tmp.path, "oc-tuis", "10.json"), JSON.stringify(alias))
  expect(await TuiLedger.read(tmp.path, processes)).toEqual([alias])
  expect(TuiLedger.select([alias], processes, "opencode", executable, 100)).toEqual([10, 11])
  expect(TuiLedger.select([record], [
    { ...processes[0], executable: "C:\\Apps\\oc\\occ.exe" },
    { ...processes[1], executable },
  ], "opencode", "C:\\Apps\\oc\\oc.exe", 100)).toEqual([10, 11])
  expect(TuiLedger.sameExecutable("C:\\Apps\\oc\\ocdebug.exe", executable)).toBe(false)
  expect(TuiLedger.sameExecutable("C:\\Other\\oc.exe", executable)).toBe(false)
})

test("keeps records within five seconds and rejects timestamps beyond that", async () => {
  await using tmp = await tmpdir()
  await fs.mkdir(path.join(tmp.path, "oc-tuis"))
  const nearby = [{ ...processes[0], startedAt: record.startedAt + 5000 }]
  await Bun.write(path.join(tmp.path, "oc-tuis", "10.json"), JSON.stringify(record))
  expect(await TuiLedger.read(tmp.path, nearby)).toEqual([record])
  expect(TuiLedger.select([record], nearby, "opencode", executable, 100)).toEqual([10])
  const beyond = [{ ...nearby[0], startedAt: record.startedAt + 5001 }]
  expect(TuiLedger.select([record], beyond, "opencode", executable, 100)).toEqual([])
  expect(await TuiLedger.read(tmp.path, beyond)).toEqual([])
})

test("accepts a record's session and directory and removes a record with a bad type", async () => {
  await using tmp = await tmpdir()
  const root = path.join(tmp.path, "oc-tuis")
  await fs.mkdir(root)
  const routed = { ...record, sessionID: "ses_1", directory: "C:\\Projects\\a" }
  await Bun.write(path.join(root, "10.json"), JSON.stringify(routed))
  expect(await TuiLedger.read(tmp.path, processes)).toEqual([routed])
  for (const bad of [{ sessionID: 5 }, { sessionID: "" }, { directory: null }, { directory: "" }]) {
    await Bun.write(path.join(root, "10.json"), JSON.stringify({ ...record, ...bad }))
    expect(await TuiLedger.read(tmp.path, processes)).toEqual([])
    expect(await fs.readdir(root)).toEqual([])
  }
})

test("parses array JSON when the filtered process listing contains one match", () => {
  expect(TuiLedger.parseProcesses(JSON.stringify([processes[0]]))).toEqual([processes[0]])
  expect(TuiLedger.parseProcesses("[]")).toEqual([])
  expect(() => TuiLedger.parseProcesses(JSON.stringify(processes[0]))).toThrow()
  expect(() => TuiLedger.parseProcesses('[{"pid":1}]')).toThrow()
})
