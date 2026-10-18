import { DialogPrompt } from "../ui/dialog-prompt"
import { useDialog } from "../ui/dialog"
import { useSync } from "../context/sync"
import { createMemo } from "solid-js"
import { useSDK } from "../context/sdk"
import { useClipboard } from "../context/clipboard"
import { useToast } from "../ui/toast"

interface DialogSessionRenameProps {
  session: string
}

export function DialogSessionRename(props: DialogSessionRenameProps) {
  const dialog = useDialog()
  const sync = useSync()
  const sdk = useSDK()
  const clipboard = useClipboard()
  const toast = useToast()
  const session = createMemo(() => sync.session.get(props.session))

  function copy() {
    const title = session()?.title
    if (!title) return
    void clipboard
      .write?.(title)
      .then(() => toast.show({ message: "Copied session name", variant: "info" }))
      .catch(toast.error)
  }

  return (
    <DialogPrompt
      title="Rename Session"
      value={session()?.title}
      actions={[{ command: "dialog.session_rename.copy", title: "copy", onTrigger: copy }]}
      onConfirm={(value) => {
        void sdk.client.session.update({
          sessionID: props.session,
          title: value,
        })
        dialog.clear()
      }}
      onCancel={() => dialog.clear()}
    />
  )
}
