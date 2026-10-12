import { CURSOR_API_HOST, CURSOR_PROVIDER_ID } from "./shared.js"
import { createCursorLanguageModel } from "./languageModel.js"
import type { CreateCursorOptions } from "./index.js"

/**
 * Runtime-agnostic pieces shared by both Cursor surfaces:
 *   - host plugin entrypoint (`src/plugin/cursor.ts`)
 *   - provider entrypoint      (`provider/cursor/index.ts`)
 *
 * Nothing here may import a host plugin API - anything host-shaped belongs
 * in the entrypoint.
 */

/** Minimal AI SDK provider surface OpenCode expects from an `aisdk` package. */
export type CursorSdk = {
  languageModel(modelId: string): ReturnType<typeof createCursorLanguageModel>
}

export function createSdk(options: CreateCursorOptions): CursorSdk {
  const providerId = options.name || CURSOR_PROVIDER_ID
  return {
    languageModel(modelId: string) {
      return createCursorLanguageModel(modelId, providerId, options)
    },
  }
}

/** API base for auth, model discovery, and GetServerConfig. */
export function cursorApiBaseURL(): string {
  return process.env.CURSOR_API_BASE_URL ?? `https://${CURSOR_API_HOST}`
}

export function cursorGetServerConfigTelemetryEnabled(): boolean {
  return (
    process.env.CURSOR_GET_SERVER_CONFIG_TELEMETRY === "1" || process.env.CURSOR_GET_SERVER_CONFIG_TELEMETRY === "true"
  )
}
