/* Separator → Analysis tab (spec §4.5): the cost/energy analytics — the
 * dashboard's heart, and the default tab on open. */

import { RefreshSlot } from '../../context/RefreshContext'
import KPISummaryCards from '../../components/KPISummaryCards'
import StateCostBreakdown from '../../components/StateCostBreakdown'
import ShiftCostBreakdown from '../../components/ShiftCostBreakdown'
import CostByDayChart from '../../components/CostByDayChart'

export default function AnalysisTab() {
  return (
    <div className="space-y-6">
      <RefreshSlot render={(p) => <KPISummaryCards {...p} />} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RefreshSlot render={(p) => <StateCostBreakdown {...p} />} />
        <RefreshSlot render={(p) => <ShiftCostBreakdown {...p} />} />
      </div>
      <RefreshSlot render={(p) => <CostByDayChart {...p} />} />
    </div>
  )
}
