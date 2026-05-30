/* =============================================================================
 * SeparatorPage — the Separator asset page (spec §4.5).
 *
 * Phase 2: renders the existing assembled dashboard (the body that lived in
 * App.jsx through Phase 1) so routing can land without disturbing behavior.
 * Phase 3 splits this into Live / Analysis / Trends tabs (nested routes) and
 * hoists the shared fetches up here; Phase 4 relocates RateConfigPanel to
 * Settings. Until then everything stays exactly where it was.
 * ============================================================================= */

import { RefreshSlot } from '../context/RefreshContext'
import LiveStatusCard from '../components/LiveStatusCard'
import KPISummaryCards from '../components/KPISummaryCards'
import StateCostBreakdown from '../components/StateCostBreakdown'
import ShiftCostBreakdown from '../components/ShiftCostBreakdown'
import CostByDayChart from '../components/CostByDayChart'
import EnergyTrendChart from '../components/EnergyTrendChart'
import StateTimeline from '../components/StateTimeline'
import RateConfigPanel from '../components/RateConfigPanel'

export default function SeparatorPage() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <RefreshSlot render={(p) => <RateConfigPanel {...p} />} />
      <RefreshSlot render={(p) => <LiveStatusCard {...p} />} />
      <RefreshSlot render={(p) => <KPISummaryCards {...p} />} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RefreshSlot render={(p) => <StateCostBreakdown {...p} />} />
        <RefreshSlot render={(p) => <ShiftCostBreakdown {...p} />} />
      </div>
      <RefreshSlot render={(p) => <CostByDayChart {...p} />} />
      <RefreshSlot render={(p) => <EnergyTrendChart {...p} />} />
      <RefreshSlot render={(p) => <StateTimeline {...p} />} />
    </div>
  )
}
