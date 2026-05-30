/* =============================================================================
 * FleetOverview — DriftView landing page (spec §4.4).
 *
 * Site-at-a-glance: site roll-up KPI cards, a responsive grid of asset tiles
 * generated from the registry (one tile this scope — the Separator), and a site
 * cost chart (reuses the existing CostByDayChart). With a single asset the site
 * roll-up reflects the Separator's figures, but it is labeled at the site level
 * so it reads correctly as more assets are added later.
 *
 * No alarm summary/counts/tiles (spec §4.4, §12).
 * ============================================================================= */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchSummary, fetchCurrent } from '../api/energyApi'
import { formatCurrency, formatKwh, formatPercent, formatKw } from '../utils/formatters'
import { useRefresh, RefreshSlot } from '../context/RefreshContext'
import { ASSETS } from '../config/assetRegistry'
import CostByDayChart from '../components/CostByDayChart'

const STATE_COLORS = {
  Processing: 'var(--dv-state-processing)',
  CIP: 'var(--dv-state-cip)',
  Idle: 'var(--dv-state-idle)',
  Shutdown: 'var(--dv-state-shutdown)',
}

function Panel({ children, className = '' }) {
  return (
    <div
      className={`rounded-xl border p-5 ${className}`}
      style={{ background: 'var(--dv-panel)', borderColor: 'var(--dv-line)' }}
    >
      {children}
    </div>
  )
}

function KpiCard({ label, value, accent }) {
  return (
    <Panel>
      <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--dv-faint)' }}>
        {label}
      </div>
      <div
        className="mt-2 text-2xl"
        style={{ fontFamily: 'var(--dv-font-mono)', color: accent ?? 'var(--dv-ink)' }}
      >
        {value}
      </div>
    </Panel>
  )
}

/* Fetches the site roll-up + per-asset headline metrics. Self-registers with the
 * refresh contract via <RefreshSlot> so the context-bar refresh updates it. */
function FleetData({ refreshKey, onRefreshComplete }) {
  const navigate = useNavigate()
  const [summary, setSummary] = useState(null)
  const [current, setCurrent] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([fetchSummary(), fetchCurrent()])
      .then(([s, c]) => {
        if (cancelled) return
        if (s.status === 'fulfilled') setSummary(s.value.data)
        if (c.status === 'fulfilled') setCurrent(c.value.data)
      })
      .finally(() => {
        onRefreshComplete?.()
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey, onRefreshComplete])

  // Match the /api/energy/summary shape used by KPISummaryCards: total_cost_usd,
  // total_kwh, and per-state pct_time under by_state.
  const totalCost = summary?.total_cost_usd
  const totalKwh = summary?.total_kwh
  const processingPct = summary?.by_state?.Processing?.pct_time
  const liveKw = current?.kw
  const liveState = current?.state ?? '—'
  const onlineCount = current?.state && current.state !== 'Shutdown' ? 1 : 0

  return (
    <div className="space-y-6">
      {/* Site roll-up KPIs */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--dv-dim)' }}>
          Site Roll-up · 7-Day Window
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Site Cost (7d)" value={totalCost != null ? formatCurrency(totalCost) : '—'} accent="var(--dv-teal)" />
          <KpiCard label="Site Energy (7d)" value={totalKwh != null ? formatKwh(totalKwh) : '—'} accent="var(--dv-blue)" />
          <KpiCard label="Assets Online" value={`${onlineCount} / ${ASSETS.length}`} />
          <KpiCard label="Processing Share" value={processingPct != null ? formatPercent(processingPct) : '—'} accent="var(--dv-state-processing)" />
        </div>
      </section>

      {/* Asset tiles */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--dv-dim)' }}>
          Assets
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ASSETS.map((asset) => {
            const Icon = asset.icon
            const dot = STATE_COLORS[liveState] ?? 'var(--dv-state-shutdown)'
            return (
              <Panel key={asset.id} className="flex flex-col">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {Icon && <Icon size={20} style={{ color: 'var(--dv-blue)' }} />}
                    <div>
                      <div className="font-medium" style={{ color: 'var(--dv-ink)' }}>{asset.name}</div>
                      <div className="text-xs" style={{ color: 'var(--dv-faint)' }}>{asset.rateLabel}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
                    <span className="text-xs" style={{ color: 'var(--dv-dim)' }}>{liveState}</span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div>
                    <div className="text-[0.65rem] uppercase" style={{ color: 'var(--dv-faint)' }}>7-Day Cost</div>
                    <div style={{ fontFamily: 'var(--dv-font-mono)', color: 'var(--dv-ink)' }}>
                      {totalCost != null ? formatCurrency(totalCost) : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[0.65rem] uppercase" style={{ color: 'var(--dv-faint)' }}>Processing</div>
                    <div style={{ fontFamily: 'var(--dv-font-mono)', color: 'var(--dv-ink)' }}>
                      {processingPct != null ? formatPercent(processingPct) : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[0.65rem] uppercase" style={{ color: 'var(--dv-faint)' }}>Live kW</div>
                    <div style={{ fontFamily: 'var(--dv-font-mono)', color: 'var(--dv-ink)' }}>
                      {liveKw != null ? formatKw(liveKw) : '—'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(asset.path)}
                  className="mt-4 self-start rounded-lg border px-3 py-1.5 text-sm transition-colors"
                  style={{ borderColor: 'var(--dv-blue)', color: 'var(--dv-blue)' }}
                >
                  Open dashboard →
                </button>
              </Panel>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export default function FleetOverview() {
  // useRefresh is read here only to assert we are inside the provider; the
  // actual subscription happens inside the RefreshSlot wrappers below.
  useRefresh()
  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <RefreshSlot render={(p) => <FleetData {...p} />} />
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--dv-dim)' }}>
          Site Cost by Day
        </h2>
        <RefreshSlot render={(p) => <CostByDayChart {...p} />} />
      </section>
    </div>
  )
}
