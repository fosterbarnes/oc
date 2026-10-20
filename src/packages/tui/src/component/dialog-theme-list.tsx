import { DialogSelect, type DialogSelectRef } from "../ui/dialog-select"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { useTuiConfig } from "../config"
import { persistTuiSetting } from "../ocSettings"
import { onCleanup } from "solid-js"

// `native`: pick opencode.exe's theme from oc; saves on select without previewing here.
// With the Beta daily theme on, previews pause it, cancel resumes it, and a pick turns it off.
export function DialogThemeList(props: { native?: boolean }) {
  const theme = useTheme()
  const config = useTuiConfig()
  const toast = useToast()
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
    if (confirmed || props.native) return
    preview(initial)
    theme.resumeDaily()
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
        if (props.native || !config.daily_theme) return
        config.setDailyTheme(false)
        void persistTuiSetting(["daily_theme"], false)
        toast.show({ message: "Daily theme off", variant: "info" })
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
