import { expect, test } from "bun:test"
import { commandUse, extractChain, extractSlashCommands, slashTriggerIndex, typedText } from "../../src/prompt/slash"
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

test("revive chains split typed commands into ordered steps around each revive", () => {
  const available = [{ name: "pass" }, { name: "agent-push" }]
  expect(extractChain("/pass and cleanup", available)).toBeUndefined()
  expect(extractChain("/revive /pass", available)).toEqual({
    steps: [
      { type: "revive", mode: "install" },
      { type: "send", names: ["pass"] },
    ],
    request: "",
  })
  // Stream-of-consciousness text is one request shared by every command step.
  expect(extractChain("/pass pass and cleanup then /revive revive then /agent-push push", available)).toEqual({
    steps: [
      { type: "send", names: ["pass"] },
      { type: "revive", mode: "install" },
      { type: "send", names: ["agent-push"] },
    ],
    request: "pass and cleanup then\nrevive then  push",
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
    request: "",
  })
  expect(extractChain("/revive", available)).toEqual({ steps: [{ type: "revive", mode: "install" }], request: "" })
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
    { type: "send", names: ["pass"] },
    { type: "revive", mode: "install" },
  ])
  expect(extractChain("/pass compare 'a' and 'b' /revive /agent-push", available)).toEqual({
    steps: [
      { type: "send", names: ["pass"] },
      { type: "revive", mode: "install" },
      { type: "send", names: ["agent-push"] },
    ],
    request: "compare 'a' and 'b'",
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
