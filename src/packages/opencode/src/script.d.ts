// tui imports .ps1 files as text (`tui/src/script.d.ts`); opencode's typecheck reaches them through `cli/tui/layer.ts`.
declare module "*.ps1" {
  const content: string
  export default content
}
