---
name: oc-palette-entry
description: Add an entry to the oc section of the oc TUI command palette (category "oc"). Use when the user asks for a new oc command palette entry, palette command, or oc slash command backed by a palette entry.
---

# oc palette entry

Add entries to the `oc` category only. Use another category (`Session`, `System`, ...) only when
the user explicitly asks for it.

## Where

`src/packages/tui/src/app.tsx`, the `appCommands` memo (`const appCommands = createMemo(() => [`).
Every item is mapped to `namespace: "palette"` and registered through `useBindings`, so adding an
object to the array is all the wiring needed. The `oc.settings_palette` command opens the palette
filtered to `category === "oc"`.

Insert the new object next to the other `category: "oc"` entries, near related commands. If the
command needs its own state or several hooks, put a `createXCommand()` factory in its own module
and spread it into the array like `todoCommand` (`src/todos.ts`). Otherwise keep it inline.

## Shape

```tsx
{
  name: "oc.do_thing",           // unique, "oc." prefix, snake_case after it
  title: "Do thing",             // palette label: states what it does
  category: "oc",
  slashName: "doThing",          // optional: also exposes /doThing in the prompt
  run: () => {
    // use hooks already in scope: toast, dialog, sync, sdk, ...
  },
},
```

Optional fields, used only when needed:

- `desc`: short tooltip-style detail.
- `hidden`: boolean; hides from the palette (for example `process.env.OC_STABLE === "1"` or
  `!Global.Path.debug` for debug-only).
- `enabled`, `suggested`: boolean or getter for dynamic state.
- `slashAliases`: extra slash names.
- `get title()`: dynamic labels (see `src/todos.ts`).

Rules:

- No filler text in `title` or `desc`.
- Errors surface through `toast.show({ message, variant: "error" })`, matching nearby entries.
- Do not add a keybind unless asked. Keybinds go through `tuiConfig.keybinds`, not this array.
- Users order palette entries via `command_palette.order` in config; no code change needed.

## Check

From `src/packages/tui`, run `bun run typecheck` (`tsgo --noEmit`) and confirm exit 0. Do not
build or install oc. Ask the user to open the palette's oc section (or `/slashName`) in their next
build and confirm the entry appears and runs.
