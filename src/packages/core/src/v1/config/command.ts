export * as ConfigCommandV1 from "./command"

import { Schema } from "effect"
import { ConfigPermissionV1 } from "./permission"

export const Info = Schema.Struct({
  template: Schema.String,
  description: Schema.optional(Schema.String),
  agent: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  variant: Schema.optional(Schema.String),
  subtask: Schema.optional(Schema.Boolean),
  // Permissions for the command's own turn only, not the persistent session.
  permission: Schema.optional(ConfigPermissionV1.Info),
})
export type Info = Schema.Schema.Type<typeof Info>
