export * as ConfigCommandV1 from "./command"

import { Schema } from "effect"

export const Info = Schema.Struct({
  template: Schema.String,
  description: Schema.optional(Schema.String),
  agent: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  variant: Schema.optional(Schema.String),
  subtask: Schema.optional(Schema.Boolean),
  // Tool permissions for the command's own turn only (stored on its user message as `tools`).
  permission: Schema.optional(Schema.Record(Schema.String, Schema.Literals(["allow", "deny"]))),
})
export type Info = Schema.Schema.Type<typeof Info>
