export * as ConfigCommand from "./command"

import path from "path"
import { Cause, Exit, Schema } from "effect"
import { Fingerprint } from "@/util/fingerprint"
import { ConfigCommandV1 } from "@opencode-ai/core/v1/config/command"
import { configEntryNameFromPath } from "./entry-name"
import * as ConfigMarkdown from "./markdown"

const decodeInfo = Schema.decodeUnknownExit(ConfigCommandV1.Info)
const PATTERN = "{command,commands}/**/*.md"

// Last successfully parsed command per file, so a broken edit keeps serving the previous version.
const lastGood = new Map<string, { name: string; info: ConfigCommandV1.Info }>()
const parsed = Fingerprint.memo<Awaited<ReturnType<typeof parse>>>()

export type Diagnostic = { path: string; message: string }

export async function load(dir: string) {
  const commands: Record<string, ConfigCommandV1.Info> = {}
  const diagnostics: Diagnostic[] = []
  for (const item of await Fingerprint.scan([root(dir)])) {
    const name = configEntryNameFromPath(path.relative(dir, item), ["command/", "commands/"])
    const result = await parsed(item, () => parse(item, name))
    if (result.ok) lastGood.set(item, { name: result.name, info: result.info })
    if (!result.ok) diagnostics.push({ path: item, message: result.message })
    const entry = lastGood.get(item)
    if (entry) commands[entry.name] = entry.info
  }
  return { commands, diagnostics }
}

// Change signature for all command files in the given config directories.
export async function fingerprint(dirs: string[]) {
  return Fingerprint.of(await Fingerprint.scan(dirs.map(root)))
}

function root(dir: string) {
  return { dir, pattern: PATTERN, dot: true }
}

async function parse(item: string, name: string) {
  const md = await ConfigMarkdown.parse(item).catch((error: unknown) => ({ error }))
  if ("error" in md) {
    return { ok: false as const, message: md.error instanceof Error ? md.error.message : String(md.error) }
  }
  // Frontmatter `name` overrides the path-derived name.
  const config = { name, ...md.data, template: md.content.trim() }
  const decoded = decodeInfo(config, { errors: "all", propertyOrder: "original" })
  if (Exit.isSuccess(decoded)) return { ok: true as const, name: String(config.name), info: decoded.value }
  return { ok: false as const, message: Cause.pretty(decoded.cause) }
}
