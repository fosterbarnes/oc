import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import path from "path"
import { useTuiPaths } from "../../context/runtime"
import { errorMessage } from "../../util/error"
import { useDialog } from "../../ui/dialog"
import { useSDK } from "../../context/sdk"
import { useSync } from "../../context/sync"
import { useToast } from "../../ui/toast"
import { DialogMoveSession, type MoveSessionSelection } from "../dialog-move-session"
import { DialogWorkspaceFileChanges } from "../dialog-workspace-file-changes"
import { useHomeSessionDestination } from "../../routes/home/session-destination"
import { useProject } from "../../context/project"

function moveReminderText(directory: string) {
  return `<system-reminder>The user has changed the current working directory to "${directory}". This is still the same project but at a possibly new location; take this into account when working with any files from now on.</system-reminder>`
}

export function usePromptMove(input: { projectID: () => string | undefined; sessionID: () => string | undefined }) {
  const dialog = useDialog()
  const sdk = useSDK()
  const sync = useSync()
  const toast = useToast()
  const homeDestination = useHomeSessionDestination()
  const project = useProject()
  const paths = useTuiPaths()
  const [creating, setCreating] = createSignal(false)
  const [creatingDots, setCreatingDots] = createSignal(3)
  const [progress, setProgress] = createSignal<string>()

  // `workFrom` (/work) places the copy next to that checkout as `<repo>.work-<name>`.
  async function create(context?: string, workFrom?: string) {
    const projectID = input.projectID()
    if (!projectID) return
    setCreating(true)
    setProgress("Creating copy")
    try {
      const generated = await sdk.client.experimental.projectCopy.generateName(
        { projectID, context },
        { throwOnError: true },
      )
      const result = await sdk.client.v2.projectCopy.create(
        {
          projectID,
          location: { directory: sdk.directory },
          strategy: "git_worktree",
          directory: workFrom ? path.dirname(workFrom) : path.join(paths.worktree, projectID.slice(0, 6)),
          name: workFrom ? `${path.basename(workFrom)}.work-${generated.data.name}` : generated.data.name,
        },
        { throwOnError: true },
      )
      const directory = result.data?.directory
      if (!directory) throw new Error("No project copy directory returned")

      // Call a location-based route to make sure it's bootstrapped
      // before moving on
      await sdk.client.path.get({ directory }, { throwOnError: true })

      setProgress("Creating session")
      return directory
    } catch (err) {
      homeDestination?.clear()
      setProgress(undefined)
      setCreating(false)
      toast.show({ title: "Creating workspace failed", message: errorMessage(err), variant: "error" })
      return
    }
  }

  function open() {
    const projectID = input.projectID()
    if (!projectID) return
    const sessionID = input.sessionID()
    const session = sessionID ? sync.session.get(sessionID) : undefined
    dialog.replace(() => (
      <DialogMoveSession
        projectID={projectID}
        current={
          homeDestination?.destination() ??
          (session
            ? {
                type: "directory",
                directory: session.directory,
                subdirectory: !!session.path,
              }
            : {
                type: "directory",
                directory: project.instance.directory(),
                subdirectory: project.instance.directory() !== project.instance.path().worktree,
              })
        }
        onCurrentChange={(selection) => homeDestination?.setDestination(selection)}
        onSelect={(selection) => {
          const sessionID = input.sessionID()
          if (!sessionID) {
            homeDestination?.setDestination(selection)
            dialog.clear()
            return
          }
          void moveExistingSession(sessionID, selection)
        }}
      />
    ))
  }

  function sessionContext(sessionID: string) {
    const session = sync.session.get(sessionID)
    const messages = (sync.data.message[sessionID] ?? [])
      .slice(-6)
      .map((message) =>
        [
          message.role + ":",
          ...(sync.data.part[message.id] ?? []).flatMap((part) => (part.type === "text" ? [part.text] : [])),
        ].join(" "),
      )
    return [session?.title, ...messages].filter(Boolean).join("\n") || undefined
  }

  async function moveTo(sessionID: string, directory: string, moveChanges: boolean) {
    await sdk.client.experimental.controlPlane.moveSession(
      {
        sessionID,
        destination: { directory },
        moveChanges,
      },
      { throwOnError: true },
    )
    await sdk.client.session
      .promptAsync({
        sessionID,
        directory,
        noReply: true,
        parts: [
          {
            type: "text",
            text: moveReminderText(directory),
            synthetic: true,
          },
        ],
      })
      .catch(() => undefined)
  }

  async function moveExistingSession(sessionID: string, selection: MoveSessionSelection, workFrom?: string) {
    const session = sync.session.get(sessionID)
    const status = await sdk.client.vcs.status({ directory: session?.directory }).catch(() => undefined)
    const choice = status?.data?.length ? await DialogWorkspaceFileChanges.show(dialog, status.data) : "no"
    if (!choice) return
    dialog.clear()
    const directory =
      selection.type === "new" ? await create(sessionContext(sessionID), workFrom) : selection.directory
    if (!directory) {
      setProgress(undefined)
      dialog.clear()
      return
    }
    setProgress("Moving session")
    try {
      await moveTo(sessionID, directory, choice === "yes")
      dialog.clear()
    } catch (error) {
      toast.error(error)
      dialog.clear()
    } finally {
      setProgress(undefined)
      setCreating(false)
    }
  }

  function work() {
    const sessionID = input.sessionID()
    const directory = sessionID ? sync.session.get(sessionID)?.directory : undefined
    if (!sessionID || !directory) return
    void moveExistingSession(sessionID, { type: "new" }, directory)
  }

  // Squash the copy into its main checkout (left staged, uncommitted), move back, then delete the copy.
  // On failure the session stays in the copy so the work can be fixed there.
  async function done() {
    const projectID = input.projectID()
    const sessionID = input.sessionID()
    const copy = sessionID ? sync.session.get(sessionID)?.directory : undefined
    if (!projectID || !sessionID || !copy) return
    setProgress("Merging work")
    try {
      const merged = await sdk.client.v2.projectCopy.merge(
        { projectID, location: { directory: sdk.directory }, directory: copy },
        { throwOnError: true },
      )
      await moveTo(sessionID, merged.data.directory, false)
      await sdk.client.v2.projectCopy.remove(
        { projectID, location: { directory: sdk.directory }, directory: copy, force: true },
        { throwOnError: true },
      )
      toast.show({ message: `Work merged and staged in ${merged.data.directory}`, variant: "success" })
    } catch (error) {
      toast.error(error)
    } finally {
      setProgress(undefined)
    }
  }

  const pending = createMemo(() => Boolean(homeDestination?.destination()))
  const pendingNew = createMemo(() => homeDestination?.destination()?.type === "new")

  async function getDirectory(context?: string) {
    const value = homeDestination?.destination()
    if (!value) return
    if (value.type === "directory") {
      return value.directory
    }
    return await create(context)
  }

  function startSubmit() {
    if (progress()) setProgress("Submitting prompt")
  }

  function finishSubmit() {
    homeDestination?.clear()
    setProgress(undefined)
    setCreating(false)
  }

  createEffect(() => {
    if (!creating()) {
      setCreatingDots(3)
      return
    }
    const timer = setInterval(() => setCreatingDots((dots) => (dots % 3) + 1), 1000)
    onCleanup(() => clearInterval(timer))
  })

  return {
    creating,
    creatingDots,
    done,
    finishSubmit,
    getDirectory,
    open,
    pending,
    pendingNew,
    progress,
    startSubmit,
    work,
  }
}
