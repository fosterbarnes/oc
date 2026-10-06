import { expect, test } from "bun:test"
import { extractSlashCommands, slashTriggerIndex } from "../../src/prompt/slash"
import { promptOffsetWidth } from "../../src/prompt/display"

test("slash composition locates the current trigger across Unicode, buffer replacement, and separators", () => {
  expect(slashTriggerIndex("/action00\n界 /act14", promptOffsetWidth("/action00\n界 /act14"))).toBe(13)
  expect(slashTriggerIndex("/action00 /action14", 19)).toBe(10)
  expect(slashTriggerIndex("/action00 /action14 ", 20)).toBeUndefined()
  expect(slashTriggerIndex("/usr/bin", 8)).toBeUndefined()
  expect(slashTriggerIndex("https://example.com", 19)).toBeUndefined()
})

test("slash composition extracts ordered unique names while preserving request text", () => {
  const available = [{ name: "spit" }, { name: "think" }, { name: "review" }]
  expect(extractSlashCommands("/spit /think /review /spit\nFix this", available)).toEqual({
    names: ["spit", "think", "review"],
    arguments: "Fix this",
  })
  expect(extractSlashCommands("/think\n/spit\n\nFix this\n\nKeep paragraphs", available)).toEqual({
    names: ["think", "spit"],
    arguments: "Fix this\n\nKeep paragraphs",
  })
  expect(extractSlashCommands("hello /think world /unknown /usr/bin https://example.com/spit", available)).toEqual({
    names: ["think"],
    arguments: "hello  world /unknown /usr/bin https://example.com/spit",
  })
  expect(extractSlashCommands("ordinary text", available)).toEqual({ names: [], arguments: "ordinary text" })
})
