export * as TuiEvent from "./tui-event"

import { Effect, Schema } from "effect"
import { optional } from "./schema"
import { Event } from "./event"
import { PositiveInt } from "./schema"
import { SessionID } from "./session-id"

const DEFAULT_TOAST_DURATION = 5000

export const PromptAppend = Event.define({ type: "tui.prompt.append", schema: { text: Schema.String } })

export const RemoteTargetedCommandID = Schema.Literals([
  "session.list",
  "session.most_recent",
  "oc.new_session",
  "model.default",
  "agent.session",
  "agent.default_subagent",
  "agent.default_subagent_model",
  "oc.home_dir",
  "oc.home_dir_sort",
  "session.new",
  "session.rename",
  "session.compact",
  "session.complete.toggle",
  "session.failed.toggle",
  "model.list",
  "agent.list",
  "agent.cycle",
  "variant.cycle",
  "command.palette.show",
  "theme.switch",
  "session.sidebar.toggle",
  "opencode.status",
] as const)

export const CrowSessionHandle = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
).pipe(Schema.brand("CrowSessionHandle"))

export const CommandExecuteTargeted = Event.define({
  type: "tui.command.execute.targeted",
  schema: {
    command: RemoteTargetedCommandID,
    crowSessionHandle: CrowSessionHandle,
    expectedOpenCodeSessionID: SessionID.annotate({
      description: "OpenCode session ID the targeted TUI must match before executing the command",
    }),
  },
})

export const CommandExecute = Event.define({
  type: "tui.command.execute",
  schema: {
    command: Schema.Union([
      Schema.Literals([
        "session.list",
        "session.new",
        "session.share",
        "session.interrupt",
        "session.compact",
        "session.page.up",
        "session.page.down",
        "session.line.up",
        "session.line.down",
        "session.half.page.up",
        "session.half.page.down",
        "session.first",
        "session.last",
        "prompt.clear",
        "prompt.submit",
        "agent.cycle",
      ]),
      Schema.String,
    ]),
  },
})

export const ToastShow = Event.define({
  type: "tui.toast.show",
  schema: {
    title: optional(Schema.String),
    message: Schema.String,
    variant: Schema.Literals(["info", "success", "warning", "error"]),
    duration: PositiveInt.pipe(Schema.withDecodingDefault(Effect.succeed(DEFAULT_TOAST_DURATION))).annotate({
      description: "Duration in milliseconds",
    }),
  },
})

export const SessionSelect = Event.define({
  type: "tui.session.select",
  schema: {
    sessionID: SessionID.annotate({ description: "Session ID to navigate to" }),
  },
})

export const Definitions = Event.inventory(
  PromptAppend,
  CommandExecuteTargeted,
  CommandExecute,
  ToastShow,
  SessionSelect,
)
