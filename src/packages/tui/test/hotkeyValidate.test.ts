import { expect, test } from "bun:test"
import { validateHotkey } from "../src/hotkeyValidate"

const LEADER = "ctrl+space"
const free = () => undefined
const validate = (key: string, ownerOf: (key: string) => string | undefined = free) =>
  validateHotkey({ key, leaderKey: LEADER, ownerOf, kittyKeyboard: false })
const validateKitty = (key: string, ownerOf: (key: string) => string | undefined = free) =>
  validateHotkey({ key, leaderKey: LEADER, ownerOf, kittyKeyboard: true })

test("accepts a modified key", () => {
  expect(validate("ctrl+alt+t")).toEqual({ ok: true })
})

test("rejects modifier-only combos", () => {
  expect(validate("ctrl").ok).toBe(false)
  expect(validate("ctrl+shift").ok).toBe(false)
})

test("rejects bare printable keys", () => {
  expect(validate("t").ok).toBe(false)
  expect(validate("5").ok).toBe(false)
  expect(validate(";").ok).toBe(false)
  expect(validate("shift+t").ok).toBe(false)
})

test("rejects bare special keys", () => {
  for (const key of ["escape", "return", "tab", "space", "backspace", "up", "down", "left", "right"]) {
    expect(validate(key).ok).toBe(false)
  }
})

test("rejects reserved keys", () => {
  for (const key of ["ctrl+c", "ctrl+d", "ctrl+z"]) {
    expect(validate(key).ok).toBe(false)
  }
})

test("rejects keys terminals cannot distinguish", () => {
  for (const key of ["ctrl+i", "ctrl+m", "ctrl+[", "ctrl+j"]) {
    expect(validate(key).ok).toBe(false)
  }
})

test("rejects ctrl+shift+letter without kitty keyboard", () => {
  expect(validate("ctrl+shift+k")).toEqual({
    ok: false,
    reason: "ctrl+shift+k needs a terminal with kitty keyboard support",
  })
})

test("allows ctrl+shift+letter with kitty keyboard", () => {
  expect(validateKitty("ctrl+shift+k")).toEqual({ ok: true })
})

test("allows legacy-ambiguous keys with kitty keyboard", () => {
  for (const key of ["ctrl+i", "ctrl+m", "ctrl+[", "ctrl+j"]) {
    expect(validateKitty(key)).toEqual({ ok: true })
  }
})

test("rejects reserved keys even with kitty keyboard", () => {
  for (const key of ["ctrl+c", "ctrl+d", "ctrl+z"]) {
    expect(validateKitty(key).ok).toBe(false)
  }
})

test("rejects the leader key itself", () => {
  expect(validate(LEADER)).toEqual({ ok: false, reason: "that is the leader key itself" })
})

test("allows a bare key after the leader", () => {
  expect(validate("<leader>x")).toEqual({ ok: true })
})

test("allows one modified key after the leader", () => {
  expect(validate("<leader>ctrl+k")).toEqual({ ok: true })
})

test("rejects leader sequences without a trailing key", () => {
  expect(validate("<leader>").ok).toBe(false)
  expect(validate("<leader>ctrl").ok).toBe(false)
})

test("rejects combos without a hard modifier", () => {
  expect(validate("shift+up").ok).toBe(false)
  expect(validate("hyper+a").ok).toBe(false)
})

test("rejects occupied keys and names the owner", () => {
  expect(validate("ctrl+alt+t", () => "Switch session")).toEqual({
    ok: false,
    reason: "already bound to Switch session",
    owner: "Switch session",
  })
})

test("rejects occupied leader sequences and names the owner", () => {
  expect(validate("<leader>x", () => "Switch theme")).toEqual({
    ok: false,
    reason: "already bound to Switch theme",
    owner: "Switch theme",
  })
})
