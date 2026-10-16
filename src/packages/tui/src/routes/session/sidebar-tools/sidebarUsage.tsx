import { For, Show, createEffect, createSignal, onCleanup } from "solid-js"
import type { BoxRenderable } from "@opentui/core"
import os from "node:os"
import path from "node:path"
import type { ProviderUsage } from "@opencode-ai/core/provider-usage"
import { useSync } from "../../../context/sync"
import { useEvent } from "../../../context/event"
import { useSDK } from "../../../context/sdk"
import { useKV } from "../../../context/kv"
import { useTheme } from "../../../context/theme"
import { useLocal } from "../../../context/local"
import { SidebarToggle } from "../../../feature-plugins/sidebar/toggle"
import { DialogPrompt } from "../../../ui/dialog-prompt"
import { DialogSelect, type DialogSelectOption, type DialogSelectProps } from "../../../ui/dialog-select"
import { useDialog } from "../../../ui/dialog"
import { useToast } from "../../../ui/toast"
import { Locale } from "../../../util/locale"
import {
  saveUserUsageProviders,
  saveUserUsageSpacing,
  saveUserUsageSubscriptions,
  type SidebarSettings,
} from "./settings.js"
import { readCursorSessionToken, writeCursorSessionToken } from "./cursorToken.js"
import {
  parseUsageDate,
  usageCalendarDay,
  usageCalendarEvents,
  usageCalendarStrip,
  type UsageSubscription,
} from "./usage/calendar"
import {
  claudeConfigDirId,
  probeClaudeCodePool,
  probeClaudeCodeUsage,
  projectClaudeUsage,
  type ClaudeCodeUsage,
} from "./usage/claude"
import { cursorSessionCookie, probeCursorUsage, type CursorUsage } from "./usage/cursor"
import {
  compactResetDate,
  fullResetDate,
  formatUsagePercent,
  formatUsageRows,
  formatClaudeUsageRows,
  usageColumns,
  orderUsageWindows,
  windowLabel,
  windowName,
} from "./usage/format"
import {
  applyClaudeObservation,
  applyOpenAIObservation,
  mergeClaudeProbe,
  mergeOpenAIProbe,
  usageReadingDetails,
} from "./usage/live"
import {
  probeOpenAIUsage,
  probeOpenCodeGoUsage,
  probeOpenRouterUsage,
  type OpenAIUsage,
  type OpenCodeGoUsage,
  type OpenRouterUsage,
} from "./usage/probes"
import { usageProviderForModel, USAGE_PROVIDER_OPTIONS, type UsageProviderId } from "./usage/providers"
import { createUsageRefresh } from "./usage/refresh"
import {
  updateUsageSnapshot,
  usageWindowStale,
  type UsageWindow,
  type UsageSnapshot,
} from "./usage/snapshot"

// Sidebar usage section: provider readings, refresh scheduling, the rows view, and the Usage menu,
// settings, and calendar dialogs. Call inside SidebarTools; timers and listeners end with it.
export function createSidebarUsage(input: {
  // The session the sidebar currently tracks (follows session switches before props settle).
  sessionID: () => string
  // The routed session, used to attribute an idle-less session's model to its provider.
  routeSessionID: () => string
  settings: () => SidebarSettings
  hovered: () => string | undefined
  setHovered: (value?: string) => void
  hoverColor: string
}) {
  const sync = useSync()
  const event = useEvent()
  const sdk = useSDK()
  const kv = useKV()
  const { theme } = useTheme()
  const local = useLocal()
  const dialog = useDialog()
  const toast = useToast()
  const { hovered, setHovered, hoverColor } = input
  const [usage, setUsage] = createSignal<UsageSnapshot<OpenAIUsage>>({ ok: false })
  const [goUsage, setGoUsage] = createSignal<UsageSnapshot<OpenCodeGoUsage>>({ ok: false })
  const [openRouterUsage, setOpenRouterUsage] = createSignal<UsageSnapshot<OpenRouterUsage>>({ ok: false })
  const [cursorUsage, setCursorUsage] = createSignal<UsageSnapshot<CursorUsage>>({ ok: false })
  const [claudeCodeUsage, setClaudeCodeUsage] = createSignal<UsageSnapshot<ClaudeCodeUsage>>({ ok: false })
  // Pool account this session runs on (config dir name), marked with `*` in the Claude rows.
  const [activeClaudeAccount, setActiveClaudeAccount] = createSignal<string>()
  // Sidebar usage shows used or remaining percent for every provider; toggled from the Usage menu.
  const [showRemaining, setShowRemaining] = createSignal(false)
  const [usageWidth, setUsageWidth] = createSignal(0)
  let usageBox: BoxRenderable | undefined
  const [usageProviders, setUsageProviders] = createSignal<UsageProviderId[]>([...input.settings().usageProviders])
  const [usageSpacing, setUsageSpacing] = createSignal(input.settings().usageSpacing)
  const [usageSubscriptions, setUsageSubscriptions] = createSignal([...input.settings().usageSubscriptions])
  // Same kv key as the sidebar section state in feature-plugins/sidebar/open.ts.
  const usageOpen = () => kv.get("sidebar_open_usage", true)
  const setUsageOpen = (next: boolean) => kv.set("sidebar_open_usage", next)
  let cursorSessionToken = readCursorSessionToken(os.homedir())
  const usageObservations = new Map<string, ProviderUsage.Info>()
  const [usageNow, setUsageNow] = createSignal(Date.now())
  const usageAbort = new AbortController()
  let usageScheduler: ReturnType<typeof createUsageRefresh>

  const claudeDirectories = () => {
    const accounts = sync.data.config.provider?.["claude-code"]?.options?.accounts
    const dirs = Array.isArray(accounts) ? accounts.filter((dir): dir is string => typeof dir === "string") : []
    return (dirs.length ? dirs : [process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude")])
      .map((dir) => claudeConfigDirId(dir.replace(/^~(?=$|[\\/])/, os.homedir())))
  }
  const claudeSeed = (): UsageSnapshot<ClaudeCodeUsage> => {
    const dirs = claudeDirectories()
    const unknown = () => ({ usedPercent: null, resetAt: null, resetMs: null, minutes: null })
    return {
      ok: true,
      accountID: dirs[0],
      fetchedAt: 0,
      source: "cache",
      fiveHour: unknown(),
      weekly: unknown(),
      ...(dirs.length > 1 ? { accounts: dirs.map((id) => ({
        id,
        name: path.basename(id).replace(/^\./, ""),
        usage: { ok: false as const },
      })) } : {}),
    }
  }
  const refreshActiveClaudeAccount = async () => {
    const selectedSession = input.sessionID()
    const pool = await sdk.claudeAccount.state(selectedSession).catch(() => undefined)
    if (usageAbort.signal.aborted || selectedSession !== input.sessionID()) return
    const current = pool?.find((account) => account.current)
    setActiveClaudeAccount(current ? claudeConfigDirId(current.id === "default"
      ? process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude") : current.id) : undefined)
  }
  const observeUsage = (observation: ProviderUsage.Info, fromSnapshot = false) => {
    const key = `${observation.providerID}:${observation.accountID}`
    const previous = usageObservations.get(key)
    if (previous && previous.observedAt > observation.observedAt) return
    usageObservations.set(key, observation)
    if (observation.providerID === "openai" && (!fromSnapshot || usage().accountID === observation.accountID))
      setUsage((previous) => applyOpenAIObservation(previous, observation))
    if (observation.providerID === "claude-code") {
      setClaudeCodeUsage((previous) => applyClaudeObservation(previous.ok ? previous : claudeSeed(), observation))
      void refreshActiveClaudeAccount()
    }
    setUsageNow(Date.now())
  }
  const readObservedUsage = async () => {
    const observations = await sdk.providerUsage.state().catch(() => undefined)
    if (usageAbort.signal.aborted || !observations) return
    observations.forEach((observation) => observeUsage(observation, true))
  }
  const refreshUsage = async (provider: UsageProviderId) => {
    if (usageAbort.signal.aborted) return { ok: true, metadata: undefined }
    const startedAt = Date.now()
    const options = { signal: usageAbort.signal }
    if (provider === "openai") {
      const next = await probeOpenAIUsage(options)
      if (!usageAbort.signal.aborted) setUsage((previous) => {
        const merged = mergeOpenAIProbe(previous, next, startedAt, Date.now())
        const observation = next.accountID
          ? usageObservations.get(`openai:${next.accountID}`) : undefined
        return observation ? applyOpenAIObservation(merged, observation) : merged
      })
      return next
    }
    if (provider === "opencode-go") {
      const next = await probeOpenCodeGoUsage(options)
      if (!usageAbort.signal.aborted) setGoUsage((previous) => updateUsageSnapshot(previous, next, Date.now()))
      return next
    }
    if (provider === "openrouter") {
      const next = await probeOpenRouterUsage(options)
      if (!usageAbort.signal.aborted) setOpenRouterUsage((previous) => updateUsageSnapshot(previous, next, Date.now()))
      return next
    }
    if (provider === "claude-code") {
      const dirs = claudeDirectories()
      const selectedSession = input.sessionID()
      const [next, pool] = await Promise.all([
        dirs.length > 1 ? probeClaudeCodePool(dirs, options) : probeClaudeCodeUsage({
          ...options, claudeCredentialsPath: path.join(dirs[0], ".credentials.json"),
        }),
        dirs.length > 1 ? sdk.claudeAccount.state(selectedSession).catch(() => undefined) : undefined,
      ])
      if (!usageAbort.signal.aborted && JSON.stringify(dirs) === JSON.stringify(claudeDirectories())) {
        setClaudeCodeUsage((previous) => {
          const merged = mergeClaudeProbe(previous, next, startedAt, Date.now())
          return dirs.reduce((snapshot, dir) => {
            const observation = usageObservations.get(`claude-code:${dir}`)
            return observation ? applyClaudeObservation(snapshot.ok ? snapshot : claudeSeed(), observation) : snapshot
          }, merged)
        })
        if (input.sessionID() === selectedSession) {
          const current = pool?.find((account) => account.current)
          setActiveClaudeAccount(current ? claudeConfigDirId(current.id === "default"
            ? process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude") : current.id) : undefined)
        }
      }
      return { ok: next.ok && next.source === "live" && !next.metadata?.status, metadata: next.metadata }
    }
    const next = await probeCursorUsage({ ...options, cursorSessionToken })
    if (!usageAbort.signal.aborted)
      setCursorUsage((previous) => updateUsageSnapshot(previous, next, Date.now()))
    return next
  }
  const refreshOldUsage = () => {
    const snapshots = {
      openai: usage(),
      "opencode-go": goUsage(),
      openrouter: openRouterUsage(),
      cursor: cursorUsage(),
      "claude-code": claudeCodeUsage(),
    }
    usageScheduler.request(usageProviders().filter((provider) => Date.now() - (snapshots[provider].fetchedAt ?? 0) > 60_000))
  }
  // Account rows use their own snapshot; cached siblings are marked per window.
  const usageColor = (snapshot: UsageSnapshot<{ ok: boolean }>) =>
    snapshot.stale || snapshot.source === "cache" || usageNow() - (snapshot.fetchedAt ?? 0) > 300_000
      ? theme.textMuted : theme.text
  usageScheduler = createUsageRefresh({
    providers: usageProviders,
    active: (provider) => Object.entries(sync.data.session_status).some(([id, status]) => {
      if (status.type === "idle") return false
      const model = sync.data.message[id]?.findLast((message) => message.role === "assistant")
      return usageProviderForModel(model?.role === "assistant" ? model.providerID :
        id === input.routeSessionID() ? local.model.current()?.providerID ?? "" : "") === provider
    }),
    refresh: async (provider) => {
      const result = await refreshUsage(provider)
      return { ok: result.ok, retryAt: result.metadata?.retryAt }
    },
  })
  usageScheduler.request()
  void readObservedUsage()
  onCleanup(sdk.onReconnect(() => {
    void readObservedUsage()
    usageScheduler.request()
  }))
  createEffect(() => {
    usageProviders()
    Object.values(sync.data.session_status).forEach((status) => status.type)
    usageScheduler.reconcile()
  })
  createEffect(() => {
    const dirs = claudeDirectories()
    setClaudeCodeUsage((previous) => {
      const ids = previous.ok ? previous.accounts?.map((account) => account.id) ?? [previous.accountID] : []
      if (JSON.stringify(ids) === JSON.stringify(dirs)) return previous
      return [...usageObservations.values()].reduce(applyClaudeObservation, claudeSeed())
    })
    if (usageProviders().includes("claude-code")) usageScheduler.request(["claude-code"])
    void refreshActiveClaudeAccount()
  })

  const codexWindows = (): { weekly?: UsageWindow; monthly?: UsageWindow; reauthenticate: boolean } => {
    const snapshot = usage()
    if (!snapshot.ok)
      return { weekly: undefined, monthly: undefined, reauthenticate: snapshot.reason === "reauthenticate" }
    const [shortest, longest] = orderUsageWindows([snapshot.primary, snapshot.secondary])
    return { weekly: shortest, monthly: longest, reauthenticate: false }
  }
  const promptCursorToken = () =>
    dialog.replace(() => (
      <DialogPrompt
        title="Connect Cursor usage"
        description={() => (
          <text>
            1. Open cursor.com in a browser while logged in (or stay signed into the Cursor app). 2. If the app is
            signed in, cancel and wait: the sidebar will retry from the app. 3. Otherwise: in the browser, open
            DevTools, Application (or Storage), Cookies, cursor.com, copy the value of WorkosCursorSessionToken. 4.
            Paste that value here (a long user::eyJ... string is fine).
          </text>
        )}
        placeholder="user::eyJ..."
        onConfirm={(value) => {
          const trimmed = value.trim()
          if (!cursorSessionCookie(trimmed)) {
            toast.show({ variant: "error", message: "That does not look like a Cursor session cookie" })
            return
          }
          writeCursorSessionToken(os.homedir(), trimmed)
          cursorSessionToken = trimmed
          toast.show({ variant: "success", message: "Cursor usage connected" })
          dialog.clear()
          usageScheduler.request()
        }}
        onCancel={() => dialog.clear()}
      />
    ))
  const usageRows = () => {
    const codex = codexWindows()
    const codexHasData = Boolean(codex.weekly || codex.monthly)
    const goSnapshot = goUsage()
    const goOk = goSnapshot.ok ? goSnapshot : undefined
    const orSnapshot = openRouterUsage()
    const orOk = orSnapshot.ok ? orSnapshot : undefined
    const orValue = orOk ? formatUsagePercent(orOk.usedPercent, showRemaining()) +
      (orSnapshot.stale || usageNow() - (orSnapshot.fetchedAt ?? 0) > 300_000 ? "*" : "") : "unavailable"
    const cursorSnapshot = cursorUsage()
    const cursorOk = cursorSnapshot.ok ? cursorSnapshot.monthly : undefined
    const cursorNeedsToken =
      !cursorSnapshot.ok && (cursorSnapshot.reason === "need-token" || cursorSnapshot.reason === "reauthenticate")
    const claudeSnapshot = claudeCodeUsage()
    // Expire known windows against the local minute clock; no new request, no timestamp refresh.
    const claudeProjected = claudeSnapshot.ok ? projectClaudeUsage(claudeSnapshot, usageNow()) : claudeSnapshot
    const claudeOk = claudeProjected.ok ? claudeProjected : undefined
    const cell = (window: UsageWindow, snapshot: UsageSnapshot<{ ok: boolean }>, suffix = windowLabel(window.minutes)) => ({
      usedPercent: window.usedPercent,
      resetAt: window.resetAt,
      suffix: suffix + (usageWindowStale(window, snapshot, usageNow()) ? "*" : ""),
    })
    const providers = usageProviders()
    // Laid out twice: the first pass finds each window slot's widest date start, flipped clock, and flipped
    // day; the second shares them across providers so later-slot dates end in one column.
    const layout = (shared?: ReturnType<typeof usageColumns>) => {
      const rows = (
        show: unknown,
        options: Omit<Parameters<typeof formatUsageRows>[0], "remaining" | "width" | "columns" | "clocks" | "days">,
      ) =>
        show
          ? formatUsageRows({
              ...options,
              remaining: showRemaining(),
              width: usageWidth(),
              columns: shared?.starts,
              clocks: shared?.clocks,
              days: shared?.days,
            })
          : []
      return {
        codex: rows(providers.includes("openai") && codexHasData, {
          label: "Codex :",
          windows: [codex.weekly, codex.monthly].flatMap((window) => (window ? [cell(window, usage())] : [])),
        }),
        claude:
          providers.includes("claude-code") && claudeOk
            ? formatClaudeUsageRows(
                claudeOk,
                showRemaining(),
                usageWidth(),
                shared?.starts,
                shared?.clocks,
                shared?.days,
                 activeClaudeAccount(),
                 usageNow(),
              )
            : [],
        cursor: rows(providers.includes("cursor") && cursorOk, {
          label: "Cursor:",
          windows: cursorOk
            ? [
                cell(cursorOk, cursorSnapshot, "m"),
                { usedPercent: cursorOk.apiUsedPercent, resetAt: "", suffix: " api" +
                  (usageWindowStale(cursorOk, cursorSnapshot, usageNow()) ? "*" : "") },
              ]
            : [],
        }),
        go: rows(providers.includes("opencode-go") && goOk, {
          label: "OpenCode Go:",
          windows: goOk ? [goOk.weekly, goOk.monthly].flatMap((window) => (window ? [cell(window, goSnapshot)] : [])) : [],
        }),
      }
    }
    const rows = layout(usageColumns(Object.values(layout()).flat()))
    const aligned = (
      label: string,
      snapshot: UsageSnapshot<{ ok: boolean }>,
      rows: (ReturnType<typeof formatUsageRows>[number] & {
        label?: string; spaced?: boolean; snapshot?: UsageSnapshot<{ ok: boolean }>
      })[],
    ) => (
      <For each={rows}>
        {(row) => {
          const rowLabel = row.label ?? label
          return (
            <box flexDirection="column" marginTop={"spaced" in row && row.spaced && usageSpacing() ? 1 : 0}>
              <text fg={theme.textMuted} wrapMode="none">
                <span style={{ fg: usageColor(row.snapshot ?? snapshot) }}>{row.usage.startsWith(rowLabel) ? rowLabel : ""}</span>
                {row.usage.startsWith(rowLabel) ? row.usage.slice(rowLabel.length) : row.usage}
              </text>
              <text fg={theme.textMuted} wrapMode="none">
                {row.reset}
              </text>
            </box>
          )
        }}
      </For>
    )
    return (
      <box
        flexDirection="column"
        ref={(el) => (usageBox = el)}
        onSizeChange={() => setUsageWidth(usageBox?.width ?? 0)}
        onMouseOver={() => setHovered("usage")}
        onMouseOut={() => setHovered()}
        onMouseUp={(event) => {
          if (event.button === 0) openUsageMenu()
        }}
      >
        <box flexDirection="row" gap={1}>
          {/* Stops propagation on mouseUp so the outer box does not open the usage menu. */}
          <SidebarToggle
            open={usageOpen()}
            fg={hovered() === "usage" ? hoverColor : theme.text}
            onMouseDown={(event) => {
              event.stopPropagation()
              if (event.button === 0) setUsageOpen(!usageOpen())
            }}
            onMouseUp={(event) => event.stopPropagation()}
          />
          <text fg={hovered() === "usage" ? hoverColor : theme.text}>Usage:</text>
        </box>
        <Show when={usageOpen()}>
          {/* Each visible provider is one flex child, so gap spaces only providers that render. */}
          <box flexDirection="column" gap={usageSpacing() ? 1 : 0}>
            <Show when={usageProviders().length === 0}>
              <box flexDirection="row" gap={1}>
                <text fg={theme.textMuted}>No usage providers selected</text>
              </box>
            </Show>
            <Show when={usageProviders().includes("openai")}>
              <box flexDirection="column">
                <Show
                  when={codexHasData}
                  fallback={
                    <>
                      <box flexDirection="row" gap={1}>
                        <text fg={usageColor(usage())}>Codex :</text>
                        <text fg={theme.textMuted}>{codex.reauthenticate ? "run /connect" : "unavailable"}</text>
                      </box>
                      <box flexDirection="row" gap={1}>
                        <text fg={theme.textMuted}>
                          {codex.reauthenticate ? "OpenAI auth required" : "unavailable"}
                        </text>
                      </box>
                    </>
                  }
                >
                  {aligned("Codex :", usage(), rows.codex)}
                </Show>
              </box>
            </Show>
            <Show when={usageProviders().includes("claude-code")}>
              <box flexDirection="column">
                <Show
                  when={claudeOk}
                  fallback={
                    <>
                      <box flexDirection="row" gap={1}>
                        <text fg={usageColor(claudeSnapshot)}>Claude:</text>
                        <text fg={theme.textMuted}>unavailable</text>
                      </box>
                      <box flexDirection="row" gap={1}>
                        <text fg={theme.textMuted}>unavailable</text>
                      </box>
                    </>
                  }
                >
                  {aligned("Claude:", claudeProjected, rows.claude)}
                </Show>
              </box>
            </Show>
            <Show when={usageProviders().includes("cursor")}>
              <box flexDirection="column">
                <Show
                  when={cursorOk}
                  fallback={
                    <>
                      <box flexDirection="row" gap={1}>
                        <text fg={usageColor(cursorSnapshot)}>Cursor:</text>
                        <text fg={theme.textMuted}>{cursorNeedsToken ? "sign in" : "unavailable"}</text>
                      </box>
                      <box flexDirection="row" gap={1}>
                        <text fg={theme.textMuted}>
                          {cursorOk?.resetAt || (cursorNeedsToken ? "Cursor auth required" : "unavailable")}
                        </text>
                      </box>
                    </>
                  }
                >
                  {aligned("Cursor:", cursorSnapshot, rows.cursor)}
                </Show>
                <Show when={!cursorSnapshot.ok && cursorSnapshot.reason === "reauthenticate"}>
                  <box flexDirection="row" gap={1}>
                    <text fg={theme.textMuted}>open Usage to paste a new cookie</text>
                  </box>
                </Show>
              </box>
            </Show>
            <Show when={usageProviders().includes("opencode-go")}>
              <box flexDirection="column">
                <Show
                  when={goOk}
                  fallback={
                    <>
                      <box flexDirection="row" gap={1}>
                        <text fg={usageColor(goSnapshot)}>OpenCode Go:</text>
                        <text fg={theme.textMuted}>unavailable</text>
                      </box>
                      <box flexDirection="row" gap={1}>
                        <text fg={theme.textMuted}>unavailable</text>
                      </box>
                    </>
                  }
                >
                  {aligned("OpenCode Go:", goSnapshot, rows.go)}
                </Show>
              </box>
            </Show>
            <Show when={usageProviders().includes("openrouter")}>
              <box flexDirection="column">
                <box flexDirection="row" gap={1}>
                  <text fg={usageColor(orSnapshot)}>OpenRouter:</text>
                  <text fg={theme.textMuted}>{orValue}</text>
                </box>
                <Show when={orOk}>
                  <box flexDirection="row" gap={1}>
                    <text fg={theme.textMuted}>{`$${orOk?.usedUsd.toFixed(2)} / $${orOk?.limitUsd.toFixed(2)}`}</text>
                  </box>
                </Show>
              </box>
            </Show>
          </box>
        </Show>
      </box>
    )
  }

  const selectUsageSettings = () => {
    const selected = new Set(usageProviders())
    const dialogProps = {
      title: "Usage providers",
      options: USAGE_PROVIDER_OPTIONS.map((provider) => ({
        title: provider.title,
        value: provider.id,
        footer: selected.has(provider.id) ? "visible" : "hidden",
        gutter: selected.has(provider.id) ? () => <text fg={theme.success}>:white_check_mark:</text> : undefined,
      })),
      onSelect: (option: { value: UsageProviderId }) => {
        const next = selected.has(option.value)
          ? usageProviders().filter((id) => id !== option.value)
          : [
              ...USAGE_PROVIDER_OPTIONS.map((provider) => provider.id).filter(
                (id) => selected.has(id) || id === option.value,
              ),
            ]
        input.settings().usageProviders = next
        saveUserUsageProviders(os.homedir(), next)
        setUsageProviders(next)
        usageScheduler.request()
        selectUsageSettings()
      },
    } as unknown as DialogSelectProps<UsageProviderId>
    dialog.replace(() => <DialogSelect {...dialogProps} />)
  }
  const openUsageSettings = () => setTimeout(selectUsageSettings, 100)

  const usageMenuOptions = () => {
    const nowMs = usageNow()
    const reset = (resetMs: number | null) =>
      resetMs === null ? "Reset date unavailable" : fullResetDate(resetMs, nowMs)
    const row = (category: string, name: string, used: number | null, details: string[]) => ({
      category,
      inert: true,
      title: used === null ? `${name}: Unavailable` :
        `${name}: ${formatUsagePercent(used)} used, ${formatUsagePercent(used, true)} remaining`,
      details,
    })
    const unavailable = (category: string) => ({ category, title: "Unavailable", inert: true })
    const signIn = (category: string, detail: string) => ({ category, title: "Sign in required", details: [detail] })
    const providerRows = (id: UsageProviderId, category: string): Omit<DialogSelectOption<string>, "value">[] => {
      if (id === "openai") {
        const codex = codexWindows()
        if (codex.reauthenticate) return [signIn(category, "Run /connect")]
        const windows = [codex.weekly, codex.monthly].filter((window) => window !== undefined)
        if (!windows.length) return [unavailable(category)]
        return windows.map((window) =>
          row(category, windowName(window.minutes) || "Usage", window.usedPercent,
            [reset(window.resetMs), ...usageReadingDetails(window, usage(), nowMs)]),
        )
      }
      if (id === "opencode-go") {
        const snapshot = goUsage()
        if (!snapshot.ok) return [unavailable(category)]
        return [snapshot.weekly, snapshot.monthly]
          .filter((window) => window !== null)
          .map((window) => row(category, windowName(window.minutes), window.usedPercent,
            [reset(window.resetMs), ...usageReadingDetails(window, snapshot, nowMs)]))
      }
      if (id === "openrouter") {
        const snapshot = openRouterUsage()
        if (!snapshot.ok) return [unavailable(category)]
        return [
          row(category, "Credit", snapshot.usedPercent, [
             `$${snapshot.usedUsd.toFixed(2)} of $${snapshot.limitUsd.toFixed(2)} used`,
             ...usageReadingDetails({ usedPercent: snapshot.usedPercent, resetAt: null, resetMs: null, minutes: null },
               snapshot, nowMs),
          ]),
        ]
      }
      if (id === "cursor") {
        const snapshot = cursorUsage()
        if (!snapshot.ok) {
          const needsToken = snapshot.reason === "need-token" || snapshot.reason === "reauthenticate"
          if (!needsToken) return [unavailable(category)]
          return [
            { ...signIn(category, "Select to paste a Cursor session cookie"), onSelect: () => promptCursorToken() },
          ]
        }
        const monthly = snapshot.monthly
        const source = snapshot.metadata?.accountSource
        const login = source === "desktop" ? ["Meter login: Cursor desktop app"] :
          source === "cookie" ? ["Meter login: separately connected cookie"] : []
        return [
          row(category, "Monthly", monthly.usedPercent,
            [reset(monthly.resetMs), ...usageReadingDetails(monthly, snapshot, nowMs), ...login]),
          row(category, "API", monthly.apiUsedPercent,
            [reset(monthly.resetMs), ...usageReadingDetails(monthly, snapshot, nowMs), ...login]),
        ]
      }
      const claudeDetail = (window: UsageWindow, snapshot: ClaudeCodeUsage): string[] => {
        const details = usageReadingDetails(window, snapshot, nowMs)
        if (window.resetMs !== null) {
          const base = reset(window.resetMs)
          return [base, ...details]
        }
        if (window.expired) return details
        if (window.usedPercent !== null) return details
        return ["Reset date unavailable"]
      }
      const claudeRows = (usage: ClaudeCodeUsage, group: string) =>
        usage.ok
          ? [
              row(group, "5-hour", usage.fiveHour.usedPercent, claudeDetail(usage.fiveHour, usage)),
              row(group, "Weekly", usage.weekly.usedPercent, claudeDetail(usage.weekly, usage)),
            ]
          : usage.reason === "signed-out"
            ? [{ category: group, title: "Not signed in", inert: true }]
            : usage.reason === "expired"
              ? [
                  {
                    category: group,
                    title: "Login expired",
                    details: ["Use this account in Claude Code once"],
                    inert: true,
                  },
                ]
              : [unavailable(group)]
      const rawClaude = claudeCodeUsage()
      const snapshot = rawClaude.ok ? projectClaudeUsage(rawClaude, nowMs) : rawClaude
      // Pooled logins each get their own group so an unreadable account still shows up.
      if (snapshot.ok && snapshot.accounts)
        return snapshot.accounts.flatMap((account) => claudeRows(account.usage, `${category} (${account.name})`))
      return claudeRows(snapshot, category)
    }
    const providers = usageProviders().flatMap((id) => USAGE_PROVIDER_OPTIONS.filter((item) => item.id === id))
    // Actions lead so they are visible without scrolling past every provider's rows.
    const rows = [
      { category: "Calendar", title: "Usage calendar", onSelect: () => openUsageCalendar() },
      {
        category: "Settings",
        title: showRemaining() ? "Toggle: % remaining" : "Toggle: % used",
        onSelect: () => {
          setShowRemaining((value) => !value)
          selectUsageMenu()
        },
      },
      {
        category: "Settings",
        title: usageSpacing() ? "Toggle: provider spacing on" : "Toggle: provider spacing off",
        onSelect: () => {
          const next = !usageSpacing()
          input.settings().usageSpacing = next
          saveUserUsageSpacing(os.homedir(), next)
          setUsageSpacing(next)
          selectUsageMenu()
        },
      },
      { category: "Settings", title: "Configure usage providers", onSelect: () => openUsageSettings() },
      ...providers.flatMap((provider) => providerRows(provider.id, provider.title)),
    ]
    // Values must be unique per row: identical titles such as "Weekly: 0% used" appear under several providers.
    return rows.map((option) => ({ ...option, value: `${option.category}: ${option.title}` }))
  }
  const selectUsageMenu = () => {
    usageScheduler.request()
    dialog.replace(() => <DialogSelect title="Usage" options={usageMenuOptions()} preserveSelection />)
  }
  const openUsageMenu = () => setTimeout(selectUsageMenu, 100)

  const saveUsageSubscriptions = (next: UsageSubscription[]) => {
    input.settings().usageSubscriptions = next
    saveUserUsageSubscriptions(os.homedir(), next)
    setUsageSubscriptions(next)
    selectUsageCalendar()
  }
  const promptSubscriptionLabel = () =>
    dialog.replace(() => (
      <DialogPrompt
        title="Add subscription date"
        description={() => <text>Name the subscription, such as Claude Max (work).</text>}
        placeholder="Claude Max"
        onConfirm={(value) => {
          const label = value.trim()
          if (!label) {
            toast.show({ variant: "error", message: "Enter a subscription name." })
            return
          }
          setTimeout(() => promptSubscriptionDate(label), 100)
        }}
      />
    ), undefined, { back: selectUsageCalendar })
  const promptSubscriptionDate = (label: string) =>
    dialog.replace(() => (
      <DialogPrompt
        title={`${label}: date`}
        description={() => (
          <text>Enter a day of the month (1-31) for a monthly renewal, or an end date as YYYY-MM-DD.</text>
        )}
        placeholder="12 or 2026-11-12"
        onConfirm={(value) => {
          const text = value.trim()
          const day = /^\d{1,2}$/.test(text) ? Number(text) : 0
          if (day >= 1 && day <= 31) {
            saveUsageSubscriptions([...usageSubscriptions(), { label, renewDay: day }])
            return
          }
          if (parseUsageDate(text) !== undefined) {
            saveUsageSubscriptions([...usageSubscriptions(), { label, endsOn: text }])
            return
          }
          toast.show({ variant: "error", message: "Enter a day from 1 to 31, or a date as YYYY-MM-DD." })
        }}
      />
    ), undefined, { back: promptSubscriptionLabel })

  const usageCalendarItems = () => usageCalendarEvents({
    providers: usageProviders(),
    openai: usage(),
    cursor: cursorUsage(),
    go: goUsage(),
    claude: claudeCodeUsage(),
    subscriptions: usageSubscriptions(),
  }, usageNow())
  const usageCalendarOptions = () => {
    const nowMs = usageNow()
    const events = usageCalendarItems()
    const percent = (used: number | null, stale: boolean) =>
      used === null ? "" :
        `, ${formatUsagePercent(used, showRemaining())} ${showRemaining() ? "remaining" : "used"}${stale ? "*" : ""}`
    const agenda = events.map((event) => ({
      category: usageCalendarDay(event.atMs, nowMs),
      inert: true,
      // Window resets lead with their clock; subscription dates are whole days.
      title: event.allDay ? event.title :
        `${compactResetDate(new Date(event.atMs)).split(" ")[1].padEnd(8)} ${event.title}${percent(event.usedPercent, event.stale)}`,
      details: [event.allDay
        ? Locale.format(event.atMs, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
        : fullResetDate(event.atMs, nowMs)],
    }))
    const subscriptions = usageSubscriptions().map((subscription, index) => ({
      category: "Subscription dates",
      title: "renewDay" in subscription
        ? `${subscription.label}: renews monthly on day ${subscription.renewDay}`
        : `${subscription.label}: ends ${subscription.endsOn}`,
      details: ["Select to remove"],
      onSelect: () => saveUsageSubscriptions(usageSubscriptions().filter((_, item) => item !== index)),
    }))
    const rows = [
      { category: "Subscription dates", title: "Add subscription date...", onSelect: () => promptSubscriptionLabel() },
      ...subscriptions,
      ...(agenda.length ? agenda : [{ category: "Today", title: "No upcoming resets or subscription dates", inert: true }]),
    ]
    // Index keeps values unique: two rows can share a day and a title.
    return rows.map((option, index) => ({ ...option, value: `${index}: ${option.category}: ${option.title}` }))
  }
  // Options and strip are read inside the dialog's JSX so they update as fresh usage readings arrive.
  const selectUsageCalendar = () => {
    usageScheduler.request()
    const strip = () => (
      <box flexDirection="row" gap={1}>
        <For each={usageCalendarStrip(usageCalendarItems(), usageNow())}>
          {(day, index) => (
            <box flexDirection="column" alignItems="center" width={6}>
              <text fg={index() === 0 ? theme.primary : theme.textMuted} wrapMode="none">{day.label}</text>
              <text fg={day.count ? theme.text : theme.textMuted} wrapMode="none">{day.count ? `${day.count}` : "-"}</text>
            </box>
          )}
        </For>
      </box>
    )
    dialog.replace(() => (
      <DialogSelect
        title="Usage calendar"
        filterFooter={strip()}
        options={usageCalendarOptions()}
        preserveSelection
      />
    ), undefined, { back: selectUsageMenu })
  }
  const openUsageCalendar = () => setTimeout(selectUsageCalendar, 100)

  onCleanup(sdk.claudeAccount.onChange(() => {
    void readObservedUsage()
    void refreshActiveClaudeAccount()
    usageScheduler.request(["claude-code"])
  }))
  onCleanup(event.on("provider.usage.updated", (evt) => observeUsage(evt.properties)))
  onCleanup(
    event.on("session.status", (evt) => {
      queueMicrotask(() => {
        usageScheduler.reconcile()
        if (evt.properties.status.type !== "idle") return
        const message = sync.data.message[evt.properties.sessionID]?.findLast((item) => item.role === "assistant")
        const provider = message?.role === "assistant" ? usageProviderForModel(message.providerID) : undefined
        if (provider) usageScheduler.request([provider])
      })
    }),
  )
  const refreshedResets = new Set<string>()
  const usageAgeTimer = setInterval(() => {
    const now = Date.now()
    setUsageNow(now)
    const codex = usage()
    const go = goUsage()
    const cursor = cursorUsage()
    const claude = claudeCodeUsage()
    const windows: [UsageProviderId, UsageWindow[]][] = [
      ["openai", codex.ok ? [codex.primary, codex.secondary] : []],
      ["opencode-go", go.ok ? [go.weekly, ...(go.monthly ? [go.monthly] : [])] : []],
      ["cursor", cursor.ok ? [cursor.monthly] : []],
      ["claude-code", claude.ok ? (claude.accounts?.flatMap((account) => account.usage.ok
        ? [account.usage.fiveHour, account.usage.weekly] : []) ?? [claude.fiveHour, claude.weekly]) : []],
    ]
    for (const [provider, readings] of windows) {
      for (const window of readings) {
        if (window.resetMs === null || window.resetMs > now) continue
        const key = `${provider}:${window.resetMs}`
        if (refreshedResets.has(key)) continue
        refreshedResets.add(key)
        usageScheduler.request([provider])
      }
    }
  }, 1_000)
  onCleanup(() => {
    clearInterval(usageAgeTimer)
    usageAbort.abort()
    usageScheduler.dispose()
  })

  return {
    view: usageRows,
    selectUsageMenu,
    selectUsageCalendar,
    selectUsageSettings,
    refreshOldUsage,
    refreshActiveClaudeAccount,
    request: (providers?: UsageProviderId[]) => usageScheduler.request(providers),
    loadSettings: (settings: SidebarSettings) => {
      setUsageProviders([...settings.usageProviders])
      setUsageSpacing(settings.usageSpacing)
      setUsageSubscriptions([...settings.usageSubscriptions])
    },
  }
}
