import { InstallationDisplayVersion, InstallationVersion } from "@opencode-ai/core/installation/version"
import { Locale } from "./locale"

// Same oc version as the sidebar footer; InstallationVersion is the incorporated upstream release.
export function reviveVersions() {
  return `oc v${InstallationDisplayVersion.split("-")[0]} . OpenCode v${InstallationVersion}`
}

export function reviveText(at: number, versions: string) {
  const time = Locale.time(at)
  return `[oc revived at ${time} . ${versions}]`
}

// Divider over a revive mark; `next` lists the chain steps sent after the revive (reviveChain.tsx).
export function reviveDivider(metadata: Record<string, unknown> | undefined) {
  const next = labels(metadata?.next)
  const time = Locale.time(Number(metadata?.at))
  return ` Revived . ${time} . ${metadata?.versions}${next?.length ? ` . next ${next.join(", ")}` : ""} `
}

// Under each chain step's message: "step 1 of 3 . next /revive, /agent-push". Chain notes written
// before this line existed carry no progress and show nothing.
export function chainLine(metadata: Record<string, unknown> | undefined) {
  if (metadata?.kind !== "chain") return
  const step = metadata.step
  const total = metadata.total
  const done = labels(metadata.done)
  const later = labels(metadata.later)
  if (typeof step !== "number" || typeof total !== "number" || !done || !later) return
  if (later.length) return `step ${step} of ${total} . next ${later.join(", ")}`
  return `step ${step} of ${total}${done.length ? ` . after ${done.join(", ")}` : ""}`
}

function labels(value: unknown) {
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value as string[]
}
