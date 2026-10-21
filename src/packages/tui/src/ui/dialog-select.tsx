import {
  CliRenderEvents,
  InputRenderable,
  RGBA,
  ScrollBoxRenderable,
  TextAttributes,
  type KeyEvent,
  type Renderable,
} from "@opentui/core"
import type { Binding } from "@opentui/keymap"
import { useTheme, selectedForeground } from "../context/theme"
import { entries, filter, flatMap, groupBy, pipe } from "remeda"
import { batch, createEffect, createMemo, createSignal, For, Show, type JSX, on, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import * as fuzzysort from "fuzzysort"
import { isDeepEqual } from "remeda"
import { useDialog, type DialogContext } from "./dialog"
import { Locale } from "../util/locale"
import { getScrollAcceleration } from "../util/scroll"
import { useTuiConfig } from "../config"
import { formatKeyBindings, useBindings, useKeymapSelector } from "../keymap"

export interface DialogSelectProps<T> {
  title: string
  titleView?: JSX.Element
  filterFooter?: JSX.Element
  placeholder?: string
  footer?: JSX.Element
  emptyView?: JSX.Element
  noMatchView?: JSX.Element
  options: DialogSelectOption<T>[]
  flat?: boolean
  /** Keep category headings above subcategory headings, with a blank line between subcategories. */
  nested?: boolean
  ref?: (ref: DialogSelectRef<T>) => void
  onMove?: (option: DialogSelectOption<T>) => void
  onFilter?: (query: string) => void
  onSelect?: (option: DialogSelectOption<T>) => void
  skipFilter?: boolean
  /** Replaces the built-in fuzzy filter: returns matches in display order, listed flat. */
  search?: (query: string) => DialogSelectOption<T>[]
  renderFilter?: boolean
  locked?: boolean
  preserveSelection?: boolean
  actions?: DialogSelectAction<T>[]
  footerHints?: {
    title: string
    label: string
    side?: "left" | "right"
  }[]
  bindings?: readonly Binding<Renderable, KeyEvent>[]
  /**
   * Commands registered on this dialog layer even when no row is selected.
   * Row-action filtering does not apply to these bindings.
   */
  commands?: {
    name: string
    title: string
    category: string
    run: () => void
  }[]
  commandBindings?: readonly Binding<Renderable, KeyEvent>[]
  current?: T
}

type DialogSelectActionBase<T> = {
  command: string
  title: string
  /** Key for commands without a config keybind (plugin dialog actions). */
  bind?: string
  side?: "left" | "right"
  hidden?: boolean | ((option: DialogSelectOption<T> | undefined) => boolean)
  disabled?: boolean | ((option: DialogSelectOption<T> | undefined) => boolean)
}

type DialogSelectAction<T> =
  | (DialogSelectActionBase<T> & {
      selection?: "required"
      onTrigger: (option: DialogSelectOption<T>) => void
    })
  | (DialogSelectActionBase<T> & {
      selection: "none"
      onTrigger: () => void
    })

export interface DialogSelectOption<T = any> {
  title: string
  titleView?: JSX.Element
  value: T
  description?: string
  details?: string[]
  detailsColor?: RGBA
  detailsWrap?: boolean
  footer?: JSX.Element | string
  titleWidth?: number
  truncateTitle?: boolean | "left"
  category?: string
  subcategory?: string
  subcategoryColor?: RGBA
  categoryView?: JSX.Element
  disabled?: boolean
  /** Shown but never selected, hovered, or clicked (read-only info rows). */
  inert?: boolean
  bg?: RGBA
  gutter?: (color: RGBA) => JSX.Element
  margin?: JSX.Element
  onSelect?: (ctx: DialogContext) => void
}

export type DialogSelectRef<T> = {
  filter: string
  filtered: DialogSelectOption<T>[]
  selected: DialogSelectOption<T> | undefined
  moveTo(value: T): void
}

export function DialogSelect<T>(props: DialogSelectProps<T>) {
  type Action = NonNullable<DialogSelectProps<T>["actions"]>[number]
  type FooterHint = NonNullable<DialogSelectProps<T>["footerHints"]>[number]
  type VisibleAction = (Action & { label: string }) | FooterHint

  const dialog = useDialog()
  const renderer = useRenderer()
  const memory = dialog.stack.at(-1)?.selection
  const restored = memory?.[0]()
  // The memory belongs to this dialog entry, so its value is one of this picker's options.
  const restoredValue = restored?.value as T | undefined
  const { theme } = useTheme()
  const tuiConfig = useTuiConfig()
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))

  const [store, setStore] = createStore({
    selected: 0,
    filter: restored?.filter ?? "",
  })
  const [focusedAction, setFocusedAction] = createSignal<number>()
  const actionFocused = createMemo(() => focusedAction() !== undefined)
  let selection: { value: T; category?: string; subcategory?: string } | undefined
  let resetSelection = false
  let pendingScroll: (() => void) | undefined

  function cancelScroll() {
    if (!pendingScroll) return
    renderer.off(CliRenderEvents.FRAME, pendingScroll)
    pendingScroll = undefined
  }

  // Rows rebuilt after mount have no layout until the next drawn frame.
  function scrollAfterLayout(center: boolean, value: T) {
    cancelScroll()
    pendingScroll = () => {
      pendingScroll = undefined
      if (!isDeepEqual(selected()?.value, value)) return
      scrollToSelection(center)
    }
    renderer.once(CliRenderEvents.FRAME, pendingScroll)
    renderer.requestRender()
  }

  createEffect(
    on(
      () => restoredValue ?? props.current,
      (current) => {
        if (current !== undefined) {
          const currentIndex = flat().findIndex((opt) => isDeepEqual(opt.value, current))
          if (currentIndex >= 0) {
            setStore("selected", currentIndex)
            selection = flat()[currentIndex]
          }
        }
      },
    ),
  )

  let input: InputRenderable

  const actions = createMemo(() => props.actions ?? [])
  const actionBindings = useKeymapSelector((keymap) =>
    keymap.getCommandBindings({
      visibility: "registered",
      commands: actions().map((item) => item.command),
    }),
  )

  const filtered = createMemo(() => {
    if (props.search) return props.search(store.filter).filter((x) => x.disabled !== true)
    if (props.skipFilter || props.renderFilter === false) return props.options.filter((x) => x.disabled !== true)
    const needle = store.filter.toLowerCase()
    const options = pipe(
      props.options,
      filter((x) => x.disabled !== true),
    )
    if (!needle) return options

    // prioritize title matches (weight: 2) over category matches (weight: 1).
    // users typically search by the item name, and not its category.
    const result = fuzzysort
      .go(needle, options, {
        keys: ["title", "category"],
        scoreFn: (r) => r[0].score * 2 + r[1].score,
      })
      .map((x) => x.obj)

    return result
  })

  createEffect(() => {
    filtered()
    setFocusedAction(undefined)
  })

  const flatten = createMemo(() => props.search !== undefined || (props.flat && store.filter.length > 0))

  const grouped = createMemo<[string, DialogSelectOption<T>[]][]>(() => {
    if (flatten()) return filtered().length ? [["", filtered()]] : []
    const result = pipe(
      filtered(),
      groupBy((x) => x.category ?? ""),
      // mapValues((x) => x.sort((a, b) => a.title.localeCompare(b.title))),
      entries(),
    )
    return result
  })

  const flat = createMemo(() => {
    return pipe(
      grouped(),
      flatMap(([_, options]) => options),
      filter((option) => !option.inert),
    )
  })

  // A category whose rows all sit in subcategories shows only the subcategory headings unless nested
  function hasHeading(category: string, options: DialogSelectOption<T>[]) {
    return !!category && (props.nested || !options.every((option) => option.subcategory))
  }

  const rows = createMemo(() => {
    const headers = grouped().reduce((acc, [category, options], i) => {
      if (!category) return acc
      return acc + (i > 0 ? 1 : 0) + (hasHeading(category, options) ? 1 : 0)
    }, 0)
    return grouped().reduce(
      (total, [_, options]) =>
        total +
        options.reduce(
          (acc, option, index) =>
            acc +
            1 +
            (option.details?.length ?? 0) +
            (!flatten() && option.subcategory && option.subcategory !== options[index - 1]?.subcategory
              ? props.nested && index > 0
                ? 2
                : 1
              : 0),
          0,
        ),
      headers,
    )
  })

  const dimensions = useTerminalDimensions()
  const height = createMemo(() => Math.min(rows(), Math.floor(dimensions().height / 2) - 6))

  const selected = createMemo(() => flat()[store.selected])
  onCleanup(() => memory?.[1]({ filter: store.filter, value: selected()?.value }))

  const shownActions = createMemo(() =>
    actions().filter((item) => !(typeof item.hidden === "function" ? item.hidden(selected()) : item.hidden)),
  )
  const actionLabels = createMemo(() => {
    const labels = new Map<string, string>()

    for (const action of shownActions()) {
      const label = formatKeyBindings(actionBindings().get(action.command), tuiConfig)
      if (label) labels.set(action.command, label)
    }

    return labels
  })
  const visibleActions = createMemo(() => [
    ...shownActions()
      .map((item) => ({ ...item, label: actionLabels().get(item.command) ?? "" }))
      .filter((item) => item.label),
    ...(props.footerHints ?? []),
  ])
  const actionItems = createMemo(() =>
    visibleActions()
      .filter(isActionItem)
      .filter((item) => !isActionDisabled(item)),
  )

  createEffect(() => {
    const index = focusedAction()
    if (index !== undefined && index >= actionItems().length) setFocusedAction(undefined)
  })

  createEffect(
    on(
      () => props.options,
      () => {
        if (!props.preserveSelection && props.current === undefined) {
          const next = Math.min(store.selected, flat().length - 1)
          if (next >= 0 && next !== store.selected) setStore("selected", next)
          return
        }
        if (resetSelection && store.filter.length > 0) {
          const option = flat()[0]
          if (!option) return
          setStore("selected", 0)
          selection = option
          return
        }
        if (!selection) {
          if (props.current !== undefined) {
            const index = flat().findIndex((option) => isDeepEqual(option.value, props.current))
            if (index >= 0) {
              setStore("selected", index)
              selection = flat()[index]
              return
            }
          }
          const option = selected()
          if (!option) return
          selection = option
          return
        }
        const previous = selection
        const index = flat().findIndex((option) => isDeepEqual(option.value, previous.value))
        if (index >= 0) {
          const option = flat()[index]
          const moved =
            index !== store.selected ||
            option.category !== previous.category ||
            option.subcategory !== previous.subcategory
          setStore("selected", index)
          selection = option
          if (!moved) return
          if ((!props.preserveSelection && props.current === undefined) || store.filter.length > 0) return
          scrollAfterLayout(false, option.value)
          return
        }
        const next = Math.min(store.selected, flat().length - 1)
        if (next < 0) return
        setStore("selected", next)
        selection = flat()[next]
      },
    ),
  )
  onCleanup(cancelScroll)

  createEffect(
    on([() => store.filter, () => restoredValue ?? props.current], ([filter, current], previous) => {
      if (filter.length > 0) resetSelection = true
      // A restored filter keeps the restored row on mount; later filter edits jump to the top.
      if (filter.length > 0 && (previous !== undefined || restoredValue === undefined)) {
        const option = flat()[0]
        if (!option) return
        moveTo(0, true, false)
        scrollAfterLayout(true, option.value)
        return
      }
      if (current === undefined) return
      const currentIndex = flat().findIndex((opt) => isDeepEqual(opt.value, current))
      if (currentIndex < 0) return
      moveTo(currentIndex, true)
      scrollAfterLayout(true, current)
    }),
  )

  function move(direction: number) {
    if (props.locked) return
    if (flat().length === 0) return
    let next = store.selected + direction
    if (next < 0) next = flat().length - 1
    if (next >= flat().length) next = 0
    moveTo(next, true)
  }

  function moveTo(next: number, center = false, preserve = true) {
    if (next < 0 || next >= flat().length) return
    // An explicit move supersedes any deferred scroll still waiting for layout.
    cancelScroll()
    setFocusedAction(undefined)
    setStore("selected", next)
    const option = selected()
    if (option) {
      selection = option
      resetSelection = !preserve
    }
    if (option) props.onMove?.(option)
    scrollToSelection(center)
  }

  function scrollToSelection(center: boolean) {
    if (!scroll) return
    let remaining = store.selected
    let index = 0
    // Locate the row by position because a unique renderable ID cannot currently be ensured.
    outer: for (const [category, options] of grouped()) {
      if (hasHeading(category, options)) index++
      for (const [row, option] of options.entries()) {
        if (!flatten() && option.subcategory && option.subcategory !== options[row - 1]?.subcategory) index++
        if (!option.inert) {
          if (remaining === 0) break outer
          remaining--
        }
        index++
      }
    }
    const target = scroll.getChildren()[index]
    if (!target) return
    // Yoga layout, not target.y: viewport culling leaves off-screen rows at y=0 until drawn.
    const y = target.getLayoutNode().getComputedTop() - scroll.scrollTop
    if (center) {
      const centerOffset = Math.floor(scroll.height / 2)
      scroll.scrollBy(y - centerOffset)
    } else {
      if (y >= scroll.height) {
        scroll.scrollBy(y - scroll.height + 1)
      }
      if (y < 0) {
        scroll.scrollBy(y)
        const first = flat()[0]
        if (first && isDeepEqual(first.value, selected()?.value)) {
          scroll.scrollTo(0)
        }
      }
    }
  }

  function submit() {
    if (props.locked) return
    const index = focusedAction()
    if (index !== undefined) {
      trigger(actionItems()[index])
      return
    }
    const option = selected()
    if (!option) return
    option.onSelect?.(dialog)
    props.onSelect?.(option)
  }

  function moveAction(direction: 1 | -1) {
    if (props.locked) return
    const total = actionItems().length
    if (total === 0) return
    setFocusedAction((index) => {
      if (index === undefined) return direction === 1 ? 0 : total - 1
      const next = index + direction
      return next < 0 || next >= total ? undefined : next
    })
  }

  useBindings(() => {
    const visible = shownActions()

    return {
      mode: "modal",
      // Dialog actions must win over input handling while the filter is focused.
      priority: 1,
      commands: [
        {
          name: "dialog.select.prev",
          title: "Previous item",
          category: "Dialog",
          run() {
            move(-1)
          },
        },
        {
          name: "dialog.select.next",
          title: "Next item",
          category: "Dialog",
          run() {
            move(1)
          },
        },
        {
          name: "dialog.select.page_up",
          title: "Page up",
          category: "Dialog",
          run() {
            move(-10)
          },
        },
        {
          name: "dialog.select.page_down",
          title: "Page down",
          category: "Dialog",
          run() {
            move(10)
          },
        },
        {
          name: "dialog.select.home",
          title: "First item",
          category: "Dialog",
          run() {
            if (props.locked) return
            moveTo(0)
          },
        },
        {
          name: "dialog.select.end",
          title: "Last item",
          category: "Dialog",
          run() {
            if (props.locked) return
            moveTo(flat().length - 1)
          },
        },
        {
          name: "dialog.select.submit",
          title: "Select item",
          category: "Dialog",
          run: submit,
        },
        ...visible.map((item) => ({
          name: item.command,
          title: item.title,
          category: "Dialog",
          run: () => trigger(item),
        })),
        ...(props.commands ?? []),
      ],
      bindings: [
        ...tuiConfig.keybinds.gather("dialog.select", [
          "dialog.select.prev",
          "dialog.select.next",
          "dialog.select.page_up",
          "dialog.select.page_down",
          "dialog.select.home",
          "dialog.select.end",
          "dialog.select.submit",
        ]),
        ...visible.flatMap((item) =>
          item.bind ? [{ key: item.bind, cmd: item.command }] : tuiConfig.keybinds.get(item.command),
        ),
        ...(visible.length
          ? [
              {
                key: "tab",
                desc: "Next dialog action",
                group: "Dialog",
                cmd: () => moveAction(1),
              },
              {
                key: "shift+tab",
                desc: "Previous dialog action",
                group: "Dialog",
                cmd: () => moveAction(-1),
              },
            ]
          : []),
        ...(props.bindings ?? []).filter((binding) => {
          if (typeof binding.cmd !== "string") return true
          return visible.some((item) => item.command === binding.cmd)
        }),
        ...(props.commandBindings ?? []),
      ],
    }
  })

  let scroll: ScrollBoxRenderable | undefined
  const ref: DialogSelectRef<T> = {
    get filter() {
      return store.filter
    },
    get filtered() {
      return filtered()
    },
    get selected() {
      return selected()
    },
    moveTo(value) {
      const index = flat().findIndex((option) => isDeepEqual(option.value, value))
      if (index >= 0) moveTo(index, true)
    },
  }
  props.ref?.(ref)

  const left = createMemo(() => visibleActions().filter((item) => item.side !== "right"))
  const right = createMemo(() => visibleActions().filter((item) => item.side === "right"))

  function trigger(item: Action | undefined) {
    if (props.locked || !item || isActionDisabled(item)) return
    if (item.selection === "none") {
      item.onTrigger()
      return
    }
    const option = selected()
    if (!option) return
    item.onTrigger(option)
  }

  function isActionItem(item: VisibleAction): item is Action & { label: string } {
    return "onTrigger" in item
  }

  function isActionDisabled(item: Action) {
    const option = selected()
    if (item.selection !== "none" && !option) return true
    return typeof item.disabled === "function" ? item.disabled(option) : item.disabled
  }

  function isActionFocused(item: VisibleAction) {
    if (props.locked) return false
    if (!isActionItem(item)) return false
    return actionItems().indexOf(item) === focusedAction()
  }

  function FooterAction(action: { item: VisibleAction }) {
    if (!isActionItem(action.item))
      return (
        <box flexDirection="column" flexShrink={0}>
          <text fg={theme.text} attributes={TextAttributes.BOLD} wrapMode="none">
            {action.item.title}
          </text>
          <text fg={theme.textMuted} wrapMode="none">
            {action.item.label}
          </text>
        </box>
      )
    const item = action.item
    const active = createMemo(() => isActionFocused(item))
    const disabled = createMemo(() => isActionDisabled(item))
    const fg = selectedForeground(theme)
    return (
      <box
        flexDirection="column"
        flexShrink={0}
        backgroundColor={active() ? theme.primary : RGBA.fromInts(0, 0, 0, 0)}
        onMouseUp={() => trigger(item)}
      >
        <text
          fg={disabled() ? theme.textMuted : active() ? fg : theme.text}
          attributes={active() ? TextAttributes.BOLD : undefined}
          wrapMode="none"
        >
          {item.title}
        </text>
        <text fg={disabled() ? theme.textMuted : active() ? fg : theme.textMuted} wrapMode="none">
          {item.label}
        </text>
      </box>
    )
  }

  return (
    <box gap={1} paddingBottom={1} flexGrow={1}>
      <box paddingLeft={4} paddingRight={4}>
        <box flexDirection="row" justifyContent="space-between">
          {props.titleView ?? (
            <text fg={theme.text} attributes={TextAttributes.BOLD}>
              {props.title}
            </text>
          )}
          <text fg={theme.textMuted} onMouseUp={() => dialog.escape()}>
            esc
          </text>
        </box>
        <Show when={props.renderFilter !== false}>
          <box paddingTop={1}>
            <input
              value={store.filter}
              onInput={(e) => {
                if (props.locked) return
                batch(() => {
                  setStore("filter", e)
                  props.onFilter?.(e)
                })
              }}
              focusedBackgroundColor={theme.backgroundPanel}
              cursorColor={theme.primary}
              cursorStyle={tuiConfig.cursor}
              focusedTextColor={theme.textMuted}
              ref={(r) => {
                input = r
                input.traits = { status: "FILTER" }
                setTimeout(() => {
                  if (!input) return
                  if (input.isDestroyed) return
                  input.focus()
                }, 1)
              }}
              placeholder={props.placeholder ?? "Search"}
              placeholderColor={theme.textMuted}
            />
          </box>
        </Show>
        <Show when={props.filterFooter}>
          <box paddingTop={1}>{props.filterFooter}</box>
        </Show>
      </box>
      <box flexGrow={1} flexShrink={1}>
        <Show
          when={grouped().length > 0}
          fallback={
            <Show
              when={props.renderFilter !== false && store.filter.length > 0}
              fallback={
                props.emptyView ?? (
                  <box paddingLeft={4} paddingRight={4} paddingTop={1}>
                    <text fg={theme.textMuted}>No items available</text>
                  </box>
                )
              }
            >
              {props.noMatchView ?? (
                <box paddingLeft={4} paddingRight={4} paddingTop={1}>
                  <text fg={theme.textMuted}>No results found</text>
                </box>
              )}
            </Show>
          }
        >
          <scrollbox
            paddingLeft={1}
            paddingRight={1}
            scrollbarOptions={{ visible: false }}
            scrollAcceleration={scrollAcceleration()}
            ref={(r: ScrollBoxRenderable) => (scroll = r)}
            maxHeight={height()}
          >
            <For each={grouped()}>
              {([category, options], index) => (
                <>
                  <Show when={hasHeading(category, options)}>
                    <box paddingTop={index() > 0 ? 1 : 0} paddingLeft={3}>
                      <Show
                        when={options[0]?.categoryView}
                        fallback={
                          <text fg={theme.accent} attributes={TextAttributes.BOLD}>
                            {category}
                          </text>
                        }
                      >
                        {options[0]?.categoryView}
                      </Show>
                    </box>
                  </Show>
                  <For each={options}>
                    {(option, row) => {
                      const active = createMemo(() => !props.locked && isDeepEqual(option.value, selected()?.value))
                      const current = createMemo(() => isDeepEqual(option.value, props.current))
                      return (
                        <>
                          <Show
                            when={
                              !flatten() && option.subcategory && option.subcategory !== options[row() - 1]?.subcategory
                            }
                          >
                            <box
                              paddingTop={
                                (row() === 0 && index() > 0 && !hasHeading(category, options)) ||
                                (props.nested && row() > 0)
                                  ? 1
                                  : 0
                              }
                              paddingLeft={3}
                            >
                              <text fg={option.subcategoryColor ?? theme.accent} attributes={TextAttributes.BOLD}>
                                {option.subcategory}
                              </text>
                            </box>
                          </Show>
                          <box
                            flexDirection="column"
                            position="relative"
                            onMouseMove={() => {
                              if (props.locked) return
                              setFocusedAction(undefined)
                              const index = flat().findIndex((x) => isDeepEqual(x.value, option.value))
                              if (index === -1 || index === store.selected) return
                              moveTo(index)
                            }}
                            onMouseUp={() => {
                              if (props.locked || option.inert) return
                              option.onSelect?.(dialog)
                              props.onSelect?.(option)
                            }}
                            onMouseDown={() => {
                              if (props.locked) return
                              const index = flat().findIndex((x) => isDeepEqual(x.value, option.value))
                              if (index === -1) return
                              moveTo(index)
                            }}
                          >
                            <box
                              flexDirection="row"
                              paddingLeft={current() || option.gutter ? 1 : 3}
                              paddingRight={3}
                              gap={1}
                              backgroundColor={
                                active()
                                  ? actionFocused()
                                    ? theme.backgroundElement
                                    : (option.bg ?? theme.primary)
                                  : RGBA.fromInts(0, 0, 0, 0)
                              }
                            >
                              <Show when={!current() && option.margin}>
                                <box position="absolute" left={1} flexShrink={0}>
                                  {option.margin}
                                </box>
                              </Show>
                              <Option
                                title={option.title}
                                titleView={option.titleView}
                                footer={flatten() ? (option.category ?? option.footer) : option.footer}
                                titleWidth={option.titleWidth}
                                truncateTitle={option.truncateTitle}
                                description={option.description !== category ? option.description : undefined}
                                active={active()}
                                current={current()}
                                muted={actionFocused()}
                                gutter={option.gutter}
                              />
                            </box>
                            <For each={option.details}>
                              {(detail) => (
                                <box paddingLeft={3} paddingRight={3}>
                                  <text
                                    fg={option.detailsColor ?? theme.textMuted}
                                    wrapMode={option.detailsWrap ? "word" : "none"}
                                  >
                                    {option.detailsWrap
                                      ? detail
                                      : Locale.truncateMiddle(
                                          detail,
                                          Math.max(1, Math.min(76, dimensions().width - 12)),
                                        )}
                                  </text>
                                </box>
                              )}
                            </For>
                          </box>
                        </>
                      )
                    }}
                  </For>
                </>
              )}
            </For>
          </scrollbox>
        </Show>
      </box>
      <Show when={props.footer || visibleActions().length} fallback={<box flexShrink={0} />}>
        <box
          paddingRight={2}
          paddingLeft={4}
          flexDirection="row"
          flexWrap="wrap"
          rowGap={1}
          justifyContent="space-between"
          flexShrink={0}
        >
          <box flexDirection="row" flexWrap="wrap" gap={2} rowGap={1} maxWidth="100%">
            {props.footer}
            <For each={left()}>{(item) => <FooterAction item={item} />}</For>
          </box>
          <box flexDirection="row" flexWrap="wrap" gap={2} rowGap={1} maxWidth="100%">
            <For each={right()}>{(item) => <FooterAction item={item} />}</For>
          </box>
        </box>
      </Show>
    </box>
  )
}

function Option(props: {
  title: string
  titleView?: JSX.Element
  description?: string
  active?: boolean
  current?: boolean
  muted?: boolean
  footer?: JSX.Element | string
  titleWidth?: number
  truncateTitle?: boolean | "left"
  gutter?: (color: RGBA) => JSX.Element
  onMouseOver?: () => void
}) {
  const { theme } = useTheme()
  const fg = selectedForeground(theme)
  const text = createMemo(() => {
    if (props.active && !props.muted) return fg
    if (props.muted && (props.active || props.current)) return theme.textMuted
    if (props.current) return theme.primary
    return theme.text
  })

  return (
    <>
      <Show when={props.current && !props.gutter}>
        <text flexShrink={0} fg={text()} marginRight={0}>
          ●
        </text>
      </Show>
      <Show when={props.gutter}>
        <box flexShrink={0} marginRight={0}>
          {props.gutter?.(text())}
        </box>
      </Show>
      <text
        flexGrow={1}
        fg={text()}
        attributes={props.active && !props.muted ? TextAttributes.BOLD : undefined}
        overflow="hidden"
        wrapMode="none"
        paddingLeft={3}
      >
        {props.titleView ??
          (props.truncateTitle === false
            ? props.title
            : props.truncateTitle === "left"
              ? Locale.truncateLeft(props.title, props.titleWidth ?? 61)
              : Locale.truncate(props.title, props.titleWidth ?? 61))}
        <Show when={props.description}>
          <span style={{ fg: props.active && !props.muted ? fg : theme.textMuted }}> {props.description}</span>
        </Show>
      </text>
      <Show when={props.footer}>
        <box flexShrink={0}>
          <text fg={props.active && !props.muted ? fg : theme.textMuted}>{props.footer}</text>
        </box>
      </Show>
    </>
  )
}
