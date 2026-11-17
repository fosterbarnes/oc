import fs from "node:fs"
import { ReviveResume } from "@opencode-ai/core/util/reviveResume"
import type { SessionQueueTakeResponse } from "@opencode-ai/sdk/v2"
import { usePromptRef } from "./context/prompt"
import { useSDK } from "./context/sdk"
import { useSync } from "./context/sync"
import type { PromptInfo } from "./prompt/history"
import { useRevive } from "./reviveCommands"
import { useDialog } from "./ui/dialog"
import { DialogPrompt } from "./ui/dialog-prompt"
import { DialogSelect } from "./ui/dialog-select"
import { useToast } from "./ui/toast"

const { label, chainText } = ReviveResume

// `queued`: taken from the session queue, which resumes once the chain finishes.
type Chain = { steps: readonly ReviveResume.Step[]; done: string[]; request: string; queued?: boolean }
type Target = Pick<ReviveResume.Body, "agent" | "model" | "variant">
// Sent with the first step only, as the prompt submit sends them today.
type Part = PromptInfo["parts"][number]
type Extra = { editor: Extract<Part, { type: "text" }>[]; attachments: Part[] }
type Queued = NonNullable<SessionQueueTakeResponse["payload"]>
type SendStep = Extract<ReviveResume.Step, { type: "send" }>

// Sessions whose queued chains this TUI is waiting for, across every hook instance.
const watching = new Set<string>()

// Revive chains: `/test /revive /ship` (slash.ts `extractChain`). Steps run in order from this TUI;
// a revive saves the rest (ReviveResume) for the TUI that opens the session after the restart.
export function useReviveChain() {
  const sdk = useSDK()
  const sync = useSync()
  const dialog = useDialog()
  const toast = useToast()
  const promptRef = usePromptRef()
  const revive = useRevive(toast)

  // True when a revive started: the rest of the chain continues in the TUI that opens the session next.
  const run = async (sessionID: string, chain: Chain, target: Target, extra?: Extra) => {
    const done = [...chain.done]
    for (const [index, step] of chain.steps.entries()) {
      const rest = chain.steps.slice(index + 1)
      if (step.type === "revive") {
        // A revive never cuts a running turn short, even when it is the first step.
        await revive.idle(sessionID)
        const body = { sessionID, writerPid: process.pid, at: Date.now(), steps: rest, done: [...done, label(step)] }
        // A queued chain always hands on, so the TUI after the restart resumes the queue.
        const resume =
          rest.length || chain.queued
            ? await ReviveResume.write({ ...body, request: chain.request, queued: chain.queued, ...target })
            : undefined
        if (await revive.start(step.mode, sessionID, resume, rest.map(label))) {
          if (resume) watchOwn(sessionID, resume)
          return true
        }
        if (resume) await ReviveResume.discard(resume)
        stop("Revive did not start", chain.steps.slice(index), chain.request)
        return false
      }
      const answer = await askBlank(step, chain, done)
      if (answer === "skip") continue
      if (answer === undefined) {
        stop("Chain stopped", chain.steps.slice(index), chain.request)
        return false
      }
      const error = await send(
        sessionID,
        answer,
        { ...chain, done, position: index },
        target,
        index ? undefined : extra,
      )
      if (error) {
        stop(error, rest, chain.request)
        return false
      }
      done.push(label(step))
    }
    if (chain.queued) {
      await sdk.client.session.queue.update({ sessionID, body: { type: "resume" } }, { throwOnError: true })
    }
    return false
  }

  // Called when a session opens: continues a chain settled by a revive, or restores one that failed.
  const resume = async (sessionID: string) => {
    const claimed = await ReviveResume.claim(sessionID, process.pid)
    if (!claimed) return
    const body = claimed.body
    if (!claimed.send) return stop("Revive failed", body.steps, body.request)
    if (body.steps.length) {
      toast.show({ message: `Continuing after revive: ${chainText(body.steps, "")}`, variant: "info" })
    }
    await revive.idle(sessionID)
    // Only agent and model: the whole body would overwrite the next revive's steps and loop the chain.
    await run(sessionID, body, { agent: body.agent, model: body.model, variant: body.variant })
  }

  // Runs this session's queued chains here as each reaches the front of the queue. The server hands a
  // chain to one waiting TUI (`session.queue.take`), so two TUIs on one session never both run it.
  const watchQueued = async (sessionID: string) => {
    if (watching.has(sessionID)) return
    watching.add(sessionID)
    try {
      while (await hasQueuedChain(sessionID)) {
        const taken = await sdk.client.session.queue.take({ sessionID }, { throwOnError: true })
        const payload = taken.data.payload
        if (!payload) continue
        // After a revive the server is going down; the TUI that opens the session next watches again.
        if (await runQueued(sessionID, payload)) return
      }
    } finally {
      watching.delete(sessionID)
    }
  }

  const hasQueuedChain = (sessionID: string) =>
    sdk.client.session.queue
      .get({ sessionID }, { throwOnError: true })
      .then((result) => result.data.entries.some((entry) => entry.chain))

  // The request is the typed text, as in a queued command; synthetic text is editor context.
  const runQueued = (sessionID: string, payload: Queued) => {
    const { agent, model, variant, parts } = payload
    // The queue add refuses a chain without them.
    if (!agent || !model) throw new Error("Queued revive chain has no agent or model")
    const text = parts.filter((part) => part.type === "text")
    return run(
      sessionID,
      {
        steps: payload.chain ?? [],
        done: [],
        request: text
          .filter((part) => !part.synthetic)
          .map((part) => part.text)
          .join("\n"),
        queued: true,
      },
      { agent, model, variant },
      { editor: text.filter((part) => part.synthetic), attachments: parts.filter((part) => part.type !== "text") },
    )
  }

  // A blank command after the first step asks first unless its `whenBlank` is "send". Resolves to the
  // step to send, "skip", or undefined when dismissed.
  const askBlank = async (step: SendStep, chain: Chain, done: readonly string[]) => {
    const name = step.names[0]
    const whenBlank = sync.data.command.find((command) => command.name === name)?.whenBlank
    if (!name || !done.length || step.text || chain.request || whenBlank === "send") return step
    const choice = await new Promise<"send" | "prompt" | "skip" | undefined>((resolve) => {
      dialog.replace(
        () => (
          <DialogSelect
            title={`/${name} is next and has no prompt.`}
            options={[
              { title: "Send blank", value: "send" as const },
              { title: "Add prompt", value: "prompt" as const },
              { title: "Skip", value: "skip" as const },
            ]}
            onSelect={(option) => resolve(option.value)}
          />
        ),
        () => resolve(undefined),
      )
    })
    if (choice === "send" || choice === "skip") dialog.clear()
    if (choice !== "prompt") return choice === "send" ? step : choice
    const text = await DialogPrompt.show(dialog, `/${name}`, { multiline: true })
    if (text === null) return
    dialog.clear()
    return { ...step, text }
  }

  const send = async (
    sessionID: string,
    step: SendStep,
    chain: Chain & { position: number },
    target: Target,
    extra?: Extra,
  ) => {
    const note = chainNote(chain)
    const editor = extra?.editor ?? []
    const attachments = extra?.attachments ?? []
    const request = step.names.length
      ? sdk.client.session.command(
          {
            sessionID,
            command: step.names[0],
            arguments: step.text ?? chain.request,
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
  const stop = (reason: string, steps: readonly ReviveResume.Step[], request: string) => {
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
    // A fast settle can land before this watcher exists.
    check()
  }

  return { run, resume, watchQueued, revive: revive.start }
}

// Read by each step's agent: without it, /test reading "...then revive then push" may push itself.
// The metadata draws the step line under the message (`chainLine` in util/revive.ts).
function chainNote(chain: Chain & { position: number }) {
  const progress = {
    step: chain.done.length + 1,
    total: chain.done.length + chain.steps.length - chain.position,
    done: chain.done,
    later: chain.steps.slice(chain.position + 1).map(label),
  }
  const text = [
    `[oc chain, step ${progress.step} of ${progress.total}: ${label(chain.steps[chain.position])}.`,
    progress.done.length ? `Already done: ${progress.done.join(", ")}.` : "",
    progress.later.length ? `oc runs these itself after your turn ends: ${progress.later.join(", ")}.` : "",
    "Do only this step. If you need the user's approval, ask with the question tool.]",
  ]
    .filter(Boolean)
    .join(" ")
  return { type: "text" as const, text, synthetic: true, metadata: { kind: "chain", ...progress } }
}
