# Public readiness: another Windows machine

First-pass review: 2026-10-02.

Goal: identify what fails when oc runs on another Windows machine without the author's personal environment. This is early product and behavior planning, before choosing an installation method. Findings come from local source, configuration, and project notes; they have not been verified through a clean-machine installation.

The main question is what belongs to the application versus what currently comes from personal configuration, sibling projects, installed tools, or shortcuts. A feature failure below does not necessarily prevent the entire application from running.

## 1. Startup and basic operation

| Item | What happens on another Windows machine | Decision to make |
|---|---|---|
| **PowerShell 7 is a runtime dependency** | The resident-server launcher explicitly spawns `pwsh`. Windows PowerShell alone does not satisfy that. Without PowerShell 7 on PATH, the normal resident launch fails. | Is PowerShell 7 a stated prerequisite, or should launching work without it? |
| **`oc.exe` expects a sibling `opencode.exe`** | The executable resolver redirects `oc.exe` and `occ.exe` to `opencode.exe` beside them. Giving someone only a renamed `oc.exe` leaves the resident launcher targeting a missing file. | What is the minimum valid application folder? |
| **Production shares stock OpenCode's storage namespace** | oc uses the `opencode` config/data/state directories. Someone with stock OpenCode may bring incompatible database migrations or existing configuration into the fork. The migration guard can then refuse startup. | Should public oc have its own identity and storage, with an explicit import option? |
| **Resident ports assume availability** | Production defaults to 4096, debug to 4097. A conflicting application or existing OpenCode server can prevent the resident server from starting. Ports are configurable, but a new user needs to understand the failure. | What should first launch say when the port is occupied? |

Sources: `packages/opencode/src/config/oc.ts`, `packages/core/src/global.ts`, and the database incident recorded in `buildNotes.md`.

## 2. Features that depend on extra software

| Item | What happens without the personal setup | Decision to make |
|---|---|---|
| **Cursor requires Node.js** | Its proxy explicitly refuses to start without `node` on PATH. The compiled oc executable does not remove that dependency. | Document Node as a Cursor prerequisite, or supply the runtime? |
| **Browser providers require a separate runtime** | ChatGPT/Claude Web launch `agentify-runtime/main.mjs` using Node or Bun. Copying only the executable leaves them unable to start. | Which helper files and runtimes must accompany the app? |
| **Browser location assumes one Edge install path** | The default is `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`. A different location or missing Edge breaks browser-provider startup unless the environment override is set. | Discover installed browsers, or expose a browser-path setting? |
| **Claude Code requires the Claude CLI** | The provider defaults to launching `claude`. A machine without that CLI and its authentication cannot use the provider. | What prerequisites and setup instructions belong beside this provider? |
| **Sidebar file search requires Everything plus `es.exe`** | Search cannot run without `es.exe` on PATH and a running Everything app. The sidebar already reports these missing prerequisites. | Make this an explicitly optional integration with clear setup instructions? |
| **WezTerm actions require WezTerm and a compatible shell** | Tab/split actions need its CLI. Command placement sends `$env:SCRIPT_OWN_PANE=...` and PowerShell-style command quoting into the new pane without choosing its shell. A pane using `cmd` or another shell can reject the command. | Should these actions launch a known shell rather than inherit the user's WezTerm default? |
| **Script entries assume installed interpreters** | Defaults enable PowerShell, Python, Node, Bash, Zsh, Ruby, PHP, and others. Entries may be visible even when their executable is absent; launching then fails. | Show only available launchers, or clearly mark missing ones? |

Sources: `packages/opencode/src/provider/cursor/runtime.ts`, `packages/opencode/src/provider/agentify.ts`, `packages/opencode/src/provider/claude-code/index.ts`, and `packages/tui/src/routes/session/sidebar-tools/helpers.ts` and `script-runner.ts`.

## 3. The daily environment is not yet a portable product

| Item | What happens on a fresh machine | Decision to make |
|---|---|---|
| **SuperPlan / SuperGo / Debug profiles live in global config** | Installing the repository's executable does not reproduce the agents, prompts, routing, or model choices. Those workflows may simply be absent. | Which profiles are shipped product features, and which are personal presets? |
| **Plugins point to personal sibling checkouts** | The current global config references local files for session tooling, Copilot auto-model, and bgShell under `C:\Users\user\Documents\GitHub\...`. Those integrations are unavailable elsewhere; copying the config preserves invalid paths. | Which plugins should be distributed, optional, or excluded from the public defaults? |
| **MCP integrations depend on local projects and binaries** | The Everything MCP points to a sibling checkout and an Everything SDK DLL in the Apps folder. Jev likewise points to a local CLI file. A copied configuration cannot start those servers. | Give each optional integration a portable setup recipe? |
| **Instructions and skills use personal absolute paths** | Global instructions, model-specific prompts, and skill paths reference the author's user directory. A fresh installation does not contain them. | What is the smallest self-contained default configuration? |
| **The tray is a separate project** | Installing this checkout does not provide `octray`, even though it is part of the FORK.md daily-use story. | Is the tray part of the public offering or a separately installed companion? |

Evidence: the current `~/.config/opencode/opencode.jsonc` and FORK.md sections 2, 5, and 6. This is a high-value inventory: some apparent app features are actually personal configuration.

## 4. Restart, installation, and coexistence assumptions

| Item | What goes wrong elsewhere | Decision to make |
|---|---|---|
| **Install scripts hardcode a personal destination** | Production/debug installers target `C:\Users\user\Apps\opencode`. On another account that can fail for permissions or install into the wrong user's tree. | Make the destination user-relative or configurable, regardless of eventual install method. |
| **Revive hardcodes an executable and desktop shortcut** | Both revive scripts call the personal installed path and reopen `C:\Users\user\Desktop\occ.lnk`. That shortcut is not created by the inspected installer. Restarting fails on a fresh machine. | Can revive reopen oc directly using its actual executable and launch context? |
| **Revive requires external scripts/configuration** | The palette commands are hidden when their configured paths are unset. Shipping the executable alone does not provide the FORK.md restart workflow. | Is ordinary restart built in, with rebuild/reinstall kept as developer tooling? |
| **Shutdown affects unrelated applications** | `--shutdown-all` kills every `wezterm-gui.exe`. Other shutdown paths identify oc/OpenCode processes by executable name, which can include another installation or stock OpenCode. | How should oc identify and stop only the instances it owns? |
| **Helper packaging varies by install path** | The canonical installer copies Agentify and Cursor folders. Any other distribution path that skips them produces an executable that launches normally while those providers fail. | Define one required application layout that every distribution path preserves. |
| **Build tooling can change the user's Bun installation** | The scripts can run `bun upgrade --canary` to avoid the known-bad runtime. Someone building the fork can unexpectedly alter their global tooling. | State the supported build version and decide how deliberately upgrades should happen. |

Sources: `.scripts/install.ps1`, `.scripts/installDebug.ps1`, `.scripts/revive.ps1`, `.scripts/reviveAndInstall.ps1`, `SCRIPTS.md`, and `packages/opencode/src/config/oc.ts`.

## Suggested review order

1. **Define the minimum fresh-machine experience:** what must work with an empty oc configuration?
2. **Inventory the personal extras:** agents, prompts, plugins, MCPs, tray, shortcuts.
3. **Resolve identity and ownership:** separate storage, executable layout, process shutdown.
4. **Write the prerequisite table:** mandatory dependencies versus optional feature dependencies.
5. **Try that minimum on a fresh Windows user account or VM**, without the personal PATH, global config, sibling repos, or shortcuts.

This provides a public-readiness backlog before choosing an installer. The central acceptance question is:

**Can another Windows user get the advertised behavior without reconstructing the author's workstation?**
