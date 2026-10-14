import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { UI } from "./cli/ui"
import { InstallationDisplayVersion } from "@opencode-ai/core/installation/version"
import { FormatError } from "./cli/error"
import { EOL } from "os"
import { errorMessage } from "./util/error"
import { Heap } from "./cli/heap"
import { native } from "@opencode-ai/core/global"
import {
  resolveCommandToLoad,
  withExecutableDefault,
  type CommandToLoad,
} from "./cli/commandLoader"

const rawArgs = hideBin(process.argv)
// The native build runs the upstream in-process TUI; only oc builds rewrite to the resident launcher.
const args = native
  ? rawArgs
  : withExecutableDefault(rawArgs, process.execPath)

function needsAllCommands(args: readonly string[]) {
  return args.includes("-h") || args.includes("--help") || args.includes("completion")
}

function needsNoCommands(args: readonly string[]) {
  return args.includes("-v") || args.includes("--version")
}

function show(out: string) {
  const text = out.trimStart()
  if (!text.startsWith("opencode ")) {
    process.stderr.write(UI.logo() + EOL + EOL)
    process.stderr.write(text + EOL)
    return
  }
  process.stderr.write(out)
}

const cli = yargs(args)
  .parserConfiguration({ "populate--": true })
  .scriptName("opencode")
  .wrap(100)
  .help("help", "show help")
  .alias("help", "h")
  .version("version", "show version number", InstallationDisplayVersion)
  .alias("version", "v")
  .option("print-logs", {
    describe: "print logs to stderr",
    type: "boolean",
  })
  .option("log-level", {
    describe: "log level (default INFO; DEBUG for full debug)",
    type: "string",
    choices: ["DEBUG", "INFO", "WARN", "ERROR"],
  })
  .option("log-channels", {
    describe: "debug log channels (comma-separated: session,config,mcp,tool,provider,plugin,server,worktree,lsp,tui)",
    type: "string",
  })
  .option("pure", {
    describe: "run without external plugins",
    type: "boolean",
  })
  .middleware(async (opts) => {
    if (opts.printLogs) process.env.OPENCODE_PRINT_LOGS = "1"
    if (opts.logLevel) process.env.OPENCODE_LOG_LEVEL = opts.logLevel
    if (opts.logChannels) process.env.OPENCODE_LOG_CHANNELS = opts.logChannels
    if (opts.pure) {
      process.env.OPENCODE_PURE = "1"
    }

    Heap.start()

    process.env.AGENT = "1"
    process.env.OPENCODE = "1"
    process.env.OPENCODE_PID = String(process.pid)
  })
  .usage("")
  .completion("completion", "generate shell completion script")

const commandLoaders = {
  acp: async () => {
    const { AcpCommand } = await import("./cli/cmd/acp")
    cli.command(AcpCommand)
  },
  mcp: async () => {
    const { McpCommand } = await import("./cli/cmd/mcp")
    cli.command(McpCommand)
  },
  tui: async () => {
    const { TuiThreadCommand } = await import("./cli/cmd/tui")
    cli.command(TuiThreadCommand)
  },
  attach: async () => {
    const { AttachCommand } = await import("./cli/cmd/attach")
    cli.command(AttachCommand)
  },
  run: async () => {
    const { RunCommand } = await import("./cli/cmd/run")
    cli.command(RunCommand)
  },
  generate: async () => {
    const { GenerateCommand } = await import("./cli/cmd/generate")
    cli.command(GenerateCommand)
  },
  debug: async () => {
    const { DebugCommand } = await import("./cli/cmd/debug")
    cli.command(DebugCommand)
  },
  console: async () => {
    const { ConsoleCommand } = await import("./cli/cmd/account")
    cli.command(ConsoleCommand)
  },
  providers: async () => {
    const { ProvidersCommand } = await import("./cli/cmd/providers")
    cli.command(ProvidersCommand)
  },
  agent: async () => {
    const { AgentCommand } = await import("./cli/cmd/agent")
    cli.command(AgentCommand)
  },
  upgrade: async () => {
    const { UpgradeCommand } = await import("./cli/cmd/upgrade")
    cli.command(UpgradeCommand)
  },
  uninstall: async () => {
    const { UninstallCommand } = await import("./cli/cmd/uninstall")
    cli.command(UninstallCommand)
  },
  serve: async () => {
    const { ServeCommand } = await import("./cli/cmd/serve")
    cli.command(ServeCommand)
  },
  models: async () => {
    const { ModelsCommand } = await import("./cli/cmd/models")
    cli.command(ModelsCommand)
  },
  stats: async () => {
    const { StatsCommand } = await import("./cli/cmd/stats")
    cli.command(StatsCommand)
  },
  export: async () => {
    const { ExportCommand } = await import("./cli/cmd/export")
    cli.command(ExportCommand)
  },
  import: async () => {
    const { ImportCommand } = await import("./cli/cmd/import")
    cli.command(ImportCommand)
  },
  github: async () => {
    const { GithubCommand } = await import("./cli/cmd/github")
    cli.command(GithubCommand)
  },
  pr: async () => {
    const { PrCommand } = await import("./cli/cmd/pr")
    cli.command(PrCommand)
  },
  session: async () => {
    const { SessionCommand } = await import("./cli/cmd/session")
    cli.command(SessionCommand)
  },
  plugin: async () => {
    const { PluginCommand } = await import("./cli/cmd/plug")
    cli.command(PluginCommand)
  },
  db: async () => {
    const { DbCommand } = await import("./cli/cmd/db")
    cli.command(DbCommand)
  },
  oc: async () => {
    // Launcher, resident server, and revive host live only in oc builds; this branch drops them from opencode.
    if (native) {
      if (needsAllCommands(args)) return
      UI.error("`oc` commands are only available in the oc executable")
      process.exit(1)
    }
    const { OcCommand } = await import("./cli/cmd/oc")
    cli.command(OcCommand)
  },
} as const

const allCommandNames = Object.keys(commandLoaders) as CommandToLoad[]
const commandNames = needsAllCommands(args)
  ? allCommandNames
  : needsNoCommands(args)
    ? []
    : [resolveCommandToLoad(args)]
for (const name of commandNames) await commandLoaders[name]()

cli
  .fail((msg, err) => {
    if (
      msg?.startsWith("Unknown argument") ||
      msg?.startsWith("Not enough non-option arguments") ||
      msg?.startsWith("Invalid values:")
    ) {
      if (err) throw err
      cli.showHelp(show)
    }
    if (err) throw err
    process.exit(1)
  })
  .strict()

try {
  if (args.includes("-h") || args.includes("--help")) {
    await cli.parse(args, (err: Error | undefined, _argv: unknown, out: string) => {
      if (err) throw err
      if (!out) return
      show(out)
    })
  } else {
    await cli.parse()
  }
} catch (e) {
  const formatted = FormatError(e)
  if (formatted) UI.error(formatted)
  if (formatted === undefined) {
    UI.error("Unexpected error" + EOL)
    process.stderr.write(errorMessage(e) + EOL)
  }
  process.exitCode = 1
} finally {
  // Some subprocesses don't react properly to SIGTERM and similar signals.
  // Most notably, some docker-container-based MCP servers don't handle such signals unless
  // run using `docker run --init`.
  // Explicitly exit to avoid any hanging subprocesses.
  process.exit()
}
