// Dependency-free Knight Rider scanner math, shared by the prompt spinner (`ui/spinner.ts`) and the
// startup intro (`logo.ts`), which the launcher loads before any renderer exists.

export interface ScannerOptions {
  trailLength: number
  direction?: "forward" | "backward" | "bidirectional"
  holdFrames?: { start?: number; end?: number }
}

export interface ScannerState {
  activePosition: number
  isHolding: boolean
  holdProgress: number
  holdTotal: number
  movementProgress: number
  movementTotal: number
  isMovingForward: boolean
}

export function getScannerState(
  frameIndex: number,
  totalChars: number,
  options: Pick<ScannerOptions, "direction" | "holdFrames">,
): ScannerState {
  const { direction = "forward", holdFrames = {} } = options

  if (direction === "bidirectional") {
    const forwardFrames = totalChars
    const holdEndFrames = holdFrames.end ?? 0
    const backwardFrames = totalChars - 1

    if (frameIndex < forwardFrames) {
      // Moving forward
      return {
        activePosition: frameIndex,
        isHolding: false,
        holdProgress: 0,
        holdTotal: 0,
        movementProgress: frameIndex,
        movementTotal: forwardFrames,
        isMovingForward: true,
      }
    } else if (frameIndex < forwardFrames + holdEndFrames) {
      // Holding at end
      return {
        activePosition: totalChars - 1,
        isHolding: true,
        holdProgress: frameIndex - forwardFrames,
        holdTotal: holdEndFrames,
        movementProgress: 0,
        movementTotal: 0,
        isMovingForward: true,
      }
    } else if (frameIndex < forwardFrames + holdEndFrames + backwardFrames) {
      // Moving backward
      const backwardIndex = frameIndex - forwardFrames - holdEndFrames
      return {
        activePosition: totalChars - 2 - backwardIndex,
        isHolding: false,
        holdProgress: 0,
        holdTotal: 0,
        movementProgress: backwardIndex,
        movementTotal: backwardFrames,
        isMovingForward: false,
      }
    } else {
      // Holding at start
      return {
        activePosition: 0,
        isHolding: true,
        holdProgress: frameIndex - forwardFrames - holdEndFrames - backwardFrames,
        holdTotal: holdFrames.start ?? 0,
        movementProgress: 0,
        movementTotal: 0,
        isMovingForward: false,
      }
    }
  } else if (direction === "backward") {
    return {
      activePosition: totalChars - 1 - (frameIndex % totalChars),
      isHolding: false,
      holdProgress: 0,
      holdTotal: 0,
      movementProgress: frameIndex % totalChars,
      movementTotal: totalChars,
      isMovingForward: false,
    }
  } else {
    return {
      activePosition: frameIndex % totalChars,
      isHolding: false,
      holdProgress: 0,
      holdTotal: 0,
      movementProgress: frameIndex % totalChars,
      movementTotal: totalChars,
      isMovingForward: true,
    }
  }
}

export function calculateColorIndex(
  frameIndex: number,
  charIndex: number,
  totalChars: number,
  options: ScannerOptions,
  state?: ScannerState,
): number {
  const { trailLength } = options
  const { activePosition, isHolding, holdProgress, isMovingForward } =
    state ?? getScannerState(frameIndex, totalChars, options)

  // Calculate directional distance (positive means trailing behind)
  const directionalDistance = isMovingForward
    ? activePosition - charIndex // For forward: trail is to the left (lower indices)
    : charIndex - activePosition // For backward: trail is to the right (higher indices)

  // Handle hold frame fading: keep the lead bright, fade the trail
  if (isHolding) {
    // Shift the color index by how long we've been holding
    return directionalDistance + holdProgress
  }

  // Normal movement - show gradient trail only behind the movement direction
  if (directionalDistance > 0 && directionalDistance < trailLength) {
    return directionalDistance
  }

  // At the active position, show the brightest color
  if (directionalDistance === 0) {
    return 0
  }

  return -1
}

// Trail falloff from the head: full lead, a slightly brightened bloom, then exponential alpha decay.
export function scannerTrail(steps = 6) {
  return Array.from({ length: steps }, (_, index) => {
    if (index === 0) return { alpha: 1, brightness: 1 }
    if (index === 1) return { alpha: 0.9, brightness: 1.15 }
    return { alpha: 0.65 ** (index - 1), brightness: 1 }
  })
}

// Inactive-dot fade during holds and movement; `createKnightRiderTrail` multiplies it into the
// inactive color's alpha.
export function scannerFade(state: ScannerState, minAlpha = 0) {
  if (state.isHolding && state.holdTotal > 0)
    return Math.max(minAlpha, 1 - Math.min(state.holdProgress / state.holdTotal, 1) * (1 - minAlpha))
  if (!state.isHolding && state.movementTotal > 0)
    return minAlpha + Math.min(state.movementProgress / Math.max(1, state.movementTotal - 1), 1) * (1 - minAlpha)
  return 1
}
