export * as ConfigCompaction from "./compaction"

import { Schema } from "effect"
import { NonNegativeInt, PositiveInt } from "../schema"

export class Keep extends Schema.Class<Keep>("ConfigV2.Compaction.Keep")({
  tokens: NonNegativeInt.pipe(Schema.optional),
}) {}

// Shared by provider overrides; a future limit.models record can reuse it.
export class LimitEntry extends Schema.Class<LimitEntry>("ConfigV2.Compaction.LimitEntry")({
  tokens: PositiveInt.pipe(Schema.optional),
  action: Schema.Literals(["compact", "handoff", "off"]).pipe(Schema.optional),
}) {}

export class Limit extends Schema.Class<Limit>("ConfigV2.Compaction.Limit")({
  tokens: PositiveInt.pipe(Schema.optional),
  action: Schema.Literals(["compact", "handoff", "off"]).pipe(Schema.optional),
  providers: Schema.Record(Schema.String, LimitEntry).pipe(Schema.optional),
}) {}

export class Info extends Schema.Class<Info>("ConfigV2.Compaction")({
  auto: Schema.Boolean.pipe(Schema.optional),
  prune: Schema.Boolean.pipe(Schema.optional),
  keep: Keep.pipe(Schema.optional),
  buffer: NonNegativeInt.pipe(Schema.optional),
  limit: Limit.pipe(Schema.optional),
}) {}
