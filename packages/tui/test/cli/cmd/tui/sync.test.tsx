/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { tmpdir } from "../../../fixture/fixture"
import { directory, json, mount, wait } from "./sync-fixture"
import type { GlobalEvent } from "@opencode-ai/sdk/v2"

const attachSessionID = "ses_attach_preserve"
const attachMessageID = "msg_attach_preserve"
const attachSession = {
  id: attachSessionID,
  title: "attached",
  time: { created: 0, updated: 0 },
  version: "1.15.13",
  directory,
}
const attachMessage = {
  id: attachMessageID,
  sessionID: attachSessionID,
  role: "user" as const,
  time: { created: 1 },
}

function branchEvent(branch: string, workspace?: string): GlobalEvent {
  return {
    directory: "/tmp/other",
    project: "proj_test",
    workspace,
    payload: {
      id: `evt_vcs_${branch}`,
      type: "vcs.branch.updated",
      properties: { branch },
    },
  }
}

describe("tui sync", () => {
  test("preserves attached session and hydration when the global list omits it", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")

    let releaseBootstrapList!: () => void
    const bootstrapList = new Promise<Response>((resolve) => {
      releaseBootstrapList = () => resolve(json([]))
    })
    let listCalls = 0

    const { app, sync } = await mount(
      (url) => {
        if (url.pathname === "/experimental/session") {
          if (listCalls++ === 0) return bootstrapList
          return json([])
        }
        if (url.pathname === `/session/${attachSessionID}`) return json(attachSession)
        if (url.pathname === `/session/${attachSessionID}/message`) {
          return json([{ info: attachMessage, parts: [] }])
        }
        if (url.pathname === `/session/${attachSessionID}/todo` || url.pathname === `/session/${attachSessionID}/diff`)
          return json([])
        return undefined
      },
      tmp.path,
      { args: { sessionID: attachSessionID }, waitForStatus: "partial" },
    )

    try {
      await sync.session.sync(attachSessionID)
      await wait(() => sync.data.message[attachSessionID]?.length === 1)

      releaseBootstrapList()
      await wait(() => sync.status === "complete")

      expect(sync.session.get(attachSessionID)?.title).toBe("attached")
      expect(sync.data.message[attachSessionID]?.[0]?.id).toBe(attachMessageID)

      await sync.session.refresh()

      expect(sync.session.get(attachSessionID)?.title).toBe("attached")
      expect(sync.data.message[attachSessionID]?.[0]?.id).toBe(attachMessageID)
    } finally {
      app.renderer.destroy()
    }
  })

  test("refreshes sessions globally without directory filtering", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, kv, sync, session } = await mount(undefined, tmp.path)

    try {
      expect(session.at(-1)?.pathname).toBe("/experimental/session")
      expect(session.at(-1)?.searchParams.get("path")).toBeNull()
      expect(session.at(-1)?.searchParams.get("scope")).toBeNull()

      kv.set("session_directory_filter_enabled", false)
      await sync.session.refresh()

      expect(session.at(-1)?.pathname).toBe("/experimental/session")
      expect(session.at(-1)?.searchParams.get("path")).toBeNull()
      expect(session.at(-1)?.searchParams.get("scope")).toBeNull()
    } finally {
      app.renderer.destroy()
    }
  })

  test("keeps sessions from other directories in the global sync list", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, sync } = await mount(
      (url) =>
        url.pathname === "/experimental/session"
          ? json([
              {
                id: "ses_other_project",
                slug: "other-project",
                projectID: "proj_other",
                directory: "/tmp/other-project",
                title: "test",
                time: { created: 1, updated: 1 },
                version: "test",
              },
            ])
          : undefined,
      tmp.path,
    )

    try {
      expect(sync.data.session.map((item) => item.title)).toContain("test")
    } finally {
      app.renderer.destroy()
    }
  })

  test("vcs branch updates only apply for the active workspace", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, emit, project, sync } = await mount(undefined, tmp.path)

    try {
      expect(sync.data.vcs?.branch).toBe("main")

      project.workspace.set("ws_a")
      emit(branchEvent("other", "ws_b"))
      await Bun.sleep(30)

      expect(sync.data.vcs?.branch).toBe("main")

      emit(branchEvent("feature", "ws_a"))
      await wait(() => sync.data.vcs?.branch === "feature")

      expect(sync.data.vcs?.branch).toBe("feature")
    } finally {
      app.renderer.destroy()
    }
  })

  function disposedEvent(): GlobalEvent {
    return {
      directory,
      project: "proj_test",
      payload: {
        id: "evt_disposed",
        type: "server.instance.disposed",
        properties: { directory },
      },
    }
  }

  test("retries bootstrap after a restart gap without exiting", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    let failNextProviders = false
    let providerCalls = 0
    let exited = false
    const { app, emit, sync } = await mount(
      (url) => {
        if (url.pathname === "/config/providers") {
          providerCalls++
          if (failNextProviders) {
            failNextProviders = false
            return json({ error: "restart gap" }, { status: 500 })
          }
          return undefined
        }
        return undefined
      },
      tmp.path,
      {
        exit: () => {
          exited = true
        },
      },
    )

    try {
      const baseline = providerCalls
      sync.restart.begin()
      failNextProviders = true
      emit(disposedEvent())
      await wait(() => providerCalls >= baseline + 2)
      expect(exited).toBe(false)
      expect(sync.status).toBe("complete")
    } finally {
      app.renderer.destroy()
    }
  })

  test("coalesces overlapping restart recovery bootstraps", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    let providerCalls = 0
    const { app, emit, sync } = await mount(
      (async (url) => {
        if (url.pathname === "/config/providers") {
          providerCalls++
          if (providerCalls > 1) await Bun.sleep(50)
          return undefined
        }
        return undefined
      }) as (url: URL) => Promise<Response | undefined>,
      tmp.path,
    )

    try {
      const baseline = providerCalls
      sync.restart.begin()
      emit(disposedEvent())
      emit(disposedEvent())
      await wait(() => providerCalls > baseline)
      await wait(() => sync.status === "complete")
      expect(providerCalls).toBe(baseline + 1)
    } finally {
      app.renderer.destroy()
    }
  })

  test("rehydrates the captured session after restart", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    let messageCalls = 0
    const { app, emit, route, sync } = await mount(
      (url) => {
        if (url.pathname === "/experimental/session") return json([attachSession])
        if (url.pathname === `/session/${attachSessionID}`) return json(attachSession)
        if (url.pathname === `/session/${attachSessionID}/message`) {
          messageCalls++
          return json([{ info: attachMessage, parts: [] }])
        }
        if (url.pathname === `/session/${attachSessionID}/todo` || url.pathname === `/session/${attachSessionID}/diff`)
          return json([])
        return undefined
      },
      tmp.path,
      { route: { type: "session", sessionID: attachSessionID } },
    )

    try {
      await sync.session.sync(attachSessionID)
      const messagesBefore = messageCalls
      sync.restart.begin()
      emit(disposedEvent())
      await wait(() => messageCalls > messagesBefore)
      expect(route.data).toEqual({ type: "session", sessionID: attachSessionID })
      expect(sync.data.message[attachSessionID]?.[0]?.id).toBe(attachMessageID)
    } finally {
      app.renderer.destroy()
    }
  })

  test("falls back to home when the captured session is gone", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    let listCalls = 0
    const { app, emit, route, sync } = await mount(
      (url) => {
        if (url.pathname === "/experimental/session") {
          listCalls++
          if (listCalls > 1) return json([])
          return json([attachSession])
        }
        return undefined
      },
      tmp.path,
      { route: { type: "session", sessionID: attachSessionID } },
    )

    try {
      expect(sync.session.get(attachSessionID)?.id).toBe(attachSessionID)
      sync.restart.begin()
      emit(disposedEvent())
      await wait(() => route.data.type === "home")
      expect(route.data).toEqual({ type: "home" })
    } finally {
      app.renderer.destroy()
    }
  })

  test("ordinary disposal still fatally exits when bootstrap fails", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    let failNextProviders = false
    let exited = false
    const { app, emit } = await mount(
      (url) => {
        if (url.pathname === "/config/providers") {
          if (failNextProviders) return json({ error: "disposed" }, { status: 500 })
          return undefined
        }
        return undefined
      },
      tmp.path,
      {
        exit: () => {
          exited = true
        },
      },
    )

    try {
      failNextProviders = true
      emit(disposedEvent())
      await wait(() => exited)
      expect(exited).toBe(true)
    } finally {
      app.renderer.destroy()
    }
  })
})
