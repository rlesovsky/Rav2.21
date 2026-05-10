import { useState, useEffect } from "react"
import { fetchDaily } from "../api/energyApi"
import { formatCurrency } from "../utils/formatters"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import InfoTooltip from "./InfoTooltip"
import dayjs from "dayjs"

const STATE_COLORS = {
  Processing: "#22c55e",
  CIP: "#3b82f6",
  Idle: "#f59e0b",
  Shutdown: "#6b7280",
}
const STATE_ORDER = ["Processing", "CIP", "Idle", "Shutdown"]

function Skeleton() {
  return (
    <div className="card p-5 h-80 animate-pulse">
      <div className="h-5 w-44 bg-white/[0.06] rounded mb-4" />
      <div className="h-56 bg-white/[0.06] rounded" />
    </div>
  )
}

export default function CostByDayChart({ refreshKey, days = 7 }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    fetchDaily({ days })
      .then((res) => { if (!cancelled) setData(res.data) })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [refreshKey, days])

  if (loading && !data) return <Skeleton />
  if (error) return <div className="card p-5 text-red-400">Error: {error}</div>

  const chartData = (data ?? []).map((d) => {
    const date = dayjs(d.date)
    const bs = d.by_state ?? {}
    return {
      date: d.date,
      label: date.format("MMM D"),
      day: date.format("ddd"),
      Processing: bs.Processing?.cost_usd ?? 0,
      CIP: bs.CIP?.cost_usd ?? 0,
      Idle: bs.Idle?.cost_usd ?? 0,
      Shutdown: bs.Shutdown?.cost_usd ?? 0,
      total: d.total_cost_usd ?? 0,
    }
  })

  return (
    <div className="card card-hover p-5">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-medium text-white">Daily cost — last {days} days</h2>
        <InfoTooltip
          title={`Daily cost — last ${days} days`}
          lines={[
            "Source: per-day rollup of 1-minute intervals",
            "Each bar = sum of (kW x TOU rate / 60) for that calendar day",
            "Stacked by operating state",
            "Days use US/Pacific midnight boundaries",
          ]}
        />
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${v}`}
            />
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<DayTooltip />} />
            <Bar dataKey="Processing" stackId="a" fill={STATE_COLORS.Processing} />
            <Bar dataKey="CIP" stackId="a" fill={STATE_COLORS.CIP} />
            <Bar dataKey="Idle" stackId="a" fill={STATE_COLORS.Idle} />
            <Bar dataKey="Shutdown" stackId="a" fill={STATE_COLORS.Shutdown} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
        {STATE_ORDER.map((name) => (
          <span key={name} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATE_COLORS[name] }} />
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}

function DayTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload
  return (
    <div className="rounded-lg border border-white/[0.10] bg-black px-3 py-2 text-xs">
      <div className="text-white mb-1">
        {p?.day} {p?.label} · <span className="num">{formatCurrency(p?.total ?? 0)}</span>
      </div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-gray-400">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="flex-1">{entry.name}</span>
          <span className="num">{formatCurrency(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}
