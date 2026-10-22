import { expect, test } from "bun:test"
import path from "node:path"
import { DEFAULT_ACCOUNT } from "@/provider/claude-code/accounts.js"
import { FAILOVER_STOP_LABEL, failoverQuestion } from "@/provider/claude-code/failoverQuestion.js"

test("failover question lists candidates best first, recommends the first, ends with Stop, and maps picks back", () => {
  const second = path.resolve("/home/me/.claude2")
  const question = failoverQuestion(".claude4", [
    { id: second, used: 12.6 },
    { id: DEFAULT_ACCOUNT, used: undefined },
  ])
  const [prompt] = question.input.questions
  expect(prompt!.question).toBe(".claude4 hit its usage limit. Continue this turn on:")
  expect(prompt!.options.map((option) => [option.label, option.description])).toEqual([
    [".claude2 (Recommended)", "5h used 13%"],
    [".claude", "usage unknown"],
    [FAILOVER_STOP_LABEL, "End this turn; auto-resume wakes it after the reset if on"],
  ])
  expect(question.pick(".claude2 (Recommended)")).toBe(second)
  expect(question.pick(".claude")).toBe(DEFAULT_ACCOUNT)
  expect(question.pick(FAILOVER_STOP_LABEL)).toBeUndefined()
  expect(question.pick("something typed")).toBeUndefined()
})
