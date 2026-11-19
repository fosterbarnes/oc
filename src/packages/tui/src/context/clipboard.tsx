import { createContext, type JSX, useContext } from "solid-js"
import { read, write, type ReadTrigger } from "../clipboard"

export type ClipboardContent = Readonly<{ data: string; mime: string; filepath?: string }>
export type ClipboardService = Readonly<{
  read?(trigger: ReadTrigger): Promise<ClipboardContent | undefined>
  write?(text: string): Promise<void>
}>
const clipboard = { read, write }
const ClipboardContext = createContext<ClipboardService>(clipboard)

export function ClipboardProvider(props: { value?: ClipboardService; children: JSX.Element }) {
  return <ClipboardContext.Provider value={props.value ?? clipboard}>{props.children}</ClipboardContext.Provider>
}

export function useClipboard() {
  return useContext(ClipboardContext)
}
