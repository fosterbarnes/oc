import { createSignal, onMount } from "solid-js"
import { useRoute } from "./context/route"
import { useSDK } from "./context/sdk"
import { useSync } from "./context/sync"
import { useDialog } from "./ui/dialog"
import { DialogSelect } from "./ui/dialog-select"
import { useToast } from "./ui/toast"
import { Locale } from "./util/locale"

// Claude account switching and auto-resume palette entries, spread after the warm-up entries.
export function createClaudeAccountCommands() {
  const sdk = useSDK()
  const sync = useSync()
  const route = useRoute()
  const dialog = useDialog()
  const toast = useToast()
  const [resumeEnabled, setResumeEnabled] = createSignal(false)

  onMount(() => {
    void sdk.resume
      .state()
      .then((state) => setResumeEnabled(state.enabled))
      .catch(() => {})
  })

  const accountDescription = (account: { limitedUntil?: number }) =>
    account.limitedUntil ? `limited until ${Locale.datetime(account.limitedUntil)}` : undefined

  const switchAccount = {
    name: "claude.account",
    title: "Switch Claude account",
    slashName: "claude-account",
    category: "oc",
    group: "Third party harness management",
    run: async () => {
      const accounts = await sdk.claudeAccount.state().catch((error) => {
        toast.error(error)
        return undefined
      })
      if (!accounts) return
      dialog.replace(() => (
        <DialogSelect
          title="Switch Claude account (sessions restart their Claude context on the next turn)"
          current={accounts.find((account) => account.current)?.id}
          options={accounts.map((account) => ({
            title: account.label,
            description: accountDescription(account),
            value: account.id,
            onSelect: () => {
              if (!account.current)
                void sdk.claudeAccount
                  .set(account.id)
                  .then(() => toast.show({ message: `Claude account: ${account.label}`, variant: "info" }))
                  .catch(toast.error)
              dialog.clear()
            },
          }))}
        />
      ))
    },
  }

  const switchSessionAccount = {
    name: "claude.sessionAccount",
    title: "Switch Claude account (this session)",
    slashName: "claude-session-account",
    category: "oc",
    group: "Third party harness management",
    run: async () => {
      if (route.data.type !== "session") return
      const sessionID = route.data.sessionID
      const accounts = await sdk.claudeAccount.state(sessionID).catch((error) => {
        toast.error(error)
        return undefined
      })
      if (!accounts) return
      const pinned = accounts.find((account) => account.pinned)
      const choose = (id: string | undefined, message: string) => {
        void sdk.claudeAccount
          .set(id, sessionID)
          .then(() => toast.show({ message, variant: "info" }))
          .catch(toast.error)
        dialog.clear()
      }
      dialog.replace(() => (
        <DialogSelect
          title="Claude account for this session (its Claude context restarts on the next turn)"
          current={pinned?.id ?? "global"}
          options={[
            {
              title: "Use global account",
              description: "unpin this session",
              value: "global",
              onSelect: () => (pinned ? choose(undefined, "Claude account: global") : dialog.clear()),
            },
            ...accounts.map((account) => ({
              title: account.label,
              description: accountDescription(account),
              value: account.id,
              onSelect: () =>
                account.pinned ? dialog.clear() : choose(account.id, `Session Claude account: ${account.label}`),
            })),
          ]}
        />
      ))
    },
  }

  const autoResume = {
    name: "claude.autoResume",
    title: "Claude auto-resume",
    category: "oc",
    group: "Third party harness management",
    get desc() {
      return resumeEnabled() ? "on" : "off"
    },
    run: async () => {
      // Reopens after every change so the toggle and the scheduled list stay current.
      const show = async () => {
        const state = await sdk.resume.state().catch((error) => {
          toast.error(error)
          return undefined
        })
        if (!state) return
        setResumeEnabled(state.enabled)
        const entries = [...state.entries].sort((a, b) => a.fireAt - b.fireAt)
        const update = (action: Promise<unknown>) => void action.then(show).catch(toast.error)
        dialog.replace(() => (
          <DialogSelect
            title="Claude auto-resume"
            current="enabled"
            options={[
              {
                title: `Auto-resume: ${state.enabled ? "on" : "off"}`,
                description: state.enabled ? undefined : "queued wakes cancelled",
                value: "enabled",
                onSelect: () => update(sdk.resume.set(!state.enabled)),
              },
              ...entries.map((entry) => ({
                title: sync.session.get(entry.sessionID)?.title ?? entry.sessionID,
                description: Locale.datetime(entry.fireAt),
                value: entry.id,
                category: "Scheduled (select to cancel)",
                onSelect: () => update(sdk.resume.cancel(entry.id)),
              })),
            ]}
          />
        ))
      }
      await show()
    },
  }

  // Reactive: account entries appear only with 2+ configured accounts, the session one only in a session.
  return () => {
    const multi =
      ((sync.data.config.provider?.["claude-code"]?.options?.accounts as unknown[] | undefined)?.length ?? 0) > 1
    return [
      ...(multi ? [switchAccount] : []),
      ...(multi && route.data.type === "session" ? [switchSessionAccount] : []),
      autoResume,
    ]
  }
}
