// P10 reply bodies and delta pacing. Seeded, so before/after runs stream identical text on the
// same schedule. Pacing models a fast Claude stream: small token-sized deltas every ~15-30 ms,
// network bursts that land several deltas at once, and rare longer pauses.

export function rng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const WORDS =
  "the session reply stream renders each token as it arrives while the worker keeps the store in sync and the terminal paints only changed cells so a long answer should feel calm steady and quick even when the model sends many small pieces in a row because people read at a pace far slower than the network delivers text and any visible stutter breaks that reading flow"
    .split(" ")

function sentence(random: () => number) {
  const length = 8 + Math.floor(random() * 14)
  const words = Array.from({ length }, () => WORDS[Math.floor(random() * WORDS.length)])
  if (random() < 0.25) words[Math.floor(random() * length)] = `\`${WORDS[Math.floor(random() * WORDS.length)]}()\``
  if (random() < 0.2) words[Math.floor(random() * length)] = `**${WORDS[Math.floor(random() * WORDS.length)]}**`
  const text = words.join(" ")
  return text[0].toUpperCase() + text.slice(1) + "."
}

function paragraph(random: () => number) {
  return Array.from({ length: 3 + Math.floor(random() * 4) }, () => sentence(random)).join(" ")
}

function tsBlock(random: () => number, lines: number) {
  const body = Array.from({ length: lines }, (_, i) => {
    const pick = i % 6
    if (pick === 0) return `export function step${i}(input: Record<string, number>) {`
    if (pick === 1) return `  const value = input["key${i}"] ?? ${Math.floor(random() * 100)}`
    if (pick === 2) return `  if (value > ${Math.floor(random() * 50)}) return { ok: true, value, label: "item ${i}" }`
    if (pick === 3) return `  // keeps the result stable when the input is empty`
    if (pick === 4) return `  return { ok: false, value: Math.max(0, value - ${i}), label: \`fallback \${value}\` }`
    return "}"
  })
  return "```typescript\n" + body.join("\n") + "\n```"
}

function shellBlock(lines: number) {
  return (
    "```bash\n" +
    Array.from({ length: lines }, (_, i) => `bun test ./test/session/case${i}.test.ts --timeout 30000`).join("\n") +
    "\n```"
  )
}

function table(random: () => number) {
  const rows = Array.from(
    { length: 6 },
    (_, i) => `| \`step${i}\` | ${Math.floor(random() * 900)} ms | ${sentence(random).slice(0, 40)} | yes |`,
  )
  return ["| Step | Time | Note | Done |", "|---|---|---|---|", ...rows].join("\n")
}

export function prose(seed: number) {
  const random = rng(seed)
  return Array.from({ length: 9 }, () => paragraph(random)).join("\n\n")
}

export function mixed(seed: number) {
  const random = rng(seed)
  const bullets = Array.from({ length: 8 }, () => `- ${sentence(random)}`).join("\n")
  const steps = Array.from({ length: 5 }, (_, i) => `${i + 1}. ${sentence(random)}`).join("\n")
  return [
    "## Findings",
    paragraph(random),
    bullets,
    "### Proposed change",
    paragraph(random),
    tsBlock(random, 45),
    paragraph(random),
    table(random),
    "### Steps",
    steps,
    shellBlock(12),
    paragraph(random),
    paragraph(random),
  ].join("\n\n")
}

export function code(seed: number) {
  const random = rng(seed)
  return [paragraph(random), tsBlock(random, 160), sentence(random)].join("\n\n")
}

export function short(seed: number) {
  const random = rng(seed)
  return [`### Note ${seed}`, paragraph(random), `- ${sentence(random)}`, `- ${sentence(random)}`].join("\n\n")
}

/** Splits text into token-sized deltas (2-14 chars). */
export function deltas(text: string, seed: number) {
  const random = rng(seed)
  const out: string[] = []
  for (let i = 0; i < text.length; ) {
    const size = 2 + Math.floor(random() * 13)
    out.push(text.slice(i, i + size))
    i += size
  }
  return out
}

/** Delay in ms before each delta: steady 14-30 ms, bursts of 3-8 at once, rare 150-400 ms pauses. */
export function schedule(count: number, seed: number) {
  const random = rng(seed)
  const out: number[] = []
  while (out.length < count) {
    const roll = random()
    if (roll < 0.1) {
      out.push(40 + Math.floor(random() * 60))
      for (let i = 2 + Math.floor(random() * 6); i > 0; i--) out.push(0)
      continue
    }
    if (roll < 0.13) {
      out.push(150 + Math.floor(random() * 250))
      continue
    }
    out.push(14 + Math.floor(random() * 17))
  }
  return out.slice(0, count)
}
