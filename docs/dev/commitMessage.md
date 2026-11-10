# Commit message: buildNotes.txt (`docs/buildNotes/`)

Read before writing `buildNotes.txt` or a commit subject. Commit subjects follow this file
(`v<version> <versionTag> [<label> > <summary>]`), not conventional commits.

- Holds the next commit message. `.scripts/push.ps1` reads it: line 1 = commit subject, one blank line, remaining lines = commit body. A positional message passed to `push.ps1` wins (subject only). The file is used only when it changed since the last commit; unchanged, it is the previous push's message, so `push.ps1` prompts instead. `push.ps1 -DryRun` prints the commands without changing anything.
- Agents write it when preparing a push (the `agent-push` skill), replacing the previous push's message. UTF-8 without BOM.
- `.scripts/agentPush.ps1` is the agent path: `-Context` prints status, new `buildNotes.md` lines, and recent messages; the default mode refuses code changes without a version bump, validates `buildNotes.txt` (line 1 per the rules below via `assertCommitSubject` in `scriptHelper.ps1`, blank line, body), runs `prePush.ps1` and `push.ps1` in-process with output shown only on failure, then prints hash, message, and files. If it rejects line 1, fix line 1 and rerun.
- Line 1: `v<version> <versionTag> [<label> > <summary>]`, optionally a second segment `; <label> > <summary>`, from `src/.version/version` and `src/.version/versionTag`. Example: `v0.2.274 phatCrystal [fix > OpenAI refusal text; deps. > Bun 1.4.2]`. Enforced: label from the list below (exact case, periods included), max 2 segments with different labels, `misc.` only alone, summary with no trailing period and none of `[ ] > ;`, plain ASCII, whole line 72 characters or fewer. Check: `.scripts/tests/commitSubject.tests.ps1`.
- Labels: take the commit's headline change (the one the body leads with) and stop at the first yes. A second segment is only for a second, unrelated change worth seeing in `git log --oneline`; segments go in order of importance.
  1. `sync`: merge or port from upstream OpenCode.
  2. `fix`: something behaved in a way nobody intended (a bug) and now does not.
  3. `feat.`: new capability, command, option, or toggle the user can reach.
  4. `patch`: working, intended behavior now behaves differently (default, UX, wording, logic).
  5. `perf.`: same behavior, faster or lighter.
  6. `deps.`: standalone dependency, runtime, or toolchain version change.
  7. `scripts`: `.scripts/`, build, install, push, CI, or test-runner tooling.
  8. `cleanup`: code change with no behavior change (refactor, rename, dead code, tests only).
  9. `docs`: only docs, notes, or comments.
  10. `misc.`: none of the above (rules below).
- Tie-breakers: old behavior intended? no = `fix`, yes = `patch`. Something new to invoke or toggle = `feat.`, an existing thing working differently = `patch`; when both, label the headline. A bump that arrives with an upstream port = `sync`, a standalone bump = `deps.`. Measurable speed or memory gain = `perf.`, otherwise `cleanup`.
- `misc.` only when every label 1-9 is a no for the headline change and the change is repo content with no product, script, dependency, or doc meaning: `.gitignore`, `.gitattributes`, editor or workspace files, `.res/` data, license or repo metadata, a tag-only reroll. Never for user-visible behavior changes, to mean "several things" (label the top two, the rest goes in the body), as a second segment for leftovers, when two real labels both fit (use the order), or for `.scripts/`, `docs/`, `*.md`, or test files. If the last 10 subjects (`-Context`) already used `misc.` for the same kind of change, propose a new label to the user in the push report instead of repeating it.
- Summary: 2-5 words naming the thing, then what happened to it if not obvious (`image preview opt-in`). The label carries the verb (`fix > refusal text`, not `fix > fix refusals`). No articles; no vague words (update, improve, various, stuff, tweaks, changes). Lowercase start except proper nouns (OpenAI, Bun). Describe what the user sees; name a file only when the file is the subject.
- Body follows the recent commits: one block per area, each a lowercase label with a colon (`home prompt:`) followed by plain-English paragraphs about what the user sees; last paragraph starts with `Under the hood:` (internal fixes, tests, which checks passed). Cover every `buildNotes.md` entry since the last commit, merge related ones, leave out reverted work, and never claim a check that did not run.
