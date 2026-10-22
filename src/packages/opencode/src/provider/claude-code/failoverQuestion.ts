import { poolAccountLabel, type FailoverCandidate } from "./accounts.js"

export const FAILOVER_STOP_LABEL = "Stop"

/**
 * oc `question` input asking which account a usage-limited turn continues on: the candidates best
 * first (the first recommended), then Stop. `pick` maps a chosen label back to its account id.
 */
export function failoverQuestion(fromLabel: string, choices: FailoverCandidate[]) {
  const ids = new Map<string, string>()
  const options = choices.map((choice, index) => {
    const label = `${poolAccountLabel(choice.id)}${index === 0 ? " (Recommended)" : ""}`
    ids.set(label, choice.id)
    const used = choice.used === undefined ? "usage unknown" : `5h used ${Math.round(choice.used)}%`
    return { label, description: used }
  })
  options.push({
    label: FAILOVER_STOP_LABEL,
    description: "End this turn; auto-resume wakes it after the reset if on",
  })
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
