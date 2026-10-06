import { expect, test } from "bun:test"
import { orderSlashFavorites } from "../../src/component/prompt/autocomplete"

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
