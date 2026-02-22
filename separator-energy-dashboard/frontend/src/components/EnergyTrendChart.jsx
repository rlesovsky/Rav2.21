import { useState, useEffect } from 'react'
import { fetchTimeline } from '../api/energyApi'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import InfoTooltip from './InfoTooltip'
import dayjs from 'dayjs'

const STATE_COLORS = {
  Processing: '#22C55E',
  CIP: '#3B82F6',
  Idle: '#F59E0B',
  Shutdown: '#6B7280',
}

function Skeleton() {
  return (
    <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 h-80 animate-pulse">
      <div className="h-6 bg-slate-700/50 rounded w-44 mb-4" />
      <div className="h-56 bg-slate-700/50 rounded" />
    </div>
  )
}

export default function EnergyTrendChart({ refreshKey, onRefreshComplete }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    fetchTimeline()
      .then((res) => { if (!cancelled) setData(res.data) })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load') })
      .finally(() => {
        if (!cancelled) setLoading(false)
        onRefreshComplete?.()
      })
    return () => { cancelled = true }
  }, [refreshKey, onRefreshComplete])

  if (loading && !data) return <Skeleton />
  if (error) {
    return (
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-6">
        <h2 className="text-slate-300 font-medium mb-4">Power Draw (24-Hour)</h2>
        <div className="text-red-400">Error: {error}</div>
      </div>
    )
  }

  /* Insert null-kW gap markers between points that are > 5 min apart
     so Recharts breaks the line instead of drawing across dead time */
  const GAP_MS = 5 * 60 * 1000
  const chartData = []
  const raw = (data ?? []).map((p) => ({
    ...p,
    ts: dayjs(p.timestamp).valueOf(),
    fullTime: dayjs(p.timestamp).format('MMM D, h:mm A'),
  }))
  for (let i = 0; i < raw.length; i++) {
    if (i > 0 && raw[i].ts - raw[i - 1].ts > GAP_MS) {
      /* Insert a null point just after the previous point to break the line */
      chartData.push({ ts: raw[i - 1].ts + 1, kw: null })
    }
    chartData.push(raw[i])
  }

  /* Build clean hourly ticks spanning the full 24-hour window */
  const hourlyTicks = (() => {
    if (!chartData.length) return []
    const first = dayjs(chartData[0].timestamp ?? chartData[0].ts).startOf('hour')
    const last  = dayjs(chartData[chartData.length - 1].timestamp ?? chartData[chartData.length - 1].ts)
    const ticks = []
    let cur = first
    while (cur.isBefore(last) || cur.isSame(last)) {
      ticks.push(cur.valueOf())
      cur = cur.add(1, 'hour')
    }
    /* If there are too many ticks for the width, show every 2nd or 3rd hour */
    if (ticks.length > 24) {
      return ticks.filter((_, i) => i % 3 === 0)
    }
    if (ticks.length > 14) {
      return ticks.filter((_, i) => i % 2 === 0)
    }
    return ticks
  })()

  return (
    <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 hover:border-slate-500 hover:bg-slate-800/60 transition-all duration-200">
      <div className="flex items-center gap-1 mb-4">
        <h2 className="text-slate-300 font-medium">Power Draw (24-Hour)</h2>
        <InfoTooltip
          title="Power Draw (24-Hour)"
          lines={[
            'Source: Last 24 hours of Motor Amps from TimeBase',
            'Snapped to nearest 1-minute interval (no interpolation)',
            'kW = (Amps x 460V x 1.732 x 0.88) / 1000',
            'Tooltip shows state, TOU period, and shift at each point',
          ]}
        />
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradKw" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#22D3EE" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="ts"
              type="number"
              domain={['dataMin', 'dataMax']}
              scale="time"
              ticks={hourlyTicks}
              tickFormatter={(v) => dayjs(v).format('h A')}
              tick={{ fill: '#94a3b8', fontSize: 12 }}
            />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(v) => `${v} kW`} domain={[0, 'auto']} />
            <Tooltip
              cursor={{ stroke: '#94a3b8', strokeOpacity: 0.2 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0]?.payload
                return (
                  <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl">
                    {p && (
                      <p className="text-slate-200 font-medium mb-1">
                        {p.fullTime} — {p.state} · {p.tou_period} · {p.shift}
                      </p>
                    )}
                    <p className="text-sm text-cyan-400">
                      kW: {Number(payload[0].value).toFixed(1)}
                    </p>
                  </div>
                )
              }}
            />
            <Area type="linear" dataKey="kw" stroke="#22D3EE" fill="url(#gradKw)" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
