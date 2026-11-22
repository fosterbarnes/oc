import { expect, test } from "bun:test"
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
