import { createSimpleContext } from "./helper"
import type { PromptRef } from "../component/prompt"
import { createSignal } from "solid-js"

export const { use: usePromptRef, provider: PromptRefProvider } = createSimpleContext({
  name: "PromptRef",
  init: () => {
    let current: PromptRef | undefined
    let epoch = 0
    const [focusEpoch, requestFocus] = createSignal(0)

    return {
      get current() {
        return current
      },
      get epoch() {
        return epoch
      },
      focusEpoch,
      requestFocus() {
        requestFocus((value) => value + 1)
      },
      set(ref: PromptRef | undefined) {
        // stale renderable protection: ignore destroyed refs
        if (ref && (ref as unknown as { isDestroyed?: boolean }).isDestroyed) return
        if (current !== ref) epoch++
        current = ref
      },
      bump() {
        epoch++
      },
    }
  },
})
