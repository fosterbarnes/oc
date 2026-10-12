import { expect, test } from "bun:test"
import { compareDesktopVersions, parseDesktopCheckOutput, parseDesktopInstallOutput } from "../src/desktopUpdate"

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
