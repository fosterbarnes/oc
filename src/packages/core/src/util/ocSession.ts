import path from "path"

// Shared by `session bootstrap`, the launcher, and the TUI New session picker.
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
