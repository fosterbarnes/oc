import * as path from "path"
import { Effect, Option, Schema } from "effect"
import * as Tool from "./tool"
import DESCRIPTION from "./renameFile.txt"
import { EventV2Bridge } from "@/event-v2-bridge"
import { FileSystem } from "@opencode-ai/core/filesystem"
import { Watcher } from "@opencode-ai/core/filesystem/watcher"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { InstanceState } from "@/effect/instance-state"
import { withFileLocks } from "./edit"
import { assertExternalDirectoryEffect, expandHome } from "./external-directory"

export const Parameters = Schema.Struct({
  filePath: Schema.String.annotate({ description: "The file to rename (absolute path preferred)" }),
  newName: Schema.String.annotate({ description: "The new file name only, not a path (no / or \\)" }),
})

// A bare file name: in place is enforced by the shape of the input, not by comparing folders.
function badName(name: string) {
  if (!name.trim() || name === "." || name === "..") return "newName is empty or a dot name"
  if (/[\\/]/.test(name)) return "newName must be a file name, not a path"
  if (process.platform === "win32" && name.includes(":")) return "newName cannot contain ':'"
  return undefined
}

export const RenameFileTool = Tool.define(
  "rename_file",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: { filePath: string; newName: string }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const requested = expandHome(params.filePath)
          const from = path.isAbsolute(requested) ? requested : path.join(instance.directory, requested)
          const problem = badName(params.newName)
          if (problem) throw new Error(problem)
          if (params.newName === path.basename(from)) throw new Error(`File is already named ${params.newName}`)
          const to = path.join(path.dirname(from), params.newName)
          const rel = (file: string) => path.relative(instance.worktree, file).replaceAll("\\", "/")

          // Same folder, so one external-directory check covers both paths.
          yield* assertExternalDirectoryEffect(ctx, from)
          yield* ctx.ask({
            permission: "edit",
            patterns: [rel(from), rel(to)],
            always: ["*"],
            metadata: { filepath: from, to },
          })

          yield* Effect.gen(function* () {
            const source = yield* fs.stat(from).pipe(Effect.catch(() => Effect.succeed(undefined)))
            if (!source) throw new Error(`File ${from} not found`)
            if (source.type === "Directory") throw new Error(`Path is a directory, not a file: ${from}`)
            const target = yield* fs.stat(to).pipe(Effect.catch(() => Effect.succeed(undefined)))
            // On a case-insensitive volume (APFS, NTFS) a case-only rename finds the source itself.
            const caseOnly =
              target !== undefined &&
              params.newName.toLowerCase() === path.basename(from).toLowerCase() &&
              target.dev === source.dev &&
              Option.getOrUndefined(target.ino) === Option.getOrUndefined(source.ino)
            if (target && !caseOnly) throw new Error(`A file named ${params.newName} already exists`)
            yield* fs.rename(from, to).pipe(Effect.orDie)
          }).pipe(withFileLocks([from, to]))

          yield* events.publish(Watcher.Event.Updated, { file: from, event: "unlink" })
          yield* events.publish(Watcher.Event.Updated, { file: to, event: "add" })
          yield* events.publish(FileSystem.Event.Edited, { file: to })

          return {
            title: `${rel(from)} -> ${params.newName}`,
            metadata: { filepath: from, to },
            output: `Renamed ${from} to ${to}`,
          }
        }).pipe(Effect.orDie),
    }
  }),
)
