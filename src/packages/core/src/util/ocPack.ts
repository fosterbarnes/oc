// `.ocpack` export file: a gzip tar with `manifest.json` (wire items; settings keys carry their value,
// file items list their paths) and `files/<root>/<path>` holding each file's wire bytes. Import
// unpacks it in memory and runs `OcItems.compare`. Plan: docs/dev/syncPlan.md.
import os from "node:os"
import { InstallationVersion } from "../installation/version"
import { OcItems } from "./ocItems"

export const FORMAT = 1
export const EXTENSION = ".ocpack"

type PackedFile = { path: string; binary: boolean }
type PackedItem = OcItems.KeyItem | (Omit<OcItems.FilesItem, "files"> & { files: PackedFile[] })
export type Source = { name: string; os: string; ocVersion: string }
type Manifest = { format: number; created: string; source: Source; items: PackedItem[] }

export async function pack(items: readonly OcItems.Item[], file: string) {
  const wire = items.map(OcItems.toWire)
  const manifest: Manifest = {
    format: FORMAT,
    created: new Date().toISOString(),
    source: { name: os.hostname(), os: process.platform, ocVersion: InstallationVersion },
    items: wire.map((item) =>
      item.kind === "key"
        ? item
        : { ...item, files: item.files.map((entry) => ({ path: entry.path, binary: entry.text === undefined })) },
    ),
  }
  const entries: Record<string, string | Uint8Array> = { "manifest.json": JSON.stringify(manifest, null, 2) }
  for (const item of wire) {
    if (item.kind !== "files") continue
    for (const entry of item.files) {
      entries[`files/${item.root}/${entry.path}`] = entry.text ?? Buffer.from(entry.base64 ?? "", "base64")
    }
  }
  await Bun.write(file, await new Bun.Archive(entries, { compress: "gzip" }).bytes())
  return { items: wire.length, file }
}

// Reads a pack without writing anything to disk. Returns wire items for `OcItems.compare`.
export async function unpack(file: string) {
  const entries = await new Bun.Archive(await Bun.file(file).bytes()).files()
  const manifestFile = entries.get("manifest.json")
  if (!manifestFile) throw new Error(`${file} is not an oc settings file (no manifest.json)`)
  const manifest = (await manifestFile.json()) as Manifest
  if (manifest.format !== FORMAT) {
    throw new Error(`File format ${manifest.format} is from oc ${manifest.source?.ocVersion}; this oc reads ${FORMAT}`)
  }
  const items = await Promise.all(
    manifest.items.map(async (item): Promise<OcItems.Item> => {
      if (item.kind === "key") return item
      const files = await Promise.all(
        item.files.map(async (entry) => {
          const data = entries.get(`files/${item.root}/${entry.path}`)
          if (!data) throw new Error(`${file} is missing ${entry.path}`)
          return entry.binary
            ? { path: entry.path, base64: Buffer.from(await data.arrayBuffer()).toString("base64") }
            : { path: entry.path, text: await data.text() }
        }),
      )
      return { ...item, files }
    }),
  )
  return { source: manifest.source, created: manifest.created, items }
}

export * as OcPack from "./ocPack"
