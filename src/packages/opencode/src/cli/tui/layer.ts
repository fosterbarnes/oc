import { run as runTui, type TuiInput } from "@opencode-ai/tui"
import { Global } from "@opencode-ai/core/global"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Effect } from "effect"
import { TuiLedger } from "@/config/tuiLedger"

export function run(input: TuiInput) {
  return Effect.gen(function* () {
    if (!Global.native && process.platform === "win32") {
      yield* Effect.promise(() => TuiLedger.register(Global.Path.state))
      yield* Effect.addFinalizer(() => Effect.promise(() => TuiLedger.remove(Global.Path.state, process.pid)))
    }
    return yield* runTui(input)
  }).pipe(Effect.scoped, Effect.provide(AppNodeBuilder.build(Global.node)))
}
