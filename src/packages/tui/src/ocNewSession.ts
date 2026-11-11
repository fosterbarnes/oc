import fs from "node:fs"
import path from "node:path"
import type { OpencodeClient } from "@opencode-ai/sdk/v2"
import { nextProjectTitle } from "@opencode-ai/core/util/ocSession"

// Folders under the oc home dir for the New session picker. Name sort skips per-folder stats.
// The configured path is resolved to its on-disk spelling: case-insensitive disks accept
// `/Users/Foster` for `/Users/foster`, but session directories (and path.relative) use the real one.
export function listHomeDirs(homeDir: string, sort: string) {
  const listing = (() => {
    try {
      const root = fs.realpathSync.native(homeDir)
      return { root, entries: fs.readdirSync(root, { withFileTypes: true }) }
    } catch {
      return { root: homeDir, entries: [] }
    }
  })()
  const dirs = listing.entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, fullPath: path.join(listing.root, entry.name) }))
  if (sort !== "modified") return dirs.toSorted((a, b) => a.name.localeCompare(b.name))
  return dirs
    .map((dir) => ({ ...dir, mtimeMs: mtime(dir.fullPath) }))
    .toSorted((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name))
}

function mtime(fullPath: string) {
  try {
    return fs.statSync(fullPath).mtimeMs
  } catch {
    return 0
  }
}

// Same steps as `session bootstrap` and the launcher, over the TUI's existing server connection.
// The client defaults to the Home directory, so create and prompt route to `directory` explicitly.
export async function bootstrapSession(client: OpencodeClient, directory: string) {
  const sessions = await client.experimental.session.list({ roots: true, limit: 500 }, { throwOnError: true })
  const title = nextProjectTitle(
    sessions.data.map((item) => item.title),
    directory,
  )
  const session = await client.session.create(
    { directory, title, metadata: { ocAutoRename: { state: "pending", title } } },
    { throwOnError: true },
  )
  await client.session.prompt(
    {
      sessionID: session.data.id,
      directory,
      noReply: true,
      parts: [{ type: "text", text: `Working directory initialized: ${directory}`, synthetic: true }],
    },
    { throwOnError: true },
  )
  return session.data.id
}
