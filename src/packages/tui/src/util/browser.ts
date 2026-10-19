import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
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

export type Browser = { name: string; path: string }

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

/** Installed browsers on Windows, deduplicated by exe path; empty on other platforms. */
export async function scanBrowsers(): Promise<Browser[]> {
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

/** Opens a URL in the browser picked in the oc palette, or the system default when none is set. */
export function openLink(kv: { get: (key: string, defaultValue?: any) => any }, url: string) {
  const browser: string | undefined = kv.get(LINK_BROWSER_KEY) || undefined
  // `open` resolves before PowerShell fails to start a missing exe, so check here to report it.
  if (browser && !existsSync(browser))
    return Promise.reject(new Error(`Link browser not found: ${browser}. Pick another in /linkBrowser.`))
  return openUrl(url, browser)
}
