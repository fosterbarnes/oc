import { expect, test } from "bun:test"
import { orderSlashFavorites, withExactSlashFirst } from "../../src/component/prompt/autocomplete"

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
  expect(withExactSlashFirst([thinking, think], [compact, think, thinking], "think")).toEqual([think, thinking])
  expect(withExactSlashFirst([thinking], [compact, think, thinking], "think")).toEqual([think, thinking])
  expect(withExactSlashFirst([thinking], [compact, thinking], "summarize")).toEqual([compact, thinking])
  expect(withExactSlashFirst([thinking, think], [think, thinking], "thin")).toEqual([thinking, think])
})
