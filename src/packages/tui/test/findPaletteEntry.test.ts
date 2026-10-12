import { expect, test } from "bun:test"
import { COMMAND_PALETTE_COMMAND, findPaletteEntry, type OpenTuiKeymap } from "../src/keymap"

type PaletteEntry = ReturnType<OpenTuiKeymap["getCommandEntries"]>[number]
type Command = PaletteEntry["command"]
type CommandEntriesQuery = Parameters<OpenTuiKeymap["getCommandEntries"]>[0]

function cmd(fields: { name: string; title: string; hidden?: boolean }): Command {
  return fields as unknown as Command
}

function fakeKeymap(entries: PaletteEntry[]): OpenTuiKeymap {
  return {
    getCommandEntries: (query: CommandEntriesQuery) => {
      expect(query).toEqual({ namespace: "palette", visibility: "reachable" })
      return entries
    },
  } as unknown as OpenTuiKeymap
}

function entry(command: Command): PaletteEntry {
  return { command, bindings: [] } as PaletteEntry
}

test("name match wins over title match", () => {
  const byName = entry(cmd({ name: "my.command", title: "Label" }))
  const byTitle = entry(cmd({ name: "other.command", title: "my.command" }))
  const keymap = fakeKeymap([byTitle, byName])
  expect(findPaletteEntry(keymap, "my.command")).toBe(byName)
})

test("falls back to title match", () => {
  const match = entry(cmd({ name: "cmd.save", title: "Save File" }))
  const keymap = fakeKeymap([match])
  expect(findPaletteEntry(keymap, "Save File")).toBe(match)
})

test("excludes hidden and command palette entries", () => {
  const hidden = entry(cmd({ name: "hidden.cmd", title: "Hidden", hidden: true }))
  const palette = entry(cmd({ name: COMMAND_PALETTE_COMMAND, title: "Palette" }))
  const visible = entry(cmd({ name: "visible.cmd", title: "Visible" }))
  const keymap = fakeKeymap([hidden, palette, visible])
  expect(findPaletteEntry(keymap, "hidden.cmd")).toBeUndefined()
  expect(findPaletteEntry(keymap, COMMAND_PALETTE_COMMAND)).toBeUndefined()
  expect(findPaletteEntry(keymap, "Palette")).toBeUndefined()
  expect(findPaletteEntry(keymap, "visible.cmd")).toBe(visible)
})

test("trims ref before matching", () => {
  const match = entry(cmd({ name: "trimmed.cmd", title: "Trimmed" }))
  const keymap = fakeKeymap([match])
  expect(findPaletteEntry(keymap, "  trimmed.cmd  ")).toBe(match)
})

test("no match returns undefined", () => {
  const keymap = fakeKeymap([entry(cmd({ name: "only.one", title: "Only One" }))])
  expect(findPaletteEntry(keymap, "missing")).toBeUndefined()
})

test("non-string title is not matched", () => {
  const keymap = fakeKeymap([entry(cmd({ name: "cmd", title: 42 as unknown as string }))])
  expect(findPaletteEntry(keymap, "42")).toBeUndefined()
})

test("empty ref returns undefined", () => {
  const keymap = fakeKeymap([entry(cmd({ name: "", title: "" })), entry(cmd({ name: "cmd", title: "Title" }))])
  expect(findPaletteEntry(keymap, "")).toBeUndefined()
  expect(findPaletteEntry(keymap, "   ")).toBeUndefined()
})
