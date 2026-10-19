// The jev_* tools: Jev, TypeSafe's System One classifier, as native oc tools. Request shaping and
// decision policy are ported from jev-code (github.com/FrancoisChastel/jev-code @ 051b492, MIT).
import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { systemOne, type Question, type SystemOneReply, type Text } from "./jevClient"

type Env = Record<string, string | undefined>
type Run<P> = (params: P, signal?: AbortSignal, env?: Env) => Promise<{ title: string; result: unknown }>

const MAX_ITEMS = 64
const MAX_CLASSES = 250
const MAX_CHECKS = 64
const MAX_CANDIDATES = 250
const MAX_LEVELS = 20
const ITEM_CHARS = 4_000
const REQUEST_CHARS = 120_000
const ID_CHARS = 64

const probability = (description: string) =>
  Schema.optional(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))).annotate({ description })
const Key = Schema.String.check(Schema.isLengthBetween(1, 100))
const Item = Schema.Struct({
  id: Schema.String.check(Schema.isLengthBetween(1, 200)).annotate({
    description: "Your identifier for this entry, echoed back verbatim (file path, issue number, line id).",
  }),
  text: Schema.String.check(Schema.isMinLength(1)).annotate({
    description: `The entry's text. Truncated at ${ITEM_CHARS} characters with a marker.`,
  }),
})
const Items = Schema.Array(Item)
  .check(Schema.isLengthBetween(1, MAX_ITEMS))
  .annotate({ description: `Entries to judge, up to ${MAX_ITEMS} per call. Split larger sets into batches.` })
const Evidence = Schema.Union([
  Schema.String,
  Schema.Record(Schema.String, Schema.Unknown),
  Schema.Array(Schema.Unknown),
])
const Context = Schema.optional(Evidence).annotate({
  description:
    "Optional shared context every entry is judged against: the user's request, a policy, a taxonomy note. Plain text or a JSON object. Raw evidence, not your conclusion.",
})

export const ClassifyParameters = Schema.Struct({
  items: Items,
  classes: Schema.Record(Key, Schema.NullOr(Schema.String))
    .check(Schema.isPropertiesLengthBetween(2, MAX_CLASSES))
    .annotate({
      description: `Label to description. Descriptions carry the decision: say what belongs, what does not, and how the class differs from its neighbours. Include a catch-all such as "other" when an item might fit nothing. 2 to ${MAX_CLASSES} classes.`,
    }),
  instructions: Schema.optional(Schema.String).annotate({
    description:
      'What the classification is about, e.g. "Route each GitHub issue to the team that owns it". Applies to every item.',
  }),
  context: Context,
  auto_accept: probability("Top probability at or above which a label is auto-accepted. Default 0.85."),
  min_margin: probability("Minimum gap between the winner and the runner-up for auto-acceptance. Default 0.5."),
})

export const CheckParameters = Schema.Struct({
  state: Evidence.annotate({
    description:
      "The evidence to judge: a diff, a log, a message, a page, or a JSON object with named parts. Reference named parts in questions with backticks, e.g. `diff`. Pass observed evidence, not your conclusion.",
  }),
  checks: Schema.Record(
    Key,
    Schema.Union([
      Schema.String.check(Schema.isMinLength(1)).annotate({
        description: "The yes/no question, phrased so that a high probability means yes.",
      }),
      Schema.Struct({
        question: Schema.String.check(Schema.isMinLength(1)).annotate({
          description: "The yes/no question or statement to evaluate.",
        }),
        yes: Schema.optional(Schema.String).annotate({ description: "What a yes means, when the boundary is subtle." }),
        no: Schema.optional(Schema.String).annotate({ description: "What a no means, when the boundary is subtle." }),
      }),
    ]),
  )
    .check(Schema.isPropertiesLengthBetween(1, MAX_CHECKS))
    .annotate({
      description: `Check id to yes/no question. Ids are for you and are not sent to the model, so put the whole question in the text. Up to ${MAX_CHECKS} checks; they run in parallel.`,
    }),
  yes_at: probability("Probability at or above which the verdict is yes. Default 0.75."),
  no_at: probability("Probability at or below which the verdict is no. Default 0.25."),
})

export const ScoreParameters = Schema.Struct({
  items: Items,
  levels: Schema.Array(Schema.String.check(Schema.isMinLength(1)))
    .check(Schema.isLengthBetween(2, MAX_LEVELS))
    .annotate({
      description:
        'Ordered level descriptions, lowest first, each describing a concrete situation. E.g. ["Cosmetic: no user impact", "Minor: workaround exists", "Major: core flow broken", "Critical: data loss or outage"].',
    }),
  instructions: Schema.String.check(Schema.isMinLength(1)).annotate({
    description: 'The dimension being rated, e.g. "How severe is this bug report for end users?"',
  }),
  context: Context,
  auto_accept: probability("Confidence at or above which a score is auto-accepted. Default 0.7."),
})

export const RankParameters = Schema.Struct({
  query: Schema.String.check(Schema.isMinLength(1)).annotate({
    description:
      'What you are looking for, in plain language, e.g. "where is the retry policy for outbound HTTP calls configured?"',
  }),
  candidates: Schema.Array(Item)
    .check(Schema.isLengthBetween(1, MAX_CANDIDATES))
    .annotate({
      description: `Candidates to rank, up to ${MAX_CANDIDATES}. Use file paths or symbol names as ids and an excerpt as text.`,
    }),
  top_k: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))).annotate({
    description: "Return only the best k candidates. Default: all, sorted.",
  }),
  relevant_at: probability("Relevance probability at or above which a candidate is marked relevant. Default 0.5."),
  context: Context,
})

export const AskParameters = Schema.Struct({
  state: Evidence.annotate({ description: "Content to judge: plain text, or a JSON object/array with named fields." }),
  questions: Schema.Record(
    Key,
    Schema.Struct({
      type: Schema.Literals(["noul", "choice", "score"]).annotate({
        description:
          "noul: probability a yes/no condition holds. choice: one option from the criteria map. score: position on ordered criteria levels.",
      }),
      instructions: Schema.Unknown.annotate({
        description:
          "The judgment to make, complete on its own: the id is not sent to the model. A string, or an object/array for definitions and examples.",
      }),
      criteria: Schema.optional(Schema.Unknown).annotate({
        description:
          'choice (required): map of option to description or null. score (required): ordered array of at least 2 level descriptions. noul (optional): {"true": ..., "false": ...}.',
      }),
    }),
  )
    .check(Schema.isMinProperties(1))
    .annotate({ description: "Question id to question. Answers come back under the same ids." }),
  model: Schema.optional(Schema.String).annotate({ description: "Model override. Default: jev-latest." }),
})

export const runClassify: Run<Schema.Schema.Type<typeof ClassifyParameters>> = async (params, signal, env) => {
  const autoAccept = params.auto_accept ?? 0.85
  const minMargin = params.min_margin ?? 0.5
  const items = prepareItems(params.items, "item")
  const purpose = params.instructions?.trim()
  const reply = await call(
    {
      state: buildState({ context: params.context, items: itemsState(items) }),
      questions: Object.fromEntries(
        items.map((item): [string, Question] => [
          item.key,
          {
            type: "choice",
            instructions: `${purpose ? `${purpose} ` : ""}Which class best describes \`items.${item.key}\`? Judge it on its own; other items are unrelated.`,
            criteria: params.classes,
          },
        ]),
      ),
    },
    signal,
    env,
  )
  const results = items.map((item) => {
    const answer = reply.answers[item.key]
    if (answer?.type !== "choice" || typeof answer.choice !== "string")
      return { id: item.id, label: null, decision: "review", status: "invalid_response", ...truncated(item) }
    const margin = marginOf(answer.probabilities)
    const top = answer.probabilities[answer.choice] ?? Math.max(0, ...Object.values(answer.probabilities))
    return {
      id: item.id,
      label: answer.choice,
      probability: round(top),
      margin: round(margin),
      confidence: round(answer.confidence),
      decision: top >= autoAccept && margin >= minMargin ? "auto" : "review",
      probabilities: roundAll(answer.probabilities),
      ...truncated(item),
    }
  })
  const auto = results.filter((result) => result.decision === "auto").length
  return {
    title: `${results.length} items, ${auto} auto`,
    result: {
      summary: {
        items: results.length,
        auto,
        review: results.length - auto,
        by_label: countBy(results.flatMap((result) => (result.label === null ? [] : [result.label]))),
      },
      results,
      thresholds: { auto_accept: autoAccept, min_margin: minMargin },
      ...replyMeta(reply),
    },
  }
}

export const runCheck: Run<Schema.Schema.Type<typeof CheckParameters>> = async (params, signal, env) => {
  const yesAt = params.yes_at ?? 0.75
  const noAt = params.no_at ?? 0.25
  if (noAt > yesAt) throw new Error(`no_at (${noAt}) must be at or below yes_at (${yesAt}).`)
  const checks = Object.entries(params.checks).map(([id, check]) => ({
    id,
    ...(typeof check === "string" ? { question: check, yes: undefined, no: undefined } : check),
  }))
  const reply = await call(
    {
      state: params.state,
      questions: Object.fromEntries(
        checks.map((check): [string, Question] => [
          check.id,
          {
            type: "noul",
            instructions: check.question,
            ...(check.yes !== undefined || check.no !== undefined
              ? {
                  criteria: {
                    ...(check.yes !== undefined ? { true: check.yes } : {}),
                    ...(check.no !== undefined ? { false: check.no } : {}),
                  },
                }
              : {}),
          },
        ]),
      ),
    },
    signal,
    env,
  )
  const results = checks.map((check) => {
    const answer = reply.answers[check.id]
    if (answer?.type !== "noul" || typeof answer.noul !== "number")
      return { id: check.id, question: check.question, verdict: "uncertain", status: "invalid_response" }
    const verdict = answer.noul >= yesAt ? "yes" : answer.noul <= noAt ? "no" : "uncertain"
    return { id: check.id, question: check.question, probability: round(answer.noul), verdict }
  })
  const verdicts = countBy(results.map((result) => result.verdict))
  return {
    title: `${verdicts.yes ?? 0} yes, ${verdicts.no ?? 0} no, ${verdicts.uncertain ?? 0} uncertain`,
    result: {
      summary: {
        checks: results.length,
        yes: verdicts.yes ?? 0,
        no: verdicts.no ?? 0,
        uncertain: verdicts.uncertain ?? 0,
      },
      results,
      thresholds: { yes_at: yesAt, no_at: noAt },
      ...replyMeta(reply),
    },
  }
}

export const runScore: Run<Schema.Schema.Type<typeof ScoreParameters>> = async (params, signal, env) => {
  const autoAccept = params.auto_accept ?? 0.7
  const items = prepareItems(params.items, "item")
  const reply = await call(
    {
      state: buildState({ context: params.context, items: itemsState(items) }),
      questions: Object.fromEntries(
        items.map((item): [string, Question] => [
          item.key,
          {
            type: "score",
            instructions: `${params.instructions.trim()} Rate \`items.${item.key}\` on its own; other items are unrelated.`,
            criteria: [...params.levels],
          },
        ]),
      ),
    },
    signal,
    env,
  )
  const results = items.map((item) => {
    const answer = reply.answers[item.key]
    if (answer?.type !== "score" || typeof answer.score !== "number")
      return { id: item.id, decision: "review", status: "invalid_response", ...truncated(item) }
    const level = Math.min(params.levels.length - 1, Math.max(0, Math.round(answer.score)))
    return {
      id: item.id,
      score: round(answer.score),
      level,
      label: params.levels[level],
      confidence: round(answer.confidence),
      decision: answer.confidence >= autoAccept ? "auto" : "review",
      ...(answer.probabilities ? { probabilities: roundAll(answer.probabilities) } : {}),
      ...truncated(item),
    }
  })
  const scores = results.flatMap((result) => ("score" in result ? [result] : []))
  const auto = results.filter((result) => result.decision === "auto").length
  return {
    title: `${results.length} items, ${auto} auto`,
    result: {
      summary: {
        items: results.length,
        auto,
        review: results.length - auto,
        mean_score: scores.length ? round(scores.reduce((sum, result) => sum + result.score, 0) / scores.length) : 0,
        by_level: countBy(scores.map((result) => String(result.level))),
      },
      legend: Object.fromEntries(params.levels.map((level, index) => [String(index), level])),
      results,
      thresholds: { auto_accept: autoAccept },
      ...replyMeta(reply),
    },
  }
}

const ANY_RELEVANT = "__any_relevant"

export const runRank: Run<Schema.Schema.Type<typeof RankParameters>> = async (params, signal, env) => {
  const relevantAt = params.relevant_at ?? 0.5
  const candidates = prepareItems(params.candidates, "candidate")
  const reply = await call(
    {
      state: buildState({ query: params.query, context: params.context, candidates: itemsState(candidates) }),
      questions: {
        ...Object.fromEntries(
          candidates.map((candidate): [string, Question] => [
            candidate.key,
            {
              type: "noul",
              instructions: `Does \`candidates.${candidate.key}\` answer or directly help with \`query\`? Judge this candidate on its own.`,
              criteria: {
                true: "The candidate contains what the query asks for, or is the place to look for it",
                false: "The candidate is about something else or only shares surface words with the query",
              },
            },
          ]),
        ),
        [ANY_RELEVANT]: {
          type: "noul",
          instructions: "Does at least one entry in `candidates` answer or directly help with `query`?",
        },
      },
    },
    signal,
    env,
  )
  const any = reply.answers[ANY_RELEVANT]
  const scored = candidates
    .map((candidate, index) => {
      const answer = reply.answers[candidate.key]
      const relevance = answer?.type === "noul" && typeof answer.noul === "number" ? answer.noul : undefined
      return { index, candidate, relevance }
    })
    .toSorted((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0) || a.index - b.index)
  const ranked = scored.slice(0, params.top_k ?? scored.length).map((entry, position) => ({
    rank: position + 1,
    id: entry.candidate.id,
    relevance: round(entry.relevance ?? 0),
    relevant: entry.relevance !== undefined && entry.relevance >= relevantAt,
    ...truncated(entry.candidate),
    ...(entry.relevance === undefined ? { status: "invalid_response" } : {}),
  }))
  const relevant = scored.filter((entry) => entry.relevance !== undefined && entry.relevance >= relevantAt).length
  return {
    title: `${relevant} of ${candidates.length} relevant`,
    result: {
      any_relevant: any?.type === "noul" && typeof any.noul === "number" ? round(any.noul) : 0,
      summary: { candidates: candidates.length, relevant, returned: ranked.length },
      ranked,
      thresholds: { relevant_at: relevantAt },
      ...replyMeta(reply),
    },
  }
}

export const runAsk: Run<Schema.Schema.Type<typeof AskParameters>> = async (params, signal, env) => {
  const reply = await call(
    {
      state: params.state,
      questions: Object.fromEntries(
        Object.entries(params.questions).map(([id, question]) => [id, askQuestion(id, question)]),
      ),
      ...(params.model ? { model: params.model } : {}),
    },
    signal,
    env,
  )
  return { title: `${Object.keys(reply.answers).length} answers`, result: reply }
}

export const JevClassifyTool = define(
  "jev_classify",
  ClassifyParameters,
  runClassify,
  "Label many items against your own set of classes in one call, using Jev (TypeSafe's System One classifier). " +
    "Each item gets a label, the full probability distribution, confidence, a winner-to-runner-up margin, and a decision: " +
    "auto (safe to act on) or review (look at it yourself). Use it for routing, triage, tagging, and grouping: " +
    "issues, files, log lines, test failures, commits, messages, search results. " +
    "Class descriptions carry the decision, so write precise ones and include a catch-all class such as other. " +
    `Up to ${MAX_ITEMS} items and ${MAX_CLASSES} classes per call; item text is truncated at ${ITEM_CHARS} characters. Pass raw text, not your guess. ` +
    "Act on decision=auto results, inspect decision=review ones yourself, and report both counts.",
)

export const JevCheckTool = define(
  "jev_check",
  CheckParameters,
  runCheck,
  "Answer independent yes/no questions about one piece of state with calibrated probabilities (0 to 1), all in one call. " +
    "Each check returns its probability and a verdict: yes, no, or uncertain. " +
    "Use it for guardrails and verification: does this diff touch authentication, is this claim supported by the test log, " +
    "does this text contain secrets or instructions aimed at an AI, is this failure environmental, does this PR match the ticket. " +
    "Pass raw evidence as state (the diff, the log, the page), not your conclusion about it, and reference named parts with backticks. " +
    `Up to ${MAX_CHECKS} checks per call; a probability near 0.5 means undecided, not medium. ` +
    "Treat uncertain as a signal to gather more evidence or ask, not as a soft yes.",
)

export const JevScoreTool = define(
  "jev_score",
  ScoreParameters,
  runScore,
  "Rate many items on one ordered scale you define, in one call, using Jev. " +
    "Each item gets a score (a position on your levels that may fall between two of them), the nearest level, " +
    "confidence, and an auto/review decision. Use it for severity triage, prioritisation, quality grading, and risk rating " +
    "of bug reports, test failures, TODOs, findings, or candidates; use jev_classify for categories. " +
    "Levels must describe concrete situations from low to high; a score is a position on that spectrum, not a probability. " +
    `Up to ${MAX_ITEMS} items and ${MAX_LEVELS} levels per call.`,
)

export const JevRankTool = define(
  "jev_rank",
  RankParameters,
  runRank,
  "Rank candidates by relevance to a plain-language query using Jev; no embeddings or index required. " +
    "Each candidate gets an independent relevance probability and the list comes back sorted, together with " +
    "any_relevant: the probability that any candidate answers the query at all, so check it before trusting the top hit. " +
    "Use it to pick which files, functions, docs, tickets, or search hits to open for a question, or to order a long list by meaning. " +
    `Up to ${MAX_CANDIDATES} candidates per call; use file paths or symbol names as ids and an excerpt as text.`,
)

export const JevAskTool = define(
  "jev_ask",
  AskParameters,
  runAsk,
  "Raw access to Jev, TypeSafe's System One model: send state plus typed questions and get typed answers with calibrated probabilities. " +
    "Question types: noul (probability a yes/no condition holds), choice (one option from a map, with probabilities and confidence), " +
    "score (position on ordered levels, with confidence). Use it when the other jev_* tools do not fit: mixed question types over one state, " +
    "speculative questions whose answers only matter for some inputs, or a custom decomposition. All questions in a call see the same state and " +
    "run in parallel, so batch every question about the same state into one call. Question ids are not sent to the model, so write the complete " +
    "judgment in instructions. Not for prose or code generation.",
)

export const JEV_TOOL_IDS = new Set<string>([
  JevClassifyTool.id,
  JevCheckTool.id,
  JevScoreTool.id,
  JevRankTool.id,
  JevAskTool.id,
])

// All five share the `jev` permission, so one rule covers them.
function define<P extends Schema.Decoder<unknown>>(
  id: string,
  parameters: P,
  run: Run<Schema.Schema.Type<P>>,
  description: string,
) {
  return Tool.define(
    id,
    Effect.succeed({
      description,
      parameters,
      execute: (params: Schema.Schema.Type<P>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({ permission: "jev", patterns: ["*"], always: ["*"], metadata: {} })
          const output = yield* Effect.promise(() => run(params, ctx.abort))
          return { title: output.title, output: JSON.stringify(output.result), metadata: {} }
        }),
    }),
  )
}

async function call(request: Parameters<typeof systemOne>[0], signal?: AbortSignal, env?: Env) {
  const size = JSON.stringify(request).length
  if (size > REQUEST_CHARS)
    throw new Error(
      `Request is ${size.toLocaleString()} characters, above the ${REQUEST_CHARS.toLocaleString()} character budget. Split the items into smaller batches or shorten the texts.`,
    )
  return systemOne(request, signal, env)
}

/**
 * Give each item a key safe for the API and dotted paths. Duplicate ids, before or after sanitising,
 * are an error rather than a silent rename, so results always map back to the caller's ids.
 */
function prepareItems(items: readonly { id: string; text: string }[], label: string) {
  const keys = new Map<string, string>()
  return items.map((item, index) => {
    const key =
      item.id
        .replace(/[^A-Za-z0-9_.-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, ID_CHARS) || `${label}_${index + 1}`
    const clash = keys.get(key)
    if (clash === item.id) throw new Error(`Duplicate ${label} id "${item.id}". Ids must be unique.`)
    if (clash !== undefined)
      throw new Error(
        `${label} ids "${clash}" and "${item.id}" collide after sanitising to "${key}". Use ids that differ in letters, digits, dots, dashes or underscores.`,
      )
    keys.set(key, item.id)
    const text = item.text.length > ITEM_CHARS ? item.text.slice(0, ITEM_CHARS) + " […truncated]" : item.text
    return { id: item.id, key, text, truncated: text !== item.text }
  })
}

function itemsState(items: ReturnType<typeof prepareItems>) {
  return Object.fromEntries(items.map((item) => [item.key, item.text]))
}

function buildState(parts: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(parts).filter((entry) => entry[1] !== undefined && entry[1] !== ""))
}

/** Reject criteria shapes the API refuses, naming the caller's question id. */
function askQuestion(id: string, question: Schema.Schema.Type<typeof AskParameters>["questions"][string]): Question {
  const instructions = question.instructions as Text
  const criteria = question.criteria
  if (instructions === undefined || instructions === null || instructions === "")
    throw new Error(`questions["${id}"].instructions is required.`)
  if (question.type === "choice") {
    if (!isPlainObject(criteria) || Object.keys(criteria).length < 2)
      throw new Error(
        `questions["${id}"].criteria: choice criteria must be an object mapping at least 2 options to a description or null.`,
      )
    return { type: "choice", instructions, criteria: criteria as Record<string, Text> }
  }
  if (question.type === "score") {
    if (!Array.isArray(criteria) || criteria.length < 2)
      throw new Error(
        `questions["${id}"].criteria: score criteria must be an array of at least 2 level descriptions ordered low to high.`,
      )
    return { type: "score", instructions, criteria: criteria as Text[] }
  }
  if (criteria !== undefined && criteria !== null && !isPlainObject(criteria))
    throw new Error(
      `questions["${id}"].criteria: noul criteria must be an object with "true" and "false" descriptions, or omitted.`,
    )
  return criteria === undefined
    ? { type: "noul", instructions }
    : { type: "noul", instructions, criteria: criteria as { true?: Text; false?: Text } | null }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function truncated(item: { truncated: boolean }) {
  return item.truncated ? { truncated: true } : {}
}

function replyMeta(reply: SystemOneReply) {
  return { model: reply.model, ...(reply.usage ? { usage: reply.usage } : {}) }
}

/** Gap between the top probability and the runner-up. A lone option has margin 0. */
function marginOf(probabilities: Record<string, number>) {
  const sorted = Object.values(probabilities).toSorted((a, b) => b - a)
  return sorted.length < 2 ? 0 : sorted[0] - sorted[1]
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>(
    (counts, value) => ({ ...counts, [value]: (counts[value] ?? 0) + 1 }),
    {},
  )
}

function roundAll(probabilities: Record<string, number>) {
  return Object.fromEntries(Object.entries(probabilities).map(([key, value]) => [key, round(value)]))
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}
