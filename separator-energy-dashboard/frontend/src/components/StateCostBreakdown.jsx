import { useState, useEffect } from "react"
import { fetchSummary } from "../api/energyApi"
import { formatCurrency, formatPercent } from "../utils/formatters"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import InfoTooltip from "./InfoTooltip"

const STATE_COLORS = {
  Processing: "#22c55e",
  CIP: "#3b82f6",
  Idle: "#f59e0b",
  Shutdown: "#6b7280",
}
const STATE_ORDER = ["Processing", "CIP", "Idle", "Shutdown"]

function Skeleton() {
  return (
    <div className="card p-5 h-96 animate-pulse">
      <div className="h-5 w-48 bg-white/[0.06] rounded mb-4" />
      <div className="h-64 bg-white/[0.06] rounded" />
    </div>
  )
}

export default function StateCostBreakdown({ refreshKey, days = 7 }) {
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

  const byState = data?.by_state ?? {}
  const pieData = STATE_ORDER
    .map((name) => ({
      name,
      value: byState[name]?.cost_usd ?? 0,
      pct: byState[name]?.pct_time ?? 0,
      color: STATE_COLORS[name],
    }))
    .filter((d) => d.value > 0)

  return (
    <div className="card card-hover p-5">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-medium text-white">
          {days === 7 ? "7-day" : `${days}-day`} cost by operating state
        </h2>
        <InfoTooltip
          title="Cost by operating state"
          lines={[
            "Source: 7-day data from Timebase",
            "Processing = Process true",
            "CIP = CIP true",
            "Idle = Running true, Process & CIP false",
            "Shutdown = all tags false",
            "Cost per minute = kW x TOU rate / 60",
          ]}
        />
      </div>

      <div className="h-64">
        {pieData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="58%"
                outerRadius="86%"
                stroke="none"
                paddingAngle={1.5}
                isAnimationActive={false}
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<DonutTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">No data</div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        {STATE_ORDER.map((name) => (
          <span key={name} className="flex items-center gap-1.5 text-gray-400">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATE_COLORS[name] }} />
            <span>{name}</span>
            <span className="num text-gray-500">
              {formatPercent(byState[name]?.pct_time ?? 0)}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

function DonutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="rounded-lg border border-white/[0.10] bg-black px-3 py-2 text-xs">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.payload.color }} />
        <span className="text-white">{p.name}</span>
      </div>
      <div className="num text-gray-400">{formatCurrency(p.value)} · {formatPercent(p.payload.pct)}</div>
    </div>
  )
}
