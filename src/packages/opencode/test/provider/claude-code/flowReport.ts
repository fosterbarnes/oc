import { Cause, Effect, Exit } from "effect"
import { TURN_STATS_MARKER } from "../../../src/provider/claude-code/turnStats"
import type { openChat } from "./chatFixture"

type Chat = Effect.Success<ReturnType<typeof openChat>>
export type Entry = NonNullable<Awaited<ReturnType<Chat["sdk"]["session"]["messages"]>>["data"]>[number]
const BLOCKED =
  /(?:^|\n)\s*(?:Error during compaction:\s*)?(?:Failed to authenticate\b[^\n]*|API Error: 40[13]\b[^\n]*|(?:[>▌*\s]|\*\*rate limit:\*\*)*Claude Code rejected this request:[^\n]*|You've hit your (?:session|usage|weekly) limit\b[^\n]*)/i
const EXPENSIVE_USD = 0.25

export const refusalReason = (text: string) => text.match(BLOCKED)?.[0]

type Prompt = (...args: Parameters<Chat["prompt"]>) => Effect.Effect<Effect.Success<ReturnType<Chat["prompt"]>>, Error>

class FlowBlockedError extends Error {
  override name = "FlowBlockedError"
}

export function stepRunner(report: ReturnType<typeof flowReport>) {
  // CLI cost is cumulative for the conversation, including after a server restart.
  const ledger = new Map<string, number | undefined>()
  return <E, R>(
    name: string,
    chat: Chat,
    body: (
      since: number,
      prompt: Prompt,
      accept: (entry: Entry) => Effect.Effect<void, FlowBlockedError>,
    ) => Effect.Effect<void, E, R>,
  ) =>
    Effect.gen(function* () {
      report.current = name
      const since = Date.now()
      const retained: Entry[] = []
      let blocked = false
      const accept = (entry: Entry) =>
        Effect.gen(function* () {
          retained.push(entry)
          const reason = refusalReason(texts([entry]))
          if (!reason) return
          if (!blocked) report.block(reason.trim())
          blocked = true
          return yield* Effect.fail(
            new FlowBlockedError(`run stopped at ${name}: Claude refused the request (${reason.trim()})`),
          )
        })
      const prompt: Prompt = (...args) =>
        Effect.gen(function* () {
          const result = yield* chat.prompt(...args)
          if (!result.data) return yield* Effect.fail(new Error("prompt returned no response"))
          yield* accept(result.data)
          return result
        })
      yield* Effect.gen(function* () {
        if (!ledger.has(chat.sessionID)) {
          const before = yield* ownSince(chat, 0)
          const last = before.findLast((message) => message.info.role === "assistant")
          ledger.set(chat.sessionID, last ? cliCost(last) : 0)
        }
        yield* body(since, prompt, accept)
      }).pipe(
        Effect.onExit((exit) =>
          Effect.gen(function* () {
            if (Exit.isFailure(exit) && !blocked) report.oddity(`harness failure: ${Cause.pretty(exit.cause)}`)
            const collected = yield* Effect.gen(function* () {
              return [...(yield* ownSince(chat, since)), ...(yield* childrenSince(chat, since)).flat()]
            }).pipe(Effect.exit)
            if (Exit.isFailure(collected)) {
              report.usage(undefined, (Date.now() - since) / 1000)
              report.oddity(`accounting unavailable: ${Cause.pretty(collected.cause)}`)
              if (Exit.isSuccess(exit)) return yield* Effect.fail(new Error("step accounting failed"))
              return
            }
            const all = [
              ...new Map([...retained, ...collected.value].map((message) => [message.info.id, message])).values(),
            ]
            report.usage(turnUsage(all, ledger), (Date.now() - since) / 1000)
            for (const notice of new Set(JSON.stringify(all).match(/Claude conversation \w+/g)))
              report.oddity(`notice: ${notice}`)
            for (const message of all)
              if (
                message.info.role === "assistant" &&
                message.info.error &&
                !(name.startsWith("3") && message.info.error.name === "MessageAbortedError")
              )
                report.oddity(
                  `error: ${message.info.error.name} ${JSON.stringify(message.info.error.data).slice(0, 200)}`,
                )
            if (Exit.isSuccess(exit)) {
              for (const message of all) yield* accept(message)
            }
          }),
        ),
      )
    })
}

export const ownSince = (chat: Chat, since: number) =>
  Effect.promise(() => chat.sdk.session.messages({ sessionID: chat.sessionID })).pipe(
    Effect.map((result) => {
      if (!result.data) throw new Error("messages returned no response")
      return result.data.filter((message) => message.info.time.created >= since)
    }),
  )

export const childrenSince = (chat: Chat, since: number) =>
  Effect.promise(async () => {
    const children = (await chat.sdk.session.children({ sessionID: chat.sessionID })).data
    if (!children) throw new Error("children returned no response")
    return Promise.all(
      children
        .filter((child) => child.time.created >= since)
        .map(async (child) => {
          const result = await chat.sdk.session.messages({ sessionID: child.id })
          if (!result.data) throw new Error("child messages returned no response")
          return result.data
        }),
    )
  })

export const texts = (messages: Entry[]) =>
  messages
    .filter((message) => message.info.role === "assistant")
    .flatMap((message) =>
      message.parts.flatMap((part) =>
        part.type === "text" && !part.text.trim().startsWith(TURN_STATS_MARKER) ? [part.text] : [],
      ),
    )
    .join("\n")

export const tools = (messages: Entry[]) =>
  messages.flatMap((message) => message.parts.flatMap((part) => (part.type === "tool" ? [part.tool] : [])))

// Each tool row as `name status [command or path] [-> short output or error]`: enough to tell a
// skipped, failed, or misdirected tool call apart without dumping inputs or file contents.
export const toolSummary = (messages: Entry[]) =>
  messages
    .flatMap((message) =>
      message.parts.flatMap((part) => {
        if (part.type !== "tool") return []
        const target = [part.state.input.command, part.state.input.file_path, part.state.input.path].find(
          (value) => typeof value === "string",
        )
        const result =
          part.state.status === "error" ? part.state.error : part.state.status === "completed" ? part.state.output : ""
        return [
          [
            part.tool,
            part.state.status,
            String(target ?? "").slice(0, 80),
            result.trim() && `-> ${result.trim().slice(0, 80)}`,
          ]
            .filter(Boolean)
            .join(" "),
        ]
      }),
    )
    .join("; ")

export function cliCost(message: Entry) {
  const footer = message.parts.findLast(
    (part) => part.type === "text" && part.text.trim().startsWith(TURN_STATS_MARKER),
  )
  if (footer?.type !== "text") return
  const value = footer.text
    .trim()
    .slice(TURN_STATS_MARKER.length)
    .match(/^\s+\$(\d+(?:\.\d+)?)(?=\s|$)/)?.[1]
  if (value === undefined) return
  const cost = Number(value)
  return Number.isFinite(cost) && cost >= 0 ? cost : undefined
}

export function usage(messages: Entry[], costs?: ReadonlyMap<string, number | undefined>) {
  return [...new Map(messages.map((message) => [message.info.id, message])).values()].reduce(
    (sum, message) => {
      if (message.info.role !== "assistant") return sum
      const cost = costs ? costs.get(message.info.id) : cliCost(message)
      return {
        input: sum.input + message.info.tokens.input,
        output: sum.output + message.info.tokens.output,
        cacheRead: sum.cacheRead + message.info.tokens.cache.read,
        cacheWrite: sum.cacheWrite + message.info.tokens.cache.write,
        cost: sum.cost + message.info.cost,
        cliCost: sum.cliCost + (cost ?? 0),
        cliKnown: sum.cliKnown + Number(cost !== undefined),
        cliMissing: sum.cliMissing + Number(cost === undefined),
      }
    },
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, cliCost: 0, cliKnown: 0, cliMissing: 0 },
  )
}

export function turnUsage(messages: Entry[], ledger: Map<string, number | undefined>) {
  const all = [...new Map(messages.map((message) => [message.info.id, message])).values()].sort(
    (a, b) => a.info.time.created - b.info.time.created,
  )
  const costs = new Map<string, number | undefined>()
  for (const message of all) {
    if (message.info.role !== "assistant") continue
    const total = cliCost(message)
    const previous = ledger.has(message.info.sessionID) ? ledger.get(message.info.sessionID) : 0
    // A missing observation cannot establish per-turn spend. A lower counter means a new CLI process
    // (server restart, rewound or lost conversation) whose counter started at zero for this turn.
    const delta =
      total === undefined || previous === undefined
        ? undefined
        : Number((total >= previous ? total - previous : total).toFixed(4))
    costs.set(message.info.id, delta)
    ledger.set(message.info.sessionID, total)
  }
  return usage(all, costs)
}

export function flowReport(models: { modelID: string; switchModelID: string }) {
  const checks: { step: string; check: string; ok: boolean; detail: string; blocked?: boolean }[] = []
  const usages: { step: string; seconds: number; total: ReturnType<typeof usage> | undefined }[] = []
  const oddities: string[] = []
  const cell = (text: string, max = 200) => text.replace(/\s+/g, " ").replaceAll("|", "\\|").slice(0, max)
  const report = {
    current: "setup",
    check: (check: string, ok: boolean, detail: string) => checks.push({ step: report.current, check, ok, detail }),
    oddity: (text: string) => oddities.push(`${report.current}: ${text}`),
    usage: (total: ReturnType<typeof usage> | undefined, seconds: number) => {
      usages.push({ step: report.current, seconds, total })
      if (total && total.cliCost > EXPENSIVE_USD)
        report.oddity(`expensive: known CLI spend $${total.cliCost.toFixed(4)}`)
    },
    block: (reason: string) => {
      checks.push({ step: report.current, check: "request accepted", ok: false, blocked: true, detail: reason })
      report.oddity(`run stopped: ${reason}; later steps not run`)
    },
    render: () =>
      [
        "# claudeTestFlow real-model report",
        "",
        `- Date: ${new Date().toISOString()}`,
        `- Model: ${models.modelID} (step 7 switches to ${models.switchModelID})`,
        `- Checks: ${checks.filter((row) => row.ok).length}/${checks.length} pass, ${checks.filter((row) => row.blocked).length} blocked; last step reached: ${report.current}`,
        `- CLI cost total: ${costLabel(
          {
            cliCost: usages.reduce((sum, row) => sum + (row.total?.cliCost ?? 0), 0),
            cliKnown: usages.reduce((sum, row) => sum + (row.total?.cliKnown ?? 0), 0),
            cliMissing: usages.reduce((sum, row) => sum + (row.total?.cliMissing ?? 0), 0),
          },
          usages.some((row) => !row.total),
        )}`,
        "",
        "| Step | Check | Result | Detail |",
        "| --- | --- | --- | --- |",
        ...checks.map(
          (row) =>
            `| ${row.step} | ${row.check} | ${row.ok ? "pass" : row.blocked ? "blocked" : "FAIL"} | ${cell(row.detail)} |`,
        ),
        "",
        "Tokens and oc cost are each turn's last API call (what oc stores). CLI cost is estimated",
        "spend from differences between rounded cumulative CLI footers, not subscription charges.",
        "Missing footers (/compact, failed or interrupted turns) make spend unavailable or partial.",
        "",
        "| Step | Input | Output | Cache read | Cache write | oc cost | CLI cost | Seconds |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
        ...usages.map((row) =>
          row.total
            ? `| ${row.step} | ${row.total.input} | ${row.total.output} | ${row.total.cacheRead} | ${row.total.cacheWrite} | ${row.total.cost.toFixed(4)} | ${costLabel(row.total)} | ${row.seconds.toFixed(0)} |`
            : `| ${row.step} | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | ${row.seconds.toFixed(0)} |`,
        ),
        "",
        "## Oddities",
        "",
        ...(oddities.length ? oddities.map((text) => `- ${cell(text, 600)}`) : ["- none"]),
        "",
      ].join("\n"),
    write: (file: string) => Bun.write(file, report.render()),
  }
  return report
}

function costLabel(total: { cliCost: number; cliKnown: number; cliMissing: number }, incomplete = false) {
  if (!total.cliKnown) return "unavailable"
  const partial = total.cliMissing > 0 || incomplete
  return `$${total.cliCost.toFixed(4)} (${partial ? "partial, " : ""}${total.cliKnown}/${total.cliKnown + total.cliMissing} turns${incomplete ? "; accounting unavailable" : ""})`
}
