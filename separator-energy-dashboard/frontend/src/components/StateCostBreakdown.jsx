import { useState, useEffect } from 'react'
import { fetchSummary } from '../api/energyApi'
import { formatCurrency, formatKwh, formatHours, formatPercent } from '../utils/formatters'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import InfoTooltip from './InfoTooltip'
import { STATE_COLORS, CHART } from '../theme/chartColors'

function Skeleton() {
  return (
    <div className="bg-[#0e2140] backdrop-blur-sm border border-[#1c3253] rounded-xl p-6 h-96 animate-pulse">
      <div className="h-6 bg-[#152846] rounded w-48 mb-4" />
      <div className="h-64 bg-[#152846] rounded" />
    </div>
  )
}

export default function StateCostBreakdown({ refreshKey, onRefreshComplete }) {
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
        <h2 className="text-[#e8f0fb] font-medium mb-4">Cost by Operating State</h2>
        <div className="text-red-400">Error: {error}</div>
      </div>
    )
  }

  const byState = data?.by_state ?? {}
  const pieData = Object.entries(byState).map(([name, s]) => ({
    name,
    value: s.cost_usd ?? 0,
    color: STATE_COLORS[name] ?? '#5b7193',
  })).filter((d) => d.value > 0)

  return (
    <div className="bg-[#0e2140] backdrop-blur-sm border border-[#1c3253] rounded-xl p-6 hover:border-[#2f86d8] hover:bg-[#0e2140] transition-all duration-200">
      <div className="flex items-center gap-1 mb-4">
        <h2 className="text-[#e8f0fb] font-medium">7-Day Cost by Operating State</h2>
        <InfoTooltip
          title="Cost by Operating State"
          lines={[
            'Source: 7-day data from TimeBase Historian',
            'Tags: Process, CIP, Running (Process Values)',
            'Processing: Process=true',
            'CIP: CIP=true',
            'Idle: Running=true, Process & CIP both false',
            'Shutdown: all tags false',
            'Cost per minute = kW x TOU rate / 60',
            '% = state cost / total cost x 100',
          ]}
        />
      </div>
      <div className="h-64 mb-6">
        {pieData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius="80%"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {pieData.map((entry, i) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  return (
                    <div className="bg-[#0b1a33] border border-[#1c3253] rounded-lg p-3 shadow-xl">
                      {payload.map((entry) => (
                        <p key={entry.name} className="text-sm" style={{ color: entry.payload?.color || entry.color }}>
                          {entry.name}: {formatCurrency(entry.value)}
                        </p>
                      ))}
                    </div>
                  )
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-[#67809f]">No data</div>
        )}
      </div>
      <div className="bg-[#152846] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[#67809f] border-b border-[#1c3253]">
              <th className="text-left py-2 px-3">State</th>
              <th className="text-right py-2 px-3">Hours</th>
              <th className="text-right py-2 px-3">kWh</th>
              <th className="text-right py-2 px-3">Cost</th>
              <th className="text-right py-2 px-3">%</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(byState).map(([name, s]) => (
              <tr key={name} className="border-b border-[#1c3253] last:border-0">
                <td className="py-2 px-3">
                  <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: STATE_COLORS[name] ?? '#5b7193' }} />
                  {name}
                </td>
                <td className="text-right font-mono text-[#e8f0fb] py-2 px-3">{formatHours(s.hours)}</td>
                <td className="text-right font-mono text-[#e8f0fb] py-2 px-3">{formatKwh(s.kwh)}</td>
                <td className="text-right font-mono text-[#e8f0fb] py-2 px-3">{formatCurrency(s.cost_usd)}</td>
                <td className="text-right font-mono text-[#e8f0fb] py-2 px-3">{formatPercent(s.pct_time)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
