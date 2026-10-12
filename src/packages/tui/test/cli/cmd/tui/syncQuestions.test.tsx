/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import type { GlobalEvent, Message, Part, QuestionRequest, SessionStatus, ToolPart } from "@opencode-ai/sdk/v2"
import { restoredQuestion } from "../../../../src/context/sync"
import { tmpdir } from "../../../fixture/fixture"
import { json, mount, wait } from "./sync-fixture"
import type { FetchHandler } from "../../../fixture/tui-sdk"

const session = {
  id: "ses_questions",
  title: "questions",
  directory: "C:\\projects\\other project",
  workspaceID: "ws_questions",
  time: { created: 0, updated: 0 },
  version: "test",
}
const assistant: Message = {
  id: "msg_question",
  sessionID: session.id,
  role: "assistant",
  agent: "build",
  mode: "build",
  modelID: "model",
  providerID: "test",
  parentID: "msg_user",
  path: { cwd: session.directory, root: session.directory },
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, completed: 2 },
}
const questions = [{ question: "Which approach?", header: "Approach", options: [{ label: "A", description: "First" }] }]
const part: ToolPart = {
  id: "prt_question",
  messageID: assistant.id,
  sessionID: session.id,
  type: "tool",
  tool: "question",
  callID: "call_question",
  state: { status: "running", input: { questions }, time: { start: 1 } },
}
const request: QuestionRequest = {
  id: "que_live",
  sessionID: session.id,
  questions,
  tool: { messageID: assistant.id, callID: part.callID },
}

function event(payload: GlobalEvent["payload"]): GlobalEvent {
  return { directory: session.directory, project: "proj_test", workspace: session.workspaceID, payload }
}

async function mountSession(root: string, handler?: FetchHandler, parts: Part[] = [part]) {
  await Bun.write(`${root}/kv.json`, "{}")
  return mount(async (url) => {
    const overridden = await handler?.(url)
    if (overridden) return overridden
    if (url.pathname === "/experimental/session") return json([session])
    if (url.pathname === `/session/${session.id}`) return json(session)
    if (url.pathname === `/session/${session.id}/message`) return json([{ info: assistant, parts }])
    if (url.pathname === `/session/${session.id}/todo` || url.pathname === `/session/${session.id}/diff`)
      return json([])
    if (url.pathname === "/question" || url.pathname === "/permission") return json([])
    return undefined
  }, root)
}

test("restores running or cancelled questions with their saved options", () => {
  expect(restoredQuestion([assistant], { [assistant.id]: [part] })).toMatchObject({ questions, restored: true })
  const cancelled: ToolPart = {
    ...part,
    state: {
      status: "error",
      input: { questions },
      error: "The user dismissed this question",
      time: { start: 1, end: 2 },
    },
  }
  expect(restoredQuestion([assistant], { [assistant.id]: [cancelled] })?.id).toBe(`restored_${part.id}`)
})

test("does not resurrect answered questions or unrelated tool errors", () => {
  const completed: ToolPart = {
    ...part,
    state: {
      status: "completed",
      input: { questions },
      output: "answered",
      title: "Asked",
      metadata: {},
      time: { start: 1, end: 2 },
    },
  }
  const failed: ToolPart = {
    ...part,
    state: { status: "error", input: { questions }, error: "Invalid tool input", time: { start: 1, end: 2 } },
  }
  expect(restoredQuestion([assistant], { [assistant.id]: [completed] })).toBeUndefined()
  expect(restoredQuestion([assistant], { [assistant.id]: [failed] })).toBeUndefined()
  for (const error of ["Tool execution aborted", "Question input rejected", "Cancelled", "Interrupted"]) {
    expect(
      restoredQuestion([assistant], {
        [assistant.id]: [
          {
            ...failed,
            state: { status: "error", input: { questions }, error, time: { start: 1, end: 2 } },
          },
        ],
      }),
    ).toBeUndefined()
  }
})

test("a running question stays live-only while busy or retrying and restores after a fresh idle fetch", async () => {
  await using tmp = await tmpdir()
  let status: SessionStatus = { type: "busy" }
  let release: ((response: Response) => void) | undefined
  let hold = false
  const app = await mountSession(tmp.path, (url) => {
    if (url.pathname === "/session/status") return json({ [session.id]: status })
    if (url.pathname === "/question" && hold) {
      return new Promise<Response>((resolve) => {
        release = resolve
      })
    }
    return undefined
  })
  try {
    await app.sync.session.sync(session.id)
    expect(app.sync.session.questions(session.id)).toEqual([])
    app.emit(
      event({
        id: "evt_running",
        type: "message.part.updated",
        properties: { sessionID: session.id, time: 1, part },
      }),
    )
    app.emit(event({ id: "evt_asked", type: "question.asked", properties: request }))
    await wait(() => app.sync.data.question[session.id]?.length === 1)
    expect(app.sync.session.questions(session.id)[0].restored).toBeUndefined()
    app.sync.set("question", session.id, [])
    status = { type: "retry", attempt: 1, message: "Retrying", next: Date.now() + 1000 }
    app.emit(event({ id: "evt_retry", type: "session.status", properties: { sessionID: session.id, status } }))
    await wait(() => app.sync.data.session_status[session.id]?.type === "retry")
    expect(app.sync.session.questions(session.id)).toEqual([])
    status = { type: "idle" }
    hold = true
    app.emit(event({ id: "evt_idle", type: "session.status", properties: { sessionID: session.id, status } }))
    await wait(() => !!release)
    expect(app.sync.session.questions(session.id)).toEqual([])
    release!(json([]))
    await wait(() => app.sync.session.questions(session.id)[0]?.restored === true)
    expect(app.sync.session.questions(session.id)[0].tool).toEqual(request.tool)
  } finally {
    app.app.renderer.destroy()
  }
})

test("cached reopen disables restore during fetch and an intervening status change invalidates its result", async () => {
  await using tmp = await tmpdir()
  let hold = false
  let release: ((response: Response) => void) | undefined
  const app = await mountSession(tmp.path, (url) => {
    if (url.pathname === "/question" && hold) {
      return new Promise<Response>((resolve) => {
        release = resolve
      })
    }
    return undefined
  })
  try {
    await app.sync.session.sync(session.id)
    expect(app.sync.session.questions(session.id)[0].restored).toBe(true)
    hold = true
    const refresh = app.sync.session.sync(session.id)
    await wait(() => !!release)
    expect(app.sync.session.questions(session.id)).toEqual([])
    app.emit(
      event({
        id: "evt_busy",
        type: "session.status",
        properties: { sessionID: session.id, status: { type: "busy" } },
      }),
    )
    await wait(() => app.sync.data.session_status[session.id]?.type === "busy")
    release!(json([]))
    await refresh
    expect(app.sync.session.questions(session.id)).toEqual([])
  } finally {
    app.app.renderer.destroy()
  }
})

test("live rejection before parts hydrate remains dismissed by tool identity", async () => {
  await using tmp = await tmpdir()
  let release: ((response: Response) => void) | undefined
  const cancelled: ToolPart = {
    ...part,
    state: {
      status: "error",
      input: { questions },
      error: "The user dismissed this question",
      time: { start: 1, end: 2 },
    },
  }
  const app = await mountSession(tmp.path, (url) => {
    if (url.pathname === `/session/${session.id}/message`) {
      return new Promise<Response>((resolve) => {
        release = resolve
      })
    }
    return undefined
  })
  try {
    const hydrate = app.sync.session.sync(session.id)
    await wait(() => !!release)
    app.emit(event({ id: "evt_asked", type: "question.asked", properties: request }))
    await wait(() => app.sync.data.question[session.id]?.length === 1)
    app.emit(
      event({
        id: "evt_rejected",
        type: "question.rejected",
        properties: { sessionID: session.id, requestID: request.id },
      }),
    )
    await wait(() => app.sync.data.question[session.id]?.length === 0)
    release!(json([{ info: assistant, parts: [cancelled] }]))
    await hydrate
    expect(app.sync.session.questions(session.id)).toEqual([])
    await app.sync.session.sync(session.id)
    expect(app.sync.session.questions(session.id)).toEqual([])
  } finally {
    app.app.renderer.destroy()
  }
})

test("unobserved instance-dispose rejection restores, but a later observed reply prevents it", async () => {
  await using tmp = await tmpdir()
  const cancelled: ToolPart = {
    ...part,
    state: {
      status: "error",
      input: { questions },
      error: "The user dismissed this question",
      time: { start: 1, end: 2 },
    },
  }
  const app = await mountSession(tmp.path, undefined, [cancelled])
  try {
    await app.sync.session.sync(session.id)
    expect(app.sync.session.questions(session.id)[0].restored).toBe(true)
    app.emit(event({ id: "evt_asked", type: "question.asked", properties: request }))
    await wait(() => app.sync.data.question[session.id]?.length === 1)
    app.emit(
      event({
        id: "evt_reply",
        type: "question.replied",
        properties: { sessionID: session.id, requestID: request.id, answers: [["A"]] },
      }),
    )
    await wait(() => app.sync.data.question[session.id]?.length === 0)
    expect(app.sync.session.questions(session.id)).toEqual([])
  } finally {
    app.app.renderer.destroy()
  }
})

test("a rejected request first discovered in a stale fetch stays dismissed", async () => {
  await using tmp = await tmpdir()
  let release: ((response: Response) => void) | undefined
  const cancelled: ToolPart = {
    ...part,
    state: {
      status: "error",
      input: { questions },
      error: "The user dismissed this question",
      time: { start: 1, end: 2 },
    },
  }
  const app = await mountSession(
    tmp.path,
    (url) => {
      if (url.pathname === "/question" && url.searchParams.get("directory") === session.directory) {
        return new Promise<Response>((resolve) => {
          release = resolve
        })
      }
      return undefined
    },
    [cancelled],
  )
  try {
    const hydrate = app.sync.session.sync(session.id)
    await wait(() => !!release)
    app.emit(
      event({
        id: "evt_unknown_rejected",
        type: "question.rejected",
        properties: { sessionID: session.id, requestID: request.id },
      }),
    )
    app.emit(
      event({
        id: "evt_after_reject",
        type: "message.updated",
        properties: { sessionID: session.id, info: assistant },
      }),
    )
    await wait(() => app.sync.data.message[session.id]?.length === 1)
    release!(json([request]))
    await hydrate
    expect(app.sync.session.questions(session.id)).toEqual([])
  } finally {
    app.app.renderer.destroy()
  }
})

test("a parent aggregates live child questions without including a child's restored question", async () => {
  await using tmp = await tmpdir()
  const child = { ...session, id: "ses_child", parentID: session.id }
  const childMessage = { ...assistant, id: "msg_child", sessionID: child.id }
  const childPart = { ...part, id: "prt_child", messageID: childMessage.id, sessionID: child.id }
  const app = await mountSession(
    tmp.path,
    (url) => {
      if (url.pathname === "/experimental/session") return json([child, session])
      if (url.pathname === `/session/${child.id}`) return json(child)
      if (url.pathname === `/session/${child.id}/message`) return json([{ info: childMessage, parts: [childPart] }])
      if (url.pathname === `/session/${child.id}/todo` || url.pathname === `/session/${child.id}/diff`) return json([])
      return undefined
    },
    [],
  )
  try {
    await app.sync.session.sync(session.id)
    await app.sync.session.sync(child.id)
    expect(app.sync.session.questions(child.id)[0].restored).toBe(true)
    expect(app.sync.session.questions(session.id)).toEqual([])
    const live = { ...request, sessionID: child.id, tool: { messageID: childMessage.id, callID: childPart.callID } }
    app.emit(event({ id: "evt_child_asked", type: "question.asked", properties: live }))
    await wait(() => app.sync.data.question[child.id]?.length === 1)
    expect(app.sync.session.questions(session.id)).toEqual([live])
  } finally {
    app.app.renderer.destroy()
  }
})

test("list failures keep live data, allow session hydration and disable restore until both lists succeed", async () => {
  await using tmp = await tmpdir()
  let failed = "/question"
  const permission = {
    id: "per_live",
    sessionID: session.id,
    permission: "read",
    patterns: ["*"],
    metadata: {},
    always: [],
  }
  const app = await mountSession(tmp.path, (url) => {
    if (url.pathname === failed) return json({ error: "Unavailable" }, { status: 500 })
    return undefined
  })
  try {
    app.emit(event({ id: "evt_asked", type: "question.asked", properties: request }))
    app.emit(event({ id: "evt_permission", type: "permission.asked", properties: permission }))
    await wait(
      () => app.sync.data.question[session.id]?.length === 1 && app.sync.data.permission[session.id]?.length === 1,
    )
    await app.sync.session.sync(session.id)
    expect(app.sync.data.message[session.id]).toHaveLength(1)
    expect(app.sync.data.question[session.id]).toEqual([request])
    expect(app.sync.data.permission[session.id]).toEqual([permission])
    app.sync.set("question", session.id, [])
    expect(app.sync.session.questions(session.id)).toEqual([])
    failed = "/permission"
    await app.sync.session.sync(session.id)
    expect(app.sync.session.questions(session.id)).toEqual([])
    expect(app.sync.data.permission[session.id]).toEqual([permission])
    failed = ""
    await app.sync.session.sync(session.id)
    expect(app.sync.session.questions(session.id)[0].restored).toBe(true)
  } finally {
    app.app.renderer.destroy()
  }
})

test("later user messages, assistant output, and tool calls supersede a question", () => {
  expect(
    restoredQuestion(
      [
        assistant,
        {
          id: "msg_followup",
          sessionID: session.id,
          role: "user",
          agent: "build",
          model: { providerID: "test", modelID: "model" },
          time: { created: 3 },
        },
      ],
      { [assistant.id]: [part] },
    ),
  ).toBeUndefined()
  expect(
    restoredQuestion([assistant, { ...assistant, id: "msg_later", time: { created: 3 } }], { [assistant.id]: [part] }),
  ).toBeUndefined()
  const text: Part = {
    id: "prt_later",
    sessionID: session.id,
    messageID: assistant.id,
    type: "text",
    text: "Moving on",
  }
  expect(restoredQuestion([assistant], { [assistant.id]: [part, text] })).toBeUndefined()
  expect(
    restoredQuestion([assistant], {
      [assistant.id]: [part, { ...part, id: "prt_later", tool: "read" }],
    }),
  ).toBeUndefined()
  expect(
    restoredQuestion([assistant], {
      [assistant.id]: [part, { ...part, id: "prt_latest" }],
    })?.id,
  ).toBe("restored_prt_latest")
})

test("rejects malformed saved question inputs", () => {
  for (const input of [
    {},
    { questions: [] },
    { questions: [{}] },
    { questions: [{ ...questions[0], options: [null] }] },
    { questions: [{ ...questions[0], multiple: "yes" }] },
  ]) {
    expect(
      restoredQuestion([assistant], {
        [assistant.id]: [{ ...part, state: { status: "running", input, time: { start: 1 } } }],
      }),
    ).toBeUndefined()
  }
})

test("session open and cached reopen refresh both prompts in the session's own directory", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const calls: URL[] = []
  let live: QuestionRequest[] = [request]
  const permission = {
    id: "per_live",
    sessionID: session.id,
    permission: "read",
    patterns: ["*"],
    metadata: {},
    always: [],
  }
  const app = await mount((url) => {
    if (url.pathname === "/experimental/session") return json([session])
    if (url.pathname === `/session/${session.id}`) return json(session)
    if (url.pathname === `/session/${session.id}/message`) return json([{ info: assistant, parts: [part] }])
    if (url.pathname === `/session/${session.id}/todo` || url.pathname === `/session/${session.id}/diff`)
      return json([])
    if (url.pathname === "/question" || url.pathname === "/permission") {
      calls.push(url)
      if (url.searchParams.get("directory") !== session.directory) return json([])
      return json(url.pathname === "/question" ? live : [permission])
    }
    return undefined
  }, tmp.path)
  try {
    await app.sync.session.sync(session.id)
    expect(app.sync.data.question[session.id]).toEqual([request])
    expect(app.sync.data.permission[session.id]).toEqual([permission])
    expect(app.sync.session.questions(session.id)[0].restored).toBeUndefined()
    expect(calls.slice(-2).every((url) => url.searchParams.get("workspace") === session.workspaceID)).toBe(true)
    live = []
    await app.sync.session.sync(session.id)
    expect(app.sync.data.question[session.id]).toEqual([])
    expect(app.sync.session.questions(session.id)[0].restored).toBe(true)
    app.sync.session.dismissQuestion(app.sync.session.questions(session.id)[0])
    await app.sync.session.sync(session.id)
    expect(app.sync.session.questions(session.id)).toEqual([])
  } finally {
    app.app.renderer.destroy()
  }
})

test("a reply during refetch wins over a stale pending-question snapshot", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  let release: ((response: Response) => void) | undefined
  let hold = false
  const app = await mount((url) => {
    if (url.pathname === "/experimental/session") return json([session])
    if (url.pathname === `/session/${session.id}`) return json(session)
    if (url.pathname === `/session/${session.id}/message`) return json([{ info: assistant, parts: [part] }])
    if (url.pathname === `/session/${session.id}/todo` || url.pathname === `/session/${session.id}/diff`)
      return json([])
    if (url.pathname === "/permission") return json([])
    if (url.pathname === "/question") {
      if (hold && url.searchParams.get("directory") === session.directory) {
        return new Promise<Response>((resolve) => {
          release = resolve
        })
      }
      return json(url.searchParams.get("directory") === session.directory ? [request] : [])
    }
    return undefined
  }, tmp.path)
  try {
    await app.sync.session.sync(session.id)
    hold = true
    const refresh = app.sync.session.sync(session.id)
    await wait(() => !!release)
    app.emit({
      directory: session.directory,
      project: "proj_test",
      payload: {
        id: "evt_reply",
        type: "question.replied",
        properties: { sessionID: session.id, requestID: request.id, answers: [["A"]] },
      },
    })
    await wait(() => app.sync.data.question[session.id]?.length === 0)
    release!(json([request]))
    await refresh
    expect(app.sync.session.questions(session.id)).toEqual([])
  } finally {
    app.app.renderer.destroy()
  }
})
