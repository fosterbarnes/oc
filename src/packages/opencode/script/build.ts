#!/usr/bin/env bun

import { $ } from "bun"
import { constants, readdirSync } from "fs"
import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")
const cursorRuntimeSource = path.resolve(dir, "../cursor-runtime")
const windowsIcon = path.resolve(dir, "../../.res/icon.ico")

process.chdir(dir)

// Phase timings, so a slow /revive build shows where the time goes.
async function timed<T>(label: string, action: () => Promise<T>) {
  const start = performance.now()
  const result = await action()
  console.log(`${label}: ${Math.round(performance.now() - start)} ms`)
  return result
}

const generated = await timed("models.dev snapshot", () => import("./generate.ts"))

import { Script } from "@opencode-ai/script"
import { sourceTree } from "@opencode-ai/core/util/sourceTree"
import pkg from "../package.json"

// Custom fork: preview binaries display the local maintenance version without changing release metadata.
// The patch component is the local revision counter.
const maintenanceVersion = (await Bun.file(path.resolve(dir, "../../.version/version")).text()).split("\n")[0].trim()
if (!/^\d+\.\d+\.\d+$/.test(maintenanceVersion)) {
  throw new Error(`Invalid maintenance version: ${maintenanceVersion}`)
}
const versionTag = (await Bun.file(path.resolve(dir, "../../.version/versionTag")).text()).trim()
if (!/^[A-Za-z]+$/.test(versionTag)) throw new Error(`Invalid version tag: ${versionTag}`)
// Release builds show the plain version: /update ranks `0.2.307` above `0.2.307-main-<stamp>`, so a
// suffixed release binary would keep offering itself as an update.
const displayVersion = Script.release
  ? maintenanceVersion
  : Script.version.startsWith("0.0.0-")
    ? maintenanceVersion + Script.version.slice("0.0.0".length)
    : Script.version
// Local previews report their incorporated upstream version to provider compatibility gates.
const runtimeVersion = Script.version.startsWith("0.0.0-") ? pkg.version : Script.version

// Baked in so /revive can tell whether the installed build already matches the source folder.
const sourceTreeHash = await sourceTree(dir)

const singleFlag = process.argv.includes("--single")
const baselineFlag = process.argv.includes("--baseline")
const skipInstall = process.argv.includes("--skip-install")
const sourcemapsFlag = process.argv.includes("--sourcemaps")
const plugin = createSolidTransformPlugin()
// `--*-only` builds just that flavor and keeps the rest of dist.
const ocOnlyFlag = process.argv.includes("--oc-only")
const nativeOnlyFlag = process.argv.includes("--native-only")
// `--outdir <folder>`: where the build folders go (default `dist`); /revive builds into a staging folder.
const outdirIndex = process.argv.indexOf("--outdir")
const outdir = outdirIndex === -1 ? "dist" : process.argv[outdirIndex + 1]
if (!outdir || outdir.startsWith("--")) throw new Error("--outdir needs a folder")
const treeSitterWorker = await Bun.file(fileURLToPath(import.meta.resolve("@opentui/core/parser.worker"))).text()

const allTargets: {
  os: string
  arch: "arm64" | "x64"
  abi?: "musl"
  avx2?: false
}[] = [
  {
    os: "linux",
    arch: "arm64",
  },
  {
    os: "linux",
    arch: "x64",
  },
  {
    os: "linux",
    arch: "x64",
    avx2: false,
  },
  {
    os: "linux",
    arch: "arm64",
    abi: "musl",
  },
  {
    os: "linux",
    arch: "x64",
    abi: "musl",
  },
  {
    os: "linux",
    arch: "x64",
    abi: "musl",
    avx2: false,
  },
  {
    os: "darwin",
    arch: "arm64",
  },
  {
    os: "darwin",
    arch: "x64",
  },
  {
    os: "darwin",
    arch: "x64",
    avx2: false,
  },
  {
    os: "win32",
    arch: "arm64",
  },
  {
    os: "win32",
    arch: "x64",
  },
  {
    os: "win32",
    arch: "x64",
    avx2: false,
  },
]

const onlyFlag = ocOnlyFlag || nativeOnlyFlag
const targets =
  singleFlag || onlyFlag
    ? allTargets.filter((item) => {
        if (item.os !== process.platform || item.arch !== process.arch) {
          return false
        }

        // When building for the current platform, prefer a single native binary by default.
        // Baseline binaries require additional Bun artifacts and can be flaky to download.
        if (item.avx2 === false) {
          return baselineFlag
        }

        // also skip abi-specific builds for the same reason
        if (item.abi !== undefined) {
          return false
        }

        return true
      })
    : allTargets

// production = oc.exe (launcher + resident server), native = opencode.exe. One compile per target
// serves both: the binary takes its flavor from its file name (core/src/global.ts), so native is a copy.
const variants = ocOnlyFlag
  ? (["production"] as const)
  : nativeOnlyFlag
    ? (["native"] as const)
    : (["production", "native"] as const)
const variantInfo = {
  production: { suffix: "", binary: "oc" },
  native: { suffix: "-native", binary: "opencode" },
} as const

if (!onlyFlag) await $`rm -rf ${outdir}`

const binaries: Record<string, string> = {}
if (!skipInstall) {
  await timed("cross-platform installs", async () => {
    await $`bun install --os="*" --cpu="*" @opentui/core@${pkg.dependencies["@opentui/core"]}`
    await $`bun install --os="*" --cpu="*" @parcel/watcher@${pkg.dependencies["@parcel/watcher"]}`
    await $`bun install --os="*" --cpu="*" @ff-labs/fff-bun@${pkg.dependencies["@ff-labs/fff-bun"]}`
  })
}
// The runtime's tests stay out of the binaries' folder (and so out of the setup and zips).
const cursorRuntimeFiles = (
  await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: cursorRuntimeSource, onlyFiles: true }))
).filter((file) => !/^test[\\/]/.test(file))
for (const item of targets) {
  // The first variant compiles; the other copies that binary (an instant clone on APFS).
  let compiled: string | undefined
  for (const variant of variants) {
    const name = [
      pkg.name + variantInfo[variant].suffix,
      // changing to win32 flags npm for some reason
      item.os === "win32" ? "windows" : item.os,
      item.arch,
      item.avx2 === false ? "baseline" : undefined,
      item.abi === undefined ? undefined : item.abi,
    ]
      .filter(Boolean)
      .join("-")
    const binaryName = variantInfo[variant].binary
    const binaryPath = `${outdir}/${name}/bin/${binaryName}${item.os === "win32" ? ".exe" : ""}`
    const compileTarget = [
      "bun",
      item.os === "win32" ? "windows" : item.os,
      item.arch,
      item.avx2 === false ? "baseline" : undefined,
      item.abi,
    ]
      .filter(Boolean)
      .join("-")
    console.log(`building ${name}`)
    if (onlyFlag) await $`rm -rf ${`${outdir}/${name}`}`
    await $`mkdir -p ${outdir}/${name}/bin`

    const workerPath = "./src/cli/tui/worker.ts"
    const spawnWorkerPath = "./src/config/spawnWorker.ts"
    const treeSitterWorkerPath = "opentui-tree-sitter-worker.js"
    const bunfsRoot = item.os === "win32" ? "B:/~BUN/root/" : "/$bunfs/root/"

    if (compiled) {
      const source = compiled
      await timed(`copy ${name}`, async () => {
        await fs.copyFile(source, binaryPath, constants.COPYFILE_FICLONE)
        if (item.os !== "win32") await fs.chmod(binaryPath, 0o755)
      })
    } else {
      await timed(`compile ${name}`, () =>
        Bun.build({
          conditions: ["bun", "node"],
          tsconfig: "./tsconfig.json",
          plugins: [plugin],
          external: ["node-gyp"],
          format: "esm",
          minify: true,
          sourcemap: sourcemapsFlag ? "linked" : "none",
          splitting: true,
          bytecode: true,
          compile: {
            autoloadBunfig: false,
            autoloadDotenv: false,
            autoloadTsconfig: true,
            autoloadPackageJson: true,
            target: compileTarget as any,
            outfile: `${outdir}/${name}/bin/${binaryName}`,
            execArgv: [`--user-agent=opencode/${runtimeVersion}`, "--use-system-ca", "--no-warnings", "--"],
            // oc's icon instead of Bun's for Windows exes (shortcuts, taskbar, Explorer). Setting
            // Windows resources needs a Windows host, so cross-compiles keep Bun's icon.
            windows: item.os === "win32" && process.platform === "win32" ? { icon: windowsIcon } : {},
          },
          files: {
            [treeSitterWorkerPath]: treeSitterWorker,
          },
          entrypoints: ["./src/index.ts", workerPath, spawnWorkerPath, treeSitterWorkerPath],
          define: {
            FFF_LIBC: JSON.stringify(item.abi === "musl" ? "musl" : "gnu"),
            OPENCODE_VERSION: `'${runtimeVersion}'`,
            OPENCODE_DISPLAY_VERSION: `'${displayVersion}'`,
            OPENCODE_VERSION_TAG: `'${versionTag}'`,
            OPENCODE_MODELS_DEV: generated.modelsData,
            OTUI_TREE_SITTER_WORKER_PATH: bunfsRoot + treeSitterWorkerPath,
            OPENCODE_WORKER_PATH: workerPath,
            OPENCODE_SPAWN_WORKER_PATH: spawnWorkerPath,
            OPENCODE_CHANNEL: `'${Script.channel}'`,
            OPENCODE_SOURCE_TREE: `'${sourceTreeHash}'`,
            OPENCODE_LIBC: item.os === "linux" ? `'${item.abi ?? "glibc"}'` : "",
            ...(item.os === "linux" ? { "process.env.OPENTUI_LIBC": JSON.stringify(item.abi ?? "glibc") } : {}),
          },
        }),
      )
      compiled = binaryPath
    }

    const cursorRuntimeTarget = `${outdir}/${name}/bin/cursor-runtime`
    await $`mkdir -p ${cursorRuntimeTarget}`
    for (const file of cursorRuntimeFiles)
      await Bun.write(path.join(cursorRuntimeTarget, file), Bun.file(path.join(cursorRuntimeSource, file)))

    // Basic check: only run if binary is for current platform. A copy has the same bytes, so only the
    // compiled file is checked (a first launch costs ~2 s while macOS scans the new executable).
    if (binaryPath === compiled && item.os === process.platform && item.arch === process.arch && !item.abi) {
      console.log(`Running basic check: ${binaryPath} --version`)
      try {
        const versionOutput = await timed(`check ${name}`, () => $`${binaryPath} --version`.text())
        console.log(`Basic check passed: ${versionOutput.trim()}`)
      } catch (e) {
        console.error(`Basic check failed for ${name}:`, e)
        process.exit(1)
      }
    }

    await $`rm -rf ${outdir}/${name}/bin/tui`
    await Bun.file(`${outdir}/${name}/package.json`).write(
      JSON.stringify(
        {
          name,
          version: Script.version,
          preferUnplugged: true,
          os: [item.os],
          cpu: [item.arch],
          ...(item.abi ? { libc: [item.abi] } : {}),
        },
        null,
        2,
      ),
    )
    binaries[name] = Script.version
  }
}

if (Script.release) {
  const systemTar =
    process.platform === "win32"
      ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
      : "/usr/bin/tar"
  for (const key of Object.keys(binaries)) {
    if (key.includes("linux")) {
      await $`tar -czf ../../${key}.tar.gz *`.cwd(`${outdir}/${key}/bin`)
    } else {
      // The system bsdtar (Windows and macOS) writes zips; Git's GNU tar can come first on PATH on
      // Windows and cannot. Entries are
      // listed explicitly so folders (cursor-runtime) never depend on shell glob expansion.
      const bin = `${outdir}/${key}/bin`
      await $`${systemTar} -a -cf ../../${key}.zip ${readdirSync(bin)}`.cwd(bin)
    }
  }
  // .scripts/pushRelease.ps1 publishes the zips.
}

export { binaries }
