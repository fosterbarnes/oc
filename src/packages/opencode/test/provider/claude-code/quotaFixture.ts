// Shared fake-Claude quota stream helpers for fakeModel and tuiPane integration checks.
import { chmod, mkdir } from "node:fs/promises"
import path from "node:path"
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2"
import type { ProviderUsage } from "@opencode-ai/schema/provider-usage"
import { Effect, Fiber } from "effect"
import type { CliFixture } from "../../lib/cli-process"
import { pollWithTimeout } from "../../lib/effect"
import { chatConfig, claudeEnv, initRepo } from "./chatFixture"

export type UsageInfo = ProviderUsage.Info

export function quotaReleasePath(root: string) {
  return path.join(root, "usage-quota-release")
}

export function quotaChatConfig(llmUrl: string, fakeCliPath: string) {
  const config = chatConfig(llmUrl)
  return {
    ...config,
    provider: {
      ...config.provider,
      "claude-code": {
        options: {
          ...config.provider["claude-code"].options,
          cliPath: fakeCliPath,
        },
      },
    },
  }
}

/** Expired dummy login prevents HTTP quota probes; readings come only from the fake CLI stream. */
export async function installQuotaFakeCli(root: string) {
  const claudeDir = path.join(root, "claude")
  await mkdir(claudeDir, { recursive: true })
  await Bun.write(
    path.join(claudeDir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: `sk-ant-oat01-${"A".repeat(96)}`,
        refreshToken: `sk-ant-ort01-${"B".repeat(96)}`,
        expiresAt: 0,
        scopes: ["user:profile", "user:inference"],
        subscriptionType: "pro",
      },
    }),
  )
  const cliPath = path.join(claudeDir, "quota-fake-claude.cjs")
  const releasePath = quotaReleasePath(root)
  const session = "quota-fake-session"
  const resetsAt = Math.floor(Date.now() / 1000) + 7200
  const source = `#!/usr/bin/env node
const fs = require("node:fs")
const readline = require("node:readline")

if (process.argv.includes("--version")) {
  process.stdout.write("2.1.280\\n")
  process.exit(0)
}

const SESSION = ${JSON.stringify(session)}
const RESET = ${resetsAt}
const RELEASE = process.env.OC_TEST_USAGE_RELEASE
const rl = readline.createInterface({ input: process.stdin })

function emit(message) {
  process.stdout.write(JSON.stringify(message) + "\\n")
}

function rateLimit(type, utilization) {
  emit({
    type: "rate_limit_event",
    session_id: SESSION,
    rate_limit_info: {
      status: "allowed",
      rateLimitType: type,
      utilization,
      resetsAt: RESET,
    },
  })
}

function finish(text) {
  emit({
    type: "assistant",
    session_id: SESSION,
    message: { role: "assistant", content: [{ type: "text", text }], stop_reason: "end_turn" },
  })
  emit({
    type: "result",
    subtype: "success",
    session_id: SESSION,
    is_error: false,
    result: text,
    duration_ms: 1,
    num_turns: 1,
    usage: { input_tokens: 1, output_tokens: 1 },
  })
}

function waitRelease(next) {
  if (!RELEASE) return next()
  const deadline = Date.now() + 120_000
  const tick = () => {
    if (fs.existsSync(RELEASE)) return next()
    if (Date.now() > deadline) process.exit(1)
    setTimeout(tick, 40)
  }
  tick()
}

let answered = false
rl.on("line", () => {
  if (answered) return
  answered = true
  emit({ type: "system", subtype: "init", session_id: SESSION, tools: ["Read"] })
  rateLimit("five_hour", 0.125)
  rateLimit("seven_day", 0.0825)
  waitRelease(() => {
    rateLimit("five_hour", 0.185)
    finish("QUOTA-DONE")
  })
})
`
  await Bun.write(cliPath, source)
  await chmod(cliPath, 0o755)
  return { cliPath, releasePath }
}

function eventPayload(event: unknown) {
  if (!event || typeof event !== "object") return undefined
  const record = event as { payload?: unknown; type?: unknown; properties?: unknown }
  if (record.payload && typeof record.payload === "object")
    return record.payload as { type: string; properties?: unknown }
  if (typeof record.type === "string") return record as { type: string; properties?: unknown }
  return undefined
}

export type GlobalEventStream = {
  readonly stream: AsyncIterator<unknown>
  readonly controller: AbortController
}

export function openGlobalEventStream(sdk: OpencodeClient) {
  return Effect.acquireRelease(
    Effect.promise(async () => {
      const controller = new AbortController()
      const opened = await sdk.global.event({ signal: controller.signal })
      return { controller, stream: opened.stream } satisfies GlobalEventStream
    }),
    ({ controller }) => Effect.sync(() => controller.abort()),
  )
}

export function readGlobalEvent(
  input: GlobalEventStream,
  timeoutMs: number,
  match: (payload: { type: string; properties?: unknown }) => boolean,
  label: string,
) {
  return Effect.tryPromise({
    try: () => readGlobalEventPromise(input, timeoutMs, match, label),
    catch: (error) => (error instanceof Error ? error : new Error(label, { cause: error })),
  })
}

async function readGlobalEventPromise(
  input: GlobalEventStream,
  timeoutMs: number,
  match: (payload: { type: string; properties?: unknown }) => boolean,
  label: string,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await new Promise<{ type: string; properties?: unknown }>((resolve, reject) => {
      timeout = setTimeout(() => {
        input.controller.abort()
        reject(new Error(label))
      }, timeoutMs)
      void (async () => {
        while (true) {
          const next = await input.stream.next()
          if (next.done) {
            reject(new Error(label))
            return
          }
          const payload = eventPayload(next.value)
          if (!payload || !match(payload)) continue
          if (timeout !== undefined) clearTimeout(timeout)
          resolve(payload)
          return
        }
      })().catch(reject)
    })
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

export function usageInfo(payload: { properties?: unknown }): UsageInfo {
  return payload.properties as UsageInfo
}

export function usageWindowPercent(info: UsageInfo, id: string) {
  return info.windows.find((window) => window.id === id)?.usedPercent
}

export function waitProviderUsageUpdated(
  events: GlobalEventStream,
  timeoutMs: number,
  match: (value: UsageInfo) => boolean,
  label: string,
) {
  return readGlobalEvent(events, timeoutMs, (payload) => {
    if (payload.type !== "provider.usage.updated") return false
    const info = usageInfo(payload)
    return match(info)
  }, label).pipe(Effect.map(usageInfo))
}

export function fetchProviderUsageSnapshot(baseUrl: string, project: string) {
  return Effect.promise(async () => {
    const response = await fetch(`${baseUrl}/provider/usage`, {
      headers: { "x-opencode-directory": encodeURIComponent(project) },
    })
    if (!response.ok) throw new Error(`GET /provider/usage failed: ${response.status}`)
    return (await response.json()) as UsageInfo[]
  })
}

export const openChatQuota = Effect.fnUntraced(function* (fixture: CliFixture) {
  const root = fixture.home
  const project = path.join(root, "work")
  yield* initRepo(project)
  const { cliPath, releasePath } = yield* Effect.promise(() => installQuotaFakeCli(root))
  const server = yield* fixture.opencode.serve({
    env: {
      ...claudeEnv(root, fixture.llm.url),
      OPENCODE_DB: path.join(fixture.home, "opencode.db"),
      OPENCODE_CONFIG_CONTENT: JSON.stringify(quotaChatConfig(fixture.llm.url, cliPath)),
      OC_TEST_USAGE_RELEASE: releasePath,
    },
  })
  const sdk = createOpencodeClient({ baseUrl: server.url, directory: project, throwOnError: true })
  const sessionID = (yield* Effect.promise(() => sdk.session.create({ title: "quotaUsage" }, { throwOnError: true }))).data
    .id
  return { project, server, sdk, sessionID, releasePath }
})

export const runQuotaStreamIntegration = Effect.fnUntraced(function* (fixture: CliFixture) {
  const chat = yield* openChatQuota(fixture)
  const events = yield* openGlobalEventStream(chat.sdk)
  yield* readGlobalEvent(events, 60_000, (payload) => payload.type === "server.connected", "server.connected never arrived")
  const model = { providerID: "claude-code", modelID: "claude-sonnet-4-5" }
  const turn = yield* Effect.promise(() =>
    chat.sdk.session.prompt(
      { sessionID: chat.sessionID, model, parts: [{ type: "text", text: "check quota mid-turn" }] },
      { throwOnError: true },
    ),
  ).pipe(Effect.forkScoped)
  const first = yield* waitProviderUsageUpdated(
    events,
    60_000,
    (info) =>
      info.providerID === "claude-code" &&
      usageWindowPercent(info, "five_hour") === 12.5 &&
      usageWindowPercent(info, "seven_day") === 8.25,
    "provider.usage.updated never carried the first streamed Claude quota windows",
  )
  const snapshot = yield* pollWithTimeout(
    fetchProviderUsageSnapshot(chat.server.url, chat.project).pipe(
      Effect.map((body) => body.some((info) => info.providerID === "claude-code" &&
        usageWindowPercent(info, "five_hour") === 12.5 && usageWindowPercent(info, "seven_day") === 8.25)
        ? body : undefined),
    ),
    "GET /provider/usage never reflected the streamed hourly quota",
    "30 seconds",
  )
  yield* Effect.promise(() => Bun.write(chat.releasePath, "go"))
  yield* waitProviderUsageUpdated(
    events,
    60_000,
    (info) => usageWindowPercent(info, "five_hour") === 18.5,
    "provider.usage.updated never advanced the hourly window before the turn finished",
  )
  yield* Fiber.join(turn)
  return { chat, first, snapshot }
})

export const QUOTA_MENU_HOURLY_UPDATED = "5-hour: 18.5% used, 81.5% remaining"
