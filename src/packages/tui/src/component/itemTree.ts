// Picker rows for the config item tree (core `OcItems.tree`), shared by Import, Export, and Sync.
import { OcItems } from "@opencode-ai/core/util/ocItems"
import type { DialogSelectOption } from "../ui/dialog-select"

export type TreeState = "on" | "some" | "off"

const _BOX: Record<TreeState, string> = { on: "[x]", some: "[-]", off: "[ ]" }

export function treeOptions(
  nodes: readonly OcItems.TreeNode[],
  state: (node: OcItems.TreeNode) => TreeState,
  describe: (node: OcItems.TreeNode) => string | undefined = () => undefined,
  category?: string,
): DialogSelectOption<string>[] {
  return nodes.map((node) => ({
    title: `${"  ".repeat(node.depth)}${_BOX[state(node)]} ${node.title}`,
    value: `node:${node.key}`,
    category,
    description: node.leaf ? describe(node) : String(node.ids.length),
  }))
}

export function pickedState(node: OcItems.TreeNode, picked: ReadonlySet<string>): TreeState {
  const count = node.ids.filter((id) => picked.has(id)).length
  if (count === 0) return "off"
  return count === node.ids.length ? "on" : "some"
}

// A fully picked node unpicks all its items; otherwise it picks them all.
export function togglePicked(node: OcItems.TreeNode, picked: ReadonlySet<string>) {
  const next = new Set(picked)
  if (pickedState(node, picked) === "on") node.ids.forEach((id) => next.delete(id))
  else node.ids.forEach((id) => next.add(id))
  return next
}

export function nodeByValue(nodes: readonly OcItems.TreeNode[], value: string) {
  return value.startsWith("node:") ? nodes.find((node) => `node:${node.key}` === value) : undefined
}
