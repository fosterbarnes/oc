import { createTestRenderer } from "@opentui/core/testing"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { expect, test } from "bun:test"
import { USAGE_MENU_COMMAND } from "../../src/routes/session/sidebar-tools/sidebarTools"

test("usage menu is reachable through the oc palette namespace and category", async () => {
  const { renderer } = await createTestRenderer({ width: 80, height: 24 })
  const keymap = createDefaultOpenTuiKeymap(renderer)
  let opened = false
  const unregister = keymap.registerLayer({
    commands: [
      {
        ...USAGE_MENU_COMMAND,
        run: () => {
          opened = true
        },
      },
    ],
  })
  try {
    const entry = keymap
      .getCommandEntries({
        namespace: "palette",
        visibility: "reachable",
        filter: (command) => command.category === "oc",
      })
      .find((entry) => entry.command.name === USAGE_MENU_COMMAND.name)
    expect(entry?.command.title).toBe("Show usage")
    expect(entry?.command.group).toBe("Third party harness management")
    expect(keymap.dispatchCommand(entry!.command.name).ok).toBe(true)
    expect(opened).toBe(true)
  } finally {
    unregister()
    renderer.destroy()
  }
})
