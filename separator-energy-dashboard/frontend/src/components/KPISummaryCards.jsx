import { useState, useEffect } from 'react'
import { fetchSummary } from '../api/energyApi'
import { formatCurrency, formatKwh } from '../utils/formatters'
import { DollarSign, Zap, Clock, Activity } from 'lucide-react'
import InfoTooltip from './InfoTooltip'

function CardSkeleton() {
  return (
    <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 h-32 animate-pulse">
      <div className="h-10 w-10 bg-slate-700/50 rounded-lg mb-3" />
      <div className="h-8 bg-slate-700/50 rounded w-24 mb-2" />
      <div className="h-4 bg-slate-700/50 rounded w-20" />
    </div>
  )
}

const accentStyles = {
  cyan: { bg: '#06B6D420', color: '#22D3EE', glow: '0 0 20px #06B6D422' },
  purple: { bg: '#8B5CF620', color: '#A78BFA', glow: '0 0 20px #8B5CF622' },
  amber: { bg: '#F59E0B20', color: '#FBBF24', glow: '0 0 20px #F59E0B22' },
  green: { bg: '#22C55E20', color: '#4ADE80', glow: '0 0 20px #22C55E22' },
}

export default function KPISummaryCards({ refreshKey, onRefreshComplete }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setError(null)
    fetchSummary()
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message || 'Failed to load'))
      .finally(() => {
        setLoading(false)
        onRefreshComplete?.()
      })
  }, [refreshKey, onRefreshComplete])

  if (loading && !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 text-red-400">
        Error: {error}
      </div>
    )
  }

  const totalHours = data?.by_state
    ? Object.values(data.by_state).reduce((sum, s) => sum + (s.hours ?? 0), 0)
    : 0
  const avgPerHour = totalHours > 0 && data?.total_cost_usd != null
    ? data.total_cost_usd / totalHours
    : 0
  const processingPct = data?.by_state?.Processing?.pct_time ?? 0

  const cards = [
    {
      label: '7-Day Cost', value: formatCurrency(data?.total_cost_usd), icon: DollarSign, ...accentStyles.cyan,
      info: {
        title: '7-Day Cost',
        lines: [
          'Source: 7-day Motor Amps from TimeBase Historian',
          'kW = (Amps x 460V x 1.732 x 0.88) / 1000',
          'Cost = kW x TOU rate x (1 min / 60)',
          'Summed across all 1-minute intervals',
        ],
      },
    },
    {
      label: 'Total Energy', value: formatKwh(data?.total_kwh), icon: Zap, ...accentStyles.purple,
      info: {
        title: 'Total Energy',
        lines: [
          'kWh = kW x (1 min / 60) per interval',
          'Summed across all 1-minute intervals for 7 days',
        ],
      },
    },
    {
      label: 'Avg $/hr', value: formatCurrency(avgPerHour), icon: Clock, ...accentStyles.amber,
      info: {
        title: 'Avg $/hr',
        lines: [
          'Avg $/hr = Total 7-Day Cost / Total Hours',
          'Includes all states (Processing, CIP, Idle, Shutdown)',
        ],
      },
    },
    {
      label: 'Processing %', value: `${(processingPct ?? 0).toFixed(1)}%`, icon: Activity, ...accentStyles.green,
      info: {
        title: 'Processing %',
        lines: [
          'Processing % = Processing Hours / Total Hours x 100',
          'Processing state = Process tag is true (from Process Values)',
        ],
      },
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(({ label, value, icon: Icon, bg, color, glow, info }) => (
        <div
          key={label}
          className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 hover:border-slate-500 hover:bg-slate-800/60 transition-all duration-200 hover:scale-[1.02]"
          style={{ boxShadow: 'none' }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = glow)}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
        >
          <div className="flex items-start justify-between mb-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: bg }}
            >
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
            {info && <InfoTooltip title={info.title} lines={info.lines} />}
          </div>
          <p className="text-2xl font-semibold text-slate-100 font-mono">{value}</p>
          <p className="text-slate-500 text-sm mt-1">{label}</p>
        </div>
      ))}
    </div>
  )
}
