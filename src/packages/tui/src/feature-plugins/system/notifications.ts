import type { Event } from "@opencode-ai/sdk/v2"
import type { TuiAttentionSoundName, TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"

const id = "internal:notifications"

// One reminder per question still unanswered after this long, for every provider.
const QUESTION_REMINDER_MS = 5 * 60_000
let questionReminderMs = QUESTION_REMINDER_MS

/** Test seam. */
export function _setQuestionReminderMs(ms = QUESTION_REMINDER_MS) {
  questionReminderMs = ms
}

type SessionError = Extract<Event, { type: "session.error" }>["properties"]["error"]

function notify(api: TuiPluginApi, sessionID: string | undefined, message: string, sound: TuiAttentionSoundName) {
  const session = sessionID ? api.state.session.get(sessionID) : undefined
  const isSubagent = session?.parentID !== undefined
  void api.attention.notify({
    title: session?.title,
    message,
    notification: isSubagent ? false : { when: "blurred" },
    sound: { name: sound, when: "always" },
  })
}

// The toast skips the session you are viewing (its form is on screen); the desktop
// notification and sound only reach you away from the terminal.
function remindQuestion(api: TuiPluginApi, sessionID: string) {
  const title = api.state.session.get(sessionID)?.title
  const waited = `${QUESTION_REMINDER_MS / 60_000} min`
  const message = title
    ? `"${title}" has waited ${waited} for your answer.`
    : `A question has waited ${waited} for your answer.`
  const route = api.route.current
  const viewing = route.name === "session" && route.params?.sessionID === sessionID
  if (!viewing) api.ui.toast({ variant: "info", title: "Question waiting", message })
  void api.attention.notify({
    title: "Question waiting",
    message,
    notification: { when: "blurred" },
    sound: { name: "question", when: "blurred" },
  })
}

function sessionErrorMessage(error: SessionError) {
  if (error?.name === "MessageAbortedError") return "Session aborted"
  const data = error?.data
  if (data && typeof data === "object" && "message" in data && data.message === "SSE read timed out") {
    return "Model stopped responding"
  }
  return "Session error"
}

const tui: TuiPlugin = async (api) => {
  const active = new Set<string>()
  const errored = new Set<string>()
  // Pending question id -> its reminder timer.
  const questions = new Map<string, ReturnType<typeof setTimeout>>()
  const permissions = new Set<string>()

  const settleQuestion = (requestID: string) => {
    clearTimeout(questions.get(requestID))
    questions.delete(requestID)
  }

  api.event.on("question.asked", (event) => {
    const request = event.properties
    if (questions.has(request.id)) return
    const timer = setTimeout(() => {
      questions.delete(request.id)
      remindQuestion(api, request.sessionID)
    }, questionReminderMs)
    timer.unref?.()
    questions.set(request.id, timer)
    notify(api, request.sessionID, "Question needs input", "question")
  })

  api.event.on("question.replied", (event) => {
    settleQuestion(event.properties.requestID)
  })

  api.event.on("question.rejected", (event) => {
    settleQuestion(event.properties.requestID)
  })

  api.event.on("permission.asked", (event) => {
    if (permissions.has(event.properties.id)) return
    permissions.add(event.properties.id)
    notify(api, event.properties.sessionID, "Permission needs input", "permission")
  })

  api.event.on("permission.replied", (event) => {
    permissions.delete(event.properties.requestID)
  })

  api.event.on("session.status", (event) => {
    const sessionID = event.properties.sessionID
    if (event.properties.status.type === "busy" || event.properties.status.type === "retry") {
      active.add(sessionID)
      errored.delete(sessionID)
      return
    }

    if (event.properties.status.type !== "idle") return
    if (!active.has(sessionID)) return
    active.delete(sessionID)

    if (errored.has(sessionID)) {
      errored.delete(sessionID)
      return
    }

    const session = api.state.session.get(sessionID)
    notify(api, sessionID, "Session done", session?.parentID ? "subagent_done" : "done")
  })

  api.event.on("session.error", (event) => {
    const sessionID = event.properties.sessionID
    if (!sessionID) return
    if (!active.has(sessionID)) return
    errored.add(sessionID)
    notify(api, sessionID, sessionErrorMessage(event.properties.error), "error")
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
