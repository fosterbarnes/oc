# Handoff: check the startup intro-to-TUI switch with computer use

For: Claude Code Desktop with computer use. Repo: `C:\Users\user\Documents\GitHub\oc`.
Read `AGENTS.md` and the newest entry in `buildNotes.md` (v0.2.84) before starting.

## What changed (v0.2.84, not committed)

- `src/packages/opencode/src/cli/intro.ts`: `stopIntro(false)` stops the animation but leaves the logo
  frame drawn and the cursor hidden. A later `stopIntro()` clears the screen once.
- `src/packages/opencode/src/cli/cmd/oc.ts`: `oc` and `oc previous` call `stopIntro(false)` right before
  `attach`, so the TUI's first frame (alternate screen) should replace the logo with no blank gap.
  New `bootstrapSession` creates the target session through the resident server API, replacing the
  `oc session bootstrap` child process.
- `src/packages/opencode/src/config/oc.ts`: `writeSidebar` and `nextProjectTitle` moved here.

Goal: before this change there was sometimes a 1-1.5 s blank screen between the intro and the TUI.
It should now be gone, and `oc <project>` should reach the TUI sooner.

## Step 0: check the installed version

The user's last revive banner showed `oc v0.2.83`, which is the version before this change. Run
`oc --version` (or check the TUI's revive/status banner). If it is not `0.2.84`, the change is not
installed. **Do not build or install.** Write the "not installed" result in the report and stop.
The user must run `.scripts\build.ps1` and then the installer with `-NoBuild` from a fresh PowerShell.

## Rules

- No code changes, no builds, no installs, no commits. Observe and diagnose only.
- Do not close or kill the user's existing OpenCode/oc windows or the resident server.
- Use a new terminal window (WezTerm) for every launch.
- Clean up test sessions you create only if the TUI offers a normal delete; otherwise list their
  titles in the report.

## Checks (screenshot each transition; take rapid screenshots during launch if possible)

1. `oc crow` (repeat 3 times, using a new window each time):
   - The logo sweep plays, then the TUI appears directly. Note any blank or black frame between
     them and roughly how long it lasted.
   - A new session titled `crow`, `crow1`, ... opens; the first message reads
     `Working directory initialized: ...\crow`; the sidebar shows the project.
2. `occ` (no target): same switch, no blank gap.
3. `oc previous`: same switch; it opens the previous session.
4. Exit the TUI (normal quit) after each: the terminal must be clean, with no leftover logo and a
   visible cursor.
5. Resize or snap the window during the intro: the logo re-centers, and the TUI still takes over cleanly.
6. Optional: from inside a TUI, run `/revive-no-install` and note whether its output prints over a
   leftover logo (known risk).

## If something is wrong

Diagnose without editing. Useful places:
- `~\.local\share\opencode\log\` (latest `opencode.log`): look for `session.create` and prompt errors from
  `bootstrapSession`, and for auth (401) errors.
- If the TUI starts on the main screen instead of the alternate screen, the logo will remain under
  it. Note exactly what you see.
- If `oc <project>` errors, copy the exact error text.

## Report

Write `C:\Users\user\Documents\GitHub\oc\handoffStartupCheckResult.md` for when the user comes back:
- Installed version seen.
- One line per check: pass / fail / not run, and what you saw (gap length, glitches).
- Any errors, quoted exactly, with the log path.
- Your diagnosis and a suggested fix for each failure (description only, no edits).
- Test session titles you created.
Keep it short, in plain English, with no em dashes. Then post the same summary in chat.
