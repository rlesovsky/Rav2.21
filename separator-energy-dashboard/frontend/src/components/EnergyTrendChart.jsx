import { useState, useEffect } from "react"
import { fetchTimeline } from "../api/energyApi"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import InfoTooltip from "./InfoTooltip"
import dayjs from "dayjs"

function Skeleton({ className = "" }) {
  return (
    <div className={`card p-5 min-h-80 animate-pulse ${className}`}>
      <div className="h-5 w-44 bg-white/[0.06] rounded mb-4" />
      <div className="h-56 bg-white/[0.06] rounded" />
    </div>
  )
}

export default function EnergyTrendChart({ refreshKey, className = "" }) {
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

  if (loading && !data) return <Skeleton className={className} />
  if (error) return <div className={`card p-5 text-red-400 ${className}`}>Error: {error}</div>

  // Insert null-kw breaks where points are >5 minutes apart so the line
  // doesn't draw across dead time.
  const GAP_MS = 5 * 60 * 1000
  const raw = (data ?? []).map((p) => ({
    ...p,
    ts: dayjs(p.timestamp).valueOf(),
    fullTime: dayjs(p.timestamp).format("MMM D, h:mm A"),
  }))
  const chartData = []
  for (let i = 0; i < raw.length; i++) {
    if (i > 0 && raw[i].ts - raw[i - 1].ts > GAP_MS) {
      chartData.push({ ts: raw[i - 1].ts + 1, kw: null })
    }
    chartData.push(raw[i])
  }

  // Hourly ticks across the visible window, downsampled if it gets crowded.
  const hourlyTicks = (() => {
    if (!chartData.length) return []
    const first = dayjs(chartData[0].ts).startOf("hour")
    const last = dayjs(chartData[chartData.length - 1].ts)
    const ticks = []
    let cur = first
    while (cur.isBefore(last) || cur.isSame(last)) {
      ticks.push(cur.valueOf())
      cur = cur.add(1, "hour")
    }
    if (ticks.length > 24) return ticks.filter((_, i) => i % 3 === 0)
    if (ticks.length > 14) return ticks.filter((_, i) => i % 2 === 0)
    return ticks
  })()

  // Auto-zoom Y axis to the actual data range so the chart isn't 75% empty.
  const kwValues = chartData.map((p) => p.kw).filter((v) => v != null && Number.isFinite(v))
  const yDomain = (() => {
    if (kwValues.length === 0) return [0, "auto"]
    const min = Math.min(...kwValues)
    const max = Math.max(...kwValues)
    const span = Math.max(1, max - min)
    const pad = span * 0.15
    return [Math.max(0, Math.floor(min - pad)), Math.ceil(max + pad)]
  })()

  return (
    // The card IS the flex item — `className` from the parent supplies the
    // flex sizing (e.g. "flex-[4] min-h-80"). Inside the card, header is
    // shrink-0 and the chart container takes flex-1 to fill the remainder.
    <div className={`card card-hover p-5 flex flex-col min-h-80 ${className}`}>
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <h2 className="text-sm font-medium text-white">Power draw — 24 hour</h2>
        <InfoTooltip
          title="Power draw — 24 hour"
          lines={[
            "Source: last 24 hours of Motor Amps from Timebase",
            "Snapped to nearest 1-minute (no interpolation)",
            "kW = (Amps x 460V x 1.732 x 0.88) / 1000",
            "Y axis auto-zoomed to data range; gradient fill shows magnitude",
          ]}
        />
      </div>
      {/* Recharts ResponsiveContainer needs a definite-sized parent. When the
          card is grown via flex-1 inside a nested flex column, the chained
          h-full / flex-1 doesn't always resolve to a measurable pixel value
          and the chart renders 0x0. Wrapping it in relative+absolute gives
          ResponsiveContainer real dimensions to read. */}
      <div className="flex-1 min-h-64 relative">
        <div className="absolute inset-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="kwFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              domain={["dataMin", "dataMax"]}
              scale="time"
              ticks={hourlyTicks}
              tickFormatter={(v) => dayjs(v).format("h A")}
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}`}
              domain={yDomain}
            />
            <Tooltip cursor={{ stroke: "rgba(255,255,255,0.10)", strokeDasharray: "3 3" }} content={<TrendTooltip />} />
            <Area
              type="monotone"
              dataKey="kw"
              stroke="#22d3ee"
              strokeWidth={1.75}
              fill="url(#kwFill)"
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function TrendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload
  if (p?.kw == null) return null
  return (
    <div className="rounded-lg border border-white/[0.12] bg-[#0a0a0a] px-3 py-2 text-xs">
      {p && (
        <div className="text-white mb-0.5">
          {p.fullTime}{p.state ? ` · ${p.state}` : ""}
          {p.tou_period ? ` · ${p.tou_period}` : ""}
        </div>
      )}
      <div className="num text-cyan-400">{Number(payload[0].value).toFixed(1)} kW</div>
    </div>
  )
}
