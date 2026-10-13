export * as ProviderUsage from "./provider-usage"

import { Schema } from "effect"
import { define, inventory } from "./event"
import { optional } from "./schema"

export interface Window extends Schema.Schema.Type<typeof Window> {}
export const Window = Schema.Struct({
  id: Schema.String,
  usedPercent: Schema.Finite,
  observedAt: Schema.Finite,
  resetMs: Schema.Finite.pipe(optional),
  minutes: Schema.Int.pipe(optional),
}).annotate({ identifier: "ProviderUsage.Window" })

const fields = {
  providerID: Schema.String,
  accountID: Schema.String,
  /** Latest observation time; each window keeps its own original observedAt. */
  observedAt: Schema.Finite,
  windows: Schema.Array(Window),
}

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct(fields).annotate({ identifier: "ProviderUsage.Info" })

const Updated = define({
  type: "provider.usage.updated",
  schema: fields,
})
export const Event = { Updated, Definitions: inventory(Updated) }
