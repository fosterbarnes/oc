import { getComponentCatalogue } from "@opentui/solid/components"
import { registerSpinner } from "opentui-spinner/solid"
import { installTextNodeCoerce } from "./patch-text-node"

export function registerOpencodeSpinner() {
  installTextNodeCoerce()
  if (!getComponentCatalogue().spinner) registerSpinner()
}
