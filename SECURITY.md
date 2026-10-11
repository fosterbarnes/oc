# Security

## Threat model

oc is an AI coding agent that runs on your machine, based on OpenCode. Agents can run shell
commands, edit files, and access the web.

### No sandbox

oc does not sandbox the agent. The permission system helps you see and approve what an agent
does; it is not a security boundary. For real isolation, run oc in a VM or container.

### Background server

oc starts a local background server (port 4096 by default, 4097 for the debug instance). It only
listens on loopback (`127.0.0.1`, `localhost`, or `::1`) and requires HTTP Basic authentication
with a random secret stored in `%USERPROFILE%\.local\state\opencode\oc-server.secret`. Anyone who
can read that file as your user can use the server.

### Provider helpers

- **Claude Code:** oc runs the Claude Code CLI installed on your machine, and the CLI keeps your
  Claude login. One exception: if you turn on the optional Claude usage meter in the sidebar, oc
  reads the CLI's saved token from `%USERPROFILE%\.claude\.credentials.json` to request your usage
  numbers from Anthropic. It never refreshes or stores that token, and caches only the usage
  response.
- **Cursor:** oc signs in through Cursor's browser login and stores the session token locally. A
  local Node relay (`cursor-runtime`) carries traffic to Cursor's service.

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
