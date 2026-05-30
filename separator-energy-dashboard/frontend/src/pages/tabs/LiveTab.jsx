/* Separator → Live tab (spec §4.5): real-time snapshot + rolling 24h state view. */

import { RefreshSlot } from '../../context/RefreshContext'
import LiveStatusCard from '../../components/LiveStatusCard'
import StateTimeline from '../../components/StateTimeline'

export default function LiveTab() {
  return (
    <div className="space-y-6">
      <RefreshSlot render={(p) => <LiveStatusCard {...p} />} />
      <RefreshSlot render={(p) => <StateTimeline {...p} />} />
    </div>
  )
}
