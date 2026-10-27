/** @jsxImportSource @opentui/solid */
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { onCleanup } from "solid-js"
import { tmpdir } from "../fixture/fixture"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"
import { TestTuiContexts } from "../fixture/tui-environment"
import { createFetch, directory, eventSource, json } from "../fixture/tui-sdk"
import { DialogQueue } from "../../src/component/dialogQueue"
import { ArgsProvider } from "../../src/context/args"
import { ExitProvider } from "../../src/context/exit"
import { SDKProvider } from "../../src/context/sdk"
import { KVProvider } from "../../src/context/kv"
import { LocalProvider } from "../../src/context/local"
import { PromptRefProvider } from "../../src/context/prompt"
import { PermissionProvider } from "../../src/context/permission"
import { ProjectProvider } from "../../src/context/project"
import { RouteProvider } from "../../src/context/route"
import { SyncProvider } from "../../src/context/sync"
import { ThemeProvider } from "../../src/context/theme"
import { TuiConfigProvider } from "../../src/config"
import { DialogProvider, useDialog } from "../../src/ui/dialog"
import { ToastProvider } from "../../src/ui/toast"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../../src/keymap"

const sessionID = "ses_queue"

// Serves the queue snapshot and records every queue request body.
async function mountQueue(input: {
  root: string
  snapshot: { pause: "none" | "restart" | "error" | "interrupted"; entries: unknown[] }
  calls: unknown[]
}) {
  const state = path.join(input.root, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")
  // The dialog parses edits against the synced command list, so sync's startup requests are served too.
  const startup = createFetch()
  const fetch = Object.assign(
    async (url: Request | string | URL, init?: RequestInit) => {
      const request = new Request(url, init)
      if (new URL(request.url).pathname !== `/session/${sessionID}/queue`) return startup.fetch(request)
      if (request.method === "POST") input.calls.push(await request.clone().json())
      return json(input.snapshot)
    },
    { preconnect: () => {} },
  )

  function Open() {
    const dialog = useDialog()
    dialog.replace(() => <DialogQueue sessionID={sessionID} />)
    return null
  }

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const resolvedConfig = createTuiResolvedConfig({ leader_timeout: 1000 })
    const off = registerOpencodeKeymap(keymap, renderer, resolvedConfig)
    onCleanup(off)

    return (
      <TestTuiContexts directory={input.root} paths={{ home: input.root, state, worktree: input.root }}>
        <ArgsProvider>
          <OpencodeKeymapProvider keymap={keymap}>
            <TuiConfigProvider config={resolvedConfig}>
              <KVProvider>
                <SDKProvider url="http://queue.test" directory={directory} fetch={fetch} events={eventSource()}>
                  <PermissionProvider>
                    <ProjectProvider>
                      <ExitProvider
                        exit={(error) => {
                          throw error
                        }}
                      >
                        <RouteProvider initialRoute={{ type: "home" }}>
                          <SyncProvider>
                            <ThemeProvider mode="dark">
                              <ToastProvider>
                                <LocalProvider>
                                  <PromptRefProvider>
                                    <DialogProvider>
                                      <Open />
                                    </DialogProvider>
                                  </PromptRefProvider>
                                </LocalProvider>
                              </ToastProvider>
                            </ThemeProvider>
                          </SyncProvider>
                        </RouteProvider>
                      </ExitProvider>
                    </ProjectProvider>
                  </PermissionProvider>
                </SDKProvider>
              </KVProvider>
            </TuiConfigProvider>
          </OpencodeKeymapProvider>
        </ArgsProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(() => <Harness />, { width: 100, height: 40 })
  return {
    async frame() {
      await app.renderOnce()
      return app.captureCharFrame()
    },
    cleanup() {
      app.renderer.destroy()
    },
  }
}

// The snapshot arrives over fetch, so the first frame can precede it.
async function frameWith(queue: Awaited<ReturnType<typeof mountQueue>>, text: string) {
  const start = Date.now()
  while (!(await queue.frame()).includes(text)) {
    if (Date.now() - start > 2000) throw new Error(`frame never showed: ${text}`)
    await Bun.sleep(10)
  }
  return queue.frame()
}

test("names the pause reason in the title and lists each waiting prompt", async () => {
  await using tmp = await tmpdir()
  const queue = await mountQueue({
    root: tmp.path,
    snapshot: {
      pause: "restart",
      entries: [
        { id: "msg_one", state: "pending", text: "tidy the changelog", attachments: 0 },
        { id: "msg_two", state: "pending", text: "rerun the notes", attachments: 1 },
      ],
    },
    calls: [],
  })
  try {
    const frame = await frameWith(queue, "tidy the changelog")
    expect(frame).toContain("Paused after restart")
    expect(frame).toContain("Resume queue")
    expect(frame).toContain("tidy the changelog")
    expect(frame).toContain("rerun the notes")
    expect(frame).toContain("1 attachment")
  } finally {
    queue.cleanup()
  }
})

test("shows an empty queue without a resume option", async () => {
  await using tmp = await tmpdir()
  const queue = await mountQueue({ root: tmp.path, snapshot: { pause: "none", entries: [] }, calls: [] })
  try {
    const frame = await frameWith(queue, "Queue is empty")
    expect(frame).toContain("Queue is empty")
    expect(frame).not.toContain("Resume queue")
  } finally {
    queue.cleanup()
  }
})
