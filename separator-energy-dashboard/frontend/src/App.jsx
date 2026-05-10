import { useState, useEffect, useCallback } from "react"
import Header from "./components/Header"
import RateConfigPanel from "./components/RateConfigPanel"
import Tabs from "./components/Tabs"
import WindowSelector from "./components/WindowSelector"
import LiveKPIs from "./components/LiveKPIs"
import KPISummaryCards from "./components/KPISummaryCards"
import StateCostBreakdown from "./components/StateCostBreakdown"
import ShiftCostBreakdown from "./components/ShiftCostBreakdown"
import CostByDayChart from "./components/CostByDayChart"
import EnergyTrendChart from "./components/EnergyTrendChart"
import StateTimeline from "./components/StateTimeline"
import I3xBadge from "./components/I3xBadge"
import { useLiveCurrent } from "./hooks/useLiveCurrent"
import { fetchSummary, fetchDaily, clearCache } from "./api/energyApi"

const TAB_LIVE = "live"
const TAB_ANALYSIS = "analysis"

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [tab, setTab] = useState(TAB_LIVE)
  const [days, setDays] = useState(7)

  // Single live-data poll at the top of the tree; LiveStateCard and LiveKPIs
  // both consume it via props — no duplicate requests.
  const live = useLiveCurrent(refreshKey)

  const handleRefresh = useCallback(() => {
    clearCache()
    setIsRefreshing(true)
    setRefreshKey((k) => k + 1)
    setTimeout(() => setIsRefreshing(false), 900)
  }, [])

  // Warm the cache with 30-day data ~1.5s after first paint.
  useEffect(() => {
    const t = setTimeout(() => {
      Promise.all([
        fetchSummary({ days: 30 }),
        fetchSummary({ days: 30, offset: 30 }),
        fetchDaily({ days: 30 }),
      ]).catch(() => {})
    }, 1500)
    return () => clearTimeout(t)
  }, [])

  const onLive = tab === TAB_LIVE

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <main className="px-6 lg:px-8 2xl:px-12 py-5 flex-1 flex flex-col gap-4">
        <Header onRefresh={handleRefresh} isRefreshing={isRefreshing} />
        <RateConfigPanel refreshKey={refreshKey} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: TAB_LIVE, label: "Live" },
              { value: TAB_ANALYSIS, label: "Analysis" },
            ]}
          />
          {tab === TAB_ANALYSIS && (
            <WindowSelector value={days} onChange={setDays} />
          )}
        </div>

        <div
          key={tab}
          className={`tab-content flex flex-col gap-4 ${onLive ? "flex-1 min-h-0" : ""}`}
        >
          {onLive && (
            <>
              {/* Row 1: 7 mini cards — operating state + 6 live readings. */}
              <LiveKPIs
                current={live.data}
                lastFetch={live.lastFetch}
                error={live.error}
              />

              {/* Row 2: full-width 24h state distribution. */}
              <StateTimeline refreshKey={refreshKey} />

              {/* Row 3: power-draw chart fills remaining viewport. */}
              <EnergyTrendChart refreshKey={refreshKey} className="flex-[4]" />
            </>
          )}

          {!onLive && (
            <>
              <KPISummaryCards refreshKey={refreshKey} days={days} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <StateCostBreakdown refreshKey={refreshKey} days={days} />
                <ShiftCostBreakdown refreshKey={refreshKey} days={days} />
              </div>
              <CostByDayChart refreshKey={refreshKey} days={days} />
            </>
          )}
        </div>
      </main>

      <footer className="px-6 lg:px-8 2xl:px-12 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-600">
        <span>
          Driftwood Dairy — El Monte, CA · Texas Automation Systems · SCE TOU-GS-2 · Rolling analysis
        </span>
        <I3xBadge />
      </footer>
    </div>
  )
}
