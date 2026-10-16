import { expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Shell } from "@opencode-ai/core/shell"
import { Effect, Layer, Stream } from "effect"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import path from "path"
import { Config } from "@/config/config"
import { Agent } from "@/agent/agent"
import { Plugin } from "@/plugin"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { ShellJobs } from "@/background/shellJobs"
import { ShellTool } from "@/tool/shell"
import { Truncate } from "@/tool/truncate"
import { MessageID, SessionID } from "@/session/schema"
import { provideTmpdirInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(
  LayerNode.compile(LayerNode.group([
    CrossSpawnSpawner.node, FSUtil.node, Plugin.node, Truncate.node,
    Config.node, Agent.node, RuntimeFlags.node, ShellJobs.node,
  ])),
  testInstanceStoreLayer,
))
const shell = process.platform === "win32" ? Bun.which("pwsh") : "/bin/sh"
if (!shell) throw new Error("PowerShell is required for shell metadata checks")

for (const mode of ["burst", "sparse", "abort", "timeout", "truncated"] as const) {
  it.live(`shell metadata coalesces ${mode} output and flushes exactly`, () =>
    provideTmpdirInstance((dir) => Effect.gen(function* () {
      const script = path.join(dir, "output.js")
      const count = mode === "sparse" ? 3 : 40
      const interval = mode === "sparse" ? 350 : 10
      const padding = mode === "truncated" ? "x".repeat(2000) : ""
      yield* Effect.promise(() => Bun.write(script,
        `for(let i=0;i<${count};i++){process.stdout.write(i+${JSON.stringify(padding)}+",");await Bun.sleep(${interval})}` +
        (mode === "timeout" || mode === "abort" ? "await Bun.sleep(30000)" : ""),
      ))
      const spawner = yield* ChildProcessSpawner
      const chunks: Uint8Array[] = []
      const updates: string[] = []
      const controller = new AbortController()
      const info = yield* ShellTool.pipe(Effect.provideService(ChildProcessSpawner, {
        ...spawner,
        spawn: (command) => spawner.spawn(command).pipe(Effect.map((handle) => ({
          ...handle,
          all: handle.all.pipe(Stream.tap((chunk) => Effect.sync(() => { chunks.push(chunk) }))),
        }))),
      }))
      const tool = yield* info.init()
      const result = yield* tool.execute({
        command: `${Shell.ps(shell) ? "& " : ""}"${process.execPath}" "${script}"`,
        timeout: mode === "timeout" ? 2000 : 10000,
      }, {
        sessionID: SessionID.make("ses_metadata"), messageID: MessageID.make("msg_metadata"),
        callID: "metadata", agent: "build", abort: controller.signal, messages: [],
        ask: () => Effect.void,
        metadata: (input) => Effect.sync(() => {
          const output = String(input.metadata?.output ?? "")
          updates.push(output)
          if (mode === "abort" && output.endsWith(`${count - 1},`)) controller.abort()
        }),
      })
      const captured = Buffer.concat(chunks).toString("utf8")
      const expected = Array.from({ length: count }, (_, index) => `${index}${padding},`).join("")
      expect(captured).toBe(expected)
      if (mode === "truncated") {
        expect(result.metadata.truncated).toBe(true)
        const file = result.metadata.outputPath
        if (typeof file !== "string") throw new Error("Missing full output file")
        expect(yield* Effect.promise(() => Bun.file(file).text())).toBe(expected)
        expect(updates.at(-1)).toBe(result.metadata.output)
        expect(updates.at(-1)).toBe("...\n\n" + expected.slice(-30000))
      }
      if (mode !== "truncated") {
        expect(result.metadata.output).toBe(expected)
        expect(updates.at(-1)).toBe(expected)
        expect(result.output.split("\n\n<shell_metadata>")[0]).toBe(expected)
      }
      if (mode === "abort") expect(result.output).toContain("User aborted the command")
      if (mode === "timeout") expect(result.output).toContain("exceeding timeout 2000 ms")
      const writes = updates.length
      if (mode !== "sparse") expect(writes).toBeLessThan(10)
      if (mode === "sparse") expect(updates).toContain("0,")
      yield* Effect.sleep("300 millis")
      expect(updates).toHaveLength(writes)
      console.log(`shell ${mode}: chunks=${chunks.length}, metadata writes=${writes}`)
    }), { config: { shell } }),
  )
}
