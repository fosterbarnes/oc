import type { ColorInput } from "@opentui/core"
import { RGBA } from "@opentui/core"
import type { ColorGenerator } from "opentui-spinner"
import {
  calculateColorIndex,
  getScannerState,
  scannerFade,
  scannerTrail,
  type ScannerOptions,
  type ScannerState,
} from "./scanner"

interface AdvancedGradientOptions extends ScannerOptions {
  colors: ColorInput[]
  defaultColor?: ColorInput
  enableFading?: boolean
  minAlpha?: number
}

function createKnightRiderTrail(options: AdvancedGradientOptions): ColorGenerator {
  const { colors, defaultColor, enableFading = true, minAlpha = 0 } = options

  // Use the provided defaultColor if it's an RGBA instance, otherwise convert/default
  // We use RGBA.fromHex for the fallback to ensure we have an RGBA object.
  // Note: If defaultColor is a string, we convert it once here.
  const defaultRgba = defaultColor instanceof RGBA ? defaultColor : RGBA.fromHex((defaultColor as string) || "#000000")

  // Store the base alpha from the inactive factor
  const baseInactiveAlpha = defaultRgba.a

  let cachedFrameIndex = -1
  let cachedState: ScannerState | null = null

  return (frameIndex: number, charIndex: number, _totalFrames: number, totalChars: number) => {
    if (frameIndex !== cachedFrameIndex) {
      cachedFrameIndex = frameIndex
      cachedState = getScannerState(frameIndex, totalChars, options)
    }

    const state = cachedState!

    const index = calculateColorIndex(frameIndex, charIndex, totalChars, options, state)

    // Combine base inactive alpha with the fade factor
    // This ensures inactiveFactor is respected while still allowing fading animation
    defaultRgba.a = baseInactiveAlpha * (enableFading ? scannerFade(state, minAlpha) : 1)

    if (index === -1) {
      return defaultRgba
    }

    return colors[index] ?? defaultRgba
  }
}

/**
 * Derives a gradient of tail colors from a single bright color using alpha falloff
 * @param brightColor The brightest color (center/head of the scanner)
 * @param steps Number of gradient steps (default: 6)
 * @returns Array of RGBA colors with alpha-based trail fade (background-independent)
 */
export function deriveTrailColors(brightColor: ColorInput, steps: number = 6): RGBA[] {
  const baseRgba = brightColor instanceof RGBA ? brightColor : RGBA.fromHex(brightColor as string)

  return scannerTrail(steps).map((level) =>
    RGBA.fromValues(
      Math.min(1.0, baseRgba.r * level.brightness),
      Math.min(1.0, baseRgba.g * level.brightness),
      Math.min(1.0, baseRgba.b * level.brightness),
      level.alpha,
    ),
  )
}

/**
 * Derives the inactive/default color from a bright color using alpha
 * @param brightColor The brightest color (center/head of the scanner)
 * @param factor Alpha factor for inactive color (default: 0.2, range: 0-1)
 * @returns The same color with reduced alpha for background-independent dimming
 */
export function deriveInactiveColor(brightColor: ColorInput, factor: number = 0.2): RGBA {
  const baseRgba = brightColor instanceof RGBA ? brightColor : RGBA.fromHex(brightColor as string)

  // Use the full color brightness but adjust alpha for background-independent dimming
  return RGBA.fromValues(baseRgba.r, baseRgba.g, baseRgba.b, factor)
}

export type KnightRiderStyle = "blocks" | "diamonds"

export interface KnightRiderOptions {
  width?: number
  style?: KnightRiderStyle
  holdStart?: number
  holdEnd?: number
  colors?: ColorInput[]
  /** Single color to derive trail from (alternative to providing colors array) */
  color?: ColorInput
  /** Number of trail steps when using single color (default: 6) */
  trailSteps?: number
  defaultColor?: ColorInput
  /** Alpha factor for inactive color when using single color (default: 0.2, range: 0-1) */
  inactiveFactor?: number
  /** Enable fading of inactive dots during hold and movement (default: true) */
  enableFading?: boolean
  /** Minimum alpha value when fading (default: 0, range: 0-1) */
  minAlpha?: number
}

/**
 * Creates frame strings for a Knight Rider style scanner animation
 * @param options Configuration options for the Knight Rider effect
 * @returns Array of frame strings
 */
export function createFrames(options: KnightRiderOptions = {}): string[] {
  const width = options.width ?? 8
  const style = options.style ?? "diamonds"
  const holdStart = options.holdStart ?? 30
  const holdEnd = options.holdEnd ?? 9

  const colors =
    options.colors ??
    (options.color
      ? deriveTrailColors(options.color, options.trailSteps)
      : [
          RGBA.fromHex("#ff0000"), // Brightest Red (Center)
          RGBA.fromHex("#ff5555"), // Glare/Bloom
          RGBA.fromHex("#dd0000"), // Trail 1
          RGBA.fromHex("#aa0000"), // Trail 2
          RGBA.fromHex("#770000"), // Trail 3
          RGBA.fromHex("#440000"), // Trail 4
        ])

  const defaultColor =
    options.defaultColor ??
    (options.color ? deriveInactiveColor(options.color, options.inactiveFactor) : RGBA.fromHex("#330000"))

  const trailOptions = {
    colors,
    trailLength: colors.length,
    defaultColor,
    direction: "bidirectional" as const,
    holdFrames: { start: holdStart, end: holdEnd },
    enableFading: options.enableFading,
    minAlpha: options.minAlpha,
  }

  // Bidirectional cycle: Forward (width) + Hold End + Backward (width-1) + Hold Start
  const totalFrames = width + holdEnd + (width - 1) + holdStart

  // Generate dynamic frames where inactive pixels are dots and active ones are blocks
  const frames = Array.from({ length: totalFrames }, (_, frameIndex) => {
    return Array.from({ length: width }, (_, charIndex) => {
      const index = calculateColorIndex(frameIndex, charIndex, width, trailOptions)

      if (style === "diamonds") {
        const shapes = ["⬥", "◆", "⬩", "⬪"]
        if (index >= 0 && index < trailOptions.colors.length) {
          return shapes[Math.min(index, shapes.length - 1)]
        }
        return "·"
      }

      // Default to blocks
      // It's active if we have a valid color index that is within our colors array
      const isActive = index >= 0 && index < trailOptions.colors.length
      return isActive ? "■" : "⬝"
    }).join("")
  })

  return frames
}

/**
 * Creates a color generator function for Knight Rider style scanner animation
 * @param options Configuration options for the Knight Rider effect
 * @returns ColorGenerator function
 */
export function createColors(options: KnightRiderOptions = {}): ColorGenerator {
  const holdStart = options.holdStart ?? 30
  const holdEnd = options.holdEnd ?? 9

  const colors =
    options.colors ??
    (options.color
      ? deriveTrailColors(options.color, options.trailSteps)
      : [
          RGBA.fromHex("#ff0000"), // Brightest Red (Center)
          RGBA.fromHex("#ff5555"), // Glare/Bloom
          RGBA.fromHex("#dd0000"), // Trail 1
          RGBA.fromHex("#aa0000"), // Trail 2
          RGBA.fromHex("#770000"), // Trail 3
          RGBA.fromHex("#440000"), // Trail 4
        ])

  const defaultColor =
    options.defaultColor ??
    (options.color ? deriveInactiveColor(options.color, options.inactiveFactor) : RGBA.fromHex("#330000"))

  const trailOptions = {
    colors,
    trailLength: colors.length,
    defaultColor,
    direction: "bidirectional" as const,
    holdFrames: { start: holdStart, end: holdEnd },
    enableFading: options.enableFading,
    minAlpha: options.minAlpha,
  }

  return createKnightRiderTrail(trailOptions)
}
