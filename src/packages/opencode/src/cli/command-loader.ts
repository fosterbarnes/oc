const COMMANDS = new Set([
  "acp",
  "mcp",
  "attach",
  "run",
  "generate",
  "debug",
  "console",
  "providers",
  "agent",
  "upgrade",
  "uninstall",
  "serve",
  "models",
  "stats",
  "export",
  "import",
  "github",
  "pr",
  "session",
  "plugin",
  "db",
  "oc",
])

const ALIASES = {
  auth: "providers",
  plug: "plugin",
} as const

const VALUE_OPTIONS = new Set([
  "--log-level",
  "--model",
  "-m",
  "--session",
  "-s",
  "--prompt",
  "--agent",
  "--port",
  "--hostname",
  "--mdns-domain",
  "--cors",
  "--replay-limit",
  "--palette",
])

export type CommandToLoad =
  | "tui"
  | "acp"
  | "mcp"
  | "attach"
  | "run"
  | "generate"
  | "debug"
  | "console"
  | "providers"
  | "agent"
  | "upgrade"
  | "uninstall"
  | "serve"
  | "models"
  | "stats"
  | "export"
  | "import"
  | "github"
  | "pr"
  | "session"
  | "plugin"
  | "db"
  | "oc"

export function withExecutableDefault(args: readonly string[], execPath = process.execPath) {
  const file = execPath.split(/[\\/]/).pop() ?? execPath
  const ext = file.includes(".") ? `.${file.split(".").pop()}` : ""
  const base = file.slice(0, file.length - ext.length).toLowerCase()
  if (base !== "oc" && base !== "occ") return [...args]
  const helpOrVersion =
    args.includes("-h") ||
    args.includes("--help") ||
    args.includes("-v") ||
    args.includes("--version") ||
    args.includes("--register")
  if (helpOrVersion) return [...args]
  if (["--restart-server", "--kill-server", "--shutdown-server", "--shutdown-all"].some((flag) => args.includes(flag))) {
    if (args[0] === "oc") return [...args]
    return ["oc", ...args]
  }
  if (base === "oc" && args.length === 1 && args[0] === "oc") return ["oc", "launch", ...args]
  if (resolveCommandToLoad(args) !== "tui") return [...args]
  if (base === "oc") return ["oc", "launch", ...args]
  return ["oc", "previous", "--depth", "1", ...args]
}

export function withOcLaunchDefault(args: readonly string[], debug: boolean) {
  if (!debug) return [...args]
  const helpOrVersion =
    args.includes("-h") ||
    args.includes("--help") ||
    args.includes("-v") ||
    args.includes("--version") ||
    args.includes("--register")
  if (helpOrVersion) return [...args]
  if (["--restart-server", "--kill-server", "--shutdown-server", "--shutdown-all"].some((flag) => args.includes(flag))) {
    if (args[0] === "oc") return [...args]
    return ["oc", ...args]
  }
  if (resolveCommandToLoad(args) !== "tui") return [...args]
  return ["oc", "launch", ...args]
}

export function resolveCommandToLoad(args: readonly string[]): CommandToLoad {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === "--") return "tui"
    if (arg.startsWith("-")) {
      if (VALUE_OPTIONS.has(arg) && index + 1 < args.length) index++
      continue
    }
    if (COMMANDS.has(arg)) return arg as CommandToLoad
    if (arg in ALIASES) return ALIASES[arg as keyof typeof ALIASES]
    return "tui"
  }
  return "tui"
}
