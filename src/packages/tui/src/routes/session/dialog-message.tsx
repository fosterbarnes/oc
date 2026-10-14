import { createMemo } from "solid-js"
import { useSync } from "../../context/sync"
import { DialogSelect } from "../../ui/dialog-select"
import { useSDK } from "../../context/sdk"
import { useRoute } from "../../context/route"
import { useClipboard } from "../../context/clipboard"
import type { PromptInfo } from "../../component/prompt/history"
import { stripPromptPartIDs as strip } from "../../prompt/part"
import { useToast } from "../../ui/toast"
import type { DialogContext } from "../../ui/dialog"
import { errorMessage } from "../../util/error"

export function DialogMessage(props: {
  messageID: string
  sessionID: string
  setPrompt?: (prompt: PromptInfo) => void
  /** Sent while busy and not yet answered or read by Claude: it can still be taken back. */
  waiting?: boolean
}) {
  require("node:fs").appendFileSync("C:/Users/Foster/AppData/Local/Temp/opencode/tuiDiag.txt", `${new Date().toISOString()} DialogMessage create ${props.messageID} waiting=${props.waiting}\n`)
  const sync = useSync()
  const sdk = useSDK()
  const toast = useToast()
  const message = createMemo(() => sync.data.message[props.sessionID]?.find((x) => x.id === props.messageID))
  const route = useRoute()
  const clipboard = useClipboard()

  const promptInfo = (messageID: string) =>
    (sync.data.part[messageID] ?? []).reduce(
      (agg, part) => {
        if (part.type === "text") {
          if (!part.synthetic) agg.input += part.text
        }
        if (part.type === "file") agg.parts.push(strip(part))
        return agg
      },
      { input: "", parts: [] as PromptInfo["parts"] },
    )

  // Deleting fails once the model may have read the message (the server re-checks).
  const unsend = async (edit: boolean) => {
    const msg = message()
    if (!msg) return
    const draft = edit ? promptInfo(msg.id) : undefined
    const result = await sdk.client.session.deleteMessage({ sessionID: props.sessionID, messageID: msg.id })
    if (result.error) {
      toast.show({
        message: `Not deleted, the model already has this message: ${errorMessage(result.error)}`,
        variant: "error",
      })
      return
    }
    if (draft) props.setPrompt?.(draft)
  }

  const waitingOptions = [
    {
      title: "Edit",
      value: "message.edit",
      description: "take back and put in the prompt",
      onSelect: (dialog: DialogContext) => {
        void unsend(true)
        dialog.clear()
      },
    },
    {
      title: "Delete",
      value: "message.delete",
      description: "take back before it is sent",
      onSelect: (dialog: DialogContext) => {
        void unsend(false)
        dialog.clear()
      },
    },
  ]

  const revertOption = {
    title: (sync.data.part[props.messageID] ?? []).some((part) => part.type === "text" && part.metadata?.steered)
      ? "Revert whole turn" : "Revert",
    value: "session.revert",
    description: "undo messages and file changes",
    onSelect: async (dialog: DialogContext) => {
      const msg = message()
      require("node:fs").appendFileSync("C:/Users/Foster/AppData/Local/Temp/opencode/tuiDiag.txt", `${new Date().toISOString()} revert select ${props.messageID} found=${!!msg}\n`)
      if (!msg) return
      dialog.clear()
      const result = await sdk.client.session.revert({
        sessionID: props.sessionID,
        messageID: msg.id,
      })
      require("node:fs").appendFileSync("C:/Users/Foster/AppData/Local/Temp/opencode/tuiDiag.txt", `${new Date().toISOString()} revert result ${JSON.stringify(result.error ?? "ok")}\n`)
      if (result.error) {
        toast.show({ message: `Revert failed: ${errorMessage(result.error)}`, variant: "error" })
        return
      }
      props.setPrompt?.(promptInfo(result.data?.revert?.messageID ?? msg.id))
    },
  }

  return (
    <DialogSelect
      title="Message Actions"
      options={[
        ...(props.waiting ? waitingOptions : [revertOption]),
        {
          title: "Copy",
          value: "message.copy",
          description: "message text to clipboard",
          onSelect: async (dialog) => {
            const msg = message()
            if (!msg) return

            const parts = sync.data.part[msg.id]
            const text = parts.reduce((agg, part) => {
              if (part.type === "text" && !part.synthetic) {
                agg += part.text
              }
              return agg
            }, "")

            await clipboard.write?.(text)
            dialog.clear()
          },
        },
        {
          title: "Fork",
          value: "session.fork",
          description: "create a new session",
          onSelect: async (dialog) => {
            const result = await sdk.client.session.fork({
              sessionID: props.sessionID,
              messageID: props.messageID,
            })
            const msg = message()
            const prompt = msg
              ? sync.data.part[msg.id].reduce(
                  (agg, part) => {
                    if (part.type === "text") {
                      if (!part.synthetic) agg.input += part.text
                    }
                    if (part.type === "file") agg.parts.push(part)
                    return agg
                  },
                  { input: "", parts: [] as PromptInfo["parts"] },
                )
              : undefined
            route.navigate({
              sessionID: result.data!.id,
              type: "session",
              prompt,
            })
            dialog.clear()
          },
        },
      ]}
    />
  )
}
