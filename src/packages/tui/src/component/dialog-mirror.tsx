// Palette Mirror: make another tailnet machine's oc source equal to this machine's, then optionally
// revive oc there. Probes and pushes run here over ssh (core `util/ocMirror.ts`); the other machine
// runs the hidden `oc oc mirror` commands. Settings: oc.json `mirror` (`dirty`, `revive`, `hosts`).
import { createMemo, createResource, createSignal, Show } from "solid-js"
import { TextAttributes } from "@opentui/core"
import type { JSX } from "@opentui/solid"
import { OcMirror } from "@opencode-ai/core/util/ocMirror"
import { Spinner } from "./spinner"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { DialogConfirm } from "../ui/dialog-confirm"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { useTheme } from "../context/theme"
import { Locale } from "../util/locale"
import { errorMessage } from "../util/error"
import { persistOcPath } from "../ocSettings"

type Scan = { local: OcMirror.Info; probes: OcMirror.Probe[] }

export function DialogMirror() {
  const dialog = useDialog()
  const toast = useToast()
  const { theme } = useTheme()
  const [settings, setSettings] = createSignal(OcMirror.settings())
  const [scan, { refetch }] = createResource(async (): Promise<Scan> => {
    const local = await OcMirror.info()
    const targets = await OcMirror.targets(settings())
    return { local, probes: await Promise.all(targets.map((target) => OcMirror.probe(target, local))) }
  })

  const cycle = <T extends string>(values: readonly T[], current: T) =>
    values[(values.indexOf(current) + 1) % values.length]!
  const save = (key: "dirty" | "revive", value: string) => {
    setSettings({ ...settings(), [key]: value })
    persistOcPath(["mirror", key], value).catch((error) =>
      toast.show({ variant: "error", message: `Mirror setting not saved: ${errorMessage(error)}` }),
    )
  }

  async function mirror(probe: OcMirror.Probe, local: OcMirror.Info) {
    const remote = probe.info
    if (!remote) return
    const reopen = () => dialog.replace(() => <DialogMirror />)
    if (probe.inSync) {
      toast.show({ variant: "info", message: `${probe.host} already matches this machine` })
      return
    }
    if (remote.branch !== local.branch) {
      toast.show({ variant: "error", message: `${probe.host} is on ${remote.branch}, this machine on ${local.branch}` })
      return
    }
    const extra = probe.extra ?? 0
    if (extra !== 0) {
      const what = extra < 0 ? "commits this machine does not have" : `${extra} commit(s) this machine does not have`
      const message = `${probe.host} has ${what}. Mirroring drops them from ${remote.branch} there (git reflog keeps them).`
      if (!(await DialogConfirm.show(dialog, "Drop commits", message, "Continue"))) return reopen()
    }
    const lost = probe.lost ?? []
    const dirty = lost.length > 0 ? await dirtyMode(probe.host, lost) : "refuse"
    if (!dirty) return reopen()
    if (lost.length > 0 && dirty === "refuse") {
      toast.show({ variant: "error", message: `${probe.host} has changes of its own; mirror skipped` })
      return reopen()
    }
    if (lost.length === 0) {
      const message = `Make ${probe.host}'s oc source (${remote.source}) equal to this machine's.`
      if (!(await DialogConfirm.show(dialog, "Mirror", message, "Mirror"))) return reopen()
    }
    reopen()
    toast.show({ variant: "info", message: `Mirroring to ${probe.host}...`, duration: 10 * 60_000 })
    const received = await OcMirror.push(probe, remote, { dirty, allowExtra: extra !== 0 }).catch((error: unknown) => {
      toast.show({ variant: "error", message: `Mirror to ${probe.host} failed: ${errorMessage(error)}` })
    })
    if (!received) return
    const notes = [
      received.stashed ? "its changes are in git stash" : "",
      received.untracked ? `${received.untracked} untracked file(s) of its own kept` : "",
    ].filter(Boolean)
    toast.show({
      variant: "success",
      message: `Mirrored to ${probe.host} (${received.head.slice(0, 7)})${notes.length ? `; ${notes.join("; ")}` : ""}`,
    })
    reopen()
    const mode = settings().revive
    if (mode === "never") return
    if (mode === "ask" && !(await DialogConfirm.show(dialog, "Revive", `Revive oc on ${probe.host}?`, "Revive")))
      return reopen()
    if (mode === "ask") reopen()
    const claimed = await OcMirror.revive(probe).catch((error: unknown) => {
      toast.show({ variant: "error", message: `Revive on ${probe.host} failed: ${errorMessage(error)}` })
    })
    if (claimed === undefined) return
    toast.show({
      variant: claimed ? "success" : "warning",
      message: claimed ? `oc on ${probe.host} is reviving` : `No oc window open on ${probe.host}; revive skipped`,
    })
  }

  // What to do with the target's own changes. Undefined: cancelled.
  async function dirtyMode(host: string, lost: string[]) {
    const mode = settings().dirty
    if (mode !== "ask") return mode
    const files = lost.slice(0, 3).join(", ") + (lost.length > 3 ? ", ..." : "")
    return new Promise<Exclude<OcMirror.Dirty, "ask"> | undefined>((resolve) =>
      dialog.replace(
        () => (
          <DialogSelect
            title={`${host} has ${lost.length} change(s) of its own: ${files}`}
            renderFilter={false}
            options={[
              { value: "backup" as const, title: "Back up, then mirror", description: "git stash -u there" },
              { value: "overwrite" as const, title: "Overwrite", description: "its changes are lost" },
              { value: "refuse" as const, title: "Skip" },
            ]}
            onSelect={(option) => resolve(option.value)}
          />
        ),
        () => resolve(undefined),
      ),
    )
  }

  // Machines first (DialogSelect keeps categories in first-seen order), settings last.
  // Refreshes keep the previous rows (`scan.latest`) so the cursor does not drop onto a setting.
  const note = (title: string, footer?: JSX.Element) => [
    { title, value: "", inert: true, category: "Machines", footer },
  ]
  const machineRows = (): DialogSelectOption<string>[] => {
    if (scan.error) return note(errorMessage(scan.error))
    const result = scan.latest
    if (!result) return []
    const local = result.local
    const self: DialogSelectOption<string> = {
      title: "This machine",
      titleView: <span style={{ fg: theme.textMuted }}>This machine</span>,
      value: "",
      inert: true,
      category: "Machines",
      footer: `${local.branch} ${local.head.slice(0, 7)} · ${local.changes.length ? `${local.changes.length} changed` : "clean"}`,
    }
    const machines = result.probes.map((probe) => ({
      title: probe.host,
      value: probe.info ? `mirror:${probe.host}` : "",
      inert: !probe.info,
      category: "Machines",
      footer: probe.info ? (
        describe(probe, probe.info, local)
      ) : (
        <span style={{ fg: theme.error }}>{Locale.truncate((probe.error ?? "unreachable").split(":")[0]!, 32)}</span>
      ),
    }))
    return [self, ...(machines.length ? machines : note("No other machines online"))]
  }

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    const current = settings()
    // First scan: no selectable rows yet, so the cursor lands on the first machine once they arrive.
    if (scan.loading && !scan.error && !scan.latest) return note("Finding machines", <Spinner />)
    return [
      ...machineRows(),
      { title: "Their own changes", value: "setting:dirty", category: "Settings", footer: current.dirty },
      { title: "Revive after mirror", value: "setting:revive", category: "Settings", footer: current.revive },
    ]
  })

  return (
    <DialogSelect
      title="Mirror oc source"
      titleView={
        <box flexDirection="row" gap={1}>
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            Mirror oc source
          </text>
          <Show when={scan.loading && !scan.error && scan.latest}>
            <Spinner />
          </Show>
        </box>
      }
      options={options()}
      renderFilter={false}
      preserveSelection
      onSelect={(option) => {
        if (option.value === "setting:dirty") return save("dirty", cycle(OcMirror.DIRTY, settings().dirty))
        if (option.value === "setting:revive") return save("revive", cycle(OcMirror.REVIVE, settings().revive))
        const result = scan.latest
        const probe = result?.probes.find((item) => option.value === `mirror:${item.host}`)
        if (probe && result) void mirror(probe, result.local)
      }}
      actions={[
        {
          command: "mirror.refresh",
          title: "refresh",
          bind: "ctrl+r",
          selection: "none",
          onTrigger: () => void refetch(),
        },
      ]}
    />
  )
}

function describe(probe: OcMirror.Probe, info: OcMirror.Info, local: OcMirror.Info) {
  const version = `v${info.version.split("-")[0]}`
  if (probe.inSync) return `${version} · in sync`
  const lost = probe.lost?.length ?? 0
  const state = [
    version,
    lost ? `${lost} own change(s)` : "",
    info.branch === local.branch ? "" : `on ${info.branch}`,
    probe.missing ? `${probe.missing} behind` : "",
    probe.extra === -1 ? "has other commits" : probe.extra ? `${probe.extra} ahead` : "",
    info.head === local.head && !probe.missing && !probe.extra ? "same commit, other files" : "",
  ]
  return state.filter(Boolean).join(" · ")
}
