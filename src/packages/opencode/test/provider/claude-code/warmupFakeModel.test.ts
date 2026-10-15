/**
 * Claude warm-up sender against the real installed CLI and TestLLMServer's
 * Anthropic endpoint: no login, no real tokens (dummy API key is present), no real subscription usage.
 * Production sender env stays sanitized; the fake server address reaches the
 * CLI only through sendWarmup's test-only extraEnv injection at this test
 * boundary. Skipped when no `claude` CLI is installed.
 */
import { describe, expect } from "bun:test"
import { mkdir, readdir } from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { hostEnv } from "../../lib/cli-process"
import { testEffect } from "../../lib/effect"
import { reply, TestLLMServer } from "../../lib/llm-server"
import { expectIsolated, outsideProfile } from "./chatFixture"
import { SEND_TIMEOUT_MS, sendWarmup } from "@/provider/claude-code/warmup"
import {
  _setCliRunner,
  buildWarmupArgs,
  defaultCliRunner,
  killOwnedChildren,
  WARMUP_PROMPT,
  WARMUP_SYSTEM_PROMPT,
  type CliRunOpts,
} from "@/provider/claude-code/warmup/cli"

const cliPath = process.env.CLAUDE_CLI_PATH ?? Bun.which("claude")

const it = testEffect(TestLLMServer.layer)

function messagesHit(hit: { url: URL }) {
  return hit.url.pathname.endsWith("/messages")
}

/** Text blocks from Anthropic `system` / message `content` arrays (cache_control is transport only). */
function textBlocks(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (!Array.isArray(value)) return []
  return value.flatMap((block) => {
    if (block && typeof block === "object" && "text" in block && typeof block.text === "string") return [block.text]
    return []
  })
}

const ALLOWED_REQUEST_KEYS = [
  "context_management",
  "max_tokens",
  "messages",
  "metadata",
  "model",
  "output_config",
  "stream",
  "system",
  "thinking",
  "tools",
] as const

// CLI-owned keys the warm-up cannot turn off. `safeguards` (Claude Code 2.1.300+) carries the
// server-side dangerous-tool-use classifier context and is sent only when that beta is on.
const OPTIONAL_REQUEST_KEYS = ["safeguards"] as const

/** Redacted request shape for failure logs (no device/session identifiers). */
export function normalizedWarmupRequest(body: Record<string, unknown>) {
  const messages = body.messages as { role: string; content: unknown }[]
  const systemTexts = textBlocks(body.system)
  const envTexts = textBlocks(messages[1]?.content)
  return {
    model: body.model,
    user: messages[0]?.role === "user" ? messages[0].content : undefined,
    warmupSystemLine: systemTexts[2],
    tools: body.tools,
    output_config: body.output_config,
    machinery: {
      billingHeaderPrefix: systemTexts[0]?.slice(0, "x-anthropic-billing-header:".length),
      sdkAgentLine: systemTexts[1],
      environmentHeading: envTexts[0]?.split("\n")[0],
    },
  }
}

function assertMinimalWarmupRequest(body: Record<string, unknown>) {
  expect(String(body.model ?? "")).toContain("haiku")
  const optional: readonly string[] = OPTIONAL_REQUEST_KEYS
  expect(Object.keys(body).filter((key) => !optional.includes(key)).toSorted()).toEqual(
    [...ALLOWED_REQUEST_KEYS].toSorted(),
  )
  if ("safeguards" in body) {
    const safeguards = body.safeguards as { type: unknown }[]
    expect(safeguards.map((entry) => entry.type)).toEqual(["dangerous_tool_use"])
  }
  expect(body.tools).toEqual([])
  expect(body.output_config).toEqual({ effort: "low" })

  const messages = body.messages as { role: string; content: unknown; output_config?: unknown }[]
  expect(messages).toHaveLength(2)
  expect(messages[0]).toEqual({ role: "user", content: WARMUP_PROMPT })

  expect(messages[1]!.role).toBe("system")
  const envTexts = textBlocks(messages[1]!.content)
  expect(envTexts).toHaveLength(1)
  expect(envTexts[0]!.startsWith("# Environment\n")).toBe(true)
  expect(envTexts[0]!.includes("Primary working directory:")).toBe(true)
  expect(messages[1]!.output_config).toEqual({ effort: "low" })

  const systemTexts = textBlocks(body.system)
  expect(systemTexts).toHaveLength(3)
  expect(systemTexts[0]!.startsWith("x-anthropic-billing-header:")).toBe(true)
  expect(systemTexts[1]).toBe("You are a Claude agent, built on Anthropic's Claude Agent SDK.")
  expect(systemTexts[2]).toBe(WARMUP_SYSTEM_PROMPT)

  const instructionText = [...systemTexts, ...envTexts, WARMUP_PROMPT, JSON.stringify(body.safeguards ?? [])].join(
    "\n",
  )
  expect(instructionText).not.toMatch(/WARMUP-LEAK|USER-RULE|PROJECT-RULE|Generate a title/)
}

async function jsonlFiles(dir: string): Promise<string[]> {
  const found: string[] = []
  const walk = async (current: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.name.endsWith(".jsonl")) found.push(full)
    }
  }
  await walk(dir)
  return found
}

function installRunnerCapture(recorded: CliRunOpts[]) {
  _setCliRunner(async (opts) => {
    recorded.push(opts)
    return defaultCliRunner(opts)
  })
}

function fakeEnv(llm: TestLLMServer["Service"], home: string) {
  return {
    ANTHROPIC_BASE_URL: llm.url.replace(/\/v1$/, ""),
    ANTHROPIC_API_KEY: "sk-ant-test",
    DISABLE_AUTOUPDATER: "1",
    OPENCODE_DB: path.join(home, "opencode.db"),
  }
}

function messageHits(llm: TestLLMServer["Service"]) {
  return Effect.gen(function* () {
    return (yield* llm.hits).filter(messagesHit)
  })
}

describe.skipIf(!cliPath)("Claude warm-up sender against TestLLMServer", () => {
  it.live(
    "one minimal greeting per account, rejection without retry, no transcript",
    () =>
      Effect.gen(function* () {
        const llm = yield* TestLLMServer
        const home = yield* outsideProfile
        yield* llm.reset
        const accountA = path.join(home, "claude-a")
        const accountB = path.join(home, "claude-b")
        yield* Effect.promise(() => mkdir(accountA, { recursive: true }))
        yield* Effect.promise(() => mkdir(accountB, { recursive: true }))

        const recorded: CliRunOpts[] = []
        yield* Effect.acquireRelease(Effect.sync(() => installRunnerCapture(recorded)), () =>
          Effect.sync(() => {
            _setCliRunner(null)
            killOwnedChildren()
          }),
        )

        const env = fakeEnv(llm, home)

        yield* llm.text("hi")
        const first = yield* Effect.promise(() =>
          sendWarmup({ cliPath: cliPath!, accountID: accountA, scheduledAt: Date.now(), extraEnv: env, timeoutMs: 60_000 }),
        )
        expect(first.outcome).toBe("sent")
        yield* llm.wait(1)

        yield* llm.text("hi")
        const second = yield* Effect.promise(() =>
          sendWarmup({ cliPath: cliPath!, accountID: accountB, scheduledAt: Date.now(), extraEnv: env, timeoutMs: 60_000 }),
        )
        expect(second.outcome).toBe("sent")

        expect(recorded).toHaveLength(2)
        expect(recorded[0]!.env.CLAUDE_CONFIG_DIR).toBe(accountA)
        expect(recorded[1]!.env.CLAUDE_CONFIG_DIR).toBe(accountB)
        for (const run of recorded) {
          expect(run.args).toEqual(buildWarmupArgs())
          expect(run.args).not.toContain("--bare")
          expect(run.env.CLAUDE_CODE_EFFORT_LEVEL).toBe("low")
          expect(run.env.ANTHROPIC_API_KEY).toBe("sk-ant-test")
        }

        const inputs = yield* llm.inputs
        expect(inputs).toHaveLength(2)
        for (const body of inputs) assertMinimalWarmupRequest(body as Record<string, unknown>)
        expectIsolated(inputs)

        yield* llm.pushMatch(messagesHit, reply().streamError("rate limit exceeded"))
        const rejected = yield* Effect.promise(() =>
          sendWarmup({ cliPath: cliPath!, accountID: accountA, scheduledAt: Date.now(), extraEnv: env, timeoutMs: 60_000 }),
        )
        expect(rejected.outcome).toBe("rejected")
        expect(recorded).toHaveLength(3)

        expect(yield* Effect.promise(() => jsonlFiles(accountA))).toEqual([])
        expect(yield* Effect.promise(() => jsonlFiles(accountB))).toEqual([])
        expect(yield* Effect.promise(() => Bun.file(env.OPENCODE_DB).exists())).toBe(false)
      }),
    120_000,
  )

  it.live(
    "times out on a hung fake server after the model request arrives and leaves an unrelated child running",
    () =>
      Effect.gen(function* () {
        const llm = yield* TestLLMServer
        const home = yield* outsideProfile
        yield* llm.reset
        const account = path.join(home, "claude-timeout")
        yield* Effect.promise(() => mkdir(account, { recursive: true }))

        const recorded: CliRunOpts[] = []
        yield* Effect.acquireRelease(Effect.sync(() => installRunnerCapture(recorded)), () =>
          Effect.sync(() => {
            _setCliRunner(null)
            killOwnedChildren()
          }),
        )

        const release = Promise.withResolvers<void>()
        yield* Effect.addFinalizer(() => Effect.sync(() => release.resolve()))
        yield* llm.pushMatch(messagesHit, reply().wait(release.promise).text("hi").stop())

        const decoy =
          process.platform === "win32"
            ? Bun.spawn(["ping", "-n", "120", "127.0.0.1"], { env: hostEnv(), stdout: "ignore", stderr: "ignore" })
            : Bun.spawn(["sleep", "120"], { env: hostEnv(), stdout: "ignore", stderr: "ignore" })
        yield* Effect.addFinalizer(() =>
          Effect.promise(async () => {
            decoy.kill()
            await decoy.exited
          }),
        )

        const env = fakeEnv(llm, home)
        const pending = sendWarmup({
          cliPath: cliPath!,
          accountID: account,
          scheduledAt: Date.now(),
          extraEnv: env,
          timeoutMs: SEND_TIMEOUT_MS,
        })
        yield* llm.wait(1)
        const result = yield* Effect.promise(() => pending)
        expect(result.outcome).toBe("timeout")
        expect(recorded).toHaveLength(1)
        expect(yield* messageHits(llm)).toHaveLength(1)
        expect(decoy.exitCode).toBeNull()
      }),
    120_000,
  )

  it.live(
    "aborts an in-flight warm-up after /v1/messages without a second model request",
    () =>
      Effect.gen(function* () {
        const llm = yield* TestLLMServer
        const home = yield* outsideProfile
        yield* llm.reset
        const account = path.join(home, "claude-abort")
        yield* Effect.promise(() => mkdir(account, { recursive: true }))

        const recorded: CliRunOpts[] = []
        yield* Effect.acquireRelease(Effect.sync(() => installRunnerCapture(recorded)), () =>
          Effect.sync(() => {
            _setCliRunner(null)
            killOwnedChildren()
          }),
        )

        const release = Promise.withResolvers<void>()
        yield* Effect.addFinalizer(() => Effect.sync(() => release.resolve()))
        yield* llm.pushMatch(messagesHit, reply().wait(release.promise).text("hi").stop())

        const env = fakeEnv(llm, home)
        const controller = new AbortController()
        const pending = sendWarmup({
          cliPath: cliPath!,
          accountID: account,
          scheduledAt: Date.now(),
          extraEnv: env,
          timeoutMs: 60_000,
          signal: controller.signal,
        })
        yield* llm.wait(1)
        controller.abort()
        const result = yield* Effect.promise(() => pending)
        expect(result.outcome).toBe("failed")
        expect(result.detail?.toLowerCase()).toContain("abort")
        expect(recorded).toHaveLength(1)
        expect(yield* messageHits(llm)).toHaveLength(1)
      }),
    120_000,
  )
})
