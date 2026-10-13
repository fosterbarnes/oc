import { describe, expect, test } from "bun:test"
import path from "node:path"
import { Schema } from "effect"
import { ProviderUsage } from "@opencode-ai/core/provider-usage"
import { canonicalAccountId, DEFAULT_ACCOUNT } from "../../src/provider/claude-code/accounts"
import { toQuotaWindows } from "../../src/provider/claude-code/cliEvents"
import {
  _resetUsageObservations,
  getUsageSnapshot,
  openaiAccountId,
  parseCodexQuotaHeaders,
  parseCodexRateLimitsEvent,
  recordObservation,
  reportUsageObservation,
  setUsagePublisher,
} from "../../src/provider/usage-observations"

describe("provider.usage.observations store", () => {
  test("merges windows and retains unknown siblings with original times", () => {
    _resetUsageObservations()
    try {
      recordObservation({
        providerID: "claude-code",
        accountID: "/home/user/.claude",
        observedAt: 1000,
        windows: [{ id: "five_hour", usedPercent: 10 }],
      })
      const stored = recordObservation({
        providerID: "claude-code",
        accountID: "/home/user/.claude",
        observedAt: 2000,
        windows: [{ id: "seven_day", usedPercent: 20 }],
      })
      expect(stored?.windows).toEqual([
        { id: "five_hour", usedPercent: 10, observedAt: 1000 },
        { id: "seven_day", usedPercent: 20, observedAt: 2000 },
      ])
      const updated = recordObservation({
        providerID: "claude-code",
        accountID: "/home/user/.claude",
        observedAt: 3000,
        windows: [{ id: "five_hour", usedPercent: 11 }],
      })
      expect(updated?.windows).toEqual([
        { id: "seven_day", usedPercent: 20, observedAt: 2000 },
        { id: "five_hour", usedPercent: 11, observedAt: 3000 },
      ])
    } finally {
      _resetUsageObservations()
    }
  })

  test("drops invalid windows and returns undefined when nothing valid arrives", () => {
    _resetUsageObservations()
    try {
      expect(
        recordObservation({
          providerID: "openai",
          accountID: "openai",
          observedAt: 1000,
          windows: [
            { id: "primary", usedPercent: Number.NaN },
            { id: "secondary", usedPercent: 101 },
            { id: "", usedPercent: 10 },
          ],
        }),
      ).toBeUndefined()
      expect(getUsageSnapshot()).toEqual([])
      expect(
        recordObservation({ providerID: "", accountID: "openai", observedAt: 1000, windows: [] }),
      ).toBeUndefined()
    } finally {
      _resetUsageObservations()
    }
  })

  test("snapshot sorts by provider then account", () => {
    _resetUsageObservations()
    try {
      recordObservation({ providerID: "openai", accountID: "b", observedAt: 1, windows: [{ id: "p", usedPercent: 1 }] })
      recordObservation({ providerID: "claude-code", accountID: "a", observedAt: 1, windows: [{ id: "f", usedPercent: 1 }] })
      expect(getUsageSnapshot().map((item) => item.providerID)).toEqual(["claude-code", "openai"])
    } finally {
      _resetUsageObservations()
    }
  })

  test("a late observation preserves newer windows but can fill an unknown sibling", () => {
    _resetUsageObservations()
    try {
      recordObservation({ providerID: "openai", accountID: "a", observedAt: 2_000,
        windows: [{ id: "primary", usedPercent: 20 }] })
      const late = recordObservation({ providerID: "openai", accountID: "a", observedAt: 1_000,
        windows: [{ id: "primary", usedPercent: 10 }, { id: "secondary", usedPercent: 5 }] })
      expect(late?.observedAt).toBe(2_000)
      expect(late?.windows).toEqual([
        { id: "primary", usedPercent: 20, observedAt: 2_000 },
        { id: "secondary", usedPercent: 5, observedAt: 1_000 },
      ])
    } finally {
      _resetUsageObservations()
    }
  })

  test("report forwards the stored snapshot and survives a throwing publisher", () => {
    _resetUsageObservations()
    const seen: unknown[] = []
    setUsagePublisher(() => {
      throw new Error("boom")
    })
    try {
      const stored = reportUsageObservation({
        providerID: "openai",
        accountID: "openai",
        observedAt: 1000,
        windows: [{ id: "primary", usedPercent: 50 }],
      })
      expect(stored?.windows).toHaveLength(1)
    } finally {
      setUsagePublisher(undefined)
      _resetUsageObservations()
    }
    setUsagePublisher((observation) => {
      seen.push(observation)
    })
    try {
      reportUsageObservation({
        providerID: "openai",
        accountID: "openai",
        observedAt: 1000,
        windows: [{ id: "primary", usedPercent: 50 }],
      })
      expect(seen).toHaveLength(1)
    } finally {
      setUsagePublisher(undefined)
      _resetUsageObservations()
    }
  })

  test("disposing an old publisher cannot clear the current service publisher", () => {
    _resetUsageObservations()
    const disposeOld = setUsagePublisher(() => undefined)
    const seen: string[] = []
    const disposeCurrent = setUsagePublisher((value) => seen.push(value.accountID))
    try {
      disposeOld()
      reportUsageObservation({ providerID: "openai", accountID: "a", observedAt: 100,
        windows: [{ id: "primary", usedPercent: 5 }] })
      expect(seen).toEqual(["a"])
      disposeCurrent()
      reportUsageObservation({ providerID: "openai", accountID: "b", observedAt: 100,
        windows: [{ id: "primary", usedPercent: 5 }] })
      expect(seen).toEqual(["a"])
    } finally {
      disposeCurrent()
      _resetUsageObservations()
    }
  })
})

describe("claude quota windows", () => {
  test("maps five_hour and seven_day utilization without rounding", () => {
    const windows = toQuotaWindows({
      status: "allowed",
      rateLimitType: "five_hour",
      utilization: 0.823,
      resetsAt: 1800000000,
    })
    expect(windows).toHaveLength(1)
    expect(windows[0]?.id).toBe("five_hour")
    expect(windows[0]?.usedPercent).toBeCloseTo(82.3, 10)
    expect(windows[0]?.resetMs).toBe(1800000000000)
    expect(toQuotaWindows({ status: "allowed", rateLimitType: "seven_day", utilization: 0 })).toEqual([
      { id: "seven_day", usedPercent: 0 },
    ])
  })

  test("status-only and model-scoped windows yield nothing", () => {
    expect(toQuotaWindows({ status: "allowed" })).toEqual([])
    expect(toQuotaWindows({ status: "rejected", rateLimitType: "seven_day_opus", utilization: 1 })).toEqual([])
    expect(toQuotaWindows({ overageStatus: "rejected", utilization: 0.5 })).toEqual([])
    expect(toQuotaWindows({ status: "allowed", rateLimitType: "five_hour", utilization: 1.5 })).toEqual([])
    expect(toQuotaWindows(null)).toEqual([])
  })

  test("canonical account is the slash-normalized resolved dir, never a basename", () => {
    const previous = process.env.CLAUDE_CONFIG_DIR
    process.env.CLAUDE_CONFIG_DIR = "/tmp/custom-claude"
    try {
      expect(canonicalAccountId(DEFAULT_ACCOUNT)).toBe(path.resolve("/tmp/custom-claude").replace(/\\/g, "/"))
    } finally {
      if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR
      else process.env.CLAUDE_CONFIG_DIR = previous
    }
    expect(canonicalAccountId("/home/user/.claudeSecond")).toBe(
      path.resolve("/home/user/.claudeSecond").replace(/\\/g, "/"),
    )
  })
})

describe("codex quota parsing", () => {
  test("reads primary and secondary headers without touching the body", () => {
    const headers = new Headers({
      "x-codex-primary-used-percent": "82.5",
      "x-codex-primary-window-minutes": "300",
      "x-codex-primary-reset-after-seconds": "60",
      "x-codex-secondary-used-percent": "10",
    })
    expect(parseCodexQuotaHeaders(headers, 1000)).toEqual([
      { id: "primary", usedPercent: 82.5, resetMs: 61000, minutes: 300 },
      { id: "secondary", usedPercent: 10 },
    ])
  })

  test("accepts lowercase record headers and drops malformed values", () => {
    expect(
      parseCodexQuotaHeaders(
        { "X-Codex-Primary-Used-Percent": "101", "x-codex-secondary-used-percent": "nan" },
        1000,
      ),
    ).toEqual([])
    expect(parseCodexQuotaHeaders({}, 1000)).toEqual([])
    expect(parseCodexQuotaHeaders({ "x-codex-primary-used-percent": "12.5garbage" }, 1000)).toEqual([])
    expect(parseCodexQuotaHeaders({ "x-codex-primary-used-percent": " " }, 1000)).toEqual([])
  })

  test("parses codex.rate_limits events and ignores other frames", () => {
    expect(
      parseCodexRateLimitsEvent(
        {
          type: "codex.rate_limits",
          rate_limits: {
            primary: { used_percent: 50, window_minutes: 300, reset_at: 1_800_000_000 },
            secondary: { used_percent: 5, window_minutes: 10080 },
          },
        },
        1000,
      ),
    ).toEqual([
      { id: "primary", usedPercent: 50, resetMs: 1_800_000_000_000, minutes: 300 },
      { id: "secondary", usedPercent: 5, minutes: 10080 },
    ])
    expect(parseCodexRateLimitsEvent({ type: "response.completed" }, 1000)).toEqual([])
    expect(parseCodexRateLimitsEvent(undefined, 1000)).toEqual([])
    expect(parseCodexRateLimitsEvent({ type: "codex.rate_limits", metered_limit_name: "codex_other",
      rate_limits: { primary: { used_percent: 95 } } }, 1000)).toEqual([])
  })

  test("openai account falls back to the provider identity", () => {
    expect(openaiAccountId("acc-123")).toBe("acc-123")
    expect(openaiAccountId(undefined)).toBe("openai")
    expect(openaiAccountId("")).toBe("openai")
  })
})

describe("provider.usage contract", () => {
  test("event payload properties directly equal Info, no wrapper", () => {
    const sample = {
      providerID: "openai",
      accountID: "acc-1",
      observedAt: 1000,
      windows: [{ id: "primary", usedPercent: 50, observedAt: 1000 }],
    }
    expect(Schema.decodeUnknownSync(ProviderUsage.Info)(sample)).toEqual(sample)
    const decoded = Schema.decodeUnknownSync(ProviderUsage.Event.Updated)({
      id: "evt_contract",
      type: "provider.usage.updated",
      data: sample,
    })
    expect(decoded.data).toEqual(sample)
  })

  test("recorded snapshots decode as Info", () => {
    _resetUsageObservations()
    try {
      const stored = recordObservation({
        providerID: "claude-code",
        accountID: "/home/user/.claude",
        observedAt: 1000,
        windows: [{ id: "five_hour", usedPercent: 10, resetMs: 2000 }],
      })
      if (!stored) throw new Error("observation was not recorded")
      expect(Schema.decodeUnknownSync(ProviderUsage.Info)(stored)).toEqual(stored)
      expect(Schema.decodeUnknownSync(Schema.Array(ProviderUsage.Info))(getUsageSnapshot())).toEqual(
        getUsageSnapshot(),
      )
    } finally {
      _resetUsageObservations()
    }
  })
})
