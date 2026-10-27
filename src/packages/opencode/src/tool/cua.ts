// The cua_* tools: native GUI automation through one oc-owned cua-driver child (tool/cuaDriver.ts),
// replacing its 61-tool MCP surface with a few typed tools plus `cua_raw`. Every call passes one
// `cua` permission gate; foreground input, file transfer, and killing foreign processes ask the user.
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Schema } from "effect"
import { Tool } from "./tool"
import { CuaDriver } from "./cuaDriver"
import { ToolID } from "./schema"
import { TRUNCATION_DIR } from "./truncation-dir"

type Args = Record<string, unknown>
type Policy = "deny" | "kill" | "sensitive" | "foreground" | "plain"

const DENIED = new Set([
  "set_config",
  "install_extension",
  "install_ffmpeg",
  "start_recording",
  "stop_recording",
  "replay_trajectory",
  "escalate_session",
])
const SENSITIVE: Record<string, string> = {
  browser_set_input_files: "Upload local files to a web page",
  browser_download: "Download a file from a web page",
  clipboard_read: "Read your clipboard",
  get_desktop_state: "Capture your whole screen",
}
// run_script is a program whose delivery modes oc cannot inspect.
const FOREGROUND_TOOLS = new Set(["bring_to_front", "run_script"])
const MAX_TAKEOVER_MINUTES = 30

// Server-wide on purpose: there is one desktop, whichever session drives it.
let takeoverUntil = 0
const launched = new Set<number>()

/** Classify a driver call before it runs. Pure, so the safety rules are testable without a driver. */
export function policy(tool: string, args: Args, launchedPids: ReadonlySet<number>): Policy {
  if (DENIED.has(tool)) return "deny"
  if (tool === "kill_app") return launchedPids.has(Number(args.pid)) ? "plain" : "kill"
  if (tool in SENSITIVE) return "sensitive"
  if (FOREGROUND_TOOLS.has(tool) || foregroundMarker(args)) return "foreground"
  return "plain"
}

function foregroundMarker(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(foregroundMarker)
  if (!isRecord(value)) return false
  if (value.delivery_mode === "foreground" || value.foreground_fallback === true || value.scope === "desktop")
    return true
  if (isRecord(value.target) && value.target.kind === "desktop") return true
  return Object.values(value).some(foregroundMarker)
}

const gate = Effect.fn("Cua.gate")(function* (ctx: Tool.Context, tool: string, args: Args) {
  const kind = policy(tool, args, launched)
  if (kind === "deny") return yield* Effect.die(new Error(`${tool} is blocked in oc (config, install, and recording).`))
  // An approved takeover is the user's consent to foreground input until it ends.
  const pattern = kind === "plain" || (kind === "foreground" && Date.now() < takeoverUntil) ? "background" : kind
  yield* ctx.ask({
    permission: "cua",
    patterns: [pattern],
    always: pattern === "kill" ? [] : [pattern],
    metadata: { tool, ...prompt(pattern, tool, args) },
  })
})

// Title and detail for the TUI permission prompt (`permission.tsx`, permission "cua").
function prompt(pattern: string, tool: string, args: Args) {
  if (pattern === "kill")
    return { title: "Force-close a process", detail: `pid ${args.pid} was not launched by oc; unsaved work is lost.` }
  if (pattern === "sensitive") return { title: SENSITIVE[tool], detail: `cua-driver ${tool}` }
  if (pattern === "foreground")
    return {
      title: "Foreground input",
      detail: `cua-driver ${tool} raises the target window and may take the pointer or keyboard focus.`,
    }
  return { title: "Drive a GUI app", detail: `cua-driver ${tool}` }
}

const run = Effect.fn("Cua.run")(function* (ctx: Tool.Context, tool: string, args: Args) {
  yield* gate(ctx, tool, args)
  const result = yield* Effect.promise(() => CuaDriver.call(ctx.sessionID, tool, args, ctx.abort))
  const text = result.content.flatMap((item) => (item.type === "text" ? [item.text] : [])).join("\n\n")
  if (result.isError) return yield* Effect.die(new Error(text || `cua-driver ${tool} failed.`))
  const pid = (result.structuredContent as { pid?: unknown } | undefined)?.pid
  if (tool === "launch_app" && typeof pid === "number") launched.add(pid)
  if (tool === "kill_app") launched.delete(Number(args.pid))
  return {
    title: tool,
    output: text,
    metadata: {},
    attachments: result.content.flatMap((item) =>
      item.type === "image"
        ? [{ type: "file" as const, mime: item.mimeType, url: `data:${item.mimeType};base64,${item.data}` }]
        : [],
    ),
  }
})

const JsonObject = Schema.Record(Schema.String, Schema.Unknown)
const Pid = Schema.Int.annotate({ description: "Process id from cua_windows or cua_launch." })
const WindowId = Schema.Int.annotate({ description: "window_id from cua_windows or cua_launch." })

const WindowsParameters = Schema.Struct({
  pid: Schema.optional(Pid),
  app: Schema.optional(Schema.String).annotate({ description: "App name filter, e.g. Calculator." }),
  on_screen_only: Schema.optional(Schema.Boolean).annotate({ description: "Skip minimized and hidden windows." }),
})

const LaunchParameters = Schema.Struct({
  name: Schema.optional(Schema.String).annotate({
    description: "App name, resolved through the Start menu (works for Store apps such as Calculator and Notepad).",
  }),
  path: Schema.optional(Schema.String).annotate({ description: "Full path to an executable. Wins over name." }),
  aumid: Schema.optional(Schema.String).annotate({ description: "Packaged app id (AUMID)." }),
  arguments: Schema.optional(Schema.Array(Schema.String)).annotate({ description: "Command-line arguments." }),
  urls: Schema.optional(Schema.Array(Schema.String)).annotate({ description: "URLs to open in the default browser." }),
})

const ObserveParameters = Schema.Struct({
  pid: Pid,
  window_id: WindowId,
  query: Schema.optional(Schema.String).annotate({
    description: "Case-insensitive substring: only matching rows and their ancestors, original indices kept.",
  }),
  full: Schema.optional(Schema.Boolean).annotate({
    description: "Read the whole tree instead of only what changed since your last read of this window.",
  }),
  max_elements: Schema.optional(Schema.Int).annotate({ description: "Cap on nodes walked. Default 250." }),
  screenshot: Schema.optional(Schema.Literals(["view", "file"])).annotate({
    description:
      "view: attach the window image (costs tokens; for surfaces the tree misses). file: save a PNG and return its path (evidence).",
  }),
  region: Schema.optional(
    Schema.Struct({ x1: Schema.Finite, y1: Schema.Finite, x2: Schema.Finite, y2: Schema.Finite }),
  ).annotate({
    description: "Return a zoomed image of this window-local pixel rectangle instead of the tree.",
  }),
})

const ActParameters = Schema.Struct({
  steps: Schema.Array(JsonObject)
    .check(Schema.isLengthBetween(1, 64))
    .annotate({ description: "Ordered steps: {tool, args} or {<tool>: args}, plus optional wait_for / expect." }),
  pid: Schema.optional(Pid),
  window_id: Schema.optional(WindowId),
  app: Schema.optional(Schema.String).annotate({ description: "Default app (name) for steps that name no window." }),
  window: Schema.optional(Schema.String).annotate({ description: "Default window title substring." }),
  observe: Schema.optional(JsonObject).annotate({
    description: "{} reads what changed after the last step; {include_screenshot: true} also attaches the image.",
  }),
  delivery_mode: Schema.optional(Schema.Literals(["background", "foreground"])),
  foreground_fallback: Schema.optional(Schema.Boolean).annotate({
    description: "Retry a step its app refuses in the background once in the foreground.",
  }),
  delay_ms: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2000 }))),
})

const VerifyParameters = Schema.Struct({
  pid: Pid,
  window_id: WindowId,
  expect: Schema.Array(JsonObject).check(Schema.isLengthBetween(1, 8)).annotate({
    description:
      'Predicates, all must hold: {"element": {"selector": {"role"?, "label_contains"?}, "exists"?: true, "enabled"?, "selected"?, "value_equals"?}} or {"window": {"exists"?, "bounds"?: {x, y, width, height, tolerance_px?}}}.',
  }),
  timeout_ms: Schema.optional(Schema.Int),
  stable_samples: Schema.optional(Schema.Int).annotate({ description: "Reads the state must hold for." }),
})

const CloseParameters = Schema.Struct({ pid: Pid })

const TakeoverParameters = Schema.Struct({
  minutes: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: MAX_TAKEOVER_MINUTES })).annotate({
    description: `1 to ${MAX_TAKEOVER_MINUTES} starts a takeover (the user approves it); 0 ends it.`,
  }),
})

const RawParameters = Schema.Struct({
  tool: Schema.optional(Schema.String).annotate({ description: "Driver tool name. Omit to list them." }),
  args: Schema.optional(JsonObject).annotate({ description: "That tool's arguments." }),
  help: Schema.optional(Schema.Boolean).annotate({
    description: "Return the tool's description and argument schema without calling it.",
  }),
})

export const CuaWindowsTool = Tool.define(
  "cua_windows",
  Effect.succeed({
    description:
      "List top-level windows (pid, window_id, app, title, bounds) through cua-driver, to find the window to observe or act on.",
    parameters: WindowsParameters,
    execute: (params: Schema.Schema.Type<typeof WindowsParameters>, ctx: Tool.Context) =>
      run(ctx, "list_windows", { ...params }),
  }),
)

export const CuaLaunchTool = Tool.define(
  "cua_launch",
  Effect.succeed({
    description:
      "Launch a native app through cua-driver without bringing it to the front (it never steals focus). " +
      "Returns its pid and windows. oc remembers the pid, so cua_close can close it without asking.",
    parameters: LaunchParameters,
    execute: (params: Schema.Schema.Type<typeof LaunchParameters>, ctx: Tool.Context) =>
      run(ctx, "launch_app", {
        name: params.name,
        path: params.path,
        aumid: params.aumid,
        additional_arguments: params.arguments,
        urls: params.urls,
      }),
  }),
)

export const CuaObserveTool = Tool.define(
  "cua_observe",
  Effect.succeed({
    description:
      "Read a native window's accessibility tree through cua-driver, in the background. " +
      'Row [N] has element_token "<snapshot_id>:N" for cua_act. Re-reads return only what changed since your last ' +
      "read of the window unless full is set. No screenshot unless asked; prefer the tree.",
    parameters: ObserveParameters,
    execute: (params: Schema.Schema.Type<typeof ObserveParameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        if (params.region)
          return yield* run(ctx, "zoom", { pid: params.pid, window_id: params.window_id, ...params.region })
        const file = params.screenshot === "file" ? path.join(TRUNCATION_DIR, `${ToolID.ascending()}.png`) : undefined
        if (file) yield* Effect.promise(() => fs.mkdir(TRUNCATION_DIR, { recursive: true }))
        const result = yield* run(ctx, "get_window_state", {
          pid: params.pid,
          window_id: params.window_id,
          query: params.query,
          since: params.full ? undefined : "latest",
          max_elements: params.max_elements,
          include_screenshot: params.screenshot !== undefined,
          screenshot_out_file: file,
        })
        return file ? { ...result, output: `${result.output}\n\nScreenshot saved: ${file}` } : result
      }),
  }),
)

export const CuaActTool = Tool.define(
  "cua_act",
  Effect.succeed({
    description:
      "Act on a native app through cua-driver: up to 64 input steps in ONE call, in order, stopping at the first failure. " +
      "A step is {tool, args} or {<tool>: args}; tool is click, double_click, right_click, set_value, type_text, " +
      "press_key, hotkey, scroll, drag, or move_cursor, and args are that driver tool's arguments " +
      "(cua_raw help: true shows them). Target by element_token from cua_observe, or by name: role (button, textfield, " +
      "link, checkbox, menuitem, ...), name (label; exact match wins, case-insensitive), nth, and app or window " +
      "instead of pid/window_id; a named target is found fresh and waited for up to 3 s. A step may add wait_for " +
      "(before) and expect (up to 4 checks after): {role?, name?, text?, gone?, value?, value_contains?, enabled?, " +
      "selected?, timeout_ms?}. observe: {} returns what changed after the last step. Input goes to the window in " +
      "the background and never steals focus; delivery_mode foreground or foreground_fallback raises the window " +
      "and asks the user unless a cua_takeover is active. Example: " +
      '{"app":"Calculator","steps":[{"click":{"role":"button","name":"6"}},{"click":{"role":"button","name":"Equals"},' +
      '"expect":[{"name":"Result","value_contains":"6"}]}],"observe":{}}',
    parameters: ActParameters,
    execute: (params: Schema.Schema.Type<typeof ActParameters>, ctx: Tool.Context) =>
      run(ctx, "run_steps", { ...params }),
  }),
)

export const CuaVerifyTool = Tool.define(
  "cua_verify",
  Effect.succeed({
    description:
      "Check predicates against one window through cua-driver; each comes back satisfied, unsatisfied, or unknown. " +
      "Unknown never means success. Use at test checkpoints.",
    parameters: VerifyParameters,
    execute: (params: Schema.Schema.Type<typeof VerifyParameters>, ctx: Tool.Context) =>
      run(ctx, "verify_state", { ...params }),
  }),
)

export const CuaCloseTool = Tool.define(
  "cua_close",
  Effect.succeed({
    description:
      "Force-close a process through cua-driver; unsaved work is lost. Prefer clicking the window's Close button " +
      "with cua_act first. Closing a pid oc did not launch with cua_launch asks the user.",
    parameters: CloseParameters,
    execute: (params: Schema.Schema.Type<typeof CloseParameters>, ctx: Tool.Context) =>
      run(ctx, "kill_app", { pid: params.pid }),
  }),
)

export const CuaTakeoverTool = Tool.define(
  "cua_takeover",
  Effect.succeed({
    description:
      "Ask the user for a time-boxed takeover of the PC: while it lasts, cua foreground input (delivery_mode " +
      "foreground, foreground_fallback, bring_to_front, desktop targets, run_script) runs without asking per call. " +
      "Use only after the user agreed to step away. Outside a takeover each foreground call asks.",
    parameters: TakeoverParameters,
    execute: (params: Schema.Schema.Type<typeof TakeoverParameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        if (params.minutes === 0) {
          takeoverUntil = 0
          return { title: "Takeover ended", output: "Takeover ended; foreground input asks again.", metadata: {} }
        }
        yield* ctx.ask({
          permission: "cua",
          patterns: ["takeover"],
          always: [],
          metadata: {
            title: `Take over the PC for ${params.minutes} min`,
            detail: "Agents may raise windows and use the pointer and keyboard without asking until it ends.",
          },
        })
        takeoverUntil = Date.now() + params.minutes * 60_000
        const until = new Date(takeoverUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        return {
          title: `Takeover until ${until}`,
          output: `Foreground input is allowed until ${until}. Call cua_takeover with minutes 0 when done.`,
          metadata: {},
        }
      }),
  }),
)

export const CuaRawTool = Tool.define(
  "cua_raw",
  Effect.succeed({
    description:
      "Call any other cua-driver tool: browser, clipboard, menus, window frames, sessions, cursor, diagnostics. " +
      "No tool: list them. help: true: that tool's description and argument schema, without calling it. " +
      "Prefer the typed cua_* tools. Your session label is added for you. Foreground input, file transfer, " +
      "clipboard reads, and full-screen capture ask the user; config, install, and recording tools are blocked.",
    parameters: RawParameters,
    execute: (params: Schema.Schema.Type<typeof RawParameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        const tools = yield* Effect.promise(() => CuaDriver.tools())
        if (!params.tool) {
          const lines = [...tools.values()]
            .filter((tool) => !DENIED.has(tool.name))
            .map((tool) => `- ${tool.name}: ${tool.description?.split(/(?<=\.)\s/)[0] ?? ""}`)
          return { title: `${lines.length} tools`, output: lines.join("\n"), metadata: {} }
        }
        const tool = tools.get(params.tool)
        if (!tool)
          return yield* Effect.die(
            new Error(`Unknown cua-driver tool ${params.tool}. Call cua_raw without tool to list them.`),
          )
        if (params.help)
          return {
            title: `${tool.name} help`,
            output: `${tool.description ?? ""}\n\nArguments (JSON Schema):\n${JSON.stringify(tool.inputSchema)}`,
            metadata: {},
          }
        return yield* run(ctx, tool.name, params.args ?? {})
      }),
  }),
)

export const CUA_TOOL_IDS = new Set<string>([
  CuaWindowsTool.id,
  CuaLaunchTool.id,
  CuaObserveTool.id,
  CuaActTool.id,
  CuaVerifyTool.id,
  CuaCloseTool.id,
  CuaTakeoverTool.id,
  CuaRawTool.id,
])

function isRecord(value: unknown): value is Args {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
