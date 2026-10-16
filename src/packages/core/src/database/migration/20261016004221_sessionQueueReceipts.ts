import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261016004221_sessionQueueReceipts",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`session_queue\` ADD \`message_id\` text;`)
    })
  },
} satisfies DatabaseMigration.Migration
