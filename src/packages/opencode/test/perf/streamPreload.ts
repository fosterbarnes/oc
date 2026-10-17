// P10 stream smoothness: TUI main-thread timeline while a reply streams, written to
// OC_PERF_LOG_DIR/stream-trace.jsonl. Rows (`k`): `msg` worker message handled (type, ms, delta
// chars), `flush` 16 ms coalesced event flush, `frame` render loop (js/layout/native ms, cells
// updated, code-block display lag), `md` markdown content set, `code` code block content set,
// `hl` highlight finished (applied or discarded), `ts` tree-sitter worker round trip, `stall`
// event-loop gap. Times are epoch ms (float) so they line up with the test process logs.
import { appendFileSync } from "node:fs"
import path from "node:path"

const dir = process.env.OC_PERF_LOG_DIR
if (dir && process.env.OC_PERF_STREAM === "1") {
  const file = `${dir}/stream-trace.jsonl`
  const now = () => performance.timeOrigin + performance.now()
  let rows: string[] = []
  const log = (row: Record<string, unknown>) => rows.push(JSON.stringify(row))
  setInterval(() => {
    if (rows.length === 0) return
    appendFileSync(file, rows.join("\n") + "\n")
    rows = []
  }, 250).unref()

  // Event-loop gaps beyond 25 ms (timer due every 10 ms). `timer` rows summarize the real
  // interval every 5 s, which shows the effective Windows timer resolution in this process.
  let tick = performance.now()
  let gaps: number[] = []
  setInterval(() => {
    const at = performance.now()
    const gap = at - tick
    gaps.push(gap)
    if (gap > 25) log({ k: "stall", t: now(), d: gap - 10 })
    tick = at
  }, 10).unref()
  setInterval(() => {
    const sorted = gaps.sort((a, b) => a - b)
    gaps = []
    if (sorted.length === 0) return
    log({ k: "timer", t: now(), n: sorted.length, p50: sorted[sorted.length >> 1], min: sorted[0] })
  }, 5000).unref()

  // Time between a worker message arriving and the frame that paints it.
  let pendingSince = 0
  let deltaChars = 0

  const NativeWorker = globalThis.Worker
  globalThis.Worker = new Proxy(NativeWorker, {
    construct(target, args) {
      const worker = Reflect.construct(target, args) as Worker
      if (!String(args[0]).replaceAll("\\", "/").includes("tui/worker")) return worker
      let proto = Object.getPrototypeOf(worker)
      let desc: PropertyDescriptor | undefined
      while (proto && !(desc = Object.getOwnPropertyDescriptor(proto, "onmessage"))) proto = Object.getPrototypeOf(proto)
      if (!desc?.set || !desc.get) return worker
      const set = desc.set
      const get = desc.get
      Object.defineProperty(worker, "onmessage", {
        configurable: true,
        get: () => get.call(worker),
        set: (handler: ((event: MessageEvent) => unknown) | null) => {
          if (!handler) return set.call(worker, handler)
          set.call(worker, (event: MessageEvent) => {
            const data = typeof event.data === "string" ? event.data : ""
            const payload = data.indexOf('"payload":{')
            const at = payload === -1 ? -1 : data.indexOf('"type":"', payload)
            const type = at === -1 ? "rpc" : data.slice(at + 8, data.indexOf('"', at + 8))
            const delta = type === "message.part.delta" ? (JSON.parse(data).data?.payload?.properties?.delta?.length ?? 0) : 0
            if (!pendingSince) pendingSince = now()
            deltaChars += delta
            const t = now()
            const start = performance.now()
            const result = handler.call(worker, event)
            log({ k: "msg", t, type, d: performance.now() - start, bytes: data.length, delta })
            return result
          })
        },
      })
      return worker
    },
  })

  // Attach mode reads `/global/event` over SSE instead of worker messages: tee it and log each
  // event as a `msg` row (no handler time).
  const nativeFetch = globalThis.fetch
  const teed = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const res = await nativeFetch(input, init)
    if (!/\/global\/event(\?|$)/.test(url) || !res.body) return res
    const [mine, theirs] = res.body.tee()
    void (async () => {
      const reader = mine.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        buffer += decoder.decode(chunk.value, { stream: true })
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.startsWith("data:")) continue
          const event = JSON.parse(line.slice(5)) as { payload?: { type?: string; properties?: { delta?: string } } }
          const type = event.payload?.type ?? "unknown"
          const delta = type === "message.part.delta" ? (event.payload?.properties?.delta?.length ?? 0) : 0
          if (!pendingSince) pendingSince = now()
          deltaChars += delta
          log({ k: "msg", t: now(), type, d: 0, bytes: line.length, delta, sse: true })
        }
      }
    })()
    return new Response(theirs, { status: res.status, statusText: res.statusText, headers: res.headers })
  }
  Object.assign(globalThis, { fetch: Object.assign(teed, { preconnect: nativeFetch.preconnect }) })

  // sdk.tsx coalesces events that arrive within 16 ms of the last flush on a 16 ms timer.
  const nativeSetTimeout = globalThis.setTimeout
  Object.assign(globalThis, {
    setTimeout: Object.assign(
      (fn: TimerHandler, delay?: number, ...args: unknown[]) => {
        if (delay !== 16 || typeof fn !== "function" || !fn.toString().includes("flushEpoch"))
          return nativeSetTimeout(fn, delay, ...args)
        return nativeSetTimeout(
          (...inner: unknown[]) => {
            const t = now()
            const start = performance.now()
            fn(...inner)
            log({ k: "flush", t, d: performance.now() - start })
          },
          delay,
          ...args,
        )
      },
      nativeSetTimeout,
    ),
  })

  type Proto = Record<string, unknown> & { prototype: Record<string, unknown> }
  // `_shownContent` is the source text the text buffer shows (oc's OpenTUI patch,
  // `patches/@opentui%2Fcore@0.5.14.patch`).
  type Code = {
    _content: string
    _shownContent: string
    _filetype?: string
    _shouldRenderTextBuffer: boolean
    _highlightSnapshotId: number
    isDestroyed: boolean
    id: string
  }
  const live = new Map<Code, number>()

  const patch = (mod: Record<string, Proto>) => {
    const Renderer = mod.CliRenderer
    const Markdown = mod.MarkdownRenderable
    const CodeRenderable = mod.CodeRenderable
    const TreeSitter = mod.TreeSitterClient
    if (!Renderer || !Markdown || !CodeRenderable || !TreeSitter) {
      log({ k: "error", t: now(), message: "OpenTUI exports missing" })
      return
    }

    const loop = Renderer.prototype.loop as (this: Record<string, any>) => Promise<void>
    const renderNative = Renderer.prototype.renderNative as (this: unknown) => unknown
    let nativeMs = 0
    let rootMs = 0
    let layoutMs = 0
    Renderer.prototype.renderNative = function (this: unknown) {
      const start = performance.now()
      const status = renderNative.call(this)
      nativeMs = performance.now() - start
      return status
    }
    Renderer.prototype.loop = async function (this: Record<string, any>) {
      if (this.rendering || this._isDestroyed) return loop.call(this)
      const root = this.root
      if (root && !root.__ocStream) {
        root.__ocStream = true
        const render = root.render
        const layout = root.calculateLayout
        root.render = function (...args: unknown[]) {
          const start = performance.now()
          render.apply(this, args)
          rootMs = performance.now() - start
        }
        root.calculateLayout = function (...args: unknown[]) {
          const start = performance.now()
          layout.apply(this, args)
          layoutMs += performance.now() - start
        }
      }
      nativeMs = 0
      rootMs = 0
      layoutMs = 0
      const waited = pendingSince
      const chars = deltaChars
      pendingSince = 0
      deltaChars = 0
      const t = now()
      const start = performance.now()
      await loop.call(this)
      const d = performance.now() - start
      const stats = this.getNativeStats?.() as { cellsUpdated?: number; nativeStdoutWriteTime?: number } | undefined
      let codeLag = 0
      let codeShown = 0
      let codeHidden = 0
      for (const [code, at] of live) {
        if (code.isDestroyed || t - at > 3000) {
          live.delete(code)
          continue
        }
        if (code._filetype === "markdown") continue
        const shown = code._shouldRenderTextBuffer ? code._shownContent.length : 0
        codeLag = Math.max(codeLag, code._content.length - shown)
        codeShown += shown
        if (!code._shouldRenderTextBuffer) codeHidden++
      }
      log({
        k: "frame",
        t,
        d,
        rootMs,
        layoutMs,
        nativeMs,
        writeMs: stats?.nativeStdoutWriteTime,
        cells: stats?.cellsUpdated,
        waited: waited ? t - waited : null,
        chars,
        codeLag,
        codeShown,
        codeHidden,
        live: this._isRunning === true,
      })
    }

    // Terminal title and raw escape writes (OSC title, progress, user vars) cost the terminal a
    // tab-bar redraw each, even when the value is unchanged.
    for (const name of ["setTerminalTitle", "writeOut"]) {
      const orig = Renderer.prototype[name] as (this: unknown, value: string) => unknown
      Renderer.prototype[name] = function (this: unknown, value: string) {
        log({ k: "osc", t: now(), fn: name, value: String(value).slice(0, 60) })
        return orig.call(this, value)
      }
    }

    const md = Object.getOwnPropertyDescriptor(Markdown.prototype, "content")!
    Object.defineProperty(Markdown.prototype, "content", {
      configurable: true,
      get: md.get,
      set(this: { _blockStates: unknown[]; _streaming: boolean; id: string }, value: string) {
        const start = performance.now()
        md.set!.call(this, value)
        log({
          k: "md",
          t: now(),
          d: performance.now() - start,
          len: value.length,
          blocks: this._blockStates.length,
          streaming: this._streaming,
          id: this.id,
        })
      },
    })

    const code = Object.getOwnPropertyDescriptor(CodeRenderable.prototype, "content")!
    Object.defineProperty(CodeRenderable.prototype, "content", {
      configurable: true,
      get: code.get,
      set(this: Code, value: string) {
        const changed = this._content !== value
        const start = performance.now()
        code.set!.call(this, value)
        if (!changed) return
        live.set(this, now())
        if (this._filetype === "markdown") return
        log({ k: "code", t: now(), d: performance.now() - start, len: value.length, ft: this._filetype, id: this.id })
      },
    })

    const startHighlight = CodeRenderable.prototype.startHighlight as (this: Code) => Promise<void>
    CodeRenderable.prototype.startHighlight = function (this: Code) {
      const t = now()
      const start = performance.now()
      const len = this._content.length
      const pending = startHighlight.call(this)
      const id = this._highlightSnapshotId
      return pending.then(() => {
        log({
          k: "hl",
          t,
          d: performance.now() - start,
          len,
          ft: this._filetype,
          applied: !this.isDestroyed && this._highlightSnapshotId === id,
        })
      })
    }

    const highlightOnce = TreeSitter.prototype.highlightOnce as (
      this: unknown,
      content: string,
      filetype: string,
    ) => Promise<unknown>
    TreeSitter.prototype.highlightOnce = function (this: unknown, content: string, filetype: string) {
      const t = now()
      const start = performance.now()
      return highlightOnce.call(this, content, filetype).then((result) => {
        log({ k: "ts", t, d: performance.now() - start, len: content.length, ft: filetype })
        return result
      })
    }
    log({ k: "ready", t: now() })
  }

  // The TUI loads OpenTUI from the tui package; it resolves to the same module instance.
  await import(path.resolve(import.meta.dir, "../../../tui/node_modules/@opentui/core/index.bun.js"))
    .then((mod) => patch(mod as unknown as Record<string, Proto>))
    .catch((error) => log({ k: "error", t: now(), message: String(error) }))
}
