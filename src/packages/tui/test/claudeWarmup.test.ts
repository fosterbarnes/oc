import { expect, test } from "bun:test"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import path from "path"
import os from "os"
import { mkdtemp, rm, mkdir } from "fs/promises"
import {
  PREVIEW_QUALIFIER,
  accountOptions,
  applyModeChange,
  clockReset,
  commandName,
  commandTitle,
  completeTimes,
  changedDiscoveryError,
  createWarmupDiscovery,
  datedResetPreview,
  displayClock,
  displayTimes,
  draftFromAccount,
  draftFromSchedule,
  readWarmupPresets,
  saveWarmupPreset,
  emptyWeeklyDays,
  emptyWarmupState,
  formatLastAttempt,
  formatNextAt,
  mergeAccount,
  parseTimes,
  persistWarmupSchedule,
  pausePayload,
  previewLine,
  previewLines,
  promptPreviewText,
  readWarmupState,
  resumePayload,
  savePayload,
  weekdayReset,
  warmupCommands,
  writeForAction,
  zoneLabel,
  type ClaudeWarmupAccount,
  type ClaudeWarmupState,
} from "../src/claudeWarmup"
import { Locale } from "../src/util/locale"

const daily = {
  accountID: "default",
  label: ".claude",
  enabled: true,
  schedule: { mode: "daily" as const, times: ["07:00", "12:00"] },
} satisfies ClaudeWarmupAccount

const weekly = {
  accountID: "C:\\Users\\a\\.claudeSecond",
  label: ".claudeSecond",
  enabled: false,
  schedule: {
    mode: "weekly" as const,
    days: {
      mon: ["07:00"],
      tue: ["07:00"],
      wed: ["07:00"],
      thu: ["07:00"],
      fri: ["07:00"],
      sat: [],
      sun: ["22:00"],
    },
  },
  lastAttempt: { scheduledAt: 1, attemptedAt: 2, outcome: "sent" as const },
} satisfies ClaudeWarmupAccount

test("command generation is empty with no accounts and stable by account ID", () => {
  expect(warmupCommands([], () => undefined)).toEqual([])
  const one = warmupCommands([daily], () => undefined)
  expect(one).toHaveLength(1)
  expect(one[0].name).toBe(commandName("default"))
  expect(one[0].title).toBe(commandTitle(".claude"))
  expect(one[0].category).toBe("oc")
  expect(one[0].group).toBe("Third party harness management")
  const two = warmupCommands([weekly, daily], () => undefined)
  expect(two.map((item) => item.name)).toEqual([commandName(weekly.accountID), commandName(daily.accountID)])
  expect(two[0].name).not.toBe("oc.claude_warmup.0")
})

test("parser accepts four distinct sorted times and rejects invalid input", () => {
  expect(parseTimes("")).toEqual({ ok: true, times: [] })
  expect(parseTimes("  ")).toEqual({ ok: true, times: [] })
  expect(parseTimes("12:00, 00:00, 12:00, 07:00")).toEqual({
    ok: true,
    times: ["00:00", "07:00", "12:00"],
  })
  expect(parseTimes("00:00, 06:00, 12:00, 18:00")).toEqual({
    ok: true,
    times: ["00:00", "06:00", "12:00", "18:00"],
  })
  expect(parseTimes("00:00, 06:00, 12:00, 18:00, 22:00").ok).toBe(false)
  expect(parseTimes("7:00").ok).toBe(false)
  expect(parseTimes("24:00").ok).toBe(false)
  expect(parseTimes("07:60").ok).toBe(false)
  expect(parseTimes("07:").ok).toBe(false)
  expect(parseTimes(",,")).toEqual({ ok: false, error: "Enter a time after each comma" })
  expect(parseTimes("07:00,")).toEqual({ ok: false, error: "Enter a time after each comma" })
  expect(parseTimes(",07:00")).toEqual({ ok: false, error: "Enter a time after each comma" })
  expect(parseTimes("07:00, ")).toEqual({ ok: false, error: "Enter a time after each comma" })
  expect(parseTimes(",")).toEqual({ ok: false, error: "Enter a time after each comma" })
  expect(parseTimes("07:00,,12:00")).toEqual({ ok: false, error: "Enter a time after each comma" })
  expect(savePayload("default", { mode: "daily", times: "07:00," }).ok).toBe(false)
  expect(completeTimes("07:00,")).toEqual(["07:00"])
  expect(completeTimes(",,07:00, 12:00,")).toEqual(["07:00", "12:00"])
  expect(previewLines("07:00,")).toEqual(["Send at 07:00    Est. reset 12:00"])
})

test("daily and weekday save payloads enable only nonempty schedules", () => {
  expect(savePayload("default", { mode: "daily", times: "07:00, 12:00" })).toEqual({
    ok: true,
    body: {
      accountID: "default",
      enabled: true,
      schedule: { mode: "daily", times: ["07:00", "12:00"] },
    },
  })
  expect(savePayload("default", { mode: "daily", times: "" })).toEqual({
    ok: true,
    body: {
      accountID: "default",
      enabled: false,
      schedule: { mode: "daily", times: [] },
    },
  })
  const weekday = savePayload(weekly.accountID, {
    mode: "weekly",
    days: {
      mon: "07:00",
      tue: "07:00",
      wed: "07:00",
      thu: "07:00",
      fri: "07:00",
      sat: "",
      sun: "22:00",
    },
  })
  expect(weekday.ok).toBe(true)
  if (weekday.ok) {
    expect(weekday.body.enabled).toBe(true)
    expect(weekday.body.schedule).toEqual(weekly.schedule)
  }
  expect(savePayload("default", { mode: "daily", times: "07:" }).ok).toBe(false)
})

test("mode change stays in draft until save", () => {
  const fromDaily = applyModeChange({ mode: "daily", times: "07:00, 12:00" }, "weekly")
  expect(fromDaily).toEqual({
    mode: "weekly",
    days: {
      mon: "07:00, 12:00",
      tue: "07:00, 12:00",
      wed: "07:00, 12:00",
      thu: "07:00, 12:00",
      fri: "07:00, 12:00",
      sat: "07:00, 12:00",
      sun: "07:00, 12:00",
    },
  })
  expect(applyModeChange(fromDaily, "daily")).toEqual({ mode: "daily", times: "07:00, 12:00" })
  expect(draftFromAccount(daily)).toEqual({ mode: "daily", times: "07:00, 12:00" })
})

test("writeForAction builds save pause and resume payloads", () => {
  const draft = draftFromAccount(daily)
  expect(writeForAction("pause", daily, { mode: "daily", times: "99:99" })).toEqual({
    ok: true,
    body: pausePayload(daily),
  })
  expect(writeForAction("resume", { ...daily, enabled: false }, draft)).toEqual({
    ok: true,
    body: resumePayload({ ...daily, enabled: false }),
  })
  expect(writeForAction("save", daily, { mode: "daily", times: "08:00" })).toEqual({
    ok: true,
    body: {
      accountID: "default",
      enabled: true,
      schedule: { mode: "daily", times: ["08:00"] },
    },
  })
  expect(writeForAction("save", daily, { mode: "daily", times: "07:00," }).ok).toBe(false)
  expect(pausePayload(weekly).schedule).toEqual(weekly.schedule)
})

test("live previews keep valid tokens while another token is incomplete", () => {
  expect(completeTimes("07:00, 07:")).toEqual(["07:00"])
  expect(previewLines("07:00, 12:00, 22:00")).toEqual([
    "Send at 07:00    Est. reset 12:00",
    "Send at 12:00    Est. reset 17:00",
    "Send at 22:00    Est. reset 03:00 next day",
  ])
  expect(previewLines("07:00, 07:")).toEqual(["Send at 07:00    Est. reset 12:00"])
  expect(previewLines("00:00")).toEqual(["Send at 00:00    Est. reset 05:00"])
  expect(previewLine("22:00", "sun")).toBe("Sunday 22:00    Est. reset Monday 03:00")
  expect(clockReset("12:00")).toEqual({ time: "17:00", nextDay: false })
  expect(weekdayReset("sun", "22:00")).toEqual({ day: "mon", time: "03:00" })
})

test("prompt description keeps previews beside a validation error and clears it on the next edit text", () => {
  const invalid = promptPreviewText("07:00, 07:", undefined, "Invalid time: 07:")
  expect(invalid).toContain("Invalid time: 07:")
  expect(invalid).toContain("Send at 07:00    Est. reset 12:00")
  expect(invalid).toContain(PREVIEW_QUALIFIER)
  expect(promptPreviewText("07:00, 08:00")).toBe(
    ["Send at 07:00    Est. reset 12:00", "Send at 08:00    Est. reset 13:00", PREVIEW_QUALIFIER].join("\n"),
  )
})

test("account summary uses Times title, details rows, and the qualifier", () => {
  const four = "00:00, 06:00, 12:00, 18:00"
  const options = accountOptions({
    account: daily,
    draft: { mode: "daily", times: four },
    zone: "America/New_York UTC-04:00",
    timeZone: "America/New_York",
    utcOffset: "UTC-04:00",
    onMode: () => undefined,
    onTimes: () => undefined,
    onSave: () => undefined,
    onSavePreset: () => undefined,
    onLoadPreset: () => undefined,
    onPause: () => undefined,
    onResume: () => undefined,
  })
  const times = options.find((option) => option.value === "times")
  expect(times?.title).toBe(`Times: ${four}`)
  expect(times?.details).toEqual([
    "Send at 00:00    Est. reset 05:00",
    "Send at 06:00    Est. reset 11:00",
    "Send at 12:00    Est. reset 17:00",
    "Send at 18:00    Est. reset 23:00",
  ])
  expect(times?.details).not.toContain(PREVIEW_QUALIFIER)
  const empty = accountOptions({
    account: { ...daily, enabled: false, schedule: { mode: "daily", times: [] } },
    draft: { mode: "daily", times: "" },
    zone: "",
    timeZone: "",
    utcOffset: "",
    onMode: () => undefined,
    onTimes: () => undefined,
    onSave: () => undefined,
    onSavePreset: () => undefined,
    onLoadPreset: () => undefined,
    onPause: () => undefined,
    onResume: () => undefined,
  }).find((option) => option.value === "times")
  expect(empty?.title).toBe("Times: (none)")
  const monday = accountOptions({
    account: weekly,
    draft: draftFromAccount(weekly),
    zone: "",
    timeZone: "UTC",
    utcOffset: "",
    onMode: () => undefined,
    onTimes: () => undefined,
    onSave: () => undefined,
    onSavePreset: () => undefined,
    onLoadPreset: () => undefined,
    onPause: () => undefined,
    onResume: () => undefined,
  }).find((option) => option.value === "day.sun")
  expect(monday?.details).toEqual(["Sunday 22:00    Est. reset Monday 03:00"])
})

test("12-hour format changes display only", () => {
  expect(displayClock("16:05")).toBe("16:05")
  Locale.setTimeSettings({ clock: "12h" })
  try {
    expect(displayClock("00:00")).toBe("12:00 AM")
    expect(displayClock("12:00")).toBe("12:00 PM")
    expect(displayClock("16:05")).toBe("4:05 PM")
    expect(displayTimes("08:00, 16:00")).toBe("8:00 AM, 4:00 PM")
    expect(displayTimes("")).toBe("")
    expect(previewLines("07:00, 22:00")).toEqual([
      "Send at 7:00 AM    Est. reset 12:00 PM",
      "Send at 10:00 PM    Est. reset 3:00 AM next day",
    ])
    expect(previewLine("22:00", "sun")).toBe("Sunday 10:00 PM    Est. reset Monday 3:00 AM")
    expect(promptPreviewText("07:00")).toBe(["Send at 7:00 AM    Est. reset 12:00 PM", PREVIEW_QUALIFIER].join("\n"))
    const spring = Date.parse("2026-03-08T01:00:00-05:00")
    expect(datedResetPreview(spring, "America/New_York")).toBe("Sun Mar 8 7:00 AM")
    expect(formatNextAt(spring, "America/New_York", "UTC-05:00")).toBe("Sun Mar 8 1:00 AM America/New_York UTC-05:00")
    const options = accountOptions({
      account: daily,
      draft: { mode: "daily", times: "08:00, 16:00" },
      zone: "",
      timeZone: "UTC",
      utcOffset: "",
      onMode: () => undefined,
      onTimes: () => undefined,
      onSave: () => undefined,
      onSavePreset: () => undefined,
      onLoadPreset: () => undefined,
      onPause: () => undefined,
      onResume: () => undefined,
    })
    expect(options.find((option) => option.value === "times")?.title).toBe("Times: 8:00 AM, 4:00 PM")
  } finally {
    Locale.setTimeSettings(undefined)
  }
})

test("dated DST preview adds five elapsed hours in the server zone", () => {
  const spring = Date.parse("2026-03-08T01:00:00-05:00")
  expect(datedResetPreview(spring, "America/New_York")).toContain("07:00")
  const fall = Date.parse("2026-11-01T00:30:00-04:00")
  expect(datedResetPreview(fall, "America/New_York")).toContain("04:30")
  expect(zoneLabel("America/New_York", "UTC-04:00")).toBe("America/New_York UTC-04:00")
  expect(formatNextAt(spring, "America/New_York", "UTC-05:00")).toContain("UTC-05:00")
  expect(formatLastAttempt(weekly, "UTC")).toContain("Prompt sent")
  expect(formatLastAttempt(daily, "UTC")).toBe("No attempts yet")
})

test("stale discovery results are ignored", async () => {
  const applied: ClaudeWarmupState[] = []
  let load = 0
  const pending: Promise<void>[] = []
  const previous = emptyWarmupState()
  const discovery = createWarmupDiscovery({
    previous: () => previous,
    load: () => {
      load += 1
      const id = load
      return new Promise<ClaudeWarmupState>((resolve) => {
        pending.push(
          Promise.resolve().then(() =>
            resolve({
              ...emptyWarmupState(),
              accounts: id === 1 ? [daily] : [weekly],
            }),
          ),
        )
      })
    },
    apply: (value) => applied.push(value),
  })
  const first = discovery.refresh()
  const second = discovery.invalidate()
  await Promise.all(pending)
  await first
  await second
  expect(applied).toHaveLength(1)
  expect(applied[0].accounts).toEqual([weekly])
})

test("refresh rejection keeps inventory and surfaces a concise error", async () => {
  const previous: ClaudeWarmupState = {
    accounts: [daily],
    timeZone: "America/New_York",
    utcOffset: "UTC-04:00",
    available: true,
  }
  const applied: ClaudeWarmupState[] = []
  const notes: string[] = []
  const discovery = createWarmupDiscovery({
    previous: () => previous,
    load: () => Promise.reject(new Error("timeout")),
    apply: (value) => applied.push(value),
    notify: (message) => notes.push(message),
  })
  await discovery.refresh()
  await discovery.refresh()
  expect(applied).toEqual([
    { ...previous, error: "timeout" },
    { ...previous, error: "timeout" },
  ])
  expect(applied[0].accounts).toEqual([daily])
  expect(notes).toEqual(["timeout"])
  expect(readWarmupState({ error: { message: "probe failed" } }, previous).accounts).toEqual([daily])
  expect(readWarmupState({ error: { message: "probe failed" } }, previous).error).toBe("probe failed")
})

test("missing CLI stays silent; too-old CLI toasts a changed update error once", async () => {
  const missing = "Claude CLI not found; install claude to use warm-up"
  const update = "Claude CLI 2.1.200 is too old; warm-up needs 2.1.293 or newer"
  const last = { error: undefined as string | undefined }
  expect(changedDiscoveryError(missing, last)).toBeUndefined()
  expect(changedDiscoveryError(update, last)).toBe(update)
  expect(changedDiscoveryError(update, last)).toBeUndefined()
  expect(changedDiscoveryError(undefined, last)).toBeUndefined()
  expect(changedDiscoveryError(update, last)).toBe(update)
  const notes: string[] = []
  const applied: ClaudeWarmupState[] = []
  let load = 0
  const discovery = createWarmupDiscovery({
    previous: emptyWarmupState,
    load: async () => {
      load += 1
      if (load === 1) {
        return { accounts: [], timeZone: "", utcOffset: "", available: false, error: missing }
      }
      return { accounts: [], timeZone: "", utcOffset: "", available: false, error: update }
    },
    apply: (value) => applied.push(value),
    notify: (message) => notes.push(message),
  })
  await discovery.refresh()
  expect(notes).toEqual([])
  expect(warmupCommands(applied[0].accounts, () => undefined)).toEqual([])
  await discovery.refresh()
  await discovery.refresh()
  expect(applied[0].available).toBe(false)
  expect(notes).toEqual([update])
  expect(warmupCommands(applied[2].accounts, () => undefined)).toEqual([])
})

test("mergeAccount replaces one account after save", () => {
  const next = mergeAccount(
    { accounts: [daily, weekly], timeZone: "UTC", utcOffset: "Z", available: true, error: "old" },
    { ...daily, enabled: false },
  )
  expect(next.error).toBeUndefined()
  expect(next.accounts[0].enabled).toBe(false)
  expect(next.accounts[1]).toEqual(weekly)
})

test("signed-out accounts are omitted from commands", () => {
  expect(warmupCommands([], () => undefined)).toHaveLength(0)
  expect(warmupCommands([weekly], () => undefined)[0].title).toContain(".claudeSecond")
})

test("generated Global GET/PUT send flattened schedule to /global/claude/warmup", async () => {
  const hits: { method: string; path: string; body?: unknown }[] = []
  const inventory: ClaudeWarmupState = {
    accounts: [daily],
    timeZone: "America/New_York",
    utcOffset: "UTC-04:00",
    available: true,
  }
  const saved = {
    ...daily,
    enabled: true,
    schedule: { mode: "daily" as const, times: ["07:00", "12:00"] },
    lastAttempt: { scheduledAt: 1, attemptedAt: 2, outcome: "sent" as const },
  }
  const client = createOpencodeClient({
    baseUrl: "http://warmup.test",
    fetch: Object.assign(
      async (input: URL | RequestInfo) => {
        const request = input instanceof Request ? input : new Request(input)
        const path = new URL(request.url).pathname
        const raw = request.method === "GET" ? undefined : await request.clone().text()
        hits.push({
          method: request.method,
          path,
          ...(raw ? { body: JSON.parse(raw) } : {}),
        })
        if (request.method === "GET" && path === "/global/claude/warmup") {
          return Response.json(inventory)
        }
        if (request.method === "PUT" && path === "/global/claude/warmup") {
          return Response.json(saved)
        }
        return new Response("not found", { status: 404 })
      },
      { preconnect: () => {} },
    ),
  })
  const loaded = readWarmupState(await client.global.claudeWarmup(), emptyWarmupState())
  expect(loaded.accounts).toEqual([daily])
  expect(hits).toEqual([{ method: "GET", path: "/global/claude/warmup" }])
  const invalid = await persistWarmupSchedule(
    client,
    writeForAction("save", daily, { mode: "daily", times: "07:00," }),
    loaded,
  )
  expect(invalid.error).toBe("Enter a time after each comma")
  expect(hits).toHaveLength(1)
  const dir = await mkdtemp(path.join(os.tmpdir(), "warmup-sdk-"))
  const presetDraft = await (async () => {
    try {
      const file = path.join(dir, "presets.json")
      await saveWarmupPreset(file, "Selected", saved.schedule)
      return draftFromSchedule((await readWarmupPresets(file))[0].schedule)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })()
  expect(hits).toHaveLength(1)
  const persisted = await persistWarmupSchedule(client, writeForAction("save", daily, presetDraft), loaded)
  expect(persisted.error).toBeUndefined()
  expect(persisted.state.accounts[0]).toMatchObject({
    accountID: "default",
    label: ".claude",
    schedule: saved.schedule,
    lastAttempt: { outcome: "sent" },
  })
  expect(formatLastAttempt(persisted.state.accounts[0], "UTC")).toContain("Prompt sent")
  expect(hits[1]).toEqual({
    method: "PUT",
    path: "/global/claude/warmup",
    body: {
      accountID: "default",
      enabled: true,
      schedule: { mode: "daily", times: ["07:00", "12:00"] },
    },
  })
})

async function presetFixture(run: (file: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "warmup-presets-"))
  try {
    await run(path.join(dir, "presets.json"))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test("presets round-trip complete independent daily and weekly snapshots", () =>
  presetFixture(async (file) => {
    expect(await readWarmupPresets(file)).toEqual([])
    await saveWarmupPreset(file, "  Workdays  ", daily.schedule)
    await saveWarmupPreset(file, "Weekend", weekly.schedule)
    await saveWarmupPreset(file, "Empty daily", { mode: "daily", times: [] })
    await saveWarmupPreset(file, "Empty weekly", { mode: "weekly", days: emptyWeeklyDays() })
    await saveWarmupPreset(file, "__proto__", { mode: "daily", times: ["12:00", "07:00", "12:00"] })
    const presets = await readWarmupPresets(file)
    expect(presets.map((preset) => preset.name)).toEqual([
      "Workdays",
      "Weekend",
      "Empty daily",
      "Empty weekly",
      "__proto__",
    ])
    expect(presets[0].schedule).toEqual(daily.schedule)
    expect(presets[1].schedule).toEqual(weekly.schedule)
    expect(presets[2].schedule).toEqual({ mode: "daily", times: [] })
    expect(presets[3].schedule).toEqual({ mode: "weekly", days: emptyWeeklyDays() })
    expect(presets[4].schedule).toEqual(daily.schedule)
    const draft = draftFromSchedule(presets[1].schedule)
    if (draft.mode !== "weekly") throw new Error("Expected weekly draft")
    draft.days.mon = "09:00"
    expect(presets[1].schedule).toEqual(weekly.schedule)
    expect((await readWarmupPresets(file))[1].schedule).toEqual(weekly.schedule)
  }))

test("preset collision needs explicit replacement and preserves other names", () =>
  presetFixture(async (file) => {
    await saveWarmupPreset(file, "Work", daily.schedule)
    await saveWarmupPreset(file, "Weekend", weekly.schedule)
    const before = await Bun.file(file).text()
    expect(await saveWarmupPreset(file, " work ", weekly.schedule)).toEqual({ saved: false, name: "Work" })
    expect(await Bun.file(file).text()).toBe(before)
    expect(await saveWarmupPreset(file, " WORK ", weekly.schedule, true)).toEqual({ saved: true })
    expect(await readWarmupPresets(file)).toEqual([
      { name: "WORK", schedule: weekly.schedule },
      { name: "Weekend", schedule: weekly.schedule },
    ])
  }))

test("concurrent preset additions merge and same-name creates collide under fixture locks", () =>
  presetFixture(async (file) => {
    expect(
      await Promise.all([
        saveWarmupPreset(file, "One", daily.schedule),
        saveWarmupPreset(file, "Two", weekly.schedule),
      ]),
    ).toEqual([{ saved: true }, { saved: true }])
    expect(await readWarmupPresets(file)).toHaveLength(2)
    const results = await Promise.all([
      saveWarmupPreset(file, "Same", daily.schedule),
      saveWarmupPreset(file, " same ", weekly.schedule),
    ])
    expect(results.filter((result) => result.saved)).toHaveLength(1)
    expect(results.filter((result) => !result.saved)).toHaveLength(1)
    expect(await readWarmupPresets(file)).toHaveLength(3)
  }))

test("invalid names and persisted shapes never overwrite the library", () =>
  presetFixture(async (file) => {
    await saveWarmupPreset(file, "Valid", daily.schedule)
    const before = await Bun.file(file).text()
    for (const name of ["", "  ", "bad\nname", "bad\tname", "bad\x7fname", "bad\u2028name"]) {
      await expect(saveWarmupPreset(file, name, daily.schedule)).rejects.toThrow()
      expect(await Bun.file(file).text()).toBe(before)
    }
    await expect(saveWarmupPreset(file, "Invalid", { mode: "daily", times: ["24:00"] })).rejects.toThrow()
    expect(await Bun.file(file).text()).toBe(before)
    const entry = { name: "Valid", schedule: daily.schedule }
    for (const value of [
      "{",
      "null",
      "[]",
      "{}",
      JSON.stringify({ presets: [null] }),
      JSON.stringify({ presets: [{ ...entry, name: 1 }] }),
      JSON.stringify({ presets: [entry, { ...entry, name: " valid " }] }),
      ...[
        { mode: "other", times: [] },
        { mode: "daily", times: [1] },
        { mode: "daily", times: ["24:00"] },
        { mode: "daily", times: [""] },
        { mode: "daily", times: ["07:00,12:00"] },
        { mode: "daily", times: ["00:00", "01:00", "02:00", "03:00", "04:00"] },
        { mode: "weekly", days: { mon: [] } },
        { mode: "weekly", days: { ...emptyWeeklyDays(), sun: null } },
      ].map((schedule) => JSON.stringify({ presets: [{ name: "Bad", schedule }] })),
    ]) {
      await Bun.write(file, value)
      await expect(readWarmupPresets(file)).rejects.toThrow()
      await expect(saveWarmupPreset(file, "New", daily.schedule, true)).rejects.toThrow()
      expect(await Bun.file(file).text()).toBe(value)
    }
  }))

test("preset I/O errors are rejected instead of treated as missing", () =>
  presetFixture(async (file) => {
    await mkdir(file)
    await expect(readWarmupPresets(file)).rejects.toThrow()
    await expect(saveWarmupPreset(file, "Name", daily.schedule)).rejects.toThrow()
    await rm(file, { recursive: true })
    await rm(path.join(path.dirname(file), "locks"), { recursive: true })
    await Bun.write(path.join(path.dirname(file), "locks"), "blocked")
    await expect(saveWarmupPreset(file, "Name", daily.schedule)).rejects.toThrow()
    expect(await readWarmupPresets(file)).toEqual([])
    await expect(saveWarmupPreset("relative.json", "Name", daily.schedule)).rejects.toThrow("absolute")
  }))

test("failed atomic preset publication preserves the existing library", () =>
  presetFixture(async (file) => {
    // The destination fits a filesystem component; the unique atomic temporary suffix does not.
    const target = path.join(path.dirname(file), `${"p".repeat(240)}.json`)
    const before = JSON.stringify({ presets: [{ name: "Existing", schedule: daily.schedule }] })
    await Bun.write(target, before)
    await expect(saveWarmupPreset(target, "New", weekly.schedule)).rejects.toThrow()
    expect(await Bun.file(target).text()).toBe(before)
  }))

test("preset menu actions dispatch independently of account Save", () => {
  const calls: string[] = []
  const options = accountOptions({
    account: daily,
    draft: draftFromAccount(daily),
    zone: "",
    timeZone: "UTC",
    utcOffset: "",
    onMode: () => undefined,
    onTimes: () => undefined,
    onSave: () => {
      calls.push("save")
    },
    onSavePreset: () => {
      calls.push("preset")
    },
    onLoadPreset: () => {
      calls.push("load")
    },
    onPause: () => undefined,
    onResume: () => undefined,
  })
  for (const value of ["savePreset", "loadPreset", "save"]) {
    const option = options.find((option) => option.value === value)
    expect(option?.title).toBe(value === "save" ? "Save" : value === "savePreset" ? "Save preset…" : "Load preset…")
    option?.onSelect?.(undefined!)
  }
  expect(calls).toEqual(["preset", "load", "save"])
})
