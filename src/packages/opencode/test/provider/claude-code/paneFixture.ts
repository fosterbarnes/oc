// Drives oc's real TUI, run from source, inside a WezTerm pane so a test can read what the screen
// shows. Opt-in (OC_TUI_PANE=1): needs wezterm on PATH and the `claude` CLI. `openPane` starts its
// own headless wezterm-mux-server with its own config and socket, so the user's WezTerm window is
// never touched. The pane gets the CLI fixture's isolated oc home, a file OPENCODE_DB, and Claude
// pointed at TestLLMServer, through the server's env and its config. Shared by tuiPane.test.ts and
// throwaway verify probes.
import { Database } from "bun:sqlite"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { hostEnv, isolatedEnv, type CliFixture } from "../../lib/cli-process"
import { pollWithTimeout } from "../../lib/effect"
import { chatConfig, claudeEnv, initRepo, outsideProfile } from "./chatFixture"
import { installQuotaFakeCli, quotaChatConfig, quotaReleasePath } from "./quotaFixture"

const cliPath = process.env.CLAUDE_CLI_PATH ?? Bun.which("claude")
const muxPath = Bun.which("wezterm-mux-server")
const opencodeRoot = path.resolve(import.meta.dir, "../../..")

export const paneReady = !!process.env.OC_TUI_PANE && !!cliPath && !!muxPath

// Starts the mux server with oc as its first pane, in a git-inited `work` folder under a root
// outside the profile (see `outsideProfile`). Scoped: closing the pane and the server comes
// before the root is removed.
export const openPane = Effect.fnUntraced(function* (
  fixture: CliFixture,
  options: { autoRename?: boolean; warmupAuth?: boolean; quotaUsage?: boolean; root?: string; steering?: boolean } = {},
) {
  const root = options.root ?? (yield* outsideProfile)
  const project = path.join(root, "work")
  yield* initRepo(project)
  let quotaCliPath: string | undefined
  if (options.quotaUsage) {
    const installed = yield* Effect.promise(() => installQuotaFakeCli(root))
    quotaCliPath = installed.cliPath
    yield* Effect.promise(async () => {
      const sidebar = path.join(fixture.home, ".config", "openSidebar", "config.json")
      await mkdir(path.dirname(sidebar), { recursive: true })
      await Bun.write(sidebar, JSON.stringify({ usageProviders: ["claude-code"] }))
    })
  }
  if (options.warmupAuth)
    yield* Effect.promise(async () => {
      const dir = path.join(root, "claude")
      await mkdir(dir, { recursive: true })
      // Offline subscription fixture: the CLI checks token shape and scopes
      // locally, so short dummy tokens read as signed out and the warm-up
      // palette stays empty. These format-valid fakes make `auth status
      // --json` truthfully report logged-in with no network and no PII, and
      // the pane test never sends a model request with them.
      await Bun.write(
        path.join(dir, ".credentials.json"),
        JSON.stringify({
          claudeAiOauth: {
            accessToken: `sk-ant-oat01-${"A".repeat(96)}`,
            refreshToken: `sk-ant-ort01-${"B".repeat(96)}`,
            expiresAt: Date.now() + 86_400_000,
            scopes: ["user:profile", "user:inference"],
            subscriptionType: "pro",
          },
        }),
      )
    })
  const socket = path.join(root, "wezterm.sock")
  const configFile = path.join(root, "wezterm.lua")
  const config = quotaCliPath
    ? {
        ...quotaChatConfig(fixture.llm.url, quotaCliPath),
        model: "claude-code/claude-sonnet-4-5",
      }
    : {
        ...chatConfig(fixture.llm.url),
        model: "claude-code/claude-sonnet-4-5",
        ...(options.steering && {
          provider: {
            ...chatConfig(fixture.llm.url).provider,
            "claude-code": { options: { proxyTools: ["Task", "Question"], proxyOpencodeTools: ["bash"] } },
          },
        }),
        ...(options.autoRename && { agent: { rename: { model: "test/test-model" } } }),
      }
  const db = path.join(fixture.home, "opencode.db")
  const paneEnv = {
    ...isolatedEnv(fixture.home, JSON.stringify(config)),
    ...claudeEnv(root, fixture.llm.url),
    // Sidebar reads os.homedir and desktop app-data paths, not only Global.Path.home.
    USERPROFILE: fixture.home,
    APPDATA: path.join(fixture.home, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(fixture.home, "AppData", "Local"),
    // The test preload's in-memory database is per process; the pane is a separate process.
    OPENCODE_DB: db,
    OC_AUTO_RENAME: options.autoRename ? "1" : "",
    // A host key would send subagent briefs to TypeSafe for a skill hint (tool/task.ts).
    TYPESAFE_API_KEY: "",
    ...(options.quotaUsage && { OC_TEST_USAGE_RELEASE: quotaReleasePath(root) }),
  }
  // On Windows WezTerm builds each pane's env from its own env overlaid with the registry's
  // (HKCU\Environment), so a user-level OPENCODE_DB there sent panes to the real database.
  // `set_environment_variables` is applied after that overlay. JSON strings are valid Lua strings.
  // `Hold` keeps the pane open after oc exits, so a startup crash stays readable by `waitFor`.
  yield* Effect.promise(() =>
    Bun.write(
      configFile,
      [
        "return {",
        `  unix_domains = { { name = "ocTest", socket_path = [[${socket}]] } },`,
        "  initial_cols = 160, initial_rows = 40, exit_behavior = 'Hold',",
        "  set_environment_variables = {",
        ...Object.entries(paneEnv).map(([key, value]) => `    [${JSON.stringify(key)}] = ${JSON.stringify(value)},`),
        "  },",
        "}",
        "",
      ].join("\n"),
    ),
  )
  // WEZTERM_PANE would aim `wezterm cli` at the user's pane. An oc session can also inherit a dead
  // GUI's socket; `--no-auto-start` stops `wezterm cli` from spawning a stray mux server then.
  const cliEnv = {
    ...Object.fromEntries(Object.entries(hostEnv()).filter(([key]) => key !== "WEZTERM_PANE")),
    WEZTERM_UNIX_SOCKET: socket,
  }
  const serverEnv: Record<string, string | undefined> = { ...cliEnv, ...paneEnv }
  if (options.warmupAuth) delete serverEnv.BUN_TEST
  const wez = (args: string[]) => Bun.$`wezterm cli --no-auto-start ${args}`.env(cliEnv).quiet().text()

  // `bun dev`'s shape: bun must start in packages/opencode to load its bunfig preload (Solid JSX).
  const command = ["bun", "run", "--cwd", opencodeRoot, "src/index.ts", project]
  // Never throws once the server is spawned, so the release below always runs.
  const server = yield* Effect.acquireRelease(
    Effect.promise(async () => {
      const proc = Bun.spawn([muxPath!, "--config-file", configFile, "--cwd", project, "--", ...command], {
        env: serverEnv,
        stdio: ["ignore", "ignore", "ignore"],
      })
      if (process.platform !== "win32") return { proc, created: "" }
      const created = await powershell(`${cimProcess(proc.pid)}.CreationDate.ToFileTimeUtc()`)
      return { proc, created: created.exitCode === 0 ? created.stdout.toString().trim() : "" }
    }),
    (server) =>
      Effect.promise(async () => {
        if (process.platform === "win32") {
          // Stops only processes this test started. Anchor: the mux server, identified by the CIM
          // creation time recorded at spawn (a reused PID has a different one). A descendant is a
          // process whose parent is in the tree and was created no earlier than that parent, so a
          // live parent rules out PID reuse. Each process is rechecked right before it is stopped.
          // CIM is compared to CIM only: Get-Process.StartTime has a different precision.
          // `taskkill /T` once followed reused PIDs into unrelated processes; never use it here.
          const result =
            server.created && server.proc.exitCode === null
              ? await powershell(
                  [
                    `$root = ${cimProcess(server.proc.pid)}`,
                    `if (-not $root -or $root.CreationDate.ToFileTimeUtc() -ne ${server.created}) { throw 'mux server identity changed' }`,
                    "$all = @(Get-CimInstance Win32_Process)",
                    "$tree = @($root)",
                    "for ($i = 0; $i -lt $tree.Count; $i++) {",
                    "  $parent = $tree[$i]",
                    "  $tree += @($all | Where-Object { $_.ParentProcessId -eq $parent.ProcessId -and $_.CreationDate -ge $parent.CreationDate })",
                    "}",
                    "$leaves = @($tree | Select-Object -Skip 1)",
                    "[array]::Reverse($leaves)",
                    "foreach ($item in $leaves) {",
                    `  $live = ${cimProcess("$item.ProcessId")}`,
                    "  if ($live -and $live.CreationDate -eq $item.CreationDate) {",
                    ...stopPaneChild(),
                    "  }",
                    "}",
                  ].join("\n"),
                )
              : undefined
          // Bun kills through its own process handle, which a reused PID cannot redirect.
          server.proc.kill()
          await server.proc.exited
          if (result?.exitCode === 0) return
          throw new Error(
            `Pane cleanup did not stop the mux server's descendants (bun, claude); they may still be running. ${result?.stderr.toString() ?? "Mux server identity unknown or it exited early."}`,
          )
        }
        await wez(["list", "--format", "json"])
          .then((list) => JSON.parse(list) as { pane_id: number }[])
          .then((panes) => Promise.all(panes.map((item) => wez(["kill-pane", "--pane-id", String(item.pane_id)]))))
          .catch(() => undefined)
        server.proc.kill()
        await server.proc.exited
      }),
  )
  const paneID = yield* pollWithTimeout(
    Effect.promise(() =>
      wez(["list", "--format", "json"]).then(
        (list) => (JSON.parse(list) as { pane_id: number }[])[0]?.pane_id,
        () => (server.proc.exitCode === null ? undefined : Promise.reject(new Error("mux server exited"))),
      ),
    ),
    "mux server never listed a pane",
    "30 seconds",
  )
  const screen = Effect.promise(() => wez(["get-text", "--pane-id", String(paneID)]))
  return {
    project,
    screen,
    releasePath: options.quotaUsage ? quotaReleasePath(root) : undefined,
    // Sessions the pane's oc stored in the fixture database.
    sessions: Effect.sync(() => {
      const database = new Database(db, { readonly: true })
      const count = database.query("select count(*) as count from session").get() as { count: number }
      database.close()
      return count.count
    }),
    type: (text: string) => Effect.promise(() => wez(["send-text", "--pane-id", String(paneID), "--no-paste", text])),
    paste: (text: string) => Effect.promise(() => wez(["send-text", "--pane-id", String(paneID), text])),
    click: (text: string) =>
      screen.pipe(
        Effect.flatMap((shown) => {
          const lines = shown.split(/\r?\n/)
          const row = lines.findIndex((line) => line.includes(text))
          if (row < 0) return Effect.fail(new Error(`Cannot click absent text: ${text}`))
          const column = lines[row].indexOf(text) + 2
          return Effect.promise(() =>
            wez([
              "send-text",
              "--pane-id",
              String(paneID),
              "--no-paste",
              `\x1b[<0;${column};${row + 1}M\x1b[<0;${column};${row + 1}m`,
            ]),
          )
        }),
      ),
    // Polls the visible screen; on timeout the error carries the last screen.
    waitFor: (text: string, matches: (shown: string) => boolean = () => true) =>
      pollWithTimeout(
        Effect.sleep("250 millis").pipe(
          Effect.andThen(screen),
          Effect.map((shown) => (shown.includes(text) && matches(shown) ? shown : undefined)),
        ),
        `"${text}" never appeared`,
        "60 seconds",
      ).pipe(
        Effect.catchCause((cause) =>
          screen.pipe(Effect.flatMap((shown) => Effect.fail(new Error(`${String(cause)}. Screen:\n${shown}`)))),
        ),
      ),
  }
})

// The child can exit between the CIM identity check and Stop-Process. Tolerate only absence;
// access failures and a reused PID still fail cleanup without another termination attempt.
export const stopPaneChild = () => [
  "try { Stop-Process -Id $item.ProcessId -Force } catch {",
  "  if ($_.FullyQualifiedErrorId -notlike 'NoProcessFoundForGivenId,*') { throw }",
  `  if (${cimProcess("$item.ProcessId")}) { throw }`,
  "}",
]

// Windows only. Callers check exitCode; any error fails the script.
export const powershell = (script: string) =>
  Bun.$`pwsh -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(`$ErrorActionPreference = 'Stop'\n${script}`, "utf16le").toString("base64")}`
    .nothrow()
    .quiet()

const cimProcess = (pid: number | string) => `(Get-CimInstance Win32_Process -Filter ('ProcessId=' + ${pid}))`
