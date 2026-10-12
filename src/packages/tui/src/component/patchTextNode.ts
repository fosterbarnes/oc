import { TextNodeRenderable } from "@opentui/core"

let installed = false

export function installTextNodeCoerce() {
  if (installed) return
  installed = true
  const proto = TextNodeRenderable.prototype
  const original = proto.add
  proto.add = function (this: TextNodeRenderable, obj: unknown, index?: number) {
    if (obj == null || typeof obj === "boolean") return index ?? this.children.length
    if (typeof obj === "number" || typeof obj === "bigint") {
      return original.call(this, String(obj), index)
    }
    try {
      return original.call(this, obj as Parameters<typeof original>[0], index)
    } catch (error) {
      if (typeof obj === "string") throw error
      return index ?? this.children.length
    }
  }
}
