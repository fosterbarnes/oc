import { createMemo, createSignal, onMount } from "solid-js"
import { RGBA } from "@opentui/core"
import { useLocal, moveModelFavorite, FAVORITE_CATEGORY_THEME_COLORS, isFavoriteCategoryColor } from "../context/local"
import { useTheme } from "../context/theme"
import { Locale } from "../util/locale"
import { map, pipe, flatMap, entries, filter, sortBy, take } from "remeda"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { createDialogProviderOptions, DialogProvider } from "./dialog-provider"
import { DialogVariant } from "./dialog-variant"
import * as fuzzysort from "fuzzysort"
import { useConnected } from "./use-connected"
import { useSync } from "../context/sync"
import { DialogPrompt } from "../ui/dialog-prompt"
import { useToast } from "../ui/toast"
import { useTuiConfig } from "../config"
import { stringifyKeyStroke } from "@opentui/keymap"

// Value of the "Hidden" row, so model actions can ignore it
const HIDDEN_MENU = { providerID: "", modelID: "" }

export function DialogModel(props: {
  providerID?: string
  current?: { providerID: string; modelID: string }
  highlighted?: { providerID: string; modelID: string }
  updateCurrent?: boolean
  hiddenOnly?: boolean
  onSelect?: (providerID: string, modelID: string) => void
}) {
  const local = useLocal()
  const sync = useSync()
  const dialog = useDialog()
  const [query, setQuery] = createSignal("")
  const [highlighted, setHighlighted] = createSignal(props.highlighted ?? props.current ?? local.model.current())

  const connected = useConnected()
  const providers = createDialogProviderOptions()

  const showExtra = createMemo(() => connected() && !props.providerID && !props.hiddenOnly)

  const options = createMemo(() => {
    const needle = query().trim()
    const showSections = showExtra() && needle.length === 0
    const hidden = local.model.hidden()
    const isHidden = (model: { providerID: string; modelID: string }) =>
      hidden.some((item) => item.providerID === model.providerID && item.modelID === model.modelID)
    const favorites = connected() ? local.model.favorite().filter((item) => !isHidden(item)) : []
    const recents = local.model.recent().filter((item) => !isHidden(item))

    function toOptions(items: typeof favorites, category: string) {
      if (!showSections) return []
      return items.flatMap((item) => {
        const provider = sync.data.provider.find((provider) => provider.id === item.providerID)
        if (!provider) return []
        const model = provider.models[item.modelID]
        if (!model) return []
        return [
          {
            key: item,
            value: { providerID: provider.id, modelID: model.id },
            title: model.name ?? item.modelID,
            description: provider.name,
            category,
            subcategory: category === "Favorites" ? item.category : undefined,
            subcategoryColor:
              category === "Favorites" && item.category ? local.model.favoriteCategoryColor(item.category) : undefined,
            disabled: provider.id === "opencode" && model.id.includes("-nano"),
            footer: model.cost?.input === 0 && provider.id === "opencode" ? "Free" : undefined,
            onSelect: () => {
              onSelect(provider.id, model.id)
            },
          },
        ]
      })
    }

    const favoriteOptions = toOptions(
      [
        ...favorites.filter((item) => !item.category),
        ...local.model.favoriteCategories().flatMap((name) => favorites.filter((item) => item.category === name)),
      ],
      "Favorites",
    )
    const recentOptions = toOptions(
      recents.filter(
        (item) => !favorites.some((fav) => fav.providerID === item.providerID && fav.modelID === item.modelID),
      ),
      "Recent",
    )

    const providerOptions = pipe(
      sync.data.provider,
      sortBy(
        (provider) => provider.id !== "opencode",
        (provider) => provider.name,
      ),
      flatMap((provider) =>
        pipe(
          provider.models,
          entries(),
          filter(([_, info]) => info.status !== "deprecated"),
          filter(([_, info]) => (props.providerID ? info.providerID === props.providerID : true)),
          filter(([model]) => isHidden({ providerID: provider.id, modelID: model }) === !!props.hiddenOnly),
          map(([model, info]) => ({
            value: { providerID: provider.id, modelID: model },
            title: info.name ?? model,
            releaseDate: info.release_date,
            description: favorites.some((item) => item.providerID === provider.id && item.modelID === model)
              ? "(Favorite)"
              : undefined,
            category: connected() ? provider.name : undefined,
            disabled: provider.id === "opencode" && model.includes("-nano"),
            footer: info.cost?.input === 0 && provider.id === "opencode" ? "Free" : undefined,
            onSelect() {
              onSelect(provider.id, model)
            },
          })),
          filter((option) => {
            if (!showSections) return true
            if (
              favorites.some(
                (item) => item.providerID === option.value.providerID && item.modelID === option.value.modelID,
              )
            )
              return false
            if (
              recents.some(
                (item) => item.providerID === option.value.providerID && item.modelID === option.value.modelID,
              )
            )
              return false
            return true
          }),
          (options) => sortModelOptions(options, props.providerID !== undefined),
        ),
      ),
    )

    const hiddenCount = hidden.filter(
      (item) => sync.data.provider.find((provider) => provider.id === item.providerID)?.models[item.modelID],
    ).length
    const hiddenMenu =
      showSections && hiddenCount > 0
        ? [
            {
              value: HIDDEN_MENU,
              title: `Hidden (${hiddenCount})`,
              onSelect: () => dialog.replace(() => <DialogModel {...props} hiddenOnly />, undefined, { back: reopen }),
            },
          ]
        : []

    const popularProviders = !connected()
      ? pipe(
          providers(),
          map((option) => ({
            ...option,
            category: "Popular providers",
          })),
          take(6),
        )
      : []

    if (needle) {
      return [
        ...sortModelOptions(
          fuzzysort.go(needle, providerOptions, { keys: ["title", "category"] }).map((x) => x.obj),
          false,
        ),
        ...fuzzysort.go(needle, popularProviders, { keys: ["title"] }).map((x) => x.obj),
      ]
    }

    return [...favoriteOptions, ...recentOptions, ...providerOptions, ...popularProviders, ...hiddenMenu]
  })

  const provider = createMemo(() =>
    props.providerID ? sync.data.provider.find((item) => item.id === props.providerID) : null,
  )

  const title = createMemo(() => {
    const value = provider()
    if (props.hiddenOnly) return "Hidden models"
    if (!value) return "Select model"
    return value.name
  })

  function favoriteIndex(model: { providerID: string; modelID: string }) {
    return local.model
      .favorite()
      .findIndex((item) => item.providerID === model.providerID && item.modelID === model.modelID)
  }

  function reopen() {
    dialog.replace(() => <DialogModel {...props} highlighted={highlighted()} />)
  }

  function categoryPicker(model: { providerID: string; modelID: string }, highlight?: string) {
    dialog.replace(
      () => (
        <DialogFavoriteCategory
          model={model}
          highlight={highlight}
          onDone={reopen}
          onReopen={(name) => categoryPicker(model, name)}
        />
      ),
      undefined,
      { back: reopen },
    )
  }

  function onSelect(providerID: string, modelID: string) {
    if (props.updateCurrent === false) {
      dialog.clear()
      props.onSelect?.(providerID, modelID)
      return
    }
    void local.model.select({ providerID, modelID }, { recent: true })
    props.onSelect?.(providerID, modelID)
    const list = local.model.variant.list()
    const cur = local.model.variant.selected()
    if (cur === "default" || (cur && list.includes(cur))) {
      dialog.clear()
      return
    }
    if (list.length > 0) {
      dialog.replace(() => <DialogVariant />)
      return
    }
    dialog.clear()
  }

  return (
    <DialogSelect<ReturnType<typeof options>[number]["value"]>
      options={options()}
      ref={(ref) =>
        onMount(() => {
          if (props.highlighted) setTimeout(() => ref.moveTo(props.highlighted!), 0)
        })
      }
      actions={[
        {
          command: "model.dialog.provider",
          title: connected() ? "Connect provider" : "View all providers",
          selection: "none",
          onTrigger() {
            dialog.replace(() => <DialogProvider />, undefined, { back: reopen })
          },
        },
        {
          command: "model.dialog.favorite",
          title: "Favorite",
          hidden: !connected() || props.hiddenOnly,
          onTrigger: (option) => {
            if (option.value === HIDDEN_MENU) return
            local.model.toggleFavorite(option.value as { providerID: string; modelID: string })
          },
        },
        {
          command: "model.dialog.favorite.category",
          title: "Category…",
          hidden: (option) =>
            !connected() ||
            props.hiddenOnly ||
            !option ||
            typeof option.value === "string" ||
            favoriteIndex(option.value) < 0,
          onTrigger: (option) => {
            if (typeof option.value === "string") return
            setHighlighted(option.value)
            categoryPicker(option.value)
          },
        },
        {
          command: "model.dialog.favorite.move_up",
          title: "Move favorite up",
          hidden: (option) => {
            if (query().trim() || !option || typeof option.value === "string") return true
            return favoriteIndex(option.value) < 0
          },
          disabled: (option) => {
            if (!option || typeof option.value === "string") return true
            const favorites = local.model.favorite()
            return moveModelFavorite(favorites, option.value, -1, local.model.favoriteCategories()) === favorites
          },
          onTrigger: (option) => {
            if (typeof option.value === "string") return
            local.model.moveFavorite(option.value, -1)
          },
        },
        {
          command: "model.dialog.favorite.move_down",
          title: "Move favorite down",
          hidden: (option) => {
            if (query().trim() || !option || typeof option.value === "string") return true
            return favoriteIndex(option.value) < 0
          },
          disabled: (option) => {
            if (!option || typeof option.value === "string") return true
            const favorites = local.model.favorite()
            return moveModelFavorite(favorites, option.value, 1, local.model.favoriteCategories()) === favorites
          },
          onTrigger: (option) => {
            if (typeof option.value === "string") return
            local.model.moveFavorite(option.value, 1)
          },
        },
        {
          command: "model.dialog.hide",
          title: props.hiddenOnly ? "Unhide" : "Hide",
          hidden: !connected(),
          onTrigger: (option) => {
            if (option.value === HIDDEN_MENU) return
            local.model.toggleHidden(option.value as { providerID: string; modelID: string })
          },
        },
      ]}
      onFilter={setQuery}
      onMove={(option) => {
        if (typeof option.value !== "string" && option.value !== HIDDEN_MENU) setHighlighted(option.value)
      }}
      preserveSelection={true}
      flat={true}
      skipFilter={true}
      title={title()}
      current={props.current ?? local.model.current()}
    />
  )
}

// Value of the row that creates a category from the search text
type CreateCategory = { create: string }

// One-screen category picker for a favorite: Enter assigns, footer keys edit the highlighted category
function DialogFavoriteCategory(props: {
  model: { providerID: string; modelID: string }
  highlight?: string
  onDone: () => void
  onReopen: (highlight?: string) => void
}) {
  const local = useLocal()
  const sync = useSync()
  const dialog = useDialog()
  const toast = useToast()
  const tuiConfig = useTuiConfig()
  const { theme } = useTheme()
  const [query, setQuery] = createSignal("")
  const [toDelete, setToDelete] = createSignal<string>()
  // Static config lookup, as in the session list, so row titles never track the binding layer
  const deleteHint = createMemo(() => {
    const key = tuiConfig.keybinds.get("dialog.model_category.delete")[0]?.key
    return !key ? "" : typeof key === "string" ? key : stringifyKeyStroke(key)
  })
  const modelName =
    sync.data.provider.find((provider) => provider.id === props.model.providerID)?.models[props.model.modelID]?.name ??
    props.model.modelID
  const assigned = createMemo(
    () =>
      local.model
        .favorite()
        .find((item) => item.providerID === props.model.providerID && item.modelID === props.model.modelID)?.category ??
      "",
  )

  function count(category?: string) {
    const total = local.model.favorite().filter((item) => item.category === category).length
    return `${total} ${total === 1 ? "model" : "models"}`
  }

  const options = createMemo<DialogSelectOption<string | CreateCategory>[]>(() => {
    const needle = query().trim()
    const categories = local.model.favoriteCategories()
    const rows: DialogSelectOption<string | CreateCategory>[] = [
      { title: "None", value: "", footer: count() },
      ...categories.map((category) => {
        const deleting = toDelete() === category
        return {
          title: deleting ? `Press ${deleteHint()} again to delete ${category}` : category,
          bg: deleting ? theme.error : undefined,
          value: category,
          footer: (
            <>
              {count(category)}{" "}
              <span style={{ fg: local.model.favoriteCategoryColor(category) ?? theme.accent }}>■■■</span>
            </>
          ),
        }
      }),
    ]
    if (!needle) return rows
    const matches = fuzzysort.go(needle, rows, { key: "title" }).map((result) => result.obj)
    if (categories.some((category) => category.toLowerCase() === needle.toLowerCase())) return matches
    return [{ title: `Create "${needle}"`, value: { create: needle } }, ...matches]
  })

  function assign(category?: string) {
    local.model.assignFavoriteCategory(props.model, category)
    props.onDone()
  }

  function select(value: string | CreateCategory) {
    if (typeof value === "string") return assign(value || undefined)
    const error = local.model.renameFavoriteCategory(undefined, value.create)
    if (error) return toast.show({ message: error, variant: "warning" })
    assign(value.create)
  }

  function rename(category: string) {
    dialog.replace(
      () => (
        <DialogPrompt
          title={`Rename ${category}`}
          value={category}
          placeholder="Category name"
          onConfirm={(input) => {
            const error = local.model.renameFavoriteCategory(category, input)
            if (error) return toast.show({ message: error, variant: "warning" })
            props.onReopen(input.trim())
          }}
        />
      ),
      undefined,
      { back: () => props.onReopen(category) },
    )
  }

  function colorPicker(category: string) {
    const back = () => props.onReopen(category)
    const current = local.model.favoriteCategoryColors()[category] ?? ""
    const choose = (color?: string) => {
      local.model.setFavoriteCategoryColor(category, color)
      back()
    }
    dialog.replace(
      () => (
        <DialogSelect
          title={`Color for ${category}`}
          renderFilter={false}
          current={current.startsWith("#") ? "custom" : current}
          options={[
            {
              title: "Default",
              value: "",
              footer: <span style={{ fg: theme.accent }}>■■■</span>,
              onSelect: () => choose(),
            },
            ...FAVORITE_CATEGORY_THEME_COLORS.map((color) => ({
              title: Locale.titlecase(color),
              value: color,
              footer: <span style={{ fg: theme[color as keyof typeof theme] as RGBA }}>■■■</span>,
              onSelect: () => choose(color),
            })),
            {
              title: "Custom hex…",
              value: "custom",
              footer: current.startsWith("#") ? (
                <span style={{ fg: RGBA.fromHex(current) }}>{current}</span>
              ) : undefined,
              onSelect: () =>
                dialog.replace(
                  () => (
                    <DialogPrompt
                      title={`Color for ${category}`}
                      value={current.startsWith("#") ? current : undefined}
                      placeholder="#rrggbb"
                      onConfirm={(input) => {
                        const color = input.trim()
                        if (!isFavoriteCategoryColor(color) || !color.startsWith("#"))
                          return toast.show({ message: "Enter a hex color like #a78bfa", variant: "warning" })
                        choose(color)
                      }}
                    />
                  ),
                  undefined,
                  { back: () => colorPicker(category) },
                ),
            },
          ]}
        />
      ),
      undefined,
      { back },
    )
  }

  function remove(category: string) {
    if (toDelete() !== category) return setToDelete(category)
    setToDelete(undefined)
    local.model.deleteFavoriteCategory(category)
  }

  const isCategory = (option?: DialogSelectOption<string | CreateCategory>) =>
    typeof option?.value === "string" && option.value !== ""
  const atEdge = (option: DialogSelectOption<string | CreateCategory> | undefined, direction: -1 | 1) => {
    const categories = local.model.favoriteCategories()
    const next = categories.indexOf(option?.value as string) + direction
    return next < 0 || next >= categories.length
  }

  return (
    <DialogSelect<string | CreateCategory>
      title={`Category for ${modelName}`}
      placeholder="Search or create a category"
      options={options()}
      skipFilter
      preserveSelection
      current={assigned()}
      onFilter={setQuery}
      onMove={() => setToDelete(undefined)}
      onSelect={(option) => select(option.value)}
      ref={(ref) =>
        onMount(() => {
          if (props.highlight !== undefined) setTimeout(() => ref.moveTo(props.highlight!), 0)
        })
      }
      actions={[
        {
          command: "dialog.model_category.rename",
          title: "rename",
          hidden: (option) => !isCategory(option),
          onTrigger: (option) => rename(option.value as string),
        },
        {
          command: "dialog.model_category.color",
          title: "color",
          hidden: (option) => !isCategory(option),
          onTrigger: (option) => colorPicker(option.value as string),
        },
        {
          command: "dialog.model_category.move_up",
          title: "move up",
          hidden: (option) => !isCategory(option) || query().trim() !== "",
          disabled: (option) => atEdge(option, -1),
          onTrigger: (option) => local.model.moveFavoriteCategory(option.value as string, -1),
        },
        {
          command: "dialog.model_category.move_down",
          title: "move down",
          hidden: (option) => !isCategory(option) || query().trim() !== "",
          disabled: (option) => atEdge(option, 1),
          onTrigger: (option) => local.model.moveFavoriteCategory(option.value as string, 1),
        },
        {
          command: "dialog.model_category.delete",
          title: "delete",
          hidden: (option) => !isCategory(option),
          onTrigger: (option) => remove(option.value as string),
        },
      ]}
    />
  )
}

export function sortModelOptions<T extends { footer?: string; releaseDate: string | number; title: string }>(
  options: T[],
  newestFirst: boolean,
) {
  if (newestFirst) return sortBy(options, [(option) => option.releaseDate, "desc"], (option) => option.title)
  return sortBy(
    options,
    (option) => option.footer !== "Free",
    [(option) => option.releaseDate, "desc"],
    (option) => option.title,
  )
}
