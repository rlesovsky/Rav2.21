// FleetOverview — Plant Overview (mockup #page-fleet). The Separator tile is wired to REAL data
// (7-day summary for cost + processing %, live current for kW + state). Glycol
// and Pasteurizer have no real source yet, so their tiles use the mockup's
// static demo values and carry a DEMO marker — we never present fabricated
// numbers as live. Site roll-up KPIs are labeled to reflect this honestly.
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { fetchSummary } from "../api/energyApi"
import { useLiveCurrent } from "../hooks/useLiveCurrent"
import { useRefreshKey } from "../layout/RefreshContext"
import { ASSETS } from "../config/assetRegistry"
import { formatCurrency, formatNumber } from "../utils/formatters"

const STATE_TINT = {
  Processing: { bg: "rgba(39,194,129,.14)", fg: "#5fdca6", dot: "var(--c-process)" },
  CIP: { bg: "rgba(47,134,216,.14)", fg: "#9cc6f4", dot: "var(--c-cip)" },
  Idle: { bg: "rgba(242,164,58,.14)", fg: "#f6c179", dot: "var(--c-idle)" },
  Shutdown: { bg: "rgba(91,113,147,.18)", fg: "#9fb4d2", dot: "var(--c-shutdown)" },
}

// Demo metrics for the not-yet-wired assets (verbatim from the mockup).
const DEMO_TILES = {
  glycol_chiller: {
    locator: "Real-time monitoring",
    statusLabel: "Cooling",
    tint: { bg: "rgba(63,182,232,.14)", fg: "#7fd3f3", dot: "var(--c-cold)" },
    metrics: [
      { label: "Supply °F", value: "28.4", color: "#7fd3f3" },
      { label: "COP", value: "3.8", color: "#5fdca6" },
      { label: "Comp kW", value: "42.6" },
    ],
  },
  pasteurizer: {
    locator: "HTST line",
    statusLabel: "Idle",
    tint: { bg: "rgba(242,164,58,.14)", fg: "#f6c179", dot: "var(--c-idle)" },
    metrics: [
      { label: "Hold °F", value: "161.2", color: "#f6c179" },
      { label: "Flow gpm", value: "0.0" },
      { label: "Live kW", value: "3.1" },
    ],
  },
}

function Metric({ label, value, color }) {
  return (
    <div className="m">
      <div className="ml">{label}</div>
      <div className="mv" style={color ? { color } : undefined}>{value}</div>
    </div>
  )
}

function AssetTile({ asset, onOpen, header, metrics }) {
  const { TileIcon } = asset
  return (
    <button type="button" className="asset" onClick={() => onOpen(asset.route)}>
      <div className="ah">
        <span className="aico" style={{ background: header.tint.bg, color: header.tint.fg }}>
          <TileIcon />
        </span>
        <div>
          <div className="anm">{asset.name.replace(" (HTST)", "")}</div>
          <div className="alc">{header.locator}</div>
        </div>
        <span className="stat" style={{ background: header.tint.bg, color: header.tint.fg }}>
          <span className="live-dot" style={{ background: header.tint.dot }} />
          {header.statusLabel}
          {!asset.real && <span className="tag-new" style={{ marginLeft: 6 }}>DEMO</span>}
        </span>
      </div>
      <div className="metrics">
        {metrics.map((m) => <Metric key={m.label} {...m} />)}
      </div>
      <span className="go">Open dashboard →</span>
    </button>
  )
}

function SeparatorTile({ asset, onOpen }) {
  const refreshKey = useRefreshKey()
  const live = useLiveCurrent(refreshKey)
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchSummary({ days: 7 })
      .then((res) => { if (!cancelled) setSummary(res.data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [refreshKey])

  const state = live.data?.state ?? "—"
  const tint = STATE_TINT[state] ?? STATE_TINT.Shutdown
  const cost = summary?.total_cost_usd != null ? `$${Math.round(summary.total_cost_usd)}` : "—"
  const procPct = summary?.by_state?.Processing?.pct_time
  const kw = live.data?.kw

  return (
    <AssetTile
      asset={asset}
      onOpen={onOpen}
      header={{ locator: "SCE TOU-GS-2", statusLabel: state, tint }}
      metrics={[
        { label: "7d Cost", value: cost, color: "#7fe3df" },
        { label: "Process %", value: procPct != null ? formatNumber(procPct) : "—", color: "#5fdca6" },
        { label: "Live kW", value: kw != null ? formatNumber(kw) : "—" },
      ]}
    />
  )
}

export default function FleetOverview() {
  const navigate = useNavigate()
  const refreshKey = useRefreshKey()
  const [summary, setSummary] = useState(null)

  // Real separator 7-day cost feeds the site roll-up KPI honestly.
  useEffect(() => {
    let cancelled = false
    fetchSummary({ days: 7 })
      .then((res) => { if (!cancelled) setSummary(res.data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [refreshKey])

  const onOpen = (route) => navigate(route)
  const sepCost = summary?.total_cost_usd
  const sepKwh = summary?.total_kwh

  return (
    <div className="scroll fleetview">
      <div className="row k3">
        <div className="card">
          <div className="ct">
            <span className="badge-i" style={{ background: "rgba(43,182,179,.14)" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2bb6b3" strokeWidth="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </span>
          </div>
          <div className="kl">Separator Cost · 7-Day</div>
          <div className="kv" style={{ color: "#7fe3df" }}>{sepCost != null ? formatCurrency(sepCost) : "—"}</div>
          <div className="delta good"><span>●</span><span className="v">Live</span><span className="x">real data</span></div>
        </div>
        <div className="card">
          <div className="ct">
            <span className="badge-i" style={{ background: "rgba(47,134,216,.14)" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2f86d8" strokeWidth="2" strokeLinejoin="round"><path d="M13 2L3 14h7l-1 8 10-12h-7z" /></svg>
            </span>
          </div>
          <div className="kl">Separator Energy · 7-Day</div>
          <div className="kv" style={{ color: "#9cc6f4" }}>
            {sepKwh != null ? formatNumber(sepKwh) : "—"}<small>kWh</small>
          </div>
          <div className="delta good"><span>●</span><span className="v">Live</span><span className="x">real data</span></div>
        </div>
        <div className="card">
          <div className="ct">
            <span className="badge-i" style={{ background: "rgba(39,194,129,.14)" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#27c281" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4 12 14.01l-3-3" /></svg>
            </span>
          </div>
          <div className="kl">Assets Online</div>
          <div className="kv" style={{ color: "#5fdca6" }}>1<small>/ 3 live</small></div>
          <div className="delta good"><span>●</span><span className="v">Separator live</span><span className="x">· 2 demo</span></div>
        </div>
      </div>

      <div className="panel grow">
        <h3>Assets</h3>
        <div className="sub">Live status across the Driftwood Dairy process line — click any asset to drill in</div>
        <div className="row fleet grow-body" style={{ marginTop: 4 }}>
          {ASSETS.map((asset) => {
            if (asset.real) return <SeparatorTile key={asset.id} asset={asset} onOpen={onOpen} />
            const demo = DEMO_TILES[asset.id]
            return (
              <AssetTile
                key={asset.id}
                asset={asset}
                onOpen={onOpen}
                header={{ locator: demo.locator, statusLabel: demo.statusLabel, tint: demo.tint }}
                metrics={demo.metrics}
              />
            )
          })}
        </div>
      </div>

      <div className="panel grow grow-lg">
        <h3>Site energy cost — last 7 days <span className="tag-new">DEMO ROLL-UP</span></h3>
        <div className="sub">Stacked by asset — preview layout; only Separator (green) reflects real data</div>
        <div className="grow-body chartwrap">
        <svg viewBox="0 0 980 240" width="100%" height="100%" preserveAspectRatio="none" style={{ marginTop: 6 }}>
          <g stroke="#16294a" strokeWidth="1">
            <line x1="48" y1="20" x2="980" y2="20" /><line x1="48" y1="72" x2="980" y2="72" />
            <line x1="48" y1="124" x2="980" y2="124" /><line x1="48" y1="176" x2="980" y2="176" />
            <line x1="48" y1="206" x2="980" y2="206" />
          </g>
          <g fill="#5f7596" fontSize="11" fontFamily="IBM Plex Mono" textAnchor="end">
            <text x="42" y="24">$360</text><text x="42" y="76">$270</text><text x="42" y="128">$180</text>
            <text x="42" y="180">$90</text><text x="42" y="210">$0</text>
          </g>
          <g>
            <g><rect x="78" y="120" width="86" height="86" fill="#27c281" rx="2" /><rect x="78" y="86" width="86" height="34" fill="#3fb6e8" /><rect x="78" y="80" width="86" height="6" fill="#f2a43a" rx="2" /></g>
            <g><rect x="198" y="128" width="86" height="78" fill="#27c281" rx="2" /><rect x="198" y="92" width="86" height="36" fill="#3fb6e8" /><rect x="198" y="88" width="86" height="4" fill="#f2a43a" rx="2" /></g>
            <g><rect x="318" y="110" width="86" height="96" fill="#27c281" rx="2" /><rect x="318" y="74" width="86" height="36" fill="#3fb6e8" /><rect x="318" y="70" width="86" height="4" fill="#f2a43a" rx="2" /></g>
            <g><rect x="438" y="96" width="86" height="110" fill="#27c281" rx="2" /><rect x="438" y="58" width="86" height="38" fill="#3fb6e8" /><rect x="438" y="54" width="86" height="4" fill="#f2a43a" rx="2" /></g>
            <g><rect x="558" y="84" width="86" height="122" fill="#27c281" rx="2" /><rect x="558" y="46" width="86" height="38" fill="#3fb6e8" /><rect x="558" y="42" width="86" height="4" fill="#f2a43a" rx="2" /></g>
            <g><rect x="678" y="80" width="86" height="126" fill="#27c281" rx="2" /><rect x="678" y="42" width="86" height="38" fill="#3fb6e8" /><rect x="678" y="38" width="86" height="4" fill="#f2a43a" rx="2" /></g>
            <g><rect x="798" y="104" width="86" height="102" fill="#27c281" rx="2" /><rect x="798" y="68" width="86" height="36" fill="#3fb6e8" /><rect x="798" y="64" width="86" height="4" fill="#f2a43a" rx="2" /></g>
          </g>
          <g fill="#9fb4d2" fontSize="11.5" textAnchor="middle">
            <text x="121" y="226">May 22</text><text x="241" y="226">May 23</text><text x="361" y="226">May 24</text>
            <text x="481" y="226">May 25</text><text x="601" y="226">May 26</text><text x="721" y="226">May 27</text>
            <text x="841" y="226">May 28</text>
          </g>
        </svg>
        </div>
        <div className="legend">
          <span><i style={{ background: "#27c281" }} />Separator</span>
          <span><i style={{ background: "#3fb6e8" }} />Glycol Chiller</span>
          <span><i style={{ background: "#f2a43a" }} />Pasteurizer</span>
        </div>
      </div>
    </div>
  )
}
