// @ts-nocheck
// WIP: ported from opencode-claude-code-plugin, which never typechecked its tests; type them as Phase 3 rewrites land.
import assert from "node:assert/strict"
import { test } from "node:test"
import { claudeSpawnEnv, cliEffortLevel } from "@/provider/claude-code/spawnEnv.js"
import { CLI_HYGIENE_ENV_VARS, cliHygieneEnv } from "@/provider/claude-code/cliVersion.js"

/** Every hygiene var absent, which is the ordinary case for a user shell. */
const noHygieneVars = Object.fromEntries(CLI_HYGIENE_ENV_VARS.map((name) => [name, undefined])) as Record<
  string,
  string | undefined
>

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const previous: Record<string, string | undefined> = {}
  for (const key of Object.keys(vars)) {
    previous[key] = process.env[key]
    if (vars[key] === undefined) delete process.env[key]
    else process.env[key] = vars[key]
  }
  try {
    return fn()
  } finally {
    for (const key of Object.keys(vars)) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
}

test("claudeSpawnEnv passes ANTHROPIC_API_KEY through by default", () => {
  withEnv({ ANTHROPIC_API_KEY: "sk-test", ANTHROPIC_AUTH_TOKEN: "tok-test" }, () => {
    const env = claudeSpawnEnv()
    assert.equal(env.ANTHROPIC_API_KEY, "sk-test")
    assert.equal(env.ANTHROPIC_AUTH_TOKEN, "tok-test")
  })
})

test("claudeSpawnEnv strips API key/token when ignoreAnthropicApiKey is true", () => {
  withEnv({ ANTHROPIC_API_KEY: "sk-test", ANTHROPIC_AUTH_TOKEN: "tok-test" }, () => {
    const env = claudeSpawnEnv({ ignoreAnthropicApiKey: true })
    assert.equal("ANTHROPIC_API_KEY" in env, false)
    assert.equal("ANTHROPIC_AUTH_TOKEN" in env, false)
  })
})

test("claudeSpawnEnv with ignore flag leaves other env vars intact", () => {
  withEnv({ ANTHROPIC_API_KEY: "sk-test", PATH: process.env.PATH }, () => {
    const env = claudeSpawnEnv({ ignoreAnthropicApiKey: true })
    assert.equal("ANTHROPIC_API_KEY" in env, false)
    assert.equal(env.PATH, process.env.PATH)
    assert.equal(env.TERM, "xterm-256color")
  })
})

test("claudeSpawnEnv exports a requested effort as CLAUDE_CODE_EFFORT_LEVEL", () => {
  withEnv({ CLAUDE_CODE_EFFORT_LEVEL: undefined }, () => {
    assert.equal(claudeSpawnEnv({ effort: "xhigh" }).CLAUDE_CODE_EFFORT_LEVEL, "xhigh")
    assert.equal(claudeSpawnEnv({ effort: "max" }).CLAUDE_CODE_EFFORT_LEVEL, "max")
    assert.equal("CLAUDE_CODE_EFFORT_LEVEL" in claudeSpawnEnv(), false)
  })
})

test("claudeSpawnEnv maps the provider's minimal onto the CLI's low", () => {
  withEnv({ CLAUDE_CODE_EFFORT_LEVEL: undefined }, () => {
    assert.equal(cliEffortLevel("minimal"), "low")
    assert.equal(claudeSpawnEnv({ effort: "minimal" }).CLAUDE_CODE_EFFORT_LEVEL, "low")
  })
})

test("a requested effort wins over a shell-level CLAUDE_CODE_EFFORT_LEVEL", () => {
  withEnv({ CLAUDE_CODE_EFFORT_LEVEL: "low" }, () => {
    assert.equal(claudeSpawnEnv({ effort: "max" }).CLAUDE_CODE_EFFORT_LEVEL, "max")
    // No request-level effort: the shell value passes through untouched.
    assert.equal(claudeSpawnEnv().CLAUDE_CODE_EFFORT_LEVEL, "low")
  })
})

// CLI hygiene: stop the CLI autoupdating out from under the version
// `detectCliVersion` cached, which several flag gates are keyed on.

test("claudeSpawnEnv disables the autoupdater but keeps non-essential traffic", () => {
  withEnv({ ...noHygieneVars, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: undefined }, () => {
    const env = claudeSpawnEnv()
    assert.equal(env.DISABLE_AUTOUPDATER, "1")
    // Setting it drops Monitor, PushNotification and claude.ai connectors.
    assert.equal(env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, undefined)
  })
})

test("claudeSpawnEnv never overrides a hygiene var the user set", () => {
  withEnv({ DISABLE_AUTOUPDATER: "0" }, () => {
    // "0" is how the CLI is told to keep autoupdating; we must not stomp it.
    assert.equal(claudeSpawnEnv().DISABLE_AUTOUPDATER, "0")
  })
})

test("cliHygieneEnv fills only the vars missing from the inherited env", () => {
  assert.deepEqual(cliHygieneEnv({}), { DISABLE_AUTOUPDATER: "1" })
  assert.deepEqual(cliHygieneEnv({ DISABLE_AUTOUPDATER: "0" }), {})
})

test("claudeSpawnEnv enables the PowerShell tool on Windows unless the shell set it", () => {
  withEnv({ CLAUDE_CODE_USE_POWERSHELL_TOOL: undefined }, () => {
    const env = claudeSpawnEnv()
    assert.equal(env.CLAUDE_CODE_USE_POWERSHELL_TOOL, process.platform === "win32" ? "1" : undefined)
  })
  withEnv({ CLAUDE_CODE_USE_POWERSHELL_TOOL: "0" }, () => {
    assert.equal(claudeSpawnEnv().CLAUDE_CODE_USE_POWERSHELL_TOOL, "0")
  })
})
