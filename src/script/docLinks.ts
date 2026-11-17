#!/usr/bin/env bun
// Checks links in the fork's own docs (root *.md, docs/ except build notes, .github) and in the wiki
// clone next to the repo (../oc.wiki) when it exists: relative file links, links to this repo or its
// wiki on GitHub, wiki page links, and #anchors. Lists every broken link and exits 1 if any.
import fs from "node:fs"
import path from "node:path"

const repo = path.resolve(import.meta.dir, "../..")
const wiki = path.resolve(repo, "../oc.wiki")
const hasWiki = fs.existsSync(wiki)
const REPO_URL = /^https:\/\/github\.com\/fosterbarnes\/oc\/(?:(?:blob|tree)\/main\/([^#]*)|wiki\/?([^#]*))(?:#(.*))?$/
const anchorCache = new Map<string, Set<string>>()

const docs = [
  // One pattern each: Bun.Glob braces do not span path segments.
  ...["*.md", "docs/**/*.md", ".github/**/*.md"]
    .flatMap((pattern) => Array.from(new Bun.Glob(pattern).scanSync({ cwd: repo, dot: true })))
    .filter((file) => !file.startsWith("docs/buildNotes/"))
    .map((file) => path.join(repo, file)),
  ...(hasWiki ? Array.from(new Bun.Glob("*.md").scanSync({ cwd: wiki })).map((file) => path.join(wiki, file)) : []),
]

const broken = docs.flatMap((file) =>
  Array.from(stripCode(fs.readFileSync(file, "utf8")).matchAll(/\]\(([^)\s]+)\)/g)).flatMap((match) => {
    const target = resolve(file, match[1])
    if (!target) return []
    const where = `${path.relative(path.dirname(repo), file)}: ${match[1]}`
    if (!fs.existsSync(target.file)) return [`${where} (no such file)`]
    if (target.anchor && target.file.endsWith(".md") && !anchors(target.file).has(target.anchor.toLowerCase()))
      return [`${where} (no such heading)`]
    return []
  }),
)

if (broken.length) {
  console.error(`Broken doc links:\n${broken.map((line) => `  ${line}`).join("\n")}`)
  process.exit(1)
}

function resolve(file: string, link: string): { file: string; anchor?: string } | undefined {
  const github = link.match(REPO_URL)
  if (github?.[1] !== undefined) return { file: path.join(repo, decodeURIComponent(github[1])), anchor: github[3] }
  if (github) return hasWiki ? { file: path.join(wiki, `${github[2] || "Home"}.md`), anchor: github[3] } : undefined
  if (/^[a-z]+:/i.test(link)) return undefined
  const [target, anchor] = link.split("#")
  if (!target) return { file, anchor }
  // Wiki pages link to each other by page name, without an extension.
  if (file.startsWith(wiki + path.sep) && !/[./]/.test(target)) return { file: path.join(wiki, `${target}.md`), anchor }
  // Source links may end in a :line or :line-line suffix.
  return { file: path.resolve(path.dirname(file), decodeURIComponent(target).replace(/:\d+(-\d+)?$/, "")), anchor }
}

// GitHub heading ids: lowercase, punctuation dropped, spaces to hyphens, repeats suffixed -1, -2, ...
function anchors(file: string) {
  const cached = anchorCache.get(file)
  if (cached) return cached
  const seen = new Map<string, number>()
  const ids = new Set(
    Array.from(stripFences(fs.readFileSync(file, "utf8")).matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)).map((match) => {
      const base = match[1]
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[`*]/g, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{M}\p{N}_ -]/gu, "")
        .replace(/ /g, "-")
      const count = seen.get(base) ?? 0
      seen.set(base, count + 1)
      return count ? `${base}-${count}` : base
    }),
  )
  anchorCache.set(file, ids)
  return ids
}

function stripFences(text: string) {
  return text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "")
}

function stripCode(text: string) {
  return stripFences(text).replace(/`[^`\n]*`/g, "")
}
