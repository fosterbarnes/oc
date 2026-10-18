import { afterAll, beforeAll, expect, test } from "bun:test"
import { OcRelease } from "../../src/util/ocRelease"

// Asset names exactly as .scripts/pushRelease.ps1 publishes them.
const assets = ["", "native-", "debug-"].flatMap((variant) =>
  ["windows-x64", "linux-x64"].map((platform) => ({
    name: `opencode-v0.3.1-coastersWall-${variant}${platform}.zip`,
    url: `https://example.invalid/${variant}${platform}.zip`,
  })),
)
const release = { version: "0.3.1", assets }

test("asset picks each variant for the running platform", () => {
  const platform = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`
  for (const [variant, prefix] of [
    ["oc", ""],
    ["native", "native-"],
  ] as const) {
    const expected = assets.find((item) => item.name === `opencode-v0.3.1-coastersWall-${prefix}${platform}.zip`)
    expect(OcRelease.asset(release, variant)).toEqual(expected)
  }
})

test("asset ignores other versions and missing variants", () => {
  expect(OcRelease.asset({ version: "0.3.2", assets }, "oc")).toBeUndefined()
  expect(OcRelease.asset({ version: "0.3.1", assets: [] }, "native")).toBeUndefined()
})

test("isNewer compares numeric parts and prereleases", () => {
  expect(OcRelease.isNewer("0.3.0", "0.2.174")).toBe(true)
  expect(OcRelease.isNewer("0.2.174", "0.3.0")).toBe(false)
  expect(OcRelease.isNewer("v0.3.0", "0.3.0")).toBe(false)
  expect(OcRelease.isNewer("0.3.0", "0.3.0-beta.1")).toBe(true)
  expect(OcRelease.isNewer("0.3.0-beta.2", "0.3.0-beta.10")).toBe(false)
})

let server: ReturnType<typeof Bun.serve>
beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url)
      if (url.pathname.endsWith("/releases/latest"))
        // `digest` exactly as GitHub's release API returns it.
        return Response.json({
          tag_name: "v0.3.1",
          assets: [
            { name: "a.zip", browser_download_url: "u", digest: `sha256:${"ab".repeat(32)}` },
            { name: "b.zip", browser_download_url: "v", digest: "sha256:XYZ" },
            { name: "c.zip", browser_download_url: "w" },
            { x: 1 },
          ],
        })
      if (url.pathname.endsWith("/releases/tags/v9.9.9")) return new Response("{}", { status: 404 })
      return Response.json({ unexpected: true })
    },
  })
})
afterAll(() => server.stop(true))

test("lookup parses the release, keeps valid SHA-256 digests, and drops malformed assets", async () => {
  expect(await OcRelease.lookup(undefined, server.url.origin)).toEqual({
    version: "0.3.1",
    assets: [
      { name: "a.zip", url: "u", sha256: "ab".repeat(32) },
      { name: "b.zip", url: "v" },
      { name: "c.zip", url: "w" },
    ],
  })
})

test("lookup reports HTTP errors and unexpected bodies", async () => {
  await expect(OcRelease.lookup("9.9.9", server.url.origin)).rejects.toThrow("HTTP 404")
  await expect(OcRelease.lookup("1.0.0", server.url.origin)).rejects.toThrow("unexpected response")
})
