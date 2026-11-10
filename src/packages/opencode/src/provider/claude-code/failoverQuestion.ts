import { apiAccountId, poolAccountLabel, type FailoverCandidate } from "./accounts.js"

export const FAILOVER_STOP_LABEL = "Stop"
export const API_ROLLOVER_LABEL = "Use API credits"

/**
 * oc `question` input asking which account a usage-limited turn continues on: the candidates best
 * first (the first recommended), then Stop. `pick` maps a chosen label back to its account id.
 * A lone API-credit candidate is asked as consent to spend instead.
 */
export function failoverQuestion(fromLabel: string, choices: FailoverCandidate[]) {
  const stop = { label: FAILOVER_STOP_LABEL, description: "End this turn; auto-resume wakes it after the reset if on" }
  const api = choices.length === 1 && choices[0]!.id === apiAccountId() ? choices[0]!.id : undefined
  if (api) {
    return {
      input: {
        questions: [
          {
            header: "Claude limit",
            question: `${fromLabel} hit its usage limit and every Claude account is limited. Continue on API credits?`,
            options: [
              {
                label: API_ROLLOVER_LABEL,
                description: "Bills the linked Console org; this chat returns once a Claude account resets",
              },
              stop,
            ],
          },
        ],
      },
      pick: (label: string) => (label === API_ROLLOVER_LABEL ? api : undefined),
    }
  }
  const ids = new Map<string, string>()
  const options = choices.map((choice, index) => {
    const label = `${poolAccountLabel(choice.id)}${index === 0 ? " (Recommended)" : ""}`
    ids.set(label, choice.id)
    const used = choice.used === undefined ? "usage unknown" : `5h used ${Math.round(choice.used)}%`
    return { label, description: used }
  })
  options.push(stop)
  return {
    input: {
      questions: [
        {
          header: "Claude limit",
          question: `${fromLabel} hit its usage limit. Continue this turn on:`,
          options,
        },
      ],
    },
    pick: (label: string) => ids.get(label),
  }
}
