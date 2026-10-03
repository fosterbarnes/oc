const SQUARES = [
  { square: "🟥", rgb: [220, 50, 47] },
  { square: "🟧", rgb: [245, 130, 32] },
  { square: "🟨", rgb: [255, 220, 50] },
  { square: "🟩", rgb: [60, 170, 80] },
  { square: "🟦", rgb: [45, 110, 220] },
  { square: "🟪", rgb: [150, 70, 190] },
  { square: "🟫", rgb: [140, 90, 55] },
  { square: "⬛", rgb: [0, 0, 0] },
  { square: "⬜", rgb: [255, 255, 255] },
] as const

// Emoji artwork varies by terminal; compare against representative 8-bit RGB colors.
export function nearestAgentSquare(rgb: readonly [number, number, number]) {
  const distance = (color: (typeof SQUARES)[number]) =>
    color.rgb.reduce<number>((sum, channel, index) => sum + (channel - rgb[index]) ** 2, 0)
  return SQUARES.reduce((nearest, color) =>
    distance(color) < distance(nearest) ? color : nearest,
  ).square
}
