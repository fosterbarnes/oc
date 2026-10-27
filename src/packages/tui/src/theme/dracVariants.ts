import drac from "./assets/drac.json" with { type: "json" }
import type { ThemeJson } from "./index"

// drac with different background and border surfaces. Only these values differ, so later drac
// changes to accents, syntax, and markdown carry over to every variant.
type Surfaces = {
  background: string
  panel: string
  element: string
  border: string
  borderActive: string
  borderSubtle: string
  diffContext: string
}

function variant(s: Surfaces): ThemeJson {
  return {
    ...drac,
    // drac's border roles and diffContextBg read these defs; nothing else does.
    defs: {
      ...drac.defs,
      fosterSurface0: s.border,
      fosterSurface1: s.borderActive,
      fosterSurface2: s.borderSubtle,
      fosterMantle: s.diffContext,
    },
    theme: { ...drac.theme, background: s.background, backgroundPanel: s.panel, backgroundElement: s.element },
  }
}

export const DRAC_VARIANTS: Record<string, ThemeJson> = {
  ["drac-neutral"]: variant({
    background: "#1B1B1B",
    panel: "#222222",
    element: "#2A2A2A",
    border: "#3F3F3F",
    borderActive: "#4E4E4E",
    borderSubtle: "#5E5E5E",
    diffContext: "#1F1F1F",
  }),
  ["drac-violet"]: variant({
    background: "#1D1A22",
    panel: "#27232D",
    element: "#302B37",
    border: "#433D4B",
    borderActive: "#534C5D",
    borderSubtle: "#645C6E",
    diffContext: "#221F27",
  }),
  ["drac-darker"]: variant({
    background: "#161518",
    panel: "#201F23",
    element: "#29282D",
    border: "#3A393F",
    borderActive: "#4A4950",
    borderSubtle: "#5A5960",
    diffContext: "#1C1B1F",
  }),
  ["drac-lighter"]: variant({
    background: "#222125",
    panel: "#2C2B31",
    element: "#35343A",
    border: "#46454C",
    borderActive: "#56555C",
    borderSubtle: "#66656C",
    diffContext: "#28272C",
  }),
}
