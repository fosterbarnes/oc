import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import type { GlobalEvent } from "@opencode-ai/sdk/v2"
import { Flag } from "@opencode-ai/core/flag/flag"
import type { ProviderUsage } from "@opencode-ai/core/provider-usage"
import { createSimpleContext } from "./helper"
import { batch, onCleanup, onMount } from "solid-js"

export type EventSource = {
  subscribe: (handler: (event: GlobalEvent) => void) => Promise<() => void>
  onReconnect?: (handler: () => void) => () => void
}

export interface ScheduledResumeEntry {
  id: string
  sessionID: string
  directory: string
  fireAt: number
  reason: string
  createdAt: number
  attempts: number
}

export interface ScheduledResumeState {
  enabled: boolean
  prompt: string
  entries: ScheduledResumeEntry[]
}

export interface ClaudeAccountOption {
  id: string
  label: string
  current: boolean
  pinned?: boolean
  limitedUntil?: number
}

/** A pool account in the `Claude accounts` manager (`/global/claude/accounts`). */
export interface ClaudeManagedAccount {
  id: string
  /** The `accounts` entry as written in opencode.jsonc. */
  entry: string
  label: string
  name?: string
  /** Absent when the CLI could not be asked. */
  loggedIn?: boolean
  email?: string
  plan?: string
  current: boolean
  limitedUntil?: number
  /** CLAUDE_CONFIG_DIR for this account's CLI; absent means unset. */
  configDir?: string
}

export interface ClaudeManagedAccounts {
  accounts: ClaudeManagedAccount[]
  added?: string
  /** `claude auth login` as the server resolves the CLI. */
  login: { command: string; args: string[]; shell: boolean }
}

export type ClaudeAccountAction =
  | { action: "add"; name?: string }
  | { action: "rename"; id: string; name: string }
  | { action: "remove" | "signedIn" | "signOut"; id: string }

export const { use: useSDK, provider: SDKProvider } = createSimpleContext({
  name: "SDK",
  init: (props: {
    url: string
    directory?: string
    fetch?: typeof fetch
    headers?: RequestInit["headers"]
    events?: EventSource
  }) => {
    const abort = new AbortController()
    let sse: AbortController | undefined

    function createSDK() {
      return createOpencodeClient({
        baseUrl: props.url,
        signal: abort.signal,
        directory: props.directory,
        fetch: props.fetch,
        headers: props.headers,
      })
    }

    let sdk = createSDK()

    const handlers = new Set<(event: GlobalEvent) => void>()
    const reconnectHandlers = new Set<() => void>()
    const claudeAccountHandlers = new Set<() => void>()
    const emitter = {
      emit(_type: "event", event: GlobalEvent) {
        // One throwing handler must not drop the rest of the batch: log it and keep dispatching.
        for (const handler of handlers) {
          try {
            handler(event)
          } catch (error) {
            console.error("TUI event handler failed", error)
          }
        }
      },
      on(_type: "event", handler: (event: GlobalEvent) => void) {
        handlers.add(handler)
        return () => {
          handlers.delete(handler)
        }
      },
    }

    let queue: GlobalEvent[] = []
    let timer: Timer | undefined
    let flushEpoch = 0
    let last = 0
    const retryDelay = 1000
    const maxRetryDelay = 30000

    const flush = () => {
      if (abort.signal.aborted) return
      if (queue.length === 0) return
      const events = queue
      queue = []
      timer = undefined
      last = Date.now()
      // Batch all event emissions so all store updates result in a single render
      batch(() => {
        for (const event of events) {
          emitter.emit("event", event)
        }
      })
    }

    const handleEvent = (event: GlobalEvent) => {
      if (abort.signal.aborted) return
      queue.push(event)
      const elapsed = Date.now() - last

      if (timer) return
      // If we just flushed recently (within 16ms), batch this with future events
      // Otherwise, process immediately to avoid latency
      if (elapsed < 16) {
        const epoch = flushEpoch
        timer = setTimeout(() => {
          if (epoch !== flushEpoch || abort.signal.aborted) return
          flush()
        }, 16)
        return
      }
      flush()
    }

    function startSSE() {
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
      flushEpoch++
      sse?.abort()
      const ctrl = new AbortController()
      sse = ctrl
      ;(async () => {
        let attempt = 0
        let established = false
        while (true) {
          if (abort.signal.aborted || ctrl.signal.aborted) break

          try {
            const events = await sdk.global.event({
              signal: ctrl.signal,
              sseMaxRetryAttempts: 0,
            })

            if (established) {
              for (const handler of reconnectHandlers) handler()
            }
            established = true
            attempt = 0

            if (Flag.OPENCODE_EXPERIMENTAL_WORKSPACES) {
              // Start syncing workspaces, it's important to do this after
              // we've started listening to events
              await sdk.sync.start().catch(() => {})
            }

            for await (const event of events.stream) {
              if (abort.signal.aborted || ctrl.signal.aborted) break
              handleEvent(event)
            }

            if (timer) {
              clearTimeout(timer)
              timer = undefined
            }
            if (queue.length > 0) flush()
          } catch {
            // Request and stream failures retry with the same backoff.
          }

          attempt += 1
          if (abort.signal.aborted || ctrl.signal.aborted) break

          const backoff = Math.min(retryDelay * 2 ** (attempt - 1), maxRetryDelay)
          await new Promise<void>((resolve) => {
            let backoffTimer: Timer | undefined
            const onAbort = () => {
              if (backoffTimer) clearTimeout(backoffTimer)
              if (timer) {
                clearTimeout(timer)
                timer = undefined
              }
              resolve()
            }
            backoffTimer = setTimeout(() => {
              abort.signal.removeEventListener("abort", onAbort)
              ctrl.signal.removeEventListener("abort", onAbort)
              resolve()
            }, backoff)
            abort.signal.addEventListener("abort", onAbort, { once: true })
            ctrl.signal.addEventListener("abort", onAbort, { once: true })
          })
        }
      })().catch(() => {})
    }

    onMount(async () => {
      if (props.events) {
        const unsub = await props.events.subscribe(handleEvent)
        onCleanup(unsub)
        const unsubReconnect = props.events.onReconnect?.(() => {
          for (const handler of reconnectHandlers) handler()
        })
        if (unsubReconnect) onCleanup(unsubReconnect)

        if (Flag.OPENCODE_EXPERIMENTAL_WORKSPACES) {
          // Start syncing workspaces, it's important to do this after
          // we've started listening to events
          await sdk.sync.start().catch(() => {})
        }
      } else {
        startSSE()
      }
    })

    onCleanup(() => {
      flushEpoch++
      abort.abort()
      sse?.abort()
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
      handlers.clear()
      reconnectHandlers.clear()
    })

    const transport = () =>
      (
        sdk as unknown as {
          client: {
            get: (options: { url: string }) => Promise<{ data?: unknown; error?: unknown }>
            post: (options: {
              url: string
              body: unknown
              headers?: Record<string, string>
            }) => Promise<{ data?: unknown; error?: unknown }>
            put: (options: {
              url: string
              body: unknown
              headers?: Record<string, string>
            }) => Promise<{ data?: unknown; error?: unknown }>
          }
        }
      ).client

    return {
      get client() {
        return sdk
      },
      directory: props.directory,
      event: emitter,
      onReconnect(handler: () => void) {
        reconnectHandlers.add(handler)
        return () => {
          reconnectHandlers.delete(handler)
        }
      },
      fetch: props.fetch ?? fetch,
      url: props.url,
      debugLogging: {
        get: async () => {
          const result = await transport().get({ url: "/debug-logging" })
          if (result.error) throw result.error
          return (result.data as { enabled?: boolean } | undefined)?.enabled === true
        },
        set: async (enabled: boolean) => {
          const result = await transport().put({
            url: "/debug-logging",
            body: { enabled },
            headers: { "Content-Type": "application/json" },
          })
          if (result.error) throw result.error
          return (result.data as { enabled?: boolean } | undefined)?.enabled === true
        },
      },
      providerUsage: {
        state: async (): Promise<ProviderUsage.Info[]> => {
          const result = await sdk.provider.usage.state(undefined, { throwOnError: true })
          return result.data
        },
      },
      claudeAccount: {
        /** Runs after any successful account switch, so views of per-account data can refresh. */
        onChange(handler: () => void) {
          claudeAccountHandlers.add(handler)
          return () => {
            claudeAccountHandlers.delete(handler)
          }
        },
        state: async (sessionID?: string): Promise<ClaudeAccountOption[]> => {
          const result = await transport().get({
            url: `/session/claude/account${sessionID ? `?sessionID=${encodeURIComponent(sessionID)}` : ""}`,
          })
          if (result.error) throw result.error
          return (result.data as { accounts: ClaudeAccountOption[] }).accounts
        },
        /** Without `sessionID` sets the global account; with it, pins that session (`id` undefined unpins). */
        set: async (id: string | undefined, sessionID?: string): Promise<ClaudeAccountOption[]> => {
          const result = await transport().put({
            url: "/session/claude/account",
            body: { id, sessionID },
            headers: { "Content-Type": "application/json" },
          })
          if (result.error) throw result.error
          for (const handler of claudeAccountHandlers) handler()
          return (result.data as { accounts: ClaudeAccountOption[] }).accounts
        },
        /** Pool accounts with sign-in status, for the account manager. Probes every account's CLI auth. */
        manage: async (): Promise<ClaudeManagedAccounts> => {
          const result = await transport().get({ url: "/global/claude/accounts" })
          if (result.error) throw result.error
          return result.data as ClaudeManagedAccounts
        },
        change: async (input: ClaudeAccountAction): Promise<ClaudeManagedAccounts> => {
          const result = await transport().post({
            url: "/global/claude/accounts",
            body: input,
            headers: { "Content-Type": "application/json" },
          })
          if (result.error) throw result.error
          for (const handler of claudeAccountHandlers) handler()
          return result.data as ClaudeManagedAccounts
        },
      },
      resume: {
        state: async (): Promise<ScheduledResumeState> => {
          const result = await transport().get({ url: "/session/resume/state" })
          if (result.error) throw result.error
          return result.data as unknown as ScheduledResumeState
        },
        set: async (enabled: boolean): Promise<ScheduledResumeState> => {
          const result = await transport().put({
            url: "/session/resume/state",
            body: { enabled },
            headers: { "Content-Type": "application/json" },
          })
          if (result.error) throw result.error
          return result.data as unknown as ScheduledResumeState
        },
        cancel: async (id: string): Promise<boolean> => {
          const result = await transport().post({
            url: "/session/resume/cancel",
            body: { id },
            headers: { "Content-Type": "application/json" },
          })
          if (result.error) throw result.error
          return result.data === true
        },
      },
    }
  },
})
