/* =============================================================================
 * Sidebar — DriftView navigation rail (spec §4.2).
 *
 * Phase 1: static structure only. The Monitoring / Operations entries are
 * present and styled (Separator marked active, since the whole dashboard is
 * shown), but navigation is wired in Phase 2 when routing + the asset registry
 * land. Brand lockup (DriftView product identity) sits at the top; the
 * Driftwood Dairy site identity lives only in the site picker at the bottom.
 * ============================================================================= */

import { LayoutGrid, Factory, FileBarChart, Settings as SettingsIcon, MapPin } from 'lucide-react'
import { DvMark, DvWordmark } from '../theme/DvMark'

function NavItem({ icon, label, active = false, statusColor = null }) {
  const Icon = icon
  return (
    <div
      className="relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
      style={{
        color: active ? 'var(--dv-ink)' : 'var(--dv-dim)',
        background: active ? 'color-mix(in srgb, var(--dv-blue) 16%, transparent)' : 'transparent',
        cursor: 'default',
      }}
    >
      {active && (
        <span
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full"
          style={{ background: 'var(--dv-blue)' }}
        />
      )}
      <Icon size={18} style={{ color: active ? 'var(--dv-blue)' : 'var(--dv-faint)' }} />
      <span className="flex-1">{label}</span>
      {statusColor && (
        <span className="h-2 w-2 rounded-full" style={{ background: statusColor }} />
      )}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div
      className="px-3 pb-1 pt-4 text-[0.65rem] font-semibold uppercase"
      style={{ color: 'var(--dv-faint)', letterSpacing: '0.18em' }}
    >
      {children}
    </div>
  )
}

export default function Sidebar() {
  return (
    <aside
      className="flex h-full w-64 flex-col border-r"
      style={{ background: 'var(--dv-panel-2)', borderColor: 'var(--dv-line-2)' }}
    >
      {/* Brand lockup — DriftView product identity */}
      <div
        className="flex items-center gap-3 border-b px-5 py-5"
        style={{ borderColor: 'var(--dv-line-2)' }}
      >
        <DvMark size={36} />
        <DvWordmark />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        <SectionLabel>Monitoring</SectionLabel>
        <NavItem icon={LayoutGrid} label="Fleet Overview" />
        <NavItem icon={Factory} label="Separator" active statusColor="var(--dv-state-processing)" />

        <SectionLabel>Operations</SectionLabel>
        <NavItem icon={FileBarChart} label="Reports" />
        <NavItem icon={SettingsIcon} label="Settings" />
      </nav>

      {/* Site picker — Driftwood Dairy client/site identity */}
      <div className="border-t px-4 py-4" style={{ borderColor: 'var(--dv-line-2)' }}>
        <div
          className="flex items-center gap-3 rounded-lg px-3 py-2"
          style={{ background: 'var(--dv-panel)' }}
        >
          <MapPin size={16} style={{ color: 'var(--dv-teal)' }} />
          <div className="leading-tight">
            <div className="text-sm font-medium" style={{ color: 'var(--dv-ink)' }}>
              Driftwood Dairy
            </div>
            <div className="text-xs" style={{ color: 'var(--dv-faint)' }}>
              El Monte, CA
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
