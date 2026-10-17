import { createEffect, createSignal, onCleanup, untrack, type Accessor } from "solid-js"

const _TICK_MS = 33

// Beta `smooth_streaming`: while a part streams, reveal its text at a steady pace instead of in
// provider bursts. Each 33 ms tick shows a quarter of the unrevealed text (at least one char),
// so the display trails arrival by about four ticks. Off or done: the full text at once. Text
// already present when the part mounts, or when the setting turns on, shows at once.
export function smoothText(text: Accessor<string>, done: Accessor<boolean>, enabled: Accessor<boolean>) {
  const [shown, setShown] = createSignal(untrack(text).length)
  let timer: ReturnType<typeof setInterval> | undefined
  const stop = () => {
    clearInterval(timer)
    timer = undefined
  }
  const tick = () => {
    const backlog = text().length - shown()
    if (backlog <= 0) return stop()
    setShown(shown() + Math.max(1, Math.ceil(backlog / 4)))
  }
  createEffect(() => {
    const length = text().length
    if (!enabled() || done()) {
      stop()
      setShown(length)
      return
    }
    // A shorter rewrite (title extraction, trims) must not leave newer text revealed early.
    if (untrack(shown) > length) setShown(length)
    if (!timer && untrack(shown) < length) timer = setInterval(tick, _TICK_MS)
  })
  onCleanup(stop)
  return () => (enabled() && !done() ? text().slice(0, shown()) : text())
}
