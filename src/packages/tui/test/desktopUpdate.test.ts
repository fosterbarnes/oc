import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { runCliCommand } from "../src/cliUpdate"
import {
  compareDesktopVersions,
  DOWNLOAD_HELPERS,
  parseDesktopCheckOutput,
  parseDesktopInstallOutput,
  windowsPowershellEnv,
} from "../src/desktopUpdate"

test("reports the script's OCERR message instead of the PowerShell error id", () => {
  const output = "OCERR: Update check failed: no redirect from https://claude.ai\n+ FullyQualifiedErrorId : boom\n"
  expect(parseDesktopCheckOutput(output)).toEqual({
    ok: false,
    message: "Update check failed: no redirect from https://claude.ai",
  })
  expect(parseDesktopInstallOutput(output)).toEqual({
    ok: false,
    message: "Update check failed: no redirect from https://claude.ai",
  })
})

test("parses a missing install from the OCERR line", () => {
  expect(parseDesktopCheckOutput("OCERR: Claude Desktop not installed\n")).toEqual({
    ok: false,
    message: "Claude Desktop not installed",
    notInstalled: true,
  })
})

test("compares versions numerically per segment", () => {
  expect(compareDesktopVersions("2.26454.2.0", "2.9.0")).toBeGreaterThan(0)
  expect(compareDesktopVersions("2.9.0", "2.26454.2.0")).toBeLessThan(0)
  expect(compareDesktopVersions("2.26454.2.0", "2.26454.2.0")).toBe(0)
  expect(compareDesktopVersions("1.2", "1.2.0")).toBe(0)
  expect(compareDesktopVersions("2.31226.1", "2.26454.2.0")).toBeGreaterThan(0)
})

test("parses an up-to-date check", () => {
  expect(parseDesktopCheckOutput("Claude Desktop is up to date (2.26454.2.0)\n")).toEqual({
    ok: true,
    upToDate: true,
    version: "2.26454.2.0",
  })
})

test("parses an available update", () => {
  expect(parseDesktopCheckOutput("UPDATE 2.26454.2.0 2.31226.1\n")).toEqual({
    ok: true,
    upToDate: false,
    oldVersion: "2.26454.2.0",
    newVersion: "2.31226.1",
  })
})

test("treats a stale update line as up to date", () => {
  expect(parseDesktopCheckOutput("UPDATE 2.31226.1 2.26454.2.0\n")).toEqual({
    ok: true,
    upToDate: true,
    version: "2.31226.1",
  })
})

test("parses a missing install", () => {
  expect(parseDesktopCheckOutput("Claude Desktop not installed\n")).toEqual({
    ok: false,
    message: "Claude Desktop not installed",
    notInstalled: true,
  })
})

test("falls back to the last line for unknown output", () => {
  expect(parseDesktopCheckOutput("noise\nboom\n")).toEqual({ ok: false, message: "boom" })
})

test("parses a successful install", () => {
  expect(parseDesktopInstallOutput("Updated Claude Desktop 2.26454.2.0 -> 2.31226.1\n")).toEqual({
    ok: true,
    message: "Updated Claude Desktop 2.26454.2.0 -> 2.31226.1",
  })
})

test("parses a failed install from the last line", () => {
  expect(parseDesktopInstallOutput("Install failed: Access is denied\n")).toEqual({
    ok: false,
    message: "Install failed: Access is denied",
  })
})

test("ignores progress lines when reading a failed install", () => {
  const output = "OCSTEP: downloading\nOCPROGRESS: 0 100\nInstall failed: Access is denied\nOCPROGRESS: 50 100\n"
  expect(parseDesktopInstallOutput(output)).toEqual({ ok: false, message: "Install failed: Access is denied" })
})

test("parses ChatGPT and Cursor labels with the shared checker", () => {
  expect(parseDesktopCheckOutput("UPDATE 1.0 2.0\n", "ChatGPT Desktop")).toEqual({
    ok: true,
    upToDate: false,
    oldVersion: "1.0",
    newVersion: "2.0",
  })
  expect(
    parseDesktopCheckOutput("Cursor Desktop system install not supported\n", "Cursor Desktop", [
      "Cursor Desktop system install not supported",
    ]),
  ).toEqual({
    ok: false,
    message: "Cursor Desktop system install not supported",
  })
})

test("drops an inherited PSModulePath in any casing for Windows PowerShell", () => {
  expect(windowsPowershellEnv({ PSModulePath: "a", Path: "p" })).toEqual({ Path: "p" })
  expect(windowsPowershellEnv({ PSMODULEPATH: "a" })).toEqual({})
})

// Under a PowerShell 7 parent, 5.1 failed to load Microsoft.PowerShell.Security, which the install
// scripts need for Get-AuthenticodeSignature.
test.skipIf(process.platform !== "win32")(
  "Windows PowerShell loads its Security module under a PowerShell 7 PSModulePath",
  async () => {
    const pwsh7 = [
      path.join(process.env.ProgramFiles ?? "C:\\Program Files", "PowerShell", "7", "Modules"),
      path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "Modules"),
    ].join(";")
    const result = await runCliCommand(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "(Get-AuthenticodeSignature -FilePath (Join-Path $env:SystemRoot 'notepad.exe')).Status",
      ],
      60_000,
      windowsPowershellEnv({ ...process.env, PSModulePath: pwsh7 }),
    )
    expect(result.lastLine).toBe("Valid")
  },
  60_000,
)

// Runs DOWNLOAD_HELPERS the way the update scripts do (Stop + OCERR trap) against a local server.
async function runSaveDownload(uri: string, allowHost: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "oc-save-download-"))
  const file = path.join(dir, "download.bin")
  const script = String.raw`
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
trap { Write-Output "OCERR: $($_.Exception.Message)"; exit 1 }
${DOWNLOAD_HELPERS}
Save-Download -Uri "${uri}" -OutFile "${file}" -AllowHost { param($h) ${allowHost} }
Write-Output "SIZE $((Get-Item -LiteralPath "${file}").Length)"
`
  const lines: string[] = []
  try {
    const result = await runCliCommand(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      60_000,
      windowsPowershellEnv(),
      (line) => lines.push(line),
    )
    return { result, lines }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe.skipIf(process.platform !== "win32")("Save-Download", () => {
  const size = 3 * 1024 * 1024
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === "/redirect") return Response.redirect(`${url.origin}/file`, 302)
      if (url.pathname === "/file") return new Response(new Uint8Array(size))
      return new Response("missing", { status: 404 })
    },
  })
  afterAll(() => server.stop(true))
  const base = () => `http://127.0.0.1:${server.port}`

  test("follows a redirect, reports progress, and writes the whole file", async () => {
    const { result, lines } = await runSaveDownload(`${base()}/redirect`, '$h -eq "127.0.0.1"')
    expect(result.lastLine).toBe(`SIZE ${size}`)
    expect(lines[0]).toBe("OCSTEP: downloading")
    expect(lines[1]).toBe(`OCPROGRESS: 0 ${size}`)
    expect(lines.filter((line) => line.startsWith("OCPROGRESS: ")).at(-1)).toBe(`OCPROGRESS: ${size} ${size}`)
  }, 60_000)

  test("refuses a final host the allowlist rejects before writing", async () => {
    const { result, lines } = await runSaveDownload(`${base()}/redirect`, "$false")
    expect(result.lastLine).toBe("OCERR: Download redirected to unexpected host '127.0.0.1'")
    expect(lines.some((line) => line.startsWith("OCPROGRESS: "))).toBe(false)
  }, 60_000)

  test("reports an HTTP error status", async () => {
    const { result } = await runSaveDownload(`${base()}/gone`, "$true")
    expect(result.lastLine).toBe("OCERR: Download failed: HTTP 404")
  }, 60_000)
})
