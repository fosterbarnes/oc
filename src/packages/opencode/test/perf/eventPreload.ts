// P6 event rate: tees the TUI's `/event` SSE fetch and logs each payload type to
// OC_PERF_LOG_DIR/sse-events.jsonl. The P6 baseline saw no events: the native TUI reaches its
// worker server without this fetch.
import { appendFileSync } from "node:fs"

const dir = process.env.OC_PERF_LOG_DIR
if (dir && process.env.OC_PERF_EVENTS === "1") {
  const file = `${dir}/sse-events.jsonl`
  const orig = globalThis.fetch
  const counted = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const res = await orig(input, init)
    if (!/\/event(\?|$)/.test(url) || !res.body) return res
    const [countStream, give] = res.body.tee()
    void (async () => {
      const reader = countStream.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        buf += decoder.decode(chunk.value, { stream: true })
        const lines = buf.split(/\r?\n/)
        buf = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.startsWith("data:")) continue
          try {
            const json = JSON.parse(line.slice(5).trim()) as { type?: string; payload?: { type?: string } }
            const type = json.payload?.type ?? json.type
            if (type) appendFileSync(file, JSON.stringify({ time: Date.now(), type }) + "\n")
          } catch {}
        }
      }
    })()
    return new Response(give, { status: res.status, statusText: res.statusText, headers: res.headers })
  }
  Object.assign(globalThis, { fetch: Object.assign(counted, { preconnect: orig.preconnect }) })
}
