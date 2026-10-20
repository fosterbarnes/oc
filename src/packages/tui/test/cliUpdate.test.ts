import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  CODEX_CLI_INSTALL_HINT,
  CURSOR_CLI_INSTALL_URL,
  lineSplitter,
  resetCliUpdateState,
  resolveCodexCli,
  resolveCursorCli,
  runCliCommand,
  runCliUpdate,
  runVersionedCliUpdate,
  UPDATE_ARG,
} from "../src/cliUpdate"

const fakeScript = `import { appendFileSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const dir = dirname(fileURLToPath(import.meta.url))
const arg = process.argv[2] ?? ""
appendFileSync(join(dir, "calls.txt"), process.argv.slice(2).join(" ") + "\\n")

function readOptional(file) {
  try {
    return readFileSync(file, "utf8").trim()
  } catch {
    return ""
  }
}

const mode = process.env.FAKE_CLI_MODE || readOptional(join(dir, "mode.txt")) || "cursor"

if (arg === "--version") {
  if (mode === "fail-version" || mode === "recover-version") process.exit(1)
  console.log(readOptional(join(dir, "version.txt")) || "1.0.0")
  process.exit(0)
}
if (arg === "about") {
  if (mode === "other") {
    console.log("About Some Agent")
    process.exit(0)
  }
  if (mode === "no-about") process.exit(1)
  console.log("About Cursor CLI")
  process.exit(0)
}
if (arg === "update") {
  if (mode === "fail-update") {
    console.error("\\u001b[31mupdate failed\\u001b[0m")
    process.exit(1)
  }
  if (mode === "slow") await Bun.sleep(1500)
  const next = readOptional(join(dir, "next-version.txt"))
  if (next) writeFileSync(join(dir, "version.txt"), next)
  if (mode === "fail-version-after") writeFileSync(join(dir, "mode.txt"), "fail-version")
  if (mode === "recover-version") writeFileSync(join(dir, "mode.txt"), "cursor")
  console.log("\\u001b[32mupdated\\u001b[0m")
  console.error("stderr note")
  process.exit(0)
}
console.error("unknown " + arg)
process.exit(1)
`

const dirs: string[] = []

afterEach(async () => {
  resetCliUpdateState()
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function tempDir(prefix: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

async function writeLauncher(dir: string, name: string) {
  await writeFile(path.join(dir, "fake.js"), fakeScript)
  if (process.platform === "win32") {
    const file = path.join(dir, `${name}.cmd`)
    await writeFile(file, `@echo off\r\nbun "%~dp0fake.js" %*\r\nexit /b %ERRORLEVEL%\r\n`)
    return file
  }
  const file = path.join(dir, name)
  await writeFile(file, `#!/bin/sh\nexec bun "$(dirname "$0")/fake.js" "$@"\n`, { mode: 0o755 })
  return file
}

function testEnv(dir: string) {
  return { ...process.env, PATH: dir, Path: dir }
}

test("runs the fixed update argument and strips ANSI from both streams", async () => {
  const dir = await tempDir("oc-cli-update-")
  const executable = await writeLauncher(dir, "cursor-agent")
  const result = await runCliUpdate(executable)
  expect(result.alreadyRunning).toBe(false)
  expect(result.ok).toBe(true)
  expect(result.lastLine).toBe("stderr note")
  expect(result.output).toContain("updated")
  expect(result.output).not.toContain("\u001b[")
  const calls = await readFile(path.join(dir, "calls.txt"), "utf8")
  expect(
    calls
      .trim()
      .split(/\r?\n/)
      .filter((line) => line === UPDATE_ARG).length,
  ).toBeGreaterThan(0)
})

test("prefers cursor-agent over agent on PATH", async () => {
  const dir = await tempDir("oc-cli-resolve-")
  await writeLauncher(dir, "cursor-agent")
  const agentDir = path.join(dir, "other")
  await mkdir(agentDir)
  await writeFile(path.join(agentDir, "fake.js"), fakeScript)
  if (process.platform === "win32") {
    await writeFile(path.join(agentDir, "agent.cmd"), `@echo off\r\nbun "%~dp0fake.js" %*\r\nexit /b %ERRORLEVEL%\r\n`)
  } else {
    await writeFile(path.join(agentDir, "agent"), `#!/bin/sh\nexec bun "$(dirname "$0")/fake.js" "$@"\n`, {
      mode: 0o755,
    })
  }
  const env = { ...process.env, PATH: `${dir}${path.delimiter}${agentDir}`, Path: `${dir}${path.delimiter}${agentDir}` }
  const resolved = await resolveCursorCli(env)
  expect("executable" in resolved).toBe(true)
  if ("executable" in resolved) {
    expect(path.parse(resolved.executable).name.toLowerCase()).toBe("cursor-agent")
  }
})

test("reports a missing Cursor CLI with the install URL", async () => {
  const dir = await tempDir("oc-cli-missing-")
  const resolved = await resolveCursorCli(testEnv(dir))
  expect(resolved).toEqual({
    error: `Cursor CLI not found. Install it from ${CURSOR_CLI_INSTALL_URL}`,
    notInstalled: true,
  })
})

test("rejects an unrelated agent on PATH", async () => {
  const dir = await tempDir("oc-cli-agent-")
  await writeLauncher(dir, "agent")
  await writeFile(path.join(dir, "mode.txt"), "other")
  const resolved = await resolveCursorCli(testEnv(dir))
  expect(resolved).toEqual({ error: "PATH agent is not the Cursor CLI" })
})

test("runs an updater whose path contains spaces", async () => {
  const parent = await tempDir("oc-cli-space-")
  const dir = path.join(parent, "cli update dir")
  await mkdir(dir)
  const executable = await writeLauncher(dir, "cursor-agent")
  const result = await runCliCommand(executable, [UPDATE_ARG])
  expect(result.ok).toBe(true)
  expect(result.output).toContain("updated")
})

test("reports a changed version after a successful Cursor update", async () => {
  const dir = await tempDir("oc-cli-changed-")
  const executable = await writeLauncher(dir, "cursor-agent")
  await writeFile(path.join(dir, "version.txt"), "1.0.0")
  await writeFile(path.join(dir, "next-version.txt"), "2.0.0")
  const result = await runVersionedCliUpdate("Cursor CLI", executable)
  expect(result).toEqual({
    ok: true,
    alreadyRunning: false,
    message: "Updated Cursor CLI from 1.0.0 to 2.0.0",
  })
})

test("reports when the Cursor version is unchanged", async () => {
  const dir = await tempDir("oc-cli-same-")
  const executable = await writeLauncher(dir, "cursor-agent")
  await writeFile(path.join(dir, "version.txt"), "1.0.0")
  const result = await runVersionedCliUpdate("Cursor CLI", executable)
  expect(result).toEqual({
    ok: true,
    alreadyRunning: false,
    message: "Update completed; version unchanged",
  })
})

test("reports updater failure from the captured last line", async () => {
  const dir = await tempDir("oc-cli-fail-")
  const executable = await writeLauncher(dir, "cursor-agent")
  await writeFile(path.join(dir, "mode.txt"), "fail-update")
  const result = await runVersionedCliUpdate("Cursor CLI", executable)
  expect(result.ok).toBe(false)
  expect(result.message).toBe("Failed to update Cursor CLI: update failed")
})

test("reports success when the post-update version probe fails", async () => {
  const dir = await tempDir("oc-cli-verify-")
  const executable = await writeLauncher(dir, "cursor-agent")
  await writeFile(path.join(dir, "mode.txt"), "fail-version-after")
  const result = await runVersionedCliUpdate("Cursor CLI", executable)
  expect(result).toEqual({
    ok: true,
    alreadyRunning: false,
    message: "Update completed; version could not be read",
  })
})

test("does not claim unchanged when the pre-update version probe failed", async () => {
  const dir = await tempDir("oc-cli-before-")
  const executable = await writeLauncher(dir, "cursor-agent")
  await writeFile(path.join(dir, "mode.txt"), "recover-version")
  await writeFile(path.join(dir, "version.txt"), "2.0.0")
  const result = await runVersionedCliUpdate("Cursor CLI", executable)
  expect(result).toEqual({
    ok: true,
    alreadyRunning: false,
    message: "Update completed; previous version could not be read (now 2.0.0)",
  })
})

test("kills an updater that runs past the timeout", async () => {
  const dir = await tempDir("oc-cli-timeout-")
  const executable = await writeLauncher(dir, "cursor-agent")
  await writeFile(path.join(dir, "mode.txt"), "slow")
  const started = Date.now()
  const result = await runCliCommand(executable, [UPDATE_ARG], 200)
  expect(result.ok).toBe(false)
  expect(result.error).toBe("timed out after 200 ms")
  expect(Date.now() - started).toBeLessThan(1500)
})

test("second activation of the same executable reports already running", async () => {
  const dir = await tempDir("oc-cli-dup-")
  const executable = await writeLauncher(dir, "cursor-agent")
  await writeFile(path.join(dir, "mode.txt"), "slow")
  const first = runCliUpdate(executable)
  const second = await runCliUpdate(executable)
  expect(second.alreadyRunning).toBe(true)
  expect(second.error).toBe("already running")
  const done = await first
  expect(done.alreadyRunning).toBe(false)
  expect(done.ok).toBe(true)
})

test("splits chunks into lines on CR, LF, and partial chunk boundaries", () => {
  const lines: string[] = []
  const splitter = lineSplitter((line) => lines.push(line))
  splitter.push("Checking\r\nDown")
  splitter.push("loading 10%\rDownloading 50%\r")
  splitter.push("\n\u001b[32mDone\u001b[0m")
  expect(lines).toEqual(["Checking", "Downloading 10%", "Downloading 50%"])
  splitter.flush()
  expect(lines.at(-1)).toBe("Done")
})

test("streams output lines before the command exits", async () => {
  const lines: string[] = []
  let firstAt = 0
  const script = 'process.stdout.write("one\\n"); setTimeout(() => process.stderr.write("two\\rthree"), 500)'
  await runCliCommand(process.execPath, ["-e", script], undefined, undefined, (line) => {
    if (lines.push(line) === 1) firstAt = Date.now()
  })
  expect(lines).toEqual(["one", "two", "three"])
  expect(Date.now() - firstAt).toBeGreaterThanOrEqual(300)
})

test("spawn error and close produce one completion result", async () => {
  const dir = await tempDir("oc-cli-spawn-")
  const missing = path.join(dir, "missing-cli.exe")
  const result = await runCliCommand(missing, [UPDATE_ARG])
  expect(result.ok).toBe(false)
  expect(result.code).toBe(null)
  expect(result.error).toBeTruthy()
})

test("resolves codex on PATH", async () => {
  const dir = await tempDir("oc-codex-resolve-")
  const executable = await writeLauncher(dir, "codex")
  const resolved = await resolveCodexCli(testEnv(dir))
  expect("executable" in resolved && resolved.executable.toLowerCase()).toBe(executable.toLowerCase())
})

test("reports a missing Codex CLI with the npm hint", async () => {
  const dir = await tempDir("oc-codex-missing-")
  const resolved = await resolveCodexCli(testEnv(dir))
  expect(resolved).toEqual({
    error: `Codex CLI not found. Install it with ${CODEX_CLI_INSTALL_HINT}`,
    notInstalled: true,
  })
})

test("reports a changed version after a successful Codex update", async () => {
  const dir = await tempDir("oc-codex-changed-")
  const executable = await writeLauncher(dir, "codex")
  await writeFile(path.join(dir, "version.txt"), "codex-cli 0.149.0")
  await writeFile(path.join(dir, "next-version.txt"), "codex-cli 0.149.1")
  const result = await runVersionedCliUpdate("Codex CLI", executable)
  expect(result).toEqual({
    ok: true,
    alreadyRunning: false,
    message: "Updated Codex CLI from codex-cli 0.149.0 to codex-cli 0.149.1",
  })
})

test("reports when the Codex version is unchanged", async () => {
  const dir = await tempDir("oc-codex-same-")
  const executable = await writeLauncher(dir, "codex")
  await writeFile(path.join(dir, "version.txt"), "codex-cli 0.149.1")
  const result = await runVersionedCliUpdate("Codex CLI", executable)
  expect(result).toEqual({
    ok: true,
    alreadyRunning: false,
    message: "Update completed; version unchanged",
  })
})

test("reports Codex updater failure from the captured last line", async () => {
  const dir = await tempDir("oc-codex-fail-")
  const executable = await writeLauncher(dir, "codex")
  await writeFile(path.join(dir, "mode.txt"), "fail-update")
  const result = await runVersionedCliUpdate("Codex CLI", executable)
  expect(result.ok).toBe(false)
  expect(result.message).toBe("Failed to update Codex CLI: update failed")
})

test("prefers codex.cmd next to a PowerShell-only shim", async () => {
  if (process.platform !== "win32") return
  const dir = await tempDir("oc-codex-ps1-")
  await writeFile(path.join(dir, "codex.ps1"), "Write-Output shim\n")
  const sibling = path.join(dir, "codex.cmd")
  await writeFile(sibling, "@echo off\r\nexit /b 0\r\n")
  const env = { ...testEnv(dir), PATHEXT: ".PS1", PathExt: ".PS1" }
  const resolved = await resolveCodexCli(env)
  expect(resolved).toEqual({ executable: sibling })
})

test("fails closed when only a PowerShell shim exists", async () => {
  if (process.platform !== "win32") return
  const dir = await tempDir("oc-codex-ps1-only-")
  await writeFile(path.join(dir, "codex.ps1"), "Write-Output shim\n")
  const env = { ...testEnv(dir), PATHEXT: ".PS1", PathExt: ".PS1" }
  const resolved = await resolveCodexCli(env)
  expect(resolved).toEqual({
    error: "Codex CLI shim is PowerShell-only; expected codex.cmd was not found next to it",
  })
})
