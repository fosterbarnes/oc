# Custom Feature Inventory

Last reviewed: September 16, 2026

## Purpose

This is a personal reference for tracking the active features and meaningful modifications in this OpenCode fork. Use it to see what is complete, what still needs validation or refinement, and what is not yet functional.

This is not an implementation plan or an agent handoff. Statuses describe the current state; they do not authorize work.

## Status Summary

| Status | Count | Meaning |
|---|---:|---|
| **Done** | 12 | Complete with end-to-end evidence where applicable |
| **High** | 10 | Nearly complete; final validation or a small enhancement remains |
| **Medium** | 20 | Functional or mostly implemented, but incomplete or lightly verified |
| **Low** | 0 | Intent exists, but the feature is not currently functional |
| **Total** | **42** | Active features tracked |

## Features

### Status guide

- **Low:** Intent exists, but the capability is not functional or is not connected to active behavior.
- **Medium:** Mostly works, but remains incomplete, lightly verified, legacy, or in need of touch-ups.
- **High:** Nearly complete, with only final validation or a small enhancement remaining.
- **Done:** Complete, tested, installed or exercised where applicable, and supported by user confirmation or equivalent end-to-end evidence.

Statuses are evidence-strict. Source code or tests alone do not make an item **Done** when installation, restart, authentication, or live interaction is part of the feature.

### 1. Models and providers

1. **ChatGPT Web provider - Done**
   - Uses a normal ChatGPT web account as a built-in OpenCode model without requiring an API key.
   - Starts its managed Edge browser only when first needed, keeps sessions associated with the correct browser window, and avoids duplicate message sends.
   - The browser runtime is packaged beside the Windows executable and has passed an installed end-to-end request.
   - Evidence: `packages/opencode/src/provider/agentify.ts`, `packages/agentify-runtime/`, `packages/opencode/test/provider/agentify.test.ts`.

2. **Claude Web provider - Medium**
   - Extends the built-in browser provider to Claude, including Claude-specific page controls and session routing.
   - Runtime and provider checks pass, but a live Claude login and request are still unconfirmed.
   - Evidence: `packages/agentify-runtime/vendors.json`, `packages/agentify-runtime/`, `packages/opencode/src/provider/agentify.ts`.

3. **Native Cursor provider - Medium**
    - Adds Cursor as an optional built-in model provider, including model discovery, reasoning choices, tool use, and a local connection proxy.
    - Packaging, proxy startup, shutdown, and focused tests pass. The user reported that it appeared to work, but a documented live authentication/request check remains missing.
    - Protobuf-backed git and shell parity remains deferred because the required protocol schema is not present.
    - Evidence: `packages/opencode/src/provider/cursor.ts`, `packages/opencode/src/provider/cursor/`, `packages/opencode/test/provider/cursor.test.ts`, `packages/cursor-runtime/`.

4. **Provider runtime lifecycle - High**
    - Starts the browser and Cursor support processes only when needed, coalesces concurrent startup, and stops them with the managed server.
    - Automated lifecycle coverage exists; final live coverage across every provider remains incomplete.
    - Evidence: `packages/opencode/src/provider/agentify.ts`, `packages/opencode/src/provider/cursor.ts`, `packages/opencode/src/server/lifecycle.ts`.

### 2. Launching OpenCode and managing the server

5. **Native `oc` launcher and settings - Done**
   - Folds the former wrapper behavior into OpenCode itself using `~/.config/opencode/oc.json`.
   - Supports launch, previous-session launch, diagnostics, and reliable `oc config get/set` commands.
   - The installed configuration round trip has been verified.
   - Evidence: `packages/opencode/src/cli/cmd/oc.ts`, `packages/opencode/src/config/oc.ts`, `packages/opencode/test/cli/oc.test.ts`.

6. **Startup animation - Medium**
   - Shows a native column-sweep loading animation while the server and session are prepared.
   - The implementation and timing were checked, but the final visual version lacks a recorded interactive acceptance check.
   - Evidence: `packages/opencode/src/cli/intro.ts`.

7. **Resident background server - Medium**
   - Keeps a local server available between launches and supports managed shutdown and restart.
   - Adds confirmed command-palette actions, authenticated server endpoints, and model/agent forwarding when attaching.
   - Route, API, and SDK checks pass, but the installed interactive shutdown/restart flow is not fully documented as verified.
   - Evidence: `packages/opencode/src/server/lifecycle.ts`, `packages/opencode/src/cli/cmd/serve.ts`, `packages/opencode/src/server/routes/instance/httpapi/handlers/global.ts`.

8. **Windows sign-in auto-start - High**
   - Lets the user turn resident-server startup at Windows sign-in on or off from OC settings.
   - Persistence and reconciliation are covered; a final installed palette interaction is not recorded.

9. **Faster command startup - Done**
   - Loads only the requested CLI command instead of loading every command before normal TUI startup.
   - Preserves help, completion, aliases, and named commands while substantially improving measured startup time.
   - Evidence: `packages/opencode/src/cli/command-loader.ts`, `packages/opencode/test/cli/command-loader.test.ts`.

### 3. Sessions and model choices

10. **Global session browser - Done**
    - Shows sessions from every project and returns to a selected session's original project directory.
    - Includes fixes for renamed cross-project sessions and preserves attached sessions during refreshes.
    - Cross-project behavior was manually confirmed.

11. **Session creation without a model request - Medium**
    - Initializes a project and normal session without contacting a model or creating token usage.
    - Focused tests and direct persistence checks pass; final installed acceptance evidence is incomplete.
    - Evidence: `packages/opencode/src/cli/cmd/session.ts`, `packages/opencode/test/cli/session-bootstrap.test.ts`.

12. **Complete and failed session markers - Medium**
    - Lets users mark sessions complete or failed without deleting or archiving them.
    - Displays themed check/cross markers in session lists, the active session, sidebar, and terminal summary.
    - Keeps completion and failure mutually exclusive, preserves list order when toggled, and limits agent control through explicit permissions.
    - Persistence, migrations, API contracts, tools, and TUI checks pass; installed end-to-end confirmation is not recorded.
    - Evidence: `packages/core/src/session/`, `packages/core/src/database/migration/20260908095752_session_completion.ts`, `packages/core/src/database/migration/20260908205114_session_failed.ts`.

13. **Per-session model memory - Done**
    - Remembers an explicit model and reasoning variant for each session across agent changes and session restoration.
    - Replaced the abandoned global `ignoreAgentModels` experiment with session-specific choices.
    - Focused checks pass and the user confirmed the behavior manually.

14. **Reliable attached-session refresh - Medium**
    - Prevents an explicitly attached session and its messages from disappearing when the global list refreshes.
    - Automated checks and a rebuilt binary exist; installed manual verification was left pending.

### 4. Workspace sidebar and file workflow

15. **Integrated workspace sidebar - Done**
    - Folds the former openSidebar plugin into the native TUI.
    - Combines provider usage, project files, changed-file counts/actions, custom scripts, context, MCP, LSP, todo status, and the custom footer in one sidebar.
    - Includes adaptive quota refresh after a session becomes idle, with a timed fallback.
    - Focused sidebar checks pass and the installed sidebar was manually reported as correct.
    - Evidence: `packages/tui/src/routes/session/sidebar-tools/`, `packages/tui/test/feature-plugins/open-sidebar.test.ts`.

16. **Clickable file paths - Done**
    - Opens structured tool paths, edited files, and changed-file sidebar rows in the configured editor.
    - Uses `openEditedWith`, then normal editor environment settings as fallback.
    - The installed executable was manually confirmed and temporary diagnostics were removed.
    - Evidence: `packages/tui/src/editor.ts`, `packages/tui/test/editor.test.ts`.

17. **Windows file search and script launching - High**
     - Supports fast Windows file lookup and launching repository scripts through WezTerm or clipboard actions from the sidebar.
     - The WezTerm executable-selection fix was manually shown to open a pane; broader workflow acceptance remains limited.
     - Evidence: `packages/tui/src/routes/session/sidebar-tools/`, `packages/opencode/src/tool/grep.ts`, `C:\Users\user\Documents\GitHub\mcp-everything-search`.

18. **Configurable sidebar usage providers - Medium**
     - Lets users choose which Codex, Cursor, Go, and OpenRouter usage providers appear in the workspace sidebar, with the current defaults enabled.
     - Provider selection and idle-coalesced refresh are implemented, but the latest installed command-palette interaction is not recorded.
     - Evidence: `packages/tui/src/routes/session/sidebar-tools/usage.ts`, `packages/tui/src/app.tsx`, `packages/tui/test/feature-plugins/open-sidebar.test.ts`.

19. **Everything Search MCP lifecycle - High**
     - Starts the configured Everything Search executable on Windows when needed, uses the first-instance startup flags, and reconnects after daemon loss without taking ownership of shutdown.
     - The live Windows index responds through the MCP tool and the local implementation is wired into OpenCode, but full startup/reconnect acceptance remains incomplete.
     - Evidence: `packages/opencode/src/mcp/everything.ts`, `packages/opencode/src/mcp/index.ts`, `C:\Users\user\Documents\GitHub\mcp-everything-search`, `C:\Users\user\.config\opencode\opencode.jsonc`.

### 5. Agents, delegation, and planning

20. **Drop-in Markdown agents and validation - Medium**
    - Discovers agents from global or project `agent/` and `agents/` folders, tolerates invalid sibling files, and reports path-specific warnings.
    - Adds `opencode agent validate` for deterministic diagnostics and nonzero failure status.
    - Source validation and focused checks pass, but the installed executable still lacked the command at the latest recorded check; restart-based UI discovery also remains unverified.
    - Evidence: `packages/opencode/src/config/agent.ts`, `packages/opencode/src/cli/cmd/agent.ts`.

21. **Agent ordering and friendly labels - Medium**
    - Adds configurable Tab-cycle order and display names so custom agents appear in the intended order with readable labels.
    - Schema, runtime, SDK, and TUI support exist; current installed-build verification is incomplete.

22. **Shared prompt files for Markdown agents - Medium**
     - Allows a Markdown agent to include a prompt from another file with `{file:...}`, reducing duplicated primary-agent instructions.
     - Handles relative, home, and absolute paths and reports missing files clearly.
     - Focused source loading was verified, but installed-runtime freshness remains uncertain.
     - Evidence: `packages/opencode/src/config/agent.ts`, `packages/opencode/src/agent/agent.ts`.

23. **Role- and difficulty-based delegated models - Medium**
    - Keeps primary agents on the user's selected model while routing routine delegated work to lower-cost models and difficult work to dedicated high-reasoning agents.
    - Resolved configuration checks pass; a live delegated model request is not recorded.

24. **Parallel planning and implementation agents - High**
     - Defines paired planning and execution workflows, including Tier-based background delegation, bounded fan-out, review stages, and final checks.
     - Planning agents are restricted at runtime to read-only discovery plus temporary plan files.
     - Permission and configuration checks pass. Fresh SuperPlan and SuperPlan-a probes confirmed the tool contract, temporary plan writing, background dispatch, and no source mutation; a full user feature workflow remains separate.
     - Evidence: `C:\Users\user\.config\opencode\agents\superPlan++.md`, `C:\Users\user\.config\opencode\agents\superPlan-a.md`, `C:\Users\user\.config\opencode\prompts\sp.md`, `C:\Users\user\.config\opencode\prompts\sp-a.md`.

25. **Completed-plan archiving - Done**
     - Moves successful temporary handoff plans into an archive while retaining failed, blocked, or partial plans.
     - A fresh disposable plan completed the full write, collision-safe move, source-absence, and archive-presence checks.
     - Evidence: `C:\Users\user\.config\opencode\prompts\sp.md`, `C:\Users\user\.config\opencode\prompts\sp-a.md`, `C:\Users\user\.config\opencode\plans\archive\`.

26. **Default delegated-agent setting - Medium**
     - A `default_subagent` configuration key selects the delegated agent used when a task omits `subagent_type`.
     - Runtime selection and primary-agent rejection are implemented, but the installed command and live delegated request still need confirmation.
     - Evidence: `packages/core/src/config.ts`, `packages/core/src/v1/config/config.ts`, `packages/opencode/src/tool/task.ts`.

### 6. Conversation and terminal experience

27. **Assistant response timestamps - Medium**
    - Shows local completion date/time before response duration, while using creation time during an active response.
    - Focused checks pass; final installed visual verification is not recorded.

28. **Selectable copy behavior - Medium**
    - Lets users switch between copying on mouse release and copying with Ctrl+C.
    - Removes the Windows kernel console polling path that contributed to crashes.
    - The installed binary was replaced, but the planned in-TUI copy-mode checks remained blocked.

29. **Keyboard and command-palette refinements - High**
    - Restores context-sensitive Ctrl+D behavior, preserves Ctrl+Shift+Up/Down cursor movement, wires Ctrl+N to new OC sessions, and gives OC settings concise, ordered labels.
    - Automated keybinding checks exist; some presentation-only changes were inspected rather than interactively tested.

30. **OpenTUI crash hardening - Medium**
    - Prevents non-string and nested text values from crashing the terminal interface after the OpenTUI upgrade.
    - Corrects affected counts, tool rows, diagnostics, footers, and edit displays, with a defensive compatibility patch.
    - A corrected executable was installed, but no explicit final no-regression confirmation was recorded.

31. **Diff hover consistency - Done**
    - Makes neutral regions of edited-file diffs use a consistent hover background while preserving added/removed colors.
    - The rebuilt installed appearance was confirmed.

32. **Crow session integration - Medium**
    - Keeps each Crow tab attached to its exact OpenCode session, supports targeted TUI commands, and avoids route-change feedback loops.
    - Supports Crow's direct Tailscale callback address.
    - Focused dispatch coverage exists, but complete live integration evidence is limited.

### 7. Windows build, install, and runtime behavior

33. **Windows build, install, check, and release scripts - Done**
     - Provides PowerShell workflows for building, running, checking, installing, committing, publishing, and release archives.
     - The canonical installer rebuilds by default and safely stops running OpenCode processes before replacement. The combined sync installer preserves a timestamped backup, while the canonical installer deploys packaged provider runtimes.
     - The main build/install path has repeatedly produced and installed working executables.
     - Evidence: `.install.ps1`, `.scripts/build.ps1`, `.scripts/install.ps1`, `.scripts/prePush.ps1`, `.scripts/push.ps1`, `.scripts/pushRelease.ps1`.

34. **Unsafe Bun build guard - High**
    - Refuses to compile the Windows TUI with the known-crashing Bun 1.4.0 build and upgrades to a suitable canary when required.
    - Script checks and later successful builds provide strong evidence; automatic global Bun upgrades remain an operational risk.

35. **Cleaner Windows command execution - Medium**
     - Runs the configured Windows shell directly and hides the extra `taskkill` console window during cancellation.
     - Focused shell/process checks and source builds pass; final installed Escape-cancellation confirmation is missing. The former process-tree supervisor is no longer packaged or installed.
     - Evidence: `packages/core/src/tool/bash.ts`, `packages/core/src/cross-spawn-spawner.ts`.

36. **Packaged optional-provider runtimes - High**
     - Copies Agentify and Cursor support files beside compiled OpenCode so they work outside the source checkout.
     - The standard installer deploys both. The combined upstream-sync installer does not currently mirror this runtime-copy behavior, so the two install paths can diverge.

37. **Persistent debug logging and rotation - Medium**
     - Keeps channel-aware debug logs on disk, rotates them at 20 MB, and exposes command-palette and HTTP controls for enabling or disabling logging.
     - Source, rotation, and route checks are present, but live restart and installed command-palette acceptance are not recorded.
     - Evidence: `packages/core/src/observability/logging.ts`, `packages/opencode/src/server/routes/instance/httpapi/handlers/global.ts`, `C:\Users\user\.config\opencode\opencode.jsonc`.

### 8. Fork maintenance and developer contracts

38. **Safe upstream synchronization - Medium**
    - Maintains a separate clean upstream checkout, compares content against a stored baseline, preserves custom files, and stops on ambiguous overlaps.
    - Handles Windows line endings, bumps the maintenance version after upstream advances, and can build/install after verification.
    - It has successfully applied several upstream updates, but has no shared Git merge base and its combined installer omits provider runtime directories.
    - Evidence: `.scripts/updateUpstream.ps1`, `.scripts/syncAndInstall.ps1`, `.scripts/upstream-sync.state.json`, `UPSTREAM-SYNC.md`.

39. **Separate maintenance/display version - Done**
    - Tracks the fork's maintenance release independently from OpenCode's package version and displays it in compiled TUI builds and compatible plugins.
    - Version embedding and binary display strings have been verified repeatedly.
    - Evidence: `.version/version`, `packages/core/src/installation/version.ts`, `packages/opencode/script/build.ts`.

40. **Extended TUI plugin contract - High**
    - Lets compatible plugins read the current model, preferred file editor, and fork display version.
    - These values are wired into the native TUI, but external-plugin compatibility is not comprehensively exercised.
    - Evidence: `packages/plugin/src/tui.ts`.

41. **OpenTUI 0.5.8 compatibility baseline - High**
    - Keeps the fork and plugin peer requirements on the safer OpenTUI release used to avoid stale native-pointer crashes.
    - Package and TUI checks pass; later defensive text handling shows remaining compatibility complexity.

42. **Windows-safe generated paths and declarations - Done**
    - Fixes Windows migration path generation and invalid shared custom-element declaration references used by the app and enterprise packages.
    - Migration checks and package typechecks passed.

## Retired or Superseded

These are historical customizations, not active features, and are intentionally excluded from the ratings above:

- Standalone `oc.config.json` and `OPENCODE_OC_CONFIG` migration behavior.
- External intro-script setting.
- Initial model, initial agent, and initial reasoning palette settings made obsolete by native session setup.
- Global `ignoreAgentModels` experiment, replaced by per-session model memory.
- Standalone openSidebar plugin registration, replaced by the native sidebar.
- Singular global `agent/` folder, replaced by canonical `agents/` while project discovery still supports both names.
- Earlier startup animation snake/wave effects, simplified to the stable column sweep.

## Constraints and Caveats

- **Observed:** The worktree already contains unrelated modified and untracked source, script, workflow, test, and agent-discovery files. This inventory update did not alter them.
- **Observed:** The isolated upstream checkout has no shared Git merge base with the parent snapshot, so custom classification relies on content comparison and recorded history.
- **Observed:** Several latest source features require rebuilding, reinstalling, or restarting before their active runtime state can be guaranteed.
- **Inferred:** Small wording, ordering, generated-client, migration, compatibility, and selector fixes are supporting parts of the capabilities above rather than separate user features.
- **Inconclusive:** Current live Claude Web authentication/request, Cursor authentication/request, copy-mode acceptance, installed availability of `agent validate`, installed debug-logging controls, installed usage-provider picker behavior, and full Everything Search startup/reconnect acceptance.

## Maintenance Notes

- Update a feature's status when new verification or a meaningful implementation change occurs.
- Keep retired work separate from the active feature count.
- Add new features under the category that best matches how they are used, not where their code lives.
- Treat evidence paths as references for future review, not as tasks to execute.
