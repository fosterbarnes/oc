import { Effect, Schedule, Stream, SubscriptionRef } from "effect"
import { ClaudeIO } from "./upstream/claude/io.js"
import { ClaudeProbe } from "./upstream/claude/probe.js"
import { ClaudeQueryOptions } from "./upstream/claude/query-options.js"
import { ClaudeSessions } from "./upstream/claude/sessions.js"
import { ClaudeStatus } from "./upstream/claude/status.js"
import { ClaudeAgentLanguageModel } from "./upstream/language-model/claude-agent-language-model.js"
import { ClaudeAgentCatalog } from "./catalog"
import { ClaudeAgentStorage } from "./storage"

// oc's replacement for upstream's V2 plugin glue (`index.ts`, `aisdk.ts`, `provider.ts`). Provider state attaches
// one runtime per instance directory; the language model runs requests through it.

// Lives outside any instance, so a provider reload adopts the running `claude` processes.
const registry = ClaudeSessions.registry()
const runtimes = new Map<string, Runtime>()

type Runtime = {
  readonly run: ClaudeAgentLanguageModel.Dependencies["run"]
  readonly idle: (sessionID: string) => Effect.Effect<void>
}

type Options = Readonly<Record<string, any>>

// Needs the instance scope: closing it hands the processes back to the registry.
export const attach = Effect.fn("ClaudeAgentRuntime.attach")(function* (input: {
  readonly directory: string
  readonly options: Options
  readonly connected: boolean
}) {
  const io = ClaudeIO.real
  const connection = connectionEnv(input.options)
  const status = yield* ClaudeStatus.make(io, () => Effect.succeed(connection))
  const sessions = yield* registry.attach({ io, status, storage: ClaudeAgentStorage, directory: input.directory })
  // Each new process reports its login and models. A changed list shows on the next provider load.
  yield* SubscriptionRef.changes(status.state).pipe(
    Stream.runForEach((state) =>
      state.type === "ready"
        ? ClaudeAgentCatalog.update(state.probe, connection.ANTHROPIC_BASE_URL ?? io.env().ANTHROPIC_BASE_URL)
        : Effect.void,
    ),
    Effect.forkScoped,
  )
  // Without a saved list there is no model to pick, so the first message that would fill it can never be sent.
  if (input.connected && (yield* ClaudeAgentCatalog.read()).models.length === 0) {
    yield* status.refresh().pipe(Effect.forkScoped)
  }
  const run = Effect.runPromiseWith(yield* Effect.context<never>())
  const runtime: Runtime = {
    run: (request, signal) => run(sessions.run(request), { signal }),
    idle: sessions.idle,
  }
  runtimes.set(input.directory, runtime)
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      if (runtimes.get(input.directory) === runtime) runtimes.delete(input.directory)
    }),
  )
  return runtime
})

// `options` are the provider's and model's config options: connection settings, headers and body.
export function model(runtime: Runtime, modelID: string, options: Options) {
  return new ClaudeAgentLanguageModel.Model(modelID, { run: runtime.run }, connectionEnv(options))
}

// oc stopped running the session, so a Claude turn still waiting for tool results starts its idle timer.
export const idle = (directory: string, sessionID: string) => runtimes.get(directory)?.idle(sessionID) ?? Effect.void

// `/connect`: waits until `claude` is installed and signed in, then saves its model list.
export const connect = Effect.fn("ClaudeAgentRuntime.connect")(function* () {
  const io = ClaudeIO.real
  const probe = yield* Effect.gen(function* () {
    const executable = io.which()
    if (!executable) return yield* Effect.fail(new Error("Claude Code is not installed"))
    const result = yield* ClaudeProbe.run(ClaudeQueryOptions.base({ executable, io }))
    if (!ClaudeProbe.isLoggedIn(result.account)) return yield* Effect.fail(new Error("Claude Code is not logged in"))
    return result
  }).pipe(Effect.retry({ schedule: Schedule.spaced("3 seconds"), times: 100 }))
  yield* ClaudeAgentCatalog.update(probe, io.env().ANTHROPIC_BASE_URL)
})

function connectionEnv(options: Options) {
  return ClaudeQueryOptions.connectionEnv({ settings: options, headers: options.headers, body: options.body })
}

export * as ClaudeAgentRuntime from "./runtime"
