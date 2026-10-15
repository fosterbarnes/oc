import { createMemo, createResource, createSignal } from "solid-js"
import path from "path"
import type { GlobalSession } from "@opencode-ai/sdk/v2"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { DialogConfirm } from "../ui/dialog-confirm"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { useSDK } from "../context/sdk"
import { useSync } from "../context/sync"
import { useLocal } from "../context/local"
import { useRoute } from "../context/route"
import { useProject } from "../context/project"
import { errorMessage } from "../util/error"

type CleanupAction = "archive" | "delete"

const _PAGE = 100

// Completed root sessions that are safe to touch: not open, not running, not pinned, and not on a
// disconnected workspace.
export function cleanupTargets<T extends Pick<GlobalSession, "id" | "workspaceID">>(input: {
  sessions: T[]
  openID?: string
  isBusy: (id: string) => boolean
  isPinned: (id: string) => boolean
  isUnreachable: (workspaceID: string) => boolean
}) {
  return input.sessions.filter(
    (session) =>
      session.id !== input.openID &&
      !input.isBusy(session.id) &&
      !input.isPinned(session.id) &&
      !(session.workspaceID && input.isUnreachable(session.workspaceID)),
  )
}

// The folder picker reopens this dialog, so action and folder come in as props. `directory`:
// omitted = current folder, null = all folders.
export function DialogSessionCleanup(props: { action?: CleanupAction; directory?: string | null }) {
  const dialog = useDialog()
  const toast = useToast()
  const sdk = useSDK()
  const sync = useSync()
  const local = useLocal()
  const route = useRoute()
  const project = useProject()
  const [action, setAction] = createSignal<CleanupAction>(props.action ?? "delete")
  const directory = () => (props.directory === null ? undefined : (props.directory ?? sdk.directory))

  const [completed] = createResource(async () => {
    const all: GlobalSession[] = []
    let cursor: number | undefined
    while (true) {
      const result = await sdk.client.experimental.session.list({
        roots: true,
        status: "complete",
        limit: _PAGE,
        ...(cursor ? { cursor } : {}),
      })
      if (result.error) throw new Error(errorMessage(result.error))
      const page = result.data ?? []
      all.push(...page)
      if (page.length < _PAGE) return all
      cursor = page[page.length - 1].time.updated
    }
  })

  const eligible = createMemo(() =>
    cleanupTargets({
      sessions: completed() ?? [],
      openID: route.data.type === "session" ? route.data.sessionID : undefined,
      isBusy: (id) => ["busy", "retry"].includes(sync.data.session_status?.[id]?.type ?? ""),
      isPinned: (id) => local.session.isPinned(id),
      isUnreachable: (id) => {
        const status = project.workspace.status(id)
        return status !== undefined && status !== "connected"
      },
    }),
  )

  const targets = createMemo(() =>
    eligible().filter((session) => !directory() || session.directory === directory()),
  )
  const scopeTitle = () => {
    const dir = directory()
    return dir ? path.basename(dir) : "all folders"
  }

  function pickScope() {
    const counts = new Map<string, number>()
    for (const { directory: dir } of eligible()) counts.set(dir, (counts.get(dir) ?? 0) + 1)
    const folders = [...counts].sort(([a], [b]) => path.basename(a).localeCompare(path.basename(b)))
    const reopen = (dir: string | null) =>
      dialog.replace(() => <DialogSessionCleanup action={action()} directory={dir} />)
    dialog.replace(() => (
      <DialogSelect<string | null>
        title="Clean up folder"
        current={directory() ?? null}
        options={[
          { value: null, title: "All folders", description: String(eligible().length) },
          ...folders.map(([dir, count]) => ({
            value: dir,
            title: path.basename(dir),
            description: String(count),
          })),
        ]}
        onSelect={(option) => reopen(option.value)}
      />
    ))
  }

  async function run() {
    const ids = targets().map((session) => session.id)
    if (ids.length === 0) return
    const verb = action()
    if (verb === "delete") {
      const confirmed = await DialogConfirm.show(
        dialog,
        "Delete completed sessions",
        `Permanently delete ${ids.length} completed sessions in ${scopeTitle()}, including their ` +
          "subagent sessions. This cannot be undone.",
      )
      if (!confirmed) return
    }
    dialog.clear()
    let failed = 0
    let firstError: string | undefined
    for (const sessionID of ids) {
      const result = await (verb === "delete"
        ? sdk.client.session.delete({ sessionID })
        : sdk.client.session.update({ sessionID, time: { archived: Date.now() } })
      ).catch((error: unknown) => ({ error }))
      if (!result.error) continue
      failed++
      firstError ??= errorMessage(result.error)
    }
    const done = `${verb === "delete" ? "Deleted" : "Archived"} ${ids.length - failed} sessions`
    if (failed === 0) return toast.show({ variant: "success", message: done })
    toast.show({ variant: "error", title: `${done}, ${failed} failed`, message: firstError ?? "" })
  }

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    const count = targets().length
    return [
      {
        title: "Action",
        value: "action",
        description: action(),
        onSelect: () => setAction(action() === "archive" ? "delete" : "archive"),
      },
      { title: "Folder", value: "scope", description: scopeTitle(), onSelect: pickScope },
      {
        title: `${action() === "archive" ? "Archive" : "Delete"} ${count} sessions`,
        value: "run",
        description: completed.loading
          ? "loading"
          : completed.error
            ? `failed to load: ${errorMessage(completed.error)}`
            : undefined,
        onSelect: () => void run(),
      },
    ]
  })

  return <DialogSelect title="Clean up completed sessions" renderFilter={false} options={options()} />
}
