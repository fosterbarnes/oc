import fs from "node:fs/promises"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { onCleanup } from "solid-js"
import { useDialog } from "./ui/dialog"
import { DialogAlert } from "./ui/dialog-alert"
import { useToast } from "./ui/toast"

// OpenCode Zen promos. The pricing page is the only source that labels them ("GLM 5.3 (60% off)",
// "... free on OpenCode for a limited time"); the model catalogs have prices but no promo flag.
// Plan: ~/.config/opencode/plans/2026-11-25-zenDealsTracker.md.
const _PAGE = "https://opencode.ai/docs/console/models/"
const _PRICING_TABLE = 'aria-label="Console model pricing"'
const _FILE = path.join(Global.Path.state, "zen-deals.json")
const _FIRST_CHECK_MS = 60_000
const _CHECK_MS = 60 * 60_000

export type ZenDeal = { name: string; detail: string }

// undefined when the page no longer has the pricing table, so a layout change never reads as
// "every deal ended".
export function parseZenDeals(html: string): ZenDeal[] | undefined {
  if (!html.includes(_PRICING_TABLE)) return undefined
  const ends = new Map<string, string>()
  const endNotes = html.matchAll(/<strong>([^<]+):<\/strong> The \d+% discount applies through ([^<]+?)\./g)
  for (const [, names, until] of endNotes) {
    for (const name of names.split(/,\s*(?:and\s+)?|\s+and\s+/)) ends.set(name.trim(), until)
  }
  const deals = new Map<string, string>()
  for (const [, name, percent] of html.matchAll(/<td>([^<]+?) \((\d+)% off\)<\/td>/g)) {
    const until = ends.get(name)
    deals.set(name, until ? `${percent}% off until ${until}` : `${percent}% off`)
  }
  for (const [, name] of html.matchAll(/<li>([^<]+?) is [^<]*?for a limited time/g)) deals.set(name, "free")
  return [...deals].map(([name, detail]) => ({ name, detail }))
}

// A changed percent or end date counts as a new deal; a name gone from the page counts as ended.
export function diffZenDeals(before: ZenDeal[], after: ZenDeal[]) {
  const key = (deal: ZenDeal) => `${deal.name}: ${deal.detail}`
  const seen = new Set(before.map(key))
  const current = new Set(after.map((deal) => deal.name))
  return {
    added: after.filter((deal) => !seen.has(key(deal))),
    ended: before.filter((deal) => !current.has(deal.name)),
  }
}

// Reads the page, saves the deals, and returns what changed since the last save. The first run
// only seeds the file, so the deals already running do not all toast at once.
// ponytail: last-writer-wins file shared by every oc window; two windows checking in the same
// instant can both toast. Add a lock if that shows up.
export async function checkZenDeals(file = _FILE) {
  const response = await fetch(_PAGE, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`Zen pricing page: HTTP ${response.status}`)
  const deals = parseZenDeals(await response.text())
  if (!deals) throw new Error("Zen pricing page layout changed; deals not read")
  const saved = await fs.readFile(file, "utf8").catch(() => undefined)
  const before = saved === undefined ? undefined : (JSON.parse(saved) as ZenDeal[])
  if (JSON.stringify(before) !== JSON.stringify(deals)) {
    const tmp = `${file}.${process.pid}.tmp`
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(tmp, JSON.stringify(deals))
    await fs.rename(tmp, file)
  }
  return { deals, ...(before ? diffZenDeals(before, deals) : { added: [], ended: [] }) }
}

export function createZenDealsCommand() {
  const toast = useToast()
  const dialog = useDialog()

  const notify = (change: { added: ZenDeal[]; ended: ZenDeal[] }) => {
    const lines = [
      ...change.added.map((deal) => `${deal.name}: ${deal.detail}`),
      ...change.ended.map((deal) => `${deal.name}: ended`),
    ]
    if (lines.length > 0)
      toast.show({ title: "Zen deals", message: lines.join("\n"), variant: "info", duration: 15_000 })
  }
  // Background checks stay quiet on failure (offline, page down); running the entry shows the error.
  const check = () => void checkZenDeals().then(notify, () => {})
  const first = setTimeout(check, _FIRST_CHECK_MS).unref()
  const timer = setInterval(check, _CHECK_MS).unref()
  onCleanup(() => {
    clearTimeout(first)
    clearInterval(timer)
  })

  return {
    name: "oc.zen_deals",
    title: "Zen deals",
    category: "oc",
    group: "Updates",
    slashName: "zenDeals",
    run: async () => {
      try {
        const result = await checkZenDeals()
        notify(result)
        const lines = result.deals.map((deal) => `${deal.name}: ${deal.detail}`)
        await DialogAlert.show(dialog, "Zen deals", lines.join("\n") || "No deals")
      } catch (error) {
        toast.error(error)
      }
    },
  }
}
