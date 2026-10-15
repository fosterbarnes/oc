import fs from "fs/promises"
import os from "os"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { launchDetached } from "@opencode-ai/core/util/launchDetached"
import { TuiLedger } from "./tuiLedger"
import { Revive } from "./revive"
import { executablePath, read, write } from "./oc"
import {
  awaitLaunch,
  forceKill,
  isPidAlive,
  listOcProcesses,
  serverStateDirectory,
  shutdownAll,
  startServer,
  waitForExit,
  withResidentLock,
} from "./resident"
import { closeOwnedPanes, oldPanes } from "./wezterm"

/**
 * Revive pipeline (worker 1). Runs as a child of the `oc`/`occ` launcher so its output shows in the
 * window that hosted the TUI, or as a hidden detached helper when no launcher hosts the TUI.
 * Everything that can fail runs before shutdown or before handing off to the terminal restarter.
 */
export async function revive(context: Revive.ReviveContext) {
  const log = reviveLog()
  try {
    await revivePipeline(context)
  } catch (error) {
    await log.write(`Revive failed: ${error instanceof Error ? error.message : String(error)}`)
    // Hosted revives recover in place. A native window has already exited, even on build failure.
    if (context.native && (!context.tuiPid || !isPidAlive(context.tuiPid))) {
      await log.step("Reopening native after failure", () =>
        restartTerminal({
          terminal: reviveTerminal(context.terminal),
          launcher: "occ",
          executable: executablePath(),
          ...(/^bun(?:\.exe)?$/i.test(path.basename(process.execPath)) ? { entrypoint: process.argv[1] } : {}),
          native: true,
          directory: context.directory,
          sessionID: context.sessionID,
        }),
      )
    }
    throw error
  }
}

async function revivePipeline(context: Revive.ReviveContext) {
  const log = reviveLog()
  if (context.mode === "single") return reviveSingle(context)
  if (context.native && context.tuiPid) {
    const tuiPid = context.tuiPid
    await log.step("Waiting for native window shutdown", async () => {
      if (!(await waitForExit(tuiPid, 30_000))) throw new Error("Native window did not shut down; build cancelled")
      const stopped = await Bun.file(Revive.shutdownPath(tuiPid))
        .text()
        .catch(() => "")
      await fs.rm(Revive.shutdownPath(tuiPid), { force: true })
      await fs.rm(Revive.handoffPath(tuiPid), { force: true })
      if (stopped !== "stopped\n") throw new Error("Native window cleanup failed; build cancelled")
    })
  }
  // First /revive source choice; parseContext guarantees `sourceDir` for "existing" and "download".
  const sourceDir = context.sourceDir
  if (context.source === "download" && sourceDir)
    await log.step(`Downloading oc source to ${sourceDir}`, () => downloadSource(sourceDir))
  if (context.source === "existing" && sourceDir)
    await log.step(`Using oc source at ${sourceDir}`, () => saveReviveBuild({ source: sourceDir }))
  if (context.source === "none") await log.step("Saving revive without a source build", () => saveReviveBuild(false))
  const settings = await read()
  const bun = /^bun(?:\.exe)?$/i.test(path.basename(process.execPath))
  const build = context.mode === "install" ? Revive.parseBuild(settings.revive?.build) : undefined
  // An update installs a downloaded oc release through the same steps as a source build.
  const release = context.mode === "update" ? context.release : undefined
  const installs = !!build || !!release
  if (installs && bun) throw new Error("Install revive needs an installed oc executable, not Bun")
  const executable = Revive.resolveLauncher(executablePath())
  const installDir = path.dirname(executablePath())
  const restart: Revive.RestartContext = {
    terminal: reviveTerminal(context.terminal),
    launcher: Revive.parseLauncher(settings.revive?.launcher),
    executable,
    ...(bun ? { entrypoint: process.argv[1] } : {}),
    ...(context.paneID ? { paneID: context.paneID } : {}),
    ...(!context.native && context.shellPid
      ? { shellPid: context.shellPid, shellIdentity: context.shellIdentity }
      : {}),
    ...(context.supervisorPid ? { waitPid: context.supervisorPid } : {}),
    ...(installs ? { installDir } : {}),
    ...(context.native ? { native: true, directory: context.directory, sessionID: context.sessionID } : {}),
  }
  const steps = build ? Revive.buildSteps(build) : undefined
  // One install at a time per installation: the build output, file swap and server start are shared.
  const { tabs, failure } = await withInstallLock(installs ? installDir : undefined, async () => {
    for (const command of steps?.commands ?? []) await log.step(command.join(" "), () => runVisible(command, steps?.cwd))
    const output = release
      ? await log.step(`Downloading oc v${release}`, () =>
          Revive.downloadRelease(release),
        )
      : steps?.output
    const sources = output ? await log.step("Checking build output", () => Revive.installSources(output)) : undefined
    // Ctrl+C from here would leave oc stopped or half installed.
    const ignore = () => {}
    process.on("SIGINT", ignore)
    const tabs =
      context.paneID && restart.terminal === "wezterm" && !context.native
        ? await windowTabsSnapshot(context.paneID, context)
        : undefined
    const keepPanes = tabs?.flatMap((tab) => (tab.kind === "oc" && tab.paneID ? [tab.paneID] : []))
    const failure = await (async () => {
      // A native TUI/worker already shut down before handoff; installs rename running files aside.
      if (!context.native) await log.step("Stopping oc", () => shutdownAll({ keepPanes }))
      const rollback = sources
        ? await log.step(`Installing into ${installDir}`, () => Revive.install(sources, installDir))
        : undefined
      if (context.native) return
      // The install stays undoable until the new server is ready; a failed start restores the old files.
      await log.step("Starting server", () => startServer()).catch(async (error: unknown) => {
        if (!rollback) throw error
        // Restore even if the stop fails: rollback renames, which works on running files.
        await log.step("Stopping the new server", () => shutdownAll({ keepPanes })).catch(() => undefined)
        await log.step("Restoring the previous install", () => rollback(error))
        throw error
      })
    })().then(
      () => undefined,
      (error: unknown) => ({ error }),
    )
    process.off("SIGINT", ignore)
    if (failure && !context.supervisorPid && !context.native)
      await log.step("Starting server again", () => startServer())
    return { tabs, failure }
  })
  // A hosting launcher shows the error and reattaches. A hidden helper has no window left, so it
  // still reopens the terminal on the old version before reporting.
  if (failure && (context.supervisorPid || context.native)) throw failure.error
  await log.step(`Handing off to the terminal restarter (log: ${log.file})`, () =>
    awaitLaunch(
      launchDetached(process.execPath, [
        ...(bun ? [process.argv[1]] : []),
        "oc",
        "--revive-terminal",
        Revive.encode({ ...restart, tabs }),
      ]),
    ),
  )
  if (failure) throw failure.error
}

// /revive-single: the TUI's hidden helper opens a new tab running this pipeline again (`hosted`), which
// builds and installs only native opencode, then becomes that opencode. The server and every other
// window keep running; a failed build leaves the installed opencode as it was.
async function reviveSingle(context: Revive.ReviveContext) {
  const log = reviveLog()
  if (/^bun(?:\.exe)?$/i.test(path.basename(process.execPath)))
    throw new Error("Revive single needs an installed oc executable, not Bun")
  if (!context.hosted) {
    const command = Revive.openTabCommand(
      [process.execPath, "oc", "--revive", Revive.encode({ ...context, hosted: true })],
      { terminal: reviveTerminal(context.terminal), directory: context.directory },
    )
    await log.step(`Opening a ${command.file} tab for the single build`, () =>
      openReviveTab(command, context.directory),
    )
    return
  }
  const installDir = path.dirname(executablePath())
  const native = await (async () => {
    const build = Revive.parseBuild((await read()).revive?.build)
    if (!build) throw new Error("No oc source saved in revive.build; run /revive once first")
    const steps = Revive.buildSteps(build, "native")
    await withInstallLock(installDir, async () => {
      for (const command of steps.commands) await log.step(command.join(" "), () => runVisible(command, steps.cwd))
      const sources = await log.step("Checking build output", () => Revive.installSources(steps.output))
      await log.step(`Installing into ${installDir}`, () => Revive.install(sources, installDir))
    })
    return Revive.nativeExecutable(executablePath())
  })().catch(async (error: unknown) => {
    await log.write(`Revive single failed: ${error instanceof Error ? error.message : String(error)}`)
    console.log("Press Enter to close")
    for await (const _ of console) break
    process.exit(1)
  })
  const args = [native, context.directory, ...(context.sessionID ? ["--session", context.sessionID] : [])]
  process.exit(await Bun.spawn(args, { stdio: ["inherit", "inherit", "inherit"] }).exited)
}

// Terminal CLIs report whether they opened the tab. Only cmd's new-console path needs a detached hop.
export async function openReviveTab(command: ReturnType<typeof Revive.openTabCommand>, directory: string) {
  if (command.file === "cmd.exe")
    return awaitLaunch(launchDetached(command.file, command.args, {
      cwd: directory,
      env: command.env,
      windowStyle: "Normal",
      windowsVerbatimArguments: command.windowsVerbatimArguments,
      settleMs: REPLACEMENT_SETTLE_MS,
    }))
  await runVisible([command.file, ...command.args], directory, command.env)
}

async function windowTabsSnapshot(paneID: string, self: Pick<Revive.ReviveContext, "directory" | "sessionID">) {
  try {
    const list = Bun.spawnSync(["wezterm", "cli", "list", "--format", "json"], { stdout: "pipe", stderr: "pipe" })
    if (list.exitCode !== 0) throw new Error(`wezterm cli list failed: ${list.stderr.toString().trim()}`)
    const processes = listOcProcesses()
    const records = processes === null ? [] : await TuiLedger.read(serverStateDirectory(), processes)
    const pids =
      processes === null ? [] : TuiLedger.select(records, processes, Global.Path.app, executablePath(), process.pid)
    // A hosted revive's TUI has already exited, so its ledger record is gone; its pane comes from the context.
    const owned = records.filter((record) => pids.includes(record.pid))
    return Revive.windowTabs(
      list.stdout.toString(),
      [{ paneID, directory: self.directory, sessionID: self.sessionID }, ...owned],
      paneID,
    )
  } catch (error) {
    await reviveLog().write(`Window tabs not restored: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function reviveTerminal(terminal: Revive.ReviveContext["terminal"]) {
  // Reuse the plain-console fallback for failed builds too.
  const cli = { wezterm: "wezterm-gui", "windows-terminal": "wt.exe", generic: undefined }[terminal]
  return cli && !Bun.which(cli) ? "generic" : terminal
}

// First /revive only: clone into `directory` (or update an earlier clone there once) and point
// `revive.build` at it. Later revives build the folder as the user left it.
async function downloadSource(directory: string) {
  const cloned = await fs.stat(path.join(directory, ".git")).then(
    () => true,
    () => false,
  )
  await runVisible(
    cloned ? ["git", "-C", directory, "pull", "--ff-only"] : ["git", "clone", Revive.SOURCE_REPO, directory],
  )
  await saveReviveBuild({ source: directory })
}

async function saveReviveBuild(build: false | Revive.BuildConfig) {
  const settings = await read()
  await write({ ...settings, revive: { ...settings.revive, build } })
}

// Output streams into the revive window (or the hidden helper's console).
async function runVisible(command: string[], cwd?: string, env?: NodeJS.ProcessEnv) {
  const code = await Bun.spawn(command, {
    cwd,
    ...(env ? { env: { ...process.env, ...env } } : {}),
    stdio: ["inherit", "inherit", "inherit"],
  }).exited
  if (code !== 0) throw new Error(`${command[0]} exited with code ${code}`)
}

/** Terminal restarter (worker 2). Detached, so it outlives the window it closes. Output goes to revive.log. */
export async function restartTerminal(
  restart: Revive.RestartContext,
  launch: (command: ReturnType<typeof Revive.reopenCommand>) => Promise<void> = (command) =>
    awaitLaunch(
      launchDetached(command.file, command.args, {
        cwd: os.homedir(),
        env: command.env,
        windowStyle: "Normal",
        windowsVerbatimArguments: command.windowsVerbatimArguments,
        settleMs: REPLACEMENT_SETTLE_MS,
      }),
    ),
) {
  const log = reviveLog()
  if (restart.waitPid && !(await waitForExit(restart.waitPid, 10_000)))
    await log.write(`Launcher ${restart.waitPid} still running after 10s; opening replacement anyway`)
  // The new terminal opens first; the old window closes only once its process started and survived
  // the settle window, so a failed launch leaves the old window in place. WezTerm closes only this
  // instance's panes; other terminals close the verified launching shell. A failed close leaves two windows.
  const wezterm = restart.terminal === "wezterm" && !!restart.paneID
  // Pane ids are per mux and a fresh WezTerm process reuses low ids, so the old panes are recorded with
  // their window before the launch and closed only if the same pane is still in that same window.
  // No socket or a failed list: leave the old panes open rather than guess.
  const old =
    !restart.native && wezterm
      ? await log.step("Recording the old panes", () => oldPanes(restart)).catch(() => undefined)
      : undefined
  const command = Revive.reopenCommand(restart)
  await log.step(`Opening ${restart.terminal} with ${restart.launcher}`, () => launch(command))
  if (old)
    await log.step("Closing this instance's old panes", () => closeOwnedPanes(old)).catch(() => undefined)
  if (!restart.native && !wezterm)
    await log.step("Closing the old window", () => closeWindow(restart)).catch(() => undefined)
  if (!restart.installDir) return
  // A newer revive may hold its own `.old-*` files for rollback; leave them to its restarter.
  const installDir = restart.installDir
  const kept = await withInstallLock(installDir, () => Revive.removeLeftovers(installDir)).catch(
    async (error: unknown) => {
      await log.write(`Skipped leftover cleanup: ${error instanceof Error ? error.message : String(error)}`)
      return []
    },
  )
  if (kept.length) await log.write(`Kept in-use leftovers: ${kept.join(", ")}`)
}

// Acknowledgement is "the terminal process started and did not fail within this window", not a usable TUI.
const REPLACEMENT_SETTLE_MS = 1500

// Held from build through server readiness; a second revive fails fast instead of waiting minutes.
function withInstallLock<T>(installDir: string | undefined, action: () => Promise<T>) {
  if (!installDir) return action()
  return withResidentLock(action, {
    lock: path.join(installDir, ".revive.lock"),
    attempts: 20,
    busy: "Another revive is already installing oc; try again when it finishes",
  })
}

async function closeWindow(restart: Revive.RestartContext) {
  // The console or Windows Terminal tab closes once its shell and launcher are gone.
  if (restart.shellPid) {
    if (
      !restart.shellIdentity ||
      restart.shellIdentity.pid !== restart.shellPid ||
      !Revive.isShell(path.win32.basename(restart.shellIdentity.executable))
    )
      throw new Error(`Shell identity unavailable: ${restart.shellPid}`)
    await forceKill([restart.shellIdentity])
  }
}

function reviveLog() {
  const file = path.join(Global.Path.log, "revive.log")
  const write = async (line: string) => {
    console.log(`revive: ${line}`)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.appendFile(file, `${new Date().toISOString()} [${process.pid}] ${line}\n`)
  }
  const step = async <T>(label: string, action: () => T | Promise<T>) => {
    const start = Date.now()
    await write(`${label}...`)
    const result = await Promise.resolve()
      .then(action)
      .then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      )
    if ("error" in result) {
      await write(`${label}: failed: ${result.error instanceof Error ? result.error.message : String(result.error)}`)
      throw result.error
    }
    await write(`${label}: done (${((Date.now() - start) / 1000).toFixed(1)}s)`)
    return result.value
  }
  return { file, write, step }
}

export * as ReviveHost from "./reviveHost"
