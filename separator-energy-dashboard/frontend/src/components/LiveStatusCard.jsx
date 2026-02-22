import { useState, useEffect } from 'react'
import { fetchCurrent } from '../api/energyApi'
import { formatCurrency, formatKw, formatRate } from '../utils/formatters'
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
    <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 animate-pulse">
      <div className="h-6 bg-slate-700/50 rounded w-1/3 mb-4" />
      <div className="flex flex-wrap gap-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-8 bg-slate-700/50 rounded w-24" />
        ))}
      </div>
    </div>
  )
}

export default function LiveStatusCard({ refreshKey, onRefreshComplete }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastFetch, setLastFetch] = useState(null)

  useEffect(() => {
    setError(null)
    fetchCurrent()
      .then((res) => {
        setData(res.data)
        setLastFetch(Date.now())
      })
      .catch((err) => setError(err.message || 'Failed to load'))
      .finally(() => {
        setLoading(false)
        onRefreshComplete?.()
      })
  }, [refreshKey, onRefreshComplete])

  if (loading && !data) return <Skeleton />
  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 text-red-400">
        Error: {error}
      </div>
    )
  }

  const stateColor = STATE_COLORS[data?.state] ?? '#6B7280'
  const lastUpdated = lastFetch ? dayjs(lastFetch).format('MMM D, h:mm:ss A') : '—'

  return (
    <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 hover:border-slate-500 hover:bg-slate-800/60 transition-all duration-200 hover:scale-[1.02]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1">
          <h2 className="text-slate-300 font-medium">Live Status</h2>
          <InfoTooltip
            title="Live Status"
            lines={[
              'Source: TimeBase Historian (last 2-min window)',
              'Tags: Motor Amps, Process, CIP, Running (Process Values)',
              'kW = (Amps x 460V x 1.732 x 0.88 PF) / 1000',
              '$/hr = kW x TOU Rate (SCE TOU-GS-2)',
              'Processing=Process true, CIP=CIP true, Idle=Running true (no Process/CIP), Shutdown=all false',
              'Shifts: 1st (6A-2P), 2nd (2P-10P), 3rd (10P-6A) Pacific',
            ]}
          />
        </div>
        <span className="text-slate-500 text-sm">Last updated: {lastUpdated}</span>
      </div>
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: stateColor }} />
          <span
            className="px-3 py-1 rounded-lg text-sm font-medium text-slate-100"
            style={{ backgroundColor: `${stateColor}20` }}
          >
            {data?.state ?? '—'}
          </span>
        </div>
        <div>
          <span className="text-slate-500 text-sm">Amps</span>
          <p className="font-mono text-slate-300">{data?.amps != null ? data.amps.toFixed(1) : '—'}</p>
        </div>
        <div>
          <span className="text-slate-500 text-sm">kW</span>
          <p className="font-mono text-slate-300">{data?.kw != null ? formatKw(data.kw) : '—'}</p>
        </div>
        <div>
          <span className="text-slate-500 text-sm">$/hr</span>
          <p className="font-mono text-slate-300">{data?.cost_per_hour != null ? formatCurrency(data.cost_per_hour) : '—'}</p>
        </div>
        <div>
          <span className="text-slate-500 text-sm">TOU Period</span>
          <p className="font-mono text-slate-300">{data?.tou_period ?? '—'}</p>
        </div>
        <div>
          <span className="text-slate-500 text-sm">TOU Rate</span>
          <p className="font-mono text-slate-300">{data?.tou_rate != null ? formatRate(data.tou_rate) : '—'}</p>
        </div>
        <div>
          <span className="text-slate-500 text-sm">Shift</span>
          <p className="font-mono text-slate-300">{data?.shift ?? '—'}</p>
        </div>
      </div>
    </div>
  )
}
