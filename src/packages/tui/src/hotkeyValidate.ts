export interface ValidateHotkeyInput {
  key: string
  leaderKey: string
  ownerOf: (key: string) => string | undefined
  kittyKeyboard: boolean
}

export type ValidateHotkeyResult = { ok: true } | { ok: false; reason: string; owner?: string }

const MODIFIERS = new Set(["ctrl", "alt", "meta", "shift", "super"])

// Shift alone does not make a hotkey: "shift+a" still types a character.
const HARD_MODIFIERS = new Set(["ctrl", "alt", "meta", "super"])

const LEADER_PREFIX = "<leader>"

// Bare keys that would break typing in the prompt.
const BARE_DENIED = new Set([
  "escape",
  "esc",
  "return",
  "enter",
  "tab",
  "space",
  "backspace",
  "up",
  "down",
  "left",
  "right",
])

const RESERVED: Record<string, string> = {
  "ctrl+c": "ctrl+c is reserved for interrupt",
  "ctrl+d": "ctrl+d is reserved for end-of-input",
  "ctrl+z": "ctrl+z is reserved for suspend",
}

// Terminals deliver these identically to the named key without kitty protocol.
const INDISTINCT: Record<string, string> = {
  "ctrl+i": "terminals cannot distinguish ctrl+i from tab",
  "ctrl+m": "terminals cannot distinguish ctrl+m from return",
  "ctrl+[": "terminals cannot distinguish ctrl+[ from escape",
  "ctrl+j": "terminals cannot distinguish ctrl+j from line feed",
}

function fail(reason: string, owner?: string): ValidateHotkeyResult {
  return owner === undefined ? { ok: false, reason } : { ok: false, reason, owner }
}

export function validateHotkey(input: ValidateHotkeyInput): ValidateHotkeyResult {
  const key = input.key.trim().toLowerCase()
  const leader = input.leaderKey.trim().toLowerCase()

  if (!key) return fail("no key was captured")

  if (key.startsWith(LEADER_PREFIX)) {
    const rest = key.slice(LEADER_PREFIX.length).replace(/^\+/, "")
    if (!rest || rest.includes(" ")) {
      return fail("use the leader followed by one key")
    }
    const restParts = rest.split("+")
    if (restParts.every((part) => MODIFIERS.has(part))) {
      return fail("use the leader followed by one non-modifier key")
    }
    const owner = input.ownerOf(key)
    if (owner !== undefined) return fail(`already bound to ${owner}`, owner)
    return { ok: true }
  }

  if (key === leader) return fail("that is the leader key itself")

  const parts = key.split("+")
  if (parts.every((part) => MODIFIERS.has(part))) return fail("modifier-only combos cannot be hotkeys")

  const reserved = RESERVED[key]
  if (reserved !== undefined) return fail(reserved)

  if (!input.kittyKeyboard) {
    const indistinct = INDISTINCT[key]
    if (indistinct !== undefined) return fail(indistinct)

    if (parts.includes("ctrl") && parts.includes("shift") && parts[parts.length - 1].length === 1) {
      return fail(`${key} needs a terminal with kitty keyboard support`)
    }
  }

  if (!parts.some((part) => HARD_MODIFIERS.has(part))) {
    return fail("add ctrl, alt, meta, or super")
  }

  const owner = input.ownerOf(key)
  if (owner !== undefined) return fail(`already bound to ${owner}`, owner)

  return { ok: true }
}
