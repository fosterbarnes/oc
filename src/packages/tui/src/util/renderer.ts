import type { CliRenderer } from "@opentui/core"
import { detectTerminal } from "@opencode-ai/core/util/terminal"

export function writeTerminalEscape(renderer: Pick<CliRenderer, "isDestroyed">, escape: string) {
  if (renderer.isDestroyed) return
  // OpenTUI's internal writeOut coordinates native output, unlike intercepted stdout.write.
  ;(renderer as unknown as { writeOut(escape: string): boolean }).writeOut(escape)
}

export function destroyRenderer(renderer: Pick<CliRenderer, "isDestroyed" | "setTerminalTitle" | "destroy">) {
  renderer.setTerminalTitle("")
  if (renderer.isDestroyed) return
  if ("writeOut" in renderer) {
    writeTerminalEscape(renderer, "\x1b]9;4;0\x1b\\")
    if (detectTerminal().kind === "wezterm") {
      writeTerminalEscape(renderer, "\x1b]1337;SetUserVar=oc_agent_color=\x07")
      writeTerminalEscape(renderer, "\x1b]1337;SetUserVar=oc_tui=\x07")
    }
  }
  renderer.destroy()
}
