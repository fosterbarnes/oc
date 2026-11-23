import fs from "fs/promises"
import path from "path"
import { Global } from "../global"

// Steps typed after a revive in one draft (`/pass /revive /agent-push`). The TUI writes them before it
// revives; the revive pipeline settles the file `ready` or `failed`; the TUI that next opens the session
// claims it and sends the steps (ready) or puts them back in the prompt (failed or expired).
export type Mode = "install" | "no-install" | "single"
// `text`: a plain step's prompt, or a command step's request (slash.ts `splitSlashSteps`).
export type Step = { type: "send"; names: string[]; text?: string } | { type: "revive"; mode: Mode }
// A step as the session queue stores it (`Payload.chain`), with readonly arrays.
export type ReadonlyStep = { type: "send"; names: readonly string[]; text?: string } | { type: "revive"; mode: Mode }
export type Body = {
  sessionID: string
  writerPid: number
  at: number
  steps: Step[]
  // Labels of the steps that already ran, for the note each later step's agent reads.
  done: string[]
  request: string
  agent: string
  model: { providerID: string; modelID: string }
  variant?: string
  // Taken from the session queue: the queue resumes once the chain finishes.
  queued?: boolean
}
type State = "pending" | "ready" | "failed"

export const REVIVE_NAMES: Record<Mode, string> = {
  install: "revive",
  "no-install": "revive-no-install",
  single: "revive-single",
}

export function label(step: ReadonlyStep) {
  if (step.type === "revive") return `/${REVIVE_NAMES[step.mode]}`
  return step.names.length ? step.names.map((name) => `/${name}`).join(" ") : "a plain prompt"
}

/** What the user would type to run these steps again. */
export function chainText(steps: readonly ReadonlyStep[], request: string, separator = "\n") {
  const typed = steps
    .map((step) => {
      if (step.type !== "send") return label(step)
      return [...step.names.map((name) => `/${name}`), step.text ?? ""].filter(Boolean).join(" ")
    })
    .join(" ")
  return [typed, request].filter(Boolean).join(separator)
}

// A ready chain nobody opened in time is restored to the prompt instead of firing later by surprise.
export const READY_TTL_MS = 15 * 60_000
const PENDING_TTL_MS = 24 * 60 * 60_000

export function directory() {
  return path.join(Global.Path.state, "oc-revive", "resume")
}

/** Writes `body` as pending and returns its id, which the revive context carries to the pipeline. */
export async function write(body: Body, dir = directory()) {
  const id = `${body.sessionID}-${body.at}`
  await fs.mkdir(dir, { recursive: true })
  await Bun.write(file(dir, id, "pending"), JSON.stringify(body))
  return id
}

/** Moves a pending chain to `state`. A chain that is already settled (or never written) stays as it is. */
export async function settle(id: string, state: "ready" | "failed", dir = directory()) {
  await fs.rename(file(dir, id, "pending"), file(dir, id, state)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error
  })
}

/** Drops a pending chain whose revive never started. */
export async function discard(id: string, dir = directory()) {
  await fs.rm(file(dir, id, "pending"), { force: true })
}

/** Where a chain stands; undefined once claimed. */
export async function status(id: string, dir = directory()) {
  const states: State[] = ["pending", "ready", "failed"]
  for (const state of states) if (await Bun.file(file(dir, id, state)).exists()) return state
}

/**
 * Takes the settled chain for `sessionID`, if any. Two TUIs on one session cannot both send it. A ready chain is skipped by the TUI that wrote it (it is still alive for
 * /revive-single); a failed one is for anyone, the writer included.
 */
export async function claim(sessionID: string, pid: number, now = Date.now(), dir = directory()) {
  const names = await fs.readdir(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return []
    throw error
  })
  for (const name of names) {
    const match = name.match(/^(.+)-(\d+)\.(pending|ready|failed)\.json$/)
    if (!match) continue
    const at = Number(match[2])
    const state = match[3] as State
    if (state === "pending") {
      if (now - at > PENDING_TTL_MS) await fs.rm(path.join(dir, name), { force: true })
      continue
    }
    if (match[1] !== sessionID) continue
    const source = path.join(dir, name)
    const lock = `${source}.claim`
    // Exclusive create is the lock: Bun's rename on Windows lets two concurrent renames of one file succeed.
    const won = await fs.writeFile(lock, String(pid), { flag: "wx" }).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === "EEXIST") return false
        throw error
      },
    )
    if (!won) {
      // A claimer that died holding the lock must not block this chain forever.
      const held = await fs.stat(lock).catch(() => undefined)
      if (held && Date.now() - held.mtimeMs > _CLAIM_TTL_MS) await fs.rm(lock, { force: true })
      continue
    }
    const taken = await fs
      .readFile(source, "utf8")
      .then((text) => JSON.parse(text) as Body)
      .catch(() => undefined)
      .then(async (body) => {
        const own = state === "ready" && body?.writerPid === pid
        // An unreadable file can never be sent, so it goes too.
        if (!own) await fs.rm(source, { force: true })
        return own ? undefined : body
      })
      .finally(() => fs.rm(lock, { force: true }))
    if (!taken) continue
    return { body: taken, send: state === "ready" && now - at <= READY_TTL_MS }
  }
}

const _CLAIM_TTL_MS = 60_000

function file(dir: string, id: string, state: State) {
  return path.join(dir, `${id}.${state}.json`)
}

export * as ReviveResume from "./reviveResume"
