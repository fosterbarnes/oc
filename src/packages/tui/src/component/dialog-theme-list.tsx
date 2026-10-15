import { DialogSelect, type DialogSelectRef } from "../ui/dialog-select"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { onCleanup } from "solid-js"

// `native`: pick opencode.exe's theme from oc; saves on select without previewing here.
export function DialogThemeList(props: { native?: boolean }) {
  const theme = useTheme()
  const options = Object.keys(theme.all())
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((value) => ({
      title: value,
      value: value,
    }))
  const dialog = useDialog()
  let confirmed = false
  let ref: DialogSelectRef<string>
  const initial = props.native ? theme.native() : theme.selected
  const preview = (value: string) => {
    if (!props.native) theme.set(value)
  }

  onCleanup(() => {
    if (!confirmed) preview(initial)
  })

  return (
    <DialogSelect
      title={props.native ? "opencode theme" : "Themes"}
      options={options}
      current={initial}
      onMove={(opt) => {
        preview(opt.value)
      }}
      onSelect={(opt) => {
        props.native ? theme.setNative(opt.value) : theme.set(opt.value)
        confirmed = true
        dialog.clear()
      }}
      ref={(r) => {
        ref = r
      }}
      onFilter={(query) => {
        if (query.length === 0) {
          preview(initial)
          return
        }

        const first = ref.filtered[0]
        if (first) preview(first.value)
      }}
    />
  )
}
