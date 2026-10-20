import { afterAll, describe, expect, test } from "bun:test"
import type { Skill } from "../../src/skill"
import { skillHint } from "../../src/tool/skillHint"

// A local stand-in for api.typesafe.ai: each test queues the replies it wants and reads back what was sent.
const replies: (() => Response)[] = []
type Sent = { questions: Record<string, { type: string; criteria?: Record<string, string> }> }
const received: Sent[] = []
const server = Bun.serve({
  port: 0,
  async fetch(request) {
    received.push((await request.json()) as Sent)
    return replies.shift()?.() ?? new Response("no reply queued", { status: 500 })
  },
})
afterAll(() => server.stop(true))

const env = { TYPESAFE_API_KEY: "ts_test", TYPESAFE_BASE_URL: `http://localhost:${server.port}` }
const reply = (answers: Record<string, unknown>) => () => Response.json({ model: "jev-test", answers })
const noul = (value: number) => ({ type: "noul", noul: value })
const skill = (name: string, description?: string): Skill.Info => ({
  name,
  description,
  location: `C:/skills/${name}/SKILL.md`,
  content: `# ${name}\n${"x".repeat(1_000)}`,
})
const skills = [
  skill("effect", "Effect v4 code"),
  skill("theme", "UI colors"),
  skill("verify", "Prove a fix"),
  skill("trace"),
]
const wide = (gate: number) =>
  reply({
    skill: {
      type: "choice",
      choice: "effect",
      probabilities: { effect: 0.6, theme: 0.1, verify: 0.3 },
      confidence: 0.8,
    },
    acts: noul(gate),
    procedure: noul(gate),
    prose: noul(1 - gate),
  })

describe("skillHint", () => {
  test("fewer than two described skills send nothing", async () => {
    const before = received.length
    expect(await skillHint("task", [skill("effect", "Effect v4 code"), skill("trace")], undefined, env)).toBeUndefined()
    expect(received.length).toBe(before)
  })

  test("a request that needs no skill stops after the first call", async () => {
    replies.push(wide(0.1))
    const before = received.length
    const hint = await skillHint("Explain what a monad is", skills, undefined, env)
    expect(received.length - before).toBe(1)
    expect(Object.keys(received.at(-1)!.questions.skill.criteria ?? {})).toEqual(["effect", "theme", "verify"])
    expect(hint?.skill).toBeUndefined()
    expect(hint?.text).toContain("No skill")
  })

  test("the rerank sees the top three with excerpts and names its winner", async () => {
    replies.push(wide(0.9))
    replies.push(
      reply({
        pick: { type: "choice", choice: "effect", probabilities: { effect: 0.9 }, confidence: 0.9 },
        fits_0: noul(0.8),
        fits_1: noul(0.2),
        fits_2: noul(0.1),
      }),
    )
    const hint = await skillHint("Port the layer to Effect v4", skills, undefined, env)
    const criteria = received.at(-1)!.questions.pick.criteria ?? {}
    expect(Object.keys(criteria)).toEqual(["effect", "verify", "theme"])
    expect(criteria.effect.length).toBe("Effect v4 code\n\n".length + 700)
    expect(hint).toMatchObject({ skill: "effect", text: expect.stringContaining('Skill "effect"') })
  })

  test("a shortlist that does not fit gives no skill", async () => {
    replies.push(wide(0.9))
    replies.push(
      reply({
        pick: { type: "choice", choice: "effect", probabilities: { effect: 0.5 }, confidence: 0.4 },
        fits_0: noul(0.2),
        fits_1: noul(0.1),
        fits_2: noul(0.1),
      }),
    )
    const hint = await skillHint("Rename a variable", skills, undefined, env)
    expect(hint?.skill).toBeUndefined()
    expect(hint?.text).toContain("No skill")
  })

  test("an abort ends a long retry-after wait at once", async () => {
    replies.push(() => new Response("{}", { status: 429, headers: { "retry-after": "30" } }))
    const started = Date.now()
    await expect(skillHint("task", skills, AbortSignal.timeout(200), env)).rejects.toThrow()
    expect(Date.now() - started).toBeLessThan(2_000)
  })
})
