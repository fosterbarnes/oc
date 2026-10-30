import { readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { nextRenewal, parseUsageDate, startOfDay, type UsageCalendarEvent, type UsageSubscription } from "./calendar"
import { claudeAccountName, claudeConfigDirId } from "./claude"
import type { CursorUsage } from "./cursor"
import { readAuthContent, type UsageOptions } from "./fetch"
import { USAGE_BILLING_URLS, USAGE_PLAN_NAMES, type UsagePlanProvider, type UsageProviderId } from "./providers"
import type { UsageSnapshot } from "./snapshot"

const DAY_MS = 86_400_000

/** Plan facts read from disk, epoch ms. `claude` is keyed by config dir id. Dates are projected later. */
export type UsagePlanFacts = {
  codex?: { plan?: string; start?: number; until?: number }
  claude: Record<string, { plan?: string; created?: number }>
}

export type UsagePlan = {
  provider: UsagePlanProvider
  /** Claude config dir id. */
  account?: string
  /** Pooled Claude account name, such as `claude2`. */
  name?: string
  plan?: string
  atMs?: number
  verb: "renews" | "ends" | "ended"
  /** `login`: ChatGPT login dates; `estimate`: projected from the subscription start; `meter`: Cursor cycle end. */
  source?: "login" | "estimate" | "meter" | "manual"
  url: string
}

export async function readUsagePlanFacts(claudeDirs: string[], options: UsageOptions = {}): Promise<UsagePlanFacts> {
  const homeDir = options.homeDir ?? os.homedir()
  const env = options.env ?? process.env
  const [codex, claude] = await Promise.all([
    readAuthContent(options)
      .then((raw) => codexFacts((JSON.parse(raw) as { openai?: unknown }).openai))
      .catch(() => undefined),
    Promise.all(claudeDirs.map(async (dir) => [dir, await claudeFacts(claudeProfilePath(dir, homeDir, env))] as const)),
  ])
  return { codex, claude: Object.fromEntries(claude) }
}

/** One plan per enabled paid provider (per Claude account), with manual subscription dates overriding. */
export function resolveUsagePlans(
  input: {
    providers: UsageProviderId[]
    claudeAccounts: string[]
    /** oc.json `claudeAccountNames`. */
    claudeNames?: Record<string, string>
    facts: UsagePlanFacts
    cursor: UsageSnapshot<CursorUsage>
    subscriptions: UsageSubscription[]
  },
  nowMs: number,
): UsagePlan[] {
  const resolve = (
    provider: UsagePlanProvider,
    auto: Pick<UsagePlan, "atMs" | "source"> | undefined,
    extra: Pick<UsagePlan, "account" | "name" | "plan"> = {},
  ): UsagePlan => {
    const base = { provider, ...extra, url: USAGE_BILLING_URLS[provider] }
    const entry = input.subscriptions.find((item) => item.provider === provider && item.account === extra.account)
    if (!entry) return { ...base, verb: "renews", ...auto }
    if ("renewDay" in entry)
      return { ...base, atMs: nextRenewal(entry.renewDay, nowMs), verb: "renews", source: "manual" }
    const atMs = parseUsageDate(entry.endsOn) as number
    return { ...base, atMs, verb: atMs + DAY_MS <= nowMs ? "ended" : "ends", source: "manual" }
  }
  const codex = input.facts.codex
  const cursor = input.cursor.ok ? input.cursor.monthly.resetMs : null
  return [
    ...(input.providers.includes("openai")
      ? [resolve("openai", codexRenewal(codex, nowMs), { plan: codex?.plan })]
      : []),
    ...(input.providers.includes("claude-code")
      ? input.claudeAccounts.map((account) => {
          const facts = input.facts.claude[account]
          return resolve(
            "claude-code",
            facts?.created
              ? { atMs: nextRenewal(new Date(facts.created).getDate(), nowMs), source: "estimate" }
              : undefined,
            {
              account,
              plan: facts?.plan,
              ...(input.claudeAccounts.length > 1 ? { name: claudeAccountName(account, input.claudeNames) } : {}),
            },
          )
        })
      : []),
    ...(input.providers.includes("cursor")
      ? [resolve("cursor", cursor === null ? undefined : { atMs: cursor, source: "meter" })]
      : []),
  ]
}

/** `Codex Plus`, `Claude Pro (claude2)`: provider, plan, and pooled account name. */
export function usagePlanLabel(plan: UsagePlan) {
  return [USAGE_PLAN_NAMES[plan.provider], plan.plan && capitalize(plan.plan), plan.name && `(${plan.name})`]
    .filter(Boolean)
    .join(" ")
}

/** Sidebar text such as `Pro renews ~11/14 (18d)`; `~` marks an estimate. Urgent at 3 days or less, or ended. */
export function usagePlanLine(plan: UsagePlan, nowMs: number) {
  if (plan.atMs === undefined) return { text: "Renewal date unknown", urgent: false }
  const date = new Date(plan.atMs)
  // Rounded: a daylight-saving change makes one day 23 or 25 hours long.
  const days = Math.round((startOfDay(plan.atMs) - startOfDay(nowMs)) / DAY_MS)
  const year = date.getFullYear() === new Date(nowMs).getFullYear() ? "" : `/${String(date.getFullYear()).slice(2)}`
  const left = days > 0 ? ` (${days}d)` : days === 0 ? " (today)" : ""
  const lead = plan.plan ? `${capitalize(plan.plan)} ${plan.verb}` : capitalize(plan.verb)
  return {
    text: `${lead} ${plan.source === "estimate" ? "~" : ""}${date.getMonth() + 1}/${date.getDate()}${year}${left}`,
    urgent: plan.verb === "ended" || days <= 3,
  }
}

/** Calendar events for automatic renewals; manual dates and Cursor's cycle are already on the calendar. */
export function usagePlanEvents(plans: UsagePlan[], nowMs: number): UsageCalendarEvent[] {
  return plans.flatMap((plan) =>
    plan.atMs !== undefined && (plan.source === "login" || plan.source === "estimate") && plan.atMs >= startOfDay(nowMs)
      ? [{ atMs: plan.atMs, title: `${usagePlanLabel(plan)} renews`, usedPercent: null, stale: false, allDay: true }]
      : [],
  )
}

// A future `until` is exact. A passed one rolls forward from the start day: monthly under 60 days, else yearly.
function codexRenewal(codex: UsagePlanFacts["codex"], nowMs: number): Pick<UsagePlan, "atMs" | "source"> | undefined {
  if (!codex?.until) return undefined
  if (codex.until > nowMs) return { atMs: codex.until, source: "login" }
  if (!codex.start || codex.until <= codex.start) return undefined
  const start = new Date(codex.start)
  if (codex.until - codex.start < 60 * DAY_MS) return { atMs: nextRenewal(start.getDate(), nowMs), source: "estimate" }
  const on = (year: number) =>
    new Date(
      year,
      start.getMonth(),
      Math.min(start.getDate(), new Date(year, start.getMonth() + 1, 0).getDate()),
    ).valueOf()
  const year = new Date(nowMs).getFullYear()
  return { atMs: on(year) >= startOfDay(nowMs) ? on(year) : on(year + 1), source: "estimate" }
}

function codexFacts(entry: unknown): UsagePlanFacts["codex"] {
  if (!entry || typeof entry !== "object") return undefined
  const auth = entry as { access?: unknown; subscriptionStart?: unknown; subscriptionUntil?: unknown }
  const plan =
    typeof auth.access === "string"
      ? jwtPayload(auth.access)?.["https://api.openai.com/auth"]?.chatgpt_plan_type
      : undefined
  return {
    plan: typeof plan === "string" && plan ? plan : undefined,
    start: positive(auth.subscriptionStart),
    until: positive(auth.subscriptionUntil),
  }
}

// Claude Code keeps the account profile in `$CLAUDE_CONFIG_DIR/.claude.json`, or `~/.claude.json` when the variable
// is unset. oc spawns the default account (`~/.claude` unless CLAUDE_CONFIG_DIR is inherited) without it.
function claudeProfilePath(dir: string, homeDir: string, env: NodeJS.ProcessEnv) {
  const defaultDir = claudeConfigDirId(path.join(homeDir, ".claude"))
  const isDefault =
    !env.CLAUDE_CONFIG_DIR &&
    (process.platform === "win32" ? dir.toLowerCase() === defaultDir.toLowerCase() : dir === defaultDir)
  return isDefault ? path.join(homeDir, ".claude.json") : path.join(dir, ".claude.json")
}

async function claudeFacts(file: string): Promise<UsagePlanFacts["claude"][string]> {
  const account = await readFile(file, "utf8")
    .then(
      (raw) =>
        (JSON.parse(raw) as { oauthAccount?: { subscriptionCreatedAt?: unknown; organizationType?: unknown } })
          .oauthAccount,
    )
    .catch(() => undefined)
  const created = typeof account?.subscriptionCreatedAt === "string" ? Date.parse(account.subscriptionCreatedAt) : NaN
  const type = account?.organizationType
  return {
    plan: typeof type === "string" && type.startsWith("claude_") ? type.slice("claude_".length) : undefined,
    created: created > 0 ? created : undefined,
  }
}

function jwtPayload(token: string) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as {
      "https://api.openai.com/auth"?: { chatgpt_plan_type?: unknown }
    }
  } catch {
    return undefined
  }
}

function positive(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
