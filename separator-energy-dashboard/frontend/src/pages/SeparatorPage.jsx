// SeparatorPage — the only fully REAL asset. Tabs (Live / Analysis / Trends)
// live in the URL via the :tab param; Analysis is the default to match the
// mockup. Reuses the existing API-backed components (LiveKPIs, StateTimeline,
// KPISummaryCards, StateCostBreakdown, ShiftCostBreakdown, CostByDayChart,
// EnergyTrendChart) placed inside mockup .panel shells.
import { useNavigate, useParams } from "react-router-dom"
import { useRefreshKey } from "../layout/RefreshContext"
import { useLiveCurrent } from "../hooks/useLiveCurrent"
import LiveKPIs from "../components/LiveKPIs"
import StateTimeline from "../components/StateTimeline"
import KPISummaryCards from "../components/KPISummaryCards"
import StateCostBreakdown from "../components/StateCostBreakdown"
import ShiftCostBreakdown from "../components/ShiftCostBreakdown"
import CostByDayChart from "../components/CostByDayChart"
import EnergyTrendChart from "../components/EnergyTrendChart"
import { useState } from "react"

const TABS = [
  { id: "live", label: "Live" },
  { id: "analysis", label: "Analysis" },
  { id: "trends", label: "Trends" },
]
const VALID = new Set(TABS.map((t) => t.id))

function WinSel({ value, onChange }) {
  return (
    <div className="winsel">
      {[7, 30].map((d) => (
        <button key={d} type="button" className={value === d ? "on" : ""} onClick={() => onChange(d)}>
          {d} days
        </button>
      ))}
    </div>
  )
}

function LiveTab({ refreshKey }) {
  const live = useLiveCurrent(refreshKey)
  return (
    <>
      <div className="panel">
        <h3>Live separator telemetry</h3>
        <div className="sub">Snapshot · /api/energy/current</div>
        <LiveKPIs current={live.data} lastFetch={live.lastFetch} error={live.error} />
      </div>
      {/* grow: this panel flexes to fill the remaining viewport height so the
          24h timeline uses the empty space instead of leaving it blank. */}
      <div className="panel grow">
        <h3>Operating-state timeline · 24 h</h3>
        <div className="sub">Per-minute classified state</div>
        <div className="grow-body">
          <StateTimeline refreshKey={refreshKey} />
        </div>
      </div>
    </>
  )
}

function AnalysisTab({ refreshKey }) {
  const [days, setDays] = useState(7)
  return (
    <>
      <div className="mb" style={{ display: "flex", justifyContent: "flex-end" }}>
        <WinSel value={days} onChange={setDays} />
      </div>
      <div className="mb">
        <KPISummaryCards refreshKey={refreshKey} days={days} />
      </div>
      {/* Give the donut a narrower companion column and let the shift bar chart
          take the wider share, so both charts read as landscape. */}
      <div
        className="row mb"
        style={{ gridTemplateColumns: "minmax(0, 0.8fr) minmax(0, 1.5fr)" }}
      >
        <StateCostBreakdown refreshKey={refreshKey} days={days} />
        <ShiftCostBreakdown refreshKey={refreshKey} days={days} />
      </div>
      {/* Full content-width daily-cost chart. */}
      <CostByDayChart refreshKey={refreshKey} days={days} />
    </>
  )
}

export default function SeparatorPage() {
  const { tab } = useParams()
  const navigate = useNavigate()
  const refreshKey = useRefreshKey()
  const active = VALID.has(tab) ? tab : "analysis"

  return (
    <>
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={active === t.id ? "tab on" : "tab"}
            onClick={() => navigate(`/asset/separator/${t.id}`)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={active === "live" ? "scroll live" : active === "trends" ? "scroll fill" : "scroll"}>
        {active === "live" && <LiveTab refreshKey={refreshKey} />}
        {active === "analysis" && <AnalysisTab refreshKey={refreshKey} />}
        {active === "trends" && (
          /* grow: the panel fills the viewport and the chart card flexes into
             it, so the 24h trend expands/contracts with the window height. */
          <div className="panel grow">
            <h3>Motor power trend · 24 h</h3>
            <div className="sub">kW per minute, derived from motor amps</div>
            <div className="grow-body">
              <EnergyTrendChart refreshKey={refreshKey} className="flex-1" />
            </div>
          </div>
        )}
      </div>
    </>
  )
}
