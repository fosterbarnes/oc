export * as ConfigCommandV1 from "./command"

import { Schema } from "effect"
import { ConfigPermissionV1 } from "./permission"

// Per oc tool id (or "*"): which implementation a third-party harness (Claude Code) runs for the
// command's turn. "auto" prefers the harness's own tool unless the command's rules need oc to enforce them.
export const ToolHost = Schema.Record(Schema.String, Schema.Literals(["auto", "oc", "harness"]))
export type ToolHost = Schema.Schema.Type<typeof ToolHost>

export const Info = Schema.Struct({
  template: Schema.String,
  description: Schema.optional(Schema.String),
  agent: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  variant: Schema.optional(Schema.String),
  subtask: Schema.optional(Schema.Boolean),
  // Permissions for the command's own turn only, not the persistent session.
  permission: Schema.optional(ConfigPermissionV1.Info),
  toolHost: Schema.optional(ToolHost),
})
export type Info = Schema.Schema.Type<typeof Info>
