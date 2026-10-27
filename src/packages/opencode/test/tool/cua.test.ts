import { describe, expect, test } from "bun:test"
import { policy } from "../../src/tool/cua"

// Safety contract of the cua_* gate: what runs silently, what asks the user, what never runs.
const none = new Set<number>()

describe("cua policy", () => {
  test("config, install, and recording tools never run", () => {
    for (const tool of ["set_config", "install_extension", "install_ffmpeg", "start_recording", "replay_trajectory"])
      expect(policy(tool, {}, none)).toBe("deny")
  })

  test("foreground input asks, wherever it hides in the arguments", () => {
    const foreground = [
      ["click", { pid: 1, window_id: 2, delivery_mode: "foreground" }],
      ["run_steps", { steps: [{ click: { role: "button", name: "OK" } }], delivery_mode: "foreground" }],
      ["run_steps", { steps: [{ tool: "type_text", args: { text: "hi", delivery_mode: "foreground" } }] }],
      ["run_steps", { steps: [{ click: { role: "button" } }], foreground_fallback: true }],
      ["click", { x: 10, y: 10, scope: "desktop" }],
      ["click", { target: { kind: "desktop", display_id: "primary" }, x: 1, y: 1 }],
      ["bring_to_front", { pid: 1 }],
      ["run_script", { script: "return 1" }],
    ] as const
    for (const [tool, args] of foreground) expect(policy(tool, args, none)).toBe("foreground")
  })

  test("file transfer, clipboard reads, and full-screen capture ask", () => {
    for (const tool of ["browser_set_input_files", "browser_download", "clipboard_read", "get_desktop_state"])
      expect(policy(tool, {}, none)).toBe("sensitive")
  })

  test("only processes oc launched close without asking", () => {
    expect(policy("kill_app", { pid: 42 }, none)).toBe("kill")
    expect(policy("kill_app", { pid: 42 }, new Set([42]))).toBe("plain")
  })

  test("background input runs without asking", () => {
    expect(
      policy("run_steps", { steps: [{ click: { role: "button", name: "Seven" } }], app: "Calculator" }, none),
    ).toBe("plain")
    expect(policy("get_window_state", { pid: 1, window_id: 2, include_screenshot: false }, none)).toBe("plain")
  })
})
