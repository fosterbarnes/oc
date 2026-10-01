import { Config } from "@/config/config"
import { emptyConsoleState } from "@opencode-ai/core/v1/config/console-state"
import { Effect, Layer } from "effect"

export function make(overrides: Partial<Config.Interface> = {}) {
  const get: Config.Interface["get"] = overrides.get ?? (() => Effect.succeed({}))
  return Config.Service.of({
    get,
    getGlobal: () => Effect.succeed({}),
    getConsoleState: () => Effect.succeed(emptyConsoleState),
    update: () => Effect.void,
    updateGlobal: (config) => Effect.succeed({ info: config, changed: false }),
    invalidate: () => Effect.void,
    directories: () => Effect.succeed([]),
    waitForDependencies: () => Effect.void,
    commands: () => get().pipe(Effect.map((config) => ({ commands: config.command ?? {}, diagnostics: [] }))),
    ...overrides,
  })
}

export function layer(overrides?: Partial<Config.Interface>) {
  return Layer.succeed(Config.Service, make(overrides))
}

export * as TestConfig from "./config"
