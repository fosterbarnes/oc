export * as Database from "./database"

import { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"
import { layer as sqliteLayer } from "#sqlite"
import { Context, Effect, Layer } from "effect"
import { Global } from "../global"
import { Flag } from "../flag/flag"
import { closeSync, existsSync, openSync } from "node:fs"
import { chmod } from "node:fs/promises"
import { isAbsolute, join } from "path"
import { DatabaseMigration } from "./migration"
import { InstallationLocal } from "../installation/version"
import { makeGlobalNode } from "../effect/app-node"

const makeDatabase = EffectDrizzleSqlite.makeWithDefaults()
type DatabaseShape = Effect.Success<typeof makeDatabase>

export interface Interface {
  db: DatabaseShape
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/storage/Database") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = yield* makeDatabase

    yield* db.run("PRAGMA journal_mode = WAL")
    yield* db.run("PRAGMA synchronous = NORMAL")
    yield* db.run("PRAGMA busy_timeout = 5000")
    yield* db.run("PRAGMA cache_size = -64000")
    yield* db.run("PRAGMA foreign_keys = ON")
    yield* db.run("PRAGMA wal_checkpoint(PASSIVE)")
    yield* DatabaseMigration.apply(db)

    return { db }
  }).pipe(Effect.orDie),
)

export function layerFromPath(filename: string) {
  return Layer.unwrap(
    Effect.promise(() => restrictToOwner(filename)).pipe(
      Effect.as(layer.pipe(Layer.provide(sqliteLayer({ filename })))),
    ),
  )
}

// SQLite creates new sidecars with the database's mode, but does not tighten existing sidecars.
// Windows relies on the user profile directory's inherited ACLs instead of POSIX modes.
async function restrictToOwner(filename: string) {
  if (process.platform === "win32" || filename === ":memory:") return
  // Opening and closing an existing database can release another connection's POSIX locks.
  // Create missing files synchronously so another fiber cannot open one before it is restricted.
  if (!existsSync(filename)) closeSync(openSync(filename, "a", 0o600))
  await chmod(filename, 0o600)
  await Promise.all(
    [`${filename}-wal`, `${filename}-shm`].map((file) =>
      chmod(file, 0o600).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error
      }),
    ),
  )
}

export function path() {
  if (Flag.OPENCODE_DB) {
    if (Flag.OPENCODE_DB === ":memory:" || isAbsolute(Flag.OPENCODE_DB)) return Flag.OPENCODE_DB
    return join(Global.Path.data, Flag.OPENCODE_DB)
  }
  // Own file: stock OpenCode shares this data dir and can migrate its opencode.db into a schema oc
  // refuses. oc builds bake the git branch as the channel, so the channel never picks the file.
  return join(Global.Path.data, InstallationLocal ? "oc-local.db" : "oc.db")
}

export const node = makeGlobalNode({ service: Service, layer: layerFromPath(path()), deps: [] })
