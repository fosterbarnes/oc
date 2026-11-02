import path from "path"
import { Effect } from "effect"
import { Global } from "@opencode-ai/core/global"

// Upstream's plugin `ctx.storage`: one JSON file per key (`models`, `sessions/<id>`, `forks/<id>`).
const file = (key: string) => Bun.file(path.join(Global.Path.data, "claude-agent", `${key}.json`))

export const get = (key: string) =>
  Effect.promise(() =>
    file(key)
      .json()
      .catch((): unknown => undefined),
  )

export const set = (key: string, value: unknown) =>
  Effect.promise(() => Bun.write(file(key), JSON.stringify(value))).pipe(Effect.asVoid)

// oc sessions keep no fork lineage (upstream's `session.fork`), so it lives here. Only forks of a session Claude
// has a transcript for are recorded.
export const recordFork = Effect.fnUntraced(function* (sessionID: string, sourceID: string) {
  if ((yield* get(`sessions/${sourceID}`)) === undefined) return
  yield* set(`forks/${sessionID}`, sourceID)
})

export const forkSource = (sessionID: string) =>
  get(`forks/${sessionID}`).pipe(Effect.map((value) => (typeof value === "string" ? value : undefined)))

export * as ClaudeAgentStorage from "./storage"
