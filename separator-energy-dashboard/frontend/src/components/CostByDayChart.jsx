import { useState, useEffect } from 'react'
import { fetchDaily } from '../api/energyApi'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
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
      <div className="h-6 bg-slate-700/50 rounded w-40 mb-4" />
      <div className="h-56 bg-slate-700/50 rounded" />
    </div>
  )
}

export default function CostByDayChart({ refreshKey, onRefreshComplete }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    fetchDaily()
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
        <h2 className="text-slate-300 font-medium mb-4">Daily Cost (7-Day)</h2>
        <div className="text-red-400">Error: {error}</div>
      </div>
    )
  }

  const chartData = (data ?? []).map((d) => {
    const date = dayjs(d.date)
    const byState = d.by_state ?? {}
    return {
      date: d.date,
      label: date.format('MMM D'),
      day: date.format('ddd'),
      Processing: byState.Processing?.cost_usd ?? 0,
      CIP: byState.CIP?.cost_usd ?? 0,
      Idle: byState.Idle?.cost_usd ?? 0,
      Shutdown: byState.Shutdown?.cost_usd ?? 0,
      total: d.total_cost_usd ?? 0,
    }
  })

  return (
    <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 hover:border-slate-500 hover:bg-slate-800/60 transition-all duration-200">
      <div className="flex items-center gap-1 mb-4">
        <h2 className="text-slate-300 font-medium">Daily Cost (7-Day)</h2>
        <InfoTooltip
          title="Daily Cost (7-Day)"
          lines={[
            'Source: Per-day aggregation of 1-minute intervals',
            'Each bar = sum of (kW x TOU rate / 60) for that calendar day',
            'Stacked by state: Processing, CIP, Idle, Shutdown',
            'Days use US/Pacific midnight boundaries',
          ]}
        />
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0]?.payload
                return (
                  <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl">
                    <p className="text-slate-200 font-medium mb-1">{p?.day} {p?.label}</p>
                    <p className="text-slate-400 text-sm mb-2">Total: ${(p?.total ?? 0).toFixed(2)}</p>
                    {payload.map((entry) => (
                      <p key={entry.dataKey} className="text-sm" style={{ color: entry.color }}>
                        {entry.name}: ${(entry.value ?? 0).toFixed(2)}
                      </p>
                    ))}
                  </div>
                )
              }}
            />
            <Legend />
            <Bar dataKey="Processing" stackId="a" fill={STATE_COLORS.Processing} />
            <Bar dataKey="CIP" stackId="a" fill={STATE_COLORS.CIP} />
            <Bar dataKey="Idle" stackId="a" fill={STATE_COLORS.Idle} />
            <Bar dataKey="Shutdown" stackId="a" fill={STATE_COLORS.Shutdown} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
