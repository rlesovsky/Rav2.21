import { useState, useEffect, Fragment } from 'react'
import { fetchSummary } from '../api/energyApi'
import { formatCurrency, formatKwh, formatHours } from '../utils/formatters'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import InfoTooltip from './InfoTooltip'
import { STATE_COLORS, CHART } from '../theme/chartColors'

const SHIFT_COLORS = {
  '1st Shift': '#2bb6b3',
  '2nd Shift': '#2f86d8',
  '3rd Shift': '#f2a43a',
}

function Skeleton() {
  return (
    <div className="bg-[#0e2140] backdrop-blur-sm border border-[#1c3253] rounded-xl p-6 h-96 animate-pulse">
      <div className="h-6 bg-[#152846] rounded w-32 mb-4" />
      <div className="h-64 bg-[#152846] rounded" />
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
      <div className="bg-[#0e2140] border border-[#1c3253] rounded-xl p-6">
        <h2 className="text-[#e8f0fb] font-medium mb-4">Cost by Shift</h2>
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
    <div className="bg-[#0e2140] backdrop-blur-sm border border-[#1c3253] rounded-xl p-6 hover:border-[#2f86d8] hover:bg-[#0e2140] transition-all duration-200">
      <div className="flex items-center gap-1 mb-4">
        <h2 className="text-[#e8f0fb] font-medium">7-Day Cost by Shift</h2>
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
            <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
            <XAxis dataKey="name" tick={{ fill: CHART.axis, fontSize: 12 }} />
            <YAxis tick={{ fill: CHART.axis, fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              cursor={{ fill: 'rgba(148,163,184,0.08)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                return (
                  <div className="bg-[#0b1a33] border border-[#1c3253] rounded-lg p-3 shadow-xl">
                    <p className="text-[#e8f0fb] font-medium mb-1">{label}</p>
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
      <div className="bg-[#152846] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[#67809f] border-b border-[#1c3253]">
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
                  <tr className="border-b border-[#1c3253]">
                    <td className="py-2 px-3">
                      <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: SHIFT_COLORS[name] }} />
                      {name}
                    </td>
                    <td className="text-right font-mono text-[#e8f0fb] py-2 px-3">{formatHours(s.hours)}</td>
                    <td className="text-right font-mono text-[#e8f0fb] py-2 px-3">{formatKwh(s.kwh)}</td>
                    <td className="text-right font-mono text-[#e8f0fb] py-2 px-3">{formatCurrency(s.cost_usd)}</td>
                  </tr>
                  {Object.entries(s.by_state ?? {}).map(([stateName, st]) => (
                    <tr key={`${name}-${stateName}`} className="bg-[#0e2140]">
                      <td className="py-1 px-3 pl-6 text-[#9fb4d2]">{stateName}</td>
                      <td className="text-right font-mono text-[#9fb4d2] py-1 px-3">{formatHours(st.hours)}</td>
                      <td className="text-right font-mono text-[#9fb4d2] py-1 px-3">{formatKwh(st.kwh)}</td>
                      <td className="text-right font-mono text-[#9fb4d2] py-1 px-3">{formatCurrency(st.cost_usd)}</td>
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
