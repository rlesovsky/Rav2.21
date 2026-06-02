import { useState, useEffect } from "react"
import { fetchSummary } from "../api/energyApi"
import { formatCurrency } from "../utils/formatters"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import InfoTooltip from "./InfoTooltip"
import { STATE_COLORS } from "../config/stateColors"
const STATE_ORDER = ["Processing", "CIP", "Idle", "Shutdown"]
const SHIFTS = ["1st Shift", "2nd Shift", "3rd Shift"]

function Skeleton() {
  return (
    <div className="card p-5 h-96 animate-pulse">
      <div className="h-5 w-32 bg-white/[0.06] rounded mb-4" />
      <div className="h-64 bg-white/[0.06] rounded" />
    </div>
  )
}

export default function ShiftCostBreakdown({ refreshKey, days = 7 }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    fetchSummary({ days })
      .then((res) => { if (!cancelled) setData(res.data) })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [refreshKey, days])

  if (loading && !data) return <Skeleton />
  if (error) return <div className="card p-5 text-red-400">Error: {error}</div>

  const byShift = data?.by_shift ?? {}
  const barData = SHIFTS.map((name) => {
    const s = byShift[name]
    const bs = s?.by_state ?? {}
    return {
      name: name.replace(" Shift", ""),
      Processing: bs.Processing?.cost_usd ?? 0,
      CIP: bs.CIP?.cost_usd ?? 0,
      Idle: bs.Idle?.cost_usd ?? 0,
      Shutdown: bs.Shutdown?.cost_usd ?? 0,
      total: s?.cost_usd ?? 0,
    }
  })

  return (
    <div className="card card-hover p-5">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-medium text-white">
          {days === 7 ? "7-day" : `${days}-day`} cost by shift
        </h2>
        <InfoTooltip
          title="Cost by shift"
          lines={[
            "1st: 6 AM – 2 PM Pacific",
            "2nd: 2 PM – 10 PM Pacific",
            "3rd: 10 PM – 6 AM Pacific",
            "Each minute assigned to its shift, then cost summed",
            "Stacked by operating state",
          ]}
        />
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="name"
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
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<StackedTooltip />} />
            <Bar dataKey="Processing" stackId="a" fill={STATE_COLORS.Processing} radius={[0, 0, 0, 0]} />
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

function StackedTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0)
  return (
    <div className="rounded-lg border border-white/[0.10] bg-black px-3 py-2 text-xs">
      <div className="text-white mb-1">{label} shift · {formatCurrency(total)}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-gray-400">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="flex-1">{p.name}</span>
          <span className="num">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  )
}
