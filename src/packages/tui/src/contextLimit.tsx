import { useSDK } from "./context/sdk"
import { useSync } from "./context/sync"
import { useRoute } from "./context/route"
import { useProject } from "./context/project"
import { useDialog } from "./ui/dialog"
import { DialogSelect, type DialogSelectOption } from "./ui/dialog-select"
import { DialogPrompt } from "./ui/dialog-prompt"
import { useToast } from "./ui/toast"

type LimitAction = "compact" | "handoff" | "off"
type LimitChoice = LimitAction | "reset"
type Limit = { action: LimitAction; tokens: number }

// Read shape. Action is a plain string because hand-edited config is not validated here.
type LimitInput = {
  compaction?: {
    limit?: {
      tokens?: number
      action?: string
      providers?: Record<string, { tokens?: number; action?: string }>
    }
  }
}

// Write shape: a partial global limit, or a per-provider map of full limits.
type LimitPatch = {
  tokens?: number
  action?: LimitAction
  providers?: Record<string, Limit>
}

const DEFAULT_ACTION: LimitAction = "compact"
const DEFAULT_TOKENS = 200000
const CLAUDE_CODE = "claude-code"

// Every claude-code and claude-code-<account> provider shares one limit key.
function limitKey(providerID: string) {
  if (providerID === CLAUDE_CODE || providerID.startsWith(`${CLAUDE_CODE}-`)) return CLAUDE_CODE
  return providerID
}

function isAction(value: string | undefined): value is LimitAction {
  return value === "compact" || value === "handoff" || value === "off"
}

// Provider override fields win over global fields, which win over defaults.
// Undefined when neither the global limit nor the override is configured.
function effectiveLimit(config: LimitInput, scope: string | undefined) {
  const global = config.compaction?.limit
  const override = scope === undefined ? undefined : global?.providers?.[scope]
  if (!global && !override) return
  const action = override?.action ?? global?.action
  const tokens = override?.tokens ?? global?.tokens
  return {
    action: isAction(action) ? action : DEFAULT_ACTION,
    tokens: tokens ?? DEFAULT_TOKENS,
    defaulted: action === undefined && tokens === undefined,
  }
}

// Display only. Config stores raw tokens; the dialogs show and accept thousands ("200k").
function formatTokens(tokens: number) {
  if (tokens % 1000 === 0) return `${tokens / 1000}k`
  return String(tokens)
}

function describeLimit(limit: ReturnType<typeof effectiveLimit>) {
  if (!limit) return "not set"
  if (limit.action === "off") return "off"
  return `${limit.action} at ${formatTokens(limit.tokens)}${limit.defaulted ? " (default)" : ""}`
}

function globalLimit(config: LimitInput): Limit {
  const action = config.compaction?.limit?.action
  return {
    action: isAction(action) ? action : DEFAULT_ACTION,
    tokens: config.compaction?.limit?.tokens ?? DEFAULT_TOKENS,
  }
}

// Scope keys in display order: fixed providers, connected providers, then saved overrides
// for providers that are not connected.
function scopeKeys(config: LimitInput, connected: string[]) {
  const keys = new Set<string>([CLAUDE_CODE, "cursor"])
  for (const providerID of connected) keys.add(limitKey(providerID))
  for (const key of Object.keys(config.compaction?.limit?.providers ?? {})) keys.add(key)
  return Array.from(keys)
}

// Accepts "200", "200k", "200K" as thousands and returns raw tokens. Rejects anything else.
function parseTokens(value: string) {
  const match = /^(\d+)k?$/.exec(value.trim().toLowerCase())
  if (!match) return
  const tokens = Number(match[1]) * 1000
  if (!Number.isSafeInteger(tokens) || tokens < 1) return
  return tokens
}

function limitMessage(scope: string | undefined, limit: Limit) {
  const prefix = scope === undefined ? "Context limit" : `Context limit (${scope})`
  return limit.action === "off" ? `${prefix} off` : `${prefix}: ${limit.action} at ${formatTokens(limit.tokens)} tokens`
}

export function createContextLimitCommands() {
  const sdk = useSDK()
  const sync = useSync()
  const route = useRoute()
  const dialog = useDialog()
  const toast = useToast()
  const project = useProject()

  async function save(scope: string | undefined, limit: Limit) {
    const patch: LimitPatch = scope === undefined ? limit : { providers: { [scope]: limit } }
    const result = await sdk.client.global.config.update({
      config: { compaction: { limit: patch } },
    })
    if (!result.error) {
      const config = await sdk.client.config.get({ workspace: project.workspace.current() })
      if (config.data) sync.set("config", config.data)
    }
    toast.show(
      result.error
        ? { message: `Failed to update context limit: ${String(result.error)}`, variant: "error" }
        : { message: limitMessage(scope, limit), variant: "success" },
    )
  }

  function openAction(scope: string | undefined) {
    const limit = effectiveLimit(sync.data.config, scope)
    const currentAction = limit?.action ?? DEFAULT_ACTION
    const currentTokens = limit?.tokens ?? DEFAULT_TOKENS
    const options: DialogSelectOption<LimitChoice>[] = [
      { value: "compact", title: "Compact" },
      { value: "handoff", title: "Handoff" },
      { value: "off", title: "Off" },
    ]
    if (scope !== undefined) {
      options.push({
        value: "reset",
        title: "Reset to default",
        description: "copy the global limit into this provider",
      })
    }
    const title = scope === undefined ? "Context limit action" : `Context limit action (${scope})`

    dialog.replace(() => (
      <DialogSelect
        title={title}
        current={currentAction}
        options={options}
        onSelect={(option) => {
          const choice = option.value
          if (choice === "reset") {
            dialog.clear()
            void save(scope, globalLimit(sync.data.config))
            return
          }
          if (choice === "off") {
            dialog.clear()
            void save(scope, { action: "off", tokens: currentTokens })
            return
          }
          dialog.replace(() => (
            <DialogPrompt
              title="Token threshold (k = thousands)"
              value={formatTokens(currentTokens)}
              onConfirm={(value) => {
                dialog.clear()
                const tokens = parseTokens(value)
                if (!tokens) {
                  toast.show({ message: "Enter a token count in thousands, like 200k", variant: "error" })
                  return
                }
                void save(scope, { action: choice, tokens })
              }}
            />
          ))
        }}
      />
    ))
  }

  function openScope() {
    const config = sync.data.config
    const options: DialogSelectOption<string | undefined>[] = [
      {
        value: undefined,
        title: "All providers",
        description: describeLimit(effectiveLimit(config, undefined)),
      },
      ...scopeKeys(config, sync.data.provider_next.connected).map((scope) => ({
        value: scope,
        title: scope,
        description: describeLimit(effectiveLimit(config, scope)),
      })),
    ]

    dialog.replace(() => (
      <DialogSelect title="Context limit scope" options={options} onSelect={(option) => openAction(option.value)} />
    ))
  }

  return {
    contextLimit: {
      name: "oc.context_limit",
      title: "Context limit",
      category: "oc",
      group: "Defaults",
      slashName: "contextLimit",
      get desc() {
        return describeLimit(effectiveLimit(sync.data.config, undefined))
      },
      run: () => openScope(),
    },
    handoff: {
      name: "oc.handoff_now",
      title: "Hand off session",
      category: "oc",
      slashName: "handoffNow",
      get enabled() {
        return route.data.type === "session"
      },
      run: () => {
        if (route.data.type !== "session") {
          toast.show({ message: "Open a session to hand off", variant: "error" })
          return
        }
        const sessionID = route.data.sessionID
        dialog.clear()
        void sdk.client.session.handoff({ sessionID }).then((result) => {
          toast.show(
            result.error
              ? { message: `Failed to start handoff: ${String(result.error)}`, variant: "error" }
              : { message: "Handoff started", variant: "success" },
          )
        })
      },
    },
  }
}

