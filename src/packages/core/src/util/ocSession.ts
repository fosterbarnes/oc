import fs from "fs/promises"
import path from "path"

// Shared by `session bootstrap`, the launcher, and the TUI New session picker.
export async function writeSidebar(directory: string) {
  const configDirectory = path.join(directory, ".config")
  const sidebarPath = path.join(configDirectory, "openSidebar.json")
  await fs.mkdir(configDirectory, { recursive: true })

  const settings = (
    (await Bun.file(sidebarPath).exists()) ? JSON.parse(await Bun.file(sidebarPath).text()) : {}
  ) as Record<string, unknown>
  if (settings === null || Array.isArray(settings) || typeof settings !== "object") {
    throw new Error("sidebar config must contain a JSON object")
  }
  settings.projectDirectory = directory

  const temporary = `${sidebarPath}.tmp-${process.pid}`
  try {
    await Bun.write(temporary, `${JSON.stringify(settings, null, 2)}\n`)
    await fs.rename(temporary, sidebarPath)
  } finally {
    await fs.rm(temporary, { force: true })
  }
}

// `crow`, then `crow1`, `crow2`, ... based on existing root session titles.
export function nextProjectTitle(titles: string[], directory: string) {
  const baseTitle = path.basename(directory) || directory
  const pattern = new RegExp(`^${baseTitle.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\d*$`)
  const numbers = titles.flatMap((title) => {
    if (!pattern.test(title)) return []
    if (title === baseTitle) return [0]
    return [Number(title.slice(baseTitle.length))]
  })
  return numbers.length === 0 ? baseTitle : `${baseTitle}${Math.max(...numbers) + 1}`
}
