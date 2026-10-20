// Picks at most one skill for a subagent brief with Jev, following TypeSafe's skill-suggestion
// recipe (docs.typesafe.ai/cookbooks/skill_suggestion.md): rank every skill and gate on whether the
// request needs one at all, then rerank the top three on an excerpt of each body.
import type { Skill } from "../skill"
import { systemOne, type Answer } from "./jevClient"

type Env = Record<string, string | undefined>

const REQUEST_CHARS = 4_000
const SHORTLIST = 3
const EXCERPT_CHARS = 700
const GATE_AT = 0.3
const FITS_AT = 0.3
const NO_SKILL = "<skill_relevance>No skill looks relevant to this task.</skill_relevance>"

export type SkillHint = { text: string; skill?: string; gate: number; fits?: number }

/** `undefined` when there are too few described skills to choose between. */
export async function skillHint(
  task: string,
  skills: readonly Skill.Info[],
  signal?: AbortSignal,
  env?: Env,
): Promise<SkillHint | undefined> {
  const described = skills.filter((skill) => skill.description)
  if (described.length < 2) return undefined
  const state = { request: task.slice(0, REQUEST_CHARS) }

  const wide = await systemOne(
    {
      state,
      questions: {
        skill: {
          type: "choice",
          instructions: "Which skill's documented procedure would most help an agent carry out `request`?",
          criteria: Object.fromEntries(described.map((skill) => [skill.name, skill.description!])),
        },
        acts: {
          type: "noul",
          instructions: "Does `request` ask the assistant to act on the user's files, accounts, devices, or services?",
        },
        procedure: {
          type: "noul",
          instructions: "Would a careful expert handle `request` by following a documented procedure?",
        },
        prose: {
          type: "noul",
          instructions: "Could a generalist answer `request` fully in prose, without tools or a documented procedure?",
        },
      },
    },
    signal,
    env,
  )
  const ranked = choice(wide.answers.skill)
  const gate = (noul(wide.answers.acts) + noul(wide.answers.procedure) + 1 - noul(wide.answers.prose)) / 3
  if (gate < GATE_AT) return { text: NO_SKILL, gate }

  const shortlist = Object.entries(ranked.probabilities)
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, SHORTLIST)
    .flatMap(([name]) => described.filter((skill) => skill.name === name))
  if (shortlist.length === 0) throw new Error("Jev ranked no known skill.")
  const excerpt = (skill: Skill.Info) => `${skill.description}\n\n${skill.content.trim().slice(0, EXCERPT_CHARS)}`

  const narrow = await systemOne(
    {
      state,
      questions: {
        pick: {
          type: "choice",
          instructions: "Which of these skills best fits what `request` asks for?",
          criteria: Object.fromEntries(shortlist.map((skill) => [skill.name, excerpt(skill)])),
        },
        ...Object.fromEntries(
          shortlist.map((skill, index) => [
            `fits_${index}`,
            {
              type: "noul" as const,
              instructions: `Does this skill do the specific thing \`request\` asks for? Skill "${skill.name}": ${excerpt(skill)}`,
            },
          ]),
        ),
      },
    },
    signal,
    env,
  )
  const fits = Math.max(...shortlist.map((_, index) => noul(narrow.answers[`fits_${index}`])))
  const pick = choice(narrow.answers.pick).choice
  if (fits < FITS_AT || !shortlist.some((skill) => skill.name === pick)) return { text: NO_SKILL, gate, fits }
  return {
    text: `<skill_relevance>Skill "${pick}" looks relevant to this task. Load it with the skill tool first if it fits; ignore this hint otherwise.</skill_relevance>`,
    skill: pick,
    gate,
    fits,
  }
}

function choice(answer: Answer | undefined) {
  if (answer?.type !== "choice") throw new Error("Jev returned no choice answer.")
  return answer
}

function noul(answer: Answer | undefined) {
  if (answer?.type !== "noul" || typeof answer.noul !== "number") throw new Error("Jev returned no noul answer.")
  return answer.noul
}
