import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261020143000_sessionViewedState",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`session\` ADD \`time_idle\` integer;`)
      yield* tx.run(`ALTER TABLE \`session\` ADD \`time_viewed\` integer;`)
    })
  },
} satisfies DatabaseMigration.Migration
