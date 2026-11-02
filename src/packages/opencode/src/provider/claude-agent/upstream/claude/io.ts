export * as ClaudeIO from "./io.js"

import type { Options } from "@anthropic-ai/claude-agent-sdk"
// oc: Bun.which plus cliCommand replace upstream's util/which, so a Windows npm `.cmd` shim maps to its claude.exe.
import { cliCommand } from "../../../claude-code/cliExecutable.js"
import { ClaudeFork } from "./fork.js"
import { ClaudeSDK } from "./sdk.js"

// Everything that reaches outside opencode. Tests swap it for a fake `claude`.
export interface Interface {
  // Undefined uses the SDK's own spawn
  readonly spawn?: Options["spawnClaudeCodeProcess"]
  readonly which: () => string | undefined
  // Before our isolation settings
  readonly env: () => Record<string, string | undefined>
  readonly sessionExists: (sessionID: string) => Promise<boolean>
  readonly fork: (sessionID: string, messageID: string) => Promise<ClaudeFork.Result | undefined>
  readonly remove: (sessionID: string) => Promise<void>
}

export const real: Interface = {
  which: () => process.env.OPENCODE_CLAUDE_PATH || which("claude"),
  env: () => process.env,
  sessionExists: async (sessionID) => {
    const { getSessionInfo } = await ClaudeSDK.load()
    return (await getSessionInfo(sessionID)) !== undefined
  },
  fork: ClaudeFork.create,
  remove: async (sessionID) => {
    const { deleteSession } = await ClaudeSDK.load()
    await deleteSession(sessionID)
  },
}

// oc
function which(name: string) {
  const found = Bun.which(name)
  return found ? cliCommand(found, []).command : undefined
}
