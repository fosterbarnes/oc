import { expect, test } from "bun:test"
import { parseDesktopCheckOutput, parseDesktopInstallOutput } from "../src/desktopUpdate"

const parseChatgptDesktopCheckOutput = (output: string) => parseDesktopCheckOutput(output, "ChatGPT Desktop")
const parseChatgptDesktopInstallOutput = (output: string) => parseDesktopInstallOutput(output, "ChatGPT Desktop")

test("parses an up-to-date check", () => {
  expect(parseChatgptDesktopCheckOutput("ChatGPT Desktop is up to date (26.1007.2314.0)\n")).toEqual({
    ok: true,
    upToDate: true,
    version: "26.1007.2314.0",
  })
})

test("parses an available update", () => {
  expect(parseChatgptDesktopCheckOutput("UPDATE 26.1007.2314.0 26.1008.100.0\n")).toEqual({
    ok: true,
    upToDate: false,
    oldVersion: "26.1007.2314.0",
    newVersion: "26.1008.100.0",
  })
})

test("treats a stale update line as up to date", () => {
  expect(parseChatgptDesktopCheckOutput("UPDATE 26.1008.100.0 26.1007.2314.0\n")).toEqual({
    ok: true,
    upToDate: true,
    version: "26.1008.100.0",
  })
})

test("parses a missing install", () => {
  expect(parseChatgptDesktopCheckOutput("ChatGPT Desktop not installed\n")).toEqual({
    ok: false,
    message: "ChatGPT Desktop not installed",
  })
})

test("falls back to the last line for unknown output", () => {
  expect(parseChatgptDesktopCheckOutput("noise\nboom\n")).toEqual({ ok: false, message: "boom" })
})

test("parses a successful install", () => {
  expect(parseChatgptDesktopInstallOutput("Updated ChatGPT Desktop 26.1007.2314.0 -> 26.1008.100.0\n")).toEqual({
    ok: true,
    message: "Updated ChatGPT Desktop 26.1007.2314.0 -> 26.1008.100.0",
  })
})

test("parses a failed install from the last line", () => {
  expect(parseChatgptDesktopInstallOutput("Install failed: Access is denied (signature status: Valid)\n")).toEqual({
    ok: false,
    message: "Install failed: Access is denied (signature status: Valid)",
  })
})
