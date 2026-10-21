import { asSchema, jsonSchema, type JSONSchema7, type Tool as AITool } from "ai"
import { Option, Schema } from "effect"

// Deterministic shape repair for model-written tool arguments. A value changes only where the
// schema makes the intended value unambiguous; unions, compositions and unknown keywords are left alone.
// Repairs are idempotent, so the validator and the executor may both apply them.
const MAX_DEPTH = 6
const DECIMAL = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/
const COMPOSITION_KEYWORDS = ["anyOf", "oneOf", "allOf", "enum", "const", "$ref", "nullable"]
const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))

type Node = Record<string, unknown>

export function repairInput(value: unknown, schema: JSONSchema7): unknown {
  return repairNode(value, schema, schema, 0)
}

// Maps a misnamed tool call to the one available tool whose name differs only in case, separators
// (`_`, `-`, `.`, spaces) or a leaked `functions.` prefix. Ambiguous or unknown names stay unrepaired.
export function repairToolName(name: string, available: readonly string[]): string | undefined {
  if (available.includes(name)) return name
  const key = toolNameKey(name.replace(/^functions\./, ""))
  const matches = available.filter((candidate) => toolNameKey(candidate) === key)
  return matches.length === 1 ? matches[0] : undefined
}

function toolNameKey(name: string) {
  return name.toLowerCase().replace(/[\s_.-]/g, "")
}

// Keeps the advertised schema for the model. Repairs run in the input validator, before any validation the tool already has,
// and in execute for callers that skip AI SDK validation.
export function withInputRepair(tool: AITool, schema: JSONSchema7): AITool {
  const advertised = asSchema(tool.inputSchema)
  const execute = tool.execute
  return {
    ...tool,
    inputSchema: jsonSchema(advertised.jsonSchema, {
      validate: async (value) => {
        const repaired = repairInput(value, schema)
        if (!advertised.validate) return { success: true, value: repaired }
        return advertised.validate(repaired)
      },
    }),
    execute: execute && ((args, options) => execute(repairInput(args, schema), options)),
  }
}

function repairNode(value: unknown, schema: unknown, root: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH || !isRecord(schema)) return value
  if (typeof schema.$ref === "string") return repairRef(value, schema.$ref, root, depth)
  if (Array.isArray(schema.type)) return repairUnion(value, schema, schema.type, root, depth)
  if (schema.type === undefined) return repairBranches(value, schema, root, depth)
  switch (schema.type) {
    case "number":
    case "integer":
      return repairNumber(value, schema.type)
    case "boolean":
      return repairBoolean(value)
    case "object":
      return repairObject(value, schema, root, depth)
    case "array":
      return repairArray(value, schema, root, depth)
    default:
      return value
  }
}

// Only local references resolve; external or unknown references leave the value untouched.
function repairRef(value: unknown, ref: string, root: unknown, depth: number): unknown {
  const match = /^#\/(\$defs|definitions)\/([^/]+)$/.exec(ref)
  const definitions = match && isRecord(root) ? root[match[1]] : undefined
  if (!match || !isRecord(definitions)) return value
  const name = match[2].replaceAll("~1", "/").replaceAll("~0", "~")
  if (!Object.hasOwn(definitions, name)) return value
  return repairNode(value, definitions[name], root, depth + 1)
}

// Repairs a type list only when exactly one non-null type remains.
function repairUnion(value: unknown, schema: Node, types: unknown[], root: unknown, depth: number): unknown {
  if (value === null && types.includes("null")) return value
  if (types.includes(typeOf(value))) return value
  const nonNull = types.filter((type) => type !== "null")
  if (nonNull.length !== 1) return value
  return repairNode(value, { ...schema, type: nonNull[0] }, root, depth + 1)
}

// Repairs an untyped schema only when exactly one non-null branch can accept the value.
function repairBranches(value: unknown, schema: Node, root: unknown, depth: number): unknown {
  if (Array.isArray(schema.anyOf) && Array.isArray(schema.oneOf)) return value
  const branches = Array.isArray(schema.anyOf) ? schema.anyOf : schema.oneOf
  if (!Array.isArray(branches) || value === null) return value
  if (branches.some((branch) => !isRecord(branch) || branch.type === typeOf(value))) return value
  const candidates = branches.filter((branch) => isRecord(branch) && branch.type !== "null")
  return candidates.length === 1 ? repairNode(value, candidates[0], root, depth + 1) : value
}

function repairNumber(value: unknown, type: unknown) {
  if (typeof value !== "string" || !DECIMAL.test(value)) return value
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return value
  if (type === "integer" && !Number.isSafeInteger(parsed)) return value
  return parsed
}

function repairBoolean(value: unknown) {
  if (value === "true") return true
  if (value === "false") return false
  return value
}

function repairObject(value: unknown, schema: Node, root: unknown, depth: number): unknown {
  const parsed = typeof value === "string" ? Option.getOrUndefined(decodeJson(value)) : value
  if (!isRecord(parsed)) return value

  const properties = isRecord(schema.properties) ? schema.properties : {}
  const required = Array.isArray(schema.required) ? schema.required : []
  const composed = [schema.allOf, schema.anyOf, schema.oneOf].some(Array.isArray)
  const patterned = isRecord(schema.patternProperties)
  const closed = schema.additionalProperties === false && !composed && !patterned

  const entries = Object.entries(parsed).flatMap(([key, current]) => {
    const declared = Object.hasOwn(properties, key)
    if (!declared && closed) return []
    const property = declared ? properties[key] : patterned ? undefined : schema.additionalProperties
    if (!isRecord(property)) return [[key, current] as const]
    if (declared && !required.includes(key) && isBareType(property, composed) && isPlaceholder(current, property))
      return []
    return [[key, repairNode(current, property, root, depth + 1)] as const]
  })

  const unchanged =
    entries.length === Object.keys(parsed).length && entries.every(([key, item]) => item === parsed[key])
  if (unchanged) return parsed
  return Object.fromEntries(entries)
}

function repairArray(value: unknown, schema: Node, root: unknown, depth: number): unknown {
  const parsed = typeof value === "string" ? Option.getOrUndefined(decodeJson(value)) : value
  const tuple = Array.isArray(schema.prefixItems)
    ? schema.prefixItems
    : Array.isArray(schema.items)
      ? schema.items
      : undefined

  if (Array.isArray(parsed)) {
    const repaired = parsed.map((item, index) => {
      const member = tuple
        ? (tuple[index] ?? (Array.isArray(schema.prefixItems) ? schema.items : schema.additionalItems))
        : schema.items
      return repairNode(item, member, root, depth + 1)
    })
    return repaired.every((item, index) => item === parsed[index]) ? parsed : repaired
  }

  // A bare value for an array of items is wrapped only when the repaired value is a valid item.
  if (tuple || !isRecord(schema.items)) return value
  const item = repairNode(value, schema.items, root, depth + 1)
  return isItem(item, schema.items) ? [item] : value
}

// A single-type property rejects null and `{}` placeholders; compositions, enums and nullable flags may accept them.
function isBareType(property: Node, composed: boolean) {
  return (
    typeof property.type === "string" &&
    property.type !== "null" &&
    !composed &&
    COMPOSITION_KEYWORDS.every((keyword) => !Object.hasOwn(property, keyword))
  )
}

function isPlaceholder(value: unknown, property: Node) {
  if (value === null) return true
  return isRecord(value) && Object.keys(value).length === 0 && property.type !== "object"
}

function isItem(value: unknown, items: Node) {
  switch (items.type) {
    case "object":
      return isRecord(value)
    case "array":
      return Array.isArray(value)
    case "integer":
      return Number.isSafeInteger(value)
    case "number":
      return typeof value === "number" && Number.isFinite(value)
    case "string":
    case "boolean":
      return typeof value === items.type
    default:
      return false
  }
}

function typeOf(value: unknown) {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  return typeof value
}

function isRecord(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export * as ToolInputRepair from "./inputRepair"
