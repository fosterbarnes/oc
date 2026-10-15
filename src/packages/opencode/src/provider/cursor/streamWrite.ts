import type { BidiStream } from "./transport/connect.js"
import { trace } from "./debug.js"
import { CursorTransportError, toCursorProviderError } from "./errors.js"


const streamWriteChains = new WeakMap<BidiStream, Promise<void>>()

/**
 * Keep awaited protocol writes ordered per Run stream. In particular, a large
 * KV get_blob reply must drain before another KV reply or heartbeat is queued;
 * otherwise one heartbeat observes the backlog created by dozens of ignored
 * false write() results and reports the wrong operation as the failure.
 */
export async function writeWithBackpressure(stream: BidiStream, message: Uint8Array, operation: string): Promise<void> {
  const previous = streamWriteChains.get(stream)
  const current = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(() =>
    writeWithBackpressureNow(stream, message, operation),
  )
  streamWriteChains.set(stream, current)
  try {
    await current
  } finally {
    if (streamWriteChains.get(stream) === current) streamWriteChains.delete(stream)
  }
}

async function writeWithBackpressureNow(stream: BidiStream, message: Uint8Array, operation: string): Promise<void> {
  let accepted: boolean | void
  try {
    accepted = stream.write(message)
  } catch (cause) {
    throw toCursorProviderError(cause, {
      replaySafe: false,
      fallback: `Cursor ${operation} write failed`,
    })
  }
  if (accepted !== false) return
  trace(`stream write backpressured: operation=${operation} bytes=${message.length}`)
  if (!stream.waitForDrain) {
    throw new CursorTransportError(`Cursor ${operation} write was backpressured`, {
      transient: false,
      replaySafe: false,
      code: "CURSOR_WRITE_BACKPRESSURE",
    })
  }
  try {
    await stream.waitForDrain(5_000)
    trace(`stream write drained: operation=${operation} bytes=${message.length}`)
  } catch (cause) {
    throw toCursorProviderError(cause, {
      replaySafe: false,
      fallback: `Cursor ${operation} backpressure drain failed`,
    })
  }
}
