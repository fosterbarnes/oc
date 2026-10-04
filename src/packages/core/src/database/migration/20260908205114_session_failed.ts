import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260908205114_session_failed",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`session\` ADD \`session_failed\` integer DEFAULT 0 NOT NULL;`)
    })
  },
} satisfies DatabaseMigration.Migration
