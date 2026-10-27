import type { SessionQueueGetResponse, SessionQueueUpdateData } from "@opencode-ai/sdk/v2"
import { createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js"
import { useSDK } from "../context/sdk"
import { useSync } from "../context/sync"
import { useTheme } from "../context/theme"
import { useCommandShortcut } from "../keymap"
import { extractChain, extractSlashCommands } from "../prompt/slash"
import { useReviveChain } from "../reviveChain"
import { useDialog } from "../ui/dialog"
import { DialogPrompt } from "../ui/dialog-prompt"
import { DialogSelect } from "../ui/dialog-select"
import { useToast } from "../ui/toast"
import { errorMessage } from "../util/error"
import { Locale } from "../util/locale"

type QueueSnapshot = SessionQueueGetResponse

const POLL_MS = 2000
const EMPTY: QueueSnapshot = { pause: "none", entries: [] }

const PAUSE_LABEL = {
  restart: "Paused after restart",
  error: "Paused after an error",
  interrupted: "Paused after you stopped the turn",
  chain: "Paused by a revive chain",
} as const

// Polls the session's queue while the caller is mounted. A failed poll keeps the last snapshot.
export function createQueueSnapshot(sessionID: () => string | undefined) {
  const sdk = useSDK()
  const [snapshot, setSnapshot] = createSignal<QueueSnapshot>(EMPTY)
  const refresh = () => {
    const id = sessionID()
    if (!id) return
    sdk.client.session.queue
      .get({ sessionID: id }, { throwOnError: true })
      .then((result) => {
        if (sessionID() === id) setSnapshot(result.data)
      })
      .catch(() => {})
  }
  onMount(() => {
    const timer = setInterval(refresh, POLL_MS)
    onCleanup(() => clearInterval(timer))
  })
  createEffect(
    on(
      () => sessionID(),
      () => {
        setSnapshot(EMPTY)
        refresh()
      },
    ),
  )
  return { snapshot, refresh }
}

export function queuePauseLabel(snapshot: QueueSnapshot) {
  return snapshot.pause === "none" ? undefined : PAUSE_LABEL[snapshot.pause]
}

const TARGET_LABEL = { current: "", fork: " · fork", new: " · new session" } as const

function scheduleLabel(entry: QueueSnapshot["entries"][number]) {
  if (entry.runAt === undefined) return "Waiting"
  return `At ${Locale.format(entry.runAt, { dateStyle: "short", timeStyle: "medium" })}${TARGET_LABEL[entry.target]}`
}

export function DialogQueue(props: { sessionID: string }) {
  const dialog = useDialog()
  const sdk = useSDK()
  const toast = useToast()
  const sync = useSync()
  const { theme } = useTheme()
  const queue = createQueueSnapshot(() => props.sessionID)
  const reviveChain = useReviveChain()
  const cancelHint = useCommandShortcut("queue.cancel")
  const [toCancel, setToCancel] = createSignal<string>()

  const update = (body: SessionQueueUpdateData["body"]) =>
    sdk.client.session.queue
      .update({ sessionID: props.sessionID, body }, { throwOnError: true })
      .then((result) => {
        queue.refresh()
        return result
      })
      .catch((error) => {
        toast.show({ title: "Queue change failed", message: errorMessage(error), variant: "error" })
        queue.refresh()
      })

  const options = createMemo(() => {
    const snapshot = queue.snapshot()
    const resume =
      snapshot.pause !== "none"
        ? [{ title: "Resume queue", value: "resume", description: "Send the next queued prompt" }]
        : []
    const entries = snapshot.entries.map((entry) => {
      const confirming = toCancel() === entry.id
      return {
        title: confirming
          ? `Press ${cancelHint()} again to cancel`
          : Locale.truncate(entry.text.split("\n")[0]?.trim() || "(attachments only)", 60),
        value: entry.id,
        bg: confirming ? theme.error : undefined,
        description: entry.state === "dispatching" ? "Sending" : scheduleLabel(entry),
        footer:
          entry.attachments > 0 ? `${entry.attachments} attachment${entry.attachments === 1 ? "" : "s"}` : undefined,
      }
    })
    if (resume.length === 0 && entries.length === 0) return [{ title: "Queue is empty", value: "none" }]
    return [...resume, ...entries]
  })

  const edit = (id: string) => {
    const entry = queue.snapshot().entries.find((item) => item.id === id)
    if (!entry) return
    if (entry.state !== "pending") {
      toast.show({ message: "This prompt is already being sent", variant: "warning" })
      return
    }
    const back = () => dialog.replace(() => <DialogQueue sessionID={props.sessionID} />)
    dialog.replace(
      () => (
        <DialogPrompt
          title="Edit queued prompt"
          value={entry.text}
          multiline
          onConfirm={(text) => {
            // Parsed like a typed draft, so an edit can add or drop slash commands and revive chains.
            const chain = extractChain(text, sync.data.command)
            if (chain) {
              // A plain prompt edited into a chain has no TUI waiting for it yet.
              const body = { type: "edit" as const, id, text: chain.request, commands: [], chain: chain.steps }
              void update(body).then((done) => {
                back()
                if (done) void reviveChain.watchQueued(props.sessionID).catch((error: unknown) => toast.error(error))
              })
              return
            }
            const typed = extractSlashCommands(text, sync.data.command)
            if (!typed.arguments && !typed.names.length) return
            void update({ type: "edit", id, text: typed.arguments, commands: typed.names, chain: [] }).then(back)
          }}
        />
      ),
      undefined,
      { back },
    )
  }

  return (
    <DialogSelect
      title={queuePauseLabel(queue.snapshot()) ?? "Queued prompts"}
      options={options()}
      onMove={() => setToCancel(undefined)}
      onSelect={(option) => {
        if (option.value === "none") return dialog.clear()
        if (option.value === "resume") {
          void update({ type: "resume" })
          return dialog.clear()
        }
        edit(option.value)
      }}
      actions={[
        {
          command: "queue.cancel",
          title: "cancel",
          onTrigger: (option) => {
            if (option.value === "none" || option.value === "resume") return
            if (toCancel() !== option.value) return setToCancel(option.value)
            setToCancel(undefined)
            void update({ type: "cancel", id: option.value })
          },
        },
      ]}
    />
  )
}
