import { afterAll, describe, expect, test } from "bun:test"
import path from "path"
import { rm } from "node:fs/promises"
import { NpmUpdate } from "@opencode-ai/core/npm-update"

// Test preload points XDG_CACHE_HOME at a temp dir, so these fake installs never touch the real cache.
const packages: Record<string, { "dist-tags": Record<string, string>; versions: Record<string, object> }> = {
  "oc-demo": { "dist-tags": { latest: "1.4.0", next: "2.0.0-beta.1" }, versions: { "1.2.0": {}, "1.4.0": {} } },
  "@acme/oc-tool": { "dist-tags": { latest: "3.1.0" }, versions: { "2.0.0": {}, "2.5.1": {}, "3.1.0": {} } },
}

const registry = Bun.serve({
  port: 0,
  fetch(req) {
    const meta = packages[decodeURIComponent(new URL(req.url).pathname.slice(1))]
    return meta ? Response.json(meta) : new Response("not found", { status: 404 })
  },
})
const url = registry.url.href.replace(/\/$/, "")

afterAll(async () => {
  registry.stop(true)
  await Promise.all(
    ["oc-demo", "oc-demo@next", "@acme/oc-tool@^2.0.0"].map((spec) =>
      rm(NpmUpdate.cacheDir(spec), { recursive: true, force: true }),
    ),
  )
})

async function install(spec: string, name: string, version: string) {
  await Bun.write(
    path.join(NpmUpdate.cacheDir(spec), "node_modules", name, "package.json"),
    JSON.stringify({ name, version }),
  )
}

describe("NpmUpdate", () => {
  test("bare names install as @latest", () => {
    expect(NpmUpdate.installSpec("oc-demo")).toBe("oc-demo@latest")
    expect(NpmUpdate.installSpec("oc-demo@^1.0.0")).toBe("oc-demo@^1.0.0")
  })

  test("reports a newer latest for a bare spec", async () => {
    await install("oc-demo", "oc-demo", "1.2.0")
    expect(await NpmUpdate.check("oc-demo", { registry: url })).toEqual({
      name: "oc-demo",
      installed: "1.2.0",
      latest: "1.4.0",
      outdated: true,
    })
  })

  test("follows the spec's dist-tag", async () => {
    await install("oc-demo@next", "oc-demo", "2.0.0-beta.1")
    expect(await NpmUpdate.check("oc-demo@next", { registry: url })).toMatchObject({ outdated: false })
  })

  test("a range only moves within the range, and scoped names reach the registry", async () => {
    await install("@acme/oc-tool@^2.0.0", "@acme/oc-tool", "2.0.0")
    expect(await NpmUpdate.check("@acme/oc-tool@^2.0.0", { registry: url })).toMatchObject({
      latest: "2.5.1",
      outdated: true,
    })
  })

  test("not installed is never outdated", async () => {
    expect(await NpmUpdate.check("@acme/oc-tool", { registry: url })).toMatchObject({
      installed: undefined,
      outdated: false,
    })
  })

  test("exact pins and paths are skipped", async () => {
    expect(await NpmUpdate.check("oc-demo@1.2.0", { registry: url })).toBeUndefined()
    expect(await NpmUpdate.check("file:///C:/plugins/demo", { registry: url })).toBeUndefined()
  })

  test("registry errors reject", async () => {
    await expect(NpmUpdate.check("oc-missing", { registry: url })).rejects.toThrow("returned 404")
  })
})
