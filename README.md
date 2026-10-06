# oc

'Snapshot' of OpenCode version 1.18.29. oc aims to add new features, and enhancements to existing ones. Its base functionality has elements of v2's codebase, while still remaining rooted fundamentally in v1 practices.

## Standout features

- out of the box claude-code support (needs CAREFUL wording)
- out of the box cursor support (needs CAREFUL wording)
- (needs re-wording) Explain in simple terms how the app's backend server and lifecycle work
- (needs re-wording) oc, occ, occc, occccc, etc. explain this and why it's useful
- (needs re-wording) Full session list everywhere
- (needs re-wording) session 'markers' (complete, failed, etc)
- (needs expansion) custom sidebar
- (needs expansion) script runner and settings
- (needs expansion) crow
- (needs expansion) ocDebug


## Fix

- Faster app startup (initial, and across sessions)
- (needs re-wording) Flaws with question tool
- Start a session with no model call (check if this is really true for og opencode)


## Custom skills and commands

## Behavior changes

- (needs expansion) keybinds and key combos

## Windows specific stuff

## Non-Standout small features


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

[514,776](scc.txt) lines of code and counting...

<!-- code-count:start -->

| Language | Files | Lines | Blanks | Comments | Code |
|---|---:|---:|---:|---:|---:|
| Astro | 8 | 1,299 | 150 | 10 | 1,139 |
| CSS | 163 | 40,551 | 5,296 | 574 | 34,681 |
| Go | 5 | 902 | 54 | 3 | 845 |
| HTML | 1 | 1,161 | 79 | 0 | 1,082 |
| JavaScript | 23 | 5,259 | 419 | 63 | 4,777 |
| Nix | 3 | 258 | 23 | 26 | 209 |
| Powershell | 20 | 1,519 | 127 | 38 | 1,354 |
| SQL | 95 | 592 | 0 | 17 | 575 |
| Shell | 1 | 120 | 17 | 17 | 86 |
| TypeScript | 2,710 | 527,920 | 42,910 | 14,982 | 470,028 |
| **Total** | **3,029** | **579,581** | **49,075** | **15,730** | **514,776** |

<!-- code-count:end -->

## Writeup

oc came about naturally. I had been toying around with OpenCode v1 TUI for a few weeks, and was very impressed with how it worked compared to alternative mainstream options (Codex desktop app, Claude Code desktop app, Cursor AI desktop app). At this point, my custom modifications and lite 'enhancements' to OpenCode were scoped to plugins. This worked for a time, but I found my goals becoming larger and larger in scope and ambition. At this point I found that source code edits were required to achieve my goals in way of getting the features and behavior I imagined and desired. There is not much documentation or version-tracking of this era of oc, considering it was intended to be a completely self-contained personal project. However, my goals are much different now.

As I chipped away towards adding new 'native' features to the OpenCode TUI, and stripping some that I had no intention of using at the moment like the built-in web GUI, I realized that I may be creating something that other people may have great use for, just as I have found. This project won't be for everyone, but I hope some may find that it is exactly for them.

In its current state, I believe oc to be a faster, smarter, more performant take on OpenCode version 1, with some ideas stolen from OpenCode v2. (todo: put the top 'benchmarks' and comparisons to OpenCode v1 Windows vs oc Windows. I don't have these yet). Instead of having to remember how each mainstream harness's quirks work while writing every prompt, managing skills and plugins across apps, and losing time with sluggish, bloated app launches frequently, I kind of just wanted a simple system that allows me to interact with each of these things under the same general workflow under OpenCode. This project's intended workflow is rooted in native OpenCode practices, but you may find that certain things work a little bit differently than you may be used to.

example:
(todo)

Another thing you may not be used to lol... if you have an existing Cursor AI subscription plan or Claude Code subscription plan (not talking API keys, monthly/yearly subscriptions), oc knows how to interact with Cursor and Claude Code harnesses. At the end of the day, this means that you may select any model from any subscription you already pay for under the same exact /models menu where your native-to-OpenCode models live. While this may FEEL like you are 'hacking' around the system to somehow get external-harnessed-models to somehow 'expose' the underlying model API or system to 'get in'.... that's not how it works at all lmao.

It's really just a simple deterministic system designed around harness interaction, skills, and tool translation. The intention is not to replace the products it works with, or break any TOS while doing so. The intention is to give a user a more streamlined, simplified general solution, while leaving harness-specific features like computer use to their respective 'host' harness.

Beyond this, I've added features that help my everyday workflow, and I hope that they help yours too. Thank you for reading this if you did, and I hope you have some use for what I'm offering. If not, that's okay too. If you'd like to help out, issues and PRs are always open.

## License

MIT, see [LICENSE](LICENSE). Based on OpenCode.
