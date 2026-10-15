// Readers for decoded protobuf/JSON field values shared by the Cursor exec translators.

export function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined
}

export function stringValue(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined
}

export function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  return undefined
}
