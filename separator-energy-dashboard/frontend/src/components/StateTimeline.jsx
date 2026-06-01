import { useState, useEffect } from "react"
import { fetchTimeline } from "../api/energyApi"
import { formatNumber } from "../utils/formatters"
import InfoTooltip from "./InfoTooltip"
import dayjs from "dayjs"

const STATE_COLORS = {
  Processing: "#00D1AC",
  CIP: "#00AEE5",
  Idle: "#939394",
  Shutdown: "#53565A",
}
const STATE_ORDER = ["Processing", "CIP", "Idle", "Shutdown"]

function Skeleton() {
  return (
    <div className="card p-5 animate-pulse">
      <div className="h-5 w-44 bg-white/[0.06] rounded mb-4" />
      <div className="h-8 bg-white/[0.06] rounded mb-6" />
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-3 bg-white/[0.06] rounded" />
        ))}
      </div>
    </div>
  )
}

export default function StateTimeline({ refreshKey }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    fetchTimeline()
      .then((res) => { if (!cancelled) setData(res.data) })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [refreshKey])

  if (loading && !data) return <Skeleton />
  if (error) return <div className="card p-5 text-red-400">Error: {error}</div>

  const points = data ?? []

  // Collapse adjacent same-state samples into runs for proportional segments.
  const runs = []
  for (const p of points) {
    const last = runs[runs.length - 1]
    if (last && last.state === p.state) {
      last.endIdx = points.indexOf(p)
    } else {
      runs.push({
        state: p.state,
        startIdx: points.indexOf(p),
        endIdx: points.indexOf(p),
        start: p.timestamp,
      })
    }
  }

  // Per-state totals for the distribution table.
  const totalMin = points.length
  const distribution = STATE_ORDER.map((name) => {
    const minutes = points.filter((p) => p.state === name).length
    return {
      name,
      minutes,
      hours: minutes / 60,
      pct: totalMin > 0 ? (minutes / totalMin) * 100 : 0,
    }
  }).sort((a, b) => b.minutes - a.minutes)

  return (
    <div className="card card-hover p-5 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <h2 className="text-sm font-medium text-white">State — 24 hour</h2>
        <InfoTooltip
          title="State timeline — 24 hour"
          lines={[
            "Source: last 24 hours of Process, CIP, Running tags",
            "Strip: chronological run of same-state minutes",
            "Distribution: total minutes per state across the window",
          ]}
        />
      </div>

      <div className="flex h-4 w-full overflow-hidden rounded-full bg-white/[0.04]">
        {points.length === 0 ? (
          <div className="flex-1" />
        ) : (
          runs.map((r, i) => {
            const widthPct = ((r.endIdx - r.startIdx + 1) / totalMin) * 100
            return (
              <div
                key={i}
                className="h-full"
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: STATE_COLORS[r.state] ?? "#53565A",
                }}
                title={`${dayjs(r.start).format("h:mm A")} — ${r.state}`}
              />
            )
          })
        )}
      </div>

      {points.length > 0 && (
        <div className="num mt-2 flex justify-between text-[10px] text-gray-500">
          <span>{dayjs(points[0].timestamp).format("h A")}</span>
          <span>{dayjs(points[Math.floor(points.length / 2)].timestamp).format("h A")}</span>
          <span>{dayjs(points[points.length - 1].timestamp).format("h A")}</span>
        </div>
      )}

      {/* flex-1 + justify-around spreads the 4 distribution rows evenly
          across whatever vertical space is left in the card. On tall cards
          they breathe; on short cards they stay compact. */}
      <div className="mt-5 flex-1 flex flex-col justify-around">
        {distribution.map((s) => (
          <div key={s.name} className="text-xs">
            <div className="mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-gray-300">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATE_COLORS[s.name] }} />
                {s.name}
              </span>
              <span className="num text-gray-400">
                {formatNumber(s.hours)} h · <span className="text-gray-500">{formatNumber(s.pct)}%</span>
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.04]">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${s.pct}%`,
                  backgroundColor: STATE_COLORS[s.name],
                  opacity: 0.7,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
