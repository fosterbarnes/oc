export * as OcRelease from "./ocRelease"

// Custom fork: oc updates come from oc's own GitHub releases, never upstream OpenCode's channels.
// `.scripts/pushRelease.ps1` publishes tag `v<version>` with assets
// `opencode-v<version>-<versionTag>-<variant><platform>.zip` (variant "" = oc.exe, "native-").
export const REPO = "fosterbarnes/oc"

export type Variant = "oc" | "native"
export type Asset = { name: string; url: string }
export type Release = { version: string; assets: Asset[] }

const PREFIX: Record<Variant, string> = { oc: "", native: "native-" }

/** Latest published release, or the exact `version` when given (an update installs what the user confirmed). */
export async function lookup(version?: string, api = "https://api.github.com"): Promise<Release> {
  const url = `${api}/repos/${REPO}/releases/${version ? `tags/v${version}` : "latest"}`
  const response = await fetch(url, {
    headers: { accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`oc release lookup failed: HTTP ${response.status} from ${url}`)
  return parse(await response.json())
}

/** The release asset for one binary on this platform; undefined when the release does not ship it. */
export function asset(release: Release, variant: Variant) {
  const platform = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`
  const name = new RegExp(`^opencode-v${escape(release.version)}-[A-Za-z]+-${PREFIX[variant]}${platform}\\.zip$`)
  return release.assets.find((item) => name.test(item.name))
}

/** Numeric `X.Y.Z` comparison; a release without a prerelease suffix outranks one with it. */
export function isNewer(left: string, right: string) {
  const a = split(left)
  const b = split(right)
  for (let index = 0; index < Math.max(a.core.length, b.core.length); index++) {
    const difference = (a.core[index] ?? 0) - (b.core[index] ?? 0)
    if (difference) return difference > 0
  }
  if (a.prerelease === b.prerelease) return false
  if (!a.prerelease) return true
  if (!b.prerelease) return false
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true }) > 0
}

function parse(input: unknown): Release {
  const value = input as { tag_name?: unknown; assets?: unknown }
  if (typeof value?.tag_name !== "string" || !Array.isArray(value.assets))
    throw new Error("oc release lookup returned an unexpected response")
  return {
    version: value.tag_name.replace(/^v/, ""),
    assets: value.assets.flatMap((item: { name?: unknown; browser_download_url?: unknown }) =>
      typeof item?.name === "string" && typeof item.browser_download_url === "string"
        ? [{ name: item.name, url: item.browser_download_url }]
        : [],
    ),
  }
}

function split(value: string) {
  const [core, prerelease] = value.replace(/^v/, "").split("-", 2)
  return { core: core.split(".").map((part) => Number.parseInt(part, 10) || 0), prerelease }
}

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
