import type {
  Message,
  Agent,
  Provider,
  Session,
  Part,
  Config,
  Todo,
  Command,
  PermissionRequest,
  QuestionRequest,
  QuestionInfo,
  LspStatus,
  McpStatus,
  McpResource,
  FormatterStatus,
  SessionStatus,
  ProviderSummaryResponse,
  ProviderAuthMethod,
  VcsInfo,
  SnapshotFileDiff,
  ConsoleState,
} from "@opencode-ai/sdk/v2"
import { createStore, produce, reconcile } from "solid-js/store"
import { useProject } from "./project"
import { useEvent } from "./event"
import { useSDK } from "./sdk"
import { useTuiStartup } from "./runtime"
import { createSimpleContext } from "./helper"
import { useExit } from "./exit"
import { useArgs } from "./args"
import { batch, createSignal, onCleanup, onMount } from "solid-js"
import { usePermission } from "./permission"
import { useRoute } from "./route"
import { sessionDescendants } from "../util/session"

const emptyConsoleState: ConsoleState = {
  consoleManagedProviders: [],
  switchableOrgCount: 0,
}

function search<T>(items: T[], target: string, key: (item: T) => string) {
  let left = 0
  let right = items.length - 1
  while (left <= right) {
    const middle = Math.floor((left + right) / 2)
    const value = key(items[middle])
    if (value === target) return { found: true, index: middle }
    if (value < target) left = middle + 1
    else right = middle - 1
  }
  return { found: false, index: left }
}

function mergeSessionList(
  current: Session[],
  fetched: Session[],
  input: { preserveSessionID?: string; hasMessages: (sessionID: string) => boolean },
) {
  const merged = fetched.slice()
  const fetchedIDs = new Set(fetched.map((session) => session.id))
  for (const session of current) {
    if (fetchedIDs.has(session.id)) continue
    const preserve =
      (input.preserveSessionID !== undefined && session.id === input.preserveSessionID) || input.hasMessages(session.id)
    if (!preserve) continue
    const match = search(merged, session.id, (item) => item.id)
    merged.splice(match.index, 0, session)
  }
  return merged
}

function compareMessage(a: Message, b: Message) {
  return a.time.created - b.time.created || a.id.localeCompare(b.id)
}

const messageKey = (message: Message) => message.time.created + message.id

export function restoredQuestion(messages: Message[], parts: Record<string, Part[]>) {
  const message = messages.at(-1)
  if (message?.role !== "assistant") return
  const part = parts[message.id]?.findLast(
    (part) => part.type === "tool" || ((part.type === "text" || part.type === "reasoning") && !!part.text.trim()),
  )
  if (part?.type !== "tool" || part.tool !== "question") return
  if (part.state.status !== "running" && part.state.status !== "error") return
  if (part.state.status === "error" && part.state.error !== "The user dismissed this question") return
  const questions: unknown = part.state.input.questions
  if (!Array.isArray(questions) || !questions.length || !questions.every(isQuestionInfo)) return
  return {
    id: `restored_${part.id}`,
    sessionID: part.sessionID,
    questions,
    tool: { messageID: part.messageID, callID: part.callID },
    restored: true as const,
  }
}

function questionToolKey(tool: NonNullable<QuestionRequest["tool"]>) {
  return JSON.stringify([tool.messageID, tool.callID])
}

function isQuestionInfo(value: unknown): value is QuestionInfo {
  if (!value || typeof value !== "object") return false
  if (!("question" in value) || typeof value.question !== "string") return false
  if (!("header" in value) || typeof value.header !== "string") return false
  if ("multiple" in value && value.multiple !== undefined && typeof value.multiple !== "boolean") return false
  if ("custom" in value && value.custom !== undefined && typeof value.custom !== "boolean") return false
  return (
    "options" in value &&
    Array.isArray(value.options) &&
    value.options.every(
      (option: unknown) =>
        !!option &&
        typeof option === "object" &&
        "label" in option &&
        typeof option.label === "string" &&
        "description" in option &&
        typeof option.description === "string",
    )
  )
}

export const {
  context: SyncContext,
  use: useSync,
  provider: SyncProvider,
} = createSimpleContext({
  name: "Sync",
  init: () => {
    const startup = useTuiStartup()
    const permission = usePermission()
    const [store, setStore] = createStore<{
      status: "loading" | "partial" | "complete"
      provider: Provider[]
      provider_default: Record<string, string>
      provider_next: ProviderSummaryResponse
      console_state: ConsoleState
      capabilities: {
        experimentalBackgroundSubagents: boolean
      }
      provider_auth: Record<string, ProviderAuthMethod[]>
      agent: Agent[]
      command: Command[]
      permission: {
        [sessionID: string]: PermissionRequest[]
      }
      question: {
        [sessionID: string]: QuestionRequest[]
      }
      config: Config
      session: Session[]
      session_status: {
        [sessionID: string]: SessionStatus
      }
      session_diff: {
        [sessionID: string]: SnapshotFileDiff[]
      }
      todo: {
        [sessionID: string]: Todo[]
      }
      message: {
        [sessionID: string]: Message[]
      }
      part: {
        [messageID: string]: Part[]
      }
      lsp: LspStatus[]
      mcp: {
        [key: string]: McpStatus
      }
      mcp_resource: {
        [key: string]: McpResource
      }
      formatter: FormatterStatus[]
      vcs: VcsInfo | undefined
    }>({
      provider_next: {
        all: [],
        connected: [],
      },
      console_state: emptyConsoleState,
      capabilities: {
        experimentalBackgroundSubagents: false,
      },
      provider_auth: {},
      config: {},
      status: "loading",
      agent: [],
      permission: {},
      question: {},
      command: [],
      provider: [],
      provider_default: {},
      session: [],
      session_status: {},
      session_diff: {},
      todo: {},
      message: {},
      part: {},
      lsp: [],
      mcp: {},
      mcp_resource: {},
      formatter: [],
      vcs: undefined,
    })

    const event = useEvent()
    const project = useProject()
    const sdk = useSDK()
    const route = useRoute()
    const [promptReady, setPromptReady] = createStore<Record<string, boolean>>({})
    const [dismissedQuestions, setDismissedQuestions] = createStore<Record<string, Record<string, boolean>>>({})
    const promptRevisions = new Map<string, number>()
    const statusRevisions = new Map<string, number>()
    const questionRequests = new Map<string, QuestionRequest>()
    const settledQuestions = new Set<string>()

    function dismissQuestion(request: QuestionRequest) {
      if (request.tool) {
        const key = questionToolKey(request.tool)
        setDismissedQuestions(request.sessionID, (dismissed) => ({ ...dismissed, [key]: true }))
      }
      setStore("question", request.sessionID, (requests) => (requests ?? []).filter((item) => item.id !== request.id))
    }

    async function refreshPrompts(location: { directory?: string; workspaceID?: string }, sessionID?: string) {
      const query = { directory: location.directory, workspace: location.workspaceID }
      const ids = new Set([
        ...store.session
          .filter((session) => session.directory === location.directory && session.workspaceID === location.workspaceID)
          .map((session) => session.id),
        ...(sessionID ? [sessionID] : []),
      ])
      ids.forEach((id) => setPromptReady(id, false))
      const beforeStatus = new Map(statusRevisions)
      const statuses = await sdk.client.session.status(query, { throwOnError: true }).catch(() => undefined)
      if (statuses) {
        Object.keys(statuses.data ?? {}).forEach((id) => ids.add(id))
        ids.forEach((id) => {
          if (statusRevisions.get(id) !== beforeStatus.get(id)) return
          const status = statuses.data?.[id] ?? { type: "idle" as const }
          if (store.session_status[id]?.type !== status.type) {
            statusRevisions.set(id, (statusRevisions.get(id) ?? 0) + 1)
          }
          setStore("session_status", id, reconcile(status))
        })
      }
      const revisions = new Map(promptRevisions)
      const fetchedStatuses = new Map(statusRevisions)
      const [questions, permissions] = await Promise.all([
        sdk.client.question.list(query, { throwOnError: true }).catch(() => undefined),
        sdk.client.permission.list(query, { throwOnError: true }).catch(() => undefined),
      ])
      questions?.data?.forEach((request) => {
        questionRequests.set(request.id, request)
        if (settledQuestions.has(request.id)) dismissQuestion(request)
      })
      const questionGroups = groupBySession(
        (questions?.data ?? []).filter((request) => !settledQuestions.has(request.id)),
      )
      const permissionGroups = groupBySession(permissions?.data ?? [])
      Object.keys(questionGroups).forEach((id) => ids.add(id))
      Object.keys(permissionGroups).forEach((id) => ids.add(id))
      batch(() => {
        ids.forEach((id) => {
          if (statusRevisions.get(id) !== fetchedStatuses.get(id)) return
          // SSE changes after the fetch began are newer than its snapshot; restore stays off until a clean apply.
          const applied = !!statuses && !!questions && !!permissions && promptRevisions.get(id) === revisions.get(id)
          if (applied) {
            setStore("question", id, reconcile(questionGroups[id] ?? []))
            setStore("permission", id, reconcile(permissionGroups[id] ?? []))
          }
          setPromptReady(id, applied)
        })
      })
    }

    let restartPending = false
    let restartSessionID: string | undefined
    let restartEpoch = 0
    let restartDisposed = false
    let restartReconnected = false
    const [recoveryEpoch, setRecoveryEpoch] = createSignal(0)
    const [configReloadEpoch, setConfigReloadEpoch] = createSignal(0)
    let recovering = false
    let bootstrapInFlight: Promise<boolean> | undefined
    const recoverRetryDelay = 50
    const recoverAbort = new AbortController()
    let recoverTimer: ReturnType<typeof setTimeout> | undefined

    const fullSyncedSessions = new Set<string>()
    const syncingSessions = new Map<string, Promise<void>>()
    const hydratingSessions = new Map<string, { messages: Set<string>; parts: Set<string> }>()
    const touchMessage = (sessionID: string, messageID: string) => {
      hydratingSessions.get(sessionID)?.messages.add(messageID)
    }
    const touchPart = (sessionID: string, partID: string) => {
      hydratingSessions.get(sessionID)?.parts.add(partID)
    }
    // The global stream carries every session on the server. Transcripts are kept only for session
    // trees this TUI opened (root plus every subagent under it); other views load through `session.sync`.
    const openTrees = new Set<string>()
    function treeRoot(sessionID: string) {
      let id = sessionID
      // The cap only guards against a corrupt parent cycle.
      for (let depth = 0; depth < 32; depth++) {
        const parentID = result.session.get(id)?.parentID
        if (!parentID) return id
        id = parentID
      }
      return id
    }
    const inOpenTree = (sessionID: string) => openTrees.has(treeRoot(sessionID))

    function listSessions() {
      return sdk.client.experimental.session
        .list({ start: Date.now() - 30 * 24 * 60 * 60 * 1000 })
        .then((x) => (x.data ?? []).toSorted((a, b) => a.id.localeCompare(b.id)))
    }

    // Removes every per-session key so a deleted session leaves nothing behind. Hydrations for it
    // stop because their trackers are dropped, so their late results are discarded.
    function forgetSession(sessionID: string) {
      const messageIDs = (store.message[sessionID] ?? []).map((message) => message.id)
      openTrees.delete(sessionID)
      fullSyncedSessions.delete(sessionID)
      syncingSessions.delete(sessionID)
      hydratingSessions.delete(sessionID)
      promptRevisions.delete(sessionID)
      statusRevisions.delete(sessionID)
      for (const [requestID, request] of questionRequests) {
        if (request.sessionID === sessionID) questionRequests.delete(requestID)
      }
      setPromptReady(
        produce((draft) => {
          delete draft[sessionID]
        }),
      )
      setDismissedQuestions(
        produce((draft) => {
          delete draft[sessionID]
        }),
      )
      setStore(
        produce((draft) => {
          for (const messageID of messageIDs) delete draft.part[messageID]
          delete draft.message[sessionID]
          delete draft.todo[sessionID]
          delete draft.session_diff[sessionID]
          delete draft.session_status[sessionID]
          delete draft.permission[sessionID]
          delete draft.question[sessionID]
        }),
      )
    }

    event.subscribe((event, { directory, workspace }) => {
      if (
        event.type === "question.asked" ||
        event.type === "question.replied" ||
        event.type === "question.rejected" ||
        event.type === "permission.asked" ||
        event.type === "permission.replied"
      ) {
        const id = event.properties.sessionID
        promptRevisions.set(id, (promptRevisions.get(id) ?? 0) + 1)
      }
      switch (event.type) {
        case "server.instance.disposed":
          if (restartPending) {
            restartDisposed = true
            void recoverFromRestart()
            break
          }
          void bootstrap({ fatal: false }).then((ok) => {
            if (ok && directory === "global") setConfigReloadEpoch((value) => value + 1)
          })
          break
        case "permission.replied": {
          const requests = store.permission[event.properties.sessionID]
          if (!requests) break
          const match = search(requests, event.properties.requestID, (r) => r.id)
          if (!match.found) break
          setStore(
            "permission",
            event.properties.sessionID,
            produce((draft) => {
              draft.splice(match.index, 1)
            }),
          )
          break
        }

        case "permission.asked": {
          const request = event.properties
          if (permission.mode === "auto") {
            void sdk.client.permission.reply({
              requestID: request.id,
              reply: "once",
              directory,
              workspace,
            })
            break
          }
          const requests = store.permission[request.sessionID]
          if (!requests) {
            setStore("permission", request.sessionID, [request])
            break
          }
          const match = search(requests, request.id, (r) => r.id)
          if (match.found) {
            setStore("permission", request.sessionID, match.index, reconcile(request))
            break
          }
          setStore(
            "permission",
            request.sessionID,
            produce((draft) => {
              draft.splice(match.index, 0, request)
            }),
          )
          break
        }

        case "question.replied":
        case "question.rejected": {
          settledQuestions.add(event.properties.requestID)
          const request =
            questionRequests.get(event.properties.requestID) ??
            store.question[event.properties.sessionID]?.find((request) => request.id === event.properties.requestID)
          if (request) dismissQuestion(request)
          break
        }

        case "question.asked": {
          const request = event.properties
          questionRequests.set(request.id, request)
          if (settledQuestions.has(request.id)) {
            dismissQuestion(request)
            break
          }
          const requests = store.question[request.sessionID]
          if (!requests) {
            setStore("question", request.sessionID, [request])
            break
          }
          const match = search(requests, request.id, (r) => r.id)
          if (match.found) {
            setStore("question", request.sessionID, match.index, reconcile(request))
            break
          }
          setStore(
            "question",
            request.sessionID,
            produce((draft) => {
              draft.splice(match.index, 0, request)
            }),
          )
          break
        }

        case "todo.updated":
          setStore("todo", event.properties.sessionID, event.properties.todos)
          break

        case "session.diff":
          setStore("session_diff", event.properties.sessionID, event.properties.diff)
          break

        case "session.deleted": {
          forgetSession(event.properties.info.id)
          const result = search(store.session, event.properties.info.id, (s) => s.id)
          if (result.found) {
            setStore(
              "session",
              produce((draft) => {
                draft.splice(result.index, 1)
              }),
            )
          }
          break
        }
        case "session.updated": {
          const result = search(store.session, event.properties.info.id, (s) => s.id)
          if (result.found) {
            setStore("session", result.index, reconcile(event.properties.info))
            break
          }
          setStore(
            "session",
            produce((draft) => {
              draft.splice(result.index, 0, event.properties.info)
            }),
          )
          break
        }

        case "session.next.moved": {
          const result = search(store.session, event.properties.sessionID, (s) => s.id)
          if (!result.found) break
          setStore(
            "session",
            result.index,
            produce((session) => {
              session.directory = event.properties.location.directory
              session.path = event.properties.subdirectory
              session.workspaceID = event.properties.location.workspaceID
              session.time.updated = event.properties.timestamp
            }),
          )
          break
        }

        case "session.status": {
          statusRevisions.set(event.properties.sessionID, (statusRevisions.get(event.properties.sessionID) ?? 0) + 1)
          setPromptReady(event.properties.sessionID, false)
          setStore("session_status", event.properties.sessionID, event.properties.status)
          const session = result.session.get(event.properties.sessionID)
          if (event.properties.status.type === "idle" && session && fullSyncedSessions.has(session.id)) {
            void refreshPrompts(session, session.id)
          }
          break
        }

        case "message.updated": {
          if (!inOpenTree(event.properties.info.sessionID)) break
          touchMessage(event.properties.info.sessionID, event.properties.info.id)
          const messages = store.message[event.properties.info.sessionID]
          if (!messages) {
            setStore("message", event.properties.info.sessionID, [event.properties.info])
            break
          }
          const result = search(messages, messageKey(event.properties.info), messageKey)
          if (result.found) {
            setStore("message", event.properties.info.sessionID, result.index, reconcile(event.properties.info))
            break
          }
          setStore(
            "message",
            event.properties.info.sessionID,
            produce((draft) => {
              draft.splice(result.index, 0, event.properties.info)
            }),
          )
          const updated = store.message[event.properties.info.sessionID]
          if (updated.length > 100) {
            const oldest = updated[0]
            batch(() => {
              setStore(
                "message",
                event.properties.info.sessionID,
                produce((draft) => {
                  draft.shift()
                }),
              )
              setStore(
                "part",
                produce((draft) => {
                  delete draft[oldest.id]
                }),
              )
            })
          }
          break
        }
        case "message.removed": {
          if (!inOpenTree(event.properties.sessionID)) break
          touchMessage(event.properties.sessionID, event.properties.messageID)
          const messages = store.message[event.properties.sessionID] ?? []
          const index = messages.findIndex((message) => message.id === event.properties.messageID)
          if (index !== -1) {
            setStore(
              "message",
              event.properties.sessionID,
              produce((draft) => {
                draft.splice(index, 1)
              }),
            )
          }
          setStore(
            "part",
            produce((draft) => {
              delete draft[event.properties.messageID]
            }),
          )
          break
        }
        case "message.part.updated": {
          const part = event.properties.part
          if (part.type === "tool" && part.tool === "question" && part.state.status === "error") {
            promptRevisions.set(part.sessionID, (promptRevisions.get(part.sessionID) ?? 0) + 1)
            const requests = store.question[part.sessionID]
            if (requests) {
              setStore(
                "question",
                part.sessionID,
                requests.filter(
                  (request) => request.tool?.messageID !== part.messageID || request.tool.callID !== part.callID,
                ),
              )
            }
          }
          if (!inOpenTree(part.sessionID)) break
          touchPart(part.sessionID, part.id)
          const parts = store.part[part.messageID]
          if (!parts) {
            setStore("part", part.messageID, [part])
            break
          }
          const result = search(parts, part.id, (part) => part.id)
          if (result.found) {
            setStore("part", part.messageID, result.index, reconcile(part))
            break
          }
          setStore(
            "part",
            part.messageID,
            produce((draft) => {
              draft.splice(result.index, 0, part)
            }),
          )
          break
        }

        case "message.part.delta": {
          if (!inOpenTree(event.properties.sessionID)) break
          const parts = store.part[event.properties.messageID] ?? []
          const match = search(parts, event.properties.partID, (part) => part.id)
          if (!match.found) {
            // A loaded session missing this part has lost an event, so reload it instead of dropping the delta.
            const sessionID = event.properties.sessionID
            if (fullSyncedSessions.has(sessionID)) {
              fullSyncedSessions.delete(sessionID)
              void result.session.sync(sessionID).catch((error) => console.error("Failed to resync session", error))
            }
            break
          }
          touchPart(event.properties.sessionID, event.properties.partID)
          setStore(
            "part",
            event.properties.messageID,
            produce((draft) => {
              const part = draft[match.index]
              const field = event.properties.field as keyof typeof part
              const existing = part[field] as string | undefined
              ;(part[field] as string) = (existing ?? "") + event.properties.delta
            }),
          )
          break
        }

        case "message.part.removed": {
          if (!inOpenTree(event.properties.sessionID)) break
          touchPart(event.properties.sessionID, event.properties.partID)
          const parts = store.part[event.properties.messageID] ?? []
          const result = search(parts, event.properties.partID, (part) => part.id)
          if (result.found) {
            setStore(
              "part",
              event.properties.messageID,
              produce((draft) => {
                draft.splice(result.index, 1)
              }),
            )
          }
          break
        }

        case "lsp.updated": {
          const workspace = project.workspace.current()
          void sdk.client.lsp.status({ workspace }).then((x) => setStore("lsp", x.data ?? []))
          break
        }

        case "mcp.status.changed": {
          const workspace = project.workspace.current()
          void sdk.client.mcp.status({ workspace }).then((x) => setStore("mcp", reconcile(x.data ?? {})))
          break
        }

        case "vcs.branch.updated": {
          if (workspace === project.workspace.current()) {
            setStore("vcs", { branch: event.properties.branch })
          }
          break
        }
      }
    })

    const exit = useExit()
    const args = useArgs()

    function applySessionList(fetched: Session[]) {
      const merged = mergeSessionList(store.session, fetched, {
        preserveSessionID: restartPending ? undefined : args.sessionID,
        hasMessages: (sessionID) => (store.message[sessionID]?.length ?? 0) > 0,
      })
      setStore("session", reconcile(merged))
    }

    async function restoreCapturedRoute(expectedEpoch?: number) {
      if (expectedEpoch !== undefined && expectedEpoch !== restartEpoch) return
      const captured = restartSessionID
      if (!captured) {
        route.navigate({ type: "home" })
        return
      }
      fullSyncedSessions.delete(captured)
      const match = search(store.session, captured, (session) => session.id)
      if (!match.found) {
        route.navigate({ type: "home" })
        return
      }
      await result.session.sync(captured)
      if (expectedEpoch !== undefined && expectedEpoch !== restartEpoch) return
      // post-replacement gating: only navigate if epoch still matches captured replacement
      route.navigate({ type: "session", sessionID: captured })
    }

    async function recoverFromRestart() {
      if (!restartPending || recovering || !restartDisposed || !restartReconnected) return
      const epoch = restartEpoch
      recovering = true
      try {
        while (restartPending && epoch === restartEpoch && !recoverAbort.signal.aborted) {
          const ok = (await bootstrap({ fatal: false })) !== false
          if (epoch !== restartEpoch || !restartPending || recoverAbort.signal.aborted) return
          if (ok) {
            await restoreCapturedRoute(epoch)
            if (epoch !== restartEpoch) return
            restartPending = false
            restartSessionID = undefined
            setRecoveryEpoch((value) => value + 1)
            return
          }
          if (recoverAbort.signal.aborted || !restartPending || epoch !== restartEpoch) return
          await new Promise<void>((resolve) => {
            if (recoverAbort.signal.aborted || epoch !== restartEpoch) {
              resolve()
              return
            }
            recoverTimer = setTimeout(resolve, recoverRetryDelay)
            recoverAbort.signal.addEventListener(
              "abort",
              () => {
                if (recoverTimer) {
                  clearTimeout(recoverTimer)
                  recoverTimer = undefined
                }
                resolve()
              },
              { once: true },
            )
          })
          if (recoverTimer) recoverTimer = undefined
          if (epoch !== restartEpoch) return
        }
      } finally {
        recovering = false
        if (recoverTimer) {
          clearTimeout(recoverTimer)
          recoverTimer = undefined
        }
      }
    }

    async function bootstrap(input: { fatal?: boolean } = {}) {
      while (bootstrapInFlight) {
        await bootstrapInFlight.catch(() => {})
      }
      const task = runBootstrap(input)
      bootstrapInFlight = task
      void task.finally(() => {
        if (bootstrapInFlight === task) bootstrapInFlight = undefined
      })
      return task
    }

    async function runBootstrap(input: { fatal?: boolean } = {}) {
      const fatal = input.fatal ?? true
      const workspace = project.workspace.current()
      const projectPromise = project.sync()
      const sessionListPromise = projectPromise.then(() => listSessions())

      // blocking - include session.list when continuing a session
      const providersPromise = sdk.client.config.providers({ workspace }, { throwOnError: true })
      // Picker ids and names only; provider.list carries the full models.dev catalog (several MB).
      const providerListPromise = sdk.client.provider.summary({ workspace }, { throwOnError: true })
      const capabilitiesPromise = sdk.client.experimental.capabilities
        .get({ workspace }, { throwOnError: true })
        .then((x) => x.data)
        .catch(() => undefined)
      const consoleStatePromise = sdk.client.experimental.console
        .get({ workspace }, { throwOnError: true })
        .then((x) => x.data)
        .catch(() => emptyConsoleState)
      const agentsPromise = sdk.client.app.agents({ workspace }, { throwOnError: true })
      const configPromise = sdk.client.config.get({ workspace }, { throwOnError: true })
      return await Promise.all([
        providersPromise,
        providerListPromise,
        capabilitiesPromise,
        agentsPromise,
        configPromise,
        projectPromise,
        ...(args.continue ? [sessionListPromise] : []),
      ])
        .then(async () => {
          const providersResponse = providersPromise.then((x) => x.data!)
          const providerListResponse = providerListPromise.then((x) => x.data!)
          const capabilitiesResponse = capabilitiesPromise
          const consoleStateResponse = consoleStatePromise
          const agentsResponse = agentsPromise.then((x) => x.data ?? [])
          const configResponse = configPromise.then((x) => x.data!)
          const sessionListResponse = args.continue ? sessionListPromise : undefined

          return Promise.all([
            providersResponse,
            providerListResponse,
            capabilitiesResponse,
            consoleStateResponse,
            agentsResponse,
            configResponse,
            ...(sessionListResponse ? [sessionListResponse] : []),
          ]).then((responses) => {
            const providers = responses[0]
            const providerList = responses[1]
            const capabilities = responses[2]
            const consoleState = responses[3]
            const agents = responses[4]
            const config = responses[5]
            const sessions = responses[6]

            batch(() => {
              setStore("provider", reconcile(providers.providers))
              setStore("provider_default", reconcile(providers.default))
              setStore("provider_next", reconcile(providerList))
              setStore("capabilities", "experimentalBackgroundSubagents", capabilities?.backgroundSubagents === true)
              setStore("console_state", reconcile(consoleState))
              setStore("agent", reconcile(agents))
              setStore("config", reconcile(config))
              if (sessions !== undefined) applySessionList(sessions)
            })
          })
        })
        .then(() => {
          if (store.status !== "complete") setStore("status", "partial")
          // non-blocking
          void Promise.all([
            ...(args.continue ? [] : [sessionListPromise.then((sessions) => applySessionList(sessions))]),
            consoleStatePromise.then((consoleState) => setStore("console_state", reconcile(consoleState))),
            sdk.client.command.list({ workspace }).then((x) => setStore("command", reconcile(x.data ?? []))),
            sdk.client.lsp.status({ workspace }).then((x) => setStore("lsp", reconcile(x.data ?? []))),
            sdk.client.mcp.status({ workspace }).then((x) => setStore("mcp", reconcile(x.data ?? {}))),
            sdk.client.experimental.resource
              .list({ workspace })
              .then((x) => setStore("mcp_resource", reconcile(x.data ?? {}))),
            sdk.client.formatter.status({ workspace }).then((x) => setStore("formatter", reconcile(x.data ?? []))),
            refreshPrompts({ directory: sdk.directory, workspaceID: workspace }),
            sdk.client.provider.auth({ workspace }).then((x) => setStore("provider_auth", reconcile(x.data ?? {}))),
            sdk.client.vcs.get({ workspace }).then((x) => setStore("vcs", reconcile(x.data))),
            project.workspace.sync(),
          ]).then(() => {
            setStore("status", "complete")
          })
          return true
        })
        .catch(async (e) => {
          console.error("tui bootstrap failed", {
            error: e instanceof Error ? e.message : String(e),
            name: e instanceof Error ? e.name : undefined,
            stack: e instanceof Error ? e.stack : undefined,
          })
          if (fatal) {
            exit(e)
            return false
          }
          return false
        })
    }

    onMount(() => {
      void bootstrap()
    })

    onCleanup(() => {
      restartPending = false
      restartDisposed = false
      restartReconnected = false
      restartEpoch++
      if (recoverTimer) {
        clearTimeout(recoverTimer)
        recoverTimer = undefined
      }
      recoverAbort.abort()
    })
    onCleanup(
      sdk.onReconnect(() => {
        // Events were missed while disconnected, so every session needs a fresh load. Clearing the
        // trackers makes hydrations started before this point discard their results.
        fullSyncedSessions.clear()
        syncingSessions.clear()
        hydratingSessions.clear()
        if (restartPending) restartReconnected = true
        void recoverFromRestart()
        if (!restartPending && route.data.type === "session") {
          setPromptReady(route.data.sessionID, false)
          void result.session
            .sync(route.data.sessionID)
            .catch((error) => console.error("Failed to refresh session prompts", error))
        }
      }),
    )

    const result = {
      data: store,
      set: setStore,
      get configReloadEpoch() {
        return configReloadEpoch()
      },
      restart: {
        begin() {
          restartEpoch++
          restartPending = true
          restartDisposed = false
          restartReconnected = false
          restartSessionID = route.data.type === "session" ? route.data.sessionID : undefined
          if (recoverTimer) {
            clearTimeout(recoverTimer)
            recoverTimer = undefined
          }
        },
        cancel() {
          restartEpoch++
          restartPending = false
          restartDisposed = false
          restartReconnected = false
          restartSessionID = undefined
          if (recoverTimer) {
            clearTimeout(recoverTimer)
            recoverTimer = undefined
          }
        },
        get epoch() {
          return restartEpoch
        },
        get pending() {
          return restartPending
        },
        get recoveryEpoch() {
          return recoveryEpoch()
        },
      },
      get status() {
        return store.status
      },
      get ready() {
        if (startup.skipInitialLoading) return true
        return store.status !== "loading"
      },
      get path() {
        return project.instance.path()
      },
      // The server rescans command files on list, so this picks up added or edited commands.
      async refreshCommands() {
        const workspace = project.workspace.current()
        const x = await sdk.client.command.list({ workspace })
        // Keep the current list on a failed request instead of blanking the menu.
        if (x.data) setStore("command", reconcile(x.data))
      },
      session: {
        questions(sessionID: string): (QuestionRequest & { restored?: boolean })[] {
          const live = [sessionID, ...sessionDescendants(store.session, sessionID).map((session) => session.id)]
            .toSorted()
            .flatMap((id) => store.question[id] ?? [])
          if (live.length || !promptReady[sessionID]) return live
          const status = store.session_status[sessionID]
          if (status && status.type !== "idle") return []
          const restored = restoredQuestion(store.message[sessionID] ?? [], store.part)
          if (!restored || dismissedQuestions[sessionID]?.[questionToolKey(restored.tool)]) return []
          return [restored]
        },
        dismissQuestion,
        get(sessionID: string) {
          const match = search(store.session, sessionID, (s) => s.id)
          if (match.found) return store.session[match.index]
          return undefined
        },
        async refresh() {
          const list = await listSessions()
          applySessionList(list)
        },
        status(sessionID: string) {
          const session = result.session.get(sessionID)
          if (!session) return "idle"
          if (session.time.compacting) return "compacting"
          const messages = store.message[sessionID] ?? []
          const last = messages.at(-1)
          if (!last) return "idle"
          if (last.role === "user") return "working"
          return last.time.completed ? "idle" : "working"
        },
        async sync(sessionID: string) {
          const syncing = syncingSessions.get(sessionID)
          if (syncing) return syncing
          if (fullSyncedSessions.has(sessionID)) {
            const session = result.session.get(sessionID)
            if (session) await refreshPrompts(session, sessionID)
            return
          }
          // Open the tree before fetching so events during the fetch apply.
          openTrees.add(treeRoot(sessionID))
          const tracker = { messages: new Set<string>(), parts: new Set<string>() }
          hydratingSessions.set(sessionID, tracker)
          // False once a reconnect or a delete dropped this tracker; the result is then stale.
          const current = () => hydratingSessions.get(sessionID) === tracker
          const task = (async () => {
            const [session, messages, todo, diff] = await Promise.all([
              sdk.client.session.get({ sessionID }, { throwOnError: true }),
              sdk.client.session.messages({ sessionID, limit: 100 }),
              sdk.client.session.todo({ sessionID }),
              sdk.client.session.diff({ sessionID }),
            ])
            if (!current()) return
            await refreshPrompts(session.data!, sessionID)
            if (!current()) return
            setStore(
              produce((draft) => {
                const match = search(draft.session, sessionID, (s) => s.id)
                if (match.found) draft.session[match.index] = session.data!
                if (!match.found) draft.session.splice(match.index, 0, session.data!)
                draft.todo[sessionID] = todo.data ?? []
                const currentMessages = draft.message[sessionID] ?? []
                const infos = (messages.data ?? []).flatMap((message) => {
                  if (!tracker.messages.has(message.info.id)) return [message.info]
                  const current = currentMessages.find((item) => item.id === message.info.id)
                  return current ? [current] : []
                })
                infos.push(
                  ...currentMessages.filter(
                    (message) => tracker.messages.has(message.id) && !infos.some((item) => item.id === message.id),
                  ),
                )
                infos.sort(compareMessage)
                const removed = infos.slice(0, -100)
                const visible = infos.slice(-100)
                const visibleIDs = new Set(visible.map((message) => message.id))
                for (const message of messages.data ?? []) {
                  if (!visibleIDs.has(message.info.id)) {
                    delete draft.part[message.info.id]
                    continue
                  }
                  const currentParts = draft.part[message.info.id] ?? []
                  const parts = message.parts.flatMap((part) => {
                    const current = currentParts.find((item) => item.id === part.id)
                    if (tracker.parts.has(part.id)) return current ? [current] : []
                    if (
                      current &&
                      (part.type === "text" || part.type === "reasoning") &&
                      (current.type === "text" || current.type === "reasoning") &&
                      part.text.length === 0 &&
                      current.text.length > 0
                    ) {
                      return [current]
                    }
                    return [part]
                  })
                  parts.push(
                    ...currentParts.filter(
                      (part) => tracker.parts.has(part.id) && !parts.some((item) => item.id === part.id),
                    ),
                  )
                  draft.part[message.info.id] = parts
                }
                for (const message of removed) delete draft.part[message.id]
                draft.message[sessionID] = visible
                draft.session_diff[sessionID] = diff.data ?? []
              }),
            )
            // A session outside the listed range only knows its parent once its own info is stored.
            openTrees.add(treeRoot(sessionID))
            fullSyncedSessions.add(sessionID)
          })().finally(() => {
            // A newer hydration may own these entries now, so only remove our own.
            if (syncingSessions.get(sessionID) === task) syncingSessions.delete(sessionID)
            if (current()) hydratingSessions.delete(sessionID)
          })
          syncingSessions.set(sessionID, task)
          return task
        },
      },
      bootstrap,
    }
    return result
  },
})

// Event handlers binary-search these lists by id, so keep each group sorted.
function groupBySession<T extends { id: string; sessionID: string }>(requests: T[]) {
  return requests
    .toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .reduce<Record<string, T[]>>((acc, r) => {
      ;(acc[r.sessionID] ??= []).push(r)
      return acc
    }, {})
}
