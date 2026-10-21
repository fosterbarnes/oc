import { intro, log, outro, spinner } from "@clack/prompts"
import { Effect } from "effect"

import { rm } from "node:fs/promises"
import { ConfigPaths } from "@/config/paths"
import { ConfigPlugin } from "@/config/plugin"
import { Global } from "@opencode-ai/core/global"
import { NpmUpdate } from "@opencode-ai/core/npm-update"
import { installPlugin, patchPluginConfig, readPluginManifest, removePluginConfig } from "../../plugin/install"
import { isPathPluginSpec, parsePluginSpecifier, resolvePluginTarget, type PluginKind } from "../../plugin/shared"
import { errorMessage } from "../../util/error"
import { Filesystem } from "@/util/filesystem"
import { Process } from "@/util/process"
import { UI } from "../ui"
import { cmd } from "./cmd"
import { effectCmd, fail } from "../effect-cmd"
import { InstanceRef } from "@/effect/instance-ref"

type Spin = {
  start: (msg: string) => void
  stop: (msg: string, code?: number) => void
}

export type PlugDeps = {
  spinner: () => Spin
  log: {
    error: (msg: string) => void
    info: (msg: string) => void
    success: (msg: string) => void
  }
  resolve: (spec: string) => Promise<string>
  readText: (file: string) => Promise<string>
  write: (file: string, text: string) => Promise<void>
  exists: (file: string) => Promise<boolean>
  files: (dir: string, name: "opencode" | "tui") => string[]
  global: string
}

export type PlugInput = {
  mod: string
  global?: boolean
  force?: boolean
}

export type PlugCtx = {
  vcs?: string
  worktree: string
  directory: string
}

const defaultPlugDeps: PlugDeps = {
  spinner: () => spinner(),
  log: {
    error: (msg) => log.error(msg),
    info: (msg) => log.info(msg),
    success: (msg) => log.success(msg),
  },
  resolve: (spec) => resolvePluginTarget(spec),
  readText: (file) => Filesystem.readText(file),
  write: async (file, text) => {
    await Filesystem.write(file, text)
  },
  exists: (file) => Filesystem.exists(file),
  files: (dir, name) => ConfigPaths.fileInDirectory(dir, name),
  global: Global.Path.config,
}

function cause(err: unknown) {
  if (!err || typeof err !== "object") return
  if (!("cause" in err)) return
  return (err as { cause?: unknown }).cause
}

export function createPlugTask(input: PlugInput, dep: PlugDeps = defaultPlugDeps) {
  const mod = input.mod
  const force = Boolean(input.force)
  const global = Boolean(input.global)

  return async (ctx: PlugCtx) => {
    const install = dep.spinner()
    install.start("Installing plugin package...")
    const target = await installPlugin(mod, dep)
    if (!target.ok) {
      install.stop("Install failed", 1)
      dep.log.error(`Could not install "${mod}"`)
      const hit = cause(target.error) ?? target.error
      if (hit instanceof Process.RunFailedError) {
        const lines = hit.stderr
          .toString()
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
        const errs = lines.filter((line) => line.startsWith("error:")).map((line) => line.replace(/^error:\s*/, ""))
        const detail = errs[0] ?? lines.at(-1)
        if (detail) dep.log.error(detail)
        if (lines.some((line) => line.includes("No version matching"))) {
          dep.log.info("This package depends on a version that is not available in your npm registry.")
          dep.log.info("Check npm registry/auth settings and try again.")
        }
      }
      if (!(hit instanceof Process.RunFailedError)) {
        dep.log.error(errorMessage(hit))
      }
      return false
    }
    install.stop("Plugin package ready")

    const inspect = dep.spinner()
    inspect.start("Reading plugin manifest...")
    const manifest = await readPluginManifest(target.target)
    if (!manifest.ok) {
      if (manifest.code === "manifest_read_failed") {
        inspect.stop("Manifest read failed", 1)
        dep.log.error(`Installed "${mod}" but failed to read ${manifest.file}`)
        dep.log.error(errorMessage(cause(manifest.error) ?? manifest.error))
        return false
      }

      if (manifest.code === "manifest_no_targets") {
        inspect.stop("No plugin targets found", 1)
        dep.log.error(`"${mod}" does not expose plugin entrypoints in package.json`)
        dep.log.info(
          'Expected one of: exports["./tui"], exports["./server"], package.json main for server, or package.json["oc-themes"] for tui themes.',
        )
        return false
      }

      inspect.stop("Manifest read failed", 1)
      return false
    }

    inspect.stop(
      `Detected ${manifest.targets.map((item) => item.kind).join(" + ")} target${manifest.targets.length === 1 ? "" : "s"}`,
    )

    const patch = dep.spinner()
    patch.start("Updating plugin config...")
    const out = await patchPluginConfig(
      {
        spec: mod,
        targets: manifest.targets,
        force,
        global,
        vcs: ctx.vcs,
        worktree: ctx.worktree,
        directory: ctx.directory,
        config: dep.global,
      },
      dep,
    )
    if (!out.ok) {
      if (out.code === "invalid_json") {
        patch.stop(`Failed updating ${out.kind} config`, 1)
        dep.log.error(`Invalid JSON in ${out.file} (${out.parse} at line ${out.line}, column ${out.col})`)
        dep.log.info("Fix the config file and run the command again.")
        return false
      }

      patch.stop("Failed updating plugin config", 1)
      dep.log.error(errorMessage(out.error))
      return false
    }
    patch.stop("Plugin config updated")
    for (const item of out.items) {
      if (item.mode === "noop") {
        dep.log.info(`Already configured in ${item.file}`)
        continue
      }
      if (item.mode === "replace") {
        dep.log.info(`Replaced in ${item.file}`)
        continue
      }
      dep.log.info(`Added to ${item.file}`)
    }

    dep.log.success(`Installed ${mod}`)
    dep.log.info(global ? `Scope: global (${out.dir})` : `Scope: local (${out.dir})`)
    return true
  }
}

export type PluginRow = {
  name: string
  spec: string
  kinds: PluginKind[]
  scope: ConfigPlugin.Scope
  sources: string[]
}

// One row per plugin identity (package name, or file URL for path plugins) across the server
// (opencode.json) and TUI (tui.json) configs, the same external set the TUI /plugins manager loads.
export function pluginInventory(origins: { kind: PluginKind; origin: ConfigPlugin.Origin }[]) {
  return origins.reduce<PluginRow[]>((rows, item) => {
    const spec = ConfigPlugin.pluginSpecifier(item.origin.spec)
    const name = isPathPluginSpec(spec) ? spec : parsePluginSpecifier(spec).pkg
    const row = rows.find((entry) => entry.name === name)
    if (!row)
      return [...rows, { name, spec, kinds: [item.kind], scope: item.origin.scope, sources: [item.origin.source] }]
    if (!row.kinds.includes(item.kind)) row.kinds.push(item.kind)
    if (!row.sources.includes(item.origin.source)) row.sources.push(item.origin.source)
    return rows
  }, [])
}

const loadInventory = Effect.fn("Cli.plug.inventory")(function* () {
  const { Config } = yield* Effect.promise(() => import("@/config/config"))
  const { TuiConfig } = yield* Effect.promise(() => import("@/config/tui"))
  const config = yield* Config.Service.use((cfg) => cfg.get())
  const tui = yield* Effect.promise(() => TuiConfig.pluginOrigins())
  return pluginInventory([
    ...(config.plugin_origins ?? []).map((origin) => ({ kind: "server" as const, origin })),
    ...tui.map((origin) => ({ kind: "tui" as const, origin })),
  ])
})

function findRows(rows: PluginRow[], mod: string) {
  const name = isPathPluginSpec(mod) ? mod : parsePluginSpecifier(mod).pkg
  return rows.filter((row) => row.name === name || row.spec === mod)
}

const PluginInstallCommand = effectCmd({
  command: "$0 <module>",
  describe: "install plugin and update config",
  builder: (yargs) =>
    yargs
      .positional("module", {
        type: "string",
        describe: "npm module name",
      })
      .option("global", {
        alias: ["g"],
        type: "boolean",
        default: false,
        describe: "install in global config",
      })
      .option("force", {
        alias: ["f"],
        type: "boolean",
        default: false,
        describe: "replace existing plugin version",
      }),
  handler: Effect.fn("Cli.plug")(function* (args) {
    const mod = String(args.module ?? "").trim()
    if (!mod) {
      UI.error("module is required")
      process.exitCode = 1
      return
    }

    UI.empty()
    intro(`Install plugin ${mod}`)

    const run = createPlugTask({
      mod,
      global: Boolean(args.global),
      force: Boolean(args.force),
    })

    const ctx = yield* InstanceRef
    if (!ctx) return
    const ok = yield* Effect.promise(() =>
      run({
        vcs: ctx.project.vcs,
        worktree: ctx.worktree,
        directory: ctx.directory,
      }),
    )

    outro("Done")
    if (!ok) process.exitCode = 1
  }),
})

const PluginListCommand = effectCmd({
  command: "list",
  aliases: ["ls"],
  describe: "list configured plugins with their installed versions",
  handler: Effect.fn("Cli.plug.list")(function* () {
    const rows = yield* loadInventory()
    if (!rows.length) {
      console.log("No external plugins configured")
      return
    }
    const width = Math.max(...rows.map((row) => row.spec.length))
    for (const row of rows) {
      const version = isPathPluginSpec(row.spec)
        ? "local path"
        : ((yield* Effect.promise(() => NpmUpdate.installedVersion(row.spec))) ?? "not installed")
      console.log(`${row.spec.padEnd(width)}  ${row.kinds.join("+").padEnd(10)}  ${row.scope.padEnd(6)}  ${version}`)
    }
  }),
})

const PluginRemoveCommand = effectCmd({
  command: "remove <module>",
  aliases: ["rm"],
  describe: "remove a plugin from every config file that lists it",
  builder: (yargs) => yargs.positional("module", { type: "string", demandOption: true, describe: "npm module name" }),
  handler: Effect.fn("Cli.plug.remove")(function* (args) {
    const rows = findRows(yield* loadInventory(), args.module)
    if (!rows.length) return yield* fail(`Plugin "${args.module}" is not configured`)
    const sources = [...new Set(rows.flatMap((row) => row.sources))]
    // Plugins found in a `plugin/` folder have that folder as their source, not a config file.
    const files = sources.filter((file) => /\.jsonc?$/.test(file))
    const removed = yield* Effect.promise(() =>
      Promise.all(files.map((file) => removePluginConfig(file, rows[0].spec))).then((hits) =>
        files.filter((_, i) => hits[i]),
      ),
    )
    for (const file of removed) console.log(`Removed from ${file}`)
    for (const dir of sources.filter((file) => !files.includes(file))) {
      console.log(`Loaded from the plugin folder ${dir}; delete its file there to remove it`)
    }
    // Path plugins are stored relative to their config file, so a resolved spec may not match.
    if (!removed.length && files.length) return yield* fail(`Could not find "${args.module}" in ${files.join(", ")}`)
  }),
})

const PluginUpdateCommand = effectCmd({
  command: "update [module]",
  describe: "update npm plugins that have a newer version (all when no module is given)",
  builder: (yargs) =>
    yargs
      .positional("module", { type: "string", describe: "npm module name" })
      .option("check", { type: "boolean", default: false, describe: "only report available updates" }),
  handler: Effect.fn("Cli.plug.update")(function* (args) {
    const all = yield* loadInventory()
    const rows = (args.module ? findRows(all, args.module) : all).filter((row) => !isPathPluginSpec(row.spec))
    if (!rows.length) {
      if (args.module) return yield* fail(`Plugin "${args.module}" is not a configured npm plugin`)
      console.log("No npm plugins configured")
      return
    }
    for (const row of rows) {
      const status = yield* Effect.promise(() =>
        NpmUpdate.check(row.spec).catch((error: unknown) => new Error(errorMessage(error))),
      )
      if (status instanceof Error) {
        UI.error(`${row.spec}: ${status.message}`)
        process.exitCode = 1
        continue
      }
      if (!status) {
        console.log(`${row.spec}: pinned, not updated`)
        continue
      }
      if (!status.outdated) {
        console.log(`${row.spec}: up to date (${status.installed ?? "not installed"})`)
        continue
      }
      if (args.check) {
        console.log(`${row.spec}: ${status.installed} -> ${status.latest} available`)
        continue
      }
      const updated = yield* Effect.promise(() =>
        rm(NpmUpdate.cacheDir(row.spec), { recursive: true, force: true })
          .then(() => resolvePluginTarget(row.spec))
          .then(
            () => true,
            (error: unknown) => new Error(errorMessage(error)),
          ),
      )
      if (updated instanceof Error) {
        UI.error(`${row.spec}: update failed: ${updated.message}`)
        process.exitCode = 1
        continue
      }
      console.log(`${row.spec}: updated ${status.installed} -> ${status.latest}; restart oc to load it`)
    }
  }),
})

export const PluginCommand = cmd({
  command: "plugin",
  aliases: ["plug"],
  describe: "install, list, remove, and update plugins",
  builder: (yargs) =>
    yargs
      .command(PluginInstallCommand)
      .command(PluginListCommand)
      .command(PluginRemoveCommand)
      .command(PluginUpdateCommand)
      .demandCommand(),
  async handler() {},
})
