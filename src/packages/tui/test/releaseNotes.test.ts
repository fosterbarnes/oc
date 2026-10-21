import { expect, test } from "bun:test"
import { releaseNotesDue } from "../src/component/dialog-release-notes"

test("release notes are due only after moving to a newer version", () => {
  expect(releaseNotesDue(undefined, "0.2.270")).toBe(false)
  expect(releaseNotesDue("0.2.270", "0.2.270")).toBe(false)
  expect(releaseNotesDue("0.2.271", "0.2.270")).toBe(false)
  expect(releaseNotesDue("0.2.269", "0.2.270")).toBe(true)
})
