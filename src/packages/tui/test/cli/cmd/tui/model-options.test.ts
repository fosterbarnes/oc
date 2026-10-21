import { describe, expect, test } from "bun:test"
import { prioritizeFavorites, sortModelOptions } from "../../../../src/component/dialog-model"

describe("prioritizeFavorites", () => {
  test("moves favorites first while keeping the existing order", () => {
    const prioritized = prioritizeFavorites([
      { title: "Best match", favorite: false },
      { title: "Favorite match", favorite: true },
      { title: "Second best match", favorite: false },
      { title: "Second favorite match", favorite: true },
    ])

    expect(prioritized.map((model) => model.title)).toEqual([
      "Favorite match",
      "Second favorite match",
      "Best match",
      "Second best match",
    ])
  })
})

describe("sortModelOptions", () => {
  test("orders provider-scoped model choices by newest release first", () => {
    const sorted = sortModelOptions(
      [
        { title: "GPT 5.2", releaseDate: "2025-12-11" },
        { title: "GPT 5.4", releaseDate: "2026-03-05" },
        { title: "GPT 5.1", releaseDate: "2025-11-13" },
      ],
      true,
    )

    expect(sorted.map((model) => model.title)).toEqual(["GPT 5.4", "GPT 5.2", "GPT 5.1"])
  })

  test("orders regular model choices free-first and then newest-first", () => {
    const sorted = sortModelOptions(
      [
        { title: "GLM 5", releaseDate: "2025-07-28" },
        { title: "GLM 5.1", releaseDate: "2025-12-09" },
        { title: "GLM 5.2", releaseDate: "2026-02-16" },
        { title: "Free old", releaseDate: "2024-01-01", footer: "Free" },
        { title: "Free new", releaseDate: "2025-01-01", footer: "Free" },
      ],
      false,
    )

    expect(sorted.map((model) => model.title)).toEqual(["Free new", "Free old", "GLM 5.2", "GLM 5.1", "GLM 5"])
  })
})
