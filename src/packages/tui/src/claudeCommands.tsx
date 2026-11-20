import { useRenderer } from "@opentui/solid"
import { createSignal, onMount } from "solid-js"
import { DialogApiKey } from "./component/dialogApiKey"
import { useClipboard } from "./context/clipboard"
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

// Same entry as the server's `API_KEY_SECRET` (provider/claude-code/accounts.ts).
const API_KEY_SECRET = { service: "oc", name: "claudeCredit" } as const

// Home pick for the next session the Home prompt creates; pinned on create, then cleared.
const [nextSessionAccount, setNextSessionAccount] = createSignal<{ id: string; label: string }>()

export function takeNextSessionAccount() {
  const next = nextSessionAccount()
  setNextSessionAccount(undefined)
  return next?.id
}

// Claude account manager, switching, and auto-resume palette entries, spread after the warm-up entries.
export function createClaudeAccountCommands() {
  const sdk = useSDK()
  const sync = useSync()
  const route = useRoute()
  const dialog = useDialog()
  const toast = useToast()
  const renderer = useRenderer()
  const clipboard = useClipboard()
  const [resumeEnabled, setResumeEnabled] = createSignal(false)
  const [failoverMode, setFailoverMode] = createSignal(readOcConfig(toast).claudeFailover)
  const [rolloverMode, setRolloverMode] = createSignal(readOcConfig().claudeApiRollover)

  onMount(() => {
    void sdk.resume
      .state()
      .then((state) => setResumeEnabled(state.enabled))
      .catch(() => {})
  })

  const accountDescription = (account: { limitedUntil?: number; kind?: "api" }) =>
    [
      account.kind === "api" ? "bills API credits" : undefined,
      account.limitedUntil ? `limited until ${Locale.datetime(account.limitedUntil)}` : undefined,
    ]
      .filter(Boolean)
      .join(", ") || undefined

  const switchAccount = {
    name: "claude.account",
    title: "Switch Claude account",
    desc: "Account used by every Claude session",
    slashName: "claude-account",
    category: "oc",
    group: "Claude",
    run: async () => {
      const accounts = await sdk.claudeAccount.state().catch((error) => {
        toast.error(error)
        return undefined
      })
      if (!accounts) return
      const pick = async (account: (typeof accounts)[number]) => {
        // A global API pick bills every unpinned chat: confirm it.
        if (
          account.kind === "api" &&
          !(await DialogConfirm.show(
            dialog,
            "Use API credits for every chat?",
            `Every new or unpinned Claude chat will bill ${account.label} API credits until you switch back.`,
          ))
        )
          return
        await sdk.claudeAccount
          .set(account.id)
          .then(() => toast.show({ message: `Claude account: ${account.label}`, variant: "info" }))
          .catch(toast.error)
      }
      dialog.replace(() => (
        <DialogSelect
          title="Switch Claude account (busy sessions switch after their running work)"
          current={accounts.find((account) => account.current)?.id}
          options={accounts.map((account) => ({
            title: account.label,
            description: accountDescription(account),
            value: account.id,
            onSelect: () => {
              dialog.clear()
              if (!account.current) void pick(account)
            },
          }))}
        />
      ))
    },
  }

  // Home has no session yet: the pick waits in `nextSessionAccount` for the prompt's session.create.
  const chooseNextSessionAccount = async () => {
    const accounts = await sdk.claudeAccount.state().catch((error) => {
      toast.error(error)
      return undefined
    })
    if (!accounts) return
    const choose = (next: { id: string; label: string } | undefined) => {
      dialog.clear()
      if (next?.id === nextSessionAccount()?.id) return
      setNextSessionAccount(next)
      toast.show({ message: `Next session Claude account: ${next?.label ?? "global"}`, variant: "info" })
    }
    dialog.replace(() => (
      <DialogSelect
        title="Claude account for the next session"
        current={nextSessionAccount()?.id ?? "global"}
        options={[
          {
            title: "Use global account",
            description: accounts.find((account) => account.current)?.label,
            value: "global",
            onSelect: () => choose(undefined),
          },
          ...accounts.map((account) => ({
            title: account.label,
            description: accountDescription(account),
            value: account.id,
            onSelect: () => choose({ id: account.id, label: account.label }),
          })),
        ]}
      />
    ))
  }

  const switchSessionAccount = {
    name: "claude.sessionAccount",
    title: "Switch Claude account (this session)",
    get desc() {
      if (route.data.type === "home") return nextSessionAccount()?.label ?? "global"
      return "Pin a Claude account to this session only"
    },
    slashName: "claude-session-account",
    category: "oc",
    group: "Claude",
    run: async () => {
      if (route.data.type === "home") return chooseNextSessionAccount()
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
    group: "Claude",
    run: () => void showAccounts(),
  }

  const failover = {
    name: "claude.failover",
    title: "Claude account failover",
    category: "oc",
    group: "Claude",
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

  // The key goes from the user's paste to the OS keychain, never through a prompt field or a file.
  async function saveApiKey(key: string) {
    try {
      const replaced = !!(await Bun.secrets.get(API_KEY_SECRET))
      await Bun.secrets.set({ ...API_KEY_SECRET, value: key })
      // The server reads a missing key again on its next account read.
      void sdk.claudeAccount.state().catch(() => {})
      // The clipboard held the key moments ago. History (Win+V, clipboard managers) may still keep it.
      await clipboard.write?.("").catch(() => {})
      toast.show({
        message: `Claude API key saved (...${key.slice(-4)}). ${replaced ? "Restart oc to use the new key. " : ""}Clipboard cleared (clipboard history may still hold it).`,
        variant: "success",
      })
    } catch (error) {
      toast.error(error)
    }
  }

  const setApiKey = {
    name: "claude.apiKey",
    title: "Set Claude API key",
    desc: "Store a pasted Console key in the OS keychain",
    category: "oc",
    group: "Claude",
    run: () => dialog.replace(() => <DialogApiKey onSave={saveApiKey} />),
  }

  const apiRollover = {
    name: "claude.apiRollover",
    title: "Claude API credit rollover",
    category: "oc",
    group: "Claude",
    get desc() {
      return rolloverMode()
    },
    run: () => {
      const choose = (mode: "ask" | "always" | "off") => {
        dialog.clear()
        if (mode === rolloverMode()) return
        void persistOcConfig("claudeApiRollover", mode, toast).then((saved) => saved && setRolloverMode(mode))
      }
      dialog.replace(() => (
        <DialogSelect
          title="Claude API credit rollover"
          current={rolloverMode()}
          options={[
            {
              title: "Ask",
              description: "ask before a chat continues on API credits",
              value: "ask",
              onSelect: () => choose("ask"),
            },
            {
              title: "Always",
              description: "continue on API credits without asking",
              value: "always",
              onSelect: () => choose("always"),
            },
            {
              title: "Off",
              description: "never use API credits; wait for the reset",
              value: "off",
              onSelect: () => choose("off"),
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
    group: "Claude",
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

  // Reactive: the failover entry appears only with 2+ configured accounts; the global switch with 2+
  // profiles counting API credits; the session one likewise, in a session or on Home (for the next
  // session); the rollover one only with an `apiAccount`.
  return () => {
    const options = sync.data.config.provider?.["claude-code"]?.options
    const logins = (options?.accounts as unknown[] | undefined)?.length ?? 0
    const multi = logins > 1
    const profiles = Math.max(logins, 1) + (options?.apiAccount ? 1 : 0)
    return [
      manageAccounts,
      ...(profiles > 1 ? [switchAccount] : []),
      ...(profiles > 1 && (route.data.type === "session" || route.data.type === "home") ? [switchSessionAccount] : []),
      ...(multi ? [failover] : []),
      ...(options?.apiAccount ? [apiRollover] : []),
      ...((options?.apiAccount as { keychain?: unknown } | undefined)?.keychain === true ? [setApiKey] : []),
      autoResume,
    ]
  }
}
