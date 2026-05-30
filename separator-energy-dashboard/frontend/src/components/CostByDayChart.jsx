import { useState, useEffect } from 'react'
import { fetchDaily } from '../api/energyApi'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import InfoTooltip from './InfoTooltip'
import { STATE_COLORS, CHART } from '../theme/chartColors'
import dayjs from 'dayjs'

function Skeleton() {
  return (
    <div className="bg-[#0e2140] backdrop-blur-sm border border-[#1c3253] rounded-xl p-6 h-80 animate-pulse">
      <div className="h-6 bg-[#152846] rounded w-40 mb-4" />
      <div className="h-56 bg-[#152846] rounded" />
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
      <div className="bg-[#0e2140] border border-[#1c3253] rounded-xl p-6">
        <h2 className="text-[#e8f0fb] font-medium mb-4">Daily Cost (7-Day)</h2>
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
    <div className="bg-[#0e2140] backdrop-blur-sm border border-[#1c3253] rounded-xl p-6 hover:border-[#2f86d8] hover:bg-[#0e2140] transition-all duration-200">
      <div className="flex items-center gap-1 mb-4">
        <h2 className="text-[#e8f0fb] font-medium">Daily Cost (7-Day)</h2>
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
            <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
            <XAxis dataKey="label" tick={{ fill: CHART.axis, fontSize: 12 }} />
            <YAxis tick={{ fill: CHART.axis, fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0]?.payload
                return (
                  <div className="bg-[#0b1a33] border border-[#1c3253] rounded-lg p-3 shadow-xl">
                    <p className="text-[#e8f0fb] font-medium mb-1">{p?.day} {p?.label}</p>
                    <p className="text-[#9fb4d2] text-sm mb-2">Total: ${(p?.total ?? 0).toFixed(2)}</p>
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
