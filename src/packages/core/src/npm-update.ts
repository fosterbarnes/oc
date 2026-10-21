export * as NpmUpdate from "./npm-update"

import path from "path"
import npa from "npm-package-arg"
import semver from "semver"
import { Effect } from "effect"
import { Global } from "./global"
import { sanitize } from "./npm"
import { NpmConfig } from "./npm-config"

// One "newer version available" check for npm plugins, shared by `oc plug update` and the TUI
// /plugins dialog. It only reports; installing stays an explicit `oc plug update`.

export type Status = {
  name: string
  installed?: string
  latest?: string
  outdated: boolean
}

// Bare names install as `<name>@latest` so their cache folder never collides with a pinned spec.
export function installSpec(spec: string) {
  const hit = parse(spec)
  if (hit?.name && hit.raw === hit.name) return `${hit.name}@latest`
  return spec
}

export function cacheDir(spec: string) {
  return path.join(Global.Path.cache, "packages", sanitize(installSpec(spec)))
}

export async function installedVersion(spec: string) {
  const name = parse(spec)?.name
  if (!name) return
  const pkg = await Bun.file(path.join(cacheDir(spec), "node_modules", name, "package.json"))
    .json()
    .catch(() => undefined)
  return typeof pkg?.version === "string" ? pkg.version : undefined
}

// Returns undefined for specs that never update: paths, git, aliases, and exact version pins.
export async function check(spec: string, options: { registry?: string; fetch?: typeof fetch } = {}) {
  const wanted = target(spec)
  if (!wanted) return
  const registry = options.registry ?? (await registryFor(wanted.name, cacheDir(spec)))
  const response = await (options.fetch ?? fetch)(`${registry}/${wanted.name.replace("/", "%2f")}`, {
    headers: { Accept: "application/vnd.npm.install-v1+json" },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`npm registry returned ${response.status} for ${wanted.name}`)
  const meta = (await response.json()) as { "dist-tags"?: Record<string, string>; versions?: Record<string, unknown> }
  const latest =
    wanted.range === undefined
      ? meta["dist-tags"]?.[wanted.tag]
      : (semver.maxSatisfying(Object.keys(meta.versions ?? {}), wanted.range) ?? undefined)
  const installed = await installedVersion(spec)
  return {
    name: wanted.name,
    installed,
    latest,
    outdated: Boolean(installed && latest && semver.valid(installed) && semver.gt(latest, installed)),
  } satisfies Status
}

function target(spec: string) {
  const hit = parse(spec)
  if (!hit?.name) return
  if (hit.raw === hit.name) return { name: hit.name, tag: "latest" }
  if (hit.type === "tag") return { name: hit.name, tag: hit.fetchSpec ?? "latest" }
  if (hit.type === "range" && hit.fetchSpec) return { name: hit.name, range: hit.fetchSpec }
}

async function registryFor(name: string, dir: string) {
  const config = await Effect.runPromise(NpmConfig.load(dir))
  const scoped = name.startsWith("@") ? config[`${name.split("/")[0]}:registry`] : undefined
  const registry =
    [scoped, config.registry].find((item): item is string => typeof item === "string") ?? "https://registry.npmjs.org"
  return registry.endsWith("/") ? registry.slice(0, -1) : registry
}

function parse(spec: string) {
  try {
    return npa(spec)
  } catch {
    return undefined
  }
}
