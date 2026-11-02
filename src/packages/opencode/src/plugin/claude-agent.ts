import type { Hooks } from "@opencode-ai/plugin"
import { Effect } from "effect"
import { OAUTH_DUMMY_KEY } from "../auth"
import { CLAUDE_AGENT_PROVIDER_ID } from "../provider/claude-agent/id"
import { ClaudeAgentRuntime } from "../provider/claude-agent/runtime"

// The login belongs to `claude`; oc never sees a token. Connecting only records the choice, once Claude Code
// reports a signed-in account, and saves its model list (upstream `integration.ts`).
export async function ClaudeAgentAuthPlugin(): Promise<Hooks> {
  return {
    auth: {
      provider: CLAUDE_AGENT_PROVIDER_ID,
      methods: [
        {
          type: "oauth",
          label: "Claude Code login (claude auth login)",
          async authorize() {
            return {
              url: "https://code.claude.com/docs/en/setup",
              instructions:
                "Install Claude Code if needed, then run `claude auth login` in a terminal. oc connects once Claude Code is signed in.",
              method: "auto",
              callback: async () => {
                await Effect.runPromise(ClaudeAgentRuntime.connect())
                return {
                  type: "success",
                  access: OAUTH_DUMMY_KEY,
                  refresh: OAUTH_DUMMY_KEY,
                  expires: Date.now() + 100 * 365 * 24 * 60 * 60 * 1000,
                }
              },
            }
          },
        },
      ],
    },
  }
}
