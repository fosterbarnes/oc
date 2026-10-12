#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { format } from "prettier"

export const CURSOR_PRICING_DOC_URL = "https://cursor.com/docs/models-and-pricing.md"
export const CURSOR_CONTEXT_DOC_URL = "https://cursor.com/docs.md"

export type OpenCodeModelCost = {
  input: number
  output: number
  cache_read?: number
  cache_write?: number
  context_over_200k?: OpenCodeModelCost
}

export type CursorModelContext = { maxContext?: number; maxContextForMaxMode?: number }
export type CursorModelCapabilities = { supportsImages: boolean }

const MODEL_IDS: Record<string, string> = {
  "Claude 4 Sonnet": "claude-sonnet-4",
  "Claude 4.5 Haiku": "claude-haiku-4-5",
  "Claude 4.5 Opus": "claude-opus-4-5",
  "Claude 4.5 Sonnet": "claude-sonnet-4-5",
  "Claude 4.6 Opus": "claude-opus-4-6",
  "Claude 4.6 Sonnet": "claude-sonnet-4-6",
  "Claude 4.7 Opus": "claude-opus-4-7",
  "Claude Fable 5": "claude-fable-5",
  "Claude Fable 5.1": "claude-fable-5-1",
  "Claude Opus 4.8": "claude-opus-4-8",
  "Claude Opus 5": "claude-opus-5",
  "Claude Opus 5.5": "claude-opus-5-5",
  "Claude Sonnet 5": "claude-sonnet-5",
  "Composer 2.5": "composer-2.5",
  "Gemini 2.5 Flash": "gemini-2.5-flash",
  "Gemini 3 Flash": "gemini-3-flash",
  "Gemini 3.1 Pro": "gemini-3.1-pro",
  "Gemini 3.5 Flash": "gemini-3.5-flash",
  "Gemini 3.6 Flash": "gemini-3.6-flash",
  "Gemini 3.7 Flash": "gemini-3.7-flash",
  "Gemini 3.8 Flash": "gemini-3.8-flash",
  "GLM 5.2": "glm-5.2",
  "GPT-5 Mini": "gpt-5-mini",
  "GPT-5.1 Codex": "gpt-5.1",
  "GPT-5.2": "gpt-5.2",
  "GPT-5.3 Codex": "gpt-5.3-codex",
  "GPT-5.4": "gpt-5.4",
  "GPT-5.4 Mini": "gpt-5.4-mini",
  "GPT-5.4 Nano": "gpt-5.4-nano",
  "GPT-5.5": "gpt-5.5",
  "GPT-5.6 Luna": "gpt-5.6-luna",
  "GPT-5.6 Sol": "gpt-5.6-sol",
  "GPT-5.6 Terra": "gpt-5.6-terra",
  "Grok 4.5": "grok-4.5",
  "Grok 4.6": "grok-4.6",
  "Grok 4.7": "grok-4.7",
  "Kimi K2.7 Code": "kimi-k2.7-code",
  "Kimi K3": "kimi-k3",
  "Muse Spark 1.3": "muse-spark-1.3",
}

const SKIP = new Set([
  "Auto Cost",
  "Composer 1",
  "Claude Opus 4.7 (fast mode)",
  "Gemini 3 Pro",
  "Gemini 3 Pro Image Preview",
  "GPT-5",
  "GPT-5 Fast",
  "GPT-5-Codex",
  "GPT-5.1 Codex Max",
  "GPT-5.1 Codex Mini",
  "GPT-5.2 Codex",
  "Legacy Enterprise Auto",
])

type PricingRow = { name: string; cost: OpenCodeModelCost; notes: string }

function displayName(value: string): string {
  return value.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim()
}

function money(value: string): number | undefined {
  if (!value || value === "-" || value === "-") return undefined
  const match = /^\$([\d.]+)$/.exec(value)
  if (!match) throw new Error(`Invalid money cell ${JSON.stringify(value)}`)
  return Number(match[1])
}

function context(value: string): number | undefined {
  if (!value || value === "-" || value === "-") return undefined
  const match = /^(\d+(?:\.\d+)?)\s*([km])$/i.exec(value)
  if (!match) throw new Error(`Invalid context cell ${JSON.stringify(value)}`)
  return Number(match[1]) * (match[2]!.toLowerCase() === "k" ? 1_000 : 1_000_000)
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())
}

function modelId(name: string): string | undefined {
  const fast = name.match(/^(.*) \(Fast\)$/)
  if (fast) {
    const id = modelId(fast[1]!)
    return id ? `${id}-fast` : undefined
  }
  const tier = name.match(/^(.*) (500k|1M)$/i)
  if (tier) {
    const id = MODEL_IDS[tier[1]!]
    return id ? `${id}-${tier[2]!.toLowerCase()}` : undefined
  }
  return MODEL_IDS[name]
}

function contextModelId(name: string): string | undefined {
  return MODEL_IDS[name] ?? MODEL_IDS[name.replace(/ (?:500k|1M)$/i, "")]
}

function parsePricing(markdown: string): PricingRow[] {
  const rows: PricingRow[] = []
  let table = false
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith("|")) {
      table = false
      continue
    }
    const row = cells(line)
    if (!table) {
      table = row[0]?.toLowerCase() === "model" && row[2]?.toLowerCase() === "input"
      continue
    }
    if (row.every((cell) => /^[-:\s]+$/.test(cell))) continue
    if (row.length < 6) throw new Error(`Pricing row has too few cells: ${line}`)
    const input = money(row[2]!)
    const output = money(row[5]!)
    if (input === undefined || output === undefined) throw new Error(`Missing price for ${row[0]}`)
    const cost: OpenCodeModelCost = { input, output }
    const cacheWrite = money(row[3]!)
    const cacheRead = money(row[4]!)
    if (cacheRead !== undefined) cost.cache_read = cacheRead
    if (cacheWrite !== undefined) cost.cache_write = cacheWrite
    rows.push({ name: displayName(row[0]!), cost, notes: row[6] ?? "" })
  }
  if (rows.length === 0) throw new Error("No pricing table found")
  return rows
}

function inputTwice(cost: OpenCodeModelCost): OpenCodeModelCost {
  return {
    ...cost,
    input: cost.input * 2,
    ...(cost.cache_read === undefined ? {} : { cache_read: cost.cache_read * 2 }),
    ...(cost.cache_write === undefined ? {} : { cache_write: cost.cache_write * 2 }),
  }
}

export function buildPricingTable(markdown: string): Record<string, OpenCodeModelCost> {
  const table: Record<string, OpenCodeModelCost> = {}
  const explicitLong = new Set<string>()
  const oneMillion = new Map<string, OpenCodeModelCost>()
  for (const row of parsePricing(markdown)) {
    if (SKIP.has(row.name) || /\(fast mode\)/i.test(row.name)) continue
    const id = modelId(row.name)
    if (!id) throw new Error(`Unmapped pricing display name ${JSON.stringify(row.name)}`)
    if (/ 1M(?: \(Fast\))?$/i.test(row.name)) {
      table[id] = row.cost
      const baseId = id.replace(/-1m-fast$/, "-fast").replace(/-1m$/, "")
      oneMillion.set(baseId, row.cost)
      continue
    }
    if (/ 500k(?: \(Fast\))?$/i.test(row.name)) explicitLong.add(id.replace(/-500k-fast$/, "").replace(/-500k$/, ""))
    table[id] = row.cost
    if (
      !/ 500k(?: \(Fast\))?$/i.test(row.name) &&
      /2x (?:when (?:the )?input exceeds 200k|input pricing)/i.test(row.notes)
    ) {
      table[id].context_over_200k = inputTwice(row.cost)
    }
  }
  for (const [id, cost] of oneMillion) {
    const base = table[id]
    table[id] = base ? { ...base, context_over_200k: cost } : cost
  }
  for (const id of explicitLong) {
    if (table[id]?.context_over_200k) delete table[id].context_over_200k
  }
  return Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b)))
}

function parseContextTable(markdown: string): Array<{ name: string; context?: number; max?: number; images: boolean }> {
  const rows: Array<{ name: string; context?: number; max?: number; images: boolean }> = []
  let table = false
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith("|")) {
      if (table) break
      continue
    }
    const row = cells(line)
    if (!table) {
      table = row[0]?.toLowerCase() === "model" && row[2]?.toLowerCase() === "default context"
      continue
    }
    if (row.every((cell) => /^[-:\s]+$/.test(cell))) continue
    rows.push({
      name: displayName(row[0]!),
      context: context(row[2]!),
      max: context(row[3]!),
      images: row[4]!.includes("Images"),
    })
  }
  if (rows.length === 0) throw new Error("No context table found")
  return rows
}

export function buildContextTable(markdown: string): Record<string, CursorModelContext> {
  const table: Record<string, CursorModelContext> = {}
  for (const row of parseContextTable(markdown)) {
    if (SKIP.has(row.name)) continue
    const id = contextModelId(row.name)
    if (!id) throw new Error(`Unmapped context display name ${JSON.stringify(row.name)}`)
    table[id] = {
      ...table[id],
      ...(row.context === undefined ? {} : { maxContext: row.context }),
      ...(row.max === undefined ? {} : { maxContextForMaxMode: row.max }),
    }
  }
  return Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b)))
}

export function buildCapabilityTable(markdown: string): Record<string, CursorModelCapabilities> {
  const entries: [string, CursorModelCapabilities][] = parseContextTable(markdown)
    .filter((row) => !SKIP.has(row.name))
    .map((row) => {
      const id = contextModelId(row.name)
      if (!id) throw new Error(`Unmapped capability display name ${JSON.stringify(row.name)}`)
      return [id, { supportsImages: row.images }]
    })
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)))
}

function load(url: string, file: string | undefined): Promise<{ text: string; source: string }> {
  if (file) return Promise.resolve({ text: readFileSync(file, "utf8"), source: url })
  return fetch(url, { headers: { Accept: "text/markdown", "User-Agent": "opencode-cursor-pricing" } }).then(
    async (response) => {
      if (!response.ok && url.endsWith(".md")) {
        const mirror = await fetch(`https://r.jina.ai/http://${url.slice("https://".length)}`)
        if (mirror.ok) return { text: await mirror.text(), source: url }
      }
      if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`)
      return { text: await response.text(), source: url }
    },
  )
}

async function render(
  pricing: Record<string, OpenCodeModelCost>,
  contexts: Record<string, CursorModelContext>,
  capabilities: Record<string, CursorModelCapabilities>,
  pricingSource: string,
  contextSource: string,
): Promise<string> {
  return format(
    `/**\n * AUTO-GENERATED by scripts/generateCursorPricing.ts - do not edit by hand.\n * Pricing source: ${pricingSource}\n * Context source: ${contextSource}\n * Regenerate: bun run generate:pricing\n */\n\nexport const CURSOR_PRICING_SOURCE = ${JSON.stringify(pricingSource)} as const\nexport const CURSOR_CONTEXT_SOURCE = ${JSON.stringify(contextSource)} as const\n\nexport const CURSOR_MODEL_COSTS = ${JSON.stringify(pricing, null, 2)} as const\n\nexport const CURSOR_MODEL_CONTEXTS = ${JSON.stringify(contexts, null, 2)} as const\n\nexport const CURSOR_MODEL_CAPABILITIES = ${JSON.stringify(capabilities, null, 2)} as const\n`,
    { parser: "typescript" },
  )
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const fromIndex = args.indexOf("--from-file")
  const contextFromIndex = args.indexOf("--context-from-file")
  const from = fromIndex === -1 ? undefined : args[fromIndex + 1]
  const contextFrom = contextFromIndex === -1 ? undefined : args[contextFromIndex + 1]
  const check = args.includes("--check")
  const pricing = await load(CURSOR_PRICING_DOC_URL, from)
  const contextDoc = await load(CURSOR_CONTEXT_DOC_URL, contextFrom)
  const next = await render(
    buildPricingTable(pricing.text),
    buildContextTable(contextDoc.text),
    buildCapabilityTable(contextDoc.text),
    pricing.source,
    contextDoc.source,
  )
  const dest = path.resolve(import.meta.dir, "../src/provider/cursor/pricing-data.ts")
  if (check) {
    if (readFileSync(dest, "utf8") !== next) throw new Error("pricing-data.ts is stale; run bun run generate:pricing")
    console.log("pricing-data.ts is current")
    return
  }
  writeFileSync(dest, next)
  console.log(`Wrote ${dest}`)
}

if (import.meta.main)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
