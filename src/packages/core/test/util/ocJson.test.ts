import { describe, expect, test } from "bun:test"
import { OcJson } from "@opencode-ai/core/util/ocJson"

describe("OcJson.read", () => {
  test("accepts trailing commas and line and block comments", () => {
    const text = `// head\n{\n  /* block */ "a": 1, // inline\n  "b": { "c": [1, 2,], },\n}\n`
    expect(OcJson.read<unknown>(text, "oc.json")).toEqual({ a: 1, b: { c: [1, 2] } })
  })

  test("blank text is an empty object", () => {
    expect(OcJson.read<unknown>("  \n", "oc.json")).toEqual({})
  })

  test("garbage throws naming the file", () => {
    expect(() => OcJson.read(`{ "a": `, "/x/oc.json")).toThrow(/^\/x\/oc\.json: /)
    expect(() => OcJson.read(`{ "a" 1 }`, "/x/oc.json")).toThrow("/x/oc.json")
  })

  test("a non-object top level throws", () => {
    expect(() => OcJson.read("[1]", "oc.json")).toThrow("oc.json: not a JSON object")
  })
})
