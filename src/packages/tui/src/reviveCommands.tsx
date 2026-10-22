import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { InstallationDisplayVersion, InstallationLocal } from "@opencode-ai/core/installation/version"
import { launchDetached } from "@opencode-ai/core/util/launchDetached"
import { OcRelease } from "@opencode-ai/core/util/ocRelease"
import { ReviveResume } from "@opencode-ai/core/util/reviveResume"
import { detectTerminal } from "@opencode-ai/core/util/terminal"
import { useExit } from "./context/exit"
import { useKV } from "./context/kv"
import { useLocal } from "./context/local"
import { useRoute } from "./context/route"
import { useSDK } from "./context/sdk"
import { useSync } from "./context/sync"
import { readOcConfig } from "./ocSettings"
import { useDialog } from "./ui/dialog"
import { DialogConfirm } from "./ui/dialog-confirm"
import { DialogPrompt } from "./ui/dialog-prompt"
import { DialogSelect } from "./ui/dialog-select"
import type { ToastContext } from "./ui/toast"
import { reviveText, reviveVersions } from "./util/revive"

// Built-in revive restarts oc and its terminal (ReviveHost.revive); `revive.path` still overrides /revive-no-install.
export function reviveCommands(toast: ToastContext) {
  const route = useRoute()
  const dialog = useDialog()
  const kv = useKV()
  const revive = useRevive(toast)
  const sessionID = () => (route.data.type === "session" ? route.data.sessionID : undefined)
  return [
    {
      name: "oc.revive_no_install",
      title: "Revive oc without installing",
      category: "System",
      slashName: "revive-no-install",
      run: () => revive.start("no-install", sessionID()),
    },
    {
      name: "oc.revive",
      title: "Revive oc",
      category: "System",
      slashName: "revive",
      run: () => revive.start("install", sessionID()),
    },
    {
      name: "oc.revive_single",
      title: "Build native opencode and open it in a new tab",
      category: "System",
      slashName: "revive-single",
      run: () => revive.start("single", sessionID()),
    },
    {
      name: "oc.update",
      title: "Check for oc updates",
      category: "System",
      slashName: "update",
      run: async () => {
        if (InstallationLocal) {
          toast.show({ message: "Running from source: update with git and /revive", variant: "info" })
          return
        }
        const release = await OcRelease.lookup().catch((error: unknown) => {
          toast.error(error instanceof Error ? error : new Error(String(error)))
        })
        if (!release) return
        if (!OcRelease.isNewer(release.version, InstallationDisplayVersion)) {
          toast.show({ message: `oc v${InstallationDisplayVersion} is the latest release`, variant: "info" })
          return
        }
        const choice = await new Promise<"update" | "skip" | undefined>((resolve) =>
          dialog.replace(
            () => (
              <DialogSelect
                title={`oc v${release.version} is available (installed: v${InstallationDisplayVersion})`}
                renderFilter={false}
                options={[
                  { value: "update" as const, title: "Update and restart", description: "stops oc, installs, reopens" },
                  { value: "skip" as const, title: "Skip this version", description: "no startup notice for it" },
                ]}
                onSelect={(option) => resolve(option.value)}
              />
            ),
            () => resolve(undefined),
          ),
        )
        dialog.clear()
        if (choice === "skip") kv.set(SKIPPED_VERSION, release.version)
        if (choice === "update")
          return revive.revive("update", { sessionID: sessionID(), source: { release: release.version } })
      },
    },
  ]
}

// Context shape: Revive.ReviveContext in packages/opencode/src/config/revive.ts.
type Source = { source: "existing" | "download"; sourceDir: string } | { source: "none" }

// Shared by the revive slash commands and revive chains (`reviveChain.tsx`). Chains pass the session
// explicitly (the route may still be Home) and the ReviveResume id of the steps typed after the revive.
export function useRevive(toast: ToastContext) {
  const sync = useSync()
  const sdk = useSDK()
  const local = useLocal()
  const exit = useExit()
  const dialog = useDialog()
  // Saved before launch, while this server still runs. A no-reply message costs no tokens until
  // the next prompt; synthetic text then reaches the model, and the session view draws a divider.
  // Carries the current agent/model because the reopened prompt seeds them from the last user message.
  // `next`: chain steps that run after the revive, shown on the divider.
  const mark = async (sessionID: string | undefined, next: string[] = []) => {
    if (!sessionID) return
    const at = Date.now()
    const versions = reviveVersions()
    const result = await sdk.client.session.prompt({
      sessionID,
      directory: sync.session.get(sessionID)?.directory,
      agent: local.agent.current()?.name,
      model: local.model.current(),
      variant: local.model.variant.current(),
      noReply: true,
      parts: [
        {
          type: "text",
          text: reviveText(at, versions),
          synthetic: true,
          metadata: { kind: "revive", versions, at, ...(next.length && { next }) },
        },
      ],
    })
    if (result.error) toast.error(new Error(`Failed to mark revive: ${JSON.stringify(result.error)}`))
  }
  // First /revive: where oc's source comes from. Building and installing need git (download) and Bun.
  const chooseSource = async (): Promise<Source | undefined> => {
    const kind = await new Promise<Source["source"] | undefined>((resolve) =>
      dialog.replace(
        () => (
          <DialogSelect
            title="Run oc from its source code?"
            renderFilter={false}
            options={[
              { value: "existing" as const, title: "Use my oc source folder", description: "build from it" },
              { value: "download" as const, title: "Download the oc source to...", description: "your copy to edit" },
              { value: "none" as const, title: "Just restart", description: "no build" },
            ]}
            onSelect={(option) => resolve(option.value)}
          />
        ),
        () => resolve(undefined),
      ),
    )
    if (kind === undefined) return
    if (kind === "none") return { source: "none" }
    const input = await DialogPrompt.show(
      dialog,
      kind === "existing" ? "oc source folder" : "Download the oc source to",
      {
        placeholder: "C:\\path\\to\\oc",
        value: kind === "download" ? path.join(Global.Path.data, "source") : "",
      },
    )
    if (!input?.trim()) return
    const sourceDir = path.resolve(input.trim().replace(/^"(.*)"$/, "$1"))
    // Revive.WORKSPACE + Revive.BUILD_SCRIPT: the build script /revive runs.
    if (
      kind === "existing" &&
      !fs.existsSync(path.join(sourceDir, "src", "packages", "opencode", "script", "build.ts"))
    ) {
      toast.show({
        message: `Not an oc source folder (no src\\packages\\opencode\\script\\build.ts): ${sourceDir}`,
        variant: "error",
      })
      return
    }
    return { source: kind, sourceDir }
  }
  const baseContext = (mode: string, sessionID: string | undefined, resume: string | undefined) => {
    const terminal = detectTerminal()
    return {
      mode,
      terminal: terminal.kind,
      directory: (sessionID ? sync.session.get(sessionID)?.directory : undefined) ?? sdk.directory ?? process.cwd(),
      ...(sessionID ? { sessionID } : {}),
      ...(terminal.kind === "wezterm" && terminal.paneID ? { paneID: terminal.paneID } : {}),
      ...(resume ? { resume } : {}),
    }
  }
  const revive = async (
    mode: "install" | "no-install" | "update",
    options: { sessionID?: string; source?: Source | { release: string }; resume?: string; next?: string[] } = {},
  ) => {
    await mark(options.sessionID, options.next)
    const context = {
      ...baseContext(mode, options.sessionID, options.resume),
      ...(Global.native ? { native: true, tuiPid: process.pid } : {}),
      ...options.source,
    }
    // Hosted by an `oc`/`occ` launcher: hand off and exit, so it shows revive progress in this window
    // (Revive.handoffPath). Otherwise a hidden helper runs the same pipeline.
    // A native window is never hosted, even if it inherited a launcher's variable from its shell.
    const supervisor = Global.native ? undefined : process.env.OC_SUPERVISOR_PID
    if (supervisor) {
      const file = path.join(Global.Path.state, "oc-revive", `${supervisor}.json`)
      return fs.promises
        .mkdir(path.dirname(file), { recursive: true })
        .then(() => fs.promises.writeFile(file, JSON.stringify(context)))
        .then(
          () => exit(),
          (error) => toast.error(error),
        )
    }
    if (Global.native) {
      const file = path.join(Global.Path.state, "oc-revive", `${process.pid}.json`)
      await fs.promises.mkdir(path.dirname(file), { recursive: true })
      await fs.promises.rm(path.join(path.dirname(file), `${process.pid}.stopped`), { force: true })
      await fs.promises.writeFile(file, JSON.stringify(context))
    }
    launchHelper(context).once("exit", (code) => {
      if (code) toast.error(new Error(`Revive helper launch failed: exit code ${code}`))
      if (!code && Global.native) exit()
    })
  }
  // The revive pipeline lives in oc: a native window hands off to the oc executable beside it.
  // A helper that fails settles its chain failed, so this still-running TUI puts the steps back.
  const launchHelper = (context: { resume?: string }, wait = false) => {
    const bun = /^bun(?:\.exe)?$/i.test(path.basename(process.execPath))
    const helper =
      Global.native && !bun
        ? path.join(path.dirname(process.execPath), `oc${path.extname(process.execPath)}`)
        : process.execPath
    const args = [
      ...(bun ? [process.argv[1]] : []),
      "oc",
      "--revive",
      Buffer.from(JSON.stringify(context)).toString("base64url"),
    ]
    const failed = () => {
      if (context.resume) void ReviveResume.settle(context.resume, "failed")
    }
    const child = wait
      ? spawn(helper, args, {
          windowsHide: true,
          stdio: ["ignore", "ignore", "pipe"],
          env: { ...process.env, OC_FLAVOR: "oc" },
        })
      : launchDetached(helper, args, { env: { OC_FLAVOR: "oc" } })
    if (wait) {
      let error = ""
      child.stderr?.on("data", (chunk) => {
        error = (error + chunk.toString()).slice(-4000)
      })
      child.once("exit", (code) => {
        if (code) toast.error(new Error(error.trim() || `Revive helper launch failed: exit code ${code}`))
      })
    }
    child.once("exit", (code) => {
      if (code) failed()
    })
    return child.once("error", (error) => {
      failed()
      toast.error(error)
    })
  }
  // False when nothing started (dialog cancelled, no saved source), so a chain can stop there.
  const start = async (mode: ReviveResume.Mode, sessionID: string | undefined, resume?: string, next?: string[]) => {
    // Read fresh: the first /revive saves the source choice to oc.json (revive.build).
    const config = readOcConfig()
    if (mode === "no-install") {
      if (!config.revivePath) return revive("no-install", { sessionID, resume, next }).then(() => true)
      await mark(sessionID, next)
      // A custom script reports nothing back: the reopened TUI sends the follow-up steps either way.
      if (resume) await ReviveResume.settle(resume, "ready")
      launchDetached(config.revivePath)
      return true
    }
    if (mode === "install") {
      if (config.reviveSourceChosen) return revive("install", { sessionID, resume, next }).then(() => true)
      const source = await chooseSource()
      if (!source) return false
      dialog.clear()
      return revive("install", { sessionID, resume, source, next }).then(() => true)
    }
    if (!config.reviveBuild) {
      toast.show({ message: "No oc source saved; run /revive once to choose one", variant: "error" })
      return false
    }
    const terminal = detectTerminal()
    // WezTerm closes this pane once the new tab runs. A native pane runs its reply in-process,
    // so closing it mid-reply stops that reply.
    if (
      Global.native &&
      terminal.kind === "wezterm" &&
      terminal.paneID &&
      sessionID &&
      (sync.data.session_status[sessionID]?.type ?? "idle") !== "idle"
    ) {
      const confirmed = await DialogConfirm.show(
        dialog,
        "A reply is still running here",
        "This tab closes when the new one opens, which stops the reply.",
      )
      if (!confirmed) return false
    }
    // The helper opens the new tab; the server and other tabs keep running.
    launchHelper(baseContext("single", sessionID, resume), true)
    return true
  }
  return { start, revive }
}

// Release version the user chose to skip; the startup notice stays quiet until a newer one ships.
export const SKIPPED_VERSION = "skipped_version"

// One check per TUI start. Installing always goes through /update, never automatically.
export async function updateNotice(toast: ToastContext, skipped: string | undefined) {
  if (InstallationLocal) return
  const release = await OcRelease.lookup().catch(() => undefined)
  if (!release || !OcRelease.isNewer(release.version, InstallationDisplayVersion)) return
  if (skipped && !OcRelease.isNewer(release.version, skipped)) return
  toast.show({
    title: "Update available",
    message: `oc v${release.version} is available. Run /update to install it.`,
    variant: "info",
    duration: 10000,
  })
}
