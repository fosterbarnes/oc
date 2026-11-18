import { expect, test } from "bun:test"
import {
  commandUse,
  extractChain,
  extractSlashCommands,
  slashNames,
  slashTokenEnd,
  slashTriggerIndex,
  splitSlashSteps,
  typedText,
} from "../../src/prompt/slash"
import { promptOffsetWidth } from "../../src/prompt/display"

test("slash composition locates the current trigger across Unicode, buffer replacement, and separators", () => {
  expect(slashTriggerIndex("/action00\n界 /act14", promptOffsetWidth("/action00\n界 /act14"))).toBe(13)
  expect(slashTriggerIndex("/action00 /action14", 19)).toBe(10)
  expect(slashTriggerIndex("/action00 /action14 ", 20)).toBeUndefined()
  expect(slashTriggerIndex("/usr/bin", 8)).toBeUndefined()
  expect(slashTriggerIndex("https://example.com", 19)).toBeUndefined()
})

test("slash pick replaces the edited word but keeps a following command", () => {
  expect(slashTokenEnd("/x/command", 2)).toBe(2)
  expect(slashTokenEnd("/comm and", 4)).toBe(5)
  expect(slashTokenEnd("/x", 2)).toBe(2)
  expect(slashTokenEnd("界 /a/b", 5)).toBe(5)
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

test("revive chains split typed commands into ordered steps around each revive", () => {
  const available = [{ name: "pass" }, { name: "agent-push" }]
  expect(extractChain("/pass and cleanup", available)).toBeUndefined()
  expect(extractChain("/revive /pass", available)).toEqual({
    steps: [
      { type: "revive", mode: "install" },
      { type: "send", names: ["pass"] },
    ],
  })
  // Each command step gets its own text; a revive never takes text.
  expect(extractChain("/test the sidebar /revive /ship", [{ name: "test" }, { name: "ship" }])).toEqual({
    steps: [
      { type: "send", names: ["test"], text: "the sidebar" },
      { type: "revive", mode: "install" },
      { type: "send", names: ["ship"] },
    ],
  })
  expect(extractChain("/pass /revive-no-install /pass /revive-single", available)?.steps).toEqual([
    { type: "send", names: ["pass"] },
    { type: "revive", mode: "no-install" },
    { type: "send", names: ["pass"] },
    { type: "revive", mode: "single" },
  ])
  // Without commands, each text segment is its own prompt; paths and URLs are not revives.
  expect(extractChain("say hi /revive say bye /revive/x https://a.b/revive", available)).toEqual({
    steps: [
      { type: "send", names: [], text: "say hi" },
      { type: "revive", mode: "install" },
      { type: "send", names: [], text: "say bye /revive/x https://a.b/revive" },
    ],
  })
  expect(extractChain("/revive", available)).toEqual({ steps: [{ type: "revive", mode: "install" }] })
})

test("2+ commands split into ordered steps; text follows its command, a stack's text goes to its first", () => {
  const available = [{ name: "imp" }, { name: "verify" }, { name: "spit" }, { name: "think" }]
  expect(extractSlashCommands("fix the typo /imp in app.tsx", available)).toEqual({
    names: ["imp"],
    arguments: "fix the typo  in app.tsx",
  })
  expect(splitSlashSteps("fix the typo /imp in app.tsx /verify", available)).toEqual([
    { text: "fix the typo" },
    { command: "imp", text: "in app.tsx" },
    { command: "verify", text: "" },
  ])
  expect(splitSlashSteps("/spit /think prompt", available)).toEqual([
    { command: "spit", text: "prompt" },
    { command: "think", text: "" },
  ])
  expect(splitSlashSteps("/spit mock it up /imp build B", available)).toEqual([
    { command: "spit", text: "mock it up" },
    { command: "imp", text: "build B" },
  ])
  expect(splitSlashSteps("/imp a /imp b", available)).toEqual([
    { command: "imp", text: "a" },
    { command: "imp", text: "b" },
  ])
  expect(splitSlashSteps("/spit compare '/imp' and /think", available)).toEqual([
    { command: "spit", text: "compare '/imp' and" },
    { command: "think", text: "" },
  ])
})

test("typed aliases resolve to their command everywhere commands are parsed", () => {
  const available = [{ name: "agent-push", aliases: ["push"] }, { name: "spit" }]
  expect(extractSlashCommands("/push notes", available)).toEqual({ names: ["agent-push"], arguments: "notes" })
  expect(extractSlashCommands("/push /agent-push", available).names).toEqual(["agent-push"])
  expect(extractSlashCommands("see '/push'", available).names).toEqual([])
  expect(splitSlashSteps("/spit idea /push", available)).toEqual([
    { command: "spit", text: "idea" },
    { command: "agent-push", text: "" },
  ])
  expect(extractChain("/push /revive", available)?.steps[0]).toEqual({ type: "send", names: ["agent-push"] })
  // A real name beats another command's alias; a shared alias goes to the first command listed.
  expect(slashNames([{ name: "a", aliases: ["b"] }, { name: "b" }]).get("b")).toBe("b")
  expect(
    slashNames([
      { name: "a", aliases: ["x"] },
      { name: "c", aliases: ["x"] },
    ]).get("x"),
  ).toBe("a")
})

test("commands inside quotes or code fences never run", () => {
  const available = [{ name: "pass" }, { name: "agent-push" }]
  const example = "see '/pass\n/revive\n/agent-push' here"
  expect(extractChain(example, available)).toBeUndefined()
  expect(extractSlashCommands(example, available)).toEqual({ names: [], arguments: example })
  for (const text of ["'/pass /revive'", '"/revive"', "`/revive`", "‘/revive’", "“/revive”", "```\n/revive\n```"])
    expect(extractChain(text, available)).toBeUndefined()
  // Apostrophes do not pair up, and an unclosed quote hides nothing.
  expect(extractChain("don't /revive it's fine", available)?.steps).toEqual([
    { type: "send", names: [], text: "don't" },
    { type: "revive", mode: "install" },
    { type: "send", names: [], text: "it's fine" },
  ])
  expect(extractChain("/pass 'unclosed /revive", available)?.steps).toEqual([
    { type: "send", names: ["pass"], text: "'unclosed" },
    { type: "revive", mode: "install" },
  ])
  expect(extractChain("/pass compare 'a' and 'b' /revive /agent-push", available)).toEqual({
    steps: [
      { type: "send", names: ["pass"], text: "compare 'a' and 'b'" },
      { type: "revive", mode: "install" },
      { type: "send", names: ["agent-push"] },
    ],
  })
})

test("command messages restore the typed commands instead of their templates", () => {
  const sent = (metadata?: Record<string, unknown>) => ({ text: "[/spit is active: ...]\n\nTemplate", metadata })
  expect(commandUse(sent({ ocCommands: ["spit", "imp"], ocCommandArguments: " fix it\n" }))).toEqual({
    names: ["spit", "imp"],
    request: "fix it",
  })
  expect(typedText(sent({ ocCommands: ["spit", "imp"], ocCommandArguments: "fix it" }))).toBe("/spit /imp fix it")
  expect(typedText(sent({ ocCommands: ["pass"], ocCommandArguments: "" }))).toBe("/pass")
  expect(typedText(sent())).toBe("[/spit is active: ...]\n\nTemplate")
  expect(commandUse(sent({ ocCommands: [] }))).toBeUndefined()
  expect(commandUse(sent({ ocCommands: "spit" }))).toBeUndefined()
})
