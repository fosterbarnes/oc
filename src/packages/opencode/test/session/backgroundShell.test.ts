import { describe, expect, test } from "bun:test"
import { Deferred, Effect } from "effect"
import { MessageID, SessionID } from "../../src/session/schema"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { notifySession, type TaskPromptOps } from "../../src/tool/task"

const sessionID = SessionID.make("ses_notice")

// Stands in for SessionPrompt.ops. `consumed` decides whether the prompt's loop answered the notice.
function fakeOps(options: { consumed?: boolean; gate?: Deferred.Deferred<void>; cancellation?: () => number } = {}) {
  const calls = { prompt: [] as string[], loop: 0, prompts: [] as Array<Parameters<TaskPromptOps["prompt"]>[0]> }
  const ops: TaskPromptOps = {
    cancel: () => Effect.void,
    resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
    prompt: (input) =>
      Effect.sync(() => {
        calls.prompt.push(input.parts.map((part) => (part.type === "text" ? part.text : part.type)).join("\n"))
        calls.prompts.push(input)
        const parentID = options.consumed === false ? MessageID.ascending() : input.messageID
        return { info: { id: MessageID.ascending(), role: "assistant", parentID }, parts: [] } as unknown as SessionV1.WithParts
      }),
    loop: () =>
      Effect.sync(() => {
        calls.loop += 1
        return { info: { id: MessageID.ascending(), role: "assistant" }, parts: [] } as unknown as SessionV1.WithParts
      }),
    available: () => (options.gate ? Deferred.await(options.gate) : Effect.void),
    cancellation: () => Effect.sync(() => options.cancellation?.() ?? 0),
    partMetadata: () => Effect.void,
  }
  return { ops, calls }
}

const notice = (text = "<background_shell />") => ({ sessionID, text, agent: "build" })

describe("notifySession", () => {
  test("appends one synthetic notice and does not loop again when the turn consumed it", async () => {
    const { ops, calls } = fakeOps()
    await Effect.runPromise(notifySession(ops, notice("NOTICE-ONE")))
    expect(calls.prompt).toEqual(["NOTICE-ONE"])
    expect(calls.prompts[0]?.parts[0]).toMatchObject({ type: "text", synthetic: true })
    expect(calls.prompts[0]?.agent).toBe("build")
    expect(calls.loop).toBe(0)
  })

  test("passes the turn permission through to the prompt", async () => {
    const { ops, calls } = fakeOps()
    const turnPermission = [{ permission: "bash", pattern: "*", action: "allow" as const }]
    await Effect.runPromise(notifySession(ops, { ...notice(), turnPermission }))
    expect(calls.prompts[0]?.turnPermission).toEqual(turnPermission)
  })

  test("runs one more loop pass when the notice was not consumed", async () => {
    const { ops, calls } = fakeOps({ consumed: false })
    await Effect.runPromise(notifySession(ops, notice()))
    expect(calls.prompt).toHaveLength(1)
    expect(calls.loop).toBe(1)
  })

  test("waits for maintenance to release the session before appending", async () => {
    const gate = await Effect.runPromise(Deferred.make<void>())
    const { ops, calls } = fakeOps({ gate })
    const delivery = Effect.runPromise(notifySession(ops, notice()))
    await Bun.sleep(20)
    expect(calls.prompt).toHaveLength(0)
    await Effect.runPromise(Deferred.succeed(gate, undefined))
    await delivery
    expect(calls.prompt).toHaveLength(1)
  })

  test("drops the notice when a cancel lands while it waits", async () => {
    const gate = await Effect.runPromise(Deferred.make<void>())
    let epoch = 0
    const { ops, calls } = fakeOps({ gate, cancellation: () => epoch })
    const delivery = Effect.runPromise(notifySession(ops, notice()))
    await Bun.sleep(20)
    epoch += 1
    await Effect.runPromise(Deferred.succeed(gate, undefined))
    await delivery
    expect(calls.prompt).toHaveLength(0)
    expect(calls.loop).toBe(0)
  })

  test("delivers concurrent notices as separate messages", async () => {
    const { ops, calls } = fakeOps()
    await Effect.runPromise(Effect.all([notifySession(ops, notice("A")), notifySession(ops, notice("B"))], { concurrency: "unbounded" }))
    expect(calls.prompt.toSorted()).toEqual(["A", "B"])
    expect(calls.loop).toBe(0)
  })

  test("a failed prompt is logged and does not wake the loop", async () => {
    const { ops, calls } = fakeOps()
    await Effect.runPromise(notifySession({ ...ops, prompt: () => Effect.die("boom") }, notice()))
    expect(calls.loop).toBe(0)
  })
})
