import { useDialog } from "../ui/dialog"
import { DialogSelect } from "../ui/dialog-select"
import { useRoute } from "../context/route"
import { useSync } from "../context/sync"
import { batch, createMemo, createResource, createSignal, For, onCleanup, onMount } from "solid-js"
import { TextAttributes } from "@opentui/core"
import type { ExperimentalSessionListData } from "@opencode-ai/sdk/v2"
import path from "path"
import { Locale } from "../util/locale"
import { useProject } from "../context/project"
import { useTheme } from "../context/theme"
import { useSDK } from "../context/sdk"
import { useLocal } from "../context/local"
import { DialogSessionRename } from "./dialog-session-rename"
import { createDebouncedSignal } from "../util/signal"
import { useToast } from "../ui/toast"
import { openWorkspaceSelect, type WorkspaceSelection, warpWorkspaceSession } from "./dialog-workspace-create"
import { Spinner } from "./spinner"
import { errorMessage } from "../util/error"
import { DialogSessionDeleteFailed } from "./dialog-session-delete-failed"
import { useCommandShortcut } from "../keymap"
import { useEvent } from "../context/event"
import { useTuiConfig } from "../config"

type SessionStatusFilter = NonNullable<ExperimentalSessionListData["query"]>["status"]

const statusChoices = [
  { value: undefined, title: "All" },
  { value: "unmarked", title: "Unmarked" },
  { value: "in_progress", title: "In progress" },
  { value: "complete", title: "Complete" },
  { value: "failed", title: "Failed" },
] as const

export function createDialogSessionListQuery(input: { search?: string; status?: SessionStatusFilter }) {
  const search = input.search?.trim()
  return {
    roots: true,
    limit: search ? 30 : 100,
    ...(search ? { search } : {}),
    ...(input.status ? { status: input.status } : {}),
  }
}

export function loadDialogSessionList<T>(input: {
  search?: string
  status?: SessionStatusFilter
  list: (query: ReturnType<typeof createDialogSessionListQuery>) => Promise<{ data?: T[] }>
}) {
  return input.list(createDialogSessionListQuery(input)).then(
    (result) => result.data,
    () => undefined,
  )
}

export function DialogSessionList() {
  const dialog = useDialog()
  const route = useRoute()
  const sync = useSync()
  const project = useProject()
  const { theme } = useTheme()
  const sdk = useSDK()
  const event = useEvent()
  const local = useLocal()
  const toast = useToast()
  const tuiConfig = useTuiConfig()
  const [toDelete, setToDelete] = createSignal<string>()
  const [deleted, setDeleted] = createSignal(new Set<string>())
  const [search, setSearch] = createDebouncedSignal("", 150)
  const [status, setStatus] = createSignal<SessionStatusFilter>()
  const statusHint = useCommandShortcut("dialog.session.status.cycle")
  const deleteHint = useCommandShortcut("session.delete")
  const quickSwitch1 = useCommandShortcut("session.quick_switch.1")
  const quickSwitch9 = useCommandShortcut("session.quick_switch.9")

  function changeStatus(value: SessionStatusFilter) {
    batch(() => {
      setToDelete(undefined)
      setStatus(value)
    })
  }

  async function toggleMark(
    sessionID: string,
    mark: "sessionComplete" | "sessionFailed" | "sessionInProgress",
  ) {
    const session = sessions().find((item) => item.id === sessionID)
    if (!session) return
    const result = await sdk.client.session.update({ sessionID, [mark]: !session[mark] })
    if (result.error) {
      toast.show({ message: errorMessage(result.error), variant: "error" })
      return
    }
    await sync.session.refresh()
    await refetchBrowse()
    if (search()) await refetch()
  }

  const filterCommands = createMemo(() => [
    {
      name: "dialog.session.status.cycle",
      title: "Cycle session status filter",
      category: "Dialog",
      run() {
        const index = statusChoices.findIndex((choice) => choice.value === status())
        changeStatus(statusChoices[(index + 1) % statusChoices.length].value)
      },
    },
  ])
  const filterBindings = createMemo(() => tuiConfig.keybinds.get("dialog.session.status.cycle"))

  const browseQuery = createMemo(() => createDialogSessionListQuery({ status: status() }))
  const searchQuery = createMemo(() =>
    search().trim() ? createDialogSessionListQuery({ search: search(), status: status() }) : undefined,
  )
  const fetchSessions = async (query: ReturnType<typeof createDialogSessionListQuery>) => ({
    query,
    data: await loadDialogSessionList({ ...query, list: (query) => sdk.client.experimental.session.list(query) }),
  })
  const [browseResponse, { refetch: refetchBrowse }] = createResource(browseQuery, fetchSessions)
  const [searchResponse, { refetch }] = createResource(searchQuery, fetchSessions)
  // Solid retains the previous resource value during loading. Never use another query's rows.
  const browseResults = createMemo(() =>
    browseResponse()?.query === browseQuery() ? browseResponse()?.data : undefined,
  )
  const searchResults = createMemo(() =>
    searchResponse()?.query === searchQuery() ? searchResponse()?.data : undefined,
  )

  const currentSessionID = createMemo(() => (route.data.type === "session" ? route.data.sessionID : undefined))
  const sessions = createMemo(() => {
    const result = (searchQuery() ? searchResults() : browseResults()) ?? sync.data.session
    const synced = new Map(sync.data.session.map((session) => [session.id, session]))
    const ids = new Set(result.map((session) => session.id))
    const extra = [currentSessionID(), ...local.session.pinned()].flatMap((id) => {
      if (!id || ids.has(id)) return []
      const session = synced.get(id)
      if (session) ids.add(id)
      return session ? [session] : []
    })
    const query = search().trim().toLowerCase()
    return [...result.map((session) => synced.get(session.id) ?? session), ...extra]
      .filter((session) => !deleted().has(session.id))
      .filter((session) => !query || session.title.toLowerCase().includes(query))
      .filter((session) => {
        if (status() === "in_progress") return session.sessionInProgress
        if (status() === "complete") return session.sessionComplete
        if (status() === "failed") return session.sessionFailed
        if (status() === "unmarked")
          return !session.sessionInProgress && !session.sessionComplete && !session.sessionFailed
        return true
      })
  })

  onCleanup(
    event.on("session.deleted", (event) => {
      setDeleted((current) => new Set(current).add(event.properties.info.id))
    }),
  )

  function recover(session: NonNullable<ReturnType<typeof sessions>[number]>) {
    const workspace = project.workspace.get(session.workspaceID!)
    const list = () => dialog.replace(() => <DialogSessionList />)
    const warp = async (selection: WorkspaceSelection) => {
      const workspaceID = await (async () => {
        if (selection.type === "none") return null
        if (selection.type === "existing") return selection.workspaceID
        let result
        try {
          result = await sdk.client.experimental.workspace.create({ type: selection.workspaceType, branch: null })
        } catch (err) {
          toast.show({
            title: "Failed to create workspace",
            message: errorMessage(err),
            variant: "error",
          })
          return
        }
        const workspace = result?.data
        if (!workspace) {
          toast.show({
            title: "Failed to create workspace",
            message: errorMessage(result?.error ?? "no response"),
            variant: "error",
          })
          return
        }
        await project.workspace.sync()
        return workspace.id
      })()
      if (workspaceID === undefined) return
      await warpWorkspaceSession({
        dialog,
        sdk,
        sync,
        project,
        toast,
        sourceWorkspaceID: session.workspaceID,
        workspaceID,
        sessionID: session.id,
        copyChanges: false,
        done: list,
      })
    }
    dialog.replace(() => (
      <DialogSessionDeleteFailed
        session={session.title}
        workspace={workspace?.name ?? session.workspaceID!}
        onDone={list}
        onDelete={async () => {
          const current = currentSessionID()
          const info = current ? sync.data.session.find((item) => item.id === current) : undefined
          const result = await sdk.client.experimental.workspace.remove({ id: session.workspaceID! })
          if (result.error) {
            toast.show({
              variant: "error",
              title: "Failed to delete workspace",
              message: errorMessage(result.error),
            })
            return false
          }
          await project.workspace.sync()
          await sync.session.refresh()
          await refetchBrowse()
          if (search()) await refetch()
          if (info?.workspaceID === session.workspaceID) {
            route.navigate({ type: "home" })
          }
          return true
        }}
        onRestore={() => {
          void openWorkspaceSelect({
            dialog,
            sdk,
            sync,
            project,
            toast,
            onSelect: (selection) => {
              void warp(selection)
            },
          })
          return false
        }}
      />
    ))
  }

  function orderByRecency(sessionsList: NonNullable<ReturnType<typeof sessions>>) {
    return sessionsList
      .filter((x) => x.parentID === undefined)
      .toSorted((a, b) => b.time.updated - a.time.updated)
      .map((x) => x.id)
  }

  const browseOrder = createMemo(() => orderByRecency(browseResults() ?? sync.data.session))

  const quickSwitchHint = createMemo(() => {
    const first = quickSwitch1()
    const last = quickSwitch9()
    if (!first || !last) return undefined
    return quickSwitchRange(first, last)
  })
  const quickSwitchFooterHints = createMemo(() => {
    const hint = quickSwitchHint()
    return hint && local.session.slots().length > 0 ? [{ title: "switch", label: hint }] : []
  })

  const options = createMemo(() => {
    const today = new Date().toDateString()
    const sessionMap = new Map(
      sessions()
        .filter((x) => x.parentID === undefined)
        .map((x) => [x.id, x]),
    )

    const order = searchQuery() ? orderByRecency(sessions()) : browseOrder()
    const current = currentSessionID()
    const displayOrder = current && sessionMap.has(current) && !order.includes(current) ? [...order, current] : order

    const pinned = local.session.pinned().filter((id) => sessionMap.has(id))
    const pinnedSet = new Set(pinned)
    const slotByID = new Map<string, number>(local.session.slots().map((id, i) => [id, i + 1]))

    function buildOption(id: string, category: string) {
      const x = sessionMap.get(id)
      if (!x) return undefined
      const directory = x.path
        ? x.directory.endsWith(x.path)
          ? x.directory.slice(0, -x.path.length).replace(/\/$/, "")
          : undefined
        : x.directory
      const footer =
        directory && directory !== project.data.project.mainDir ? Locale.truncate(path.basename(directory), 20) : ""

      const isDeleting = toDelete() === x.id
      const status = sync.data.session_status?.[x.id]
      const isWorking = status?.type === "busy" || status?.type === "retry"
      const slot = slotByID.get(x.id)
      const gutter = isWorking
        ? () => <Spinner />
        : slot !== undefined
          ? () => <text fg={theme.accent}>{slot}</text>
          : undefined
      return {
        title: isDeleting ? `Press ${deleteHint()} again to confirm` : x.title,
        titleView:
          !isDeleting && (x.sessionFailed || x.sessionComplete || x.sessionInProgress) ? (
            <>
              <span style={{ fg: x.sessionFailed ? theme.error : x.sessionComplete ? theme.success : theme.text }}>
                {x.sessionFailed ? "\u2717" : x.sessionComplete ? "\u2713" : "-"}
              </span>{" "}
              {Locale.truncate(x.title, 59)}
            </>
          ) : undefined,
        bg: isDeleting ? theme.error : undefined,
        value: x.id,
        category,
        footer,
        gutter,
      }
    }

    const remaining = displayOrder
      .filter((id) => !pinnedSet.has(id))
      .map((id) => {
        const x = sessionMap.get(id)
        if (!x) return undefined
        const label = new Date(x.time.updated).toDateString()
        return buildOption(id, label === today ? "Today" : label)
      })
      .filter((x) => x !== undefined)

    return [...pinned.map((id) => buildOption(id, "Pinned")).filter((x) => x !== undefined), ...remaining]
  })
  const hasOptions = createMemo(() => options().length > 0)

  onMount(() => {
    dialog.setSize("large")
  })

  return (
    <DialogSelect
      title="Sessions"
      titleView={
        <box flexDirection="column" gap={1}>
          <text fg={theme.text} attributes={TextAttributes.BOLD}>Sessions</text>
          <box flexDirection="row" gap={1}>
            <For each={statusChoices}>
              {(choice) => (
                <text
                  id={`session-status-${choice.value ?? "all"}`}
                  fg={theme.text}
                  attributes={status() === choice.value ? TextAttributes.BOLD : undefined}
                  onMouseUp={() => changeStatus(choice.value)}
                >
                  {status() === choice.value ? `[${choice.title}]` : choice.title}
                </text>
              )}
            </For>
            <text fg={theme.textMuted}>{statusHint()}</text>
          </box>
        </box>
      }
      emptyView={
        <box paddingLeft={4} paddingRight={4} paddingTop={1}>
          <text fg={theme.textMuted}>No matching sessions</text>
        </box>
      }
      options={options()}
      skipFilter={true}
      preserveSelection={true}
      current={currentSessionID()}
      onFilter={setSearch}
      onMove={() => {
        setToDelete(undefined)
      }}
      onSelect={(option) => {
        route.navigate({
          type: "session",
          sessionID: option.value,
        })
        dialog.clear()
      }}
      actions={[
        {
          command: "session.pin.toggle",
          title: "pin/unpin",
          hidden: () => !hasOptions(),
          onTrigger: (option: { value: string }) => {
            local.session.togglePin(option.value)
          },
        },
        {
          command: "session.delete",
          title: "delete",
          hidden: () => !hasOptions(),
          onTrigger: async (option) => {
            if (toDelete() === option.value) {
              const session = sessions().find((item) => item.id === option.value)
              const status = session?.workspaceID ? project.workspace.status(session.workspaceID) : undefined

              try {
                const result = await sdk.client.session.delete({
                  sessionID: option.value,
                })
                if (result.error) {
                  if (session?.workspaceID) {
                    recover(session)
                  } else {
                    toast.show({
                      variant: "error",
                      title: "Failed to delete session",
                      message: errorMessage(result.error),
                    })
                  }
                  setToDelete(undefined)
                  return
                }
              } catch (err) {
                if (session?.workspaceID) {
                  recover(session)
                } else {
                  toast.show({
                    variant: "error",
                    title: "Failed to delete session",
                    message: errorMessage(err),
                  })
                }
                setToDelete(undefined)
                return
              }
              if (status && status !== "connected") {
                await sync.session.refresh()
              }
              await refetchBrowse()
              if (search()) await refetch()
              setToDelete(undefined)
              return
            }
            setToDelete(option.value)
          },
        },
        {
          command: "session.complete.toggle",
          title: "complete/incomplete",
          hidden: () => !hasOptions(),
          onTrigger: (option) => toggleMark(option.value, "sessionComplete"),
        },
        {
          command: "session.failed.toggle",
          title: "failed/not failed",
          hidden: () => !hasOptions(),
          onTrigger: (option) => toggleMark(option.value, "sessionFailed"),
        },
        {
          command: "session.rename",
          title: "rename",
          hidden: () => !hasOptions(),
          onTrigger: async (option) => {
            dialog.replace(() => <DialogSessionRename session={option.value} />)
          },
        },
        {
          command: "session.in_progress.toggle",
          title: "in progress/unmarked",
          hidden: () => !hasOptions(),
          onTrigger: (option) => toggleMark(option.value, "sessionInProgress"),
        },
      ]}
      footerHints={quickSwitchFooterHints()}
      commands={filterCommands()}
      commandBindings={filterBindings()}
    />
  )
}

function quickSwitchRange(first: string, last: string) {
  const prefix = first.slice(0, -1)
  if (first.endsWith("1") && last === `${prefix}9`) return `${prefix}1-9`
  return `${first} through ${last}`
}
