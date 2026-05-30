/* Separator → Trends tab (spec §4.5): energy/power time-series detail. */

import { RefreshSlot } from '../../context/RefreshContext'
import EnergyTrendChart from '../../components/EnergyTrendChart'

export default function TrendsTab() {
  return (
    <div className="space-y-6">
      <RefreshSlot render={(p) => <EnergyTrendChart {...p} />} />
    </div>
  )
}
