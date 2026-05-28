import { useState, useEffect } from "react"
import { fetchSummary } from "../api/energyApi"
import { formatCurrency, formatNumber } from "../utils/formatters"
import { DollarSign, Zap, Clock, Activity, Flame, Info } from "lucide-react"
import InfoTooltip from "./InfoTooltip"
import Delta from "./Delta"

const TINT = {
  cyan:   { bg: "rgba(34, 211, 238, 0.10)",  fg: "#22d3ee" },
  purple: { bg: "rgba(167, 139, 250, 0.10)", fg: "#a78bfa" },
  amber:  { bg: "rgba(245, 158, 11, 0.10)",  fg: "#f59e0b" },
  green:  { bg: "rgba(34, 197, 94, 0.10)",   fg: "#22c55e" },
  red:    { bg: "rgba(239, 68, 68, 0.10)",   fg: "#ef4444" },
}

function CardSkeleton() {
  return (
    <div className="card p-5 h-32 animate-pulse">
      <div className="h-9 w-9 bg-white/[0.06] rounded-lg mb-4" />
      <div className="h-3 w-16 bg-white/[0.06] rounded mb-2" />
      <div className="h-7 w-24 bg-white/[0.06] rounded" />
    </div>
  )
}

export default function KPISummaryCards({ refreshKey, days = 7 }) {
  const [current, setCurrent] = useState(null)
  const [previous, setPrevious] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    setLoading(true)

    // Parallel fetch of current and prior period for delta computation.
    Promise.all([
      fetchSummary({ days }),
      fetchSummary({ days, offset: days }),
    ])
      .then(([cur, prev]) => {
        if (cancelled) return
        setCurrent(cur.data)
        setPrevious(prev.data)
      })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load") })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [refreshKey, days])

  if (loading && !current) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => <CardSkeleton key={i} />)}
      </div>
    )
  }
  if (error) return <div className="card p-5 text-red-400">Error: {error}</div>

  const cards = computeCards(current, previous, days)

  return (
    <div className="space-y-3">
      {current?.warning && (
        <div className="card px-4 py-3 flex items-start gap-2 text-gray-300 text-sm">
          <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <span>{current.warning}</span>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {cards.map(({ label, value, unit, icon: Icon, tint, info, delta }) => (
          <div key={label} className="card card-hover p-5 relative">
            <div className="flex items-start justify-between mb-4">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg"
                style={{ backgroundColor: tint.bg }}
              >
                <Icon style={{ color: tint.fg, width: 18, height: 18 }} />
              </div>
              {info && <InfoTooltip title={info.title} lines={info.lines} />}
            </div>
            <div className="label mb-1.5">{label}</div>
            <div className="flex items-baseline gap-1.5">
              <span className="num text-2xl font-semibold tracking-tight" style={{ color: tint.fg }}>
                {value}
              </span>
              {unit && <span className="text-sm text-gray-500">{unit}</span>}
            </div>
            <div className="mt-1.5">{delta}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function computeCards(cur, prev, days) {
  const totalHours = cur?.by_state
    ? Object.values(cur.by_state).reduce((s, v) => s + (v.hours ?? 0), 0)
    : 0
  const avgPerHour = totalHours > 0 && cur?.total_cost_usd != null
    ? cur.total_cost_usd / totalHours
    : 0
  const processingPct = cur?.by_state?.Processing?.pct_time ?? 0

  // Peak hours = On-Peak + Mid-Peak (the expensive tiers; combined keeps the
  // KPI meaningful in winter when On-Peak is empty by SCE's TOU calendar).
  const peakShare = peakSharePct(cur)

  // Same derivations on the prior period so delta is apples-to-apples.
  const prevTotalHours = prev?.by_state
    ? Object.values(prev.by_state).reduce((s, v) => s + (v.hours ?? 0), 0)
    : 0
  const prevAvgPerHour = prevTotalHours > 0 && prev?.total_cost_usd != null
    ? prev.total_cost_usd / prevTotalHours
    : null
  const prevProcessingPct = prev?.by_state?.Processing?.pct_time ?? null
  const prevPeakShare = peakSharePct(prev)

  const periodLabel = days === 7 ? "7-day" : `${days}-day`
  const deltaSuffix = `vs prev ${days}d`

  return [
    {
      label: `${periodLabel} cost`,
      value: formatCurrency(cur?.total_cost_usd),
      icon: DollarSign,
      tint: TINT.cyan,
      info: {
        title: `${periodLabel} cost`,
        lines: [
          `Source: ${days}-day Motor Amps from Timebase`,
          "kW = (Amps x 460V x 1.732 x 0.88) / 1000",
          "Cost = kW x TOU rate x (1 min / 60), summed across all minutes",
        ],
      },
      delta: <Delta current={cur?.total_cost_usd} previous={prev?.total_cost_usd} goodDirection="down" suffix={deltaSuffix} />,
    },
    {
      label: "Total energy",
      value: formatNumber(cur?.total_kwh),
      unit: "kWh",
      icon: Zap,
      tint: TINT.purple,
      info: {
        title: "Total energy",
        lines: [
          "kWh = kW x (1 min / 60) per interval",
          `Summed across all 1-minute intervals for ${days} days`,
        ],
      },
      delta: <Delta current={cur?.total_kwh} previous={prev?.total_kwh} goodDirection="neutral" suffix={deltaSuffix} />,
    },
    {
      label: "Avg $/hr",
      value: formatCurrency(avgPerHour),
      icon: Clock,
      tint: TINT.amber,
      info: {
        title: "Avg $/hr",
        lines: [
          `Avg $/hr = total ${days}-day cost / total hours`,
          "Includes all states (Processing, CIP, Idle, Shutdown)",
        ],
      },
      delta: <Delta current={avgPerHour} previous={prevAvgPerHour} goodDirection="down" suffix={deltaSuffix} />,
    },
    {
      label: "Processing %",
      value: formatNumber(processingPct),
      unit: "%",
      icon: Activity,
      tint: TINT.green,
      info: {
        title: "Processing %",
        lines: [
          "Processing % = Processing hours / Total hours x 100",
          "Higher is better — more time productive vs idle/shutdown",
        ],
      },
      delta: <Delta current={processingPct} previous={prevProcessingPct} goodDirection="up" suffix={deltaSuffix} />,
    },
    {
      label: "Peak hours cost %",
      value: formatNumber(peakShare),
      unit: "%",
      icon: Flame,
      tint: TINT.red,
      info: {
        title: "Peak hours cost %",
        lines: [
          "Share of cost incurred during expensive TOU tiers (On-Peak + Mid-Peak)",
          "SCE summer: On-Peak 4–9 PM weekdays, Mid-Peak 8 AM–4 PM weekdays",
          "SCE winter: Mid-Peak 4–9 PM weekdays only (no On-Peak in winter)",
          "Lower is better — shifting load to off-peak cuts the bill",
        ],
      },
      delta: <Delta current={peakShare} previous={prevPeakShare} goodDirection="down" suffix={deltaSuffix} />,
    },
  ]
}

function peakSharePct(summary) {
  if (!summary?.by_tou_period) return null
  const onPeak  = summary.by_tou_period["On-Peak"]?.cost_usd ?? 0
  const midPeak = summary.by_tou_period["Mid-Peak"]?.cost_usd ?? 0
  const total   = summary.total_cost_usd ?? 0
  if (total <= 0) return 0
  return ((onPeak + midPeak) / total) * 100
}
