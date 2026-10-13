import type { UsageProviderId } from "./usage"

type RefreshState = {
  running: boolean
  pending: boolean
  requestedAt?: number
  retryAt: number
  failures: number
  timer?: unknown
}

/** All refresh triggers share a per-provider queue, including cooldowns and in-flight work. */
export function createUsageRefresh(options: {
  providers: () => readonly UsageProviderId[]
  active: (provider: UsageProviderId) => boolean
  refresh: (provider: UsageProviderId) => Promise<{ ok: boolean; retryAt?: number }>
  now?: () => number
  schedule?: (callback: () => void, delay: number) => unknown
  cancel?: (handle: unknown) => void
}) {
  const now = options.now ?? Date.now
  const schedule = options.schedule ?? ((callback, delay) => setTimeout(callback, delay))
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  const states = new Map<UsageProviderId, RefreshState>()
  let disposed = false

  const stateFor = (provider: UsageProviderId) => {
    const existing = states.get(provider)
    if (existing) return existing
    const state: RefreshState = { running: false, pending: false, retryAt: 0, failures: 0 }
    states.set(provider, state)
    return state
  }
  const minimum = (provider: UsageProviderId) => provider === "claude-code" ? 180_000 : 5_000
  const interval = (provider: UsageProviderId) =>
    options.active(provider) ? (provider === "claude-code" ? 180_000 : 30_000) : 300_000

  function arm(provider: UsageProviderId, delay: number) {
    const state = stateFor(provider)
    if (state.timer !== undefined) cancel(state.timer)
    state.timer = undefined
    if (disposed || state.running || !options.providers().includes(provider)) return
    state.timer = schedule(() => {
      state.timer = undefined
      request([provider])
    }, Math.max(0, delay))
  }

  function request(providers = options.providers()) {
    if (disposed) return
    for (const provider of providers) {
      if (!options.providers().includes(provider)) continue
      const state = stateFor(provider)
      state.pending = true
      if (state.running) continue
      const due = Math.max(state.retryAt, (state.requestedAt ?? -Infinity) + minimum(provider))
      if (due > now()) {
        arm(provider, due - now())
        continue
      }
      if (state.timer !== undefined) cancel(state.timer)
      state.timer = undefined
      state.running = true
      state.pending = false
      state.requestedAt = now()
      void options.refresh(provider)
        .catch(() => ({ ok: false, retryAt: undefined }))
        .then((result) => {
          if (disposed) return
          state.failures = result.ok ? 0 : state.failures + 1
          state.retryAt = Math.max(
            result.retryAt ?? 0,
            result.ok ? 0 : now() + Math.min(900_000, minimum(provider) * 2 ** Math.min(state.failures, 8)),
          )
        })
        .finally(() => {
          state.running = false
          if (disposed) return
          if (state.pending) {
            request([provider])
            return
          }
          arm(provider, Math.max(interval(provider), state.retryAt - now()))
        })
    }
  }

  return {
    request,
    reconcile() {
      if (disposed) return
      for (const [provider, state] of states) {
        if (!options.providers().includes(provider)) {
          if (state.timer !== undefined) cancel(state.timer)
          state.timer = undefined
          state.pending = false
          continue
        }
        if (state.pending || state.running) continue
        arm(provider, Math.max(
          state.retryAt - now(),
          (state.requestedAt ?? now()) + interval(provider) - now(),
        ))
      }
      request(options.providers().filter((provider) => !states.has(provider)))
    },
    dispose() {
      disposed = true
      for (const state of states.values()) {
        if (state.timer !== undefined) cancel(state.timer)
      }
      states.clear()
    },
  }
}
