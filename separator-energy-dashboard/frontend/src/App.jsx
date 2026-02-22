import { useState, useRef, useCallback } from 'react'
import Header from './components/Header'
import LiveStatusCard from './components/LiveStatusCard'
import KPISummaryCards from './components/KPISummaryCards'
import StateCostBreakdown from './components/StateCostBreakdown'
import ShiftCostBreakdown from './components/ShiftCostBreakdown'
import CostByDayChart from './components/CostByDayChart'
import EnergyTrendChart from './components/EnergyTrendChart'
import StateTimeline from './components/StateTimeline'
import RateConfigPanel from './components/RateConfigPanel'

const fontFamily = "'IBM Plex Sans', 'SF Pro Display', system-ui, sans-serif"
const REFRESH_COMPONENT_COUNT = 8

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const completedCountRef = useRef(0)

  const handleRefresh = () => {
    setIsRefreshing(true)
    completedCountRef.current = 0
    setRefreshKey((k) => k + 1)
  }

  const onRefreshComplete = useCallback(() => {
    completedCountRef.current += 1
    if (completedCountRef.current === REFRESH_COMPONENT_COUNT) {
      setIsRefreshing(false)
    }
  }, [])

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 relative"
      style={{ fontFamily }}
    >
      {/* Grid pattern overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '50px 50px',
        }}
      />
      <Header onRefresh={handleRefresh} isRefreshing={isRefreshing} />
      <main className="relative max-w-[1600px] mx-auto px-6 py-8 space-y-6">
        <RateConfigPanel refreshKey={refreshKey} onRefreshComplete={onRefreshComplete} />
        <LiveStatusCard refreshKey={refreshKey} onRefreshComplete={onRefreshComplete} />
        <KPISummaryCards refreshKey={refreshKey} onRefreshComplete={onRefreshComplete} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StateCostBreakdown refreshKey={refreshKey} onRefreshComplete={onRefreshComplete} />
          <ShiftCostBreakdown refreshKey={refreshKey} onRefreshComplete={onRefreshComplete} />
        </div>
        <CostByDayChart refreshKey={refreshKey} onRefreshComplete={onRefreshComplete} />
        <EnergyTrendChart refreshKey={refreshKey} onRefreshComplete={onRefreshComplete} />
        <StateTimeline refreshKey={refreshKey} onRefreshComplete={onRefreshComplete} />
      </main>
      <footer className="relative border-t border-slate-800 py-4 mt-8">
        <div className="max-w-[1600px] mx-auto px-6 text-center text-slate-500 text-sm">
          Driftwood Dairy — El Monte, CA · Texas Automation Systems · SCE TOU-GS-2 · Rolling 7-Day Analysis
        </div>
      </footer>
    </div>
  )
}
