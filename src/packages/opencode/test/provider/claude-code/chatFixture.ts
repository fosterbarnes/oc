// Shared by fakeModel.test.ts (scripted fake model) and realModel.test.ts (OC_REAL_MODEL=1):
// one oc chat on the Claude provider, isolated from the real profile.
import { expect } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, rm, rmdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { Effect, Schedule } from "effect"
import type { CliFixture } from "../../lib/cli-process"
import { testProviderConfig } from "../../lib/test-provider"

// One oc chat on the Claude provider over `opencode serve`'s HTTP API, the way the TUI drives
// it, in a git-inited `work` folder (see `initRepo`). `chatConfig` proxies Task and Question, as
// the user's config does (the provider default is Task, run_after_turn, and time), and turns on oc's
// opt-in `todos`: without it oc also turns off Claude Code's TodoWrite, and the flow checks the
// todo list. `resume` reopens
// an existing chat on a new server, the way restarting oc does. `root` holds the project and
// Claude's config dir; oc's own data stays in the fixture home. `real` talks to the real model
// with the shell's CLAUDE_CODE_OAUTH_TOKEN instead of the fixture's fake.
export const openChat = Effect.fnUntraced(function* (
  fixture: CliFixture,
  options: { resume?: string; root?: string; real?: boolean; modelID?: string; turnStats?: boolean } = {},
) {
  const root = options.root ?? fixture.home
  const project = path.join(root, "work")
  const defaultModel = options.modelID ?? "claude-sonnet-4-5"
  if (!options.resume) yield* initRepo(project)
  const server = yield* fixture.opencode.serve({
    env: {
      ...claudeEnv(root, options.real ? undefined : fixture.llm.url),
      // The test preload's in-memory database would not survive a restart.
      OPENCODE_DB: path.join(fixture.home, "opencode.db"),
      OPENCODE_CONFIG_CONTENT: JSON.stringify(
        chatConfig(fixture.llm.url, { turnStats: options.turnStats ?? options.real }),
      ),
    },
  })
  const sdk = createOpencodeClient({ baseUrl: server.url, directory: project })
  const sessionID =
    options.resume ?? (yield* Effect.promise(() => sdk.session.create({ title: "claudeTestFlow" }))).data!.id
  return {
    project,
    server,
    sdk,
    sessionID,
    prompt: (text: string, model: { modelID?: string; variant?: string } = {}) =>
      Effect.promise(() =>
        sdk.session.prompt({
          sessionID,
          model: { providerID: "claude-code", modelID: model.modelID ?? defaultModel },
          variant: model.variant,
          parts: [{ type: "text", text }],
        }),
      ),
    parts: Effect.promise(() => sdk.session.messages({ sessionID })).pipe(
      Effect.map((result) => result.data!.flatMap((message) => message.parts)),
    ),
  }
})

// oc config for a Claude chat: the user's `proxyTools` and opt-in `todos` (see `openChat`).
// `turnStats` adds the CLI's cumulative cost footer to each reply; oc's own cost is priced
// from the turn's last API call only.
export function chatConfig(llmUrl: string, options: { turnStats?: boolean } = {}) {
  const config = testProviderConfig(llmUrl)
  return {
    ...config,
    todos: true,
    provider: {
      ...config.provider,
      "claude-code": { options: { proxyTools: ["Task", "Question"], turnStats: options.turnStats === true } },
    },
  }
}

// Env for a spawned `claude`: a temp config dir so it never reads the real ~/.claude. With
// `llmUrl` it talks to the fake with a dummy key and never reaches api.anthropic.com; without
// it the shell's CLAUDE_CODE_OAUTH_TOKEN logs in. The CLI looks for CLAUDE.md in every parent
// of its cwd up to the drive root, git repo or not. The temp dir sits under the real profile
// on Windows, so CLAUDE.md loading is off there. A BASH_ENV from the shell (an agent host's
// wrapper) would run in front of every Bash tool command.
export function claudeEnv(dir: string, llmUrl?: string) {
  const underProfile = !path.relative(os.homedir(), dir).startsWith("..")
  return {
    USERPROFILE: dir,
    BASH_ENV: "",
    ...(underProfile && { CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1" }),
    ...(llmUrl && { ANTHROPIC_BASE_URL: llmUrl.replace(/\/v1$/, ""), ANTHROPIC_API_KEY: "sk-ant-test" }),
    CLAUDE_CONFIG_DIR: path.join(dir, "claude"),
    DISABLE_AUTOUPDATER: "1",
  }
}

// oc looks for skills and AGENTS.md in parent folders up to the project's worktree. Without a
// repo that walk reaches the real profile. A subfolder, not the fixture home: the home holds
// bun's transpiler cache, which oc's per-step git snapshot would scan every turn.
export const initRepo = (dir: string) => Effect.promise(() => Bun.$`git init -q ${dir}`.quiet())

// A scoped temp dir whose parents hold no CLAUDE.md, for the CLAUDE.md check. On Windows the
// system temp sits under the profile, so it uses C:\ocTestTmp (the user approved that path) and
// removes the parent too once empty. Killing the server leaves its `claude` child running
// for a moment with the project as cwd, so removal retries (Bun's rm ignores maxRetries).
export const outsideProfile = Effect.acquireRelease(
  Effect.promise(async () => {
    const base = process.platform === "win32" ? "C:\\ocTestTmp" : os.tmpdir()
    await mkdir(base, { recursive: true })
    return mkdtemp(path.join(base, "oc-"))
  }),
  (dir) =>
    Effect.tryPromise(() => rm(dir, { recursive: true, force: true })).pipe(
      Effect.retry(Schedule.spaced("100 millis").pipe(Schedule.both(Schedule.recurs(50)))),
      Effect.orDie,
      Effect.andThen(
        Effect.promise(async () => {
          if (process.platform === "win32") await rmdir(path.dirname(dir)).catch(() => undefined)
        }),
      ),
    ),
)

// Fails when a request to the model carries the real profile's instructions or skills.
export function expectIsolated(inputs: readonly unknown[]) {
  const sent = JSON.stringify(inputs)
  const files = [path.join(os.homedir(), ".claude", "CLAUDE.md"), path.join(os.homedir(), "AGENTS.md")]
  expect(files.filter((file) => sent.includes(JSON.stringify(file).slice(1, -1)))).toEqual([])
  const skills = [".agents", ".claude"]
    .map((dir) => path.join(os.homedir(), dir, "skills"))
    .filter((dir) => existsSync(dir))
    .flatMap((dir) => Array.from(new Bun.Glob("*/SKILL.md").scanSync({ cwd: dir })))
  expect(skills.map((skill) => `oc:${path.dirname(skill)}:`).filter((name) => sent.includes(name))).toEqual([])
}
