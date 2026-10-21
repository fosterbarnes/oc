// oc session palette entries (auto-rename and session marks), lifted out of upstream's session
// route. The returned function is called inside that route's `sessionCommandList` memo, so the
// titles still track `session()`.
import type { Accessor } from "solid-js"
import { useRoute, useRouteData } from "../../context/route"
import { useSDK } from "../../context/sdk"
import type { useSync } from "../../context/sync"
import { useDialog } from "../../ui/dialog"
import { DialogConfirm } from "../../ui/dialog-confirm"
import { useToast } from "../../ui/toast"
import { errorMessage } from "../../util/error"

export function createOcSessionCommands(session: Accessor<ReturnType<ReturnType<typeof useSync>["session"]["get"]>>) {
  const route = useRouteData("session")
  const { navigate } = useRoute()
  const sdk = useSDK()
  const toast = useToast()
  const dialog = useDialog()
  return () => [
    {
      title: "Auto-rename session",
      value: "session.rename.auto",
      category: "Session",
      slash: {
        name: "rename",
      },
      run: async () => {
        dialog.clear()
        toast.show({ message: "Renaming session...", variant: "info" })
        const before = session()?.title
        const result = await sdk.client.session.rename({ sessionID: route.sessionID })
        if (result.error || !result.data) {
          toast.show({
            message: result.error ? errorMessage(result.error) : "Failed to rename session",
            variant: "error",
          })
          return
        }
        const model = result.data.model ? `\nModel used: ${result.data.model}` : ""
        if (result.data.session.title === before) {
          toast.show({ message: `Title unchanged${model}`, variant: "info" })
          return
        }
        toast.show({ message: `Renamed: ${result.data.session.title}${model}`, variant: "success" })
      },
    },
    {
      title: session()?.sessionComplete ? "Mark session incomplete" : "Mark session complete",
      value: "session.complete.toggle",
      category: "Session",
      slash: {
        name: "complete",
      },
      run: async () => {
        const current = session()
        if (!current) return
        const result = await sdk.client.session.update({
          sessionID: current.id,
          sessionComplete: !current.sessionComplete,
        })
        if (result.error) {
          toast.show({ message: errorMessage(result.error), variant: "error" })
          return
        }
        dialog.clear()
      },
    },
    {
      title: session()?.sessionFailed ? "Mark session not failed" : "Mark session failed",
      value: "session.failed.toggle",
      category: "Session",
      slash: {
        name: "failed",
      },
      run: async () => {
        const current = session()
        if (!current) return
        const result = await sdk.client.session.update({
          sessionID: current.id,
          sessionFailed: !current.sessionFailed,
        })
        if (result.error) {
          toast.show({ message: errorMessage(result.error), variant: "error" })
          return
        }
        dialog.clear()
      },
    },
    {
      title: session()?.sessionInProgress ? "Mark session unmarked" : "Mark session in progress",
      value: "session.in_progress.toggle",
      category: "Session",
      slash: {
        name: "in-progress",
      },
      run: async () => {
        const current = session()
        if (!current) return
        const result = await sdk.client.session.update({
          sessionID: current.id,
          sessionInProgress: !current.sessionInProgress,
        })
        if (result.error) {
          toast.show({ message: errorMessage(result.error), variant: "error" })
          return
        }
        dialog.clear()
      },
    },
    {
      title: "Delete this session",
      value: "session.delete.current",
      category: "Session",
      slash: {
        name: "delete",
      },
      run: async () => {
        const current = session()
        if (!current) return
        const confirmed = await DialogConfirm.show(
          dialog,
          "Delete this session",
          `Permanently delete "${current.title}" and its subagent sessions. This cannot be undone.`,
        )
        if (!confirmed) return
        const result = await sdk.client.session.delete({ sessionID: current.id }).catch((error: unknown) => ({ error }))
        if (result.error) {
          toast.show({ variant: "error", title: "Failed to delete session", message: errorMessage(result.error) })
          return
        }
        // app.tsx's session.deleted handler also routes home and shows the "was deleted" notice
        if (route.sessionID === current.id) navigate({ type: "home" })
      },
    },
  ]
}
