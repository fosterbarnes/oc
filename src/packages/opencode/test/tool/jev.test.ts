import { afterAll, describe, expect, test } from "bun:test"
import { Result, Schema } from "effect"
import { ToolJsonSchema } from "../../src/tool/json-schema"
import {
  AskParameters,
  CheckParameters,
  ClassifyParameters,
  RankParameters,
  ScoreParameters,
  runCheck,
  runClassify,
  runRank,
} from "../../src/tool/jev"

// A local stand-in for api.typesafe.ai: each test queues the replies it wants and reads back what was sent.
const replies: (() => Response)[] = []
type Sent = { model: string; questions: unknown; state: { items?: Record<string, string> } }
const received: { auth: string | null; body: Sent }[] = []
const server = Bun.serve({
  port: 0,
  async fetch(request) {
    received.push({ auth: request.headers.get("authorization"), body: (await request.json()) as Sent })
    return replies.shift()?.() ?? new Response("no reply queued", { status: 500 })
  },
})
afterAll(() => server.stop(true))

const env = { TYPESAFE_API_KEY: "ts_test", TYPESAFE_BASE_URL: `http://localhost:${server.port}/` }
const reply = (answers: Record<string, unknown>) => () => Response.json({ model: "jev-test", answers })
const accepts = (schema: Schema.Decoder<unknown>, input: unknown) =>
  Result.isSuccess(Schema.decodeUnknownResult(schema)(input))

describe("jev parameters", () => {
  test("every tool emits a JSON Schema with its required fields", () => {
    const required = (schema: Schema.Top) => ToolJsonSchema.fromSchema(schema).required
    expect(required(ClassifyParameters)).toEqual(["items", "classes"])
    expect(required(CheckParameters)).toEqual(["state", "checks"])
    expect(required(ScoreParameters)).toEqual(["items", "levels", "instructions"])
    expect(required(RankParameters)).toEqual(["query", "candidates"])
    expect(required(AskParameters)).toEqual(["state", "questions"])
  })

  test("classify needs at least two classes and probabilities within 0..1", () => {
    const items = [{ id: "#12", text: "Login button does nothing on Safari" }]
    expect(accepts(ClassifyParameters, { items, classes: { bug: "Broken behavior", other: null } })).toBe(true)
    expect(accepts(ClassifyParameters, { items, classes: { bug: "Broken behavior" } })).toBe(false)
    expect(accepts(ClassifyParameters, { items, classes: { bug: null, other: null }, auto_accept: 1.5 })).toBe(false)
  })

  test("check accepts plain questions and question objects", () => {
    expect(
      accepts(CheckParameters, {
        state: { diff: "- if (!user) return\n+ return" },
        checks: {
          auth: "Does `diff` change authentication?",
          tests: { question: "Does `diff` add tests?", no: "Only code" },
        },
      }),
    ).toBe(true)
    expect(accepts(CheckParameters, { state: "x", checks: {} })).toBe(false)
  })
})

describe("jev requests", () => {
  test("check sends noul questions with the key and maps probabilities to verdicts", async () => {
    replies.push(reply({ auth: { type: "noul", noul: 0.91 }, tests: { type: "noul", noul: 0.5 } }))
    const output = await runCheck(
      {
        state: { diff: "- if (!user) return\n+ return" },
        checks: {
          auth: "Does `diff` change authentication?",
          tests: { question: "Does `diff` add tests?", no: "Only code" },
        },
      },
      undefined,
      env,
    )
    const sent = received.at(-1)!
    expect(sent.auth).toBe("Bearer ts_test")
    expect(sent.body.model).toBe("jev-latest")
    expect(sent.body.questions).toEqual({
      auth: { type: "noul", instructions: "Does `diff` change authentication?" },
      tests: { type: "noul", instructions: "Does `diff` add tests?", criteria: { false: "Only code" } },
    })
    expect(output.result).toMatchObject({
      summary: { checks: 2, yes: 1, no: 0, uncertain: 1 },
      results: [
        { id: "auth", probability: 0.91, verdict: "yes" },
        { id: "tests", probability: 0.5, verdict: "uncertain" },
      ],
    })
  })

  test("classify keys items safely and auto-accepts only a clear winner", async () => {
    replies.push(
      reply({
        "src_auth.ts": { type: "choice", choice: "auth", probabilities: { auth: 0.95, other: 0.05 }, confidence: 0.9 },
        "src_ui.tsx": { type: "choice", choice: "other", probabilities: { auth: 0.45, other: 0.55 }, confidence: 0.2 },
      }),
    )
    const output = await runClassify(
      {
        items: [
          { id: "src/auth.ts", text: "export function login() {}" },
          { id: "src/ui.tsx", text: "export function Button() {}" },
        ],
        classes: { auth: "Authentication code", other: null },
      },
      undefined,
      env,
    )
    expect(Object.keys(received.at(-1)!.body.state.items ?? {})).toEqual(["src_auth.ts", "src_ui.tsx"])
    expect(output.result).toMatchObject({
      summary: { items: 2, auto: 1, review: 1, by_label: { auth: 1, other: 1 } },
      results: [
        { id: "src/auth.ts", label: "auth", decision: "auto" },
        { id: "src/ui.tsx", label: "other", decision: "review" },
      ],
    })
  })

  test("rank sorts by relevance and retries a rate-limited call", async () => {
    replies.push(() => new Response("{}", { status: 429, headers: { "retry-after-ms": "0" } }))
    replies.push(
      reply({
        a: { type: "noul", noul: 0.2 },
        b: { type: "noul", noul: 0.8 },
        __any_relevant: { type: "noul", noul: 0.9 },
      }),
    )
    const before = received.length
    const output = await runRank(
      {
        query: "where is retry configured?",
        candidates: [
          { id: "a", text: "ui" },
          { id: "b", text: "retry policy" },
        ],
      },
      undefined,
      env,
    )
    expect(received.length - before).toBe(2)
    expect(output.result).toMatchObject({
      any_relevant: 0.9,
      ranked: [
        { rank: 1, id: "b", relevant: true },
        { rank: 2, id: "a", relevant: false },
      ],
    })
  })

  test("duplicate ids and a missing key fail before any request", async () => {
    const before = received.length
    const items = [
      { id: "x", text: "one" },
      { id: "x", text: "two" },
    ]
    await expect(runClassify({ items, classes: { a: null, b: null } }, undefined, env)).rejects.toThrow(
      "Duplicate item id",
    )
    await expect(
      runCheck({ state: "x", checks: { q: "Is it?" } }, undefined, { TYPESAFE_BASE_URL: env.TYPESAFE_BASE_URL }),
    ).rejects.toThrow("TYPESAFE_API_KEY is not set")
    expect(received.length).toBe(before)
  })
})
