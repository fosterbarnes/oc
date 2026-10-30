import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { EventV2 } from "@opencode-ai/core/event"
import { EventManifest } from "@/event-manifest"
import { InstanceDisposed } from "@/server/event"
import "@opencode-ai/core/account"
import "@/server/event"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import semver from "semver"
import { described } from "./metadata"
import { ApiNotFoundError, InvalidRequestError } from "../errors"

const GlobalHealth = Schema.Struct({
  healthy: Schema.Literal(true),
  version: Schema.String,
})

const SyncEventSchemas = EventManifest.Latest.values()
  .flatMap((definition) => {
    if (!definition.durable) return []
    return [
      Schema.Struct({
        type: Schema.Literal("sync"),
        id: EventV2.ID,
        syncEvent: Schema.Struct({
          type: Schema.Literal(EventV2.versionedType(definition.type, definition.durable.version)),
          id: EventV2.ID,
          seq: Schema.Finite,
          aggregateID: Schema.String,
          data: definition.data,
        }),
      }).annotate({ identifier: `SyncEvent.${definition.type}` }),
    ]
  })
  .toArray()

const GlobalEventSchema = Schema.Struct({
  directory: Schema.String,
  project: Schema.optional(Schema.String),
  workspace: Schema.optional(Schema.String),
  payload: Schema.Union([
    ...EventManifest.Latest.values()
      .map((definition) =>
        Schema.Struct({ id: EventV2.ID, type: Schema.Literal(definition.type), properties: definition.data }),
      )
      .toArray(),
    InstanceDisposed,
    ...SyncEventSchemas,
  ]),
}).annotate({ identifier: "GlobalEvent" })

export const GlobalUpgradeInput = Schema.Struct({
  target: Schema.String.check(
    Schema.makeFilter((value) => (semver.valid(value) === null ? "Expected a semantic version" : undefined)),
  ),
})

const GlobalUpgradeResult = Schema.Union([
  Schema.Struct({
    success: Schema.Literal(true),
    version: Schema.String,
  }),
  Schema.Struct({
    success: Schema.Literal(false),
    error: Schema.String,
  }),
])

export class ServerLifecycleUnavailable extends Schema.ErrorClass<ServerLifecycleUnavailable>(
  "ServerLifecycleUnavailable",
)(
  {
    name: Schema.Literal("ServerLifecycleUnavailable"),
    data: Schema.Struct({
      message: Schema.String,
    }),
  },
  { httpApiStatus: 409 },
) {}

export const GlobalPaths = {
  health: "/global/health",
  event: "/global/event",
  config: "/global/config",
  dispose: "/global/dispose",
  upgrade: "/global/upgrade",
  shutdown: "/global/shutdown",
  restart: "/global/restart",
  warmup: "/global/claude/warmup",
  claudeAccounts: "/global/claude/accounts",
} as const

const ClaudeManagedAccount = Schema.Struct({
  id: Schema.String,
  /** The `accounts` entry as written in opencode.jsonc (`~/.claude2`). */
  entry: Schema.String,
  label: Schema.String,
  name: Schema.optional(Schema.String),
  /** Absent when the CLI could not be asked. */
  loggedIn: Schema.optional(Schema.Boolean),
  email: Schema.optional(Schema.String),
  plan: Schema.optional(Schema.String),
  current: Schema.Boolean,
  limitedUntil: Schema.optional(Schema.Number),
  /** CLAUDE_CONFIG_DIR for this account's CLI; absent means unset (the default account). */
  configDir: Schema.optional(Schema.String),
})

const ClaudeManagedAccounts = Schema.Struct({
  accounts: Schema.Array(ClaudeManagedAccount),
  /** The account `add` created. */
  added: Schema.optional(Schema.String),
  /** `claude auth login` as the server resolves the CLI; the TUI runs it in its own terminal. */
  login: Schema.Struct({ command: Schema.String, args: Schema.Array(Schema.String), shell: Schema.Boolean }),
})

// `signedIn`: the TUI finished `claude auth login` for `id`; old limits and usage caches are dropped.
const ClaudeAccountAction = Schema.Union([
  Schema.Struct({ action: Schema.Literal("add"), name: Schema.optional(Schema.String) }),
  Schema.Struct({ action: Schema.Literal("rename"), id: Schema.String, name: Schema.String }),
  Schema.Struct({ action: Schema.Literal("remove"), id: Schema.String }),
  Schema.Struct({ action: Schema.Literal("signedIn"), id: Schema.String }),
  Schema.Struct({ action: Schema.Literal("signOut"), id: Schema.String }),
])

export type ClaudeAccountActionType = typeof ClaudeAccountAction.Type

const WarmupTimeList = Schema.mutable(Schema.Array(Schema.String))

const WarmupDailySchedule = Schema.Struct({
  mode: Schema.Literal("daily"),
  times: WarmupTimeList,
})

const WarmupWeekDays = Schema.Struct({
  mon: WarmupTimeList,
  tue: WarmupTimeList,
  wed: WarmupTimeList,
  thu: WarmupTimeList,
  fri: WarmupTimeList,
  sat: WarmupTimeList,
  sun: WarmupTimeList,
})

const WarmupWeeklySchedule = Schema.Struct({
  mode: Schema.Literal("weekly"),
  days: WarmupWeekDays,
})

const WarmupSchedule = Schema.Union([WarmupDailySchedule, WarmupWeeklySchedule])

const WarmupLastAttempt = Schema.Struct({
  scheduledAt: Schema.Finite,
  attemptedAt: Schema.Finite,
  outcome: Schema.Literals(["sent", "rejected", "failed", "timeout", "missed"]),
})

const WarmupAccount = Schema.Struct({
  accountID: Schema.String,
  label: Schema.String,
  enabled: Schema.Boolean,
  schedule: WarmupSchedule,
  nextAt: Schema.optional(Schema.Finite),
  lastAttempt: Schema.optional(WarmupLastAttempt),
})

const WarmupState = Schema.Struct({
  accounts: Schema.mutable(Schema.Array(WarmupAccount)),
  timeZone: Schema.String,
  utcOffset: Schema.String,
  available: Schema.Boolean,
  error: Schema.optional(Schema.String),
})

const WarmupSetInput = Schema.Struct({
  accountID: Schema.String,
  enabled: Schema.Boolean,
  schedule: WarmupSchedule,
})

export class ApiWarmupScheduleError extends Schema.ErrorClass<ApiWarmupScheduleError>("WarmupScheduleError")(
  {
    name: Schema.Literal("WarmupScheduleError"),
    data: Schema.Struct({
      message: Schema.String,
    }),
  },
  { httpApiStatus: 400 },
) {}

export class ApiWarmupStoreError extends Schema.ErrorClass<ApiWarmupStoreError>("WarmupStoreError")(
  {
    name: Schema.Literal("WarmupStoreError"),
    data: Schema.Struct({
      message: Schema.String,
    }),
  },
  { httpApiStatus: 500 },
) {}

export type WarmupSetInputType = typeof WarmupSetInput.Type
export type WarmupAccountType = typeof WarmupAccount.Type
export type WarmupStateType = typeof WarmupState.Type

export const GlobalApi = HttpApi.make("global").add(
  HttpApiGroup.make("global")
    .add(
      HttpApiEndpoint.get("health", GlobalPaths.health, {
        success: described(GlobalHealth, "Health information"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.health",
          summary: "Get health",
          description: "Get health information about the OpenCode server.",
        }),
      ),
      HttpApiEndpoint.get("event", GlobalPaths.event, {
        success: GlobalEventSchema,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.event",
          summary: "Get global events",
          description: "Subscribe to global events from the OpenCode system using server-sent events.",
        }),
      ),
      HttpApiEndpoint.get("configGet", GlobalPaths.config, {
        success: described(ConfigV1.Info, "Get global config info"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.config.get",
          summary: "Get global configuration",
          description: "Retrieve the current global OpenCode configuration settings and preferences.",
        }),
      ),
      HttpApiEndpoint.patch("configUpdate", GlobalPaths.config, {
        payload: ConfigV1.Info,
        success: described(ConfigV1.Info, "Successfully updated global config"),
        error: HttpApiError.BadRequest,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.config.update",
          summary: "Update global configuration",
          description: "Update global OpenCode configuration settings and preferences.",
        }),
      ),
      HttpApiEndpoint.post("dispose", GlobalPaths.dispose, {
        success: described(Schema.Boolean, "Global disposed"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.dispose",
          summary: "Dispose instance",
          description: "Clean up and dispose all OpenCode instances, releasing all resources.",
        }),
      ),
      HttpApiEndpoint.post("upgrade", GlobalPaths.upgrade, {
        payload: GlobalUpgradeInput,
        success: described(GlobalUpgradeResult, "Upgrade result"),
        error: HttpApiError.BadRequest,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.upgrade",
          summary: "Upgrade opencode",
          description: "Upgrade opencode to the specified version.",
        }),
      ),
      HttpApiEndpoint.post("shutdown", GlobalPaths.shutdown, {
        success: described(Schema.Boolean, "Server shutdown scheduled"),
        error: ServerLifecycleUnavailable,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.shutdown",
          summary: "Shut down server",
          description: "Dispose OpenCode instances and stop a managed server.",
        }),
      ),
      HttpApiEndpoint.post("restart", GlobalPaths.restart, {
        success: described(Schema.Boolean, "Server restart scheduled"),
        error: ServerLifecycleUnavailable,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.restart",
          summary: "Restart server",
          description: "Dispose OpenCode instances and restart a managed server.",
        }),
      ),
      HttpApiEndpoint.get("claudeWarmup", GlobalPaths.warmup, {
        success: described(WarmupState, "Claude warm-up schedules"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.claudeWarmup",
          summary: "Get Claude warm-up schedules",
          description:
            "Connected Claude accounts with their warm-up schedules, next occurrence, latest attempt, and server time zone.",
        }),
      ),
      HttpApiEndpoint.put("setClaudeWarmup", GlobalPaths.warmup, {
        payload: WarmupSetInput,
        success: described(WarmupAccount, "Updated warm-up account"),
        error: [ApiWarmupScheduleError, ApiNotFoundError, ApiWarmupStoreError],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.setClaudeWarmup",
          summary: "Set Claude warm-up schedule",
          description: "Save or pause one account's warm-up schedule. Saving an empty schedule disables it.",
        }),
      ),
      HttpApiEndpoint.get("claudeAccounts", GlobalPaths.claudeAccounts, {
        success: described(ClaudeManagedAccounts, "Claude Code pool accounts with sign-in status"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.claudeAccounts",
          summary: "Get managed Claude accounts",
          description: "Every Claude Code pool account with its name, signed-in email, plan, and usage limit.",
        }),
      ),
      HttpApiEndpoint.post("claudeAccountAction", GlobalPaths.claudeAccounts, {
        payload: ClaudeAccountAction,
        success: described(ClaudeManagedAccounts, "Claude Code pool accounts after the change"),
        error: [InvalidRequestError, ApiNotFoundError],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.claudeAccountAction",
          summary: "Change Claude accounts",
          description:
            "Add (folder, shared links, pool entry), rename, remove from the pool, sign out, or record a finished sign-in. Add and remove save opencode.jsonc and reload instances like a config update.",
        }),
      ),
    )
    .annotateMerge(OpenApi.annotations({ title: "global", description: "Global server routes." })),
)
