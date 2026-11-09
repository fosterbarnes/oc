import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

/**
 * Git tree hash of everything in `dir`'s working tree: tracked and untracked files, .gitignore respected.
 * Hashed through a temporary index, so the real index and the files are never touched. "" when git
 * cannot tell (no git, not a repo); callers treat that as unknown.
 */
export async function sourceTree(dir: string): Promise<string> {
  const index = path.join(os.tmpdir(), `oc-source-tree-${process.pid}-${Date.now()}`)
  const git = async (args: string[], env?: Record<string, string>) => {
    const child = Bun.spawn(["git", "-C", dir, "-c", "core.safecrlf=false", ...args], {
      env: { ...process.env, ...env },
      stdout: "pipe",
      stderr: "ignore",
    })
    const [out, code] = await Promise.all([new Response(child.stdout).text(), child.exited])
    if (code !== 0) throw new Error(`git ${args[0]} exited with code ${code}`)
    return out.trim()
  }
  try {
    // Copying the real index reuses its stat cache, so only changed files get rehashed.
    const real = path.resolve(dir, await git(["rev-parse", "--git-path", "index"]))
    await fs.copyFile(real, index).catch(() => undefined)
    await git(["add", "-A"], { GIT_INDEX_FILE: index })
    return await git(["write-tree"], { GIT_INDEX_FILE: index })
  } catch {
    return ""
  } finally {
    await fs.rm(index, { force: true }).catch(() => undefined)
  }
}
