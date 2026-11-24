import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { parseAppcast, parseClaudeReleases, parseTeamId } from "../src/macAppUpdate"

const claudeHosts = ["downloads.claude.ai"]
const chatgptHosts = ["persistent.oaistatic.com"]

// Shape of https://downloads.claude.ai/releases/darwin/universal/RELEASES.json (2026-11-21).
test("reads Claude's current release and pins its download host", () => {
  const zip = "https://downloads.claude.ai/releases/darwin/universal/6.28899.6/Claude-abc123.zip"
  const feed = {
    currentRelease: "6.28899.6",
    releases: [
      { updateTo: { version: "6.28899.2", url: "https://downloads.claude.ai/old.zip" } },
      { updateTo: { version: "6.28899.6", url: zip } },
    ],
  }
  expect(parseClaudeReleases(feed, claudeHosts)).toEqual({ version: "6.28899.6", url: zip })
  const elsewhere = {
    currentRelease: "1.2.3",
    releases: [{ updateTo: { version: "1.2.3", url: "https://evil.example/x.zip" } }],
  }
  expect(() => parseClaudeReleases(elsewhere, claudeHosts)).toThrow("unexpected download url")
  const http = {
    currentRelease: "1.2.3",
    releases: [{ updateTo: { version: "1.2.3", url: "http://downloads.claude.ai/x.zip" } }],
  }
  expect(() => parseClaudeReleases(http, claudeHosts)).toThrow("unexpected download url")
  expect(() => parseClaudeReleases({ currentRelease: "1.2.3", releases: [] }, claudeHosts)).toThrow(
    "no current release",
  )
})

// Trimmed https://persistent.oaistatic.com/codex-app-prod/appcast.xml (2026-11-21).
test("reads the newest appcast item", () => {
  const xml = `<rss><channel>
    <item><title>26.1117.41037</title>
      <sparkle:version>29803</sparkle:version>
      <sparkle:shortVersionString>26.1117.41037</sparkle:shortVersionString>
      <enclosure url="https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.1117.41037.zip" sparkle:edSignature="x" length="1" type="application/octet-stream"/>
    </item>
    <item><sparkle:shortVersionString>26.1100.1</sparkle:shortVersionString>
      <enclosure url="https://persistent.oaistatic.com/codex-app-prod/old.zip"/></item>
  </channel></rss>`
  expect(parseAppcast(xml, chatgptHosts)).toEqual({
    version: "26.1117.41037",
    url: "https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.1117.41037.zip",
  })
  expect(() => parseAppcast("<rss></rss>", chatgptHosts)).toThrow("no release")
})

test("reads the signing team from codesign -dv", () => {
  expect(parseTeamId("Identifier=com.anthropic.claudefordesktop\nTeamIdentifier=Q6L2SF6YDW\n")).toBe("Q6L2SF6YDW")
  expect(() => parseTeamId("TeamIdentifier=not set\n")).toThrow("no Developer ID team")
})

test.skipIf(process.platform !== "darwin")("reports an install that finds the app already current", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "oc-mac-app-update-test-"))
  try {
    const home = path.join(dir, "home")
    const plist = path.join(home, "Applications", "Fixture.app", "Contents", "Info.plist")
    await mkdir(path.dirname(plist), { recursive: true })
    await Bun.write(
      plist,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.example.fixture</string>
<key>CFBundleShortVersionString</key><string>1.2.3</string>
</dict></plist>`,
    )
    const script = `
const { installMacApp } = await import(${JSON.stringify(new URL("../src/macAppUpdate.ts", import.meta.url).href)})
const spec = {
  key: "fixture",
  label: "Fixture",
  appName: "Fixture.app",
  hosts: ["example.com"],
  note: "",
  latest: async () => ({ version: "1.2.3", url: "https://example.com/fixture.zip" }),
}
console.log(JSON.stringify(await installMacApp(spec, "1.2.3")))
`
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", script],
      env: { ...process.env, HOME: home },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    })
    if (result.exitCode !== 0) throw new Error(result.stderr.toString())
    const output: unknown = JSON.parse(result.stdout.toString())
    expect(output).toEqual({
      ok: true,
      alreadyRunning: false,
      upToDate: true,
      message: "Fixture is up to date (1.2.3)",
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
