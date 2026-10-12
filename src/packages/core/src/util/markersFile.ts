import fs from "fs"
import path from "path"
import { Global } from "../global"

// Global-only on purpose: a project must never be able to add marker commands.
export function markersFile() {
  return path.join(Global.Path.config, "markers.json")
}

export const MARKERS_WARNING =
  'Command markers are ALPHA. When on, a line in an agent\'s reply that is exactly $# plus a command name runs that command from markers.json with no tool permission prompt, unless the command sets "ask". Safety depends entirely on which commands you list there.'

const TEMPLATE = `// oc command markers (ALPHA). ${MARKERS_WARNING}
// Each command: { "run": ["exe", "arg"], "mode": "inline" | "window" | "afterTurn", "description": "...", "ask": true }
// inline: output replaces the marker line. window: visible PowerShell window (Windows only). afterTurn: runs when the reply ends.
// Top-level "ask" is the default for commands without their own. Agents must not edit this file without your permission.
{
  "enabled": false,
  "ask": false,
  "commands": {}
}
`

const ENABLED = /"enabled"\s*:\s*(true|false)/

export function markersEnabled(file = markersFile()) {
  try {
    return ENABLED.exec(fs.readFileSync(file, "utf8"))?.[1] === "true"
  } catch {
    return false
  }
}

/** Flips `enabled` in place so hand-written comments and commands survive. Creates the template if missing. */
export function setMarkersEnabled(on: boolean, file = markersFile()) {
  const raw = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : TEMPLATE
  const next = ENABLED.test(raw) ? raw.replace(ENABLED, `"enabled": ${on}`) : raw.replace("{", `{\n  "enabled": ${on},`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, next)
}

export * as MarkersFile from "./markersFile"
