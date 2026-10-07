#!/usr/bin/env bun
// Regenerates the keybind tables in docs/keybinds.md from Definitions and the oc preset.
// --check: exit 1 when the file is stale instead of writing it.
import path from "path"
import { TuiKeybind } from "../src/config/keybind"
import { TuiKeybindPreset } from "../src/config/keybindPreset"

const START = "<!-- keybinds:start -->"
const END = "<!-- keybinds:end -->"
const file = Bun.file(path.resolve(import.meta.dir, "../../../../docs/keybinds.md"))
const doc = await file.text()
const start = doc.indexOf(START)
const end = doc.indexOf(END)
if (start < 0 || end < start) throw new Error(`docs/keybinds.md needs one ${START} ... ${END} pair`)

const groups = Map.groupBy(
  Object.entries(TuiKeybind.Definitions).flatMap(([name, item]) => {
    const stock = format(item.default)
    const oc = format(TuiKeybindPreset.oc[name as keyof typeof TuiKeybindPreset.oc] ?? item.default)
    if (stock === "-" && oc === "-") return []
    return [{ group: name.split(/[_.]/)[0], description: item.description, stock, oc }]
  }),
  (row) => row.group,
)
const tables = [...groups].map(([group, rows]) =>
  [
    `### ${group[0].toUpperCase()}${group.slice(1)}`,
    "",
    "| Action | oc | opencode |",
    "|---|---|---|",
    ...rows.map((row) => `| ${row.description} | ${row.oc === row.stock ? row.oc : `**${row.oc}**`} | ${row.stock} |`),
  ].join("\n"),
)
const next = `${doc.slice(0, start + START.length)}\n\n${tables.join("\n\n")}\n\n${doc.slice(end)}`

if (next === doc) process.exit(0)
if (process.argv.includes("--check")) {
  console.error("docs/keybinds.md is stale: run `bun packages/tui/script/keybindDocs.ts` from src")
  process.exit(1)
}
await Bun.write(file, next)

function format(value: TuiKeybind.BindingValueSchema) {
  const keys = (Array.isArray(value) ? value : [value]).flatMap((item) => {
    if (item === false || item === "none") return []
    if (typeof item === "string") return item.split(",")
    const key = "key" in item ? item.key : item
    return [typeof key === "string" ? key : JSON.stringify(key)]
  })
  if (!keys.length) return "-"
  return keys.map((key) => `\`${key.trim().replace("<leader>", "ctrl+x ")}\``).join(", ")
}
