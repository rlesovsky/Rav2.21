// SeparatorPage — the only fully REAL asset. Tabs (Live / Analysis / Trends /
// Alarms) live in the URL via the :tab param; Analysis is the default to match
// the mockup. Reuses the existing API-backed components (LiveKPIs, StateTimeline,
// KPISummaryCards, StateCostBreakdown, ShiftCostBreakdown, CostByDayChart,
// EnergyTrendChart) placed inside mockup .panel shells. Alarms is an honest
// empty state — there is no real alarm source.
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
  { id: "alarms", label: "Alarms" },
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
      <div className="panel mb">
        <h3>Live separator telemetry</h3>
        <div className="sub">Snapshot · /api/energy/current</div>
        <LiveKPIs current={live.data} lastFetch={live.lastFetch} error={live.error} />
      </div>
      <div className="panel">
        <h3>Operating-state timeline · 24 h</h3>
        <div className="sub">Per-minute classified state</div>
        <StateTimeline refreshKey={refreshKey} />
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
      <div className="row g2 mb">
        <StateCostBreakdown refreshKey={refreshKey} days={days} />
        <ShiftCostBreakdown refreshKey={refreshKey} days={days} />
      </div>
      <CostByDayChart refreshKey={refreshKey} days={days} />
    </>
  )
}

function AlarmsTab() {
  return (
    <div className="panel">
      <h3>Separator alarms</h3>
      <div className="sub">Last 24 h</div>
      <div className="placeholder">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        <h3 style={{ justifyContent: "center", color: "var(--ink)" }}>No alarm source connected yet</h3>
        <p style={{ marginTop: 8, maxWidth: 520, marginInline: "auto" }}>
          The backend does not yet expose an alarm stream for the separator. Once an
          alarm source is wired in, severity/message/time/status rows will appear here.
        </p>
      </div>
    </div>
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
      <div className="scroll">
        {active === "live" && <LiveTab refreshKey={refreshKey} />}
        {active === "analysis" && <AnalysisTab refreshKey={refreshKey} />}
        {active === "trends" && (
          <div className="panel">
            <h3>Motor power trend · 24 h</h3>
            <div className="sub">kW per minute, derived from motor amps</div>
            <EnergyTrendChart refreshKey={refreshKey} />
          </div>
        )}
        {active === "alarms" && <AlarmsTab />}
      </div>
    </>
  )
}
