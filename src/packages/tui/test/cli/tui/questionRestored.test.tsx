/** @jsxImportSource @opentui/solid */
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import { createSignal, onCleanup, Show } from "solid-js"
import type { QuestionRequest } from "@opencode-ai/sdk/v2"
import { QuestionPrompt, questionAnswerText } from "../../../src/routes/session/question"
import { SDKProvider } from "../../../src/context/sdk"
import { eventSource, json } from "../../fixture/tui-sdk"
import { tmpdir } from "../../fixture/fixture"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { TestTuiContexts } from "../../fixture/tui-environment"
import { wait } from "../cmd/tui/sync-fixture"

const request: QuestionRequest = {
  id: "que_live",
  sessionID: "ses_question",
  questions: [{ question: "Which approach?", header: "Approach", options: [{ label: "A", description: "First" }] }],
  tool: { messageID: "msg_question", callID: "call_question" },
}

async function mountQuestion(root: string, restored: boolean, fail = () => false) {
  await Bun.write(`${root}/kv.json`, "{}")
  const calls: { url: URL; body: unknown }[] = []
  const [dismissed, setDismissed] = createSignal(false)
  const fetch = (async (input: RequestInfo | URL) => {
    if (!(input instanceof Request)) throw new Error("Expected an SDK request")
    calls.push({ url: new URL(input.url), body: await input.json() })
    if (fail()) return json({ error: "Question request not found" }, { status: 404 })
    return new Response(null, { status: 204 })
  }) as typeof globalThis.fetch
  const [
    { DialogProvider },
    { KVProvider },
    { ThemeProvider },
    { TuiConfigProvider },
    { ToastProvider, useToast },
    { OpencodeKeymapProvider, registerOpencodeKeymap, getOpencodeModeStack },
  ] = await Promise.all([
    import("../../../src/ui/dialog"),
    import("../../../src/context/kv"),
    import("../../../src/context/theme"),
    import("../../../src/config"),
    import("../../../src/ui/toast"),
    import("../../../src/keymap"),
  ])
  let activeMode: (() => string) | undefined
  let toast!: ReturnType<typeof useToast>
  function Question() {
    toast = useToast()
    return (
      <Show when={!dismissed()}>
        <QuestionPrompt
          request={{ ...request, id: restored ? "restored_prt_question" : request.id }}
          directory="C:\projects\other project"
          workspace="ws_question"
          agent="plan"
          model={{ id: "model", providerID: "test", variant: "high" }}
          restored={restored}
          onDismiss={() => setDismissed(true)}
        />
      </Show>
    )
  }
  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const config = createTuiResolvedConfig({ keybinds: {}, leader_timeout: 1000 })
    onCleanup(registerOpencodeKeymap(keymap, renderer, config))
    activeMode = () => getOpencodeModeStack(keymap).current()
    return (
      <TestTuiContexts paths={{ state: root }}>
        <OpencodeKeymapProvider keymap={keymap}>
          <TuiConfigProvider config={config}>
            <KVProvider>
              <ThemeProvider mode="dark">
                <ToastProvider>
                  <SDKProvider url="http://test" directory="C:\home" fetch={fetch} events={eventSource()}>
                    <DialogProvider>
                      <Question />
                    </DialogProvider>
                  </SDKProvider>
                </ToastProvider>
              </ThemeProvider>
            </KVProvider>
          </TuiConfigProvider>
        </OpencodeKeymapProvider>
      </TestTuiContexts>
    )
  }
  const app = await testRender(() => <Harness />, { kittyKeyboard: true })
  await app.renderOnce()
  await wait(() => activeMode?.() === "question")
  return { app, calls, dismissed, toast: () => toast.currentToast }
}

test("restored answers preserve the question tool's multi-answer and unanswered format", () => {
  expect(
    questionAnswerText(
      {
        ...request,
        questions: [...request.questions, { ...request.questions[0], question: "Second?" }],
      },
      [["A", "B"], []],
    ),
  ).toBe(
    'User has answered your questions: "Which approach?"="A, B", "Second?"="Unanswered". You can now continue with the user\'s answers in mind.',
  )
})

test("answering a restored prompt posts a follow-up in its own directory with the session agent and model", async () => {
  await using tmp = await tmpdir()
  const prompt = await mountQuestion(tmp.path, true)
  try {
    prompt.app.mockInput.pressEnter()
    await wait(prompt.dismissed)
    expect(prompt.calls).toHaveLength(1)
    expect(prompt.calls[0].url.pathname).toBe(`/session/${request.sessionID}/prompt_async`)
    expect(prompt.calls[0].url.searchParams.get("directory")).toBe("C:\\projects\\other project")
    expect(prompt.calls[0].url.searchParams.get("workspace")).toBe("ws_question")
    expect(prompt.calls[0].body).toEqual({
      agent: "plan",
      model: { providerID: "test", modelID: "model" },
      variant: "high",
      parts: [{ type: "text", text: questionAnswerText(request, [["A"]]) }],
    })
  } finally {
    prompt.app.renderer.destroy()
  }
})

test("dismissing a restored prompt is local and sends no rejection", async () => {
  await using tmp = await tmpdir()
  const prompt = await mountQuestion(tmp.path, true)
  try {
    prompt.app.mockInput.pressEscape()
    await wait(prompt.dismissed)
    expect(prompt.calls).toEqual([])
  } finally {
    prompt.app.renderer.destroy()
  }
})

test("live prompts still reply to the pending request rather than starting a new turn", async () => {
  await using tmp = await tmpdir()
  const prompt = await mountQuestion(tmp.path, false)
  try {
    prompt.app.mockInput.pressEnter()
    await wait(prompt.dismissed)
    expect(prompt.calls[0].url.pathname).toBe(`/question/${request.id}/reply`)
    expect(prompt.calls[0].body).toEqual({ answers: [["A"]] })
  } finally {
    prompt.app.renderer.destroy()
  }
})

test("a failed live reply shows an error, keeps the prompt and permits a successful retry", async () => {
  await using tmp = await tmpdir()
  let fail = true
  const prompt = await mountQuestion(tmp.path, false, () => fail)
  try {
    prompt.app.mockInput.pressEnter()
    await wait(() => prompt.toast()?.title === "Failed to send answer")
    expect(prompt.toast()?.variant).toBe("error")
    expect(prompt.dismissed()).toBe(false)
    fail = false
    prompt.app.mockInput.pressEnter()
    await wait(prompt.dismissed)
    expect(prompt.calls).toHaveLength(2)
  } finally {
    prompt.app.renderer.destroy()
  }
})
