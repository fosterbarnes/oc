// The resident server's credentials and role marker. Agent shells and the Claude CLI inherit the
// server's environment, and nothing they run needs these; left in, any agent command could read
// the server password.
const SERVER_ONLY = new Set(["OPENCODE_SERVER_PASSWORD", "OPENCODE_SERVER_USERNAME", "OC_RESIDENT"])

export function inherited(env: NodeJS.ProcessEnv = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !SERVER_ONLY.has(key.toUpperCase())))
}

export * as AgentEnv from "./agent-env"
