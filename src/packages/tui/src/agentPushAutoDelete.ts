import fs from "node:fs"
import path from "node:path"
import { createEffect, on } from "solid-js"
import { Global } from "@opencode-ai/core/global"
import { listCompletedRoots } from "./component/dialog-session-cleanup"
import { useKV } from "./context/kv"
import { useLocal } from "./context/local"
import { useRoute } from "./context/route"
import { useSDK } from "./context/sdk"
import { useSync } from "./context/sync"
import { useDialog } from "./ui/dialog"
import { useToast } from "./ui/toast"
import { errorMessage } from "./util/error"

const _KV_KEY = "agent_push_auto_delete"
// Set by session_complete with autoDelete after a verified push (`AUTO_DELETE_KEY` in
// opencode/src/tool/sessionComplete.ts). A later prompt clears sessionComplete, which keeps the session.
const _FLAG = "ocAutoDelete"
// Set only when /agent-push opened the session (`PUSH_SESSION_KEY`), so a push run mid-work never deletes,
// including sessions flagged before that rule existed.
const _PUSH_SESSION = "ocPushSession"

export function isAutoDeletable(session?: { metadata?: Record<string, unknown>; sessionComplete?: boolean }) {
  return (
    session?.metadata?.[_FLAG] === true &&
    session.metadata[_PUSH_SESSION] === true &&
    session.sessionComplete === true
  )
}

// When on, deletes a flagged session once this tab leaves it. Sessions left by closing oc are swept
// when the setting turns on or oc next starts.
export function createAgentPushAutoDelete() {
  const kv = useKV()
  const sdk = useSDK()
  const sync = useSync()
  const local = useLocal()
  const route = useRoute()
  const dialog = useDialog()
  const toast = useToast()
  const enabled = () => kv.get(_KV_KEY, false) === true
  const currentID = () => (route.data.type === "session" ? route.data.sessionID : undefined)

  async function remove(sessions: { id: string; title: string }[]) {
    const open = openInOtherTabs()
    const targets = sessions.filter(
      (session) =>
        session.id !== currentID() &&
        !open.has(session.id) &&
        !local.session.isPinned(session.id) &&
        !["busy", "retry"].includes(sync.data.session_status?.[session.id]?.type ?? ""),
    )
    const failures: string[] = []
    for (const session of targets) {
      const result = await sdk.client.session.delete({ sessionID: session.id }).catch((error: unknown) => ({ error }))
      if (result.error) failures.push(errorMessage(result.error))
    }
    const deleted = targets.length - failures.length
    if (failures.length > 0) {
      toast.show({ variant: "error", title: `Auto-delete: ${failures.length} failed`, message: failures[0] })
    }
    if (deleted === 0) return
    toast.show({
      variant: "success",
      message: targets.length === 1 ? `Deleted pushed session: ${targets[0].title}` : `Deleted ${deleted} pushed sessions`,
    })
  }

  function fail(error: unknown) {
    toast.show({ variant: "error", title: "Auto-delete failed", message: errorMessage(error) })
  }

  createEffect(
    on(currentID, (next, prev) => {
      if (!prev || prev === next || !enabled()) return
      const session = sync.session.get(prev)
      if (!session || !isAutoDeletable(session)) return
      void remove([session]).catch(fail)
    }),
  )

  let swept = false
  createEffect(() => {
    if (swept || sync.status !== "complete" || !kv.ready || !enabled()) return
    swept = true
    void listCompletedRoots(sdk.client)
      .then((sessions) => remove(sessions.filter((session) => isAutoDeletable(session))))
      .catch(fail)
  })

  return {
    name: "oc.agent_push_auto_delete",
    title: "Agent-push auto-delete",
    category: "oc",
    group: "Defaults",
    slashName: "agentPushAutoDelete",
    get desc() {
      return enabled() ? "on" : "off"
    },
    run() {
      kv.set(_KV_KEY, !enabled())
      dialog.clear()
    },
  }
}

// Sessions other oc tabs show, from their ledgers (`writeLedger` in app.tsx). An unreadable ledger
// throws, so nothing is deleted while another tab's view is unknown.
function openInOtherTabs() {
  const dir = path.join(Global.Path.state, "oc-tuis")
  if (!fs.existsSync(dir)) return new Set<string>()
  return new Set(
    fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".json") && name !== `${process.pid}.json`)
      .flatMap((name) => {
        const file = path.join(dir, name)
        if (!fs.existsSync(file)) return []
        const sessionID = JSON.parse(fs.readFileSync(file, "utf8")).sessionID
        return typeof sessionID === "string" ? [sessionID] : []
      }),
  )
}
