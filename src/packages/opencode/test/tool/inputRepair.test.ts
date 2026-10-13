import { describe, expect, test } from "bun:test"
import type { JSONSchema7 } from "ai"
import { ToolInputRepair } from "@/tool/inputRepair"

const repair = ToolInputRepair.repairInput

const object = (properties: Record<string, JSONSchema7>, extra: JSONSchema7 = {}): JSONSchema7 => ({
  type: "object",
  properties,
  ...extra,
})

const integer: JSONSchema7 = { type: "integer" }
const number: JSONSchema7 = { type: "number" }
const boolean: JSONSchema7 = { type: "boolean" }
const string: JSONSchema7 = { type: "string" }

describe("scalar repair", () => {
  const cases: [string, unknown, JSONSchema7, unknown][] = [
    ["integer string", { limit: "20" }, object({ limit: integer }), { limit: 20 }],
    ["number string", { ratio: "0.5" }, object({ ratio: number }), { ratio: 0.5 }],
    ["exponent string", { limit: "1e3" }, object({ limit: integer }), { limit: 1000 }],
    ["fractional string for integer", { limit: "2.5" }, object({ limit: integer }), { limit: "2.5" }],
    ["unsafe integer string", { limit: "9007199254740993" }, object({ limit: integer }), { limit: "9007199254740993" }],
    ["hex string is not a number", { limit: "0x10" }, object({ limit: number }), { limit: "0x10" }],
    ["padded string is not a number", { limit: " 20" }, object({ limit: number }), { limit: " 20" }],
    ["overflow to Infinity", { limit: "1e400" }, object({ limit: number }), { limit: "1e400" }],
    ["exact boolean true", { enabled: "true" }, object({ enabled: boolean }), { enabled: true }],
    ["exact boolean false", { enabled: "false" }, object({ enabled: boolean }), { enabled: false }],
    ["boolean is case sensitive", { enabled: "True" }, object({ enabled: boolean }), { enabled: "True" }],
    ["string field is never coerced", { name: "20" }, object({ name: string }), { name: "20" }],
    ["valid input is unchanged", { limit: 20 }, object({ limit: integer }), { limit: 20 }],
  ]

  for (const [name, value, schema, expected] of cases) {
    test(name, () => {
      expect(repair(value, schema)).toEqual(expected)
    })
  }
})

describe("container repair", () => {
  test("stringified root object is parsed and repaired", () => {
    expect(repair('{"limit":"20"}', object({ limit: integer }))).toEqual({ limit: 20 })
  })

  test("stringified nested object is parsed and repaired", () => {
    const schema = object({ filter: object({ min: integer }) })
    expect(repair({ filter: '{"min":"3"}' }, schema)).toEqual({ filter: { min: 3 } })
  })

  test("stringified array is parsed and each item repaired", () => {
    expect(repair({ ids: '["1","2"]' }, object({ ids: { type: "array", items: integer } }))).toEqual({ ids: [1, 2] })
  })

  test("bare scalar is wrapped when it is a valid array item", () => {
    expect(repair({ count: "2" }, object({ count: { type: "array", items: integer } }))).toEqual({ count: [2] })
  })

  test("bare scalar is not wrapped when it is not a valid item", () => {
    expect(repair({ count: "x" }, object({ count: { type: "array", items: integer } }))).toEqual({ count: "x" })
  })

  test("arrays are not treated as records", () => {
    const schema = object({ items: object({ count: integer }) })
    expect(repair({ items: [{ count: "2" }] }, schema)).toEqual({ items: [{ count: "2" }] })
  })

  test("nested arrays repair each level", () => {
    const schema = object({ grid: { type: "array", items: { type: "array", items: integer } } })
    expect(repair({ grid: ['["1"]', ["2"]] }, schema)).toEqual({ grid: [[1], [2]] })
  })

  test("positional tuple repairs each position", () => {
    const schema = object({ pair: { type: "array", prefixItems: [integer, boolean] } as JSONSchema7 })
    expect(repair({ pair: ["2", "false"] }, schema)).toEqual({ pair: [2, false] })
  })

  test("draft-07 tuple uses additionalItems past the fixed positions", () => {
    const schema = object({
      row: { type: "array", items: [integer], additionalItems: boolean },
    })
    expect(repair({ row: ["1", "true", "false"] }, schema)).toEqual({ row: [1, true, false] })
  })

  test("typed dictionary repairs each value", () => {
    const schema = object({ counts: { type: "object", additionalProperties: integer } })
    expect(repair({ counts: { first: "2" } }, schema)).toEqual({ counts: { first: 2 } })
  })

  test("local $defs reference resolves", () => {
    const schema: JSONSchema7 = {
      ...object({ items: { type: "array", items: { $ref: "#/$defs/Row" } } }),
      $defs: { Row: object({ count: integer }) },
    }
    expect(repair({ items: [{ count: "2" }] }, schema)).toEqual({ items: [{ count: 2 }] })
  })

  test("local definitions reference resolves", () => {
    const schema: JSONSchema7 = {
      ...object({ row: { $ref: "#/definitions/Row" } }),
      definitions: { Row: object({ count: integer }) },
    }
    expect(repair({ row: { count: "2" } }, schema)).toEqual({ row: { count: 2 } })
  })

  test("external and missing references are left alone", () => {
    const external: JSONSchema7 = object({ row: { $ref: "https://example.com/row.json" } })
    const missing: JSONSchema7 = { ...object({ row: { $ref: "#/$defs/Gone" } }), $defs: {} }
    expect(repair({ row: { count: "2" } }, external)).toEqual({ row: { count: "2" } })
    expect(repair({ row: { count: "2" } }, missing)).toEqual({ row: { count: "2" } })
  })

  test("reference names that are prototype keys do not resolve", () => {
    const schema: JSONSchema7 = { ...object({ row: { $ref: "#/$defs/constructor" } }), $defs: {} }
    expect(repair({ row: "1" }, schema)).toEqual({ row: "1" })
  })
})

describe("placeholder and extra-key repair", () => {
  test("null for an optional single-type property is removed", () => {
    expect(repair({ limit: null }, object({ limit: integer }))).toEqual({})
  })

  test("null for a required property is kept", () => {
    expect(repair({ limit: null }, object({ limit: integer }, { required: ["limit"] }))).toEqual({ limit: null })
  })

  test("empty object for an optional scalar property is removed", () => {
    expect(repair({ name: {} }, object({ name: string }))).toEqual({})
  })

  test("empty object for an optional object property is kept", () => {
    expect(repair({ filter: {} }, object({ filter: object({ min: integer }) }))).toEqual({ filter: {} })
  })

  test("empty array for an optional scalar property is kept", () => {
    expect(repair({ name: [] }, object({ name: string }))).toEqual({ name: [] })
  })

  test("null is kept when the property is nullable", () => {
    expect(repair({ limit: null }, object({ limit: { type: ["integer", "null"] } }))).toEqual({ limit: null })
    expect(repair({ limit: null }, object({ limit: { anyOf: [integer, { type: "null" }] } }))).toEqual({ limit: null })
  })

  test("nullable union repairs the non-null type", () => {
    expect(repair({ count: "2" }, object({ count: { type: ["integer", "null"] } }))).toEqual({ count: 2 })
  })

  test("closed object drops undeclared keys", () => {
    expect(repair({ limit: "20", extra: true }, object({ limit: integer }, { additionalProperties: false }))).toEqual({
      limit: 20,
    })
  })

  test("open object keeps undeclared keys", () => {
    expect(repair({ limit: "20", extra: true }, object({ limit: integer }))).toEqual({ limit: 20, extra: true })
  })

  test("composed object keeps undeclared keys even when closed", () => {
    const schema = object({ limit: integer }, { additionalProperties: false, allOf: [{ type: "object" }] })
    expect(repair({ limit: "20", extra: true }, schema)).toEqual({ limit: 20, extra: true })
  })

  test("pattern properties keep undeclared keys even when closed", () => {
    const schema = object({}, { additionalProperties: false, patternProperties: { "^x-": string } })
    expect(repair({ "x-note": "a", other: 1 }, schema)).toEqual({ "x-note": "a", other: 1 })
  })

  test("prototype keys are data, not declared properties", () => {
    const value = JSON.parse('{"__proto__":{"polluted":"1"},"constructor":"2","toString":"3"}')
    const result = repair(value, object({ limit: integer })) as Record<string, unknown>
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    expect(Object.hasOwn(result, "__proto__")).toBe(true)
    expect(Object.getOwnPropertyDescriptor(result, "constructor")?.value).toBe("2")
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  test("prototype keys are dropped by a closed schema", () => {
    const value = JSON.parse('{"__proto__":{"x":"1"},"limit":"20"}')
    expect(repair(value, object({ limit: integer }, { additionalProperties: false }))).toEqual({ limit: 20 })
  })
})

describe("ambiguity, malformed input, and bounds", () => {
  test("ambiguous type list is left alone", () => {
    expect(repair({ value: "2" }, object({ value: { type: ["integer", "string"] } }))).toEqual({ value: "2" })
  })

  test("ambiguous anyOf is left alone", () => {
    expect(repair({ value: "2" }, object({ value: { anyOf: [integer, string] } }))).toEqual({ value: "2" })
  })

  test("anyOf with one non-null branch repairs", () => {
    expect(repair({ value: "2" }, object({ value: { anyOf: [integer, { type: "null" }] } }))).toEqual({ value: 2 })
  })

  test("both anyOf and oneOf are left alone", () => {
    const value = object({ value: { anyOf: [integer], oneOf: [integer] } as JSONSchema7 })
    expect(repair({ value: "2" }, value)).toEqual({ value: "2" })
  })

  test("malformed JSON string is left alone", () => {
    expect(repair('{"limit":', object({ limit: integer }))).toEqual('{"limit":')
    expect(repair({ ids: "[1" }, object({ ids: { type: "array", items: integer } }))).toEqual({ ids: "[1" })
  })

  test("stringified non-object for an object schema is left alone", () => {
    expect(repair({ filter: "[1]" }, object({ filter: object({ min: integer }) }))).toEqual({ filter: "[1]" })
  })

  test("depth limit stops repair below six levels", () => {
    const build = (depth: number): JSONSchema7 => (depth === 0 ? integer : object({ next: build(depth - 1) }))
    const value = (depth: number): unknown => (depth === 0 ? "1" : { next: value(depth - 1) })
    const repaired = repair(value(8), build(8)) as Record<string, unknown>
    let node = repaired
    for (let level = 0; level < 7; level++) node = node.next as Record<string, unknown>
    expect(node.next).toBe("1")
  })

  test("repair within the depth limit still applies", () => {
    const build = (depth: number): JSONSchema7 => (depth === 0 ? integer : object({ next: build(depth - 1) }))
    const value = (depth: number): unknown => (depth === 0 ? "1" : { next: value(depth - 1) })
    expect(repair(value(5), build(5))).toEqual({ next: { next: { next: { next: { next: 1 } } } } })
  })
})

describe("idempotence", () => {
  const schema = object(
    {
      limit: integer,
      tags: { type: "array", items: string },
      counts: { type: "object", additionalProperties: integer },
      note: string,
    },
    { additionalProperties: false },
  )
  const values: unknown[] = [
    { limit: "20", tags: '["a"]', counts: { first: "2" }, note: null, extra: 1 },
    '{"limit":"20","tags":"a"}',
    { limit: "20" },
  ]

  for (const value of values) {
    test(`repairing ${JSON.stringify(value)} twice equals once`, () => {
      const once = repair(value, schema)
      expect(repair(once, schema)).toEqual(once)
    })
  }
})
