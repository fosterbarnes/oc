import fs from "node:fs"
import { ReviveResume } from "@opencode-ai/core/util/reviveResume"
import { createEffect, createRoot } from "solid-js"
import { usePromptRef } from "./context/prompt"
import { useSDK } from "./context/sdk"
import { useSync } from "./context/sync"
import type { PromptInfo } from "./prompt/history"
import { useRevive } from "./reviveCommands"
import { useToast } from "./ui/toast"

type Chain = { steps: ReviveResume.Step[]; done: string[]; request: string }
type Target = Pick<ReviveResume.Body, "agent" | "model" | "variant">
// Sent with the first step only, as the prompt submit sends them today.
type Part = PromptInfo["parts"][number]
type Extra = { editor: Extract<Part, { type: "text" }>[]; attachments: Part[] }

const REVIVE_NAMES: Record<ReviveResume.Mode, string> = {
  install: "revive",
  "no-install": "revive-no-install",
  single: "revive-single",
}

// Revive chains: `/pass /revive /agent-push` (slash.ts `extractChain`). Steps run in order from this TUI;
// a revive saves the rest (ReviveResume) for the TUI that opens the session after the restart.
export function useReviveChain() {
  const sdk = useSDK()
  const sync = useSync()
  const toast = useToast()
  const promptRef = usePromptRef()
  const revive = useRevive(toast)

  const run = async (sessionID: string, chain: Chain, target: Target, extra?: Extra) => {
    const done = [...chain.done]
    for (const [index, step] of chain.steps.entries()) {
      const rest = chain.steps.slice(index + 1)
      if (step.type === "revive") {
        // A revive never cuts a running turn short, even when it is the first step.
        await idle(sessionID)
        const body = { sessionID, writerPid: process.pid, at: Date.now(), steps: rest, done: [...done, label(step)] }
        const resume = rest.length
          ? await ReviveResume.write({ ...body, request: chain.request, ...target })
          : undefined
        if (await revive.start(step.mode, sessionID, resume)) {
          if (resume) watchOwn(sessionID, resume)
          return
        }
        if (resume) await ReviveResume.discard(resume)
        return stop("Revive did not start", chain.steps.slice(index), chain.request)
      }
      const error = await send(sessionID, step, { ...chain, done, position: index }, target, index ? undefined : extra)
      if (error) return stop(error, rest, chain.request)
      done.push(label(step))
    }
  }

  // Called when a session opens: continues a chain settled by a revive, or restores one that failed.
  const resume = async (sessionID: string) => {
    const claimed = await ReviveResume.claim(sessionID, process.pid)
    if (!claimed) return
    const body = claimed.body
    if (!claimed.send) return stop("Revive failed", body.steps, body.request)
    toast.show({ message: `Continuing after revive: ${chainText(body.steps, "")}`, variant: "info" })
    await idle(sessionID)
    await run(sessionID, body, body)
  }

  const send = async (
    sessionID: string,
    step: Extract<ReviveResume.Step, { type: "send" }>,
    chain: Chain & { position: number },
    target: Target,
    extra?: Extra,
  ) => {
    const note = { type: "text" as const, text: chainNote(chain), synthetic: true, metadata: { kind: "chain" } }
    const editor = extra?.editor ?? []
    const attachments = extra?.attachments ?? []
    const request = step.names.length
      ? sdk.client.session.command(
          {
            sessionID,
            command: step.names[0],
            additionalCommands: step.names.slice(1),
            arguments: chain.request,
            agent: target.agent,
            model: `${target.model.providerID}/${target.model.modelID}`,
            variant: target.variant,
            parts: [
              ...editor,
              note,
              ...attachments.filter((part): part is Extract<Part, { type: "file" }> => part.type === "file"),
            ],
          },
          { throwOnError: true },
        )
      : sdk.client.session.prompt(
          {
            sessionID,
            agent: target.agent,
            model: target.model,
            variant: target.variant,
            parts: [...editor, { type: "text", text: step.text ?? "" }, note, ...attachments],
          },
          { throwOnError: true },
        )
    // Both calls resolve when the turn ends; an interrupted or failed turn stops the chain.
    return request.then(
      (result) => (result.data.info.role === "assistant" && result.data.info.error ? "Turn did not finish" : undefined),
      (error: unknown) => (error instanceof Error ? error.message : "Send failed"),
    )
  }

  // The rest of a stopped chain goes back to an empty prompt, so it can be sent again by hand.
  const stop = (reason: string, steps: ReviveResume.Step[], request: string) => {
    if (!steps.length) return
    const text = chainText(steps, request)
    toast.show({ message: `${reason}: not sent: ${chainText(steps, "")}`, variant: "warning", duration: 8000 })
    const prompt = promptRef.current
    if (prompt && !prompt.current.input) prompt.set({ input: text, parts: [] })
  }

  // This TUI keeps running when /revive-single or the revive helper fails; claim that failure here.
  const watchOwn = (sessionID: string, id: string) => {
    const check = () =>
      void ReviveResume.status(id).then((state) => {
        if (state === "pending") return
        watcher.close()
        if (state === "failed") void resume(sessionID)
      })
    const watcher = fs.watch(ReviveResume.directory(), check)
    // `revive.path` settles before this watcher exists.
    check()
  }

  const idle = (sessionID: string) =>
    new Promise<void>((resolve) =>
      createRoot((dispose) =>
        createEffect(() => {
          if ((sync.data.session_status[sessionID]?.type ?? "idle") !== "idle") return
          queueMicrotask(dispose)
          resolve()
        }),
      ),
    )

  return { run, resume, revive: revive.start }
}

function label(step: ReviveResume.Step) {
  if (step.type === "revive") return `/${REVIVE_NAMES[step.mode]}`
  return step.names.length ? step.names.map((name) => `/${name}`).join(" ") : "a plain prompt"
}

// What the user would type to run these steps again.
function chainText(steps: ReviveResume.Step[], request: string) {
  const typed = steps
    .map((step) => (step.type === "send" && !step.names.length ? (step.text ?? "") : label(step)))
    .join(" ")
  return [typed, request].filter(Boolean).join("\n")
}

// Read by each step's agent: without it, /pass reading "...then revive then push" may push itself.
function chainNote(chain: Chain & { position: number }) {
  const total = chain.done.length + chain.steps.length - chain.position
  const current = chain.steps[chain.position]
  const later = chain.steps.slice(chain.position + 1).map(label)
  return [
    `[oc chain, step ${chain.done.length + 1} of ${total}: ${label(current)}.`,
    chain.done.length ? `Already done: ${chain.done.join(", ")}.` : "",
    later.length ? `oc runs these itself after your turn ends: ${later.join(", ")}.` : "",
    "Do only this step. If you need the user's approval, ask with the question tool.]",
  ]
    .filter(Boolean)
    .join(" ")
}
