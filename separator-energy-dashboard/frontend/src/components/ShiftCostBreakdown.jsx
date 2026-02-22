import { useState, useEffect, Fragment } from 'react'
import { fetchSummary } from '../api/energyApi'
import { formatCurrency, formatKwh, formatHours } from '../utils/formatters'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import InfoTooltip from './InfoTooltip'

const STATE_COLORS = {
  Processing: '#22C55E',
  CIP: '#3B82F6',
  Idle: '#F59E0B',
  Shutdown: '#6B7280',
}

const SHIFT_COLORS = {
  '1st Shift': '#06B6D4',
  '2nd Shift': '#8B5CF6',
  '3rd Shift': '#F59E0B',
}

function Skeleton() {
  return (
    <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 h-96 animate-pulse">
      <div className="h-6 bg-slate-700/50 rounded w-32 mb-4" />
      <div className="h-64 bg-slate-700/50 rounded" />
    </div>
  )
}

export default function ShiftCostBreakdown({ refreshKey, onRefreshComplete }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    fetchSummary()
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
        <h2 className="text-slate-300 font-medium mb-4">Cost by Shift</h2>
        <div className="text-red-400">Error: {error}</div>
      </div>
    )
  }

  const byShift = data?.by_shift ?? {}
  const shiftNames = ['1st Shift', '2nd Shift', '3rd Shift']
  const barData = shiftNames.map((name) => {
    const s = byShift[name]
    if (!s) return { name, Processing: 0, CIP: 0, Idle: 0, Shutdown: 0, total: 0 }
    const byState = s.by_state ?? {}
    const Processing = byState.Processing?.cost_usd ?? 0
    const CIP = byState.CIP?.cost_usd ?? 0
    const Idle = byState.Idle?.cost_usd ?? 0
    const Shutdown = byState.Shutdown?.cost_usd ?? 0
    return { name, Processing, CIP, Idle, Shutdown, total: (s.cost_usd ?? 0) }
  })

  return (
    <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 hover:border-slate-500 hover:bg-slate-800/60 transition-all duration-200">
      <div className="flex items-center gap-1 mb-4">
        <h2 className="text-slate-300 font-medium">7-Day Cost by Shift</h2>
        <InfoTooltip
          title="Cost by Shift"
          lines={[
            'Source: 7-day data grouped by shift window',
            '1st Shift: 6:00 AM – 2:00 PM Pacific',
            '2nd Shift: 2:00 PM – 10:00 PM Pacific',
            '3rd Shift: 10:00 PM – 6:00 AM Pacific',
            'Each minute assigned to its shift, then cost summed',
            'Cost per minute = kW x TOU rate / 60',
          ]}
        />
      </div>
      <div className="h-64 mb-6">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              cursor={{ fill: 'rgba(148,163,184,0.08)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                return (
                  <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl">
                    <p className="text-slate-200 font-medium mb-1">{label}</p>
                    {payload.map((entry) => (
                      <p key={entry.dataKey} className="text-sm" style={{ color: entry.color }}>
                        {entry.name}: {formatCurrency(entry.value)}
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
      <div className="bg-slate-700/30 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 border-b border-slate-600/50">
              <th className="text-left py-2 px-3">Shift</th>
              <th className="text-right py-2 px-3">Hours</th>
              <th className="text-right py-2 px-3">kWh</th>
              <th className="text-right py-2 px-3">Cost</th>
            </tr>
          </thead>
          <tbody>
            {shiftNames.map((name) => {
              const s = byShift[name]
              if (!s) return null
              return (
                <Fragment key={name}>
                  <tr className="border-b border-slate-600/30">
                    <td className="py-2 px-3">
                      <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: SHIFT_COLORS[name] }} />
                      {name}
                    </td>
                    <td className="text-right font-mono text-slate-300 py-2 px-3">{formatHours(s.hours)}</td>
                    <td className="text-right font-mono text-slate-300 py-2 px-3">{formatKwh(s.kwh)}</td>
                    <td className="text-right font-mono text-slate-300 py-2 px-3">{formatCurrency(s.cost_usd)}</td>
                  </tr>
                  {Object.entries(s.by_state ?? {}).map(([stateName, st]) => (
                    <tr key={`${name}-${stateName}`} className="bg-slate-800/30">
                      <td className="py-1 px-3 pl-6 text-slate-400">{stateName}</td>
                      <td className="text-right font-mono text-slate-400 py-1 px-3">{formatHours(st.hours)}</td>
                      <td className="text-right font-mono text-slate-400 py-1 px-3">{formatKwh(st.kwh)}</td>
                      <td className="text-right font-mono text-slate-400 py-1 px-3">{formatCurrency(st.cost_usd)}</td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
