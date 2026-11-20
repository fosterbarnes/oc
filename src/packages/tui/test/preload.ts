import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// `persistTuiSetting` writes the global tui.json: keep tests off the real config folder.
// Must run before any module reads `Global.Path.config` (it is fixed at import).
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-tui-test-"))
process.env["XDG_CONFIG_HOME"] = path.join(dir, "config")
process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }))
