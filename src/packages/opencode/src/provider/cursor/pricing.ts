/**
 * Cursor model token pricing for OpenCode cost reporting.
 *
 * Rates come from Cursor's public docs (Cursor Models + Other Models tables).
 * Generated data lives in `pricing-data.ts`; regenerate with
 * `bun run generate:pricing`. Unknown / unpublished models get no `cost`.
 */

import { CURSOR_MODEL_COSTS } from "./pricing-data.js"

/** Classic OpenCode / models.dev cost shape used in provider config. */
export type OpenCodeModelCost = {
  input: number
  output: number
  cache_read?: number
  cache_write?: number
  context_over_200k?: OpenCodeModelCost
}

export type CursorPricingCoverage = {
  priced: string[]
  missing: string[]
}

/**
 * Models we expose that Cursor does not currently publish numeric rates for
 * (Auto is billed at the routed model's list price).
 */
export const CURSOR_UNPRICED_MODEL_IDS = ["default"] as const

const UNPRICED = new Set<string>(CURSOR_UNPRICED_MODEL_IDS)

/** Resolve legacy `-1m` aliases while retaining arbitrary generated tier keys. */
export function wireModelIdForPricing(modelId: string): {
  baseId: string
  longContextEntry: boolean
} {
  const match = /^(.*)-1m(?:-\d+)?(-fast)?$/.exec(modelId)
  if (match) {
    return { baseId: `${match[1]!}${match[2] ?? ""}`, longContextEntry: true }
  }
  return { baseId: modelId, longContextEntry: false }
}

/**
 * True when Cursor publishes a distinct Fast rate for this wire model id.
 * Catalog code uses this to split Fast variants into a `-fast` entry.
 */
export function hasCursorFastPricing(modelId: string): boolean {
  return Object.prototype.hasOwnProperty.call(CURSOR_MODEL_COSTS, `${modelId}-fast`)
}

function asMutableCost(value: OpenCodeModelCost): OpenCodeModelCost {
  const copy: OpenCodeModelCost = { input: value.input, output: value.output }
  if (value.cache_read !== undefined) copy.cache_read = value.cache_read
  if (value.cache_write !== undefined) copy.cache_write = value.cache_write
  if (value.context_over_200k) {
    copy.context_over_200k = asMutableCost(value.context_over_200k)
  }
  return copy
}

/**
 * Look up classic OpenCode cost for a catalog / wire model id.
 * Synthetic `-1m` entries retain both base and documented long-context rates.
 * Synthetic `-fast` entries are stored as their own keys.
 */
export function getCursorModelCost(modelId: string): OpenCodeModelCost | undefined {
  const direct = (CURSOR_MODEL_COSTS as Record<string, OpenCodeModelCost>)[modelId]
  if (direct) return asMutableCost(direct)
  const { baseId, longContextEntry } = wireModelIdForPricing(modelId)
  const found = (CURSOR_MODEL_COSTS as Record<string, OpenCodeModelCost>)[baseId]
  if (!found) return undefined
  const cost = asMutableCost(found)
  if (longContextEntry && cost.context_over_200k) return asMutableCost(cost.context_over_200k)
  return cost
}

export function applyCursorModelCost<T extends Record<string, unknown>>(
  modelId: string,
  entry: T,
): T & { cost?: OpenCodeModelCost } {
  const modelCost = getCursorModelCost(modelId)
  if (!modelCost) return entry
  return { ...entry, cost: modelCost }
}

/**
 * Coverage helper for CI / maintainer checks.
 * Intentionally unpriced first-party ids are counted as priced (covered).
 */
export function checkCursorPricingCoverage(modelIds: string[]): CursorPricingCoverage {
  const priced: string[] = []
  const missing: string[] = []
  for (const modelId of modelIds) {
    const { baseId } = wireModelIdForPricing(modelId)
    if (UNPRICED.has(baseId) || getCursorModelCost(modelId)) priced.push(modelId)
    else missing.push(modelId)
  }
  return { priced, missing }
}
