import { createSignal, onMount } from "solid-js"
import { useRoute } from "./context/route"
import { useSDK } from "./context/sdk"
import { useSync } from "./context/sync"
import { persistOcConfig, readOcConfig } from "./ocSettings"
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
  const [failoverMode, setFailoverMode] = createSignal(readOcConfig().claudeFailover)

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
    desc: "Account used by every Claude session",
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
          title="Switch Claude account (busy sessions switch after their running work)"
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
    desc: "Pin a Claude account to this session only",
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
          title="Claude account for this session (applies after its running work finishes)"
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

  const failover = {
    name: "claude.failover",
    title: "Claude account failover",
    category: "oc",
    group: "Third party harness management",
    get desc() {
      return failoverMode()
    },
    run: () => {
      const choose = (mode: "auto" | "ask") => {
        dialog.clear()
        if (mode === failoverMode()) return
        void persistOcConfig("claudeFailover", mode, toast).then((saved) => saved && setFailoverMode(mode))
      }
      dialog.replace(() => (
        <DialogSelect
          title="Claude account failover"
          current={failoverMode()}
          options={[
            {
              title: "Auto",
              description: "switch to the account with the most 5-hour usage left",
              value: "auto",
              onSelect: () => choose("auto"),
            },
            {
              title: "Ask",
              description: "choose the account each time a turn hits a limit",
              value: "ask",
              onSelect: () => choose("ask"),
            },
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
      ...(multi ? [failover] : []),
      autoResume,
    ]
  }
}
