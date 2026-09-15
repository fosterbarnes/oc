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
const windowsHelperName = "opencode-process-tree.exe"
const windowsHelperVersion = "opencode-process-tree protocol 1"
const windowsHelperScript = path.resolve(dir, "../core/native/windows/build.ps1")
const windowsHelperCache = new Map<string, string>()
const deferWindowsHelper = process.env.OPENCODE_DEFER_WINDOWS_HELPER === "1"

process.chdir(dir)

const generated = await import("./generate.ts")

import { Script } from "@opencode-ai/script"
import pkg from "../package.json"

// Custom fork: preview binaries display the local maintenance version without changing release metadata.
const maintenanceVersion = (await Bun.file(path.resolve(dir, "../../.version/version")).text()).trim()
if (!/^\d+\.\d+\.\d+$/.test(maintenanceVersion)) {
  throw new Error(`Invalid maintenance version: ${maintenanceVersion}`)
}
const displayVersion = Script.version.startsWith("0.0.0-")
  ? maintenanceVersion + Script.version.slice("0.0.0".length)
  : Script.version

const singleFlag = process.argv.includes("--single")
const baselineFlag = process.argv.includes("--baseline")
const skipInstall = process.argv.includes("--skip-install")
const sourcemapsFlag = process.argv.includes("--sourcemaps")
const plugin = createSolidTransformPlugin()
const skipEmbedWebUi = process.argv.includes("--skip-embed-web-ui")

const createEmbeddedWebUIBundle = async () => {
  console.log(`Building Web UI to embed in the binary`)
  const appDir = path.join(import.meta.dirname, "../../app")
  const dist = path.join(appDir, "dist")
  await $`OPENCODE_CHANNEL=${Script.channel} bun run --cwd ${appDir} build`
  const files = (await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: dist })))
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => !file.endsWith(".map"))
    .sort()
  const imports = files.map((file, i) => {
    const spec = path.relative(dir, path.join(dist, file)).replaceAll("\\", "/")
    return `import file_${i} from ${JSON.stringify(spec.startsWith(".") ? spec : `./${spec}`)} with { type: "file" };`
  })
  const entries = files.map((file, i) => `  ${JSON.stringify(file)}: file_${i},`)
  return [
    `// Import all files as file_$i with type: "file"`,
    ...imports,
    `// Export with original mappings`,
    `export default {`,
    ...entries,
    `}`,
  ].join("\n")
}

const embeddedFileMap = skipEmbedWebUi ? null : await createEmbeddedWebUIBundle()
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

const targets = singleFlag
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

await $`rm -rf dist`

const binaries: Record<string, string> = {}
if (!skipInstall) {
  await $`bun install --os="*" --cpu="*" @opentui/core@${pkg.dependencies["@opentui/core"]}`
  await $`bun install --os="*" --cpu="*" @parcel/watcher@${pkg.dependencies["@parcel/watcher"]}`
  await $`bun install --os="*" --cpu="*" @ff-labs/fff-bun@${pkg.dependencies["@ff-labs/fff-bun"]}`
}
for (const item of targets) {
  const name = [
    pkg.name,
    // changing to win32 flags npm for some reason
    item.os === "win32" ? "windows" : item.os,
    item.arch,
    item.avx2 === false ? "baseline" : undefined,
    item.abi === undefined ? undefined : item.abi,
  ]
    .filter(Boolean)
    .join("-")
  console.log(`building ${name}`)
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
      target: name.replace(pkg.name, "bun") as any,
      outfile: `dist/${name}/bin/opencode`,
      execArgv: [`--user-agent=opencode/${Script.version}`, "--use-system-ca", "--"],
      windows: {},
    },
    files: {
      [treeSitterWorkerPath]: treeSitterWorker,
      ...(embeddedFileMap ? { "opencode-web-ui.gen.ts": embeddedFileMap } : {}),
    },
    entrypoints: [
      "./src/index.ts",
      workerPath,
      treeSitterWorkerPath,
      ...(embeddedFileMap ? ["opencode-web-ui.gen.ts"] : []),
    ],
    define: {
      FFF_LIBC: JSON.stringify(item.abi === "musl" ? "musl" : "gnu"),
      OPENCODE_VERSION: `'${Script.version}'`,
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
  for (const file of await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: cursorRuntimeSource, onlyFiles: true }))) {
    await Bun.write(path.join(cursorRuntimeTarget, file), Bun.file(path.join(cursorRuntimeSource, file)))
  }

  if (item.os === "win32" && !deferWindowsHelper) {
    const helperDest = path.join(dir, `dist/${name}/bin/${windowsHelperName}`)
    const cached = windowsHelperCache.get(item.arch)
    if (cached) {
      await Bun.write(helperDest, Bun.file(cached))
    } else {
      const tmpDir = path.join(dir, `dist/.helper-cache-${item.arch}`)
      const tmpHelper = path.join(tmpDir, windowsHelperName)
      await $`mkdir -p ${tmpDir}`
      let built = false
      try {
        await $`pwsh -NoProfile -File ${windowsHelperScript} -Architecture ${item.arch} -Output ${tmpHelper}`
        built = true
      } catch {
        try {
          await $`powershell -NoProfile -File ${windowsHelperScript} -Architecture ${item.arch} -Output ${tmpHelper}`
          built = true
        } catch (e) {
          console.error(
            `Windows helper build failed for ${item.arch}. Required toolchain is documented in ${windowsHelperScript}.`,
          )
          console.error(e)
          process.exit(1)
        }
      }
      if (!built || !(await Bun.file(tmpHelper).exists())) {
        console.error(
          `Windows helper not produced at ${tmpHelper}. Build script must create ${windowsHelperName} via -Architecture ${item.arch} -Output <path>.`,
        )
        process.exit(1)
      }
      windowsHelperCache.set(item.arch, tmpHelper)
      await Bun.write(helperDest, Bun.file(tmpHelper))
    }
    if (!(await Bun.file(helperDest).exists())) {
      console.error(`Windows helper missing after copy: ${helperDest}`)
      process.exit(1)
    }
  }
  if (item.os === "win32" && deferWindowsHelper) {
    console.log(`Deferring ${windowsHelperName} for ${name} to the Windows release job`)
  }

  // Basic check: only run if binary is for current platform
  if (item.os === process.platform && item.arch === process.arch && !item.abi) {
    const binaryPath = `dist/${name}/bin/opencode`
    console.log(`Running basic check: ${binaryPath} --version`)
    try {
      const versionOutput = await $`${binaryPath} --version`.text()
      console.log(`Basic check passed: ${versionOutput.trim()}`)
    } catch (e) {
      console.error(`Basic check failed for ${name}:`, e)
      process.exit(1)
    }
    if (item.os === "win32") {
      const helperPath = `dist/${name}/bin/${windowsHelperName}`
      if (!(await Bun.file(path.join(dir, helperPath)).exists())) {
        console.error(`Basic check failed: helper missing ${helperPath}`)
        process.exit(1)
      }
      console.log(`Running helper check: ${helperPath} --version`)
      try {
        const helperOutput = await $`${helperPath} --version`.text()
        const trimmed = helperOutput.trim()
        console.log(`Helper check passed: ${trimmed}`)
        if (trimmed !== windowsHelperVersion) throw new Error(`Expected ${windowsHelperVersion}, received ${trimmed}`)
      } catch (e) {
        console.error(`Helper check failed for ${name}:`, e)
        process.exit(1)
      }
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
