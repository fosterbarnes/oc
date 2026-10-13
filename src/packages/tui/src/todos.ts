import { createEffect, createSignal } from "solid-js"
import { useSDK } from "./context/sdk"
import { useSync } from "./context/sync"
import { useDialog } from "./ui/dialog"
import { DialogConfirm } from "./ui/dialog-confirm"
import { useToast } from "./ui/toast"

export function createTodoCommand() {
  const sdk = useSDK()
  const sync = useSync()
  const dialog = useDialog()
  const toast = useToast()
  const [update, setUpdate] = createSignal<{ enabled: boolean; epoch: number; saved: boolean }>()

  function finish(enabled: boolean) {
    const overridden = (sync.data.config.todos === true) !== enabled
    toast.show({
      message: overridden
        ? "Global todo default saved; project configuration overrides it"
        : enabled
          ? "Todos enabled"
          : "Todos disabled",
      variant: overridden ? "warning" : "success",
    })
    setUpdate(undefined)
  }

  createEffect(() => {
    const pending = update()
    if (!pending?.saved || sync.configReloadEpoch <= pending.epoch) return
    finish(pending.enabled)
  })

  return {
    name: "oc.todos.toggle",
    category: "oc",
    group: "Defaults",
    title: "Todos",
    get desc() {
      return sync.data.config.todos === true ? "on" : "off"
    },
    get enabled() {
      return sync.status !== "loading" && !sync.restart.pending && !update()
    },
    async run() {
      if (sync.status === "loading" || sync.restart.pending || update()) return
      const enabled = sync.data.config.todos !== true
      setUpdate({ enabled, epoch: sync.configReloadEpoch, saved: false })
      try {
        const confirmed = await DialogConfirm.show(
          dialog,
          enabled ? "Enable todos?" : "Disable todos?",
          "Save the global todo default and reload configuration? Active sessions in this server may stop.",
        )
        if (confirmed !== true) {
          setUpdate(undefined)
          return
        }
        dialog.clear()
        const global = await sdk.client.global.config.get({ throwOnError: true })
        // An unchanged patch emits no disposal event, notably with a project override.
        if ((global.data?.todos === true) === enabled) {
          if (!(await sync.bootstrap({ fatal: false }))) throw new Error("Could not reload configuration")
          finish(enabled)
          return
        }
        setUpdate({ enabled, epoch: sync.configReloadEpoch, saved: false })
        await sdk.client.global.config.update({ config: { todos: enabled } }, { throwOnError: true })
        setUpdate((pending) => pending && { ...pending, saved: true })
      } catch (error) {
        setUpdate(undefined)
        toast.show({
          message: `Failed to update todos: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
          variant: "error",
        })
      }
    },
  }
}
