import yargs from "yargs"
import { TuiThreadCommand } from "./cli/cmd/tui"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { hideBin } from "yargs/helpers"
const cli = yargs(hideBin(process.argv))
  .parserConfiguration({ "populate--": true })
  .scriptName("opencode")
  .wrap(100)
  .help("help", "show help")
  .alias("help", "h")
  .version("version", "show version number", InstallationVersion)
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
  .middleware((opts) => {
    if (opts.printLogs) process.env.OPENCODE_PRINT_LOGS = "1"
    if (opts.logLevel) process.env.OPENCODE_LOG_LEVEL = opts.logLevel
    if (opts.logChannels) process.env.OPENCODE_LOG_CHANNELS = opts.logChannels
  })
  .command(TuiThreadCommand)
  .parse()
