import { createSignal, onCleanup } from "solid-js"
import os from "node:os"
import path from "node:path"
import { DialogPrompt } from "../../../ui/dialog-prompt"
import { DialogSelect, type DialogSelectProps } from "../../../ui/dialog-select"
import { useDialog } from "../../../ui/dialog"
import { useToast } from "../../../ui/toast"
import { useOpencodeKeymap } from "../../../keymap"
import {
  dedupeRootPaths,
  displayPath,
  isDirectory,
  normalizeRootPath,
  rootSections,
  runEverythingSearch,
} from "./roots.js"

const ADD_ROOT = "__sidebar_add_custom_root__"
const RESET_ROOT = "__sidebar_reset_project_root__"
const FAVORITE_HELP = "__sidebar_favorite_help__"
const FILE_ROOT_PREFIX = "file:"

let everythingSearchHintShown = false

// File-root picker (project, favorites, recents, Everything search) and the Set file root prompt.
// Call inside SidebarTools; a pending search and the ctrl+f interceptor end with it.
export function createRootPicker(input: {
  project: () => string
  recentRoots: () => string[]
  favorites: () => ReadonlySet<string>
  setRoot: (root: string) => void
  toggleFavorite: (root: string) => void
  // Inserts a picked file into the current session's prompt.
  insertPath: (filePath: string) => void
}) {
  const dialog = useDialog()
  const toast = useToast()
  const keymap = useOpencodeKeymap()
  const promptForRoot = () =>
    dialog.replace(() => (
      <DialogPrompt
        title="Set file root"
        description={() => <text>Enter an absolute or project-relative directory.</text>}
        placeholder={input.project()}
        onConfirm={(value) => {
          const candidate = path.normalize(path.resolve(input.project(), value.trim()))
          if (!value.trim() || !isDirectory(candidate)) {
            toast.show({ variant: "error", message: `Directory not found: ${candidate}` })
            return
          }
          input.setRoot(candidate)
          dialog.clear()
        }}
        onCancel={() => dialog.clear()}
      />
    ))
  let rootPickerSearchAbort: AbortController | undefined
  let rootPickerDebounce: ReturnType<typeof setTimeout> | undefined
  let rootPickerSearchGeneration = 0
  let pickerInterceptor: (() => void) | undefined
  let selectedRootPickerValue: string | undefined
  const [rootPickerOptions, setRootPickerOptions] = createSignal<
    Array<{
      title: string
      value: string
      category?: string
      footer?: string
      disabled?: boolean
      onSelect?: () => void
    }>
  >([])
  let liveRootPickerOptions: Array<{
    title: string
    value: string
    category?: string
    footer?: string
    disabled?: boolean
    onSelect?: () => void
  }> = []

  const rootDirectoryOptions = (directories: readonly string[], category: string) => {
    const options: Array<{ title: string; value: string; category: string; onSelect?: () => void }> = []
    for (const directory of directories) {
      options.push({
        title: displayPath(directory, os.homedir()),
        value: directory,
        category,
        onSelect: () => {
          input.setRoot(directory)
          dialog.clear()
        },
      })
    }
    return options
  }

  const buildRootPickerOptions = (groupActions = false) => {
    const actionCategory = groupActions ? "Actions" : undefined
    const sections = rootSections(input.recentRoots(), [...input.favorites()])
    const projectCanonical = normalizeRootPath(input.project())
    const options: Array<{
      title: string
      value: string
      category?: string
      footer?: string
      disabled?: boolean
      onSelect?: () => void
    }> = [
      {
        title: "Add custom dir...",
        value: ADD_ROOT,
        category: actionCategory,
        onSelect: () => promptForRoot(),
      },
    ]
    if (isDirectory(projectCanonical)) {
      options.push({
        title: displayPath(projectCanonical, os.homedir()),
        value: projectCanonical,
        category: "Project",
        onSelect: () => {
          input.setRoot(projectCanonical)
          dialog.clear()
        },
      })
    }
    options.push(...rootDirectoryOptions(sections.favoriteRoots, "Favorite"))
    options.push(...rootDirectoryOptions(sections.recentRoots, "Recent"))
    options.push({
      title: "Reset to project root",
      value: RESET_ROOT,
      category: actionCategory,
      onSelect: () => {
        input.setRoot(input.project())
        dialog.clear()
      },
    })
    options.push({
      title: "Favorite",
      value: FAVORITE_HELP,
      category: "Help",
      footer: "ctrl+f",
      onSelect: () => {},
    })
    return options
  }

  const handleRootPickerSelect = (value: string) => {
    if (value === ADD_ROOT) {
      promptForRoot()
      return
    }
    if (value === RESET_ROOT) {
      input.setRoot(input.project())
      dialog.clear()
      return
    }
    if (value.startsWith(FILE_ROOT_PREFIX)) {
      input.insertPath(value.slice(FILE_ROOT_PREFIX.length))
      dialog.clear()
      return
    }
    input.setRoot(value)
    dialog.clear()
  }

  const applyRootPickerOptions = (
    searchOptions: Array<{
      title: string
      value: string
      category?: string
      footer?: string
      disabled?: boolean
      onSelect?: () => void
    }> = [],
  ) => {
    const searching = searchOptions.length > 0
    const next = searching ? [...searchOptions, ...buildRootPickerOptions(true)] : buildRootPickerOptions()
    liveRootPickerOptions.splice(0, liveRootPickerOptions.length, ...next)
    setRootPickerOptions(liveRootPickerOptions.slice())
    return liveRootPickerOptions
  }

  const renderRootPicker = (
    query = "",
    searchOptions: Array<{
      title: string
      value: string
      category?: string
      footer?: string
      disabled?: boolean
      onSelect?: () => void
    }> = [],
  ) => {
    const options = applyRootPickerOptions(searchOptions)
    selectedRootPickerValue = options.find(
      (option) => typeof option.value === "string" && isDirectory(option.value),
    )?.value
    pickerInterceptor?.()
    const pickerID = ++rootPickerSearchGeneration
    const interceptor = keymap.intercept("key", (context) => {
      if (
        context.event.ctrl &&
        context.event.name.toLowerCase() === "f" &&
        selectedRootPickerValue &&
        isDirectory(selectedRootPickerValue)
      ) {
        context.consume({ preventDefault: true, stopPropagation: true })
        input.toggleFavorite(selectedRootPickerValue)
        renderRootPicker(query, searchOptions)
      }
    })
    pickerInterceptor = interceptor
    const dialogProps = {
      title: `Project: ${input.project()}`,
      skipFilter: true,
      get options() {
        rootPickerOptions()
        return liveRootPickerOptions
      },
      onFilter: (filterQuery: string) => {
        if (rootPickerDebounce) clearTimeout(rootPickerDebounce)
        rootPickerDebounce = setTimeout(() => {
          void (async () => {
            const generation = ++rootPickerSearchGeneration
            const trimmed = filterQuery.trim()
            if (!trimmed) {
              applyRootPickerOptions([])
              return
            }
            rootPickerSearchAbort?.abort()
            rootPickerSearchAbort = new AbortController()
            const searchRoots = dedupeRootPaths([input.project(), ...input.recentRoots(), ...input.favorites()])
            const result = await runEverythingSearch({
              query: trimmed,
              roots: searchRoots,
              signal: rootPickerSearchAbort.signal,
            })
            if (generation !== rootPickerSearchGeneration) return
            if (result.ok === false) {
              if (result.error === "aborted") return
              if (!everythingSearchHintShown) {
                everythingSearchHintShown = true
                if (result.error === "missing-es") {
                  toast.show({ variant: "info", message: "Install es.exe and add it to PATH for file search." })
                } else if (result.error === "ipc-unavailable") {
                  toast.show({
                    variant: "info",
                    message: "Everything search needs es.exe on PATH and the Everything app running.",
                  })
                }
              }
              applyRootPickerOptions([])
              return
            }
            applyRootPickerOptions(
              result.entries.map((entry) => ({
                title: entry.directory
                  ? `${displayPath(entry.path, os.homedir())}/`
                  : displayPath(entry.path, os.homedir()),
                value: entry.directory ? entry.path : `${FILE_ROOT_PREFIX}${entry.path}`,
                onSelect: () =>
                  handleRootPickerSelect(entry.directory ? entry.path : `${FILE_ROOT_PREFIX}${entry.path}`),
              })),
            )
          })()
        }, 150)
      },
      onMove: (option: (typeof options)[number]) => {
        if (option.value === FAVORITE_HELP) {
          queueMicrotask(() => renderRootPicker(query, searchOptions))
          return
        }
        selectedRootPickerValue =
          typeof option.value === "string" && isDirectory(option.value) ? option.value : undefined
      },
      onSelect: (option: (typeof options)[number]) => {
        pickerInterceptor?.()
        pickerInterceptor = undefined
        if (typeof option.onSelect === "function") {
          option.onSelect()
          return
        }
        handleRootPickerSelect(String(option.value))
      },
    } as unknown as DialogSelectProps<string>
    dialog.replace(
      () => <DialogSelect {...dialogProps} />,
      () => {
        if (pickerID !== rootPickerSearchGeneration) return
        pickerInterceptor?.()
        pickerInterceptor = undefined
        if (rootPickerDebounce) clearTimeout(rootPickerDebounce)
        rootPickerSearchAbort?.abort()
      },
    )
  }

  const selectRoot = () => renderRootPicker()
  onCleanup(() => {
    rootPickerSearchGeneration += 1
    if (rootPickerDebounce) clearTimeout(rootPickerDebounce)
    rootPickerSearchAbort?.abort()
    pickerInterceptor?.()
  })

  return { promptForRoot, selectRoot }
}
