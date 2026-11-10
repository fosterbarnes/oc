export * as OcSource from "./ocSource"

import { OcRelease } from "./ocRelease"

// TEMPORARY: oc ships no executable releases yet. Until it does, /update syncs the saved /revive source
// folder (`revive.build.source`) to GitHub main and rebuilds. The release path (`OcRelease`,
// `Revive.downloadRelease`, `updateNotice`) stays dormant for when releases return.

export const REPO_URL = `https://github.com/${OcRelease.REPO}`
export const BRANCH = "main"

export type Status = {
  branch: string
  // Fetched main; /update resets to exactly this commit, so a later push is never applied unseen.
  target: string
  // Changed tracked files (staged or not). Untracked files are never touched, so they are not listed.
  dirty: string[]
  // Local commits not on main / main commits not local.
  ahead: number
  behind: number
}

/** Fetches main by URL (any remote name works) and compares it with `dir`. Read-only for the work tree. */
export async function status(dir: string, repo = REPO_URL): Promise<Status> {
  await git(dir, ["fetch", "--quiet", repo, BRANCH])
  const target = (await git(dir, ["rev-parse", "FETCH_HEAD"])).trim()
  const branch = (await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()
  const dirty = (await git(dir, ["status", "--porcelain", "--untracked-files=no"]))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3))
  const [ahead, behind] = (await git(dir, ["rev-list", "--left-right", "--count", `HEAD...${target}`]))
    .trim()
    .split(/\s+/)
    .map(Number)
  return { branch, target, dirty, ahead, behind }
}

/** Overwrites tracked changes and local commits in `dir` with `target`. Refuses any branch but main. */
export async function reset(dir: string, target: string) {
  const branch = (await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()
  if (branch !== BRANCH) throw new Error(`oc source is on ${branch}, not ${BRANCH}: ${dir}`)
  await git(dir, ["reset", "--hard", "--quiet", target])
}

async function git(dir: string, args: string[]) {
  // No credential prompt: a hidden helper or the TUI would wait on it forever.
  const child = Bun.spawn(["git", "-C", dir, ...args], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [out, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) throw new Error(`git ${args[0]} failed: ${error.trim() || `exit code ${code}`}`)
  // Raw: porcelain status lines start with a meaningful space.
  return out
}
