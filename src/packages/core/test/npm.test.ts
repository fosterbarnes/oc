import fs from "fs/promises"
import path from "path"
import { pathToFileURL } from "url"
import { describe, expect, test } from "bun:test"
import { Effect, Option } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Global } from "@opencode-ai/core/global"
import { Npm } from "@opencode-ai/core/npm"
import { which } from "@opencode-ai/core/util/which"
import { tmpdir } from "./fixture/tmpdir"

const win = process.platform === "win32"

const writePackage = (dir: string, pkg: Record<string, unknown>) =>
  Bun.write(
    path.join(dir, "package.json"),
    JSON.stringify({
      version: "1.0.0",
      ...pkg,
    }),
  )

const npmLayer = (cache: string) =>
  AppNodeBuilder.build(Npm.node, [[Global.node, Global.layerWith({ cache, state: path.join(cache, "state") })]])

async function createGitFixture(directory: string) {
  const repository = path.join(directory, "repository")
  const subdirectory = path.join(repository, "packages", "subdirectory-plugin")
  await fs.mkdir(path.join(subdirectory, "dependency"), { recursive: true })
  await writePackage(subdirectory, {
    name: "fixture-subdirectory-plugin",
    exports: "./index.js",
    dependencies: { "fixture-subdirectory-dependency": "file:./dependency" },
  })
  await writePackage(path.join(subdirectory, "dependency"), {
    name: "fixture-subdirectory-dependency",
    exports: "./index.js",
  })
  await Bun.write(path.join(subdirectory, "index.js"), "export default { subdirectory: true }\n")
  await Bun.write(path.join(subdirectory, "dependency", "index.js"), "export const dependency = true\n")

  await Bun.$`git init -q -b fixture-branch ${repository}`
  await Bun.$`git -C ${repository} add .`
  await Bun.$`git -C ${repository} -c user.name=fixture -c user.email=fixture@example.com commit -qm fixture`
  const commit = await Bun.$`git -C ${repository} rev-parse HEAD`.text().then((value) => value.trim())
  return { repository, commit }
}

describe("Npm.sanitize", () => {
  test("keeps normal scoped package specs unchanged", () => {
    expect(Npm.sanitize("@opencode/acme")).toBe("@opencode/acme")
    expect(Npm.sanitize("@opencode/acme@1.0.0")).toBe("@opencode/acme@1.0.0")
    expect(Npm.sanitize("prettier")).toBe("prettier")
  })

  test("handles git https specs", () => {
    const spec = "acme@git+https://github.com/opencode/acme.git"
    const expected = win ? "acme@git+https_//github.com/opencode/acme.git" : spec
    expect(Npm.sanitize(spec)).toBe(expected)
  })
})

describe("Npm.add", () => {
  test("reifies when package cache directory exists without the package installed", async () => {
    await using tmp = await tmpdir()
    await fs.mkdir(path.join(tmp.path, "fixture-provider"))
    await writePackage(path.join(tmp.path, "fixture-provider"), {
      name: "fixture-provider",
      main: "index.js",
    })
    await Bun.write(path.join(tmp.path, "fixture-provider", "index.js"), "export const fixture = true\n")

    const spec = `fixture-provider@file:${path.join(tmp.path, "fixture-provider")}`
    await fs.mkdir(path.join(tmp.path, "cache", "packages", Npm.sanitize(spec)), { recursive: true })

    const entry = await Effect.gen(function* () {
      const npm = yield* Npm.Service
      return yield* npm.add(spec)
    }).pipe(Effect.scoped, Effect.provide(npmLayer(path.join(tmp.path, "cache"))), Effect.runPromise)

    expect(entry.entrypoint).toBeDefined()
  })

  test.each(["commit", "branch"])(
    "installs a Git package from an npm ::path: subdirectory at a %s",
    async (ref) => {
      await using tmp = await tmpdir()
      const fixture = await createGitFixture(tmp.path)
      const spec = `git+file://${fixture.repository}#${ref === "commit" ? fixture.commit : "fixture-branch"}::path:packages/subdirectory-plugin`
      const entry = await Effect.gen(function* () {
        const npm = yield* Npm.Service
        return yield* npm.add(spec)
      }).pipe(Effect.scoped, Effect.provide(npmLayer(path.join(tmp.path, "cache"))), Effect.runPromise)

      expect(entry.directory).toEndWith(path.join("node_modules", "fixture-subdirectory-plugin"))
      expect(await Bun.file(path.join(entry.directory, "index.js")).text()).toContain("subdirectory: true")
      expect(
        await fs.stat(path.join(path.dirname(entry.directory), "fixture-subdirectory-dependency", "package.json")),
      ).toBeTruthy()
    },
    // Real Git installs exceed Bun's default timeout on Windows.
    30_000,
  )

  test("resolves an importable file URL under Node", async () => {
    await using tmp = await tmpdir()
    const node = which("node")
    if (!node) throw new Error("Node is required for the Npm Node runtime test")

    const bundle = await Bun.build({
      entrypoints: [path.join(import.meta.dir, "../src/npm.ts")],
      target: "node",
      format: "esm",
    })
    expect(bundle.success).toBe(true)
    const entry = path.join(tmp.path, "npm.mjs")
    await Bun.write(entry, bundle.outputs[0])

    const dual = path.join(tmp.path, "dual-provider")
    await writePackage(dual, {
      name: "dual-provider",
      exports: { ".": { import: "./dist/index.mjs", require: "./dist/index.js" } },
    })
    await Bun.write(path.join(dual, "dist", "index.mjs"), "export const createDual = () => 'esm'\n")
    await Bun.write(path.join(dual, "dist", "index.js"), "exports.createDual = () => 'cjs'\n")

    const scoped = path.join(tmp.path, "scoped-provider")
    await writePackage(scoped, {
      name: "@fixture/scoped-provider",
      type: "module",
      exports: "./dist/index.js",
    })
    await Bun.write(path.join(scoped, "dist", "index.js"), "export const createScoped = () => 'scoped'\n")

    const proc = Bun.spawn(
      [
        node,
        "--input-type=module",
        "-e",
        `
        import assert from "node:assert/strict"
        import { Npm } from ${JSON.stringify(pathToFileURL(entry).href)}
        assert.equal(typeof Bun, "undefined")
        for (const [spec, name] of [
          [${JSON.stringify(`dual-provider@file:${dual}`)}, "createDual"],
          [${JSON.stringify(`@fixture/scoped-provider@file:${scoped}`)}, "createScoped"],
        ]) {
          const result = await Npm.add(spec)
          assert.ok(result.entrypoint?.startsWith("file://"), "entrypoint is a file URL: " + result.entrypoint)
          const mod = await import(result.entrypoint)
          assert.equal(typeof mod[name], "function", "module exports " + name)
        }
        process.exit(0)
      `,
      ],
      {
        env: { ...process.env, XDG_CACHE_HOME: path.join(tmp.path, "cache") },
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    expect(stderr, stdout).toBe("")
    expect(code).toBe(0)
  }, 30_000)
})

describe("Npm.install", () => {
  test("respects omit from project .npmrc", async () => {
    await using tmp = await tmpdir()

    await writePackage(tmp.path, {
      name: "fixture",
      dependencies: {
        "prod-pkg": "file:./prod-pkg",
      },
      devDependencies: {
        "dev-pkg": "file:./dev-pkg",
      },
    })
    await Bun.write(path.join(tmp.path, ".npmrc"), "omit=dev\n")
    await fs.mkdir(path.join(tmp.path, "prod-pkg"))
    await fs.mkdir(path.join(tmp.path, "dev-pkg"))
    await writePackage(path.join(tmp.path, "prod-pkg"), { name: "prod-pkg" })
    await writePackage(path.join(tmp.path, "dev-pkg"), { name: "dev-pkg" })

    await Npm.install(tmp.path)

    await expect(fs.stat(path.join(tmp.path, "node_modules", "prod-pkg"))).resolves.toBeDefined()
    await expect(fs.stat(path.join(tmp.path, "node_modules", "dev-pkg"))).rejects.toThrow()
  })

  test("installs without requesting registry audits", async () => {
    await using tmp = await tmpdir()
    const pkg = path.join(tmp.path, "tarball", "package")
    await fs.mkdir(pkg, { recursive: true })
    await writePackage(pkg, { name: "@fixture/registry-plugin", exports: "./index.js" })
    await Bun.write(path.join(pkg, "index.js"), "export const version = '1.0.0'\n")
    await Bun.$`tar -czf package.tgz package`.cwd(path.dirname(pkg))
    const tarball = await Bun.file(path.join(path.dirname(pkg), "package.tgz")).bytes()
    const state = { audits: 0 }
    await using server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        const url = new URL(request.url)
        if (url.pathname.startsWith("/-/npm/v1/security/")) {
          state.audits++
          return Response.json({})
        }
        if (decodeURIComponent(url.pathname) === "/@fixture/registry-plugin")
          return Response.json({
            name: "@fixture/registry-plugin",
            "dist-tags": { latest: "1.0.0" },
            versions: {
              "1.0.0": {
                name: "@fixture/registry-plugin",
                version: "1.0.0",
                dist: { tarball: `${url.origin}/1.0.0.tgz` },
              },
            },
          })
        if (url.pathname === "/1.0.0.tgz") return new Response(tarball)
        return new Response("missing", { status: 404 })
      },
    })
    const project = path.join(tmp.path, "project")
    await writePackage(project, { name: "fixture", dependencies: { "@fixture/registry-plugin": "1.0.0" } })
    await Bun.write(
      path.join(project, ".npmrc"),
      `registry=${server.url}\n@fixture:registry=${server.url}\ncache=${path.join(tmp.path, "npm-cache")}\nfetch-retries=0\naudit=true\n`,
    )

    // test/preload.ts disables audits through the environment, which outranks .npmrc.
    const audit = process.env.NPM_CONFIG_AUDIT
    delete process.env.NPM_CONFIG_AUDIT
    await Npm.install(project).finally(() => {
      process.env.NPM_CONFIG_AUDIT = audit
    })

    await expect(fs.stat(path.join(project, "node_modules", "@fixture", "registry-plugin"))).resolves.toBeDefined()
    expect(state.audits).toBe(0)
  })
})
