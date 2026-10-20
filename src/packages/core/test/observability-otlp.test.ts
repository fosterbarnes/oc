import path from "path"
import { expect, test } from "bun:test"

// Otlp reads its endpoint from Flag at import time, so the export runs in a child with the env set.
test("exports a span through the configured OTLP trace endpoint", async () => {
  const requests: unknown[] = []
  const headers: string[] = []
  const paths: string[] = []
  await using server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      paths.push(new URL(request.url).pathname)
      headers.push(request.headers.get("x-otel-test") ?? "")
      requests.push(await request.json())
      return Response.json({})
    },
  })

  const proc = Bun.spawn({
    cmd: [
      process.execPath,
      "--eval",
      `import { Effect } from "effect"
       import { Otlp } from "./src/observability/otlp.ts"
       await Effect.gen(function* () {
         const tracing = yield* Effect.promise(() => Otlp.tracingLayer())
         yield* Effect.void.pipe(Effect.withSpan("otlp-smoke"), Effect.provide(tracing))
       }).pipe(Effect.scoped, Effect.runPromise)`,
    ],
    cwd: path.join(import.meta.dir, ".."),
    env: {
      ...process.env,
      OTEL_EXPORTER_OTLP_ENDPOINT: server.url.origin,
      OTEL_EXPORTER_OTLP_HEADERS: "x-otel-test=present",
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited])

  expect(code, stderr).toBe(0)
  expect(requests).toHaveLength(1)
  expect(paths).toEqual(["/v1/traces"])
  expect(headers).toEqual(["present"])
  expect(requests[0]).toMatchObject({
    resourceSpans: [
      {
        resource: {
          attributes: expect.arrayContaining([{ key: "service.name", value: { stringValue: "opencode" } }]),
        },
        scopeSpans: [{ spans: [expect.objectContaining({ name: "otlp-smoke" })] }],
      },
    ],
  })
})
