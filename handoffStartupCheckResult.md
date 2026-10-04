# Startup check result (2026-10-04)

Installed version: `0.2.84-main-202610040852` (the change is installed).

Method: launched each command in a new WezTerm window from PowerShell
(`wezterm start -- pwsh -NoExit -Command ...`) and took back-to-back screenshots. Computer use only
allows clicks in WezTerm, so I could not type, quit the TUI, or resize during the intro.

## Checks

1. `oc crow` run 1: fail (probably). Logo, then TUI. Screenshots were 0.5 s apart, so a short gap
   could have been missed.
   `oc crow` run 2 (no delay between shots): fail. Logo half-swept, then one frame of blank terminal
   background (logo gone), then the TUI.
2. `occ`: fail. Logo, then a blank frame in the terminal's gray background, then a solid black frame,
   then the TUI. Two blank frames, roughly 0.5-1 s total.
3. `oc previous`: not run.
4. Exit cleanliness: not run (cannot send keys to WezTerm).
5. Resize during intro: not run.
6. `/revive-no-install`: not run.

## Diagnosis

- The launcher no longer clears the logo: `stopIntro(false)` (`src/cli/cmd/oc.ts:193`, `:235`) skips the
  clear, and nothing else in `packages/opencode` or `packages/tui` writes `\x1b[2J`. So the erase comes
  from the `attach` child process before its first frame, most likely OpenTUI's renderer setup
  (`createCliRenderer` in `packages/tui/src/app.tsx:593`) clearing the main screen, or ConPTY repainting
  when the new process takes the console.
- The black frame is the alternate screen entered and cleared, then held empty while the TUI loads
  its data before the first real paint.
- In run 2 the logo was erased mid-sweep, so the child starts quickly; the gap is the TUI's own startup
  time, not the launcher's.

## Suggested fixes (no edits made)

- Confirm the erase source: run `oc attach` with stdout piped to a file (or WezTerm debug overlay) and
  check the first bytes for `\x1b[2J` / `\x1b[?1049h` order.
- Draw the intro inside the alternate screen (`\x1b[?1049h` before the first paint). Then a main-screen
  clear by the child is invisible, and the TUI's alternate-screen entry is a no-op over the logo.
- To remove the black frame, have the TUI paint its first frame before awaiting session/data loads, or
  keep the launcher's logo visible until the child signals ready (for example a ready file or stdout
  line), which needs the child to not clear first.

## Test sessions created

Two new `crow` sessions (next numbered titles, `crowN`). The three WezTerm windows were left open.
