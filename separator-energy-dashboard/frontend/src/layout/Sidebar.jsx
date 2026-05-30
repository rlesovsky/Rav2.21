/* =============================================================================
 * Sidebar — DriftView navigation rail (spec §4.2).
 *
 * Phase 2: entries are real NavLinks. The Monitoring asset entries are
 * generated from the asset registry (§3.3); Fleet Overview and the Operations
 * section (Reports, Settings) are fixed. The active item is marked with an
 * accent left-bar + highlighted background. The Separator entry carries a
 * status dot driven by the live operating state.
 *
 * Brand lockup (DriftView product identity) sits at the top; the Driftwood Dairy
 * site identity lives only in the site picker at the bottom.
 * ============================================================================= */

import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutGrid, FileBarChart, Settings as SettingsIcon, MapPin } from 'lucide-react'
import { DvMark, DvWordmark } from '../theme/DvMark'
import { ASSETS } from '../config/assetRegistry'
import { useRefresh } from '../context/RefreshContext'
import { fetchCurrent } from '../api/energyApi'

const STATE_COLORS = {
  Processing: 'var(--dv-state-processing)',
  CIP: 'var(--dv-state-cip)',
  Idle: 'var(--dv-state-idle)',
  Shutdown: 'var(--dv-state-shutdown)',
}

function NavItem({ to, icon, label, statusColor = null, end = false }) {
  const Icon = icon
  return (
    <NavLink to={to} end={end} style={{ textDecoration: 'none' }} title={label}>
      {({ isActive }) => (
        <div
          className="relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors justify-center lg:justify-start"
          style={{
            color: isActive ? 'var(--dv-ink)' : 'var(--dv-dim)',
            background: isActive
              ? 'color-mix(in srgb, var(--dv-blue) 16%, transparent)'
              : 'transparent',
          }}
        >
          {isActive && (
            <span
              className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full"
              style={{ background: 'var(--dv-blue)' }}
            />
          )}
          {Icon && <Icon size={18} style={{ color: isActive ? 'var(--dv-blue)' : 'var(--dv-faint)' }} />}
          <span className="hidden flex-1 lg:block">{label}</span>
          {statusColor && <span className="h-2 w-2 rounded-full" style={{ background: statusColor }} />}
        </div>
      )}
    </NavLink>
  )
}

function SectionLabel({ children }) {
  return (
    <div
      className="hidden px-3 pb-1 pt-4 text-[0.65rem] font-semibold uppercase lg:block"
      style={{ color: 'var(--dv-faint)', letterSpacing: '0.18em' }}
    >
      {children}
    </div>
  )
}

/* Live operating state for the asset status dot. Reads refreshKey so it updates
 * with the global refresh, but does NOT register as a refresh subscriber — it's
 * chrome, not a data panel, so it must not affect the completion count. */
function useLiveState() {
  const { refreshKey } = useRefresh()
  const [state, setState] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetchCurrent()
      .then((res) => { if (!cancelled) setState(res.data?.state ?? null) })
      .catch(() => { if (!cancelled) setState(null) })
    return () => { cancelled = true }
  }, [refreshKey])
  return state
}

export default function Sidebar() {
  const liveState = useLiveState()
  const assetDot = STATE_COLORS[liveState] ?? 'var(--dv-state-shutdown)'

  return (
    <aside
      className="flex h-full w-16 flex-col border-r transition-all duration-200 lg:w-64"
      style={{ background: 'var(--dv-panel-2)', borderColor: 'var(--dv-line-2)' }}
    >
      {/* Brand lockup — DriftView product identity. Collapses to the DV mark on
          narrow viewports (icon-only rail); the wordmark shows at lg+. */}
      <div className="flex items-center justify-center gap-3 border-b px-3 py-5 lg:justify-start lg:px-5" style={{ borderColor: 'var(--dv-line-2)' }}>
        <DvMark size={36} />
        <div className="hidden lg:block">
          <DvWordmark />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        <SectionLabel>Monitoring</SectionLabel>
        <NavItem to="/" end icon={LayoutGrid} label="Fleet Overview" />
        {ASSETS.map((asset) => (
          <NavItem key={asset.id} to={asset.path} icon={asset.icon} label={asset.name} statusColor={assetDot} />
        ))}

        <SectionLabel>Operations</SectionLabel>
        <NavItem to="/reports" icon={FileBarChart} label="Reports" />
        <NavItem to="/settings" icon={SettingsIcon} label="Settings" />
      </nav>

      {/* Site picker — Driftwood Dairy client/site identity */}
      <div className="border-t px-2 py-4 lg:px-4" style={{ borderColor: 'var(--dv-line-2)' }}>
        <div
          className="flex items-center justify-center gap-3 rounded-lg px-3 py-2 lg:justify-start"
          style={{ background: 'var(--dv-panel)' }}
          title="Driftwood Dairy — El Monte, CA"
        >
          <MapPin size={16} style={{ color: 'var(--dv-teal)' }} />
          <div className="hidden leading-tight lg:block">
            <div className="text-sm font-medium" style={{ color: 'var(--dv-ink)' }}>Driftwood Dairy</div>
            <div className="text-xs" style={{ color: 'var(--dv-faint)' }}>El Monte, CA</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
