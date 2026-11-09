import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { xdgCache } from "xdg-basedir"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

const modelsUrl = process.env.OPENCODE_MODELS_URL || "https://models.dev"
// Local builds reuse the copy a running oc keeps fresh (core/src/models-dev.ts), so /revive works
// offline. Release builds (Script.release) always fetch, so a stale snapshot never ships.
const cached =
  !process.env.OPENCODE_RELEASE && !process.env.OPENCODE_MODELS_URL && xdgCache
    ? path.join(xdgCache, "opencode", "models.json")
    : undefined
const cachedStat = cached ? fs.statSync(cached, { throwIfNoEntry: false }) : undefined
export const modelsData = process.env.MODELS_DEV_API_JSON
  ? await Bun.file(process.env.MODELS_DEV_API_JSON).text()
  : cached && cachedStat
    ? await Bun.file(cached).text()
    : await fetch(`${modelsUrl}/api.json`, { signal: AbortSignal.timeout(30_000) }).then((x) => {
        if (!x.ok) throw new Error(`models.dev snapshot: HTTP ${x.status}`)
        return x.text()
      })
console.log(
  `Loaded models.dev snapshot${!process.env.MODELS_DEV_API_JSON && cachedStat ? ` (cache, ${cachedStat.mtime.toISOString()})` : ""}`,
)
