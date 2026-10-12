/**
 * Claude Code's own task list, read from where the CLI saves it:
 * `<config dir>/tasks/<Claude session id>/<n>.json`, one file per task
 * (`id`, `subject`, `status`, ...). Observed on CLI 2.1.285; the layout is not
 * documented, so anything unexpected yields no list rather than an error.
 */
import { readdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { expandHome } from "./accounts.js"
import { log } from "./logger.js"

const STATUSES = ["pending", "in_progress", "completed"]

/** The list as oc `todowrite` input, or undefined when there is none to show. */
export function readClaudeTaskList(configDir: string | undefined, claudeSessionId: string) {
  const root = expandHome(configDir ?? process.env.CLAUDE_CONFIG_DIR ?? path.join(homedir(), ".claude"))
  const dir = path.join(root, "tasks", claudeSessionId)
  const tasks = readTasks(dir)
  if (!tasks?.length) return undefined
  return {
    todos: tasks
      .toSorted((a, b) => Number(a.id) - Number(b.id))
      .map((task) => ({ id: task.id, content: task.subject, status: task.status, priority: "medium" })),
  }
}

function readTasks(dir: string) {
  try {
    return readdirSync(dir)
      .filter((name) => /^\d+\.json$/.test(name))
      .flatMap((name) => {
        const task = JSON.parse(readFileSync(path.join(dir, name), "utf8")) as Record<string, unknown>
        return typeof task.subject === "string" && typeof task.status === "string" && STATUSES.includes(task.status)
          ? [{ id: String(task.id ?? name.slice(0, -5)), subject: task.subject, status: task.status }]
          : []
      })
  } catch (error) {
    log.warn("cannot read claude task list", { dir, error: String(error) })
    return undefined
  }
}
