import type { BoxRenderable, TextareaRenderable, ScrollBoxRenderable } from "@opentui/core"
import { pathToFileURL } from "bun"
import fuzzysort from "fuzzysort"
import path from "path"
import { firstBy } from "remeda"
import { createMemo, createResource, createEffect, onMount, onCleanup, Index, Show, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { useEditorContext } from "../../context/editor"
import { useProject } from "../../context/project"
import { useSDK } from "../../context/sdk"
import { useSync } from "../../context/sync"
import { useData } from "../../context/data"
import { getScrollAcceleration } from "../../util/scroll"
import { useTuiPaths } from "../../context/runtime"
import { useTuiConfig } from "../../config"
import { useLocation } from "../../context/location"
import { useKV } from "../../context/kv"
import { useTheme, selectedForeground } from "../../context/theme"
import { SplitBorder } from "../../ui/border"
import { useTerminalDimensions } from "@opentui/solid"
import { Locale } from "../../util/locale"
import type { PromptInfo } from "../../prompt/history"
import { useFrecency } from "../../prompt/frecency"
import { useBindings, useCommandShortcut, useCommandSlashes, useOpencodeModeStack } from "../../keymap"
import { displayCharAt, mentionTriggerIndex } from "../../prompt/display"
import { REVIVE_MODES, slashTokenEnd, slashTriggerIndex } from "../../prompt/slash"
import type { FileSystemEntry } from "@opencode-ai/sdk/v2"

function removeLineRange(input: string) {
  const hashIndex = input.lastIndexOf("#")
  return hashIndex !== -1 ? input.substring(0, hashIndex) : input
}

function extractLineRange(input: string) {
  const hashIndex = input.lastIndexOf("#")
  if (hashIndex === -1) {
    return { baseQuery: input }
  }

  const baseName = input.substring(0, hashIndex)
  const linePart = input.substring(hashIndex + 1)
  const lineMatch = linePart.match(/^(\d+)(?:-(\d*))?$/)

  if (!lineMatch) {
    return { baseQuery: baseName }
  }

  const startLine = Number(lineMatch[1])
  const endLine = lineMatch[2] && startLine < Number(lineMatch[2]) ? Number(lineMatch[2]) : undefined

  return {
    lineRange: {
      baseName,
      startLine,
      endLine,
    },
    baseQuery: baseName,
  }
}

export type AutocompleteRef = {
  onInput: (value: string) => void
  visible: false | "@" | "/"
}

export type AutocompleteOption = {
  favoriteKey?: string
  display: string
  value?: string
  aliases?: string[]
  disabled?: boolean
  description?: string
  isDirectory?: boolean
  onSelect?: () => void
  path?: string
  // Slash entry origin; colors the row so each kind reads at a glance.
  kind?: "tui" | "command" | "mcp" | "skill"
  // A TUI action typed into the prompt instead of run on select (revive chain steps).
  inserts?: boolean
  // @ mention type, shown right-aligned on the row.
  mention?: "agent" | "reference" | "resource"
}

export function Autocomplete(props: {
  value: string
  sessionID?: string
  inlineSlashMenu?: boolean
  visible?: boolean
  setPrompt: (input: (prompt: PromptInfo) => void) => void
  setExtmark: (partIndex: number, extmarkId: number) => void
  anchor: () => BoxRenderable
  input: () => TextareaRenderable
  ref: (ref: AutocompleteRef) => void
  fileStyleId: number
  agentStyleId: number
  promptPartTypeId: () => number
}) {
  const editor = useEditorContext()
  const sdk = useSDK()
  const sync = useSync()
  const data = useData()
  const project = useProject()
  const slashes = useCommandSlashes()
  const modeStack = useOpencodeModeStack()
  const { theme } = useTheme()
  // Theme tokens keep the four slash kinds distinct in every theme: built-in TUI actions secondary (purple),
  // user commands warning (yellow), MCP prompts info (teal/cyan), skills syntaxNumber (peach/orange).
  const kindColor = (kind: AutocompleteOption["kind"]) => {
    if (kind === "tui") return theme.secondary
    if (kind === "command") return theme.warning
    if (kind === "mcp") return theme.info
    if (kind === "skill") return theme.syntaxNumber
    return theme.text
  }
  const dimensions = useTerminalDimensions()
  const frecency = useFrecency()
  const tuiConfig = useTuiConfig()
  const paths = useTuiPaths()
  const location = useLocation()
  const kv = useKV()
  const favorites = createMemo<string[]>(() => kv.get("slash.favorites", []))
  const favoriteKeys = createMemo(() => new Set(favorites()))
  const favoriteShortcut = useCommandShortcut("prompt.autocomplete.favorite")
  const [store, setStore] = createStore({
    index: 0,
    selected: 0,
    visible: false as AutocompleteRef["visible"],
  })

  const [positionTick, setPositionTick] = createSignal(0)

  createEffect(() => {
    if (!store.visible) return
    const popMode = modeStack.push("autocomplete")
    onCleanup(popMode)
  })

  createEffect(() => {
    if (store.visible) {
      let lastPos = { x: 0, y: 0, width: 0, parentX: 0, parentY: 0 }
      const interval = setInterval(() => {
        const anchor = props.anchor()
        const parentX = anchor.parent?.x ?? 0
        const parentY = anchor.parent?.y ?? 0
        if (
          anchor.x !== lastPos.x ||
          anchor.y !== lastPos.y ||
          anchor.width !== lastPos.width ||
          parentX !== lastPos.parentX ||
          parentY !== lastPos.parentY
        ) {
          lastPos = { x: anchor.x, y: anchor.y, width: anchor.width, parentX, parentY }
          setPositionTick((t) => t + 1)
        }
      }, 50)

      onCleanup(() => clearInterval(interval))
    }
  })

  const position = createMemo(() => {
    if (!store.visible) return { x: 0, y: 0, width: 0 }
    dimensions()
    positionTick()
    const anchor = props.anchor()
    const parent = anchor.parent
    const parentX = parent?.x ?? 0
    const parentY = parent?.y ?? 0

    return {
      x: anchor.x - parentX,
      y: anchor.y - parentY,
      width: anchor.width,
    }
  })

  const filter = createMemo(() => {
    if (!store.visible) return
    // Track props.value to make memo reactive to text changes
    props.value // <- there surely is a better way to do this, like making .input() reactive

    return props.input().getTextRange(store.index + 1, props.input().cursorOffset)
  })

  // filter() reads reactive props.value plus non-reactive cursor/text state.
  // On keypress those can be briefly out of sync, so filter() may return an empty/partial string.
  // Copy it into search in an effect because effects run after reactive updates have been rendered and painted
  // so the input has settled and all consumers read the same stable value.
  const [search, setSearch] = createSignal("")
  createEffect(() => {
    const next = filter()
    setSearch(next ? next : "")
  })

  function insertPart(text: string, part: PromptInfo["parts"][number]) {
    const input = props.input()
    const currentCursorOffset = input.cursorOffset

    const charAfterCursor = displayCharAt(props.value, currentCursorOffset)
    const needsSpace = charAfterCursor !== " "
    const append = "@" + text + (needsSpace ? " " : "")

    input.cursorOffset = store.index
    const startCursor = input.logicalCursor
    input.cursorOffset = currentCursorOffset
    const endCursor = input.logicalCursor

    input.deleteRange(startCursor.row, startCursor.col, endCursor.row, endCursor.col)
    input.insertText(append)

    const virtualText = "@" + text
    const extmarkStart = store.index
    const extmarkEnd = extmarkStart + Bun.stringWidth(virtualText)

    const styleId = part.type === "file" ? props.fileStyleId : part.type === "agent" ? props.agentStyleId : undefined

    const extmarkId = input.extmarks.create({
      start: extmarkStart,
      end: extmarkEnd,
      virtual: true,
      styleId,
      typeId: props.promptPartTypeId(),
    })

    props.setPrompt((draft) => {
      if (part.type === "file") {
        const existingIndex = draft.parts.findIndex((p) => p.type === "file" && "url" in p && p.url === part.url)
        if (existingIndex !== -1) {
          const existing = draft.parts[existingIndex]
          if (
            part.source?.text &&
            existing &&
            "source" in existing &&
            existing.source &&
            "text" in existing.source &&
            existing.source.text
          ) {
            existing.source.text.start = extmarkStart
            existing.source.text.end = extmarkEnd
            existing.source.text.value = virtualText
          }
          return
        }
      }

      if (part.type === "file" && part.source?.text) {
        part.source.text.start = extmarkStart
        part.source.text.end = extmarkEnd
        part.source.text.value = virtualText
      } else if (part.type === "agent" && part.source) {
        part.source.start = extmarkStart
        part.source.end = extmarkEnd
        part.source.value = virtualText
      }
      const partIndex = draft.parts.length
      draft.parts.push(part)
      props.setExtmark(partIndex, extmarkId)
    })

    if (part.type === "file" && part.source && part.source.type === "file") {
      frecency.updateFrecency(part.source.path)
    }
  }

  function createFilePart(
    item: FileSystemEntry,
    filePath: string,
    lineRange?: { startLine: number; endLine?: number },
  ) {
    const urlObj = pathToFileURL(filePath)
    const filename =
      lineRange && item.type !== "directory"
        ? `${item.path}#${lineRange.startLine}${lineRange.endLine ? `-${lineRange.endLine}` : ""}`
        : item.path

    if (lineRange && item.type !== "directory") {
      urlObj.searchParams.set("start", String(lineRange.startLine))
      if (lineRange.endLine !== undefined) {
        urlObj.searchParams.set("end", String(lineRange.endLine))
      }
    }

    return {
      filename,
      part: {
        type: "file" as const,
        mime: item.type === "directory" ? "application/x-directory" : "text/plain",
        filename,
        url: urlObj.href,
        source: {
          type: "file" as const,
          text: {
            start: 0,
            end: 0,
            value: "",
          },
          path: item.path,
        },
      },
    }
  }

  const references = createMemo(() => data.location.reference.list() ?? [])

  const referenceMatch = createMemo(() => {
    if (!store.visible || store.visible === "/") return
    const { baseQuery } = extractLineRange(search())
    const slash = baseQuery.indexOf("/")
    const alias = slash === -1 ? baseQuery : baseQuery.slice(0, slash)
    return references().find((item) => !item.hidden && item.name === alias)
  })

  function normalizeMentionPath(filePath: string) {
    const baseDir = location()?.directory || sync.path.directory || paths.cwd
    const absolute = path.resolve(filePath)
    const relative = path.relative(baseDir, absolute)

    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
      return relative.split(path.sep).join("/")
    }

    return absolute.split(path.sep).join("/")
  }

  function insertFileMention(input: { filePath: string; lineStart: number; lineEnd: number }) {
    const item = normalizeMentionPath(input.filePath)
    const lineRange = {
      startLine: input.lineStart,
      endLine: input.lineEnd > input.lineStart ? input.lineEnd : undefined,
    }
    const { filename, part } = createFilePart({ path: item, type: "file" }, input.filePath, lineRange)
    const index = store.visible === "@" ? store.index : props.input().cursorOffset

    setStore("visible", false)
    setStore("index", index)
    insertPart(filename, part)
  }

  const [files] = createResource(
    () => ({ query: search(), location: location() }),
    async (input) => {
      if (!store.visible || store.visible === "/") return []
      if (referenceMatch()) return []
      const { lineRange, baseQuery } = extractLineRange(input.query ?? "")

      // Get files from SDK
      const result = await sdk.client.v2.fs.find({
        query: baseQuery,
        limit: "20",
        location: {
          directory: input.location?.directory,
          workspace: input.location?.workspaceID ?? project.workspace.current(),
        },
      })

      const options: AutocompleteOption[] = []

      // Add file options. Trust the order returned by fff (frecency, fuzzy
      // score, filename bonus, etc. are already factored in).
      if (!result.error && result.data) {
        const width = props.anchor().width - 4
        options.push(
          ...result.data.data.map((item): AutocompleteOption => {
            const { filename, part } = createFilePart(
              item,
              path.join(result.data.location.directory, item.path),
              lineRange,
            )
            return {
              display: Locale.truncateMiddle(filename, width),
              value: filename,
              isDirectory: item.type === "directory",
              path: item.path,
              onSelect: () => {
                insertPart(filename, part)
              },
            }
          }),
        )
      }

      return options
    },
    {
      initialValue: [],
    },
  )

  const mcpResources = createMemo(() => {
    if (!store.visible || store.visible === "/") return []

    const options: AutocompleteOption[] = []
    // Leaves room for the right-aligned "resource" label.
    const width = props.anchor().width - 14

    for (const res of Object.values(sync.data.mcp_resource)) {
      options.push({
        display: Locale.truncateMiddle(res.name, width),
        mention: "resource",
        // Match the name only; matching the URI caused unrelated fuzzy hits.
        value: res.name,
        description: res.description,
        onSelect: () => {
          insertPart(res.name, {
            type: "file",
            mime: res.mimeType ?? "text/plain",
            filename: res.name,
            url: res.uri,
            source: {
              type: "resource",
              text: {
                start: 0,
                end: 0,
                value: "",
              },
              clientName: res.client,
              uri: res.uri,
            },
          })
        },
      })
    }

    return options
  })

  const agents = createMemo(() => {
    return sync.data.agent
      .filter((agent) => !agent.hidden && agent.mode !== "primary")
      .map(
        (agent): AutocompleteOption => ({
          display: "@" + agent.name,
          mention: "agent",
          onSelect: () => {
            insertPart(agent.name, {
              type: "agent",
              name: agent.name,
              source: {
                start: 0,
                end: 0,
                value: "",
              },
            })
          },
        }),
      )
  })

  const referenceAliases = createMemo(() =>
    references()
      .filter((reference) => !reference.hidden)
      .map(
        (reference): AutocompleteOption => ({
          display: "@" + reference.name,
          mention: "reference",
          description: ` ${reference.source.type === "git" ? reference.source.repository : reference.source.path}`,
          onSelect: () => {
            insertPart(reference.name, {
              type: "file",
              mime: "application/x-directory",
              filename: reference.name,
              url: pathToFileURL(reference.path).href,
              source: {
                type: "file",
                text: { start: 0, end: 0, value: "" },
                path: reference.name,
              },
            })
          },
        }),
      ),
  )

  // Replaces the typed `/partial` with `/name ` so more text or commands can follow.
  function insertSlash(name: string) {
    const input = props.input()
    const offset = input.cursorOffset
    const index = slashTriggerIndex(input.plainText, offset)
    if (index === undefined) return
    const end = slashTokenEnd(input.plainText, offset)
    input.cursorOffset = index
    const startCursor = input.logicalCursor
    input.cursorOffset = end
    const endCursor = input.logicalCursor
    input.deleteRange(startCursor.row, startCursor.col, endCursor.row, endCursor.col)
    input.insertText("/" + name + (displayCharAt(input.plainText, index) === " " ? "" : " "))
    if (displayCharAt(input.plainText, input.cursorOffset) === " ") input.cursorOffset += 1
    setStore("visible", false)
  }

  const commands = createMemo((): AutocompleteOption[] => {
    // Revives are chain steps (`/pass /revive /agent-push`, prompt/slash.ts `extractChain`): offered
    // anywhere and inserted as text, so submit runs the whole message in order.
    const results: AutocompleteOption[] = slashes().flatMap((slash) => {
      const name = slash.display.slice(1)
      const revive = name in REVIVE_MODES
      if (!revive && store.index !== 0) return []
      return [
        {
          ...slash,
          display: `${slash.display}:(oc)`,
          kind: "tui" as const,
          ...(revive && { inserts: true, onSelect: () => insertSlash(name) }),
        },
      ]
    })

    for (const serverCommand of sync.data.command) {
      const label = serverCommand.source ? `:(${serverCommand.source})` : ""
      results.push({
        favoriteKey: `${serverCommand.source ?? "command"}:${serverCommand.name}`,
        display: "/" + serverCommand.name + label,
        description: serverCommand.description,
        kind: serverCommand.source,
        onSelect: () => insertSlash(serverCommand.name),
      })
    }

    results.sort((a, b) => a.display.localeCompare(b.display))

    const max = firstBy(results, [(x) => x.display.length, "desc"])?.display.length
    if (!max) return results
    return results.map((item) => ({
      ...item,
      display: item.display.padEnd(max + 2),
    }))
  })

  const options = createMemo((prev: AutocompleteOption[] | undefined) => {
    const filesValue = files()
    const referenceMatchValue = referenceMatch()
    const agentsValue = agents()
    const referenceAliasesValue = referenceAliases()
    const commandsValue = commands()
    const searchValue = search()

    if (store.visible === "@" && referenceMatchValue) {
      return referenceAliasesValue.filter((item) => item.display === `@${referenceMatchValue.name}`)
    }

    // Files come from fff already fuzzy ranked and filtered
    // it shouldn't be additionally sorted by fuzzysort as it will loose the results
    const fileOptions: AutocompleteOption[] = store.visible === "@" ? filesValue || [] : []
    const nonFileOptions: AutocompleteOption[] =
      store.visible === "@" ? [...referenceAliasesValue, ...agentsValue, ...mcpResources()] : [...commandsValue]

    if (!searchValue) {
      if (store.visible === "/") return orderSlashFavorites(nonFileOptions, favoriteKeys())
      return [...nonFileOptions, ...fileOptions]
    }

    if (files.loading && prev && prev.length > 0) {
      return prev
    }

    const fuzziedNonFiles = fuzzysort
      .go(removeLineRange(searchValue), nonFileOptions, {
        keys: [
          (obj) => removeLineRange((obj.value ?? obj.display).trimEnd()),
          // Match description for slash commands only; for "@" it surfaced unrelated items.
          ...(store.visible === "/" ? ["description" as const] : []),
          (obj) => obj.aliases?.join(" ") ?? "",
        ],
        threshold: store.visible === "@" ? 0.5 : 0,
        limit: 10,
        scoreFn: (objResults) => {
          const displayResult = objResults[0]
          let score = objResults.score
          if (displayResult && displayResult.target.startsWith(store.visible + searchValue)) {
            score *= 2
          }
          const frecencyScore = objResults.obj.path ? frecency.getFrecency(objResults.obj.path) : 0
          return score * (1 + frecencyScore)
        },
      })
      .map((arr) => arr.obj)

    if (store.visible === "/") return withExactSlashFirst(fuzziedNonFiles, nonFileOptions, searchValue)
    return [...fuzziedNonFiles, ...fileOptions].slice(0, 10)
  })

  createEffect(() => {
    filter()
    setStore("selected", 0)
  })

  function move(direction: -1 | 1) {
    if (!store.visible) return
    if (!options().length) return
    let next = store.selected + direction
    if (next < 0) next = options().length - 1
    if (next >= options().length) next = 0
    moveTo(next)
  }

  function moveTo(next: number) {
    setStore("selected", next)
    if (!scroll) return
    const viewportHeight = Math.min(height(), options().length)
    const scrollBottom = scroll.scrollTop + viewportHeight
    if (next < scroll.scrollTop) {
      scroll.scrollBy(next - scroll.scrollTop)
    } else if (next + 1 > scrollBottom) {
      scroll.scrollBy(next + 1 - scrollBottom)
    }
  }

  // Wheel scrolling moves the window without moving the selection: clamp it back into view.
  function syncSelectionWindow() {
    if (!scroll || !options().length) return
    const first = Math.min(scroll.scrollTop, options().length - 1)
    const last = Math.min(options().length - 1, first + Math.min(height(), options().length) - 1)
    const selected = Math.max(first, Math.min(last, store.selected))
    if (selected !== store.selected) setStore("selected", selected)
  }

  function select() {
    const selected = options()[store.selected]
    if (!selected) return
    // Native actions consume their trigger; prompt commands and mentions replace it themselves.
    if (selected.kind === "tui" && !selected.inserts) hide()
    else setStore("visible", false)
    selected.onSelect?.()
  }

  function expandDirectory() {
    const selected = options()[store.selected]
    if (!selected) return

    const input = props.input()
    const currentCursorOffset = input.cursorOffset

    const displayText = (selected.value ?? selected.display).trimEnd()
    const path = displayText.startsWith("@") ? displayText.slice(1) : displayText

    input.cursorOffset = store.index
    const startCursor = input.logicalCursor
    input.cursorOffset = currentCursorOffset
    const endCursor = input.logicalCursor

    input.deleteRange(startCursor.row, startCursor.col, endCursor.row, endCursor.col)
    input.insertText("@" + path + "/")

    setStore("selected", 0)
  }

  useBindings(() => ({
    target: props.input,
    enabled: () => store.visible === "/",
    priority: 1,
    commands: [
      {
        name: "prompt.autocomplete.favorite",
        title: "Toggle slash favorite",
        category: "Autocomplete",
        run() {
          const key = options()[store.selected]?.favoriteKey
          if (!key) return
          kv.set(
            "slash.favorites",
            favoriteKeys().has(key) ? favorites().filter((item) => item !== key) : [...favorites(), key],
          )
          moveTo(options().findIndex((item) => item.favoriteKey === key))
        },
      },
    ],
    bindings: tuiConfig.keybinds.gather("prompt.autocomplete.favorite", ["prompt.autocomplete.favorite"]),
  }))

  useBindings(() => ({
    target: props.input,
    enabled: () => Boolean(store.visible),
    commands: [
      {
        name: "prompt.autocomplete.prev",
        title: "Previous autocomplete item",
        category: "Autocomplete",
        run() {
          move(-1)
        },
      },
      {
        name: "prompt.autocomplete.next",
        title: "Next autocomplete item",
        category: "Autocomplete",
        run() {
          move(1)
        },
      },
      {
        name: "prompt.autocomplete.hide",
        title: "Hide autocomplete",
        category: "Autocomplete",
        run() {
          hide()
        },
      },
      {
        name: "prompt.autocomplete.select",
        title: "Select autocomplete item",
        category: "Autocomplete",
        run() {
          select()
        },
      },
      {
        name: "prompt.autocomplete.complete",
        title: "Complete autocomplete item",
        category: "Autocomplete",
        run() {
          const selected = options()[store.selected]
          if (selected?.isDirectory) {
            expandDirectory()
            return
          }

          select()
        },
      },
    ],
    bindings: tuiConfig.keybinds.gather("prompt.autocomplete", [
      "prompt.autocomplete.prev",
      "prompt.autocomplete.next",
      "prompt.autocomplete.hide",
      "prompt.autocomplete.select",
      "prompt.autocomplete.complete",
    ]),
  }))

  function show(mode: "@" | "/") {
    if (mode === "/") void sync.refreshCommands()
    setStore({
      visible: mode,
      index: props.input().cursorOffset,
    })
  }

  function hide() {
    const input = props.input()
    const index = store.visible === "/" ? slashTriggerIndex(input.plainText, input.cursorOffset) : undefined
    if (index !== undefined) {
      const offset = input.cursorOffset
      input.cursorOffset = index
      const start = input.logicalCursor
      input.cursorOffset = offset
      const end = input.logicalCursor
      input.deleteRange(start.row, start.col, end.row, end.col)
      // Sync the prompt store immediately since onContentChange is async
      props.setPrompt((draft) => {
        draft.input = props.input().plainText
      })
    }
    setStore("visible", false)
  }

  onMount(() => {
    const unsubscribeMention = editor.onMention((mention) => {
      insertFileMention(mention)
    })

    onCleanup(() => {
      unsubscribeMention()
    })

    props.ref({
      get visible() {
        return store.visible
      },
      onInput(value) {
        const offset = props.input().cursorOffset
        const slash = slashTriggerIndex(value, offset)
        if (store.visible === "/" || (!store.visible && slash !== undefined)) {
          if (slash === undefined) {
            setStore("visible", false)
            return
          }
          if (!store.visible) show("/")
          setStore("index", slash)
          return
        }
        if (store.visible) {
          if (
            // Typed text before the trigger
            props.input().cursorOffset <= store.index ||
            // There is a space between the trigger and the cursor
            props.input().getTextRange(store.index, props.input().cursorOffset).match(/\s/)
          ) {
            hide()
          }
          return
        }

        // Check if autocomplete should reopen (e.g., after backspace deleted a space)
        if (offset === 0) return

        // Check for "@" trigger - find the nearest "@" before cursor with no whitespace between
        const idx = mentionTriggerIndex(value, offset)
        if (idx !== undefined) {
          show("@")
          setStore("index", idx)
        }
      },
    })
  })

  const inline = () => Boolean(props.inlineSlashMenu) && store.visible === "/"
  const menuBudget = () => Math.max(1, Math.floor(dimensions().height / 3))
  const footerHeight = () =>
    store.visible === "/" && Boolean(favoriteShortcut()) && props.anchor().y > 1 && (!inline() || menuBudget() > 1)
      ? 1
      : 0

  const height = createMemo(() => {
    const count = options().length || 1
    if (!store.visible) return Math.min(10, count)
    positionTick()
    return Math.min(
      10,
      count,
      Math.max(1, props.anchor().y - footerHeight()),
      inline() ? Math.max(1, menuBudget() - footerHeight()) : 10,
    )
  })

  let scroll: ScrollBoxRenderable | undefined
  onCleanup(() => scroll?.verticalScrollBar.off("change", syncSelectionWindow))
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))

  return (
    <box
      visible={props.visible !== false && store.visible !== false}
      position={inline() ? "relative" : "absolute"}
      top={inline() ? "auto" : position().y - height() - footerHeight()}
      left={inline() ? "auto" : position().x}
      width={inline() ? "100%" : position().width}
      flexShrink={0}
      zIndex={100}
      {...SplitBorder}
      borderColor={theme.border}
    >
      <scrollbox
        ref={(r: ScrollBoxRenderable) => {
          scroll?.verticalScrollBar.off("change", syncSelectionWindow)
          scroll = r
          scroll.verticalScrollBar.on("change", syncSelectionWindow)
        }}
        backgroundColor={theme.backgroundMenu}
        height={height()}
        scrollbarOptions={{ visible: false }}
        scrollAcceleration={scrollAcceleration()}
      >
        <Index
          each={options()}
          fallback={
            <box paddingLeft={1} paddingRight={1}>
              <text fg={theme.textMuted}>No matching items</text>
            </box>
          }
        >
          {(option, index) => (
            <box
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={index === store.selected ? theme.primary : undefined}
              flexDirection="row"
              onMouseMove={() => moveTo(index)}
              onMouseDown={() => moveTo(index)}
              onMouseUp={() => select()}
            >
              <Show when={store.visible === "/"}>
                <text fg={index === store.selected ? selectedForeground(theme) : theme.warning} flexShrink={0}>
                  {favoriteKeys().has(option().favoriteKey ?? "") ? "\u2b29 " : "  "}
                </text>
              </Show>
              <text fg={index === store.selected ? selectedForeground(theme) : kindColor(option().kind)} flexShrink={0}>
                {option().display}
              </text>
              <Show when={option().description}>
                <text
                  fg={index === store.selected ? selectedForeground(theme) : theme.textMuted}
                  wrapMode="none"
                  flexShrink={1}
                  minWidth={0}
                >
                  {" " + option().description?.replace(/\s+/g, " ").trim()}
                </text>
              </Show>
              <Show when={option().mention}>
                {(mention) => (
                  <>
                    <box flexGrow={1} minWidth={2} />
                    <text fg={index === store.selected ? selectedForeground(theme) : theme.textMuted} flexShrink={0}>
                      {mention()}
                    </text>
                  </>
                )}
              </Show>
            </box>
          )}
        </Index>
      </scrollbox>
      <Show when={footerHeight()}>
        <box backgroundColor={theme.backgroundMenu} paddingLeft={1} height={1}>
          <text fg={theme.textMuted} wrapMode="none">
            {favoriteShortcut()}{" "}
            {favoriteKeys().has(options()[store.selected]?.favoriteKey ?? "") ? "unfavorite" : "favorite"}
          </text>
        </box>
      </Show>
    </box>
  )
}

export function orderSlashFavorites(options: AutocompleteOption[], favorites: ReadonlySet<string>) {
  // Commands are already alphabetical; keep that order within each group.
  return [
    ...options.filter((option) => favorites.has(option.favoriteKey ?? "")),
    ...options.filter((option) => !favorites.has(option.favoriteKey ?? "")),
  ]
}

// Fuzzy ranking can put a longer name above the one typed in full (/thinking over /think).
export function withExactSlashFirst(ranked: AutocompleteOption[], all: AutocompleteOption[], search: string) {
  const typed = `/${search}`
  const exact = all.find(
    (option) => option.display.trimEnd().replace(/:\([^)]*\)$/, "") === typed || option.aliases?.includes(typed),
  )
  if (!exact) return ranked.slice(0, 10)
  return [exact, ...ranked.filter((option) => option !== exact)].slice(0, 10)
}
