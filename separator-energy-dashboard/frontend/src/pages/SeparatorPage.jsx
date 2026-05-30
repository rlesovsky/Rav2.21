/* =============================================================================
 * SeparatorPage — the Separator asset page (spec §4.5).
 *
 * Renders the tab strip (Live / Analysis / Trends), with Analysis active by
 * default. The active tab lives in the URL (/asset/separator/<tab>) so it is
 * deep-linkable and works with browser back/forward (spec §7).
 *
 * Refresh contract (Addendum B/C): all three tab panels stay mounted; only the
 * active one is visible (the others are hidden via CSS). Because the data
 * components never unmount on a tab switch, switching tabs does NOT refetch, and
 * the RefreshContext subscriber count stays stable — the global refresh fans out
 * to every mounted panel exactly as it did on the old single page. This keeps
 * the existing self-fetching components untouched.
 *
 * RateConfigPanel sits above the tab strip here through Phase 3; Phase 4
 * relocates it to the Settings page.
 * ============================================================================= */

import { useParams, Navigate, NavLink } from 'react-router-dom'
import { RefreshSlot } from '../context/RefreshContext'
import RateConfigPanel from '../components/RateConfigPanel'
import LiveTab from './tabs/LiveTab'
import AnalysisTab from './tabs/AnalysisTab'
import TrendsTab from './tabs/TrendsTab'

const TABS = [
  { id: 'live', label: 'Live' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'trends', label: 'Trends' },
]
const TAB_IDS = TABS.map((t) => t.id)

function TabStrip({ active }) {
  return (
    <div className="flex gap-1 border-b" style={{ borderColor: 'var(--dv-line)' }}>
      {TABS.map((t) => {
        const isActive = t.id === active
        return (
          <NavLink
            key={t.id}
            to={`/asset/separator/${t.id}`}
            style={{ textDecoration: 'none' }}
          >
            <div
              className="relative px-4 py-2.5 text-sm font-medium transition-colors"
              style={{ color: isActive ? 'var(--dv-ink)' : 'var(--dv-dim)' }}
            >
              {t.label}
              {isActive && (
                <span
                  className="absolute inset-x-2 -bottom-px h-[2px] rounded-full"
                  style={{ background: 'var(--dv-blue)' }}
                />
              )}
            </div>
          </NavLink>
        )
      })}
    </div>
  )
}

export default function SeparatorPage() {
  const { tab } = useParams()

  // Normalize: bare /asset/separator and unknown tabs land on Analysis (default).
  if (!tab || !TAB_IDS.includes(tab)) {
    return <Navigate to="/asset/separator/analysis" replace />
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <RefreshSlot render={(p) => <RateConfigPanel {...p} />} />

      <TabStrip active={tab} />

      {/* All panels stay mounted; only the active one is shown. */}
      <div hidden={tab !== 'live'}>
        <LiveTab />
      </div>
      <div hidden={tab !== 'analysis'}>
        <AnalysisTab />
      </div>
      <div hidden={tab !== 'trends'}>
        <TrendsTab />
      </div>
    </div>
  )
}
