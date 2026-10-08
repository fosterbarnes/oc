import type { Argv } from "yargs"
import { Effect } from "effect"
import { cmd } from "./cmd"
import { CliError, effectCmd, fail } from "../effect-cmd"
import { Session } from "@/session/session"
import { SessionID } from "../../session/schema"
import { UI } from "../ui"
import { Locale } from "@/util/locale"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Filesystem } from "@/util/filesystem"
import { Process } from "@/util/process"
import { NotFoundError } from "@/storage/storage"
import { EOL } from "os"
import path from "path"
import fs from "fs/promises"
import { which } from "@opencode-ai/core/util/which"
import { SessionPrompt } from "@/session/prompt"
import { OcConfig } from "@/config/oc"

function pagerCmd(): string[] {
  const lessOptions = ["-R", "-S"]
  if (process.platform !== "win32") {
    return ["less", ...lessOptions]
  }

  // user could have less installed via other options
  const lessOnPath = which("less")
  if (lessOnPath) {
    if (Filesystem.stat(lessOnPath)?.size) return [lessOnPath, ...lessOptions]
  }

  if (Flag.OPENCODE_GIT_BASH_PATH) {
    const less = path.join(Flag.OPENCODE_GIT_BASH_PATH, "..", "..", "usr", "bin", "less.exe")
    if (Filesystem.stat(less)?.size) return [less, ...lessOptions]
  }

  const git = which("git")
  if (git) {
    const less = path.join(git, "..", "..", "usr", "bin", "less.exe")
    if (Filesystem.stat(less)?.size) return [less, ...lessOptions]
  }

  // Fall back to Windows built-in more (via cmd.exe)
  return ["cmd", "/c", "more"]
}

export const SessionCommand = cmd({
  command: "session",
  describe: "manage sessions",
  builder: (yargs: Argv) =>
    yargs
      .command(SessionBootstrapCommand)
      .command(SessionListCommand)
      .command(SessionPreviousCommand)
      .command(SessionDeleteCommand)
      .demandCommand(),
  async handler() {},
})

const SessionBootstrapCommand = effectCmd({
  command: "bootstrap <directory>",
  describe: "create an initialized session without running a model",
  directory: (args) => path.resolve(String(args.directory)),
  builder: (yargs: Argv) =>
    yargs
      .positional("directory", {
        type: "string",
        describe: "project directory",
        demandOption: true,
      })
      .option("title", {
        type: "string",
        describe: "session title",
      }),
  handler: Effect.fn("Cli.session.bootstrap")(function* (args) {
    const directory = path.resolve(String(args.directory))
    const exists = yield* Effect.tryPromise({
      try: async () => (await fs.stat(directory)).isDirectory(),
      catch: () => new CliError({ message: `Directory not found: ${directory}` }),
    })
    if (!exists) return yield* fail(`Directory not found: ${directory}`)

    yield* Effect.tryPromise({
      try: () => OcConfig.writeSidebar(directory),
      catch: (error) => new CliError({ message: `Failed to write sidebar config: ${String(error)}` }),
    })

    const title = args.title !== undefined
      ? String(args.title)
      : yield* Session.Service.use((service) =>
          service
            .listGlobal({ roots: true, limit: 500 })
            .pipe(Effect.map((sessions) => OcConfig.nextProjectTitle(sessions.map((item) => item.title), directory))),
        )
    const session = yield* Session.Service.use((service) => service.create({
      title,
      ...(args.title === undefined && { metadata: { ocAutoRename: { state: "pending", title } } }),
    }))
    const prompt = yield* SessionPrompt.Service
    yield* prompt
      .prompt({
        sessionID: session.id,
        noReply: true,
        parts: [
          {
            type: "text",
            text: `Working directory initialized: ${directory}`,
            synthetic: true,
          },
        ],
      })
      .pipe(Effect.mapError((error) => new CliError({ message: `Failed to initialize session: ${String(error)}` })))

    console.log(JSON.stringify({ sessionID: session.id, directory }))
  }),
})

export const SessionDeleteCommand = effectCmd({
  command: "delete <sessionID>",
  describe: "delete a session",
  builder: (yargs) =>
    yargs.positional("sessionID", {
      describe: "session ID to delete",
      type: "string",
      demandOption: true,
    }),
  handler: Effect.fn("Cli.session.delete")(function* (args) {
    const svc = yield* Session.Service
    const sessionID = SessionID.make(args.sessionID)
    yield* svc
      .remove(sessionID)
      .pipe(Effect.catchIf(NotFoundError.isInstance, () => fail(`Session not found: ${args.sessionID}`)))
    UI.println(UI.Style.TEXT_SUCCESS_BOLD + `Session ${args.sessionID} deleted` + UI.Style.TEXT_NORMAL)
  }),
})

export const SessionListCommand = effectCmd({
  command: "list",
  describe: "list sessions",
  builder: (yargs) =>
    yargs
      .option("max-count", {
        alias: "n",
        describe: "limit to N most recent sessions",
        type: "number",
      })
      .option("format", {
        describe: "output format",
        type: "string",
        choices: ["table", "json"],
        default: "table",
      }),
  handler: Effect.fn("Cli.session.list")(function* (args) {
    const sessions = yield* Session.Service.use((svc) => svc.list({ roots: true, limit: args.maxCount }))

    if (sessions.length === 0) return

    const output = args.format === "json" ? formatSessionJSON(sessions) : formatSessionTable(sessions)

    const shouldPaginate = process.stdout.isTTY && !args.maxCount && args.format === "table"

    if (shouldPaginate) {
      yield* Effect.promise(async () => {
        const proc = Process.spawn(pagerCmd(), {
          stdin: "pipe",
          stdout: "inherit",
          stderr: "inherit",
        })

        if (!proc.stdin) {
          console.log(output)
          return
        }

        proc.stdin.write(output)
        proc.stdin.end()
        await proc.exited
      })
    } else {
      console.log(output)
    }
  }),
})

export const SessionPreviousCommand = effectCmd({
  command: "previous",
  describe: "print a previous global session ID",
  builder: (yargs) =>
    yargs.option("depth", {
      type: "number",
      default: 1,
      describe: "one-based position in the recent root-session list",
    }),
  handler: Effect.fn("Cli.session.previous")(function* (args) {
    const depth = Number(args.depth)
    if (!Number.isInteger(depth) || depth < 1 || depth > 50) {
      return yield* fail(`Previous session depth must be between 1 and 50: ${depth}`)
    }
    const sessions = yield* Session.Service.use((service) => service.listGlobal({ roots: true, limit: 50 }))
    const selected = sessions[depth - 1]
    if (!selected) return yield* fail(`Previous session ${depth} is unavailable; only ${sessions.length} session(s) exist.`)
    console.log(selected.id)
  }),
})

function formatSessionTable(sessions: Session.Info[]): string {
  const lines: string[] = []

  const maxIdWidth = Math.max(20, ...sessions.map((s) => s.id.length))
  const maxTitleWidth = Math.max(25, ...sessions.map((s) => s.title.length))

  const header = `Session ID${" ".repeat(maxIdWidth - 10)}  Title${" ".repeat(maxTitleWidth - 5)}  Updated`
  lines.push(header)
  lines.push("─".repeat(header.length))
  for (const session of sessions) {
    const truncatedTitle = Locale.truncate(session.title, maxTitleWidth)
    const timeStr = Locale.todayTimeOrDateTime(session.time.updated)
    const line = `${session.id.padEnd(maxIdWidth)}  ${truncatedTitle.padEnd(maxTitleWidth)}  ${timeStr}`
    lines.push(line)
  }

  return lines.join(EOL)
}

function formatSessionJSON(sessions: Session.Info[]): string {
  const jsonData = sessions.map((session) => ({
    id: session.id,
    title: session.title,
    updated: session.time.updated,
    created: session.time.created,
    projectId: session.projectID,
    directory: session.directory,
  }))
  return JSON.stringify(jsonData, null, 2)
}
