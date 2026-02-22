import { useState, useEffect } from 'react'
import { fetchTimeline } from '../api/energyApi'
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
    <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 h-32 animate-pulse">
      <div className="h-6 bg-slate-700/50 rounded w-48 mb-4" />
      <div className="h-12 bg-slate-700/50 rounded w-full" />
    </div>
  )
}

export default function StateTimeline({ refreshKey, onRefreshComplete }) {
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
        <h2 className="text-slate-300 font-medium mb-4">State Timeline (24-Hour)</h2>
        <div className="text-red-400">Error: {error}</div>
      </div>
    )
  }

  const points = data ?? []
  const step = Math.max(1, Math.floor(points.length / 200))
  const segmentWidth = 100 / Math.max(1, Math.ceil(points.length / step))

  const labels = []
  if (points.length > 0) {
    const start = dayjs(points[0].timestamp)
    for (let h = 0; h <= 24; h += 4) {
      const t = start.add(h, 'hour')
      const idx = points.findIndex((p) => dayjs(p.timestamp).isAfter(t) || dayjs(p.timestamp).isSame(t, 'minute'))
      if (idx >= 0) labels.push({ idx, label: t.format('h A') })
    }
  }

  return (
    <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 hover:border-slate-500 hover:bg-slate-800/60 transition-all duration-200">
      <div className="flex items-center gap-1 mb-4">
        <h2 className="text-slate-300 font-medium">State Timeline (24-Hour)</h2>
        <InfoTooltip
          title="State Timeline (24-Hour)"
          lines={[
            'Source: Last 24 hours of Process, CIP, Running tags',
            'Each colored segment = 1-minute state classification',
            'Green = Processing, Blue = CIP, Amber = Idle, Gray = Shutdown',
            'Boolean tags are forward-filled between on-change events',
            'Hover a segment to see exact time and state',
          ]}
        />
      </div>
      <div className="bg-slate-700/30 rounded-lg p-4">
        <div
          className="flex h-8 rounded overflow-hidden"
          style={{ minHeight: '2rem' }}
        >
          {points.length === 0 ? (
            <div className="flex-1 bg-slate-700/50 rounded" />
          ) : (
            points.filter((_, i) => i % step === 0).map((p, i) => (
              <div
                key={i}
                className="h-full flex-shrink-0 transition-opacity hover:opacity-90"
                style={{
                  width: `${segmentWidth}%`,
                  backgroundColor: STATE_COLORS[p.state] ?? '#6B7280',
                  minWidth: '2px',
                }}
                title={`${dayjs(p.timestamp).format('h:mm A')} — ${p.state}`}
              />
            ))
          )}
        </div>
        <div className="flex justify-between mt-2 text-slate-500 text-xs font-mono">
          {points.length > 0 && (
            <>
              <span>{dayjs(points[0].timestamp).format('h A')}</span>
              <span>{dayjs(points[Math.floor(points.length / 2)].timestamp).format('h A')}</span>
              <span>{dayjs(points[points.length - 1].timestamp).format('h A')}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex gap-4 mt-3">
        {Object.entries(STATE_COLORS).map(([name, color]) => (
          <span key={name} className="flex items-center gap-1.5 text-sm text-slate-400">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}
