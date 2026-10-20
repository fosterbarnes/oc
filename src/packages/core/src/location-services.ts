import { Effect, Exit, Layer, LayerMap, MutableHashMap, Option } from "effect"
import path from "path"
import { AgentV2 } from "./agent"
import { AISDK } from "./aisdk"
import { Catalog } from "./catalog"
import { CommandV2 } from "./command"
import { Config } from "./config"
import { LayerNode } from "./effect/layer-node"
import { Node } from "./effect/app-node"
import { FileMutation } from "./file-mutation"
import { FileSystem } from "./filesystem"
import { FileSystemSearch } from "./filesystem/search"
import { Watcher } from "./filesystem/watcher"
import { Image } from "./image"
import { Integration } from "./integration"
import { Location } from "./location"
import { LocationMutation } from "./location-mutation"
import { LocationServiceMap } from "./location-service-map"
import { PermissionV2 } from "./permission"
import { PluginV2 } from "./plugin"
import { PluginInternal } from "./plugin/internal"
import { Policy } from "./policy"
import { ProjectCopy } from "./project/copy"
import { Pty } from "./pty"
import { QuestionV2 } from "./question"
import { Reference } from "./reference"
import { ReferenceGuidance } from "./reference/guidance"
import { SessionTodo } from "./session/todo"
import { SkillV2 } from "./skill"
import { SkillGuidance } from "./skill/guidance"
import { Snapshot } from "./snapshot"
import { SystemContextBuiltIns } from "./system-context/builtins"
import { SystemContextRegistry } from "./system-context/registry"
import { BuiltInTools } from "./tool/builtins"
import { ReadToolFileSystem } from "./tool/read-filesystem"
import { AbsolutePath } from "./schema"
import { ToolRegistry } from "./tool/registry"
import { ToolOutputStore } from "./tool-output-store"

export { LocationServiceMap } from "./location-service-map"

export const locationServices = LayerNode.group([
  Location.node,
  Policy.node,
  Config.node,
  AgentV2.node,
  CommandV2.node,
  Reference.node,
  Integration.node,
  Catalog.node,
  AISDK.node,
  PluginV2.node,
  PluginInternal.node,
  ProjectCopy.node,
  ProjectCopy.refreshNode,
  FileSystemSearch.node,
  FileSystem.node,
  Watcher.node,
  Pty.node,
  SkillV2.node,
  SystemContextRegistry.node,
  SystemContextBuiltIns.node,
  LocationMutation.node,
  FileMutation.node,
  PermissionV2.node,
  ToolOutputStore.node,
  ToolRegistry.node,
  ToolRegistry.toolsNode,
  Image.node,
  SkillGuidance.node,
  ReferenceGuidance.node,
  SessionTodo.node,
  QuestionV2.node,
  ReadToolFileSystem.node,
  BuiltInTools.node,
  Snapshot.node,
])

export type LocationServices = LayerNode.Output<typeof locationServices>
export type LocationError = LayerNode.Error<typeof locationServices>

export function buildLocationServiceMap(
  replacements: LayerNode.Replacements = [],
): Layer.Layer<LocationServiceMap.Service> {
  // Structural Equal distinguishes optional-key shape and Windows separator style.
  // The RcMap caches the raw key before the build callback, so normalize both here.
  const canonical = (ref: Location.Ref) =>
    Location.Ref.make({
      directory: AbsolutePath.make(process.platform === "win32" ? path.normalize(ref.directory) : ref.directory),
      workspaceID: ref.workspaceID,
    })
  return Layer.effect(
    LocationServiceMap.Service,
    Effect.gen(function* () {
      const owner = yield* Effect.scope
      const booting = MutableHashMap.empty<Location.Ref, object>()
      const inner: LayerMap.LayerMap<Location.Ref, LocationServices, LocationError> = yield* LayerMap.make(
        (ref: Location.Ref) => {
          const build = {}
          MutableHashMap.set(booting, ref, build)
          const allReplacements = replacements.concat([[Location.node, Location.boundNode(ref)]])
          // Apply replacements during hoist, not afterward: replacements can
          // introduce new tagged dependencies (Location.boundNode depends on
          // Project), and the hoist walk is the only pass that can still slice
          // those back out.
          const location = LayerNode.hoist(locationServices, Node.tags.values.global, allReplacements)
          const layer = LayerNode.compile(location.node).pipe(
            Layer.fresh,
            Layer.tap(() =>
              Effect.logInfo("booting location services", {
                directory: ref.directory,
                workspaceID: ref.workspaceID,
              }),
            ),
            Layer.provide(LayerNode.compile(location.hoisted)),
          )

          return Layer.fromBuild((memoMap, scope) =>
            Effect.suspend(() => Layer.buildWithMemoMap(layer, memoMap, scope)).pipe(
              Effect.onExit((exit) => {
                const finish = Effect.suspend(() => {
                  // An explicitly invalidated build must not evict its replacement.
                  if (Option.getOrUndefined(MutableHashMap.get(booting, ref)) !== build) return Effect.void
                  MutableHashMap.remove(booting, ref)
                  // Evict once per failed build so later lookups retry instead of
                  // replaying the cached failure until the idle TTL expires.
                  return Exit.isFailure(exit) ? inner.invalidate(ref) : Effect.void
                })
                // With no borrowers, invalidation closes the entry's scope and
                // joins this lookup fiber. Let the owner finish that cleanup.
                return Exit.isFailure(exit)
                  ? finish.pipe(Effect.forkIn(owner, { startImmediately: true }), Effect.asVoid)
                  : finish
              }),
            ),
          )
        },
        { idleTimeToLive: "60 minutes" },
      )
      return {
        ...inner,
        get: (ref: Location.Ref) => inner.get(canonical(ref)),
        contextEffect: (ref: Location.Ref) => inner.contextEffect(canonical(ref)),
        invalidate: (ref: Location.Ref) =>
          Effect.suspend(() => {
            const key = canonical(ref)
            MutableHashMap.remove(booting, key)
            return inner.invalidate(key)
          }),
      }
    }),
  )
}

// This is temporary for backwards compatibility
export const locationServiceMapLayer = buildLocationServiceMap()
