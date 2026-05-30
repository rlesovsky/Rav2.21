/* =============================================================================
 * App — DriftView shell entry (Phase 1).
 *
 * Phase 1 wraps the *existing* assembled dashboard inside the DriftView shell
 * (rail + context bar) and lifts global refresh into RefreshContext. The body is
 * functionally identical to before — every existing data component renders here,
 * each wrapped in a <RefreshSlot> so it self-registers for the refresh fan-out.
 *
 * Phases 2+ replace this body with the router (Fleet Overview / Separator tabs /
 * Settings / Reports). The old Header is retired; its clock/refresh/status now
 * live in the context bar.
 * ============================================================================= */

import { RefreshProvider, RefreshSlot } from './context/RefreshContext'
import AppLayout from './layout/AppLayout'
import LiveStatusCard from './components/LiveStatusCard'
import KPISummaryCards from './components/KPISummaryCards'
import StateCostBreakdown from './components/StateCostBreakdown'
import ShiftCostBreakdown from './components/ShiftCostBreakdown'
import CostByDayChart from './components/CostByDayChart'
import EnergyTrendChart from './components/EnergyTrendChart'
import StateTimeline from './components/StateTimeline'
import RateConfigPanel from './components/RateConfigPanel'

export default function App() {
  return (
    <RefreshProvider>
      <AppLayout pageTitle="Separator — 7-Day Cost Analysis">
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

          <footer
            className="border-t pt-4 text-center text-sm"
            style={{ borderColor: 'var(--dv-line-2)', color: 'var(--dv-faint)' }}
          >
            Driftwood Dairy — El Monte, CA · Texas Automation Systems · SCE TOU-GS-2 · Rolling 7-Day Analysis
          </footer>
        </div>
      </AppLayout>
    </RefreshProvider>
  )
}
