import { parse, printParseErrorCode, type ParseError } from "jsonc-parser"

export * as OcJson from "./ocJson"

// Parses oc.json text: `//` and block comments and trailing commas are fine. Blank text is `{}`.
// Throws naming `file` and the first parse error, or when the top level is not an object.
export function read<T = Record<string, unknown>>(text: string, file: string): T {
  if (!text.trim()) return {} as T
  const errors: ParseError[] = []
  const value = parse(text, errors, { allowTrailingComma: true })
  const first = errors[0]
  if (first) {
    const line = text.slice(0, first.offset).split("\n").length
    throw new Error(`${file}: ${printParseErrorCode(first.error)} at line ${line}`)
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${file}: not a JSON object`)
  return value as T
}
