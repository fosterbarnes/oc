import { expect, test } from "bun:test"
import { parseDesktopCheckOutput, parseDesktopInstallOutput } from "../src/desktopUpdate"

const parseCheck = (output: string) => parseDesktopCheckOutput(output, "PowerShell")
const parseInstall = (output: string) => parseDesktopInstallOutput(output, "PowerShell")

test("parses an available update", () => {
  expect(parseCheck("UPDATE 7.6.6 7.6.7\n")).toEqual({
    ok: true,
    upToDate: false,
    oldVersion: "7.6.6",
    newVersion: "7.6.7",
  })
})

test("parses an up-to-date check", () => {
  expect(parseCheck("PowerShell is up to date (7.6.7)\n")).toEqual({ ok: true, upToDate: true, version: "7.6.7" })
})

test("parses a missing MSI install", () => {
  expect(parseCheck("OCERR: PowerShell not installed\n")).toEqual({
    ok: false,
    message: "PowerShell not installed",
    notInstalled: true,
  })
})

test("reports the 7.7 MSI cutoff verbatim", () => {
  expect(parseCheck("OCERR: PowerShell 7.7.0 has no MSI package; reinstall from the MSIX package\n")).toEqual({
    ok: false,
    message: "PowerShell 7.7.0 has no MSI package; reinstall from the MSIX package",
  })
})

test("accepts an install that needs a restart", () => {
  expect(parseInstall("Updated PowerShell 7.6.6 -> 7.6.7 (restart Windows to finish)\n")).toEqual({
    ok: true,
    message: "Updated PowerShell 7.6.6 -> 7.6.7 (restart Windows to finish)",
  })
})

test("reports a cancelled admin prompt", () => {
  expect(parseInstall("OCERR: Cancelled at the admin prompt\n")).toEqual({
    ok: false,
    message: "Cancelled at the admin prompt",
  })
})
