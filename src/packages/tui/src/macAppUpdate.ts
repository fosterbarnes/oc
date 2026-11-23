import { constants, existsSync } from "node:fs"
import { access, mkdtemp, readdir, rename, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { errorText, runCliCommand, runOrThrow } from "./cliUpdate"
import {
  compareDesktopVersions,
  STEP_PREFIX,
  type DesktopCheckResult,
  type DesktopInstallResult,
} from "./desktopUpdate"
import { download } from "./pwshUpdateMac"

// Claude Desktop and ChatGPT Desktop on macOS. Both update themselves (Squirrel and Sparkle), but
// only when opened; oc updates them the same way however they were installed (dmg, brew cask):
// read the vendor's feed, download the zip, and accept the new .app only when it is validly signed,
// notarized, and has the installed app's bundle id and Team ID (so no team is hardcoded). Then the
// app is asked to quit (never killed: Claude Desktop hosts Claude Code sessions), swapped by
// renames inside its own folder, and reopened if it was running. No admin prompt: an app oc cannot
// write is left to its own updater.

type OnLine = (line: string) => void
type Latest = { version: string; url: string }

export type MacAppSpec = {
  key: string
  label: string
  appName: string
  // Required bundle id of the installed app; unset when the vendor's id is not pinned (ChatGPT).
  bundleId?: string
  hosts: string[]
  note: string
  latest: () => Promise<Latest>
  // Why the installed app (by bundle id) cannot be updated this way, if so.
  unsupported?: (bundleId: string) => string | undefined
}

const VERSION = /^\d+(\.\d+){1,3}$/
const inflight = new Set<string>()

/** Claude's Squirrel `RELEASES.json`: the release whose version is `currentRelease`. */
export function parseClaudeReleases(json: unknown, hosts: string[]): Latest {
  const data = json as { currentRelease?: unknown; releases?: { updateTo?: { version?: unknown; url?: unknown } }[] }
  const current = data.currentRelease
  const release = data.releases?.find((item) => item.updateTo?.version === current)?.updateTo
  if (typeof current !== "string" || !VERSION.test(current) || typeof release?.url !== "string") {
    throw new Error("update check failed: the release feed lists no current release")
  }
  return { version: current, url: checkedUrl(release.url, hosts) }
}

/** A Sparkle appcast: the first item's `sparkle:shortVersionString` and enclosure url. */
export function parseAppcast(xml: string, hosts: string[]): Latest {
  const item = xml.match(/<item>([\s\S]*?)<\/item>/)?.[1] ?? ""
  const version =
    item.match(/<sparkle:shortVersionString>\s*([^<\s]+)\s*<\/sparkle:shortVersionString>/)?.[1] ??
    item.match(/sparkle:shortVersionString="([^"]+)"/)?.[1]
  const url = item.match(/<enclosure\b[^>]*\burl="([^"]+)"/)?.[1]
  if (!version || !VERSION.test(version) || !url) throw new Error("update check failed: the appcast lists no release")
  return { version, url: checkedUrl(url.replaceAll("&amp;", "&"), hosts) }
}

/** `TeamIdentifier=Q6L2SF6YDW` from `codesign -dv` output. */
export function parseTeamId(output: string) {
  const team = output.match(/^TeamIdentifier=([A-Z0-9]{10})$/m)?.[1]
  if (!team) throw new Error("the app has no Developer ID team")
  return team
}

function checkedUrl(raw: string, hosts: string[]) {
  const url = new URL(raw)
  if (url.protocol !== "https:" || !hosts.includes(url.hostname)) {
    throw new Error(`update check failed: unexpected download url '${raw}'`)
  }
  return url.href
}

async function fetchFeed(url: string, hosts: string[]) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  const host = new URL(response.url).hostname
  if (!hosts.includes(host)) throw new Error(`update check failed: feed redirected to '${host}'`)
  if (!response.ok) throw new Error(`update check failed: HTTP ${response.status} from ${host}`)
  return response.text()
}

const CLAUDE_HOSTS = ["downloads.claude.ai"]
const CHATGPT_HOSTS = ["persistent.oaistatic.com"]

export const CLAUDE_DESKTOP_MAC: MacAppSpec = {
  key: "claude-desktop-mac",
  label: "Claude Desktop",
  appName: "Claude.app",
  bundleId: "com.anthropic.claudefordesktop",
  hosts: CLAUDE_HOSTS,
  note: "quits Claude Desktop and any Claude Code sessions started from it, then reopens it if it was open",
  latest: async () =>
    parseClaudeReleases(
      JSON.parse(await fetchFeed("https://downloads.claude.ai/releases/darwin/universal/RELEASES.json", CLAUDE_HOSTS)),
      CLAUDE_HOSTS,
    ),
}

// The Codex-based ChatGPT app (`com.openai.codex`, the `chatgpt` Homebrew cask's appcast). The
// older ChatGPT app (`com.openai.chat`) has its own feed, so it is only reported.
export const CHATGPT_DESKTOP_MAC: MacAppSpec = {
  key: "chatgpt-desktop-mac",
  label: "ChatGPT Desktop",
  appName: "ChatGPT.app",
  hosts: CHATGPT_HOSTS,
  note: "quits ChatGPT and any sessions running inside it, then reopens it if it was open",
  latest: async () => {
    const feed = os.arch() === "arm64" ? "appcast.xml" : "appcast-x64.xml"
    return parseAppcast(
      await fetchFeed(`https://persistent.oaistatic.com/codex-app-prod/${feed}`, CHATGPT_HOSTS),
      CHATGPT_HOSTS,
    )
  },
  unsupported: (bundleId) =>
    bundleId === "com.openai.codex" ? undefined : "this is the older ChatGPT app; update it from the app",
}

function appPaths(spec: MacAppSpec) {
  return [path.join("/Applications", spec.appName), path.join(os.homedir(), "Applications", spec.appName)]
}

/** Local and quick: the .app folder exists (the check verifies its bundle id). */
export function macAppPresent(spec: MacAppSpec) {
  return (
    process.platform === "darwin" && appPaths(spec).some((app) => existsSync(path.join(app, "Contents", "Info.plist")))
  )
}

async function plistValue(plist: string, key: string) {
  return (await runOrThrow("plutil", ["-extract", key, "raw", "-o", "-", plist])).trim()
}

type Installed = { app: string; bundleId: string; version: string }

async function findInstalled(spec: MacAppSpec): Promise<Installed | undefined> {
  for (const app of appPaths(spec)) {
    const plist = path.join(app, "Contents", "Info.plist")
    if (!existsSync(plist)) continue
    const bundleId = await plistValue(plist, "CFBundleIdentifier")
    // It ends up in an AppleScript string (quit app id "...").
    if (!/^[A-Za-z0-9.-]+$/.test(bundleId) || (spec.bundleId && bundleId !== spec.bundleId)) continue
    return { app, bundleId, version: await appVersion(app) }
  }
}

async function appVersion(app: string) {
  const version = await plistValue(path.join(app, "Contents", "Info.plist"), "CFBundleShortVersionString")
  if (!VERSION.test(version)) throw new Error(`could not read the version of ${app}`)
  return version
}

const notInstalled = (spec: MacAppSpec) => ({
  ok: false as const,
  alreadyRunning: false,
  message: `${spec.label} not installed`,
  notInstalled: true as const,
})

export async function checkMacApp(spec: MacAppSpec): Promise<DesktopCheckResult> {
  const key = `${spec.key}:check`
  if (inflight.has(key)) return { ok: false, alreadyRunning: true, message: `${spec.label} check already running` }
  inflight.add(key)
  try {
    const installed = await findInstalled(spec)
    if (!installed) return notInstalled(spec)
    const reason = spec.unsupported?.(installed.bundleId)
    if (reason) return { ok: false, alreadyRunning: false, manual: true, message: `${spec.label}: ${reason}` }
    const latest = await spec.latest()
    if (compareDesktopVersions(latest.version, installed.version) <= 0) {
      const message = `${spec.label} is up to date (${installed.version})`
      return { ok: true, alreadyRunning: false, upToDate: true, version: installed.version, message }
    }
    if (!(await writable(installed.app))) {
      const message = `${spec.label} ${installed.version} -> ${latest.version} available; oc cannot write ${installed.app}, update it from the app`
      return { ok: false, alreadyRunning: false, manual: true, message }
    }
    return {
      ok: true,
      alreadyRunning: false,
      upToDate: false,
      oldVersion: installed.version,
      newVersion: latest.version,
      message: `${spec.label} update available: ${installed.version} -> ${latest.version}`,
    }
  } catch (cause) {
    return { ok: false, alreadyRunning: false, message: `Failed to check ${spec.label}: ${errorText(cause)}` }
  } finally {
    inflight.delete(key)
  }
}

export async function installMacApp(
  spec: MacAppSpec,
  expectedVersion: string,
  onLine?: OnLine,
): Promise<DesktopInstallResult> {
  const key = `${spec.key}:install`
  if (inflight.has(key)) return { ok: false, alreadyRunning: true, message: `${spec.label} update already running` }
  inflight.add(key)
  let dir: string | undefined
  try {
    dir = await mkdtemp(path.join(os.tmpdir(), "oc-mac-app-update-"))
    const message = await install(spec, expectedVersion, dir, onLine)
    return { ok: true, alreadyRunning: false, message }
  } catch (cause) {
    return { ok: false, alreadyRunning: false, message: `Failed to update ${spec.label}: ${errorText(cause)}` }
  } finally {
    inflight.delete(key)
    // A leftover temp folder must not replace the install's result.
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function install(spec: MacAppSpec, expectedVersion: string, dir: string, onLine?: OnLine) {
  const installed = await findInstalled(spec)
  if (!installed) throw new Error(`${spec.label} not installed`)
  const { app, bundleId } = installed
  const before = installed.version
  const latest = await spec.latest()
  if (latest.version !== expectedVersion) throw new Error(`latest version changed (${latest.version}); confirm again`)
  if (compareDesktopVersions(latest.version, before) <= 0) return `${spec.label} is up to date (${before})`
  if (!(await writable(app))) throw new Error(`oc cannot write ${app}; update it from the app`)

  const zip = path.join(dir, "update.zip")
  await download(latest.url, zip, (host) => spec.hosts.includes(host), onLine)
  onLine?.(`${STEP_PREFIX}verifying`)
  const extracted = path.join(dir, "extracted")
  await runOrThrow("ditto", ["-x", "-k", zip, extracted])
  const fresh = await findApp(extracted, spec.appName)
  await runOrThrow("codesign", ["--verify", "--deep", "--strict", fresh])
  const freshPlist = path.join(fresh, "Contents", "Info.plist")
  const freshId = await plistValue(freshPlist, "CFBundleIdentifier")
  if (freshId !== bundleId) throw new Error(`downloaded app is ${freshId}, not ${bundleId}`)
  const freshVersion = await appVersion(fresh)
  if (freshVersion !== expectedVersion) throw new Error(`downloaded app is ${freshVersion}, not ${expectedVersion}`)
  const [team, freshTeam] = await Promise.all([teamId(app), teamId(fresh)])
  if (team !== freshTeam) throw new Error(`downloaded app is signed by team ${freshTeam}, not ${team}`)
  await runOrThrow("spctl", ["--assess", "--type", "execute", fresh])

  onLine?.(`${STEP_PREFIX}installing`)
  const wasRunning = await isRunning(app)
  if (wasRunning) await quit(spec, app, bundleId)
  try {
    // Quitting lets Squirrel's ShipIt or Sparkle's Autoupdate install an update it already fetched.
    // Swapping the app while one still runs could leave it half replaced.
    if (!(await waitFor(async () => !(await anyRunning(["ShipIt", "Autoupdate"])), 30_000)))
      throw new Error("the app's own updater is still running; try again shortly")
    const current = await appVersion(app)
    if (compareDesktopVersions(current, expectedVersion) < 0) await swap(app, fresh)
  } finally {
    // A failed swap restored the old app; reopen whichever version is in place.
    if (wasRunning) await runCliCommand("open", ["-b", bundleId], 30_000)
  }
  const after = await appVersion(app)
  if (compareDesktopVersions(after, expectedVersion) < 0)
    throw new Error(`install finished but ${spec.label} reports ${after}`)
  return `Updated ${spec.label} ${before} -> ${after}`
}

// The swap renames the app inside its folder, so both must be writable.
async function writable(app: string) {
  const checks = [path.dirname(app), app].map((file) =>
    access(file, constants.W_OK).then(
      () => true,
      () => false,
    ),
  )
  return !(await Promise.all(checks)).includes(false)
}

async function findApp(dir: string, appName: string) {
  const apps = (await readdir(dir)).filter((name) => name.endsWith(".app"))
  const name = apps.includes(appName) ? appName : apps.length === 1 ? apps[0] : undefined
  if (!name) throw new Error(`the download holds no ${appName}`)
  return path.join(dir, name)
}

async function teamId(app: string) {
  return parseTeamId(await runOrThrow("codesign", ["-dv", "--verbose=2", app]))
}

async function isRunning(app: string) {
  return (await runCliCommand("pgrep", ["-f", `${app}/Contents/MacOS/`], 10_000)).ok
}

async function anyRunning(names: string[]) {
  const found = await Promise.all(names.map((name) => runCliCommand("pgrep", ["-x", name], 10_000)))
  return found.some((result) => result.ok)
}

async function waitFor(done: () => Promise<boolean>, timeoutMs: number) {
  const until = Date.now() + timeoutMs
  while (!(await done())) {
    if (Date.now() > until) return false
    await sleep(500)
  }
  return true
}

async function quit(spec: MacAppSpec, app: string, bundleId: string) {
  await runCliCommand("osascript", ["-e", `quit app id "${bundleId}"`], 30_000)
  if (!(await waitFor(async () => !(await isRunning(app)), 20_000))) {
    throw new Error(`${spec.label} did not quit; close it and try again`)
  }
}

// Renames inside the app's own folder, so the app is never half replaced; a failed rename puts the
// old app back. Leftovers from an interrupted run are cleared first.
async function swap(app: string, fresh: string) {
  const staged = `${app}.oc-new`
  const old = `${app}.oc-old`
  if (!existsSync(app) && existsSync(old)) await rename(old, app)
  await rm(staged, { recursive: true, force: true })
  await rm(old, { recursive: true, force: true })
  await runOrThrow("ditto", [fresh, staged])
  await rename(app, old)
  try {
    await rename(staged, app)
  } catch (cause) {
    await rename(old, app)
    throw cause
  }
  await rm(old, { recursive: true, force: true })
}
