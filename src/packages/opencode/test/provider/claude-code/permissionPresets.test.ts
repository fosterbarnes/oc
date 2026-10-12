// @ts-nocheck
// WIP: ported from opencode-claude-code-plugin, which never typechecked its tests; type them as Phase 3 rewrites land.
import assert from "node:assert/strict"
import { test } from "node:test"
import {
  READ_ONLY_DENIED_PROXY_TOOLS,
  READ_ONLY_DISALLOWED_CLI_TOOLS,
  isReadOnlyPermissionMode,
  isUnknownPreset,
  resolvePermissionPreset,
  type ResolvedPermissionPreset,
} from "@/provider/claude-code/permissionPresets.js"
import {
  cliSupportsPermissionPrompts,
  cliSupportsRestricted,
  type CliVersion,
} from "@/provider/claude-code/cliVersion.js"
import { buildCliArgs } from "@/provider/claude-code/cliArgs.js"
import { applyPermissionPreset, createClaudeCode } from "@/provider/claude-code/index.js"
import { configureLogger, _resetLoggerForTests } from "@/provider/claude-code/logger.js"
import { READ_ONLY_PERMISSION_MODE } from "@/provider/claude-code/types.js"

const DEFAULTS = ["Task", "run_after_turn"]

function version(raw: string): CliVersion {
  const [major, minor, patch] = raw.split(".").map(Number)
  return { major: major!, minor: minor!, patch: patch!, raw }
}

function readOnly(settings: Parameters<typeof resolvePermissionPreset>[0] = {}): ResolvedPermissionPreset {
  const resolved = resolvePermissionPreset({ ...settings, permissionPreset: "read-only" }, DEFAULTS)
  assert.ok(resolved && !isUnknownPreset(resolved), "read-only must resolve")
  return resolved
}

function captureLogs(fn: () => void): string[] {
  const lines: string[] = []
  const original = console.error
  console.error = (line: unknown) => {
    lines.push(String(line))
  }
  try {
    _resetLoggerForTests()
    configureLogger({ mode: "debug", level: "debug" })
    fn()
  } finally {
    console.error = original
    _resetLoggerForTests()
  }
  return lines
}

// ---------------------------------------------------------------------------
// Opt-in: no preset must change nothing at all
// ---------------------------------------------------------------------------

test("no permissionPreset resolves to null, so nothing is overridden", () => {
  assert.equal(resolvePermissionPreset({}, DEFAULTS), null)
  assert.equal(resolvePermissionPreset({ skipPermissions: true, proxyTools: ["Bash"] }, DEFAULTS), null)
})

test("createClaudeCode without a preset leaves every permission setting alone", () => {
  const model: any = createClaudeCode({
    proxyTools: ["Bash", "Task"],
    permissionMode: "plan",
    extraDisallowedTools: ["WebSearch"],
  })("claude-sonnet-5")

  assert.equal(model.config.permissionPreset, undefined)
  assert.equal(model.config.permissionMode, "plan")
  assert.equal(model.config.skipPermissions, true)
  assert.deepEqual(model.config.proxyTools, ["Bash", "Task"])
  assert.deepEqual(model.config.extraDisallowedTools, ["WebSearch"])
})

// ---------------------------------------------------------------------------
// What read-only resolves to
// ---------------------------------------------------------------------------

test("read-only forbids bypass, because the CLI refuses to start with both", () => {
  const resolved = readOnly({ skipPermissions: true })

  assert.equal(resolved.skipPermissions, false)
  assert.equal(resolved.permissionMode, READ_ONLY_PERMISSION_MODE)
  assert.ok(
    resolved.overridden.some((line) => line.startsWith("skipPermissions:")),
    "forcing skipPermissions off must be reported, not silent",
  )
})

test("read-only drops the opencode subagent tools from the proxy", () => {
  const resolved = readOnly()

  assert.deepEqual(resolved.proxyTools, [])
  for (const name of ["task", "task_batch", "run_after_turn"]) {
    assert.ok(READ_ONLY_DENIED_PROXY_TOOLS.has(name), `${name} must be denied on the proxy`)
  }
})

test("read-only keeps a proxy tool that changes nothing", () => {
  const resolved = readOnly({ proxyTools: ["Question", "Task"] })

  assert.deepEqual(resolved.proxyTools, ["Question"])
  assert.ok(
    resolved.overridden.some((line) => line.includes("dropped Task")),
    `dropped names must be named: ${resolved.overridden.join(" | ")}`,
  )
})

test("read-only matches proxy tool names case-insensitively", () => {
  assert.deepEqual(readOnly({ proxyTools: ["task", "TASK_BATCH", "RUN_AFTER_TURN"] }).proxyTools, [])
})

test("read-only disallows the mutating CLI built-ins and keeps the reads", () => {
  const resolved = readOnly()

  for (const name of ["Bash", "PowerShell", "Write", "Edit", "NotebookEdit", "REPL", "JavaScript", "WebFetch"]) {
    assert.ok(resolved.extraDisallowedTools.includes(name), `${name} must be disallowed`)
  }
  for (const name of ["Read", "Grep", "Glob", "WebSearch"]) {
    assert.equal(resolved.extraDisallowedTools.includes(name), false, `${name} reads and must stay available`)
  }
})

test("read-only keeps the operator's own extraDisallowedTools", () => {
  const resolved = readOnly({ extraDisallowedTools: ["WebSearch", "Bash"] })

  assert.ok(resolved.extraDisallowedTools.includes("WebSearch"))
  assert.equal(
    resolved.extraDisallowedTools.filter((name) => name === "Bash").length,
    1,
    "a name in both lists must not be duplicated onto the CLI",
  )
  assert.deepEqual(resolved.extraDisallowedTools.slice(0, READ_ONLY_DISALLOWED_CLI_TOOLS.length), [
    ...READ_ONLY_DISALLOWED_CLI_TOOLS,
  ])
})

test("read-only replaces a configured permissionMode and says so", () => {
  const resolved = readOnly({ permissionMode: "bypassPermissions" })

  assert.equal(resolved.permissionMode, READ_ONLY_PERMISSION_MODE)
  assert.ok(resolved.overridden.some((line) => line.includes("bypassPermissions")))
})

test("an unrecognised preset is refused rather than approximated", () => {
  const resolved = resolvePermissionPreset({ permissionPreset: "readonly" as any }, DEFAULTS)

  assert.ok(isUnknownPreset(resolved))
  assert.equal((resolved as { unknown: string }).unknown, "readonly")
})

test("applyPermissionPreset warns and applies nothing for an unknown name", () => {
  let result: unknown
  const lines = captureLogs(() => {
    result = applyPermissionPreset({ permissionPreset: "readonly" as any }, DEFAULTS)
  })

  assert.equal(result, null)
  assert.ok(lines.some((line) => /WARN/.test(line) && /unknown permissionPreset/.test(line)))
})

test("applyPermissionPreset reports each override it made", () => {
  const lines = captureLogs(() => {
    applyPermissionPreset({ permissionPreset: "read-only", skipPermissions: true }, DEFAULTS)
  })

  assert.ok(lines.some((line) => /permission preset "read-only" applied/.test(line)))
  assert.ok(lines.some((line) => /overrode skipPermissions/.test(line)))
})

// ---------------------------------------------------------------------------
// The spawn: which flags a read-only turn actually gets
// ---------------------------------------------------------------------------

test("read-only spawns --restricted instead of --permission-mode", () => {
  const args = buildCliArgs({
    sessionKey: "ro",
    skipPermissions: false,
    includeSessionId: false,
    cliVersion: version("2.1.280"),
    permissionMode: READ_ONLY_PERMISSION_MODE,
  })

  assert.ok(args.includes("--restricted"))
  assert.equal(args.includes("--permission-mode"), false)
  assert.equal(args.includes(READ_ONLY_PERMISSION_MODE), false)
  assert.deepEqual(args.slice(args.indexOf("--permission-prompts"), args.indexOf("--permission-prompts") + 2), [
    "--permission-prompts",
    "none",
  ])
})

test("read-only never passes --dangerously-skip-permissions", () => {
  // Measured on 2.1.280: the two together are a startup error, not an
  // override, so a spawn carrying both would not run at all.
  const args = buildCliArgs({
    sessionKey: "ro-skip",
    skipPermissions: true,
    includeSessionId: false,
    cliVersion: version("2.1.280"),
    permissionMode: READ_ONLY_PERMISSION_MODE,
  })

  assert.equal(args.includes("--dangerously-skip-permissions"), false)
})

test("a CLI without --permission-prompts gets --restricted and one WARN", () => {
  let args: string[] = []
  const lines = captureLogs(() => {
    args = buildCliArgs({
      sessionKey: "ro-258",
      skipPermissions: false,
      includeSessionId: false,
      cliVersion: version("2.1.258"),
      permissionMode: READ_ONLY_PERMISSION_MODE,
    })
  })

  assert.ok(args.includes("--restricted"))
  assert.equal(args.includes("--permission-prompts"), false)
  const warnings = lines.filter((line) => /WARN/.test(line))
  assert.equal(warnings.length, 1, warnings.join(" | "))
  assert.match(warnings[0]!, /--permission-prompts/)
  assert.match(warnings[0]!, /can_use_tool/)
})

test("a CLI with neither flag degrades to the plugin's own denial, loudly", () => {
  let args: string[] = []
  const lines = captureLogs(() => {
    args = buildCliArgs({
      sessionKey: "ro-old",
      skipPermissions: true,
      includeSessionId: false,
      cliVersion: version("2.1.200"),
      permissionMode: READ_ONLY_PERMISSION_MODE,
    })
  })

  assert.equal(args.includes("--restricted"), false)
  assert.equal(args.includes("--permission-prompts"), false)
  assert.equal(args.includes("--dangerously-skip-permissions"), false)
  assert.equal(lines.filter((line) => /WARN/.test(line)).length, 2)
})

test("an undetected CLI version skips both new flags", () => {
  const args =
    captureLogs(() => {}) &&
    buildCliArgs({
      sessionKey: "ro-unknown",
      skipPermissions: false,
      includeSessionId: false,
      cliVersion: null,
      permissionMode: READ_ONLY_PERMISSION_MODE,
    })

  assert.equal(args.includes("--restricted"), false)
  assert.equal(args.includes("--permission-prompts"), false)
})

test("every other permission mode is untouched by the read-only branch", () => {
  for (const mode of ["acceptEdits", "auto", "default", "dontAsk"]) {
    const args = buildCliArgs({
      sessionKey: `mode-${mode}`,
      skipPermissions: true,
      includeSessionId: false,
      cliVersion: version("2.1.280"),
      permissionMode: mode,
    })

    const at = args.indexOf("--permission-mode")
    assert.deepEqual(args.slice(at, at + 2), ["--permission-mode", mode])
    assert.equal(args.includes("--restricted"), false)
    assert.equal(args.includes("--dangerously-skip-permissions"), true)
  }
})

test("isReadOnlyPermissionMode only matches the preset's own token", () => {
  assert.equal(isReadOnlyPermissionMode(READ_ONLY_PERMISSION_MODE), true)
  assert.equal(isReadOnlyPermissionMode("plan"), false)
  assert.equal(isReadOnlyPermissionMode(undefined), false)
})

// ---------------------------------------------------------------------------
// Version gates, at the versions they were measured at
// ---------------------------------------------------------------------------

test("cliSupportsRestricted is gated at the oldest binary it was seen in", () => {
  assert.equal(cliSupportsRestricted(version("2.1.258")), true)
  assert.equal(cliSupportsRestricted(version("2.1.280")), true)
  assert.equal(cliSupportsRestricted(version("2.1.257")), false)
  assert.equal(cliSupportsRestricted(version("3.0.0")), true)
  assert.equal(cliSupportsRestricted(null), false)
})

test("cliSupportsPermissionPrompts brackets 2.1.258 (absent) and 2.1.263 (present)", () => {
  assert.equal(cliSupportsPermissionPrompts(version("2.1.258")), false)
  assert.equal(cliSupportsPermissionPrompts(version("2.1.263")), true)
  assert.equal(cliSupportsPermissionPrompts(version("2.1.280")), true)
  assert.equal(cliSupportsPermissionPrompts(null), false)
})

// ---------------------------------------------------------------------------
// The whole way through, as opencode builds it
// ---------------------------------------------------------------------------

test("createClaudeCode applies the preset to the language model's config", () => {
  const model: any = createClaudeCode({
    permissionPreset: "read-only",
    skipPermissions: true,
    permissionMode: "acceptEdits",
  })("claude-sonnet-5")

  assert.equal(model.config.permissionPreset, "read-only")
  assert.equal(model.config.permissionMode, READ_ONLY_PERMISSION_MODE)
  assert.equal(model.config.skipPermissions, false)
  assert.deepEqual(model.config.proxyTools, [])
  assert.deepEqual(model.config.extraDisallowedTools, [...READ_ONLY_DISALLOWED_CLI_TOOLS])
})
