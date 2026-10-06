import fs from "fs/promises"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { launchDetached } from "@opencode-ai/core/util/launch-detached"
import { markersFile } from "@opencode-ai/core/util/markers-file"

// Alpha: a line that is exactly `$#name` in an agent's reply runs the user's preset command for
// `name`, with no tool call. Safety rests entirely on which commands the user lists.

export type Mode = "inline" | "window" | "afterTurn"
export type Command = { run: string[]; mode: Mode; description?: string; ask: boolean; timeout: number }
export type Config = { commands: Record<string, Command> }

const MODES: readonly string[] = ["inline", "window", "afterTurn"]
const NAME = /^[A-Za-z]\w*$/
const LINE = /^\$#([A-Za-z]\w*)[ \t]*$/
const FENCE = /^\s*(```|~~~)/
const OUTPUT_LIMIT = 4000

export const file = markersFile

export async function read(source = file()): Promise<Config | undefined> {
  const raw = await fs.readFile(source, "utf8").catch(() => undefined)
  if (raw === undefined) return
  let parsed: any
  try {
    parsed = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ""))
  } catch {
    return
  }
  if (parsed?.enabled !== true || typeof parsed.commands !== "object" || parsed.commands === null) return
  const ask = parsed.ask === true
  const commands: Record<string, Command> = {}
  for (const [name, value] of Object.entries<any>(parsed.commands)) {
    if (!NAME.test(name) || !MODES.includes(value?.mode)) continue
    if (!Array.isArray(value.run) || value.run.length === 0 || !value.run.every((arg: unknown) => typeof arg === "string"))
      continue
    commands[name] = {
      run: value.run,
      mode: value.mode,
      description: typeof value.description === "string" ? value.description : undefined,
      ask: typeof value.ask === "boolean" ? value.ask : ask,
      timeout: typeof value.timeout === "number" && value.timeout > 0 ? value.timeout : 30,
    }
  }
  return { commands }
}

/** Agent instructions for the enabled commands; undefined when there is nothing to offer. */
export function prompt(config: Config | undefined) {
  const entries = Object.entries(config?.commands ?? {})
  if (entries.length === 0) return
  return [
    "# Command markers (oc alpha)",
    "To run one of the user's preset commands, write its marker alone on its own line: a line containing only `$#` followed by the name. oc runs it; no tool call is needed. To mention a marker without running it, put a backslash first (`\\$#name`), including inside code blocks.",
    "- Use a marker only when the user asks for what the command does, never on your own initiative.",
    "- You cannot see the result this turn. inline: the output replaces the marker line, so you see it next turn. window: it opens a window for the user; ask the user for the result. afterTurn: it runs after your reply ends.",
    `- Never add or change commands in ${file()} without the user's explicit permission.`,
    "Commands:",
    ...entries.map(([name, command]) => `- ${name} (${command.mode})${command.description ? `: ${command.description}` : ""}`),
  ].join("\n")
}

// Lines inside fenced code blocks never run, even if the agent forgets the backslash escape.
function scan(text: string, replace: (name: string) => string | undefined) {
  let fenced = false
  return text
    .split("\n")
    .map((line) => {
      const body = line.replace(/\r$/, "")
      if (FENCE.test(body)) {
        fenced = !fenced
        return line
      }
      const name = fenced ? undefined : LINE.exec(body)?.[1]
      const next = name === undefined ? undefined : replace(name)
      return next === undefined ? line : next + line.slice(body.length)
    })
    .join("\n")
}

export function find(text: string) {
  const names = new Set<string>()
  scan(text, (name) => void names.add(name))
  return [...names]
}

export function replace(text: string, results: ReadonlyMap<string, string>) {
  return scan(text, (name) => results.get(name))
}

function tail(text: string) {
  return text.length > OUTPUT_LIMIT ? `...${text.slice(-OUTPUT_LIMIT)}` : text
}

async function runInline(name: string, command: Command) {
  let child: ReturnType<typeof Bun.spawn<"ignore", "pipe", "pipe">>
  try {
    child = Bun.spawn(command.run, { stdin: "ignore", stdout: "pipe", stderr: "pipe", windowsHide: true })
  } catch (error) {
    return { line: `${name}: failed to start: ${error instanceof Error ? error.message : String(error)}`, exit: -1 }
  }
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    child.kill()
  }, command.timeout * 1000)
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]).finally(() => clearTimeout(timer))
  if (timedOut) return { line: `${name}: timed out after ${command.timeout}s`, exit }
  if (exit !== 0) return { line: `${name}: exit ${exit}: ${tail((stderr.trim() || stdout.trim()))}`, exit }
  return { line: tail(stdout.trim()) || `${name}: done`, exit }
}

function quote(arg: string) {
  return `'${arg.replaceAll("'", "''")}'`
}

// -EncodedCommand (base64 UTF-16LE) carries the command through Start-Process without requoting.
export function windowArgs(command: Command) {
  const script = `& ${command.run.map(quote).join(" ")}`
  return ["-NoExit", "-NoProfile", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")]
}

function launch(file: string, args: readonly string[], windowStyle: "Hidden" | "Normal") {
  launchDetached(file, args, { windowStyle }).on("error", (cause) =>
    void log(`launch failed: ${file}: ${cause.message}`),
  )
}

/** Runs an inline or window command and returns the text that replaces its marker line. */
export async function run(name: string, command: Command, sessionID: string) {
  if (command.mode === "window") {
    if (process.platform !== "win32") return `${name}: window mode is Windows-only`
    launch("pwsh", windowArgs(command), "Normal")
    await log(`${sessionID} ${name} window`)
    return `${name}: opened in a new window`
  }
  const result = await runInline(name, command)
  await log(`${sessionID} ${name} inline exit ${result.exit}`)
  return result.line
}

const queued = new Map<string, Array<{ name: string; command: Command }>>()

export async function queue(name: string, command: Command, sessionID: string) {
  queued.set(sessionID, [...(queued.get(sessionID) ?? []), { name, command }])
  await log(`${sessionID} ${name} queued afterTurn`)
  return `${name}: runs after this turn`
}

/** Launches afterTurn commands once the session is idle, so the turn is saved first. */
export function flush(sessionID: string) {
  const items = queued.get(sessionID)
  if (!items) return
  queued.delete(sessionID)
  for (const item of items) launch(item.command.run[0], item.command.run.slice(1), "Hidden")
}

// A failed audit write must not fail the agent's reply.
export async function log(entry: string) {
  await fs
    .mkdir(Global.Path.log, { recursive: true })
    .then(() => fs.appendFile(path.join(Global.Path.log, "markers.log"), `${new Date().toISOString()} ${entry}\n`))
    .catch((error) => console.error(`markers: failed to write log: ${error}`))
}

export * as Marker from "./marker"
