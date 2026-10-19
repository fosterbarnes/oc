import { execFile } from "node:child_process"
import { open } from "node:fs/promises"
import { promisify } from "node:util"

// Saved in KV; app.tsx sends it to WezTerm as the `oc_font` user var whenever it changes.
export type TerminalFont = { family?: string; weight?: string; size?: number }
export type FontFamily = { name: string; weights: string[] }
export const TERMINAL_FONT_KEY = "terminal_font"

// Built-in WezTerm faces have no file to inspect; the others (emoji, symbols, Roboto) are not text fonts.
const BUILT_IN_MONO = "JetBrains Mono"
const FONT_LINE =
  /^wezterm\.font\("([^"]+)", \{weight="(\w+)", stretch="\w+", style="(\w+)"\}\) -- (?:\(AKA: [^)]*\) )?(<built-in>|.+?\.(?:ttf|ttc|otf|otc))(?: index=(\d+))?/i

type Face = { family: string; weight: string; path: string; index: number }

// Upright faces from `wezterm ls-fonts --list-system`, one row per weight and file.
export function parseFontList(output: string): Face[] {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = FONT_LINE.exec(line)
    if (!match || match[3] !== "Normal") return []
    return [{ family: match[1], weight: match[2], path: match[4], index: Number(match[5] ?? 0) }]
  })
}

async function readAt(file: Awaited<ReturnType<typeof open>>, offset: number, length: number) {
  const buffer = Buffer.alloc(length)
  const { bytesRead } = await file.read(buffer, 0, length, offset)
  if (bytesRead < length) throw new Error("truncated font file")
  return buffer
}

// Fixed pitch per the font's own tables: `post.isFixedPitch`, or OS/2 PANOSE proportion 9 (monospaced).
export async function isMonospaceFile(path: string, index = 0) {
  const file = await open(path, "r")
  try {
    let offset = 0
    if ((await readAt(file, 0, 4)).toString("latin1") === "ttcf") {
      offset = (await readAt(file, 12 + index * 4, 4)).readUInt32BE(0)
    }
    const count = (await readAt(file, offset + 4, 2)).readUInt16BE(0)
    const records = await readAt(file, offset + 12, count * 16)
    const tables = new Map<string, number>()
    for (let i = 0; i < count; i++) {
      tables.set(records.toString("latin1", i * 16, i * 16 + 4), records.readUInt32BE(i * 16 + 8))
    }
    const post = tables.get("post")
    if (post !== undefined && (await readAt(file, post + 12, 4)).readUInt32BE(0) !== 0) return true
    const os2 = tables.get("OS/2")
    if (os2 === undefined) return false
    const panose = await readAt(file, os2 + 32, 4)
    return panose[0] === 2 && panose[3] === 9
  } finally {
    await file.close()
  }
}

let cached: Promise<FontFamily[]> | undefined

// Monospace families WezTerm can resolve, sorted, with their upright weights. Cached for the TUI run.
export function listMonospaceFonts() {
  cached ??= (async () => {
    const { stdout } = await promisify(execFile)("wezterm", ["ls-fonts", "--list-system"], {
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    })
    const families = new Map<string, { weights: Set<string>; faces: Face[] }>()
    for (const face of parseFontList(stdout)) {
      const entry = families.get(face.family) ?? { weights: new Set(), faces: [] }
      entry.weights.add(face.weight)
      entry.faces.push(face)
      families.set(face.family, entry)
    }
    const checks = [...families].map(async ([name, entry]) => {
      // One face decides for the family; unreadable files count as not monospace.
      const face = entry.faces.find((item) => item.path !== "<built-in>")
      const mono =
        name === BUILT_IN_MONO ||
        (face !== undefined && (await isMonospaceFile(face.path, face.index).catch(() => false)))
      return mono ? [{ name, weights: [...entry.weights] }] : []
    })
    return (await Promise.all(checks)).flat().sort((a, b) => a.name.localeCompare(b.name))
  })()
  cached.catch(() => (cached = undefined))
  return cached
}

// `oc_font` payload; empty clears the window's font overrides.
export function fontEscape(font: TerminalFont | undefined) {
  const value = font && (font.family || font.size) ? Buffer.from(JSON.stringify(font)).toString("base64") : ""
  return `\x1b]1337;SetUserVar=oc_font=${value}\x07`
}
