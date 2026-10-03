import type { CliRenderer } from "@opentui/core"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { readFile, rm, writeFile } from "node:fs/promises"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import type { Stream } from "node:stream"
import { resolveZedDbPath, resolveZedSelection } from "./editor-zed"

type EditorStdio = "inherit" | "pipe" | "ignore" | number | Stream

export function normalizePromptContent(content: string) {
  if (content.endsWith("\r\n")) {
    const body = content.slice(0, -2)
    return !body.includes("\n") && !body.includes("\r") ? body : content
  }

  if (content.endsWith("\n")) {
    const body = content.slice(0, -1)
    return !body.includes("\n") && !body.includes("\r") ? body : content
  }

  return content
}

export function parseEditorCommand(editor: string) {
  const parts = editor.split(" ").filter((part) => part.length > 0)
  return { command: parts[0]!, args: parts.slice(1) }
}

export function editorLaunchSpec(editor: string, filePath: string) {
  const parsed = parseEditorCommand(editor)
  return {
    command: parsed.command,
    args: [...parsed.args, filePath],
    options: {
      detached: true as const,
      stdio: "ignore" as const,
      shell: process.platform === "win32",
    },
  }
}

export async function openEditor(input: { value: string; renderer: CliRenderer; cwd?: string; stdin?: EditorStdio }) {
  const editor = process.env.VISUAL || process.env.EDITOR
  if (!editor) return
  const file = path.join(os.tmpdir(), `${Date.now()}.md`)
  await writeFile(file, input.value)
  input.renderer.suspend()
  input.renderer.currentRenderBuffer.clear()
  try {
    await new Promise<void>((resolve, reject) => {
      const parsed = parseEditorCommand(editor)
      const child = spawn(parsed.command, [...parsed.args, file], {
        cwd: input.cwd && existsSync(input.cwd) ? input.cwd : process.cwd(),
        stdio: [input.stdin ?? "inherit", "inherit", "inherit"],
        shell: process.platform === "win32",
      })
      child.on("error", reject)
      child.on("exit", (code, signal) => {
        if (code === 0) return resolve()
        reject(new Error(`Editor exited with ${signal ? `signal ${signal}` : `code ${code}`}`))
      })
    })
    return (await readFile(file, "utf8")) || undefined
  } finally {
    await rm(file, { force: true }).catch(() => {})
    input.renderer.currentRenderBuffer.clear()
    input.renderer.resume()
    input.renderer.requestRender()
  }
}

export function resolveFilePath(filePath: string, cwd = process.cwd()) {
  return path.isAbsolute(filePath) ? path.normalize(filePath) : path.resolve(cwd, filePath)
}

export type OpenEditedWith = string | Record<string, string>

// openEditedWith is one editor, or a map of lowercase ".ext" to editor with an optional "default".
export function resolveEditorForFile(filePath: string, setting?: OpenEditedWith, env = process.env) {
  if (typeof setting === "string") return setting || env.VISUAL || env.EDITOR
  return setting?.[path.extname(filePath).toLowerCase()] || setting?.default || env.VISUAL || env.EDITOR
}

export async function openFileAtLocation(input: { filePath: string; cwd?: string; editor?: OpenEditedWith }) {
  const filePath = resolveFilePath(input.filePath, input.cwd)
  if (!existsSync(filePath)) throw new Error(`File does not exist: ${filePath}`)

  const editor = resolveEditorForFile(filePath, input.editor)
  if (!editor) throw new Error("No editor configured. Set openEditedWith, VISUAL, or EDITOR.")

  await new Promise<void>((resolve, reject) => {
    const launch = editorLaunchSpec(editor, filePath)
    const child = spawn(launch.command, launch.args, {
      cwd: input.cwd && existsSync(input.cwd) ? input.cwd : process.cwd(),
      detached: launch.options.detached,
      stdio: launch.options.stdio,
      shell: launch.options.shell,
    })
    child.once("error", reject)
    child.once("spawn", () => {
      child.unref()
      resolve()
    })
  })
}

export function editorPortListening(port: number, timeoutMs = 200) {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" })
    const done = (open: boolean) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(timeoutMs)
    socket.once("connect", () => done(true))
    socket.once("timeout", () => done(false))
    socket.once("error", () => done(false))
  })
}

export async function discoverEditorConnection(
  directory: string,
  options?: { lockDir?: string; isPortOpen?: (port: number) => boolean | Promise<boolean> },
) {
  const root = options?.lockDir ?? path.join(os.homedir(), ".claude", "ide")
  const contains = (parent: string) => {
    const resolved = path.resolve(parent)
    const relative = path.relative(resolved, path.resolve(directory))
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)) ? resolved.length : 0
  }
  try {
    const candidates = readdirSync(root)
      .filter((entry) => entry.endsWith(".lock"))
      .flatMap((entry) => {
        const file = path.join(root, entry)
        const port = Number.parseInt(path.basename(file, ".lock"), 10)
        if (!Number.isInteger(port) || port <= 0 || port > 65535) return []
        try {
          const value = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>
          if (value.transport !== undefined && value.transport !== "ws") return []
          const folders = Array.isArray(value.workspaceFolders)
            ? value.workspaceFolders.filter((item): item is string => typeof item === "string")
            : []
          const score = Math.max(0, ...folders.map(contains))
          if (!score) return []
          return [
            {
              url: `ws://127.0.0.1:${port}`,
              authToken: typeof value.authToken === "string" ? value.authToken : undefined,
              source: `lock:${port}`,
              port,
              score,
              mtime: statSync(file).mtimeMs,
            },
          ]
        } catch {
          return []
        }
      })
      .sort((left, right) => right.score - left.score || right.mtime - left.mtime)

    const isPortOpen = options?.isPortOpen ?? editorPortListening
    for (const candidate of candidates) {
      if (!(await isPortOpen(candidate.port))) continue
      return { url: candidate.url, authToken: candidate.authToken, source: candidate.source }
    }
    return undefined
  } catch {
    return undefined
  }
}

export const editorIntegration = {
  connection: discoverEditorConnection,
  selection: (directory: string) => resolveZedSelection(resolveZedDbPath() ?? "", directory),
}
