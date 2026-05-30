/* =============================================================================
 * Settings — Operations › Settings (spec §4.6).
 *
 * Home for the Rate & electrical configuration (RateConfigPanel, backed by
 * /api/config). Relocated out of the Separator dashboard body in Phase 4; its
 * read/update behavior (voltage, power factor, $/kWh) is preserved unchanged.
 * It self-registers with the refresh contract via <RefreshSlot> like any data
 * panel.
 * ============================================================================= */

import { RefreshSlot } from '../context/RefreshContext'
import RateConfigPanel from '../components/RateConfigPanel'

export default function Settings() {
  return (
    <div className="mx-auto max-w-[1000px] space-y-6">
      <div>
        <h1 className="text-xl" style={{ fontFamily: 'var(--dv-font-display)', color: 'var(--dv-ink)' }}>
          Settings
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--dv-dim)' }}>
          Rate &amp; electrical configuration for the Separator.
        </p>
      </div>
      <RefreshSlot render={(p) => <RateConfigPanel {...p} />} />
    </div>
  )
}
