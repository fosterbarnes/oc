import { createCursor as createCursorSdk } from "./cursor/index.js"

export const CURSOR_PROVIDER_NPM = "@opencode-ai/cursor"

export function createCursor(options: Parameters<typeof createCursorSdk>[0]) {
  return createCursorSdk(options)
}
