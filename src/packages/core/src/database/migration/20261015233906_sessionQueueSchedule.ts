import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261015233906_sessionQueueSchedule",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`session_queue\` ADD \`run_at\` integer;`)
      yield* tx.run(`ALTER TABLE \`session_queue\` ADD \`target\` text DEFAULT 'current' NOT NULL;`)
    })
  },
} satisfies DatabaseMigration.Migration
