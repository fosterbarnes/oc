// The anthropic entry of the models.dev fixture test/preload.ts points OPENCODE_MODELS_PATH at,
// so unit tests see the same claude-code model registry provider state builds.
import { readFileSync } from "node:fs"
import type { ModelsDev } from "@opencode-ai/core/models-dev"
import { claudeCodeModels } from "@/provider/claude-code/models.js"

export const anthropicCatalog: ModelsDev.Provider = JSON.parse(
  readFileSync(process.env.OPENCODE_MODELS_PATH!, "utf8"),
).anthropic

/** Registers the fixture's models, as provider state does at startup. */
export const seedClaudeCodeModels = () => claudeCodeModels(anthropicCatalog, "claude-code")
