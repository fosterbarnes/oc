import { createMemo, createSignal, onMount } from "solid-js"
import { useLocal, moveModelFavorite } from "../context/local"
import { map, pipe, flatMap, entries, filter, sortBy, take } from "remeda"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { createDialogProviderOptions, DialogProvider } from "./dialog-provider"
import { DialogVariant } from "./dialog-variant"
import * as fuzzysort from "fuzzysort"
import { useConnected } from "./use-connected"
import { useSync } from "../context/sync"
import { DialogPrompt } from "../ui/dialog-prompt"
import { useToast } from "../ui/toast"

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
  const toast = useToast()
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

  function categoryPicker(model: { providerID: string; modelID: string }) {
    const back = () => categoryPicker(model)
    dialog.replace(
      () => (
        <DialogSelect<string | { action: string }>
          title="Favorite category"
          current={
            local.model
              .favorite()
              .find((item) => item.providerID === model.providerID && item.modelID === model.modelID)?.category ?? ""
          }
          options={[
            { title: "No category", value: "", onSelect: () => assign() },
            ...local.model
              .favoriteCategories()
              .map((name) => ({ title: name, value: name, onSelect: () => assign(name) })),
            {
              title: "New category…",
              value: { action: "new" },
              onSelect: () => editCategory(undefined, (name) => assign(name), back),
            },
            { title: "Manage categories…", value: { action: "manage" }, onSelect: () => manageCategories(back) },
          ]}
        />
      ),
      undefined,
      { back: reopen },
    )
    function assign(name?: string) {
      local.model.assignFavoriteCategory(model, name)
      reopen()
    }
  }

  function editCategory(previous: string | undefined, done: (name: string) => void, back: () => void) {
    dialog.replace(
      () => (
        <DialogPrompt
          title={previous === undefined ? "New category" : "Rename category"}
          value={previous}
          placeholder="Category name"
          onConfirm={(input) => {
            const error = local.model.renameFavoriteCategory(previous, input)
            if (error) return toast.show({ message: error, variant: "warning" })
            done(input.trim())
          }}
        />
      ),
      undefined,
      { back },
    )
  }

  function manageCategories(back: () => void, current?: string) {
    dialog.replace(
      () => (
        <DialogSelect
          title="Manage categories"
          current={current}
          preserveSelection
          options={local.model.favoriteCategories().map((name) => ({
            title: name,
            value: name,
            onSelect: () => categoryActions(name, back),
          }))}
        />
      ),
      undefined,
      { back },
    )
  }

  function categoryActions(name: string, back: () => void) {
    const manage = () => manageCategories(back, name)
    dialog.replace(
      () => (
        <DialogSelect
          title={name}
          renderFilter={false}
          options={[
            {
              title: "Rename…",
              value: "rename",
              onSelect: () => editCategory(name, (next) => manageCategories(back, next), manage),
            },
            {
              title: "Move up",
              value: "up",
              disabled: local.model.favoriteCategories().indexOf(name) === 0,
              onSelect: () => {
                local.model.moveFavoriteCategory(name, -1)
                manage()
              },
            },
            {
              title: "Move down",
              value: "down",
              disabled: local.model.favoriteCategories().indexOf(name) === local.model.favoriteCategories().length - 1,
              onSelect: () => {
                local.model.moveFavoriteCategory(name, 1)
                manage()
              },
            },
            {
              title: "Delete category",
              value: "delete",
              onSelect: () => {
                local.model.deleteFavoriteCategory(name)
                manageCategories(back)
              },
            },
          ]}
        />
      ),
      undefined,
      { back: manage },
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
            return moveModelFavorite(local.model.favorite(), option.value, -1) === local.model.favorite()
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
            return moveModelFavorite(local.model.favorite(), option.value, 1) === local.model.favorite()
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
