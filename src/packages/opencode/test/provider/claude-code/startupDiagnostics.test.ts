// @ts-nocheck
// WIP: ported from opencode-claude-code-plugin, which never typechecked its tests; type them as Phase 3 rewrites land.
import assert from "node:assert/strict"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { test } from "node:test"
import { claudeCodeProviders } from "@/provider/claude-code/index.js"
import { resolveSpawnCwdFrom } from "@/provider/claude-code/runtimeStatus.js"
import {
  accountSettingsDrift,
  collectStartupDiagnostics,
  describeSpawnCwd,
  detectOpencodeVersion,
  pickOpencodeVersion,
  resetOpencodeVersionProbe,
} from "@/provider/claude-code/startupDiagnostics.js"

test("describeSpawnCwd reports which branch resolveSpawnCwd would take", () => {
  assert.deepEqual(describeSpawnCwd("/pinned", "/live", "/captured"), {
    resolved: "/pinned",
    source: "configured",
  })
  assert.deepEqual(describeSpawnCwd(undefined, "/live/dir", "/captured"), {
    resolved: "/live/dir",
    source: "process",
  })
  // The macOS GUI-launch fingerprint from issue #4: process.cwd() is "/".
  assert.deepEqual(describeSpawnCwd(undefined, "/", "/captured/dir"), {
    resolved: "/captured/dir",
    source: "captured",
  })
  assert.deepEqual(describeSpawnCwd(undefined, "/", undefined), {
    resolved: "/",
    source: "unresolved",
  })
})

test("describeSpawnCwd never disagrees with resolveSpawnCwd", () => {
  const cases: Array<[string | undefined, string, string | undefined]> = [
    ["/pinned", "/live", "/captured"],
    [undefined, "/live/dir", "/captured"],
    [undefined, "/", "/captured/dir"],
    [undefined, "/", undefined],
  ]
  for (const [configured, live, captured] of cases) {
    assert.equal(describeSpawnCwd(configured, live, captured).resolved, resolveSpawnCwdFrom(configured, live, captured))
  }
})

test("pickOpencodeVersion probes known shapes and degrades to undefined", () => {
  assert.equal(pickOpencodeVersion({ app: { version: "1.17.0" } }), "1.17.0")
  assert.equal(pickOpencodeVersion({ version: "1.17.0" }), "1.17.0")
  assert.equal(pickOpencodeVersion({ app: {} }), undefined)
  assert.equal(pickOpencodeVersion({ app: { version: "" } }), undefined)
  assert.equal(pickOpencodeVersion(undefined), undefined)
  assert.equal(pickOpencodeVersion("nope"), undefined)
})

test("claudeCodeProviders keeps only this plugin's provider", () => {
  const providers = claudeCodeProviders({
    "claude-code": { options: { cliPath: "claude" } },
    // Legacy per-account expansions no longer exist; a stray one is not ours.
    "claude-code-work": { options: { cliPath: "claude" } },
    anthropic: { options: { cliPath: "not-ours" } },
    "github-copilot": {},
  })
  assert.deepEqual(Object.keys(providers).sort(), ["claude-code"])
})

test("collectStartupDiagnostics summarizes pooled accounts", () => {
  const diagnostics = collectStartupDiagnostics(
    {
      "claude-code": {
        options: {
          accounts: ["default", "~/.claudeSecond"],
          cliPath: "/tmp/claude",
          cwd: "/pinned/dir",
          proxyTools: ["Bash", "Task"],
        },
      },
    },
    "1.17.0",
  )

  assert.equal(diagnostics.opencode, "1.17.0")
  assert.equal(diagnostics.claudeCliPath, "/tmp/claude")
  assert.deepEqual(diagnostics.accounts, ["default", "~/.claudeSecond"])
  assert.deepEqual(diagnostics.proxyTools, ["Bash", "Task"])
  assert.deepEqual(diagnostics.cwd, {
    resolved: "/pinned/dir",
    source: "configured",
  })
  assert.deepEqual(diagnostics.providers, ["claude-code"])
  assert.ok(Array.isArray(diagnostics.mcpServers))
})

test("collectStartupDiagnostics reports permissionPreset per provider", () => {
  const diagnostics = collectStartupDiagnostics({
    "claude-code-work": {
      options: { account: "work", permissionPreset: "read-only" },
    },
    "claude-code-personal": { options: { account: "personal" } },
  })

  // Per provider, not first-wins: one account restricted and one not is a
  // configuration a single value would report wrongly.
  assert.deepEqual(
    diagnostics.permissionPresets.map((row) => [row.provider, row.preset, row.applied]),
    [
      ["claude-code-work", "read-only", true],
      ["claude-code-personal", "none", false],
    ],
  )
})

test("collectStartupDiagnostics carries the options a preset replaced", () => {
  const [row] = collectStartupDiagnostics({
    "claude-code": {
      options: {
        permissionPreset: "read-only",
        permissionMode: "acceptEdits",
        skipPermissions: true,
      },
    },
  }).permissionPresets

  assert.equal(row.applied, true)
  // The same facts applyPermissionPreset logs at NOTICE, one line per option.
  const joined = row.overrides.join("\n")
  assert.match(joined, /permissionMode: "acceptEdits" is dropped/)
  assert.match(joined, /skipPermissions: forced to false/)
  // No proxyTools of its own, so the default list is what got filtered.
  assert.match(joined, /proxyTools: dropped Task, run_after_turn, schedule;/)
})

test("accountSettingsDrift names unpinned keys and CLAUDE.md copies that differ", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oc-drift-"))
  try {
    const [first, second] = ["a", "b"].map((name) => path.join(root, name))
    for (const [dir, compact, memory] of [
      [first, false, "# Rules\r\nbe brief"],
      [second, true, "# Rules\nbe brief"],
    ] as const) {
      fs.mkdirSync(dir)
      fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ autoCompactEnabled: compact, theme: dir }))
      fs.writeFileSync(path.join(dir, "CLAUDE.md"), memory)
    }
    // Line endings alone are not drift; display keys like `theme` are ignored.
    assert.deepEqual(accountSettingsDrift([first, second], undefined), [
      `autoCompactEnabled: ${first}=false, ${second}=true`,
    ])
    assert.deepEqual(accountSettingsDrift([first, second], { autoCompactEnabled: true }), [])
    fs.writeFileSync(path.join(second, "CLAUDE.md"), "# Other rules")
    assert.deepEqual(accountSettingsDrift([first, second], { autoCompactEnabled: true }), [
      "CLAUDE.md differs between accounts",
    ])
    // An `@` import of the shared file counts as the same file.
    fs.writeFileSync(path.join(second, "CLAUDE.md"), "@~/.claude/CLAUDE.md\n")
    assert.deepEqual(accountSettingsDrift([first, second], { autoCompactEnabled: true }), [])
    assert.deepEqual(accountSettingsDrift([first], undefined), [])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("collectStartupDiagnostics calls out an unrecognised preset", () => {
  const [row] = collectStartupDiagnostics({
    "claude-code": { options: { permissionPreset: "readonly" } },
  }).permissionPresets

  // A typo'd safety option runs at full permissions, so it must never read as
  // if it took effect.
  assert.equal(row.preset, "readonly")
  assert.equal(row.applied, false)
  assert.deepEqual(row.overrides, [])
})

test("collectStartupDiagnostics falls back when options are absent", () => {
  const diagnostics = collectStartupDiagnostics({ "claude-code": {} })

  assert.equal(diagnostics.claudeCliPath, "claude")
  assert.deepEqual(diagnostics.accounts, [])
  assert.deepEqual(diagnostics.proxyTools, [])
  assert.deepEqual(diagnostics.permissionPresets, [
    { provider: "claude-code", preset: "none", applied: false, overrides: [] },
  ])
  assert.equal(diagnostics.cwd.source, "process")
  // No opencode version handed in and none in the env -> explicit "unknown",
  // never a fabricated number.
  if (!process.env.OPENCODE_VERSION) {
    assert.equal(diagnostics.opencode, "unknown")
  }
})

test(
  "detectOpencodeVersion reads the version from the opencode binary",
  {
    skip: process.platform === "win32" && "sh fixture; Mac/Linux only",
  },
  async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-version-probe-"))
    const fake = path.join(dir, "opencode")
    fs.writeFileSync(fake, '#!/bin/sh\necho "1.18.5"\n')
    fs.chmodSync(fake, 0o755)
    try {
      resetOpencodeVersionProbe()
      assert.equal(await detectOpencodeVersion(fake), "1.18.5")
      // Cached: a second call with a different path reuses the first probe.
      assert.equal(await detectOpencodeVersion("/nonexistent/opencode"), "1.18.5")
    } finally {
      resetOpencodeVersionProbe()
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
    }
  },
)

test("detectOpencodeVersion refuses to report a non-opencode execPath", async () => {
  try {
    // Running from source means execPath is Bun; reporting Bun's version as
    // opencode's would be actively misleading, so the probe declines.
    resetOpencodeVersionProbe()
    assert.equal(await detectOpencodeVersion("/opt/homebrew/bin/bun"), undefined)
  } finally {
    resetOpencodeVersionProbe()
  }
})

test("detectOpencodeVersion returns undefined when the binary fails", async () => {
  try {
    resetOpencodeVersionProbe()
    assert.equal(await detectOpencodeVersion("/nonexistent/dir/opencode"), undefined)
  } finally {
    resetOpencodeVersionProbe()
  }
})
