#!/usr/bin/env bun

import { $ } from "bun"
import path from "path"
import { fileURLToPath } from "url"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")
const runtimeSource = path.resolve(dir, "../agentify-runtime")
const cursorRuntimeSource = path.resolve(dir, "../cursor-runtime")

process.chdir(dir)

const generated = await import("./generate.ts")

import { Script } from "@opencode-ai/script"
import pkg from "../package.json"

// Custom fork: preview binaries display the local maintenance version without changing release metadata.
// The patch component is the local revision counter.
const maintenanceVersion = (await Bun.file(path.resolve(dir, "../../.version/version")).text()).split("\n")[0].trim()
if (!/^\d+\.\d+\.\d+$/.test(maintenanceVersion)) {
  throw new Error(`Invalid maintenance version: ${maintenanceVersion}`)
}
const displayVersion = Script.version.startsWith("0.0.0-")
  ? maintenanceVersion + Script.version.slice("0.0.0".length)
  : Script.version
// Local previews report their incorporated upstream version to provider compatibility gates.
const runtimeVersion = Script.version.startsWith("0.0.0-") ? pkg.version : Script.version

const singleFlag = process.argv.includes("--single")
const baselineFlag = process.argv.includes("--baseline")
const skipInstall = process.argv.includes("--skip-install")
const sourcemapsFlag = process.argv.includes("--sourcemaps")
const plugin = createSolidTransformPlugin()
const debugOnlyFlag = process.argv.includes("--debug-only")
const withDebugFlag = process.argv.includes("--with-debug")
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

const targets =
  singleFlag || debugOnlyFlag
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

const variants = debugOnlyFlag
  ? (["debug"] as const)
  : withDebugFlag
    ? (["production", "debug"] as const)
    : (["production"] as const)

if (!debugOnlyFlag) await $`rm -rf dist`

const binaries: Record<string, string> = {}
if (!skipInstall) {
  await $`bun install --os="*" --cpu="*" @opentui/core@${pkg.dependencies["@opentui/core"]}`
  await $`bun install --os="*" --cpu="*" @parcel/watcher@${pkg.dependencies["@parcel/watcher"]}`
  await $`bun install --os="*" --cpu="*" @ff-labs/fff-bun@${pkg.dependencies["@ff-labs/fff-bun"]}`
}
for (const variant of variants) {
  for (const item of targets) {
    const name = [
      variant === "debug" ? `${pkg.name}-debug` : pkg.name,
      // changing to win32 flags npm for some reason
      item.os === "win32" ? "windows" : item.os,
      item.arch,
      item.avx2 === false ? "baseline" : undefined,
      item.abi === undefined ? undefined : item.abi,
    ]
      .filter(Boolean)
      .join("-")
    const binaryName = variant === "debug" ? "ocdebug" : "opencode"
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
    if (debugOnlyFlag) await $`rm -rf ${`dist/${name}`}`
    await $`mkdir -p dist/${name}/bin`

    const workerPath = "./src/cli/tui/worker.ts"
    const treeSitterWorkerPath = "opentui-tree-sitter-worker.js"
    const bunfsRoot = item.os === "win32" ? "B:/~BUN/root/" : "/$bunfs/root/"

    await Bun.build({
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
        outfile: `dist/${name}/bin/${binaryName}`,
        execArgv: [`--user-agent=opencode/${runtimeVersion}`, "--use-system-ca", "--"],
        windows: {},
      },
      files: {
        [treeSitterWorkerPath]: treeSitterWorker,
      },
      entrypoints: [
        "./src/index.ts",
        workerPath,
        treeSitterWorkerPath,
      ],
      define: {
        FFF_LIBC: JSON.stringify(item.abi === "musl" ? "musl" : "gnu"),
        OPENCODE_VERSION: `'${runtimeVersion}'`,
        OPENCODE_DISPLAY_VERSION: `'${displayVersion}'`,
        OPENCODE_MODELS_DEV: generated.modelsData,
        OTUI_TREE_SITTER_WORKER_PATH: bunfsRoot + treeSitterWorkerPath,
        OPENCODE_WORKER_PATH: workerPath,
        OPENCODE_CHANNEL: `'${Script.channel}'`,
        OPENCODE_LIBC: item.os === "linux" ? `'${item.abi ?? "glibc"}'` : "",
        ...(item.os === "linux" ? { "process.env.OPENTUI_LIBC": JSON.stringify(item.abi ?? "glibc") } : {}),
      },
    })

    const runtimeTarget = `dist/${name}/bin/agentify-runtime`
    await $`mkdir -p ${runtimeTarget}`
    for (const file of await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: runtimeSource, onlyFiles: true }))) {
      await Bun.write(path.join(runtimeTarget, file), Bun.file(path.join(runtimeSource, file)))
    }
    const cursorRuntimeTarget = `dist/${name}/bin/cursor-runtime`
    await $`mkdir -p ${cursorRuntimeTarget}`
    for (const file of await Array.fromAsync(
      new Bun.Glob("**/*").scan({ cwd: cursorRuntimeSource, onlyFiles: true }),
    )) {
      await Bun.write(path.join(cursorRuntimeTarget, file), Bun.file(path.join(cursorRuntimeSource, file)))
    }

    // Basic check: only run if binary is for current platform
    if (item.os === process.platform && item.arch === process.arch && !item.abi) {
      const binaryPath = `dist/${name}/bin/${binaryName}`
      console.log(`Running basic check: ${binaryPath} --version`)
      try {
        const versionOutput = await $`${binaryPath} --version`.text()
        console.log(`Basic check passed: ${versionOutput.trim()}`)
      } catch (e) {
        console.error(`Basic check failed for ${name}:`, e)
        process.exit(1)
      }
    }

    await $`rm -rf ./dist/${name}/bin/tui`
    await Bun.file(`dist/${name}/package.json`).write(
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
  for (const key of Object.keys(binaries)) {
    if (key.includes("linux")) {
      await $`tar -czf ../../${key}.tar.gz *`.cwd(`dist/${key}/bin`)
    } else {
      await $`zip -r ../../${key}.zip *`.cwd(`dist/${key}/bin`)
    }
  }
  await $`gh release upload v${Script.version} ./dist/*.zip ./dist/*.tar.gz --clobber --repo ${process.env.GH_REPO}`
}

export { binaries }
