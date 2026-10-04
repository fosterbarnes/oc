/**
 * Keep Windows stdin in raw mode without bun:ffi.
 * OpenTUI already calls setRawMode(true); this re-asserts libuv's
 * UV_TTY_MODE_RAW_VT so ENABLE_PROCESSED_INPUT stays cleared and Ctrl+C
 * arrives as a key instead of a process kill.
 */
export function win32AssertRawMode() {
  if (process.platform !== "win32") return
  if (!process.stdin.isTTY) return
  if (typeof process.stdin.setRawMode !== "function") return
  process.stdin.setRawMode(true)
}
