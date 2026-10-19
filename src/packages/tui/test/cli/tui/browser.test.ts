import { expect, test } from "bun:test"
import { LINK_BROWSER_KEY, openLink, parseBrowsers } from "../../../src/util/browser"

// Trimmed real `reg query HKLM\SOFTWARE\Clients\StartMenuInternet /s /ve` output (CRLF).
const output = [
  String.raw`HKEY_LOCAL_MACHINE\SOFTWARE\Clients\StartMenuInternet`,
  `    (Default)    REG_SZ    IEXPLORE.EXE`,
  ``,
  String.raw`HKEY_LOCAL_MACHINE\SOFTWARE\Clients\StartMenuInternet\Firefox-308046B0AF4A39CB`,
  `    (Default)    REG_SZ    Mozilla Firefox`,
  ``,
  String.raw`HKEY_LOCAL_MACHINE\SOFTWARE\Clients\StartMenuInternet\Firefox-308046B0AF4A39CB\DefaultIcon`,
  String.raw`    (Default)    REG_SZ    C:\Program Files\Mozilla Firefox\firefox.exe,0`,
  ``,
  String.raw`HKEY_LOCAL_MACHINE\SOFTWARE\Clients\StartMenuInternet\Firefox-308046B0AF4A39CB\shell\open\command`,
  String.raw`    (Default)    REG_SZ    "C:\Program Files\Mozilla Firefox\firefox.exe"`,
  ``,
  String.raw`HKEY_LOCAL_MACHINE\SOFTWARE\Clients\StartMenuInternet\Firefox-308046B0AF4A39CB\shell\safemode\command`,
  String.raw`    (Default)    REG_SZ    "C:\Program Files\Mozilla Firefox\firefox.exe" -safe-mode`,
  ``,
  String.raw`HKEY_LOCAL_MACHINE\SOFTWARE\Clients\StartMenuInternet\Unnamed\shell\open\command`,
  String.raw`    (Default)    REG_SZ    C:\Apps\browser.exe --flag`,
  ``,
].join("\r\n")

test("parseBrowsers reads names and open-command exe paths", () => {
  expect(parseBrowsers(output)).toEqual([
    { name: "Mozilla Firefox", path: String.raw`C:\Program Files\Mozilla Firefox\firefox.exe` },
    { name: "Unnamed", path: String.raw`C:\Apps\browser.exe` },
  ])
})

test("parseBrowsers returns nothing for a missing key", () => {
  expect(parseBrowsers("")).toEqual([])
})

test("openLink rejects when the picked browser is gone", async () => {
  const missing = String.raw`C:\Missing\browser.exe`
  const kv = { get: (key: string) => (key === LINK_BROWSER_KEY ? missing : undefined) }
  await expect(openLink(kv, "https://example.com")).rejects.toThrow(`Link browser not found: ${missing}`)
})
