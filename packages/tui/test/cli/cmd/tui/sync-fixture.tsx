/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { onMount } from "solid-js"
import { ArgsProvider, type Args } from "../../../../src/context/args"
import { KVProvider, useKV } from "../../../../src/context/kv"
import { ProjectProvider, useProject } from "../../../../src/context/project"
import { SDKProvider } from "../../../../src/context/sdk"
import { SyncProvider, useSync } from "../../../../src/context/sync"
import { PermissionProvider } from "../../../../src/context/permission"
import { ExitProvider } from "../../../../src/context/exit"
import { RouteProvider, useRoute, type Route } from "../../../../src/context/route"
import { createEventSource, createFetch, type FetchHandler, directory } from "../../../fixture/tui-sdk"
import { TestTuiContexts } from "../../../fixture/tui-environment"
export { createEventSource, createFetch, directory, eventSource, json, worktree } from "../../../fixture/tui-sdk"

export async function wait(fn: () => boolean, timeout = 2000) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition")
    await Bun.sleep(10)
  }
}

type Ctx = {
  kv: ReturnType<typeof useKV>
  project: ReturnType<typeof useProject>
  sync: ReturnType<typeof useSync>
  route: ReturnType<typeof useRoute>
}

export type MountOptions = {
  args?: Args
  /** Default `"complete"`. Use `"partial"` to proceed before the non-blocking session list finishes. */
  waitForStatus?: "complete" | "partial"
  route?: Route
  exit?: (reason?: unknown) => void
}

export async function mount(override?: FetchHandler, state?: string, options?: MountOptions) {
  const waitForStatus = options?.waitForStatus ?? "complete"
  const args = options?.args ?? {}
  const calls = createFetch(override)
  const events = createEventSource()
  let sync!: ReturnType<typeof useSync>
  let project!: ReturnType<typeof useProject>
  let kv!: ReturnType<typeof useKV>
  let route!: ReturnType<typeof useRoute>
  let done!: () => void
  const ready = new Promise<void>((resolve) => {
    done = resolve
  })

  function Probe() {
    const ctx: Ctx = { kv: useKV(), project: useProject(), sync: useSync(), route: useRoute() }
    onMount(() => {
      sync = ctx.sync
      project = ctx.project
      kv = ctx.kv
      route = ctx.route
      done()
    })
    return <box />
  }

  const app = await testRender(() => (
    <TestTuiContexts paths={state ? { state } : undefined}>
      <ArgsProvider {...args}>
        <KVProvider>
          <SDKProvider url="http://test" directory={directory} fetch={calls.fetch} events={events.source}>
            <PermissionProvider>
              <ProjectProvider>
                <ExitProvider exit={options?.exit ?? (() => {})}>
                  <RouteProvider initialRoute={options?.route}>
                    <SyncProvider>
                      <Probe />
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

  await Promise.race([
    ready,
    Bun.sleep(5000).then(() => {
      throw new Error("timed out waiting for sync mount")
    }),
  ])
  await wait(() => sync.status === waitForStatus)
  return { app, emit: events.emit, kv, project, sync, session: calls.session, route }
}
