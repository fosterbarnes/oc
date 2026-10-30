import { useRenderer } from "@opentui/solid"
import { createSignal, onMount } from "solid-js"
import { useRoute } from "./context/route"
import { useSDK, type ClaudeAccountAction, type ClaudeManagedAccount, type ClaudeManagedAccounts } from "./context/sdk"
import { useSync } from "./context/sync"
import { runSuspended } from "./editor"
import { persistOcConfig, readOcConfig } from "./ocSettings"
import { useDialog } from "./ui/dialog"
import { DialogConfirm } from "./ui/dialog-confirm"
import { DialogPrompt } from "./ui/dialog-prompt"
import { DialogSelect } from "./ui/dialog-select"
import { useToast } from "./ui/toast"
import { Locale } from "./util/locale"

// Claude account manager, switching, and auto-resume palette entries, spread after the warm-up entries.
export function createClaudeAccountCommands() {
  const sdk = useSDK()
  const sync = useSync()
  const route = useRoute()
  const dialog = useDialog()
  const toast = useToast()
  const renderer = useRenderer()
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

  const change = (input: ClaudeAccountAction, message: string) =>
    sdk.claudeAccount
      .change(input)
      .then((next) => {
        toast.show({ message, variant: "info" })
        return next
      })
      .catch((error) => {
        toast.error(error)
        return undefined
      })

  const accountStatus = (account: ClaudeManagedAccount) => {
    if (account.loggedIn === false) return "signed out"
    if (account.loggedIn === undefined) return "sign-in status unknown"
    return [
      account.email,
      account.plan && account.plan[0]!.toUpperCase() + account.plan.slice(1),
      account.limitedUntil && `limited until ${Locale.datetime(account.limitedUntil)}`,
    ]
      .filter(Boolean)
      .join(" · ")
  }

  // `claude auth login` in this terminal, with the account's config dir and no credential overrides.
  const signIn = async (login: ClaudeManagedAccounts["login"], account: ClaudeManagedAccount) => {
    dialog.clear()
    const env = { ...process.env }
    for (const key of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CONFIG_DIR"])
      delete env[key]
    if (account.configDir) env.CLAUDE_CONFIG_DIR = account.configDir
    const signedIn = await runSuspended({ renderer, ...login, name: "claude auth login", env }).then(
      () => true,
      (error) => {
        toast.error(error)
        return false
      },
    )
    if (signedIn) await change({ action: "signedIn", id: account.id }, `Signed in: ${account.label}`)
    await showAccounts()
  }

  const addAccount = async () => {
    const name = await DialogPrompt.show(dialog, "New Claude account name (blank: claudeN)")
    if (name === null) return showAccounts()
    const next = await change({ action: "add", name: name.trim() || undefined }, "Claude account added")
    const added = next?.accounts.find((account) => account.id === next.added)
    if (!next || !added) return showAccounts()
    await signIn(next.login, added)
  }

  const renameAccount = async (account: ClaudeManagedAccount) => {
    const name = await DialogPrompt.show(dialog, `Rename ${account.label} (blank: default name)`, {
      value: account.name ?? "",
    })
    if (name !== null)
      await change({ action: "rename", id: account.id, name }, name.trim() ? `Renamed: ${name.trim()}` : "Name cleared")
    await showAccounts()
  }

  const confirmAccount = async (title: string, message: string, input: ClaudeAccountAction, done: string) => {
    if (await DialogConfirm.show(dialog, title, message)) await change(input, done)
    await showAccounts()
  }

  const showAccount = (state: ClaudeManagedAccounts, account: ClaudeManagedAccount) => {
    dialog.replace(() => (
      <DialogSelect
        title={`${account.label}: ${accountStatus(account)}`}
        options={[
          {
            title: account.loggedIn ? "Sign in again" : "Sign in",
            description: "runs claude auth login in this terminal",
            value: "signIn",
            onSelect: () => void signIn(state.login, account),
          },
          { title: "Rename", value: "rename", onSelect: () => void renameAccount(account) },
          ...(account.loggedIn
            ? [
                {
                  title: "Sign out",
                  value: "signOut",
                  onSelect: () =>
                    void confirmAccount(
                      `Sign out ${account.label}?`,
                      "Runs claude auth logout for this account.",
                      { action: "signOut", id: account.id },
                      `Signed out: ${account.label}`,
                    ),
                },
              ]
            : []),
          ...(state.accounts.length > 1
            ? [
                {
                  title: "Remove from pool",
                  description: "keeps the folder and its login",
                  value: "remove",
                  onSelect: () =>
                    void confirmAccount(
                      `Remove ${account.label}?`,
                      "Removes it from accounts in opencode.jsonc and reloads oc's config. Subagents that prefer it use the pool instead.",
                      { action: "remove", id: account.id },
                      `Removed: ${account.label}`,
                    ),
                },
              ]
            : []),
        ]}
      />
    ))
  }

  // Probes every account's CLI auth, so it takes a moment; reopened after every change.
  const showAccounts = async () => {
    const state = await sdk.claudeAccount.manage().catch((error) => {
      toast.error(error)
      return undefined
    })
    if (!state) return
    dialog.replace(() => (
      <DialogSelect
        title="Claude accounts"
        current={state.accounts.find((account) => account.current)?.id}
        options={[
          ...state.accounts.map((account) => ({
            title: account.label,
            description: accountStatus(account),
            value: account.id,
            onSelect: () => showAccount(state, account),
          })),
          { title: "Add account", value: "add", onSelect: () => void addAccount() },
        ]}
      />
    ))
  }

  const manageAccounts = {
    name: "claude.accounts",
    title: "Claude accounts",
    desc: "Add, rename, sign in, sign out, or remove Claude accounts",
    slashName: "claude-accounts",
    category: "oc",
    group: "Third party harness management",
    run: () => void showAccounts(),
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
      manageAccounts,
      ...(multi ? [switchAccount] : []),
      ...(multi && route.data.type === "session" ? [switchSessionAccount] : []),
      ...(multi ? [failover] : []),
      autoResume,
    ]
  }
}
