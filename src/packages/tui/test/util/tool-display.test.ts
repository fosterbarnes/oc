import { describe, expect, test } from "bun:test"
import { partialToolInput, readRange, toolDisplayMetadata, webSearchProviderLabel } from "../../src/util/tool-display"

describe("webSearchProviderLabel", () => {
  test("labels known providers", () => {
    expect(webSearchProviderLabel("parallel")).toBe("Parallel Web Search")
    expect(webSearchProviderLabel("exa")).toBe("Exa Web Search")
    expect(webSearchProviderLabel("firecrawl")).toBe("Firecrawl Web Search")
    expect(webSearchProviderLabel("tavily")).toBe("Tavily Web Search")
  })

  for (const [name, provider] of [
    ["undefined", undefined],
    ["null", null],
    ["an object", {}],
    ["an array", []],
    ["a number", 1],
    ["an unexpected string", "other"],
  ] as const) {
    test(`uses the generic label for ${name}`, () => {
      expect(webSearchProviderLabel(provider)).toBe("Web Search")
    })
  }
})

describe("toolDisplayMetadata", () => {
  test("returns structured metadata for non-pending states", () => {
    const structured = { provider: "parallel", numResults: 3 }

    expect(toolDisplayMetadata({ status: "running", structured })).toBe(structured)
    expect(toolDisplayMetadata({ status: "completed", structured })).toBe(structured)
    expect(toolDisplayMetadata({ status: "error", structured })).toBe(structured)
  })

  test("does not expose pending or malformed metadata", () => {
    expect(toolDisplayMetadata({ status: "pending", structured: { provider: "exa" } })).toEqual({})
    expect(toolDisplayMetadata({ status: "completed" })).toEqual({})
    expect(toolDisplayMetadata({ status: "completed", structured: null })).toEqual({})
    expect(toolDisplayMetadata({ status: "completed", structured: [] })).toEqual({})
    expect(toolDisplayMetadata(undefined)).toEqual({})
  })
})

describe("readRange", () => {
  test("shows the line range a read covers", () => {
    expect(readRange({ filePath: "a.ts", offset: 10, limit: 51 })).toBe(":10-60")
    expect(readRange({ filePath: "a.ts", limit: 20 })).toBe(":1-20")
    expect(readRange({ filePath: "a.ts", offset: 40 })).toBe(":40-")
  })

  test("is empty for whole-file reads", () => {
    expect(readRange({ filePath: "a.ts" })).toBe("")
    expect(readRange({ filePath: "a.ts", offset: "10" })).toBe("")
  })
})

describe("partialToolInput", () => {
  test("reads arguments the model is still writing", () => {
    expect(partialToolInput('{"filePath":"src/a.t')).toEqual({ filePath: "src/a.t" })
    expect(partialToolInput('{"command":"ls","timeout":')).toEqual({ command: "ls" })
  })

  test("is empty until an object parses", () => {
    expect(partialToolInput("")).toEqual({})
    expect(partialToolInput("[1,")).toEqual({})
    expect(partialToolInput('ath":"resumed mid-string"}')).toEqual({})
  })
})
