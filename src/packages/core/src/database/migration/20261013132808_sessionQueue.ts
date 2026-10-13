import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261013132808_sessionQueue",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`session_queue\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`state\` text NOT NULL,
          \`payload\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_session_queue_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(
        `CREATE INDEX \`session_queue_session_time_created_idx\` ON \`session_queue\` (\`session_id\`,\`time_created\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
