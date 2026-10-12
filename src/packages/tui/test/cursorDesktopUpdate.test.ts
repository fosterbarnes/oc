import { expect, test } from "bun:test"
import { parseDesktopCheckOutput, parseDesktopInstallOutput } from "../src/desktopUpdate"

const parseCursorDesktopCheckOutput = (output: string) =>
  parseDesktopCheckOutput(output, "Cursor Desktop", ["Cursor Desktop system install not supported"])
const parseCursorDesktopInstallOutput = (output: string) => parseDesktopInstallOutput(output, "Cursor Desktop")

test("parses an up-to-date check", () => {
  expect(parseCursorDesktopCheckOutput("Cursor Desktop is up to date (3.24.12)\n")).toEqual({
    ok: true,
    upToDate: true,
    version: "3.24.12",
  })
})

test("parses an available update", () => {
  expect(parseCursorDesktopCheckOutput("UPDATE 3.24.12 3.25.0\n")).toEqual({
    ok: true,
    upToDate: false,
    oldVersion: "3.24.12",
    newVersion: "3.25.0",
  })
})

test("treats a stale update line as up to date", () => {
  expect(parseCursorDesktopCheckOutput("UPDATE 3.25.0 3.24.12\n")).toEqual({
    ok: true,
    upToDate: true,
    version: "3.25.0",
  })
})

test("parses a missing install", () => {
  expect(parseCursorDesktopCheckOutput("Cursor Desktop not installed\n")).toEqual({
    ok: false,
    message: "Cursor Desktop not installed",
  })
})

test("parses an unsupported system install", () => {
  expect(parseCursorDesktopCheckOutput("Cursor Desktop system install not supported\n")).toEqual({
    ok: false,
    message: "Cursor Desktop system install not supported",
  })
})

test("falls back to the last line for unknown output", () => {
  expect(parseCursorDesktopCheckOutput("noise\nboom\n")).toEqual({ ok: false, message: "boom" })
})

test("parses a successful install", () => {
  expect(parseCursorDesktopInstallOutput("Updated Cursor Desktop 3.24.12 -> 3.25.0\n")).toEqual({
    ok: true,
    message: "Updated Cursor Desktop 3.24.12 -> 3.25.0",
  })
})

test("parses a failed install from the last line", () => {
  expect(parseCursorDesktopInstallOutput("Install failed: exit code 1 (is Cursor still running?)\n")).toEqual({
    ok: false,
    message: "Install failed: exit code 1 (is Cursor still running?)",
  })
})
