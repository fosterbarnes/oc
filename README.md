# oc

'snapshot' of OpenCode version 1.18.29. oc aims to add new features, and enhancements to existing ones. Its base functionality has elements of v2s codebase, while still remaining rooted fundementally in v1 practices.

## Standout features

- out of the box claude-code support (needs CAREFUL wording)
- out of the box cursor support (needs CAREFUL wording)
- (needs re-wording) Explain in simple terms how the app's backend server and lifecycle work
- (needs re-wording) oc, occ, occc, occccc, etc. explain this and why its useful
- (needs re-wording) Full session list everywhere
- (needs re-wording) session 'markers' (complete, failed, etc)
- (needs expansion) custom sidebar
- (needs expansion) script runner and settings
- (needs expansion) crow
- (needs expansion) ocDebug


## Fix

- Faster app startup (inital, and across sessions)
- (needs re-wording) Flaws with quesiton tool
- Start a session with no model call (check if this is really true for og opencode)


## Custom skills and commands

-

## Behavior changes

- (needs expansion) keybinds and key combos

## Windows specific stuff


## Dev Docs

- Fork features and status: [FORK.md](FORK.md)
- Stock OpenCode in this checkout: [README.OG.md](README.OG.md)
- Build, install, and upstream sync: [SCRIPTS.md](SCRIPTS.md)

## Requirements

- Windows 10/11 x64
- PowerShell 7
- Bun (not 1.4.0; see [SCRIPTS.md](SCRIPTS.md))
- scc for `prePush.ps1` line counts
- GitHub CLI for release scripts

## Versioning

- Version: `.version/version`
- Next commit message: `buildNotes.txt`
- Agent history: `buildNotes.md`

## Progress

[514,361](scc.txt) lines of code and counting...

<!-- code-count:start -->

| Language | Files | Lines | Blanks | Comments | Code |
|---|---:|---:|---:|---:|---:|
| Astro | 8 | 1,299 | 150 | 10 | 1,139 |
| CSS | 163 | 40,551 | 5,296 | 574 | 34,681 |
| Go | 5 | 902 | 54 | 3 | 845 |
| HTML | 1 | 1,161 | 79 | 0 | 1,082 |
| JavaScript | 23 | 5,259 | 419 | 63 | 4,777 |
| Nix | 3 | 258 | 23 | 26 | 209 |
| Powershell | 18 | 1,252 | 113 | 30 | 1,109 |
| SQL | 95 | 592 | 0 | 17 | 575 |
| Shell | 1 | 120 | 17 | 17 | 86 |
| TypeScript | 2,709 | 527,722 | 42,903 | 14,961 | 469,858 |
| **Total** | **3,026** | **579,116** | **49,054** | **15,701** | **514,361** |

<!-- code-count:end -->

## License

MIT, see [LICENSE](LICENSE). Based on OpenCode.
