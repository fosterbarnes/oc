# Claude Code session test flow

One chat, run top to bottom, repeated after each change to the Claude Code provider. Send the
session name to the agent afterward for inspection (tokens, memory, processes, notices, logs).

## Setup

1. Open a new chat in a small test project folder with `oc` on a Claude model.
2. Name it `baseN`, the next number after the last run.
3. Keep your usual model and effort. Step 7 changes them on purpose.

Send each message exactly as written and wait for the reply to finish, unless a step says otherwise.

## 0. Instructions check

```text
Without reading any files, quote the rule in your instructions about test inputs and the real caller.
```

Expect: "Build test inputs from what the real caller sends. A test that uses a shape production
never sends proves nothing." quoted from memory, with no Read tool row. That rule exists only in
`principles.md`, so this proves it reached Claude through `~/.claude/CLAUDE.md`.

## 1. Seed and tool check

```text
Remember for later: the codeword is PELICAN-77.

Now do these in order, in one turn, and keep each result short:
1. List the top-level files here, then read the first 10 lines of README.md.
2. Search the repo for "TODO" and tell me how many files contain it.
3. Create ocToolCheck.txt with the line "hello from claude", then edit it to say "hello from claude, edited".
4. Run a shell command that prints the current directory and the PowerShell version.
5. Keep a todo list of these 8 steps and update it as you go.
6. Load the "available-models" skill and say in one sentence what it is for.
7. Use one of my MCP tools (context7 or grep.app) to find how to read a file with Bun, and give the one-line answer.
8. Ask me a multiple-choice question: "Should I delete ocToolCheck.txt?" with options Yes and No, and do what I pick.

At the end, list which tool you used for each step.
```

Answer **No** to the question so the file survives for step 4.

Expect: no "Claude conversation lost" notice, native tool rows (Read, Edit, Bash...), oc's question
form, one "# Todos" block at the end, one reply, about 45K context.

## 2. Memory and parallel subagents

```text
What's the codeword? Then run two explore subagents at the same time: one counts .ps1 files in this repo, one counts .md files.
```

Expect: PELICAN-77, and two subagent rows that run at the same time.

## 3. Interrupt

```text
Read every file in the repo one at a time and summarize each.
```

After 2 or 3 tool rows appear, press **Esc** (twice if oc asks to confirm). Then:

```text
Ignore that. What's the codeword?
```

Expect: the turn shows "interrupted", then a short answer, PELICAN-77, with no leftover summary text.

## 4. Compact

```text
/compact
```

Then:

```text
What's the codeword, and what does ocToolCheck.txt say right now?
```

Expect: Claude Code's summary under the "Compacted" divider (not "no conversation to compact"),
then PELICAN-77 and "hello from claude, edited".

## 5. Revert

```text
The new codeword is OSPREY-12.
```

Once Claude replies, **undo or revert that message** in oc, then:

```text
What's the codeword? Then make a todo list with two items, "check revert" and "check todos", and mark the first one done.
```

Expect: PELICAN-77, possibly with a "Claude conversation rewound" note, and a "# Todos" block at
the end with one item done and one pending (checks the todo list still updates after a rewind).

## 6. Restart

Quit oc completely, reopen this same chat, then:

```text
Codeword?
```

Expect: PELICAN-77 with no "lost" prompt.

## 7. Switch model or effort

Change the effort level or switch to another Claude model, then:

```text
Still remember the codeword? Also delete ocToolCheck.txt.
```

Expect: PELICAN-77, and the file deleted.

## 8. Cache check

Send this twice, waiting for each reply:

```text
Codeword?
```

Expect: PELICAN-77 both times. The agent checks the second one mostly reads from Claude's cache
instead of writing about 24K tokens again.

## When done

Send the agent `baseN done`, plus the step number of anything that looked wrong.
