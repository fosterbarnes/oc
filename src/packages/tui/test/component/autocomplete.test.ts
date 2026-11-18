import { expect, test } from "bun:test"
import {
  MAX_SLASH_PICKS,
  orderSlashFavorites,
  rememberSlashPick,
  rankSlashOptions,
} from "../../src/component/prompt/autocomplete"

test("slash favorites preserve alphabetical source order without duplicates or display-based identity", () => {
  const options = [
    { favoriteKey: "command:alpha", display: "/alpha:(command)  " },
    { favoriteKey: "skill:alpha", display: "/alpha:(skill)  " },
    { favoriteKey: "tui:session.new", display: "/new:(oc)  " },
    { favoriteKey: "skill:zebra", display: "/zebra:(skill)  " },
  ]
  const favorites = new Set(["skill:zebra", "skill:alpha", "tui:session.new", "skill:missing"])
  const ordered = orderSlashFavorites(options, favorites)
  expect(ordered.map((option) => option.favoriteKey)).toEqual([
    "skill:alpha",
    "tui:session.new",
    "skill:zebra",
    "command:alpha",
  ])
  expect(ordered).toHaveLength(options.length)
  expect(options[0]?.favoriteKey).toBe("command:alpha")
  expect(orderSlashFavorites(options, new Set())).toEqual(options)
  expect(orderSlashFavorites([], favorites)).toEqual([])
  expect(orderSlashFavorites(options, new Set(options.map((option) => option.favoriteKey)))).toEqual(options)
})

test("slash exact name or alias match ranks first", () => {
  const thinking = { display: "/thinking:(oc)  " }
  const think = { display: "/think:(command)  " }
  const compact = { display: "/compact:(oc)  ", aliases: ["/summarize"] }
  expect(rankSlashOptions([thinking, think], [compact, think, thinking], "think")).toEqual([think, thinking])
  expect(rankSlashOptions([thinking], [compact, think, thinking], "think")).toEqual([think, thinking])
  expect(rankSlashOptions([thinking], [compact, thinking], "summarize")).toEqual([compact, thinking])
  expect(rankSlashOptions([thinking, think], [think, thinking], "thin")).toEqual([thinking, think])
})

test("slash name beats another command's alias, then the remembered pick, then fuzzy order", () => {
  const push = { display: "/push:(command)  " }
  const agentPush = { favoriteKey: "command:agent-push", display: "/agent-push:(command)  ", aliases: ["/push"] }
  const autoDelete = { favoriteKey: "tui:auto", display: "/pushAutoDelete:(oc)  " }
  expect(rankSlashOptions([autoDelete, agentPush], [agentPush, autoDelete], "push")).toEqual([agentPush, autoDelete])
  expect(rankSlashOptions([autoDelete, agentPush, push], [agentPush, push, autoDelete], "push")).toEqual([
    push,
    autoDelete,
    agentPush,
  ])

  const redo = { favoriteKey: "tui:redo", display: "/redo:(oc)  " }
  const revive = { favoriteKey: "tui:revive", display: "/revive:(oc)  " }
  expect(rankSlashOptions([redo, revive], [redo, revive], "re", "tui:revive")).toEqual([revive, redo])
  // A pick that no longer matches (or no longer exists) is ignored.
  expect(rankSlashOptions([redo], [redo, revive], "re", "tui:revive")).toEqual([redo])
  expect(rankSlashOptions([redo, revive], [redo, revive], "re", "tui:gone")).toEqual([redo, revive])
  // Exact match and pick both lead, without duplicates.
  expect(rankSlashOptions([revive, redo], [redo, revive], "redo", "tui:revive")).toEqual([redo, revive])
  expect(rankSlashOptions([redo, revive], [redo, revive], "redo", "tui:redo")).toEqual([redo, revive])
})

test("slash picks keep the newest entry per query and cap the store", () => {
  expect(rememberSlashPick({ re: "a", pu: "b" }, "re", "c")).toEqual({ pu: "b", re: "c" })
  expect(Object.keys(rememberSlashPick({ re: "a", pu: "b" }, "re", "c"))).toEqual(["pu", "re"])
  const full = Object.fromEntries(Array.from({ length: MAX_SLASH_PICKS }, (_, i) => [`q${i}`, "k"]))
  const next = rememberSlashPick(full, "new", "k")
  expect(Object.keys(next).length).toBe(MAX_SLASH_PICKS)
  expect(next.q0).toBeUndefined()
  expect(next.new).toBe("k")
})
