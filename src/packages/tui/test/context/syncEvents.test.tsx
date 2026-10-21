/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { GlobalEvent } from "@opencode-ai/sdk/v2"
import { ArgsProvider } from "../../src/context/args"
import { ExitProvider } from "../../src/context/exit"
import { KVProvider } from "../../src/context/kv"
import { PermissionProvider } from "../../src/context/permission"
import { ProjectProvider } from "../../src/context/project"
import { RouteProvider } from "../../src/context/route"
import { SDKProvider, useSDK } from "../../src/context/sdk"
import { SyncProvider, useSync } from "../../src/context/sync"
import { tmpdir } from "../fixture/fixture"
import { createEventSource, createFetch, directory, json, type FetchHandler } from "../fixture/tui-sdk"
import { TestTuiContexts } from "../fixture/tui-environment"
import { mount, wait } from "../cli/cmd/tui/sync-fixture"

const sessionID = "ses_sync_events"
const messageID = "msg_sync_events"
const partID = "prt_sync_events"
const session = {
  id: sessionID,
  slug: "events",
  projectID: "proj_test",
  title: "events",
  time: { created: 0, updated: 0 },
  version: "1.15.13",
  directory: "/tmp/opencode/packages/opencode",
}
const assistant = {
  id: messageID,
  sessionID,
  role: "assistant" as const,
  agent: "build",
  modelID: "model",
  providerID: "test",
  mode: "build",
  parentID: "msg_user",
  path: { cwd: session.directory, root: session.directory },
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, completed: 2 },
}

function global(payload: GlobalEvent["payload"]): GlobalEvent {
  return { directory: "/tmp/other", project: "proj_test", payload }
}

function sessionRoutes(messages: FetchHandler) {
  return (url: URL) => {
    if (url.pathname === `/session/${sessionID}`) return json(session)
    if (url.pathname === `/session/${sessionID}/message`) return messages(url)
    if (url.pathname === `/session/${sessionID}/todo` || url.pathname === `/session/${sessionID}/diff`) return json([])
    return undefined
  }
}

// Serves a session list and empty transcripts for a tree of sessions.
function treeRoutes(sessions: (typeof session & { parentID?: string })[]) {
  return (url: URL) => {
    if (url.pathname === "/experimental/session") return json(sessions)
    const match = sessions.find((item) => url.pathname === `/session/${item.id}`)
    if (match) return json(match)
    const transcript = sessions.some((item) =>
      ["message", "todo", "diff"].some((path) => url.pathname === `/session/${item.id}/${path}`),
    )
    return transcript ? json([]) : undefined
  }
}

function childEvents(sessionID: string, messageID: string) {
  return [
    global({
      id: `evt_message_${sessionID}`,
      type: "message.updated",
      properties: { sessionID, info: { ...assistant, id: messageID, sessionID } },
    }),
    global({
      id: `evt_part_${sessionID}`,
      type: "message.part.updated",
      properties: {
        sessionID,
        time: 1,
        part: { id: `prt_${sessionID}`, sessionID, messageID, type: "text", text: "child" },
      },
    }),
  ]
}

function Throwing() {
  const sdk = useSDK()
  sdk.event.on("event", () => {
    throw new Error("handler failed")
  })
  return <box />
}

function Capture(props: { onSync: (sync: ReturnType<typeof useSync>) => void }) {
  props.onSync(useSync())
  return <box />
}

test("a throwing handler ahead of sync does not drop a later delta", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const calls = createFetch(sessionRoutes(() => json([])))
  const events = createEventSource()
  let sync: ReturnType<typeof useSync> | undefined
  const app = await testRender(() => (
    <TestTuiContexts paths={{ state: tmp.path }}>
      <ArgsProvider>
        <KVProvider>
          <SDKProvider url="http://test" directory={directory} fetch={calls.fetch} events={events.source}>
            <PermissionProvider>
              <ProjectProvider>
                <ExitProvider exit={() => {}}>
                  <RouteProvider>
                    <Throwing />
                    <SyncProvider>
                      <Capture onSync={(value) => (sync = value)} />
                    </SyncProvider>
                  </RouteProvider>
                </ExitProvider>
              </ProjectProvider>
            </PermissionProvider>
          </SDKProvider>
        </KVProvider>
      </ArgsProvider>
    </TestTuiContexts>
  ))

  try {
    await wait(() => sync?.status === "complete")
    await sync!.session.sync(sessionID)
    events.emit(global({ id: "evt_message", type: "message.updated", properties: { sessionID, info: assistant } }))
    events.emit(
      global({
        id: "evt_part",
        type: "message.part.updated",
        properties: { sessionID, time: 1, part: { id: partID, sessionID, messageID, type: "text", text: "" } },
      }),
    )
    events.emit(
      global({
        id: "evt_delta",
        type: "message.part.delta",
        properties: { sessionID, messageID, partID, field: "text", delta: "delta after a throw" },
      }),
    )
    await wait(() => sync?.data.part[messageID]?.[0]?.type === "text" && sync.data.part[messageID][0].text !== "")

    expect(sync?.data.part[messageID][0]).toMatchObject({ text: "delta after a throw" })
  } finally {
    app.renderer.destroy()
  }
})

test("removal events for an unknown session leave later events applied", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const { app, emit, sync } = await mount(undefined, tmp.path)

  try {
    emit(
      global({
        id: "evt_removed_message",
        type: "message.removed",
        properties: { sessionID: "ses_unknown", messageID: "msg_unknown" },
      }),
    )
    emit(
      global({
        id: "evt_removed_part",
        type: "message.part.removed",
        properties: { sessionID: "ses_unknown", messageID: "msg_unknown", partID: "prt_unknown" },
      }),
    )
    emit(global({ id: "evt_session", type: "session.updated", properties: { sessionID, info: session } }))
    await wait(() => sync.data.session.some((item) => item.id === sessionID))

    expect(sync.data.message["ses_unknown"]).toBeUndefined()
    expect(sync.data.part["msg_unknown"]).toBeUndefined()
  } finally {
    app.renderer.destroy()
  }
})

test("message.removed deletes the message's parts", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const { app, emit, sync } = await mount(
    sessionRoutes(() => json([])),
    tmp.path,
  )

  try {
    await sync.session.sync(sessionID)
    emit(global({ id: "evt_message", type: "message.updated", properties: { sessionID, info: assistant } }))
    emit(
      global({
        id: "evt_part",
        type: "message.part.updated",
        properties: {
          sessionID,
          time: 1,
          part: { id: partID, sessionID, messageID, type: "text", text: "removed with message" },
        },
      }),
    )
    await wait(() => sync.data.part[messageID]?.length === 1)
    emit(global({ id: "evt_removed", type: "message.removed", properties: { sessionID, messageID } }))
    await wait(() => sync.data.message[sessionID]?.length === 0)

    expect(sync.data.part[messageID]).toBeUndefined()
  } finally {
    app.renderer.destroy()
  }
})

test("streamed tool arguments append to a pending tool's raw input", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const { app, emit, sync } = await mount(
    sessionRoutes(() => json([])),
    tmp.path,
  )
  const raw = () => {
    const part = sync.data.part[messageID]?.[0]
    return part?.type === "tool" && part.state.status === "pending" ? part.state.raw : undefined
  }

  try {
    await sync.session.sync(sessionID)
    emit(global({ id: "evt_message", type: "message.updated", properties: { sessionID, info: assistant } }))
    emit(
      global({
        id: "evt_part",
        type: "message.part.updated",
        properties: {
          sessionID,
          time: 1,
          part: {
            id: partID,
            sessionID,
            messageID,
            type: "tool",
            tool: "read",
            callID: "call_1",
            state: { status: "pending", input: {}, raw: "" },
          },
        },
      }),
    )
    await wait(() => raw() === "")
    for (const [index, delta] of ['{"filePath":', '"src/a.ts"'].entries())
      emit(
        global({
          id: `evt_delta_${index}`,
          type: "message.part.delta",
          properties: { sessionID, messageID, partID, field: "state.raw", delta },
        }),
      )
    await wait(() => raw() === '{"filePath":"src/a.ts"')

    expect(Object.hasOwn(sync.data.part[messageID][0], "state.raw")).toBe(false)
  } finally {
    app.renderer.destroy()
  }
})

test("session.deleted removes the session's transcript, todos, diff, and status", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const { app, emit, sync } = await mount(
    sessionRoutes(() => json([])),
    tmp.path,
  )

  try {
    await sync.session.sync(sessionID)
    emit(global({ id: "evt_session", type: "session.updated", properties: { sessionID, info: session } }))
    emit(global({ id: "evt_message", type: "message.updated", properties: { sessionID, info: assistant } }))
    emit(
      global({
        id: "evt_part",
        type: "message.part.updated",
        properties: {
          sessionID,
          time: 1,
          part: { id: partID, sessionID, messageID, type: "text", text: "transcript" },
        },
      }),
    )
    emit(global({ id: "evt_todo", type: "todo.updated", properties: { sessionID, todos: [] } }))
    emit(global({ id: "evt_diff", type: "session.diff", properties: { sessionID, diff: [] } }))
    emit(global({ id: "evt_status", type: "session.status", properties: { sessionID, status: { type: "idle" } } }))
    await wait(() => sync.data.part[messageID]?.length === 1 && sync.data.session_status[sessionID] !== undefined)

    emit(global({ id: "evt_deleted", type: "session.deleted", properties: { sessionID, info: session } }))
    await wait(() => !sync.data.session.some((item) => item.id === sessionID))

    expect(Object.keys(sync.data.message)).not.toContain(sessionID)
    expect(Object.keys(sync.data.part)).not.toContain(messageID)
    expect(Object.keys(sync.data.todo)).not.toContain(sessionID)
    expect(Object.keys(sync.data.session_diff)).not.toContain(sessionID)
    expect(Object.keys(sync.data.session_status)).not.toContain(sessionID)
  } finally {
    app.renderer.destroy()
  }
})

test("session.deleted during a hydration does not resurrect the session", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")

  let resolveMessages!: (response: Response) => void
  const messages = new Promise<Response>((resolve) => {
    resolveMessages = resolve
  })
  let requested = false
  const { app, emit, sync } = await mount(
    sessionRoutes(() => {
      requested = true
      return messages
    }),
    tmp.path,
  )

  try {
    emit(global({ id: "evt_session", type: "session.updated", properties: { sessionID, info: session } }))
    await wait(() => sync.data.session.some((item) => item.id === sessionID))
    const hydrate = sync.session.sync(sessionID)
    await wait(() => requested)
    emit(global({ id: "evt_deleted", type: "session.deleted", properties: { sessionID, info: session } }))
    await wait(() => !sync.data.session.some((item) => item.id === sessionID))

    resolveMessages(
      json([{ info: assistant, parts: [{ id: partID, sessionID, messageID, type: "text", text: "stale" }] }]),
    )
    await hydrate

    expect(sync.data.session.some((item) => item.id === sessionID)).toBe(false)
    expect(sync.data.message[sessionID]).toBeUndefined()
    expect(sync.data.part[messageID]).toBeUndefined()
    expect(sync.data.todo[sessionID]).toBeUndefined()
    expect(sync.data.session_diff[sessionID]).toBeUndefined()
  } finally {
    app.renderer.destroy()
  }
})

test("reconnect during an off-route hydration leaves the session to be reloaded", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")

  let resolveFirst!: (response: Response) => void
  const first = new Promise<Response>((resolve) => {
    resolveFirst = resolve
  })
  let messageCalls = 0
  const { app, reconnect, sync } = await mount(
    sessionRoutes(() => {
      messageCalls++
      return messageCalls === 1 ? first : json([])
    }),
    tmp.path,
  )

  try {
    const hydrate = sync.session.sync(sessionID)
    await wait(() => messageCalls === 1)
    reconnect()
    resolveFirst(json([]))
    await hydrate
    await sync.session.sync(sessionID)

    expect(messageCalls).toBe(2)
  } finally {
    app.renderer.destroy()
  }
})

test("a delta for a part missing from a loaded session reloads the session", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")

  let messageCalls = 0
  const { app, emit, sync } = await mount(
    sessionRoutes(() => {
      messageCalls++
      return json([])
    }),
    tmp.path,
  )

  try {
    await sync.session.sync(sessionID)
    emit(
      global({
        id: "evt_delta",
        type: "message.part.delta",
        properties: { sessionID, messageID, partID, field: "text", delta: "missing part" },
      }),
    )
    await wait(() => messageCalls === 2)

    expect(messageCalls).toBe(2)
  } finally {
    app.renderer.destroy()
  }
})

test("transcript events for a session outside every opened tree are not stored", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const { app, emit, sync } = await mount(undefined, tmp.path)

  try {
    emit(global({ id: "evt_session", type: "session.updated", properties: { sessionID, info: session } }))
    emit(global({ id: "evt_message", type: "message.updated", properties: { sessionID, info: assistant } }))
    emit(
      global({
        id: "evt_part",
        type: "message.part.updated",
        properties: { sessionID, time: 1, part: { id: partID, sessionID, messageID, type: "text", text: "other" } },
      }),
    )
    emit(global({ id: "evt_status", type: "session.status", properties: { sessionID, status: { type: "busy" } } }))
    await wait(() => sync.data.session_status[sessionID]?.type === "busy")

    expect(Object.keys(sync.data.message)).not.toContain(sessionID)
    expect(Object.keys(sync.data.part)).not.toContain(messageID)
  } finally {
    app.renderer.destroy()
  }
})

test("a subagent created under an opened session keeps its transcript live", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const parent = { ...session, id: "ses_tree_parent" }
  const child = { ...session, id: "ses_tree_child", parentID: parent.id }
  const { app, emit, sync } = await mount(treeRoutes([parent]), tmp.path)

  try {
    await sync.session.sync(parent.id)
    emit(global({ id: "evt_child", type: "session.updated", properties: { sessionID: child.id, info: child } }))
    childEvents(child.id, "msg_tree_child").forEach(emit)
    await wait(() => sync.data.part["msg_tree_child"]?.length === 1)

    expect(sync.data.message[child.id]).toHaveLength(1)
  } finally {
    app.renderer.destroy()
  }
})

test("a subagent opened on its own keeps its siblings' transcripts live", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const parent = { ...session, id: "ses_tree_parent" }
  const first = { ...session, id: "ses_tree_first", parentID: parent.id }
  const second = { ...session, id: "ses_tree_second", parentID: parent.id }
  const { app, emit, sync } = await mount(treeRoutes([parent, first, second]), tmp.path)

  try {
    await sync.session.sync(first.id)
    childEvents(second.id, "msg_tree_second").forEach(emit)
    await wait(() => sync.data.part["msg_tree_second"]?.length === 1)

    expect(sync.data.message[second.id]).toHaveLength(1)
  } finally {
    app.renderer.destroy()
  }
})
