// Config `time.timezone`: "auto" or an IANA id. Bun applies a runtime `TZ` change to `Date` and
// `Intl.DateTimeFormat` process-wide, but only when the main thread writes it (a worker's write is
// ignored), so the server and the TUI both call this. `toLocale*String` keeps the startup zone; format
// through `Intl.DateTimeFormat` instead.
const _START_TZ = process.env.TZ
const _ZONES = new Set(Intl.supportedValuesOf("timeZone"))

// The zone "auto" resolves to, captured before any override.
export const SYSTEM_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

export function applyTimeZone(zone: string | undefined) {
  if (zone && zone !== "auto" && _ZONES.has(zone)) {
    process.env.TZ = zone
    return
  }
  if (_START_TZ === undefined) delete process.env.TZ
  else process.env.TZ = _START_TZ
}
