# Usage sidebar on macOS: plan

Status: implemented in v0.2.337 (2026-11-08); Keychain uses `isDefaultClaudeDir`, and the clear action is `saveUserUsageProviders(home, undefined)`. Package: `src/packages/tui`, folder
`src/routes/session/sidebar-tools/` (paths below are relative to it).

## What the screenshot shows, and why

Diagnosed on the Mac (v0.2.336) by running each probe directly:

| Row | Cause | Bug? |
| --- | --- | --- |
| `Codex :  0%h,  12%w` + `11/9/26 ~2:54AM, ~2:48AM 11/9/26` | Intended layout: each value sits under its reset's clock digit, and later windows flip to `~time date` (`formatUsageRows`). Data is live and correct. | No |
| `Cursor: sign in` / `Cursor auth required` / `open Usage to paste a new cookie` / `Renewal date unknown` | `cursorAuth/accessToken` in `~/Library/Application Support/Cursor/.../state.vscdb` expired 2026-10-15 (Cursor desktop not opened since). `usage-summary` returns 401. The refresh token is the same expired JWT; `api2.cursor.sh/oauth/token` answers `shouldLogout: true`. The probe is right, but it spends a request on a token it could have rejected locally, and says the same thing four times. | Noise |
| `OpenCode Go: unavailable` / `unavailable` | Mac `~/.local/share/opencode/auth.json` holds only `openai`. No key, so nothing to show. Shown because `DEFAULT_USAGE_PROVIDERS` lists it and `~/.config/openSidebar/config.json` has no `usageProviders`. | Noise |
| `OpenRouter: unavailable` | Same: no `openrouter` key in auth.json, no `OPENROUTER_API_KEY`. | Noise |
| No Claude row, though the session runs Claude Opus | `claude-code` is not in `DEFAULT_USAGE_PROVIDERS`. And even when enabled, `probeClaudeCodeUsage` reads `<configDir>/.credentials.json`, which **does not exist on macOS**: Claude Code stores its OAuth login in the login Keychain. | **Yes (mac)** |

Keychain facts (checked on this Mac, no secrets printed):

- Service `Claude Code-credentials` for the default dir (no `CLAUDE_CONFIG_DIR`), and
  `Claude Code-credentials-<sha256(CLAUDE_CONFIG_DIR).hex.slice(0, 8)>` otherwise.
  `~/.claude2` -> `/Users/foster/.claude2` -> `4de14e5d`, which matches the stored item.
- Account is the user name (`os.userInfo().username`). Value is the same JSON as
  `.credentials.json` (`{ claudeAiOauth: { accessToken, expiresAt, subscriptionType, ... } }`).
- `security find-generic-password -a <user> -s <service> -w` reads it with no prompt (Claude Code created
  the item through `/usr/bin/security`, so that binary is on its ACL).
- Claude Code hashes the env value as given (NFC-normalized). oc passes `path.resolve(expandHome(dir))`
  (`opencode/src/provider/claude-code/accounts.ts` -> `spawnEnv.ts` `CLAUDE_CONFIG_DIR`); hash that same string.
  The default account (`poolAccountIds`'s `defaultDir`, spawned without `CLAUDE_CONFIG_DIR`) uses the bare name.

Also wrong but harmless: `resolveAuthPath` (`usage/fetch.ts`) guesses `~/Library/Application Support/opencode`
on darwin and `%LOCALAPPDATA%\opencode` on win32. oc uses xdg-basedir everywhere (`Global.Path.data`,
`~/.local/share/opencode`), and only the hard-coded fallback in `readAuthContent` makes it work.

## Changes

### 1. Claude usage reads the macOS Keychain (the real bug)

`usage/claude.ts`, `probeClaudeCodeUsage`:

- Replace the inline `readFile(credentialsPath)` with one helper `readClaudeOauth(configDir, credentialsPath, options)`
  below the main export: on darwin try the Keychain first, then fall back to the file (Claude Code itself falls
  back to the file when the Keychain fails). Elsewhere, file only. Same `{ accessToken, expiresAt }` shape out.
- Keychain read: `Bun.spawn(["security", "find-generic-password", "-a", os.userInfo().username, "-s", service, "-w"])`,
  `stdout` as text, `JSON.parse`; 5 s timeout via `AbortSignal.timeout`; any non-zero exit or parse failure -> `undefined`.
- Service name: bare when `configDir` equals the default dir and `CLAUDE_CONFIG_DIR` is unset (same rule as
  `claudeProfilePath` in `usage/plans.ts`, reuse it rather than writing a third copy), else the 8-char sha256 suffix
  of `configDir.normalize("NFC")`. `configDir` is already `path.resolve`d, which matches what `spawnEnv.ts` passes.
- Test seam: add `claudeKeychain?: (service: string) => Promise<string | undefined>` and `platform?` to
  `UsageOptions` (`usage/fetch.ts`), defaulting to the `security` call and `process.platform`.
- Never write back to the Keychain or refresh the token (same rule as today's file read; the comment above the
  function already says why).
- Callers that pass `claudeCredentialsPath: path.join(dir, ".credentials.json")` (`sidebarUsage.tsx` ~252,
  `probeClaudeCodePool` ~195) keep working: `configDir` is derived from that path's dirname.

### 2. Default providers follow what is connected

The default list shows providers nobody configured and hides the one in use. Replace the fixed default with
"auto" until the user picks:

- `settings.ts`: `usageProviders` becomes `UsageProviderId[] | undefined`; `undefined` (no `usageProviders` key in
  any layer) means auto. `defaultSidebarSettings` returns `undefined`; `normalizeSidebarSettings` keeps it. Drop
  `DEFAULT_USAGE_PROVIDERS` once nothing reads it (check `providers.ts` callers and tests).
- Probes get a distinct "nothing to read" answer, decided from local files only, before any request:
  - OpenAI: no `openai` entry in auth.json -> `reason: "no-credentials"`.
  - OpenCode Go / OpenRouter: no key -> `reason: "no-credentials"` (today both are bare `{ ok: false }`).
  - Cursor: no opencode credential, no pasted cookie, and the desktop token is missing **or its JWT `exp` has
    passed** -> `reason: "no-credentials"`. Decode `exp` with the same base64url step `cursorSessionCookie` does.
    This also saves the 401 round trip seen on this Mac.
  - Claude: existing `reason: "signed-out"` already means this.
- `sidebarUsage.tsx`: in auto mode, probe all of `USAGE_PROVIDER_IDS` (credential-less probes return before the
  network), and a provider is visible unless its snapshot is a no-credentials/signed-out result. One helper
  `visibleUsageProviders()` replaces the direct `usageProviders()` reads in the render, `refreshOldUsage`, and
  `resolveUsagePlans` input. Use `USAGE_PROVIDER_OPTIONS` order.
- Usage menu ("Usage providers" dialog, `selectUsageSettings`): in auto mode, mark currently visible providers as
  selected and add footer `auto`. The first toggle saves an explicit list (today's behavior from then on). Add one
  entry "Show connected providers (auto)" that deletes the `usageProviders` key from
  `~/.config/openSidebar/config.json` (new small `clearUserUsageProviders` next to `saveUserUsageProviders`).
- Existing users with an explicit list (Windows) see no change.

### 3. Fallback rows say it once

`sidebarUsage.tsx` `usageRows`, fallbacks for each provider:

- Collapse every two-line `X: unavailable` / `unavailable` fallback (Codex, Claude, OpenCode Go) to one line.
  The second line only mirrored the reset row of the data layout.
- Explicitly selected but no credentials: one line `OpenCode Go: not connected` (Codex: `Codex : run /connect`,
  Claude: `Claude: run claude auth login`, Cursor: `Cursor: sign in`).
- Cursor reauth: `Cursor: sign in` plus one muted hint `open Usage to paste a cookie`; drop the
  `Cursor auth required` line.
- `planLine`: skip the line when the provider has no usage data and the plan has no date
  (`atMs === undefined`). "Renewal date unknown" under a signed-out provider is noise; keep it when the meter
  works and only the date is missing (it invites a manual date from the Usage menu).

### 4. Auth path matches oc

`usage/fetch.ts`: `resolveAuthPath` returns `path.join(Global.Path.data, "auth.json")` (import
`Global` from `@opencode-ai/core/global`, already used by `tui/src/app.tsx`), keeping the `OPENCODE_AUTH_PATH`
override and the `homeDir`/`env` test inputs (when a test passes `homeDir`, use `<homeDir>/.local/share/opencode`
or `XDG_DATA_HOME`). Remove the now-redundant second fallback path in `readAuthContent`. Update the
platform-branch cases in the existing tests instead of keeping dead branches.

## Out of scope

- Refreshing Cursor or Claude tokens ourselves. Cursor's refresh token here is dead (`shouldLogout`), and
  refreshing Claude would rotate the token out from under Claude Code.
- The Codex row layout. It is intended; change it only if the user asks.

## Verification

From `src/packages/tui`:

- Unit tests next to the existing usage tests (`test/cli/tui/usage*.test.ts`, `test/feature-plugins/openSidebar.test.ts`):
  - Keychain: injected `claudeKeychain` returns the JSON for `Claude Code-credentials-<hash>` -> probe reads it on
    `platform: "darwin"`; on `"win32"` it is never called; Keychain miss falls back to the file; service name for
    the default dir is the bare name. Assert the hash for a fixed path string against a precomputed literal.
  - No-credentials reasons for each probe, with no fetch made (`fetchImpl` that throws).
  - Cursor desktop token with past `exp` -> `no-credentials`, no fetch.
  - Settings: missing key -> `undefined` (auto); explicit list survives normalize; clear removes the key.
- `bun run typecheck` in `packages/tui`.
- Live check on this Mac (read-only, no tokens printed): `bun -e` the Claude probe with
  `claudeCredentialsPath: ~/.claude2/.credentials.json` -> `ok: true, source: "live"`.
- Visible result in a native test window (`.scripts/nativeTest.ps1` is Windows-only; on the Mac ask the user to
  `/revive`): expected sidebar with no saved `usageProviders` is Codex rows + plan, Claude rows + plan, and no
  Cursor / OpenCode Go / OpenRouter rows.

## Docs

- Wiki (`../oc.wiki`): the Usage sidebar page gets "providers default to the connected ones; picking any provider
  in the Usage menu switches to your own list; 'Show connected providers' goes back", and a macOS note that Claude
  usage reads the Keychain login.
- `FORK.md` usage-sidebar entry: same one-line behavior change.
- Version bump + build-notes entry at the end of the implementing session (`AGENTS.md` Revision).
