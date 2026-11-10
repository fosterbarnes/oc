---
name: oc-palette-entry
description: Add an entry to the oc section of the oc TUI command palette (category "oc"). Use when the user asks for a new oc command palette entry, palette command, or oc slash command backed by a palette entry.
---

# oc palette entry

Add entries to the `oc` category only. Use another category (`Session`, `System`, ...) only when
the user explicitly asks for it.

## Where

Most oc entries live in `src/packages/tui/src/ocCommands.tsx` (`createOcCommands`), in three
arrays App spreads into the `appCommands` memo in `src/app.tsx`: `newSession`, `defaults`, and
`settings` (everything else). Every item in
`appCommands` is mapped to `namespace: "palette"` and registered through `useBindings`, so adding
an object to the right array is all the wiring needed. The `oc.settings_palette` command opens the
palette filtered to `category === "oc"`. Claude warm-up entries live in `src/claudeWarmup.tsx`;
account switching and auto-resume live in `src/claudeCommands.tsx`. Both are spread into
`appCommands` after the System entries.

Insert the new object in `ocCommands.tsx`, near related commands. If the command needs its own
state or several hooks, put a `createXCommand()` factory in its own module and spread it into
`appCommands` like `todoCommand` (`src/todos.ts`). Otherwise keep it inline.

## Shape

```tsx
{
  name: "oc.do_thing",           // unique, "oc." prefix, snake_case after it
  title: "Do thing",             // palette label: states what it does
  category: "oc",
  group: "Session",              // heading; one of the groups in _GROUP_RANK
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
- Order: `src/component/command-palette.tsx` ranks oc groups (`_GROUP_RANK`: Session, Claude,
  Subagents, Defaults, Updates, Prompt, Appearance, Sidebar, Folders, Server and processes, Tools,
  About) and commands by `name` (`_COMMAND_RANK`). Pick an existing group by job and add the new
  `name` to `_COMMAND_RANK` where it belongs by how often it is used; unlisted names fall to the end
  of their group A-Z. Users can still reorder inside a group with `command_palette.order`.

## Check

From `src/packages/tui`, run `bun run typecheck` (`tsgo --noEmit`) and confirm exit 0. Do not
build or install oc. Ask the user to open the palette's oc section (or `/slashName`) in their next
build and confirm the entry appears and runs.
