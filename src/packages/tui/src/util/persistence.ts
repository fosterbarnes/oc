import path from "path"
import { appendFile, mkdir, rename, rm } from "fs/promises"

export function readText(filePath: string) {
  return Bun.file(filePath).text()
}

export function readJson<T>(filePath: string) {
  return Bun.file(filePath).json() as Promise<T>
}

export async function writeText(filePath: string, content: string) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await Bun.write(filePath, content)
}

export async function appendText(filePath: string, content: string) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await appendFile(filePath, content)
}

// Windows rename fails with EPERM when two renames onto the same file overlap, so writes to one
// path run one after another. The snapshot is taken at call time; the last call wins.
const _writes = new Map<string, Promise<unknown>>()

export function writeJsonAtomic(filePath: string, value: unknown) {
  const json = JSON.stringify(value)
  const next = (_writes.get(filePath) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => writeNow(filePath, json))
  _writes.set(filePath, next)
  void next.finally(() => {
    if (_writes.get(filePath) === next) _writes.delete(filePath)
  }).catch(() => undefined)
  return next
}

async function writeNow(filePath: string, json: string) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`
  await Bun.write(temporary, json).catch(async (error) => {
    await rm(temporary, { force: true }).catch(() => undefined)
    throw error
  })
  await rename(temporary, filePath).catch(async (error) => {
    await rm(temporary, { force: true }).catch(() => undefined)
    throw error
  })
}
