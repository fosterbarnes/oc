import { execFile } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { openUrl } from "@opencode-ai/core/open"

const exec = promisify(execFile)

export const LINK_CLICK_KEY = "link_click_enabled"
export const LINK_BROWSER_KEY = "link_browser"

// Windows lists installed browsers under Clients\StartMenuInternet, per user and per machine.
const _BROWSER_ROOTS = [
  String.raw`HKCU\SOFTWARE\Clients\StartMenuInternet`,
  String.raw`HKLM\SOFTWARE\Clients\StartMenuInternet`,
  String.raw`HKLM\SOFTWARE\WOW6432Node\Clients\StartMenuInternet`,
]

// macOS app folders; Safari lives in the cryptex on macOS 13 and later.
const _MAC_APP_DIRS = [
  "/Applications",
  "/System/Applications",
  "/System/Volumes/Preboot/Cryptexes/App/System/Applications",
  path.join(os.homedir(), "Applications"),
]

export type Browser = { name: string; path: string }

type MacAppInfo = {
  CFBundleIdentifier?: string
  CFBundleDisplayName?: string
  CFBundleName?: string
  CFBundleURLTypes?: { CFBundleURLSchemes?: string[] }[]
  CFBundleDocumentTypes?: { LSItemContentTypes?: string[]; CFBundleTypeExtensions?: string[] }[]
}

/**
 * .app bundles whose Info.plist declares an http or https URL scheme and opens HTML documents
 * (URL schemes alone also match media players and terminals). Deduplicated by bundle id; entries
 * are sorted because APFS returns them unordered, so a renamed copy loses to the original name.
 */
// Plists are read in parallel without blocking: one plutil per app, run in sequence on the TUI thread,
// froze the picker for about 0.6 s.
async function scanMacBrowsers(): Promise<Browser[]> {
  const apps = _MAC_APP_DIRS.flatMap((dir) =>
    existsSync(dir)
      ? readdirSync(dir)
          .sort()
          .filter((entry) => entry.endsWith(".app"))
          .map((entry) => path.join(dir, entry))
      : [],
  )
  const found = await Promise.all(
    apps.map(async (app) => {
      const proc = Bun.spawn(["plutil", "-convert", "json", "-o", "-", path.join(app, "Contents", "Info.plist")], {
        stdout: "pipe",
        stderr: "ignore",
      })
      const [text, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
      if (code !== 0) return undefined
      const info = JSON.parse(text) as MacAppInfo
      const types = Array.isArray(info.CFBundleURLTypes) ? info.CFBundleURLTypes : []
      if (!types.some((type) => type.CFBundleURLSchemes?.some((scheme) => /^https?$/i.test(scheme)))) return undefined
      const documents = Array.isArray(info.CFBundleDocumentTypes) ? info.CFBundleDocumentTypes : []
      const html = documents.some((type) =>
        [...(type.LSItemContentTypes ?? []), ...(type.CFBundleTypeExtensions ?? [])].some((value) =>
          /^(public\.html|html?)$/i.test(value),
        ),
      )
      if (!html) return undefined
      const name = info.CFBundleDisplayName || info.CFBundleName || path.basename(app, ".app")
      return { name, path: app, id: (info.CFBundleIdentifier || name).toLowerCase() }
    }),
  )
  // First (sorted) path wins per bundle id, so a renamed copy loses to the original.
  const seen = new Set<string>()
  return found.flatMap((item) => {
    if (!item || seen.has(item.id)) return []
    seen.add(item.id)
    return [{ name: item.name, path: item.path }]
  })
}

/** Parses `reg query <root> /s /ve` output: `<id>` holds the name, `<id>\shell\open\command` the exe. */
export function parseBrowsers(output: string): Browser[] {
  const names = new Map<string, string>()
  const paths = new Map<string, string>()
  let key = ""
  for (const line of output.split(/\r?\n/)) {
    if (/^HKEY_/.test(line)) {
      key = line.trim()
      continue
    }
    const value = line.match(/^\s+\(Default\)\s+REG_(?:EXPAND_)?SZ\s+(.+)$/)?.[1]?.trim()
    if (!value) continue
    const match = key.match(/\\StartMenuInternet\\([^\\]+)(\\shell\\open\\command)?$/i)
    if (!match) continue
    if (!match[2]) names.set(match[1], value)
    else {
      const exe = value.match(/^"([^"]+)"/)?.[1] ?? value.match(/^(.+?\.exe)\b/i)?.[1]
      if (exe) paths.set(match[1], exe)
    }
  }
  return [...paths].map(([id, path]) => ({ name: names.get(id) ?? id, path }))
}

/** Installed browsers: exe paths on Windows, .app bundles on macOS; empty on other platforms. */
export async function scanBrowsers(): Promise<Browser[]> {
  if (process.platform === "darwin") return (await scanMacBrowsers()).sort((a, b) => a.name.localeCompare(b.name))
  if (process.platform !== "win32") return []
  const outputs = await Promise.all(
    _BROWSER_ROOTS.map((root) =>
      exec("reg", ["query", root, "/s", "/ve"], { windowsHide: true }).then(
        (result) => result.stdout,
        // reg exits 1 when the key does not exist, which is normal for some roots.
        () => "",
      ),
    ),
  )
  const seen = new Set<string>()
  return outputs
    .flatMap(parseBrowsers)
    .filter((browser) => {
      const id = browser.path.toLowerCase()
      if (seen.has(id) || !existsSync(browser.path)) return false
      seen.add(id)
      return true
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Opens a URL in the browser picked in the oc palette, or the system default when none is set.
 * On macOS the pick is an .app path and the `open` package runs `open -a <app> <url>`.
 */
export function openLink(kv: { get: (key: string, defaultValue?: any) => any }, url: string) {
  const browser: string | undefined = kv.get(LINK_BROWSER_KEY) || undefined
  // `open` resolves before PowerShell fails to start a missing exe, so check here to report it.
  if (browser && !existsSync(browser))
    return Promise.reject(new Error(`Link browser not found: ${browser}. Pick another in /linkBrowser.`))
  return openUrl(url, browser)
}
