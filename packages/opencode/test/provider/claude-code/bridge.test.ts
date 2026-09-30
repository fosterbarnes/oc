// @ts-nocheck
// WIP: ported from opencode-claude-code-plugin, which never typechecked its tests; type them as Phase 3 rewrites land.
/**
 * Unit tests for src/mcp-bridge.ts.
 *
 * Runs offline against fake config trees written under a per-test temp dir.
 * Uses Node's built-in `node:test` so no extra dependencies are pulled in.
 *
 * Usage:
 *   bun test-bridge.ts
 *   node --experimental-strip-types --test test-bridge.ts
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"

import { mergeOpencodeMcp, __test } from "@/provider/claude-code/mcp-bridge.js"
import { defaultModels, toConfigModel } from "@/provider/claude-code/models.js"

const {
  deepMerge,
  mergeMcp,
  detectWorktree,
} = __test

function mkTmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function writeJson(p: string, obj: unknown) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(obj, null, 2))
}

async function withIsolatedEnv<T>(fn: (xdgRoot: string) => Promise<T> | T): Promise<T> {
  const xdgRoot = mkTmp("oc-test-xdg-")
  const original: Record<string, string | undefined> = {
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    OPENCODE_CONFIG: process.env.OPENCODE_CONFIG,
    OPENCODE_CONFIG_DIR: process.env.OPENCODE_CONFIG_DIR,
    OPENCODE_WORKTREE: process.env.OPENCODE_WORKTREE,
    HOME: process.env.HOME,
  }
  process.env.XDG_CONFIG_HOME = xdgRoot
  delete process.env.OPENCODE_CONFIG
  delete process.env.OPENCODE_CONFIG_DIR
  delete process.env.OPENCODE_WORKTREE
  process.env.HOME = xdgRoot
  try {
    return await fn(xdgRoot)
  } finally {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    fs.rmSync(xdgRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }
}

test("deepMerge replaces primitives, deep-merges objects, replaces arrays", () => {
  const out = deepMerge(
    { a: 1, b: { x: 1, y: 2 }, c: [1, 2] },
    { a: 9, b: { y: 99, z: 3 }, c: [3] },
  )
  assert.deepEqual(out, { a: 9, b: { x: 1, y: 99, z: 3 }, c: [3] })
})

test("toConfigModel omits unsupported interleaved field", () => {
  const configModel = toConfigModel(defaultModels["claude-haiku-4-5"])

  assert.equal(Object.hasOwn(configModel, "interleaved"), false)
})

test("deepMerge ignores undefined source values, keeps target", () => {
  const out = deepMerge({ a: 1 }, { a: undefined as unknown as number, b: 2 })
  assert.deepEqual(out, { a: 1, b: 2 })
})

test("mergeMcp: partial {enabled:true} layers onto full global spec", () => {
  const merged = mergeMcp(
    { linear: { type: "remote", url: "https://mcp.linear.app/mcp", enabled: false } },
    { linear: { enabled: true } },
  )
  assert.deepEqual(merged.linear, {
    type: "remote",
    url: "https://mcp.linear.app/mcp",
    enabled: true,
  })
})

test("mergeMcp: per-server, environment block deep-merges", () => {
  const merged = mergeMcp(
    {
      gh: {
        type: "local",
        command: ["github-mcp-server"],
        environment: { TOKEN: "old", BASE_URL: "https://api.github.com" },
        enabled: true,
      },
    } as any,
    { gh: { environment: { TOKEN: "new" } } } as any,
  )
  assert.deepEqual((merged.gh as any).environment, {
    TOKEN: "new",
    BASE_URL: "https://api.github.com",
  })
  assert.equal((merged.gh as any).type, "local")
})

test("mergeMcp: command array is replaced, not concatenated", () => {
  const merged = mergeMcp(
    { srv: { type: "local", command: ["a", "b"], enabled: true } } as any,
    { srv: { command: ["c"] } } as any,
  )
  assert.deepEqual((merged.srv as any).command, ["c"])
})

test("detectWorktree: finds .git ancestor", async () => {
  await withIsolatedEnv(async (xdgRoot) => {
    const repo = path.join(xdgRoot, "repo")
    const sub = path.join(repo, "a", "b", "c")
    fs.mkdirSync(sub, { recursive: true })
    fs.mkdirSync(path.join(repo, ".git"))
    assert.equal(detectWorktree(sub), repo)
  })
})

test("detectWorktree: OPENCODE_WORKTREE env override wins", async () => {
  await withIsolatedEnv(async (xdgRoot) => {
    const repo = path.join(xdgRoot, "repo")
    const override = path.join(xdgRoot, "elsewhere")
    fs.mkdirSync(repo, { recursive: true })
    fs.mkdirSync(override, { recursive: true })
    fs.mkdirSync(path.join(repo, ".git"))
    process.env.OPENCODE_WORKTREE = override
    assert.equal(detectWorktree(path.join(repo, "deep")), override)
  })
})

test("mergeOpencodeMcp: project {enabled:true} unlocks global linear", async () => {
  await withIsolatedEnv(async (xdgRoot) => {
    const globalDir = path.join(xdgRoot, "opencode")
    writeJson(path.join(globalDir, "opencode.json"), {
      mcp: {
        linear: {
          type: "remote",
          url: "https://mcp.linear.app/mcp",
          enabled: false,
        },
      },
    })
    const repo = path.join(xdgRoot, "proj")
    fs.mkdirSync(path.join(repo, ".git"), { recursive: true })
    writeJson(path.join(repo, "opencode.json"), {
      mcp: { linear: { enabled: true } },
    })
    const result = mergeOpencodeMcp(repo)
    assert.deepEqual(result.enabledServerNames, ["linear"])
    assert.deepEqual((result.servers.linear as any).url, "https://mcp.linear.app/mcp")
  })
})

test("mergeOpencodeMcp: project file overrides one field, others preserved", async () => {
  await withIsolatedEnv(async (xdgRoot) => {
    const globalDir = path.join(xdgRoot, "opencode")
    writeJson(path.join(globalDir, "opencode.json"), {
      mcp: {
        gh: {
          type: "local",
          command: ["gh-mcp"],
          environment: { TOKEN: "GLOBAL" },
          enabled: true,
        },
      },
    })
    const repo = path.join(xdgRoot, "proj")
    fs.mkdirSync(path.join(repo, ".git"), { recursive: true })
    writeJson(path.join(repo, "opencode.json"), {
      mcp: { gh: { environment: { TOKEN: "PROJECT" } } },
    })
    const result = mergeOpencodeMcp(repo)
    assert.deepEqual(result.enabledServerNames, ["gh"])
    assert.deepEqual((result.servers.gh as any).environment, { TOKEN: "PROJECT" })
    assert.equal((result.servers.gh as any).type, "local")
  })
})

test("mergeOpencodeMcp: walk-up stops at worktree root", async () => {
  await withIsolatedEnv(async (xdgRoot) => {
    writeJson(path.join(xdgRoot, "opencode.json"), {
      mcp: {
        linear: {
          type: "remote",
          url: "https://mcp.linear.app/mcp",
          enabled: true,
        },
      },
    })
    const repo = path.join(xdgRoot, "repo")
    fs.mkdirSync(path.join(repo, ".git"), { recursive: true })
    const cwd = path.join(repo, "src")
    fs.mkdirSync(cwd, { recursive: true })
    const result = mergeOpencodeMcp(cwd)
    assert.deepEqual(result.enabledServerNames, [])
  })
})

test("mergeOpencodeMcp: hash is stable for identical config, changes when config changes", async () => {
  await withIsolatedEnv(async (xdgRoot) => {
    const globalDir = path.join(xdgRoot, "opencode")
    writeJson(path.join(globalDir, "opencode.json"), {
      mcp: { gh: { type: "local", command: ["gh-mcp"], enabled: true } },
    })
    const repo = path.join(xdgRoot, "proj")
    fs.mkdirSync(path.join(repo, ".git"), { recursive: true })
    const a = mergeOpencodeMcp(repo)
    const b = mergeOpencodeMcp(repo)
    assert.equal(a.hash, b.hash)
    assert.deepEqual(a.enabledServerNames, b.enabledServerNames)
    writeJson(path.join(globalDir, "opencode.json"), {
      mcp: {
        gh: { type: "local", command: ["gh-mcp", "--verbose"], enabled: true },
      },
    })
    const c = mergeOpencodeMcp(repo)
    assert.notEqual(a.hash, c.hash)
  })
})

test("mergeOpencodeMcp: opencode.jsonc beats opencode.json in same dir", async () => {
  await withIsolatedEnv(async (xdgRoot) => {
    const globalDir = path.join(xdgRoot, "opencode")
    writeJson(path.join(globalDir, "opencode.json"), {
      mcp: { srv: { type: "local", command: ["from-json"], enabled: true } },
    })
    fs.writeFileSync(
      path.join(globalDir, "opencode.jsonc"),
      `{
  // jsonc wins for the same dir
  "mcp": { "srv": { "type": "local", "command": ["from-jsonc"], "enabled": true } }
}`,
    )
    const repo = path.join(xdgRoot, "proj")
    fs.mkdirSync(path.join(repo, ".git"), { recursive: true })
    const result = mergeOpencodeMcp(repo)
    assert.deepEqual((result.servers.srv as any).command, ["from-jsonc"])
  })
})

test("mergeOpencodeMcp: parses JSONC syntax from opencode.json", async () => {
  await withIsolatedEnv(async (xdgRoot) => {
    const globalDir = path.join(xdgRoot, "opencode")
    fs.mkdirSync(globalDir, { recursive: true })
    fs.writeFileSync(
      path.join(globalDir, "opencode.json"),
      `{
  // OpenCode accepts JSONC regardless of the config file extension.
  "mcp": {
    "srv": {
      "type": "local",
      "command": ["jsonc-server"],
      "enabled": true,
    },
  },
}`,
    )

    const repo = path.join(xdgRoot, "proj")
    fs.mkdirSync(path.join(repo, ".git"), { recursive: true })
    const result = mergeOpencodeMcp(repo)
    assert.deepEqual((result.servers.srv as any).command, ["jsonc-server"])
  })
})

test("mergeOpencodeMcp: cwd-most project file beats parent project file", async () => {
  await withIsolatedEnv(async (xdgRoot) => {
    const repo = path.join(xdgRoot, "repo")
    fs.mkdirSync(path.join(repo, ".git"), { recursive: true })
    writeJson(path.join(repo, "opencode.json"), {
      mcp: { srv: { type: "local", command: ["parent"], enabled: true } },
    })
    const cwd = path.join(repo, "deep")
    fs.mkdirSync(cwd, { recursive: true })
    writeJson(path.join(cwd, "opencode.json"), {
      mcp: { srv: { command: ["cwd"] } },
    })
    const result = mergeOpencodeMcp(cwd)
    assert.deepEqual((result.servers.srv as any).command, ["cwd"])
  })
})

test("mergeOpencodeMcp: returns empty when no MCP block present", async () => {
  await withIsolatedEnv(async (xdgRoot) => {
    const repo = path.join(xdgRoot, "proj")
    fs.mkdirSync(path.join(repo, ".git"), { recursive: true })
    const result = mergeOpencodeMcp(repo)
    assert.deepEqual(result.enabledServerNames, [])
  })
})

test("runtime overlay: connected status enables disk-disabled server", async () => {
  await withIsolatedEnv(async (xdgRoot) => {
    const globalDir = path.join(xdgRoot, "opencode")
    writeJson(path.join(globalDir, "opencode.json"), {
      mcp: {
        linear: {
          type: "remote",
          url: "https://mcp.linear.app/mcp",
          enabled: false,
        },
      },
    })
    const repo = path.join(xdgRoot, "proj")
    fs.mkdirSync(path.join(repo, ".git"), { recursive: true })

    assert.deepEqual(mergeOpencodeMcp(repo).enabledServerNames, [])

    const result = mergeOpencodeMcp(repo, { linear: "connected" })
    assert.deepEqual(result.enabledServerNames, ["linear"])
    assert.equal((result.servers.linear as any).url, "https://mcp.linear.app/mcp")
  })
})

test("runtime overlay: non-connected status disables disk-enabled server", async () => {
  await withIsolatedEnv(async (xdgRoot) => {
    const globalDir = path.join(xdgRoot, "opencode")
    writeJson(path.join(globalDir, "opencode.json"), {
      mcp: {
        gh: { type: "local", command: ["gh-mcp"], enabled: true },
        linear: {
          type: "remote",
          url: "https://mcp.linear.app/mcp",
          enabled: true,
        },
      },
    })
    const repo = path.join(xdgRoot, "proj")
    fs.mkdirSync(path.join(repo, ".git"), { recursive: true })

    const result = mergeOpencodeMcp(repo, {
      gh: "disabled",
      linear: "failed",
    })
    assert.deepEqual(result.enabledServerNames, [])
  })
})

test("runtime overlay: hash differs between snapshots to drive eviction", async () => {
  await withIsolatedEnv(async (xdgRoot) => {
    const globalDir = path.join(xdgRoot, "opencode")
    writeJson(path.join(globalDir, "opencode.json"), {
      mcp: {
        linear: {
          type: "remote",
          url: "https://mcp.linear.app/mcp",
          enabled: false,
        },
        gh: { type: "local", command: ["gh-mcp"], enabled: true },
      },
    })
    const repo = path.join(xdgRoot, "proj")
    fs.mkdirSync(path.join(repo, ".git"), { recursive: true })

    const off = mergeOpencodeMcp(repo, { gh: "connected" })
    const on = mergeOpencodeMcp(repo, {
      gh: "connected",
      linear: "connected",
    })
    assert.notEqual(off.hash, on.hash)
  })
})

test("runtime overlay: missing entry leaves disk value untouched", async () => {
  await withIsolatedEnv(async (xdgRoot) => {
    const globalDir = path.join(xdgRoot, "opencode")
    writeJson(path.join(globalDir, "opencode.json"), {
      mcp: { gh: { type: "local", command: ["gh-mcp"], enabled: true } },
    })
    const repo = path.join(xdgRoot, "proj")
    fs.mkdirSync(path.join(repo, ".git"), { recursive: true })

    const result = mergeOpencodeMcp(repo, { other: "connected" })
    assert.deepEqual(result.enabledServerNames, ["gh"])
    assert.deepEqual((result.servers.gh as any).command, ["gh-mcp"])
  })
})
