import { DialogPrompt } from "../../../ui/dialog-prompt"
import { DialogSelect, type DialogSelectProps } from "../../../ui/dialog-select"
import { useDialog } from "../../../ui/dialog"
import { useToast } from "../../../ui/toast"
import {
  BUILTIN_SHELLS,
  defaultScriptSettings,
  normalizeExtension,
  parseLauncher,
  resolveScriptTerminal,
  scriptTerminals,
  updateLanguage,
  type ScriptLanguage,
  type ScriptSettings,
  type WezTermSplitSize,
} from "./settings.js"

const ADD_SCRIPT_EXECUTABLE = "__sidebar_add_script_executable__"
const ADD_SCRIPT_EXTENSION = "__sidebar_add_script_extension__"
const RESET_SCRIPT_SETTINGS = "__sidebar_reset_script_settings__"
const SCRIPT_SHELL_SECTION = "__sidebar_script_shell_section__"
const SCRIPT_LANGUAGE_SECTION = "__sidebar_script_language_section__"
const SCRIPT_EXTENSION_SECTION = "__sidebar_script_extension_section__"
const WEZTERM_SIZE_SECTION = "__sidebar_wezterm_size_section__"

// Global script settings dialogs: shell, terminal placement, WezTerm split size, languages, and
// tracked extensions. Saving stays with SidebarTools, which owns the settings and script list.
export function createScriptSettingsMenu(input: {
  settings: () => ScriptSettings
  save: (next: ScriptSettings, message?: string) => void
  reset: () => void
}) {
  const dialog = useDialog()
  const toast = useToast()
  const toggleLanguage = (languageID: string) => {
    input.save(
      updateLanguage(input.settings(), languageID, (language) => ({ ...language, enabled: !language.enabled })),
    )
  }
  const toggleExtension = (languageID: string, extension: string) => {
    input.save(
      updateLanguage(input.settings(), languageID, (language) => ({
        ...language,
        extensions: language.extensions.includes(extension)
          ? language.extensions.filter((item) => item !== extension)
          : [...language.extensions, extension],
      })),
    )
  }
  const chooseLanguageForExtension = (extension: string) => {
    const options = input.settings().languages.map((language) => ({
      title: language.title,
      value: language.id,
      category: language.enabled ? "Enabled languages" : "Disabled languages",
      footer: language.launcher.executable,
      disabled: !language.enabled,
    }))
    dialog.replace(() => (
      <DialogSelect
        title={`Track ${extension} with`}
        options={options}
        current={options.find((option) => !option.disabled)?.value}
        onSelect={(option) => {
          input.save(
            updateLanguage(input.settings(), option.value, (language) => ({
              ...language,
              extensions: language.extensions.includes(extension)
                ? language.extensions
                : [...language.extensions, extension],
            })),
            `Tracking ${extension} with ${option.title}`,
          )
          selectScriptSettings()
        }}
      />
    ), undefined, { back: selectScriptSettings })
  }
  const promptCustomExtension = (languageID?: string) =>
    dialog.replace(() => (
      <DialogPrompt
        title="Add script extension"
        description={() => <text>Enter an extension such as .ps1 or .envrc.</text>}
        placeholder=".custom"
        onConfirm={(value) => {
          const extension = normalizeExtension(value)
          if (!extension) {
            toast.show({ variant: "error", message: "Enter a valid file extension." })
            return
          }
          if (languageID) {
            input.save(
              updateLanguage(input.settings(), languageID, (language) => ({
                ...language,
                extensions: language.extensions.includes(extension)
                  ? language.extensions
                  : [...language.extensions, extension],
              })),
              `Tracking ${extension}`,
            )
            selectScriptSettings()
          } else {
            chooseLanguageForExtension(extension)
          }
        }}
      />
    ), undefined, { back: selectScriptSettings })
  const promptCustomExecutable = () =>
    dialog.replace(() => (
      <DialogPrompt
        title="Add custom script executable"
        description={() => <text>Enter an executable and optional arguments. The file path is appended.</text>}
        placeholder="my-runner --flag"
        onConfirm={(value) => {
          const tokens = parseLauncher(value)
          if (!tokens) {
            toast.show({ variant: "error", message: "Enter an executable." })
            return
          }
          const [executable, ...args] = tokens
          const id = `custom-${Date.now()}`
          const language: ScriptLanguage = {
            id,
            title: `Custom: ${executable}`,
            enabled: true,
            launcher: { executable, args },
            extensions: [],
          }
          input.save(
            { ...input.settings(), languages: [...input.settings().languages, language] },
            `Added ${executable}`,
          )
          promptCustomExtension(id)
        }}
      />
    ), undefined, { back: selectScriptSettings })
  const splitSizeLabel = (size: WezTermSplitSize) => ("Percent" in size ? `${size.Percent}%` : `${size.Cells} cells`)
  const promptWeztermSizeValue = (direction: "horizontal" | "vertical", mode: "Percent" | "Cells") =>
    dialog.replace(() => (
      <DialogPrompt
        title={`${direction === "horizontal" ? "Horizontal" : "Vertical"} split ${mode}`}
        description={() => (
          <text>{mode === "Percent" ? "Enter a percentage from 1 to 99." : "Enter a positive cell count."}</text>
        )}
        placeholder={mode === "Percent" ? "30" : "20"}
        onConfirm={(value) => {
          const number = Number(value.trim())
          const valid = Number.isInteger(number) && (mode === "Percent" ? number > 0 && number < 100 : number > 0)
          if (!valid) {
            toast.show({
              variant: "error",
              message:
                mode === "Percent"
                  ? "Enter a whole percentage from 1 to 99."
                  : "Enter a positive whole number of cells.",
            })
            return
          }
          const size: WezTermSplitSize = mode === "Percent" ? { Percent: number } : { Cells: number }
          input.save(
            {
              ...input.settings(),
              wezterm: { ...input.settings().wezterm, [direction]: size },
            },
            `${direction === "horizontal" ? "Horizontal" : "Vertical"} split size set to ${splitSizeLabel(size)}`,
          )
          selectScriptSettings()
        }}
      />
    ), undefined, { back: () => selectWeztermSizeMode(direction) })
  const selectWeztermSizeMode = (direction: "horizontal" | "vertical") => {
    const current = input.settings().wezterm[direction]
    dialog.replace(() => (
      <DialogSelect
        title={`${direction === "horizontal" ? "Horizontal" : "Vertical"} split size`}
        options={[
          { title: "Percent", value: "Percent", footer: "Percent" in current ? `${current.Percent}%` : "" },
          { title: "Cells", value: "Cells", footer: "Cells" in current ? `${current.Cells} cells` : "" },
        ]}
        current={"Percent" in current ? "Percent" : "Cells"}
        onSelect={(option) => promptWeztermSizeValue(direction, option.value as "Percent" | "Cells")}
      />
    ), undefined, { back: selectScriptSettings })
  }
  const selectScriptSettings = () => {
    const defaults = defaultScriptSettings()
    const languageMap = new Map(input.settings().languages.map((language) => [language.id, language]))
    const extensionOptions = defaults.languages
      .flatMap((language) => {
        const current = languageMap.get(language.id)
        const extensions = [...new Set([...language.extensions, ...(current?.extensions ?? [])])]
        return extensions.map((extension) => ({
          title: extension,
          value: `extension:${language.id}:${extension}`,
          category: language.title,
          footer: current?.extensions.includes(extension) ? "tracked" : "not tracked",
        }))
      })
      .concat(
        input.settings().languages
          .filter((language) => !defaults.languages.some((item) => item.id === language.id))
          .flatMap((language) =>
            language.extensions.map((extension) => ({
              title: extension,
              value: `extension:${language.id}:${extension}`,
              category: language.title,
              footer: "tracked",
            })),
          ),
      )
    const splitDirection =
      input.settings().terminal === "wezterm-horizontal"
        ? "horizontal"
        : input.settings().terminal === "wezterm-vertical"
          ? "vertical"
          : undefined
    const placements = scriptTerminals()
    const selectedTarget = resolveScriptTerminal(input.settings().terminal)
    const splitSizeOptions =
      splitDirection && placements.length > 0
        ? [
            { title: "Split size", value: WEZTERM_SIZE_SECTION, disabled: true },
            {
              title: `${splitDirection === "horizontal" ? "Horizontal" : "Vertical"} split size`,
              value: `wezterm-size:${splitDirection}`,
              category: "Split size",
              footer: splitSizeLabel(input.settings().wezterm[splitDirection]),
            },
          ]
        : []
    const options = [
      { title: "Shell", value: SCRIPT_SHELL_SECTION, disabled: true },
      ...BUILTIN_SHELLS.map((shell) => ({
        title: shell.title,
        value: `shell:${shell.id}`,
        category: "Shell",
        footer: input.settings().shell.executable === shell.launcher.executable ? "selected" : shell.launcher.executable,
      })),
      ...(BUILTIN_SHELLS.some((shell) => shell.launcher.executable === input.settings().shell.executable)
        ? []
        : [
            {
              title: `Custom: ${input.settings().shell.executable}`,
              value: "shell:custom",
              category: "Shell",
              footer: "selected",
            },
          ]),
      ...(placements.length > 0 ? [{ title: "Terminal placement", value: "terminal-section", disabled: true }] : []),
      ...placements.map((terminal) => ({
        title: terminal.title,
        value: `terminal:${terminal.id}`,
        category: "Terminal placement",
        footer: selectedTarget === terminal.id ? "selected" : "",
      })),
      {
        title: "Native detached runner",
        value: "terminal:native",
        category: placements.length > 0 ? "Terminal placement" : undefined,
        footer: selectedTarget === "native" ? "selected" : "",
      },
      ...splitSizeOptions,
      { title: "Languages", value: SCRIPT_LANGUAGE_SECTION, disabled: true },
      ...input.settings().languages.map((language) => ({
        title: `${language.enabled ? "*" : " "} ${language.title}`,
        value: `language:${language.id}`,
        category: "Languages",
        footer: language.extensions.join(", ") || "no extensions",
      })),
      { title: "Tracked extensions", value: SCRIPT_EXTENSION_SECTION, disabled: true },
      ...extensionOptions,
      { title: "Add custom executable...", value: ADD_SCRIPT_EXECUTABLE },
      { title: "Add custom extension...", value: ADD_SCRIPT_EXTENSION },
      { title: "Reset global script settings", value: RESET_SCRIPT_SETTINGS },
    ]
    const selectedTerminal = selectedTarget === "native" ? "terminal:native" : `terminal:${selectedTarget}`
    const dialogProps = {
      title: `Global script settings`,
      skipFilter: true,
      options,
      current: selectedTerminal,
      onSelect: (option: (typeof options)[number]) => {
        if (option.value === ADD_SCRIPT_EXECUTABLE) promptCustomExecutable()
        else if (option.value === ADD_SCRIPT_EXTENSION) promptCustomExtension()
        else if (option.value === RESET_SCRIPT_SETTINGS) {
          input.reset()
          selectScriptSettings()
        } else if (option.value.startsWith("terminal:")) {
          const terminal = option.value.slice("terminal:".length) as ScriptSettings["terminal"]
          input.save(
            { ...input.settings(), terminal },
            terminal === "native" ? "Using native detached runner" : `Using terminal placement: ${option.title}`,
          )
          selectScriptSettings()
        } else if (option.value.startsWith("wezterm-size:")) {
          selectWeztermSizeMode(option.value.slice("wezterm-size:".length) as "horizontal" | "vertical")
        } else if (option.value.startsWith("shell:")) {
          const shell = BUILTIN_SHELLS.find((item) => `shell:${item.id}` === option.value)
          if (shell) {
            input.save(
              { ...input.settings(), shell: { ...shell.launcher, args: [...shell.launcher.args] } },
              `Using ${shell.title}`,
            )
            selectScriptSettings()
          }
        } else if (option.value.startsWith("language:")) {
          toggleLanguage(option.value.slice("language:".length))
          selectScriptSettings()
        } else if (option.value.startsWith("extension:")) {
          const [, languageID, extension] = option.value.split(":")
          toggleExtension(languageID, extension)
          selectScriptSettings()
        }
      },
    } as unknown as DialogSelectProps<string>
    dialog.replace(() => <DialogSelect {...dialogProps} />)
  }

  return { selectScriptSettings }
}
