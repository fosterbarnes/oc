import assert from "node:assert/strict"
import { once } from "node:events"
import { PassThrough } from "node:stream"
import test from "node:test"
import { forwardData } from "../main.mjs"

test("forwardData preserves ordered data and closes the destination", async () => {
  const source = new PassThrough()
  const destination = new PassThrough()
  const chunks = []
  destination.on("data", (chunk) => chunks.push(chunk))
  forwardData(source, destination, { end: true })

  const ended = once(destination, "end")
  source.end(Buffer.from("cursor"))
  await ended

  assert.equal(Buffer.concat(chunks).toString(), "cursor")
})
