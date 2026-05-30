// =============================================================================
// assetRegistry — single source of truth for the monitored assets.
//
// Sidebar nav, Fleet tiles, and the router all generate from this list, so
// "adding an asset is just a config entry." Each entry carries the mockup's
// inline SVG icon components (from ./assetIcons), the status accent color, and
// a `real` flag — only `separator` is wired to the live API; the others render
// clearly-labeled DEMO/preview data.
// =============================================================================
import {
  SeparatorIcon,
  GlycolIcon,
  PasteurizerIcon,
  SeparatorTileIcon,
  GlycolTileIcon,
  PasteurizerTileIcon,
} from "./assetIcons"

export const ASSETS = [
  {
    id: "separator",
    name: "Separator",
    route: "/asset/separator",
    NavIcon: SeparatorIcon,
    TileIcon: SeparatorTileIcon,
    dotColor: "var(--c-process)",
    real: true,
  },
  {
    id: "glycol_chiller",
    name: "Glycol Chiller",
    route: "/asset/glycol",
    NavIcon: GlycolIcon,
    TileIcon: GlycolTileIcon,
    dotColor: "var(--c-cold)",
    real: false,
  },
  {
    id: "pasteurizer",
    name: "Pasteurizer (HTST)",
    route: "/asset/pasteurizer",
    NavIcon: PasteurizerIcon,
    TileIcon: PasteurizerTileIcon,
    dotColor: "var(--c-idle)",
    real: false,
  },
]

export const getAsset = (id) => ASSETS.find((a) => a.id === id)
