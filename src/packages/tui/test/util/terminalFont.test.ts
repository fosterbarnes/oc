import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { fontEscape, isMonospaceFile, parseFontList } from "../../src/util/terminalFont"

// Lines captured from `wezterm ls-fonts --list-system` (WezTerm 20260817).
const LIST = [
  `wezterm.font("JetBrains Mono", {weight="Regular", stretch="Normal", style="Normal"}) -- <built-in>, BuiltIn`,
  `wezterm.font("JetBrains Mono", {weight="Thin", stretch="Normal", style="Italic"}) -- (AKA: JetBrains Mono Thin) <built-in>, BuiltIn`,
  `wezterm.font("Cambria Math", {weight="Regular", stretch="Normal", style="Normal"}) -- C:\\WINDOWS\\FONTS\\CAMBRIA.TTC index=1 variation=0, DirectWrite pixel_sizes=[12, 13]`,
  `wezterm.font("MS Gothic", {weight="Regular", stretch="Normal", style="Normal"}) -- (AKA: ＭＳ ゴシック) C:\\WINDOWS\\FONTS\\MSGOTHIC.TTC, DirectWrite pixel_sizes=[7, 8]`,
  `  -- C:\\USERS\\FOSTER\\APPDATA\\LOCAL\\MICROSOFT\\WINDOWS\\FONTS\\ANDALEMO.TTF, DirectWrite`,
].join("\r\n")

describe("util.terminalFont", () => {
  test("parses upright faces with path and collection index", () => {
    expect(parseFontList(LIST)).toEqual([
      { family: "JetBrains Mono", weight: "Regular", path: "<built-in>", index: 0 },
      { family: "Cambria Math", weight: "Regular", path: "C:\\WINDOWS\\FONTS\\CAMBRIA.TTC", index: 1 },
      { family: "MS Gothic", weight: "Regular", path: "C:\\WINDOWS\\FONTS\\MSGOTHIC.TTC", index: 0 },
    ])
  })

  const fonts = ["consola.ttf", "arial.ttf", "msgothic.ttc"].map((name) => `C:\\Windows\\Fonts\\${name}`)
  test.skipIf(!fonts.every((file) => existsSync(file)))("reads fixed pitch from font tables", async () => {
    const [consolas, arial, gothic] = fonts
    expect(await isMonospaceFile(consolas)).toBe(true)
    expect(await isMonospaceFile(arial)).toBe(false)
    // Collection: MS Gothic (index 0) is fixed pitch, MS PGothic (index 1) is proportional.
    expect(await isMonospaceFile(gothic, 0)).toBe(true)
    expect(await isMonospaceFile(gothic, 1)).toBe(false)
  })

  test("encodes the oc_font user var, empty when nothing is set", () => {
    const escape = fontEscape({ family: "Consolas", weight: "Bold", size: 11.5 })
    const value = escape.slice("\x1b]1337;SetUserVar=oc_font=".length, -1)
    expect(JSON.parse(Buffer.from(value, "base64").toString())).toEqual({
      family: "Consolas",
      weight: "Bold",
      size: 11.5,
    })
    expect(fontEscape(undefined)).toBe("\x1b]1337;SetUserVar=oc_font=\x07")
    expect(fontEscape({})).toBe(fontEscape(undefined))
  })
})
