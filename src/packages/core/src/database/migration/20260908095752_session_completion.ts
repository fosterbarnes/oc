import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260908095752_session_completion",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`session\` ADD \`session_complete\` integer DEFAULT 0 NOT NULL;`)
    })
  },
} satisfies DatabaseMigration.Migration
