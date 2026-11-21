# Security

## Threat model

oc is an AI coding agent that runs on your machine, based on OpenCode. Agents can run shell
commands, edit files, and access the web.

### No sandbox

oc does not sandbox the agent. The permission system helps you see and approve what an agent
does; it is not a security boundary. For real isolation, run oc in a VM or container.

### Background server

oc starts a local background server (port 4096 by default). It only listens on loopback
(`127.0.0.1`, `localhost`, or `::1`) and requires HTTP Basic authentication with a random secret
stored in `~/.local/state/opencode/oc-server.secret` (`~` is `%USERPROFILE%` on Windows). Anyone
who can read that file as your user can use the server.

### Settings sync

Settings sync is off by default. When you turn it on (`sync.enabled` in `oc.json`, set by **Sync
settings**), the background server also listens on this machine's Tailscale IPv4 address, port
4097. It serves your skills, commands, agents, themes, and settings read-only, and answers only
machines signed in to the same Tailscale account (checked with `tailscale status`); there is no
other password. Secret settings (keys named like `apiKey`, `token`, `secret`, `password`,
`authorization`, including top-level ones) are redacted in sync and in **Export oc settings**.
Files (skills, commands, agents, scripts, and the like) are copied as they are, so keep secrets
out of them.

### Mirror

**Mirror oc source to another machine** (`/mirror`) is off on every machine until you turn it on
there (`mirror.accept` in `oc.json`; it never syncs, so each machine opts in itself). A machine
that accepts takes mirror commands only over ssh from your own Tailscale devices (checked against
`tailscale status`) or from a local process of your user. A mirror resets this machine's oc source
checkout to the sender's commit (`git reset --hard`, then restores the sender's snapshot files), and
may then rebuild oc there (**revive**: `ask`, `always`, or `never`). If the checkout has changes the
mirror would overwrite, the `dirty` setting decides: ask, refuse, overwrite, or stash a backup.

### Provider helpers

- **Claude Code:** oc runs the Claude Code CLI installed on your machine, and the CLI keeps your
  Claude login. One exception: the sidebar usage meter (shown for each Claude account you are
  signed in to unless you pick other usage providers) reads that account's saved token, from
  `.credentials.json` in its Claude config folder or, on macOS, the Keychain entry Claude Code
  keeps, to request your usage numbers from Anthropic. It never refreshes or stores that token,
  and caches only the usage response.
- **Cursor:** oc signs in through Cursor's browser login and stores the session token locally. A
  local Node relay (`cursor-runtime`) carries traffic to Cursor's service. One exception: when oc
  has no Cursor login (and no pasted cookie), the sidebar usage meter reads the Cursor desktop
  app's saved access token (`cursorAuth/accessToken` in its `state.vscdb`, opened read-only) to
  request your usage numbers. It ignores an expired token and does not store it.

### Releases

Release downloads carry only the SHA-256 digest GitHub shows for each asset. oc has no code
signing or build provenance yet, so compare the digest yourself if you need to.

### In scope

- The background server accepting requests without valid credentials, or from other machines
- Local files written with permissions that let other users read secrets or tokens
- oc running commands or writing files that the configured permissions deny
- Credential or token leaks in logs, transcripts, or crash output

### Out of scope

| Category | Why |
| --- | --- |
| Sandbox escapes | The permission system is not a sandbox |
| Access by your own user account | Anything running as you can already read your files |
| LLM provider data handling | Governed by each provider's policies |
| MCP servers and plugins you add | Outside oc's trust boundary |
| Malicious config files | You control your own config |
| Upstream OpenCode issues not changed by oc | Report those to [anomalyco/opencode](https://github.com/anomalyco/opencode/security) |

## Reporting a vulnerability

Use GitHub's private ["Report a vulnerability"](https://github.com/fosterbarnes/oc/security/advisories/new)
form. Please don't open a public issue. Describe what you found, how to reproduce it, and what
version of oc you used. Reports must be written and checked by you; unverified AI-generated
reports will be closed.

oc is maintained by one person, so replies may take a few days.
