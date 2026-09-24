#!/usr/bin/env bun
import { readFileSync } from "node:fs"
import { checkCursorPricingCoverage, CURSOR_UNPRICED_MODEL_IDS } from "../src/provider/cursor/pricing.js"

const fileIndex = process.argv.indexOf("--models-file")
const file =
  fileIndex === -1
    ? new URL("../test/fixtures/cursor-pricing-models.txt", import.meta.url)
    : process.argv[fileIndex + 1]!
const ids = readFileSync(file, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
const coverage = checkCursorPricingCoverage(ids)
console.log(
  `Checked ${ids.length} Cursor wire model ids; covered ${coverage.priced.length}; missing ${coverage.missing.length}`,
)
if (coverage.missing.length) {
  console.error(coverage.missing.join("\n"))
  process.exit(1)
}
console.log(`Intentionally unpriced: ${CURSOR_UNPRICED_MODEL_IDS.join(", ")}`)
