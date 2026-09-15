import { describe, expect, test } from "bun:test"
import { createServer } from "node:http"
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir as osTmpdir } from "node:os"
import path from "node:path"
import { $ } from "bun"
import { tmpdir } from "../../fixture/fixture"
import { redactRemoteUrl } from "@/provider/cursor/context/git"
import { collectAgents } from "@/provider/cursor/context/agents"
import {
  fetchRemoteInstruction,
  isHostnameBlocked,
  isIPBlocked,
  MAX_REMOTE_REDIRECTS,
} from "@/provider/cursor/context/rules"
import { buildRequestContext } from "@/provider/cursor/context/build"

function startHttpServer(
  handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = createServer(handler)
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address()
      if (!addr || typeof addr === "string") return reject(new Error("failed to bind"))
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      })
    })
    server.on("error", reject)
  })
}

function startHttpsLikeServer(
  handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void,
): Promise<{ httpsUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = createServer(handler)
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address()
      if (!addr || typeof addr === "string") return reject(new Error("failed to bind"))
      resolve({
        httpsUrl: `https://127.0.0.1:${addr.port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      })
    })
    server.on("error", reject)
  })
}

describe("context-security: git remote redaction", () => {
  test("redactRemoteUrl strips userinfo", () => {
    expect(redactRemoteUrl("https://user:pass@github.com/org/repo.git")).toBe("https://github.com/org/repo.git")
    expect(redactRemoteUrl("https://token@github.com/org/repo.git")).toBe("https://github.com/org/repo.git")
    expect(redactRemoteUrl("https://user:secret123@github.com:443/org/repo")).toBe("https://github.com/org/repo")
    expect(redactRemoteUrl("http://user:pass@example.com/a/b")).toBe("http://example.com/a/b")
    expect(redactRemoteUrl("ssh://user:pass@github.com/org/repo.git")).toBe("ssh://github.com/org/repo.git")
    expect(redactRemoteUrl("git@github.com:org/repo.git")).toBe("github.com:org/repo.git")
    expect(redactRemoteUrl("https://github.com/org/repo.git")).toBe("https://github.com/org/repo.git")
    expect(redactRemoteUrl("file:///tmp/repo")).toBe("file:///tmp/repo")
  })

  test("no credential userinfo in serialized git context", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await $`git remote add origin https://myuser:mysupersecret@github.com/testowner/testrepo.git`
          .cwd(dir)
          .quiet()
          .nothrow()
      },
    })
    const ctx = await buildRequestContext({ workspaceRoot: tmp.path })
    const serialized = JSON.stringify(ctx)
    expect(serialized).not.toContain("myuser")
    expect(serialized).not.toContain("mysupersecret")
    // repository_info and git_repos should be present but redacted
    const repoInfo = ctx.repository_info as Array<{ remote_urls: string[] }>
    expect(repoInfo[0]?.remote_urls[0]).toBe("https://github.com/testowner/testrepo.git")
    const gitRepos = ctx.git_repos as Array<{ remote_url?: string }>
    expect(gitRepos[0]?.remote_url).toBe("https://github.com/testowner/testrepo.git")
  })
})

describe("context-security: agents symlink containment", () => {
  test("symlinked file outside trusted root is rejected", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const agentsDir = path.join(dir, ".opencode", "agents")
        await mkdir(agentsDir, { recursive: true })
        // inside file should be collected
        await writeFile(
          path.join(agentsDir, "inside.md"),
          "---\nname: inside\ndescription: ok\n---\nhello inside",
          "utf-8",
        )
        // outside secret
        const outsideDir = await mkOutsideDir()
        const outsideFile = path.join(outsideDir, "secret.md")
        await writeFile(outsideFile, "---\nname: evil\ndescription: evil\n---\nSUPER_SECRET_OUTSIDE", "utf-8")
        const linkPath = path.join(agentsDir, "evil.md")
        try {
          await symlink(outsideFile, linkPath, "file")
        } catch {
          // Windows without dev mode may fail; create a regular file with marker and test fallback
          // If symlink cannot be created, we still verify that a file containing the secret
          // would be collected if it were inside, but our symlink check would skip it.
          // We skip this test when symlink unavailable.
          // Instead, we test that collectAgents does not crash and does not include outside content
          // when symlink is not present.
        }
        // stash outside dir for cleanup via global
        ;(globalThis as unknown as Record<string, string>).__outsideDir = outsideDir
      },
    })
    const agents = await collectAgents(tmp.path)
    const serialized = JSON.stringify(agents)
    expect(serialized).not.toContain("SUPER_SECRET_OUTSIDE")
    // inside file should be present
    expect(agents.some((a) => a.name === "inside")).toBe(true)
    expect(agents.some((a) => a.prompt.includes("SUPER_SECRET"))).toBe(false)
    const outsideDir = (globalThis as unknown as Record<string, string>).__outsideDir
    if (outsideDir) await rm(outsideDir, { recursive: true, force: true }).catch(() => undefined)
  })

  test("symlinked directory outside trusted root is rejected", async () => {
    const outsideDir = await mkOutsideDir()
    const secretFile = path.join(outsideDir, "nested.md")
    await mkdir(outsideDir, { recursive: true })
    await writeFile(secretFile, "---\nname: nested-evil\ndescription: evil\n---\nDIR_SECRET_OUTSIDE", "utf-8")
    await using tmp = await tmpdir({
      init: async (dir) => {
        const agentsDir = path.join(dir, ".opencode", "agents")
        await mkdir(agentsDir, { recursive: true })
        const linkPath = path.join(agentsDir, "linkdir")
        try {
          // junction works on Windows without admin for directories
          const type = process.platform === "win32" ? "junction" : "dir"
          await symlink(outsideDir, linkPath, type as never)
        } catch {
          // skip if cannot create
        }
      },
    })
    const agents = await collectAgents(tmp.path)
    expect(JSON.stringify(agents)).not.toContain("DIR_SECRET_OUTSIDE")
    expect(agents.some((a) => a.prompt.includes("DIR_SECRET"))).toBe(false)
    await rm(outsideDir, { recursive: true, force: true }).catch(() => undefined)
  })

  test("symlink inside trusted root is still collected", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const agentsDir = path.join(dir, ".opencode", "agents")
        const subDir = path.join(dir, ".opencode", "extra")
        await mkdir(agentsDir, { recursive: true })
        await mkdir(subDir, { recursive: true })
        const target = path.join(subDir, "real.md")
        await writeFile(target, "---\nname: innerlink\ndescription: ok\n---\nINNER_SECRET_OK", "utf-8")
        const linkPath = path.join(agentsDir, "inner.md")
        try {
          await symlink(target, linkPath, "file")
        } catch {
          // if symlink fails, copy file as fallback to still test collection
          await writeFile(linkPath, await readFile(target, "utf-8"), "utf-8").catch(() => undefined)
        }
      },
    })
    const agents = await collectAgents(tmp.path)
    // Should contain the inner secret because target is inside trusted root
    expect(agents.some((a) => a.name === "innerlink" && a.prompt.includes("INNER_SECRET_OK"))).toBe(true)
  })

  test("serialization of request context never contains out-of-root secret", async () => {
    const outsideDir = await mkOutsideDir()
    await writeFile(
      path.join(outsideDir, "payload.md"),
      "---\nname: should-not-leak\ndescription: x\n---\nOUT_OF_ROOT_PAYLOAD",
      "utf-8",
    )
    await using tmp = await tmpdir({
      init: async (dir) => {
        const agentsDir = path.join(dir, ".opencode", "agents")
        await mkdir(agentsDir, { recursive: true })
        const linkPath = path.join(agentsDir, "leak.md")
        try {
          await symlink(path.join(outsideDir, "payload.md"), linkPath, "file")
        } catch {
          // ignore
        }
      },
    })
    const ctx = await buildRequestContext({ workspaceRoot: tmp.path })
    expect(JSON.stringify(ctx)).not.toContain("OUT_OF_ROOT_PAYLOAD")
    await rm(outsideDir, { recursive: true, force: true }).catch(() => undefined)
  })
})

async function mkOutsideDir(): Promise<string> {
  const dir = path.join(osTmpdir(), `opencode-test-outside-${Math.random().toString(36).slice(2)}`)
  await mkdir(dir, { recursive: true })
  return dir
}

describe("context-security: remote rule redirects", () => {
  test("isIPBlocked covers loopback/private/link-local/metadata", () => {
    expect(isIPBlocked("127.0.0.1")).toBe(true)
    expect(isIPBlocked("127.1.2.3")).toBe(true)
    expect(isIPBlocked("10.0.0.1")).toBe(true)
    expect(isIPBlocked("10.255.255.255")).toBe(true)
    expect(isIPBlocked("192.168.0.1")).toBe(true)
    expect(isIPBlocked("192.168.255.10")).toBe(true)
    expect(isIPBlocked("172.16.0.1")).toBe(true)
    expect(isIPBlocked("172.31.255.255")).toBe(true)
    expect(isIPBlocked("172.15.255.255")).toBe(false)
    expect(isIPBlocked("172.32.0.1")).toBe(false)
    expect(isIPBlocked("169.254.1.1")).toBe(true)
    expect(isIPBlocked("169.254.169.254")).toBe(true)
    expect(isIPBlocked("0.0.0.0")).toBe(true)
    expect(isIPBlocked("8.8.8.8")).toBe(false)
    expect(isIPBlocked("1.1.1.1")).toBe(false)
    expect(isIPBlocked("::1")).toBe(true)
    expect(isIPBlocked("::")).toBe(true)
    expect(isIPBlocked("fe80::1")).toBe(true)
    expect(isIPBlocked("fc00::1")).toBe(true)
    expect(isIPBlocked("fd00::1")).toBe(true)
    expect(isIPBlocked("ff02::1")).toBe(true)
  })

  test("isHostnameBlocked rejects localhost and private IPs", () => {
    expect(isHostnameBlocked("localhost")).toBe(true)
    expect(isHostnameBlocked("LOCALHOST")).toBe(true)
    expect(isHostnameBlocked("foo.localhost")).toBe(true)
    expect(isHostnameBlocked("127.0.0.1")).toBe(true)
    expect(isHostnameBlocked("10.0.0.5")).toBe(true)
    expect(isHostnameBlocked("192.168.1.1")).toBe(true)
    expect(isHostnameBlocked("::1")).toBe(true)
    expect(isHostnameBlocked("example.com")).toBe(false)
    expect(isHostnameBlocked("test.invalid")).toBe(false)
  })

  test("fetchRemoteInstruction rejects non-HTTPS", async () => {
    const srv = await startHttpServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" })
      res.end("should not be fetched")
    })
    const result = await fetchRemoteInstruction(srv.url + "/x")
    expect(result).toBeUndefined()
    await srv.close()
  })

  test("fetchRemoteInstruction rejects loopback/private/metadata per hop", async () => {
    // https to loopback should be rejected before network
    expect(await fetchRemoteInstruction("https://127.0.0.1/secret")).toBeUndefined()
    expect(await fetchRemoteInstruction("https://10.0.0.1/secret")).toBeUndefined()
    expect(await fetchRemoteInstruction("https://192.168.1.1/secret")).toBeUndefined()
    expect(await fetchRemoteInstruction("https://172.16.5.4/secret")).toBeUndefined()
    expect(await fetchRemoteInstruction("https://169.254.169.254/latest/meta-data/")).toBeUndefined()
    expect(await fetchRemoteInstruction("https://[::1]/secret")).toBeUndefined()
    expect(await fetchRemoteInstruction("https://[fe80::1]/secret")).toBeUndefined()
    expect(await fetchRemoteInstruction("https://localhost/secret")).toBeUndefined()
  })

  test("fetchRemoteInstruction uses local redirect server deterministically and rejects private target", async () => {
    // Real local server that would return secret if fetched; fetchRemoteInstruction must not return it
    const secret = "LOCAL_SECRET_" + Math.random().toString(36).slice(2)
    const srv = await startHttpsLikeServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" })
      res.end(secret)
    })
    const result = await fetchRemoteInstruction(srv.httpsUrl + "/payload")
    expect(result).toBeUndefined()
    expect(result).not.toBe(secret)
    await srv.close()
  })

  test("per-hop validation blocks redirect to private", async () => {
    const originalFetch = globalThis.fetch
    try {
      // Mock fetch: first hop is public test.invalid, redirects to private 127.0.0.1
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString()
        if (url === "https://test.invalid/start") {
          return new Response(null, { status: 302, headers: { Location: "https://127.0.0.1/secret" } })
        }
        return new Response("should not be reached", { status: 200 })
      }) as unknown as typeof fetch
      const result = await fetchRemoteInstruction("https://test.invalid/start")
      expect(result).toBeUndefined()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("per-hop validation blocks redirect to non-HTTPS", async () => {
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString()
        if (url === "https://test.invalid/start") {
          return new Response(null, { status: 302, headers: { Location: "http://test.invalid/next" } })
        }
        return new Response("ok", { status: 200 })
      }) as unknown as typeof fetch
      const result = await fetchRemoteInstruction("https://test.invalid/start")
      expect(result).toBeUndefined()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("redirect count is capped at MAX_REMOTE_REDIRECTS", async () => {
    const originalFetch = globalThis.fetch
    let fetchCount = 0
    try {
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        fetchCount++
        const url = typeof input === "string" ? input : input.toString()
        const parsed = new URL(url)
        const n = Number(parsed.pathname.slice(1) || "0")
        if (n <= MAX_REMOTE_REDIRECTS + 2) {
          return new Response(null, { status: 302, headers: { Location: `https://test.invalid/${n + 1}` } })
        }
        return new Response("final", { status: 200 })
      }) as unknown as typeof fetch
      const result = await fetchRemoteInstruction("https://test.invalid/0")
      expect(result).toBeUndefined()
      expect(fetchCount).toBe(MAX_REMOTE_REDIRECTS + 1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("successful fetch via mocked public chain within cap", async () => {
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString()
        if (url === "https://test.invalid/start") {
          return new Response(null, { status: 302, headers: { Location: "https://test.invalid/next" } })
        }
        if (url === "https://test.invalid/next") {
          return new Response("public content ok", { status: 200 })
        }
        return new Response(null, { status: 404 })
      }) as unknown as typeof fetch
      const result = await fetchRemoteInstruction("https://test.invalid/start")
      expect(result).toBe("public content ok")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("no real external network: local server redirect chain is bounded and blocked", async () => {
    const srv2 = await startHttpServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" })
      res.end("secret2")
    })
    const srv1 = await startHttpServer((_req, res) => {
      res.writeHead(302, { Location: srv2.url + "/next" })
      res.end()
    })
    // Even though srv1 redirects to srv2 locally, fetchRemoteInstruction with https should block
    // because both are http and loopback. Verify deterministic without external network.
    const result = await fetchRemoteInstruction(srv1.url.replace("http://", "https://") + "/start")
    expect(result).toBeUndefined()
    await srv1.close()
    await srv2.close()
  })

  test("serialization never contains leaked redirect target secret", async () => {
    const secret = "REDIRECT_SECRET_" + Math.random().toString(36).slice(2)
    const srv = await startHttpsLikeServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" })
      res.end(secret)
    })
    // Simulate a workspace whose opencode.json points at the local https URL (which will be blocked)
    await using tmp = await tmpdir({
      init: async (dir) => {
        await writeFile(
          path.join(dir, "opencode.json"),
          JSON.stringify({ $schema: "https://opencode.ai/config.json", instructions: [srv.httpsUrl + "/rules"] }),
          "utf-8",
        )
      },
    })
    const ctx = await buildRequestContext({ workspaceRoot: tmp.path })
    expect(JSON.stringify(ctx)).not.toContain(secret)
    await srv.close()
  })
})
