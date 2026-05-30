import { useState, useEffect } from 'react'
import { fetchCurrent } from '../api/energyApi'
import { formatCurrency, formatKw, formatRate } from '../utils/formatters'
import InfoTooltip from './InfoTooltip'
import { STATE_COLORS } from '../theme/chartColors'
import dayjs from 'dayjs'

function Skeleton() {
  return (
    <div className="bg-[#0e2140] backdrop-blur-sm border border-[#1c3253] rounded-xl p-6 animate-pulse">
      <div className="h-6 bg-[#152846] rounded w-1/3 mb-4" />
      <div className="flex flex-wrap gap-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-8 bg-[#152846] rounded w-24" />
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

  const stateColor = STATE_COLORS[data?.state] ?? '#5b7193'
  const lastUpdated = lastFetch ? dayjs(lastFetch).format('MMM D, h:mm:ss A') : '—'

  return (
    <div className="bg-[#0e2140] backdrop-blur-sm border border-[#1c3253] rounded-xl p-6 hover:border-[#2f86d8] hover:bg-[#0e2140] transition-all duration-200 hover:scale-[1.02]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1">
          <h2 className="text-[#e8f0fb] font-medium">Live Status</h2>
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
        <span className="text-[#67809f] text-sm">Last updated: {lastUpdated}</span>
      </div>
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: stateColor }} />
          <span
            className="px-3 py-1 rounded-lg text-sm font-medium text-[#e8f0fb]"
            style={{ backgroundColor: `${stateColor}20` }}
          >
            {data?.state ?? '—'}
          </span>
        </div>
        <div>
          <span className="text-[#67809f] text-sm">Amps</span>
          <p className="font-mono text-[#e8f0fb]">{data?.amps != null ? data.amps.toFixed(1) : '—'}</p>
        </div>
        <div>
          <span className="text-[#67809f] text-sm">kW</span>
          <p className="font-mono text-[#e8f0fb]">{data?.kw != null ? formatKw(data.kw) : '—'}</p>
        </div>
        <div>
          <span className="text-[#67809f] text-sm">$/hr</span>
          <p className="font-mono text-[#e8f0fb]">{data?.cost_per_hour != null ? formatCurrency(data.cost_per_hour) : '—'}</p>
        </div>
        <div>
          <span className="text-[#67809f] text-sm">TOU Period</span>
          <p className="font-mono text-[#e8f0fb]">{data?.tou_period ?? '—'}</p>
        </div>
        <div>
          <span className="text-[#67809f] text-sm">TOU Rate</span>
          <p className="font-mono text-[#e8f0fb]">{data?.tou_rate != null ? formatRate(data.tou_rate) : '—'}</p>
        </div>
        <div>
          <span className="text-[#67809f] text-sm">Shift</span>
          <p className="font-mono text-[#e8f0fb]">{data?.shift ?? '—'}</p>
        </div>
      </div>
    </div>
  )
}
