import type { LanguageModelV3 } from "@ai-sdk/provider"
import type { Plugin } from "@opencode-ai/plugin"
import { ClaudeCodeLanguageModel } from "./claude-code-language-model.js"
import { defaultModels, passthroughModel, toConfigModel } from "./models.js"
import type {
  OpenCodeConfig,
  OpenCodeEvent,
  OpenCodeModel,
  OpenCodePlugin,
  OpenCodeProvider,
} from "./opencode-types.js"
import { DEFAULT_PROXY_TOOL_NAMES } from "./types.js"
import type { ClaudeCodeProviderSettings } from "./types.js"
import {
  BASE_PROVIDER_ID,
  accountDisplayName,
  accountModelSuffix,
  accountProviderId,
  ensureAccountRuntime,
  resolveAccounts,
} from "./accounts.js"
import {
  type AgentRecord,
  agentDirectories,
  getDefaultSubagentModel,
  parseFallbackModelList,
  readAgentMarkdownRecords,
  setAgentRegistry,
  setDefaultSubagentModel,
  setProviderFallbackModels,
} from "./agent-models.js"
import { configureLogger, log } from "./logger.js"
import {
  isUnknownPreset,
  resolvePermissionPreset,
  type ResolvedPermissionPreset,
} from "./permission-presets.js"
import {
  deleteActiveProcessesForSession,
  ensureProcessExitCleanup,
} from "./session-manager.js"
import {
  getOpencodeProjectDirectory,
  isUsableDirectory,
  setOpencodeClient,
  setOpencodeProjectDirectory,
} from "./runtime-status.js"
import {
  logStartupDiagnostics,
  pickOpencodeVersion,
  type DiagnosticsProviderEntry,
} from "./startup-diagnostics.js"

export interface ClaudeCodeProvider {
  specificationVersion: "v3"
  (modelId: string): LanguageModelV3
  languageModel(modelId: string): LanguageModelV3
}

// Picks the best directory from opencode's plugin context (`directory` /
// `worktree`). Result is handed to runtime-status so it's available as a
// *fallback* at spawn time only when `process.cwd()` is unusable (macOS
// GUI launches at `/`). Never baked into provider config — see #4.
function pickOpencodeDirectory(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined
  const ctx = input as { directory?: unknown; worktree?: unknown }
  if (isUsableDirectory(ctx.directory)) return ctx.directory
  if (isUsableDirectory(ctx.worktree)) return ctx.worktree
  return undefined
}

let warnedAnthropicApiKey = false
let warnedPlanModeNoExit = false

// Defined in `types.ts` so `permission-presets.ts` and the two diagnostics
// modules can read it without importing this file, and re-exported here
// unchanged because it is part of the package's public surface.
export { DEFAULT_PROXY_TOOL_NAMES } from "./types.js"

// One-time heads-up: an API key in the environment makes Claude Code bill
// pay-as-you-go (Console) instead of the logged-in Pro/Max subscription, which
// silently bypasses the Agent SDK plan credit. Surfaced once per process.
function warnIfAnthropicApiKey(ignore: boolean | undefined): void {
  if (warnedAnthropicApiKey) return
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return
  warnedAnthropicApiKey = true
  if (ignore) {
    log.warn(
      "ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN detected; stripping it from claude spawns (ignoreAnthropicApiKey) so requests use your subscription auth, not pay-as-you-go API billing.",
    )
  } else {
    log.warn(
      "ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN detected; claude may bill as pay-as-you-go API usage instead of your subscription. Set provider option `ignoreAnthropicApiKey: true` to force subscription auth.",
    )
  }
}

// Plan mode is enforced (buildCliArgs drops the skip-permissions flag for it),
// so the read-only guarantee holds. The cost is that headless Claude Code is
// not offered an `ExitPlanMode` tool, measured on 2.1.258, so nothing can
// release plan mode mid-session and approving a plan in chat will not let
// Claude write. Say so once per process rather than let it look like a hang.
export function _resetPlanModeWarningForTests(): void {
  warnedPlanModeNoExit = false
}

export function warnIfPlanModeCannotExit(permissionMode: string | undefined): void {
  if (permissionMode !== "plan") return
  if (warnedPlanModeNoExit) return
  warnedPlanModeNoExit = true
  log.warn(
    "permissionMode \"plan\" is enforced: claude cannot edit files or run commands, and --dangerously-skip-permissions is deliberately not passed so it stays that way. Headless Claude Code is not offered an ExitPlanMode tool, so nothing releases plan mode mid-session; approving a plan in chat does not unlock writes. Leaving plan mode means changing the config and restarting opencode.",
    { permissionMode, measuredOn: "claude-code 2.1.258" },
  )
}

/**
 * Resolve `permissionPreset` for this provider, reporting what it replaced.
 *
 * The result is applied over the operator's settings by `createClaudeCode`,
 * which is the one funnel both opencode majors reach the language model
 * through, so a preset needs wiring in exactly one place.
 *
 * Every override is logged at NOTICE, and an unrecognised preset name is a
 * WARN plus no preset at all. A safety option must never be approximated: a
 * typo'd `"readonly"` silently running at full permissions is worse than one
 * that says so.
 */
export function applyPermissionPreset(
  settings: ClaudeCodeProviderSettings,
  defaultProxyTools: readonly string[],
): ResolvedPermissionPreset | null {
  const resolved = resolvePermissionPreset(settings, defaultProxyTools)
  if (resolved === null) return null
  if (isUnknownPreset(resolved)) {
    log.warn(
      "unknown permissionPreset; no preset applied and every permission" +
        " setting is left exactly as configured",
      { permissionPreset: resolved.unknown, known: ["read-only"] },
    )
    return null
  }
  log.notice(`permission preset "${resolved.preset}" applied`, {
    permissionMode: resolved.permissionMode,
    skipPermissions: resolved.skipPermissions,
    proxyTools: resolved.proxyTools,
    disallowedTools: resolved.extraDisallowedTools,
  })
  for (const line of resolved.overridden) {
    log.notice(`permission preset "${resolved.preset}" overrode ${line}`)
  }
  return resolved
}

export function createClaudeCode(
  settings: ClaudeCodeProviderSettings = {},
): ClaudeCodeProvider {
  if (settings.logging) {
    configureLogger({
      file: settings.logging.file ?? false,
      dir: settings.logging.dir ?? null,
      mode: settings.logging.mode ?? "silent",
      level: settings.logging.level ?? "info",
    })
  }
  warnIfAnthropicApiKey(settings.ignoreAnthropicApiKey)
  const preset = applyPermissionPreset(settings, DEFAULT_PROXY_TOOL_NAMES)
  // A preset drops any configured `permissionMode`, so the plan-mode warning
  // would be about a mode this provider is not running in.
  warnIfPlanModeCannotExit(preset ? undefined : settings.permissionMode)
  const cliPath =
    settings.cliPath ?? process.env.CLAUDE_CLI_PATH ?? "claude"
  const providerName = settings.providerID ?? settings.name ?? "claude-code"
  const proxyTools =
    preset?.proxyTools ?? settings.proxyTools ?? [...DEFAULT_PROXY_TOOL_NAMES]

  const createModel = (modelId: string): LanguageModelV3 => {
    return new ClaudeCodeLanguageModel(modelId, {
      provider: providerName,
      cliPath,
      hostApi: settings.hostApi,
      cwd: settings.cwd,
      account: settings.account,
      configDir: settings.configDir,
      // TODO: parked extra (account failover). No candidates means failover never arms.
      // failoverAccounts: settings.failoverAccounts,
      baseCliPath: settings.baseCliPath ?? cliPath,
      accountFailover: settings.accountFailover ?? "ask",
      providerID: settings.providerID,
      skipPermissions: preset?.skipPermissions ?? settings.skipPermissions ?? true,
      permissionMode: preset?.permissionMode ?? settings.permissionMode,
      permissionPreset: preset?.preset,
      mcpConfig: settings.mcpConfig,
      strictMcpConfig: settings.strictMcpConfig,
      proxyTools,
      proxyOpencodeTools: settings.proxyOpencodeTools,
      stripContextReminders: settings.stripContextReminders === true,
      extraDisallowedTools:
        preset?.extraDisallowedTools ?? settings.extraDisallowedTools,
      proxyToolTimeoutMs: settings.proxyToolTimeoutMs,
      // TODO: parked extra (plan-mode question form).
      // planModeQuestion: settings.planModeQuestion ?? false,
      planModeQuestion: false,
      webSearch: settings.webSearch,
      hotReloadMcp: settings.hotReloadMcp ?? true,
      multiStepContinuation: settings.multiStepContinuation ?? true,
      autoContinueIncompleteTurns:
        settings.autoContinueIncompleteTurns ?? "smart",
      compactionModel: settings.compactionModel,
      ignoreAnthropicApiKey: settings.ignoreAnthropicApiKey,
      idleProcessTimeoutMs: settings.idleProcessTimeoutMs,
      turnStats: settings.turnStats === true,
      // TODO: parked extra (interactive PTY transport). Headless stream-json only.
      // interactive: settings.interactive,
      // interactiveBypass: settings.interactiveBypass,
      // interactiveAllowTools: settings.interactiveAllowTools,
      // interactiveSystemPrompt: settings.interactiveSystemPrompt,
      interactive: false,
    })
  }

  const provider = function (modelId: string) {
    return createModel(modelId)
  } as ClaudeCodeProvider

  provider.specificationVersion = "v3"
  provider.languageModel = createModel

  return provider
}

// ---------------------------------------------------------------------------
// OpenCode plugin interface
// ---------------------------------------------------------------------------

const PROVIDER_ID = BASE_PROVIDER_ID
export const CLAUDE_CODE_PROVIDER_NPM = "@opencode-ai/claude-code"

function cleanProviderOptions(
  options: Record<string, unknown> = {},
): Record<string, unknown> {
  const result = { ...options }
  delete result.accounts
  // Consumed by the config hook (agent registry), not by the language model.
  delete result.defaultSubagentModel
  return result
}

function defaultModelsForProvider(
  providerModels: OpenCodeProvider["models"],
  providerID = PROVIDER_ID,
  modelSuffix?: string,
) {
  const models = Object.fromEntries(
    Object.entries(defaultModels).map(([id, model]) => {
      const modelId = modelSuffix ? `${id}@${modelSuffix}` : id
      const existing = providerModels[id] ?? providerModels[modelId]
      return [
        modelId,
        {
          ...model,
          id: modelId,
          providerID,
          api: {
            ...model.api,
            id: modelId,
            npm: existing?.api?.npm ?? model.api.npm,
            url: existing?.api?.url ?? model.api.url,
          },
        },
      ]
    }),
  )

  for (const [id, model] of Object.entries(providerModels)) {
    if (!(id in models)) {
      models[id] = {
        ...model,
        providerID,
      }
    }
  }

  return models
}

/**
 * Build models in OpenCode's config schema format (flat properties like
 * `temperature`, `reasoning`, `cost.cache_read`, `modalities`, etc.)
 * so the config-path provider loader parses them correctly.
 */
export function configModelsForProvider(
  providerModels: OpenCodeProvider["models"],
  providerID: string,
  modelSuffix?: string,
): Record<string, Record<string, unknown>> {
  const models: Record<string, Record<string, unknown>> = {}

  for (const [id, model] of Object.entries(defaultModels)) {
    const modelId = modelSuffix ? `${id}@${modelSuffix}` : id
    const existing = providerModels[id] ?? providerModels[modelId]
    const existingVariants =
      existing && typeof (existing as { variants?: unknown }).variants === "object"
        ? ((existing as { variants?: Record<string, Record<string, unknown>> }).variants ?? {})
        : {}
    const full: OpenCodeModel = {
      ...model,
      id: modelId,
      providerID,
      api: {
        ...model.api,
        id: modelId,
        npm: existing?.api?.npm ?? model.api.npm,
        url: existing?.api?.url ?? model.api.url,
      },
      variants: {
        ...(model.variants ?? {}),
        ...existingVariants,
      },
    }
    models[modelId] = toConfigModel(full)
  }

  for (const [id, model] of Object.entries(providerModels)) {
    if (!(id in models)) {
      models[id] = completeUserModel(id, model, providerID)
    }
  }

  return models
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * A user model id this plugin does not register, in the flat config schema.
 *
 * A full runtime-shaped entry (`capabilities`, nested `cost.cache`) converts as
 * before. Anything else is what opencode's config schema actually allows, a
 * partial entry in the flat shape, and it is overlaid on `passthroughModel`'s
 * complete template rather than converted, because converting a partial entry
 * threw `undefined is not an object (evaluating 'model.capabilities.input')`
 * inside the config hook and took the whole provider registration with it
 * (found 2026-09-27 while probing the fallback chain). Nested `cost`, `limit`
 * and `variants` merge key by key so a partial `limit: { context }` keeps the
 * template's `output`.
 */
function completeUserModel(
  id: string,
  entry: unknown,
  providerID: string,
): Record<string, unknown> {
  const record = isRecord(entry) ? entry : {}
  const runtimeShaped =
    isRecord(record.capabilities) &&
    isRecord(record.capabilities.input) &&
    isRecord(record.capabilities.output) &&
    isRecord(record.cost) &&
    isRecord(record.cost.cache) &&
    isRecord(record.api)
  if (runtimeShaped) {
    return toConfigModel({ ...(record as unknown as OpenCodeModel), providerID })
  }
  const base = toConfigModel({ ...passthroughModel(id), providerID })
  log.warn("provider model entry is partial; completing it from the pass-through template", {
    providerID,
    model: id,
    declared: Object.keys(record),
  })
  const merged: Record<string, unknown> = { ...base, ...record, id }
  for (const key of ["cost", "limit", "variants"] as const) {
    merged[key] = {
      ...(isRecord(base[key]) ? base[key] : {}),
      ...(isRecord(record[key]) ? record[key] : {}),
    }
  }
  return merged
}

async function providerConfig(
  existing: {
    name?: string
    npm?: string
    options?: Record<string, unknown>
    models?: Record<string, unknown>
  } | undefined,
  providerID = PROVIDER_ID,
  optionDefaults: Record<string, unknown> = {},
  displayName?: string,
) {
  const mergedOptions: Record<string, unknown> = {
    cliPath: "claude",
    proxyTools: [...DEFAULT_PROXY_TOOL_NAMES],
    ...optionDefaults,
    ...cleanProviderOptions(existing?.options),
    providerID,
  }

  const cliPath = String(mergedOptions.cliPath ?? "claude")
  const account =
    typeof mergedOptions.account === "string" ? mergedOptions.account : undefined
  const runtime = account
    ? await ensureAccountRuntime(account, cliPath)
    : { cliPath }

  return {
    name: displayName ?? existing?.name,
    npm: existing?.npm ?? CLAUDE_CODE_PROVIDER_NPM,
    options: {
      ...mergedOptions,
      ...runtime,
      // The pre-wrapper binary, kept because `runtime` replaces `cliPath`
      // with the account's wrapper and a failover has to build ANOTHER
      // account's wrapper on top of the same base (src/account-failover.ts).
      baseCliPath: cliPath,
    },
    // models is intentionally omitted: both callers overwrite it with
    // configModelsForProvider(), which emits the flat config schema
    // opencode's config-path loader parses (and merges user variants).
  }
}

/**
 * Narrow opencode's full provider map down to the ones this plugin owns
 * (`claude-code` plus every `claude-code-<account>` expansion) so startup
 * diagnostics never report another provider's options.
 */
export function claudeCodeProviders(
  providers: Record<string, DiagnosticsProviderEntry> | undefined,
): Record<string, DiagnosticsProviderEntry> {
  const out: Record<string, DiagnosticsProviderEntry> = {}
  for (const [id, entry] of Object.entries(providers ?? {})) {
    if (id === PROVIDER_ID || id.startsWith(`${PROVIDER_ID}-`)) out[id] = entry
  }
  return out
}

async function expandAccountProviders(config: {
  provider?: Record<
    string,
    {
      name?: string
      npm?: string
      options?: Record<string, unknown>
      models?: Record<string, unknown>
    }
  >
}): Promise<boolean> {
  const seed = config.provider?.[PROVIDER_ID]
  const accounts = resolveAccounts(seed?.options?.accounts)

  if (!accounts) return false

  config.provider ??= {}

  const seedOptions = cleanProviderOptions(seed?.options)
  let expandedCount = 0

  for (const account of accounts) {
    const providerID = accountProviderId(account)
    try {
      const existing = config.provider[providerID]
      const modelSuffix = accountModelSuffix(account)

      config.provider[providerID] = {
        ...existing,
        ...(await providerConfig(
          existing,
          providerID,
          {
            ...seedOptions,
            account,
            // The resolved list, so this account's language model can offer
            // the others when it runs out of usage. `accounts` itself stays
            // stripped by cleanProviderOptions.
            failoverAccounts: accounts,
          },
          accountDisplayName(account),
        )),
        models: configModelsForProvider(
          (existing?.models ?? seed?.models ?? {}) as OpenCodeProvider["models"],
          providerID,
          modelSuffix,
        ),
      }
      expandedCount++
    } catch (err) {
      log.error("failed to expand account provider", {
        account,
        providerID,
        error: String(err),
      })
    }
  }

  if (expandedCount > 0) {
    delete config.provider[PROVIDER_ID]
  }

  return expandedCount > 0
}

/**
 * Record what every known agent asked for, so `resolveAgentModel` and
 * `resolveAgentEffort` can answer at spawn time without the language model
 * needing to see opencode's config.
 *
 * Runs BEFORE `expandAccountProviders`, which deletes the seed provider entry
 * once it has expanded it: `defaultSubagentModel` has to be read while it is
 * still there.
 *
 * Purely observational. It defines no agents and changes no agent's config;
 * an agent this plugin never heard of is simply absent from the registry,
 * which is what keeps opencode's built-ins out of the override path.
 */
export async function buildAgentRegistry(config: OpenCodeConfig): Promise<void> {
  const options = config.provider?.[PROVIDER_ID]?.options
  const configured = options?.defaultSubagentModel
  setDefaultSubagentModel(
    typeof configured === "string" ? configured : undefined,
  )
  setProviderFallbackModels(parseFallbackModelList(options?.fallbackModels))

  // Markdown agents may or may not reach a plugin's config hook (undocumented
  // either way), so they are read from disk and then overlaid with whatever
  // config does carry, which is authoritative when both describe one agent.
  const records: Record<string, AgentRecord> = await readAgentMarkdownRecords(
    agentDirectories(
      process.env.HOME ?? process.env.USERPROFILE,
      getOpencodeProjectDirectory(),
    ),
  )

  for (const [name, agent] of Object.entries(config.agent ?? {})) {
    const bag = (agent.options ?? {}) as Record<string, unknown>
    const pick = (key: string): string | undefined => {
      const value = agent[key] ?? bag[key]
      return typeof value === "string" ? value : undefined
    }

    // A list, unlike the four scalars, so it cannot go through `pick`, and an
    // empty declaration must not erase what the markdown file said.
    const declaredChain = parseFallbackModelList(
      (agent as Record<string, unknown>).fallbackModels ?? bag.fallbackModels,
    )

    records[name] = {
      mode: pick("mode") ?? records[name]?.mode,
      model: pick("model") ?? records[name]?.model,
      forceModel: pick("forceModel") ?? records[name]?.forceModel,
      reasoningEffort:
        pick("reasoningEffort") ?? records[name]?.reasoningEffort,
      fallbackModels: declaredChain.length
        ? declaredChain
        : records[name]?.fallbackModels,
    }
  }

  setAgentRegistry(records)
  log.debug("agent registry built", {
    agents: Object.keys(records).length,
    defaultSubagentModel: getDefaultSubagentModel(),
  })
}

/**
 * The opencode session id a `session.deleted` bus event names, or undefined
 * for any other event. opencode publishes `{ type, properties: { info } }`
 * under `payload`, and the deleted session's own record is `properties.info`.
 */
export function extractDeletedSessionId(event: OpenCodeEvent | undefined): string | undefined {
  const payload = event?.payload ?? event
  if (!payload || payload.type !== "session.deleted") return undefined
  const properties = payload.properties as { info?: { id?: unknown } } | undefined
  const id = properties?.info?.id
  return typeof id === "string" && id.length > 0 ? id : undefined
}

export const claudeCodeServer: OpenCodePlugin = async (input) => {
  // Retained `claude` children would otherwise outlive a hard opencode exit,
  // reparented to init. Armed once per process however often this runs.
  ensureProcessExitCleanup()

  const opencodeVersion = pickOpencodeVersion(input)

  // Capture the SDK client so the language model can query opencode's
  // in-memory MCP state per-turn for the runtime overlay. `input` is
  // `unknown` here (kept loose since opencode adds fields over time);
  // narrow defensively.
  if (input && typeof input === "object" && "client" in input) {
    setOpencodeClient((input as { client?: unknown }).client)
  }

  // Capture opencode's project-aware directory as a *fallback* used at
  // Claude CLI spawn time only when `process.cwd()` is unusable. Rescues
  // macOS GUI launches at `/` without freezing the value into provider
  // config, so opencode workspace switches mid-session still take effect.
  // See `resolveSpawnCwd` in runtime-status.ts and issue #4.
  setOpencodeProjectDirectory(pickOpencodeDirectory(input))

  return {
    config: async (config) => {
      config.provider ??= {}

      await buildAgentRegistry(config)

      // TODO: parked extra (multiple accounts). Restore to expand `claude-code-<account>` providers.
      // const expanded = await expandAccountProviders(config)
      // if (expanded) {
      //   logStartupDiagnostics(
      //     claudeCodeProviders(config.provider),
      //     opencodeVersion,
      //   )
      //   return
      // }

      const existing = config.provider[PROVIDER_ID]
      config.provider[PROVIDER_ID] = {
        ...existing,
        ...(await providerConfig(existing)),
        models: configModelsForProvider(
          (existing?.models ?? {}) as OpenCodeProvider["models"],
          PROVIDER_ID,
        ),
      }
      logStartupDiagnostics(
        claudeCodeProviders(config.provider),
        opencodeVersion,
      )
    },
    // Only `session.deleted` is acted on. MCP config drift is still detected
    // at turn start by the hot-reload check in `claude-code-language-model.ts`,
    // which respawns claude safely between turns, and eviction on
    // `global.disposed` would kill an in-flight stream and abort the user's
    // current turn. A deleted session has no turn left to abort, and its
    // `claude` child would otherwise linger until the idle timer or LRU
    // pressure took it, with its session id kept for a resume that never comes.
    event: async ({ event }) => {
      const sessionID = extractDeletedSessionId(event)
      if (!sessionID) return
      const released = deleteActiveProcessesForSession(sessionID)
      if (released.length > 0) {
        log.info("released claude state for deleted session", { sessionID, released })
      }
    },
    provider: {
      id: PROVIDER_ID,
      models: async (provider) => defaultModelsForProvider(provider.models),
    },
  }
}

// Built-in plugin, registered in plugin/index.ts internalPlugins.
// WIP: hooks still use the plugin-era loose types in opencode-types.ts; drop the cast when those go.
export const ClaudeCodePlugin = claudeCodeServer as unknown as Plugin

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { ClaudeCodeLanguageModel } from "./claude-code-language-model.js"
export {
  type AgentRecord,
  getAgentRegistry,
  getDefaultSubagentModel,
  resolveAgentModel,
} from "./agent-models.js"
export { defaultModels } from "./models.js"
export type {
  ClaudeCodeConfig,
  ClaudeCodeProviderSettings,
  ClaudeStreamMessage,
} from "./types.js"
export type { OpenCodeHooks, OpenCodeModel, OpenCodePlugin } from "./opencode-types.js"
