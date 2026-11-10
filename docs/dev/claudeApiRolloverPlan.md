# Claude API-credit rollover - plan

Status: Done in v0.2.348 (option A). Phase 0 result 2026-11-10: the CLI path and the Agent SDK path were both
accepted, and both drew from Promotional credits. Written 2026-11-10.

## Goal

Attach a Claude Console API key (the Team plan's monthly API credit, $40/month here) to the `claude-code`
provider's account pool as a last-resort account. It must:

- Behave exactly like the pool's subscription accounts: same CLI, tools, skills, settings, proxied oc tools,
  steering, compaction, failover note. Only the auth source differs.
- Spend only with consent: when every subscription account is usage-limited, ask "use API credits?" first.
- Hand back automatically: once any subscription account is usable again, new turns go back to it.
- Be optional: no key configured means today's behavior, byte for byte.

## Facts (verified 2026-11-10)

- Anthropic docs (`platform.claude.com/docs/en/about-claude/api-credits-for-subscribers`): the credits cover the
  Claude API, the **Claude Agent SDK**, Managed Agents, and the Playground. They do **not** cover **Claude Code**.
  A Claude Code session on a credits-only org fails with `Credit balance too low`. Credits expire each
  billing cycle. When they run out, requests fail; nothing is charged to the plan unless the Console org has
  auto-reload or a card.
- oc's `claude-code` provider does **not** use the Agent SDK. It spawns `claude --print --input-format
  stream-json --output-format stream-json` itself (`provider/claude-code/cliArgs.ts:57`,
  `sessionManager.ts:1008`). From Anthropic's side this is Claude Code headless, entrypoint `sdk-cli`.
- The Agent SDK (`@anthropic-ai/claude-agent-sdk`, pinned `0.3.301` in `packages/opencode/package.json`)
  spawns the same `claude` binary with the same stream-json protocol, with `CLAUDE_CODE_ENTRYPOINT=sdk-ts`.
  So "Agent SDK" and "Claude Code" are the same binary; Anthropic tells them apart by entrypoint and client
  metadata. **How the credit check classifies each path is undocumented.** Everything below hinges on it.
- oc's separate `claude-agent` provider (`provider/claude-agent/`, FORK.md row "Claude Agent provider") runs
  through the real Agent SDK and already maps `settings.apiKey` to `ANTHROPIC_API_KEY`
  (`claude-agent/upstream/claude/query-options.ts:36`). It turns off Claude Code's own tools, settings, and
  memory, and has no pool or failover. It does **not** act like `claude-code`.
- The pool (`claude-code/accounts.ts`): ids are config dirs (`default` = `~/.claude`). `limitedUntil`,
  `currentAccount`, `sessionAccounts` (pins) persist in `<data>/claude-code/account-pool.json`.
  `rankUsable` / `failoverCandidates` pick the next account. With none usable, `turnStream.ts`
  `queueAccountSwitch` sets `allLimited` and the turn ends with the CLI's limit text.
- Failover ask UI already exists: `turnStream.ts` `pickAccount` / `askFailover` (oc `question` tool,
  provider-executed, `account_failover_` id kept out of Claude history) and `failoverQuestion.ts`.
- Spawn env: `spawnEnv.ts` `claudeSpawnEnv`. For a pool account it sets `CLAUDE_CONFIG_DIR` and **deletes**
  `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`.
- Account folders: `accountManage.ts` `createAccountDir` makes `~/.claudeN` with junctions to shared
  `~/.claude` items, including `projects`, so a conversation resumes across accounts (`sharesTranscripts`).

## Options considered

| # | Approach | Acts like claude-code | Credits apply | Cost |
|---|---|---|---|---|
| A | API-key account inside the `claude-code` pool; same CLI spawn, key in env | Yes, identical | Unknown: it is the Claude Code path | Small |
| B | Same as A, but the spawn sets `CLAUDE_CODE_ENTRYPOINT=sdk-ts` so it reads as Agent SDK | Yes | Probably | Small, but **rejected**: it mislabels the client to change billing. Do not build. |
| C | Route the API account's process through the real SDK `query()` inside `claude-code` (SDK owns the process; oc feeds its message stream into `turnStream`) | Yes, after an adapter | Yes (documented) | Large: SDK owns stdin/stdout and control requests (`canUseTool`), so `turnStream`, `controlRequest.ts`, steering, and interrupt need an SDK-backed transport |
| D | On rollover, switch the session to `claude-agent/<same model>` with the API key | No: Claude Code tools, settings, memory, and skills are off | Yes (documented) | Medium: cross-provider model switch plus a parity gap |

**Recommendation:** A, gated by a Phase 0 probe. It is the only option that is both small and exactly the
same as the subscription accounts. If the probe shows the CLI path is refused, stop and choose between C
(full parity, big) and D (fast, reduced parity) with the user. Do not do B.

## Phase 0 - probe which path the credits accept (gate)

Needs the user's approval: it spends real credit (two Haiku requests, under $0.01). Run from a scratch
folder, not the repo. Key in `$env:OC_PROBE_KEY` for the shell only; never write it to a file.

1. Note the **Promotional credits** balance at `platform.claude.com/settings/billing`, with the linked org selected.
2. CLI path (what option A uses), in an empty `CLAUDE_CONFIG_DIR` so no OAuth login can be picked up:
   `$env:CLAUDE_CONFIG_DIR = <empty temp dir>; $env:ANTHROPIC_API_KEY = $env:OC_PROBE_KEY;`
   `claude --print --model claude-haiku-5-5 --output-format json "Reply OK"`
   Record: success or the error text (`Credit balance too low` means refused).
3. SDK path: a Bun script (scratch dir) calling `query({ prompt: "Reply OK", options: { model:
   "claude-haiku-5-5", env: { ...process.env, ANTHROPIC_API_KEY, CLAUDE_CONFIG_DIR: <empty temp dir> } } })`.
   Record the result.
4. Re-check the balance (it can lag a few minutes). Confirm which call drew it down.

Outcomes:
- CLI accepted and charged to promotional credits: build option A (phases 1-4).
- CLI refused, SDK accepted: stop, report, ask the user C vs D. Record the result in `buildNotes.md`.
- Both refused: the org is not linked or has no credit yet; stop and report.

## Phase 1 - config and key storage

- New `claude-code` provider option in `opencode.jsonc`, separate from `accounts` so nothing that reads
  `accounts` (TUI usage sidebar, account manager, names) changes:

  ```jsonc
  "apiAccount": {
    "dir": "~/.claudeApi",                  // its own config dir; created like other pool accounts
    "apiKey": "{env:CLAUDE_CREDIT_API_KEY}"   // config substitution; key lives in a user env var, not the file
  }
  ```

  Add it to the provider options type in `claude-code/types.ts`, beside `accounts`.
- Key: the user sets it once with `[Environment]::SetEnvironmentVariable('CLAUDE_CREDIT_API_KEY', '<key>', 'User')`.
  The name must not be `ANTHROPIC_API_KEY`, which would leak into every spawn and into `startupDiagnostics`
  (`anthropicApiKeyInEnv`). With the variable unset, the option is inert. Log one warning, never the value.
- New oc.json setting `claudeApiRollover: "ask" | "always" | "off"`, default `ask`, next to `claudeFailover`
  in `config/oc.ts` (validation at line ~76) and `tui/src/ocSettings.ts`. Add a toggle to the existing
  Claude palette in `tui/src/claudeCommands.tsx`, the same way `claudeFailover` is done (line ~277).

## Phase 2 - pool membership (accounts.ts)

- `API_ACCOUNT` id = the resolved `apiAccount.dir`. It is **not** in `poolAccountIds` output, so
  `rankUsable`, `failoverCandidates`, `nextUsableAccount`, the sidebar, and the account manager never
  see it. That keeps the subscription logic unchanged.
- Rollover state: reuse `sessionAccounts` (pins). A session that accepted rollover is pinned to `API_ACCOUNT`.
- Hand-back: in `turnAccount`, when the pin is `API_ACCOUNT` and `nextUsableAccount(ids)` returns a
  subscription account, clear the pin and return that account. One branch at the top of `turnAccount`;
  `sessionPin` must accept `API_ACCOUNT` as a valid pin (today it filters by `ids.includes`).
- `poolConfigDir(API_ACCOUNT)` returns the dir like any other account. `createAccountDir(apiAccount.dir)`
  on first use gives it the shared `projects` junction, so `sharesTranscripts` is true and the same Claude
  conversation resumes on the API account (no catch-up re-send, no duplicate tool runs).
- Credits exhausted: mark `API_ACCOUNT` limited until `earliestLimitedUntil(ids)` (when a subscription
  frees up, it takes over anyway). Fall back to `UNKNOWN_RESET_MS` when that is undefined.

## Phase 3 - spawn env (spawnEnv.ts)

- Add `apiKey?: string` to `claudeSpawnEnv` opts. When set: keep the `configDir` branch (sets
  `CLAUDE_CONFIG_DIR`, strips inherited credentials), then set `env.ANTHROPIC_API_KEY = opts.apiKey`.
  Order matters: the strip runs first.
- `sessionManager.ts:1008`: pass `apiKey` only when `account === API_ACCOUNT`. Warm-up
  (`warmup/cli.ts:69`, `warmup/index.ts`) must **skip** the API account: warm-ups spend tokens, and on
  credits that is real money.
- `--print` with an API key and no OAuth login works headless. The empty dir has no `.claude.json`
  onboarding; confirm in Phase 0 step 2 that no prompt blocks a headless run.

## Phase 4 - the ask (turnStream.ts)

- In `queueAccountSwitch`, where `choices` is empty (all subscription accounts limited): if `apiAccount` is
  configured, its key resolves, `API_ACCOUNT` is not limited, and `claudeApiRollover !== "off"`, queue
  `[{ id: API_ACCOUNT }]` as `switchTo` instead of setting `allLimited`.
- `pickAccount`: for `API_ACCOUNT`, ignore `claudeFailover`. `always` returns it; `ask` always asks through
  `askFailover`, even when `claudeFailover` is `auto`. If the agent has no `question` tool (subagents),
  `ask` means **no**: never spend credit without a human yes. The parent hits the limit itself and asks there.
- `failoverQuestion.ts`: when the only choice is the API account, word it as consent, not a pick:
  header `Claude limit`, question `All Claude accounts hit their usage limits. Continue on API credits?`,
  options `Use API credits` (description: `Billed to the linked Console org until a Claude account resets`)
  and the existing `Stop`. Keep `FAILOVER_STOP_LABEL` and `pick` unchanged.
- One answer per session: a yes pins the session (Phase 2), so later turns do not ask again until the
  hand-back. A no sets `failoverDeclined` as today.
- `switchAccount` already writes the `Claude account switched` note with `poolAccountLabel`. Make
  `poolAccountLabel(API_ACCOUNT)` return `API credits`.
- Credit exhaustion: add `credit balance is too low` to the limit-text matching in `cliEvents.ts`
  `isAccountLimitError` (line 655) as a separate `api-credit` reason, so it marks `API_ACCOUNT` per Phase 2
  and ends the turn with a plain message (`API credits used up; waiting for a Claude account to reset`)
  instead of looping failover.

## Phase 5 - docs and notes

- Wiki (`..\oc.wiki`): Claude accounts page gets an "API credit rollover" section: setup (env var,
  `apiAccount`, palette toggle), the ask, hand-back, what it costs, and a note to set a Console spend limit
  or keep auto-reload off.
- `FORK.md`: extend the account-pool row. `docs/buildNotes/buildNotes.md` entry, version bump per `AGENTS.md`.

## Verification

- Unit tests in `packages/opencode/test/provider/claude-code/` (existing pool tests use `_resetAccountPool`,
  `_setAccountPoolFile`): `turnAccount` hand-back from an API pin; API account never in
  `failoverCandidates`; `claudeSpawnEnv` with `apiKey` sets the key **after** stripping inherited
  credentials; warm-up skips the API account. These guard a billing safety contract, so keep them.
- Fake-model scenario (`TestLLMServer`, `docs/dev/testing.md`): all accounts rejected, `ask` mode, answer
  `Use API credits`, then the turn continues and the note shows `API credits`; answer `Stop` and nothing
  spawns on the API account; a subagent with no `question` tool never spawns on it.
- Real check (needs the user): one rollover turn on Haiku, then confirm the Console balance moved and the
  Team usage did not.

## Risks

- Phase 0 may show the CLI path is refused. That is the main unknown; the plan stops there by design.
- Anthropic may change how it classifies clients. If credits start failing with `Credit balance too low`
  on a funded org, that is the cause; the Phase 4 message makes it visible rather than silent.
- Cost: Opus at large context burns $40 fast. The ask is the guard; the description should say so. Suggest
  the user set a workspace spend limit in the Console.
- `{env:...}` substitution resolves at config load. Setting the env var later needs an oc restart.
