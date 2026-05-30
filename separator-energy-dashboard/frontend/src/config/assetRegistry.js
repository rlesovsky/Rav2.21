/* =============================================================================
 * Asset registry — the single source of truth for DriftView's assets (spec §3.3).
 *
 * The rail, the Fleet Overview tiles, and the asset routes are all generated
 * from this list. Onboarding a future asset is a new entry here plus its data
 * hookups — not a structural rewrite.
 *
 * SCOPE: exactly one entry (the Separator). Do NOT add a chiller or
 * pasteurizer entry — those are explicit non-goals (spec §1, §12).
 *
 * `icon` is a lucide-react component reference; `accent` is a theme token used
 * for the rail status dot and tile accents.
 * ============================================================================= */

import { Factory } from 'lucide-react'

export const ASSETS = [
  {
    id: 'separator',
    name: 'Separator',
    location: 'Driftwood Dairy — El Monte, CA',
    rateLabel: 'SCE TOU-GS-2',
    icon: Factory,
    path: '/asset/separator',
    accent: 'var(--dv-state-processing)',
  },
]

export const getAsset = (id) => ASSETS.find((a) => a.id === id)
