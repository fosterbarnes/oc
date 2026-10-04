import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261001064009_session_in_progress",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`session\` ADD \`session_in_progress\` integer DEFAULT 0 NOT NULL;`)
    })
  },
} satisfies DatabaseMigration.Migration
