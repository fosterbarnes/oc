export * as ConfigVariable from "./variable"

import path from "path"
import os from "os"
import { Effect } from "effect"
import { type ParseError, parse } from "jsonc-parser"
import { Filesystem } from "@/util/filesystem"

type ParseSource =
  | {
      type: "path"
      path: string
    }
  | {
      type: "virtual"
      source: string
      dir: string
    }

type SubstituteInput = ParseSource & {
  text: string
  env?: Record<string, string>
}

function source(input: ParseSource) {
  return input.type === "path" ? input.path : input.source
}

function dir(input: ParseSource) {
  return input.type === "path" ? path.dirname(input.path) : input.dir
}

function invalidJson(text: string) {
  const errors: ParseError[] = []
  parse(text, errors, { allowTrailingComma: true })
  return errors.length > 0
}

/** Apply {env:VAR} and {file:path} substitutions to config text. */
export const substitute = Effect.fn("ConfigVariable.substitute")(function* (input: SubstituteInput) {
  const env = (escape: boolean) =>
    input.text.replace(/\{env:([^}]+)\}/g, (_, name: string) => {
      const value = (input.env?.[name] ?? process.env[name]) || ""
      return escape ? JSON.stringify(value).slice(1, -1) : value
    })
  const raw = yield* substituteFiles(input, env(false))
  // Escape only when raw values break the JSON (e.g. Windows paths), so configs that parse today keep
  // their meaning. Plain-string inputs such as remote config URLs and headers never parse, so keep raw.
  if (!input.text.includes("{env:") || !invalidJson(raw)) return raw
  const escaped = yield* substituteFiles(input, env(true))
  return invalidJson(escaped) ? raw : escaped
})

const substituteFiles = Effect.fnUntraced(function* (input: SubstituteInput, text: string) {
  const fileMatches = Array.from(text.matchAll(/\{file:[^}]+\}/g))
  if (!fileMatches.length) return text

  const configDir = dir(input)
  const configSource = source(input)
  let out = ""
  let cursor = 0

  for (const match of fileMatches) {
    const token = match[0]
    const index = match.index
    out += text.slice(cursor, index)

    const lineStart = text.lastIndexOf("\n", index - 1) + 1
    const prefix = text.slice(lineStart, index).trimStart()
    if (prefix.startsWith("//")) {
      out += token
      cursor = index + token.length
      continue
    }

    let filePath = token.replace(/^\{file:/, "").replace(/\}$/, "")
    if (filePath.startsWith("~/")) {
      filePath = path.join(os.homedir(), filePath.slice(2))
    }

    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(configDir, filePath)
    // Like a missing {env:VAR}, a missing or unreadable file substitutes empty so one stale
    // secret reference cannot fail the whole config load.
    const fileContent = yield* Effect.tryPromise({
      try: () => Filesystem.readText(resolvedPath),
      catch: (error) => error,
    }).pipe(
      Effect.catch((error) =>
        Effect.logWarning("config file reference is missing or unreadable", {
          source: configSource,
          reference: token,
          path: resolvedPath,
          error: String(error),
        }).pipe(Effect.as("")),
      ),
    )

    out += JSON.stringify(fileContent.trim()).slice(1, -1)
    cursor = index + token.length
  }

  out += text.slice(cursor)
  return out
})
