import type { OpencodeClient } from "@opencode-ai/sdk/v2"
import { createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js"
import { useSDK } from "./context/sdk"
import { useSync } from "./context/sync"
import { useDialog } from "./ui/dialog"
import { DialogPrompt } from "./ui/dialog-prompt"
import { DialogSelect, type DialogSelectOption } from "./ui/dialog-select"
import { useToast } from "./ui/toast"

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
export type Weekday = (typeof WEEKDAYS)[number]
export const PREVIEW_QUALIFIER = "If this starts a new 5-hour window."

export type ClaudeWarmupState = NonNullable<Awaited<ReturnType<OpencodeClient["global"]["claudeWarmup"]>>["data"]>
export type ClaudeWarmupAccount = ClaudeWarmupState["accounts"][number]
export type ClaudeWarmupSchedule = ClaudeWarmupAccount["schedule"]
type ClaudeWarmupSet = NonNullable<Awaited<ReturnType<OpencodeClient["global"]["setClaudeWarmup"]>>["data"]>

export type ClaudeWarmupDraft =
  | { mode: "daily"; times: string }
  | { mode: "weekly"; days: Record<Weekday, string> }

const WEEKDAY_TITLE: Record<Weekday, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
}

const OUTCOME_LABEL = {
  sent: "Prompt sent",
  rejected: "Rejected",
  failed: "Failed",
  timeout: "Timeout",
  missed: "Missed",
} as const

const TIME_PATTERN = /^(\d{2}):(\d{2})$/
const MAX_TIMES = 4
const RESET_MS = 5 * 60 * 60 * 1000

export function emptyWarmupState(): ClaudeWarmupState {
  return { accounts: [], timeZone: "", utcOffset: "", available: false }
}

export function commandName(accountID: string) {
  return `oc.claude_warmup.${accountID}`
}

export function commandTitle(label: string) {
  return `Schedule Claude warm-up: ${label}`
}

export function warmupCommands(accounts: ClaudeWarmupAccount[], run: (accountID: string) => void) {
  return accounts.map((account) => ({
    name: commandName(account.accountID),
    title: commandTitle(account.label),
    category: "oc",
    group: "Third party harness management",
    run: () => run(account.accountID),
  }))
}

export function formatTimes(times: string[]) {
  return times.join(", ")
}

export function emptyWeeklyDays(): Record<Weekday, string[]> {
  return { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
}

export function emptyWeeklyDraft(): Record<Weekday, string> {
  return { mon: "", tue: "", wed: "", thu: "", fri: "", sat: "", sun: "" }
}

export function draftFromAccount(account: ClaudeWarmupAccount): ClaudeWarmupDraft {
  if (account.schedule.mode === "weekly") {
    const days = emptyWeeklyDraft()
    for (const day of WEEKDAYS) days[day] = formatTimes(account.schedule.days[day] ?? [])
    return { mode: "weekly", days }
  }
  return { mode: "daily", times: formatTimes(account.schedule.times) }
}

export function accountStateLabel(account: ClaudeWarmupAccount) {
  if (hasScheduleTimes(account.schedule)) {
    if (account.enabled) return "On"
    return "Paused"
  }
  return "Not configured"
}

export function hasScheduleTimes(schedule: ClaudeWarmupSchedule) {
  if (schedule.mode === "daily") return schedule.times.length > 0
  return WEEKDAYS.some((day) => schedule.days[day].length > 0)
}

export function parseTimes(input: string): { ok: true; times: string[] } | { ok: false; error: string } {
  if (input.trim() === "") return { ok: true, times: [] }
  const tokens = input.split(",").map((token) => token.trim())
  const times: string[] = []
  for (const token of tokens) {
    const parsed = parseClock(token)
    if (!parsed) return { ok: false, error: token ? `Invalid time: ${token}` : "Enter a time after each comma" }
    if (!times.includes(parsed)) times.push(parsed)
  }
  times.sort()
  if (times.length > MAX_TIMES) return { ok: false, error: "At most 4 distinct times per day" }
  return { ok: true, times }
}

export function completeTimes(input: string) {
  return input
    .split(",")
    .map((token) => token.trim())
    .flatMap((token) => {
      const parsed = parseClock(token)
      if (!parsed) return []
      return [parsed]
    })
}

export function applyModeChange(draft: ClaudeWarmupDraft, mode: ClaudeWarmupDraft["mode"]): ClaudeWarmupDraft {
  if (mode === draft.mode) return draft
  if (mode === "weekly") {
    const times = draft.mode === "daily" ? draft.times : draft.days.mon
    const days = emptyWeeklyDraft()
    for (const day of WEEKDAYS) days[day] = times
    return { mode: "weekly", days }
  }
  return { mode: "daily", times: draft.mode === "weekly" ? draft.days.mon : draft.times }
}

export function scheduleFromDraft(
  draft: ClaudeWarmupDraft,
): { ok: true; schedule: ClaudeWarmupSchedule } | { ok: false; error: string } {
  if (draft.mode === "daily") {
    const parsed = parseTimes(draft.times)
    if (!parsed.ok) return parsed
    return { ok: true, schedule: { mode: "daily", times: parsed.times } }
  }
  const days = emptyWeeklyDays()
  for (const day of WEEKDAYS) {
    const parsed = parseTimes(draft.days[day])
    if (!parsed.ok) return { ok: false, error: `${WEEKDAY_TITLE[day]}: ${parsed.error}` }
    days[day] = parsed.times
  }
  return { ok: true, schedule: { mode: "weekly", days } }
}

export function savePayload(accountID: string, draft: ClaudeWarmupDraft) {
  const parsed = scheduleFromDraft(draft)
  if (!parsed.ok) return parsed
  return {
    ok: true as const,
    body: {
      accountID,
      enabled: hasScheduleTimes(parsed.schedule),
      schedule: parsed.schedule,
    },
  }
}

export function pausePayload(account: ClaudeWarmupAccount) {
  return {
    accountID: account.accountID,
    enabled: false,
    schedule: account.schedule,
  }
}

export function resumePayload(account: ClaudeWarmupAccount) {
  return {
    accountID: account.accountID,
    enabled: hasScheduleTimes(account.schedule),
    schedule: account.schedule,
  }
}

export function writeForAction(
  action: "save" | "pause" | "resume",
  account: ClaudeWarmupAccount,
  draft: ClaudeWarmupDraft,
) {
  if (action === "pause") return { ok: true as const, body: pausePayload(account) }
  if (action === "resume") return { ok: true as const, body: resumePayload(account) }
  return savePayload(account.accountID, draft)
}

export async function persistWarmupSchedule(
  client: OpencodeClient,
  payload: ReturnType<typeof writeForAction>,
  previous: ClaudeWarmupState,
) {
  if (!payload.ok) return { state: previous, error: payload.error }
  const result = await client.global.setClaudeWarmup(payload.body)
  if (result.error) return { state: previous, error: conciseError(result.error) }
  if (result.data) return { state: mergeAccount(previous, result.data) }
  return { state: previous }
}

export function clockReset(time: string) {
  const parsed = parseClock(time)
  if (!parsed) return
  const hours = Number(parsed.slice(0, 2))
  const minutes = Number(parsed.slice(3, 5))
  const total = hours * 60 + minutes + 5 * 60
  const nextDay = total >= 24 * 60
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60)
  return {
    time: formatClock(Math.floor(wrapped / 60), wrapped % 60),
    nextDay,
  }
}

export function weekdayReset(day: Weekday, time: string) {
  const reset = clockReset(time)
  if (!reset) return
  if (!reset.nextDay) return { day, time: reset.time }
  const index = WEEKDAYS.indexOf(day)
  return { day: WEEKDAYS[(index + 1) % WEEKDAYS.length], time: reset.time }
}

export function datedResetPreview(nextAt: number, timeZone: string) {
  return formatZoned(nextAt + RESET_MS, timeZone)
}

export function previewLines(input: string, weekday?: Weekday) {
  return unique(completeTimes(input)).flatMap((time) => {
    const line = previewLine(time, weekday)
    if (!line) return []
    return [line]
  })
}

export function previewLine(time: string, weekday?: Weekday) {
  if (weekday) {
    const reset = weekdayReset(weekday, time)
    if (!reset) return
    if (reset.day === weekday) return `Send at ${time}    Est. reset ${reset.time}`
    return `${WEEKDAY_TITLE[weekday]} ${time}    Est. reset ${WEEKDAY_TITLE[reset.day]} ${reset.time}`
  }
  const reset = clockReset(time)
  if (!reset) return
  if (reset.nextDay) return `Send at ${time}    Est. reset ${reset.time} next day`
  return `Send at ${time}    Est. reset ${reset.time}`
}

export function promptPreviewText(input: string, weekday?: Weekday, error?: string) {
  return [...(error ? [error] : []), ...previewLines(input, weekday), PREVIEW_QUALIFIER].join("\n")
}

export function zoneLabel(timeZone: string, utcOffset: string) {
  return [timeZone, utcOffset].filter((part) => part.length > 0).join(" ")
}

export function formatNextAt(nextAt: number | undefined, timeZone: string, utcOffset: string) {
  if (nextAt === undefined) return "None"
  const when = formatZoned(nextAt, timeZone)
  const zone = zoneLabel(timeZone, utcOffset)
  if (!zone) return when
  return `${when} ${zone}`
}

export function formatLastAttempt(account: ClaudeWarmupAccount, timeZone: string) {
  if (!account.lastAttempt) return "No attempts yet"
  const outcome = account.lastAttempt.outcome
  const label = outcome in OUTCOME_LABEL ? OUTCOME_LABEL[outcome] : outcome
  return `${formatZoned(account.lastAttempt.attemptedAt, timeZone)} ${label}`
}

export function readWarmupState(
  result: { data?: ClaudeWarmupState; error?: unknown },
  previous: ClaudeWarmupState,
): ClaudeWarmupState {
  if (result.error || !result.data) {
    return { ...previous, error: conciseError(result.error) }
  }
  return result.data
}

export function mergeAccount(state: ClaudeWarmupState, account: ClaudeWarmupSet): ClaudeWarmupState {
  const accounts = state.accounts.some((item) => item.accountID === account.accountID)
    ? state.accounts.map((item) => (item.accountID === account.accountID ? account : item))
    : [...state.accounts, account]
  return { ...state, accounts, error: undefined }
}

export function changedDiscoveryError(error: string | undefined, last: { error?: string }) {
  const next = error?.trim()
  // Missing CLI with no accounts is expected inventory 0, not a nag to install.
  const toastable = next && !next.startsWith("Claude CLI not found") ? next : undefined
  if (!toastable) {
    last.error = undefined
    return
  }
  if (toastable === last.error) return
  last.error = toastable
  return toastable
}

export function createWarmupDiscovery(options: {
  load: () => Promise<ClaudeWarmupState>
  apply: (value: ClaudeWarmupState) => void
  previous: () => ClaudeWarmupState
  notify?: (message: string) => void
}) {
  let generation = 0
  let inFlight: { generation: number; promise: Promise<ClaudeWarmupState> } | undefined
  const last = { error: undefined as string | undefined }

  async function refresh() {
    const gen = generation
    if (!inFlight || inFlight.generation !== gen) {
      const promise = options.load().then(
        (value) => value,
        (error) => ({ ...options.previous(), error: conciseError(error) }),
      )
      inFlight = {
        generation: gen,
        promise: promise.finally(() => {
          if (inFlight?.generation === gen) inFlight = undefined
        }),
      }
    }
    const result = await inFlight.promise
    if (gen !== generation) return
    options.apply(result)
    const message = changedDiscoveryError(result.error, last)
    if (message) options.notify?.(message)
  }

  function invalidate() {
    generation += 1
    return refresh()
  }

  return { refresh, invalidate }
}

export function accountOptions(input: {
  account: ClaudeWarmupAccount
  draft: ClaudeWarmupDraft
  zone: string
  timeZone: string
  utcOffset: string
  error?: string
  onMode: (mode: ClaudeWarmupDraft["mode"]) => void
  onTimes: (day: Weekday | undefined) => void
  onSave: () => void
  onPause: () => void
  onResume: () => void
}): DialogSelectOption<string>[] {
  const paused = accountStateLabel(input.account) === "Paused"
  const rows: DialogSelectOption<string>[] = [
    {
      value: "state",
      title: `State: ${accountStateLabel(input.account)}`,
      inert: true,
    },
  ]
  if (input.zone) {
    rows.push({ value: "zone", title: input.zone, inert: true })
  }
  if (input.error) {
    rows.push({ value: "error", title: input.error, inert: true })
  }
  rows.push({
    value: "mode",
    title: input.draft.mode === "daily" ? "Every day" : "By weekday",
    onSelect: () => input.onMode(input.draft.mode === "daily" ? "weekly" : "daily"),
  })
  if (input.draft.mode === "daily") {
    rows.push(timesOption("times", `Times: ${input.draft.times || "(none)"}`, input.draft.times, undefined, () => input.onTimes(undefined)))
  } else {
    for (const day of WEEKDAYS) {
      rows.push(
        timesOption(
          `day.${day}`,
          `${WEEKDAY_TITLE[day]}: ${input.draft.days[day] || "(none)"}`,
          input.draft.days[day],
          day,
          () => input.onTimes(day),
        ),
      )
    }
  }
  rows.push(
    {
      value: "next",
      title: `Next: ${formatNextAt(input.account.nextAt, input.timeZone, input.utcOffset)}`,
      details:
        input.account.nextAt === undefined
          ? undefined
          : [`Est. reset ${datedResetPreview(input.account.nextAt, input.timeZone)}`],
      inert: true,
    },
    {
      value: "last",
      title: formatLastAttempt(input.account, input.timeZone),
      inert: true,
    },
    {
      value: "save",
      title: "Save",
      onSelect: input.onSave,
    },
  )
  if (hasScheduleTimes(input.account.schedule)) {
    rows.push({
      value: "pause",
      title: paused ? "Resume" : "Pause",
      onSelect: paused ? input.onResume : input.onPause,
    })
  }
  return rows
}

export function createClaudeWarmupCommands() {
  const sdk = useSDK()
  const sync = useSync()
  const dialog = useDialog()
  const toast = useToast()
  const [state, setState] = createSignal(emptyWarmupState())
  const discovery = createWarmupDiscovery({
    previous: state,
    load: () =>
      sdk.client.global.claudeWarmup().then((result) => readWarmupState(result, state())),
    apply: setState,
    notify: (message) => toast.show({ message, variant: "error" }),
  })

  onMount(() => {
    void discovery.refresh()
    onCleanup(sdk.onReconnect(() => void discovery.invalidate()))
  })

  createEffect(
    on(
      () => sync.data.config.provider?.["claude-code"]?.options?.accounts,
      () => void discovery.invalidate(),
      { defer: true },
    ),
  )

  function openAccount(accountID: string) {
    const account = state().accounts.find((item) => item.accountID === accountID)
    if (!account) return
    const [draft, setDraft] = createSignal(draftFromAccount(account))
    const [promptError, setPromptError] = createSignal<string>()

    const show = () => {
      const current = state().accounts.find((item) => item.accountID === accountID) ?? account
      const zone = zoneLabel(state().timeZone, state().utcOffset)
      dialog.replace(() => (
        <DialogSelect
          title={commandTitle(current.label)}
          footer={<text>{PREVIEW_QUALIFIER}</text>}
          options={accountOptions({
            account: current,
            draft: draft(),
            zone,
            timeZone: state().timeZone,
            utcOffset: state().utcOffset,
            error: state().error,
            onMode: (mode) => {
              setDraft(applyModeChange(draft(), mode))
              show()
            },
            onTimes: (day) => editTimes(day),
            onSave: () => void save(current),
            onPause: () => void persist(writeForAction("pause", current, draft())),
            onResume: () => void persist(writeForAction("resume", current, draft())),
          })}
        />
      ))
    }

    function editTimes(day: Weekday | undefined) {
      const current = draft()
      const value = day
        ? current.mode === "weekly"
          ? current.days[day]
          : ""
        : current.mode === "daily"
          ? current.times
          : ""
      const [live, setLive] = createSignal(value)
      setPromptError()
      dialog.replace(() => (
        <DialogPrompt
          title={day ? WEEKDAY_TITLE[day] : "Times"}
          value={value}
          placeholder="HH:mm, HH:mm"
          description={() => <text>{promptPreviewText(live(), day, promptError())}</text>}
          onContentChange={(next) => {
            setPromptError()
            setLive(next)
          }}
          onConfirm={(next) => {
            const parsed = parseTimes(next)
            if (!parsed.ok) {
              setPromptError(parsed.error)
              return
            }
            const formatted = formatTimes(parsed.times)
            if (day) {
              const weekly = current.mode === "weekly" ? current.days : emptyWeeklyDraft()
              setDraft({ mode: "weekly", days: { ...weekly, [day]: formatted } })
            } else {
              setDraft({ mode: "daily", times: formatted })
            }
            show()
          }}
        />
      ))
    }

    async function save(current: ClaudeWarmupAccount) {
      await persist(writeForAction("save", current, draft()))
    }

    async function persist(payload: ReturnType<typeof writeForAction>) {
      const next = await persistWarmupSchedule(sdk.client, payload, state())
      if (next.error) {
        toast.show({ message: next.error, variant: "error" })
        show()
        return
      }
      setState(next.state)
      dialog.clear()
    }

    show()
  }

  return {
    refresh: () => discovery.refresh(),
    commands: createMemo(() => warmupCommands(state().accounts, openAccount)),
  }
}

function timesOption(
  value: string,
  title: string,
  input: string,
  weekday: Weekday | undefined,
  onSelect: () => void,
): DialogSelectOption<string> {
  return {
    value,
    title,
    details: previewLines(input, weekday),
    onSelect,
  }
}

function parseClock(token: string) {
  const match = TIME_PATTERN.exec(token)
  if (!match) return
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return
  return formatClock(hours, minutes)
}

function formatClock(hours: number, minutes: number) {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

function formatZoned(at: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || undefined,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at))
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ""
  return `${read("weekday")} ${read("month")} ${read("day")} ${read("hour")}:${read("minute")}`
}

function unique(times: string[]) {
  return times.filter((time, index) => times.indexOf(time) === index)
}

function conciseError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message
  }
  return "Warm-up inventory unavailable"
}
