import fs from "node:fs/promises"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { onCleanup } from "solid-js"
import { useKV } from "./context/kv"
import { useDialog } from "./ui/dialog"
import { DialogSelect } from "./ui/dialog-select"
import { useToast } from "./ui/toast"
import { openLink } from "./util/browser"

// OpenCode deals: posts on https://x.com/opencode (Go promos, stealth models, "N% off") plus the Zen
// pricing page, which labels pay-as-you-go discounts the post feed may not repeat.
// Plan: ~/.config/opencode/plans/2026-11-25-zenDealsTracker.md.
const _X_USER = "opencode"
// fxtwitter's public API serves the recent timeline without an X account but skips the pinned
// post; X's own embed feed has the pinned post first, then stale popular posts (cut by _POST_DAYS).
// ponytail: both are unofficial, keyless endpoints; the paid X API is the upgrade if they die.
const _FX_TIMELINE = `https://api.fxtwitter.com/2/profile/${_X_USER}/statuses`
const _X_EMBED = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${_X_USER}`
const _ZEN_PAGE = "https://opencode.ai/docs/console/models/"
const _ZEN_TABLE = 'aria-label="Console model pricing"'
const _FILE = path.join(Global.Path.state, "opencode-deals.json")
const _POST_DAYS = 30
const _FIRST_CHECK_MS = 60_000
const _CHECK_MS = 60 * 60_000
// ponytail: keyword match; a chatty non-deal post with "free" slips in. Swap for a classifier if noisy.
const _DEAL_WORDS = /\bfree\b|\d+% off|\$\d+ (?:of|for)\b|discount|cheaper|limited time|stealth/i

export type Deal = { id: string; source: "x" | "zen"; title: string; detail: string; url: string; time: number }
export type Post = { id: string; text: string; time: number; author: string; reply: boolean }

// undefined when the page no longer has the pricing table, so a layout change never reads as
// "every deal ended".
export function parseZenDeals(html: string): Deal[] | undefined {
  if (!html.includes(_ZEN_TABLE)) return undefined
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
  return [...deals].map(([name, detail]) => ({
    id: `zen:${name}`,
    source: "zen",
    title: name,
    detail,
    url: _ZEN_PAGE,
    time: 0,
  }))
}

export function parseFxPosts(json: any): Post[] {
  const results: any[] = json?.results ?? []
  return results
    .filter((post) => typeof post?.text === "string")
    .map((post) => ({
      id: post.id,
      text: post.text,
      time: post.created_timestamp * 1000,
      author: post.author?.screen_name ?? "",
      reply: Boolean(post.replying_to),
    }))
}

export function parseEmbedPosts(html: string): Post[] {
  const json = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s)?.[1]
  if (!json) return []
  const entries: any[] = JSON.parse(json)?.props?.pageProps?.timeline?.entries ?? []
  return entries
    .map((entry) => entry.content?.tweet)
    .filter((post) => typeof post?.full_text === "string" && !post.retweeted_status)
    .map((post) => ({
      id: post.id_str,
      text: post.full_text.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&"),
      time: Date.parse(post.created_at),
      author: post.user?.screen_name ?? "",
      reply: Boolean(post.in_reply_to_status_id_str),
    }))
}

function postDeal(post: Post): Deal | undefined {
  if (post.author.toLowerCase() !== _X_USER || post.reply || !_DEAL_WORDS.test(post.text)) return undefined
  const [title = "", ...rest] = post.text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  const url = `https://x.com/${_X_USER}/status/${post.id}`
  return { id: post.id, source: "x", title, detail: rest.join("\n"), url, time: post.time }
}

// Deal posts accumulate across checks (the timeline only reaches back ~20 posts) until _POST_DAYS
// old. A failed Zen read (zen undefined) keeps the saved Zen deals instead of ending them.
export function mergeDeals(saved: Deal[], zen: Deal[] | undefined, posts: Post[], now: number): Deal[] {
  const cutoff = now - _POST_DAYS * 86_400_000
  const x = new Map(saved.filter((deal) => deal.source === "x").map((deal) => [deal.id, deal]))
  for (const post of posts) {
    const deal = postDeal(post)
    if (deal) x.set(deal.id, deal)
  }
  const recent = [...x.values()].filter((deal) => deal.time >= cutoff).sort((a, b) => b.time - a.time)
  return [...recent, ...(zen ?? saved.filter((deal) => deal.source === "zen"))]
}

// A changed Zen percent or end date counts as new; only Zen deals end (old posts just age out).
export function diffDeals(before: Deal[], after: Deal[]) {
  const key = (deal: Deal) => `${deal.id}\n${deal.detail}`
  const seen = new Set(before.map(key))
  const current = new Set(after.map((deal) => deal.id))
  return {
    added: after.filter((deal) => !seen.has(key(deal))),
    ended: before.filter((deal) => deal.source === "zen" && !current.has(deal.id)),
  }
}

async function fetchText(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.text()
}

// Reads every source, saves the merged deals, and returns what changed since the last save. The
// first run only seeds the file, so the deals already running do not all toast at once.
// ponytail: last-writer-wins file shared by every oc window; two windows checking in the same
// instant can both toast. Add a lock if that shows up.
export async function checkDeals(file = _FILE) {
  const [zen, timeline, embed] = await Promise.allSettled([
    fetchText(_ZEN_PAGE).then((html) => {
      const deals = parseZenDeals(html)
      if (!deals) throw new Error("Zen pricing page layout changed")
      return deals
    }),
    fetchText(_FX_TIMELINE).then((text) => parseFxPosts(JSON.parse(text))),
    fetchText(_X_EMBED).then(parseEmbedPosts),
  ])
  const sources = { "Zen pricing": zen, "X timeline": timeline, "X pinned post": embed }
  const failed = Object.entries(sources).flatMap(([name, result]) => (result.status === "rejected" ? [name] : []))
  if (failed.length === 3) throw new Error("OpenCode deals: every source failed (offline?)")

  const saved = await fs.readFile(file, "utf8").catch(() => undefined)
  const before = saved === undefined ? undefined : (JSON.parse(saved) as Deal[])
  const posts = [timeline, embed].flatMap((result) => (result.status === "fulfilled" ? result.value : []))
  const deals = mergeDeals(before ?? [], zen.status === "fulfilled" ? zen.value : undefined, posts, Date.now())
  if (JSON.stringify(before) !== JSON.stringify(deals)) {
    const tmp = `${file}.${process.pid}.tmp`
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(tmp, JSON.stringify(deals))
    await fs.rename(tmp, file)
  }
  return { deals, failed, ...(before ? diffDeals(before, deals) : { added: [], ended: [] }) }
}

const dealLine = (deal: Deal) => (deal.source === "x" ? deal.title : `${deal.title}: ${deal.detail}`)

function DialogDeals(props: { deals: Deal[] }) {
  const kv = useKV()
  const toast = useToast()
  const date = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" })
  const options = props.deals.map((deal) => ({
    value: deal.id,
    title: dealLine(deal),
    description: deal.source === "x" ? date.format(deal.time) : undefined,
    details: deal.detail && deal.source === "x" ? deal.detail.split("\n") : undefined,
    detailsWrap: true,
    category: deal.source === "x" ? `@${_X_USER}` : "Zen pricing",
    onSelect: () => void openLink(kv, deal.url).catch(toast.error),
  }))
  return <DialogSelect title="OpenCode deals" options={options} />
}

export function createDealsCommand() {
  const toast = useToast()
  const dialog = useDialog()

  const notify = (change: { added: Deal[]; ended: Deal[] }) => {
    const lines = [...change.added.map(dealLine), ...change.ended.map((deal) => `${deal.title}: ended`)]
    if (lines.length > 0)
      toast.show({ title: "OpenCode deals", message: lines.join("\n"), variant: "info", duration: 15_000 })
  }
  // Background checks stay quiet on failure (offline, page down); running the entry shows the error.
  const check = () => void checkDeals().then(notify, () => {})
  const first = setTimeout(check, _FIRST_CHECK_MS).unref()
  const timer = setInterval(check, _CHECK_MS).unref()
  onCleanup(() => {
    clearTimeout(first)
    clearInterval(timer)
  })

  return {
    name: "oc.opencode_deals",
    title: "OpenCode deals",
    category: "oc",
    group: "Updates",
    slashName: "deals",
    run: async () => {
      try {
        const result = await checkDeals()
        notify(result)
        if (result.failed.length > 0)
          toast.show({ message: `Not read: ${result.failed.join(", ")}`, variant: "warning" })
        dialog.replace(() => <DialogDeals deals={result.deals} />)
      } catch (error) {
        toast.error(error)
      }
    },
  }
}
