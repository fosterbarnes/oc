import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261002003418_sessionInputCancellation",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`session_input\` ADD \`cancelled_seq\` integer;`)
    })
  },
} satisfies DatabaseMigration.Migration
