// 7 mini cards for the live readings: operating state + 6 electrical/TOU/shift.
// Same visual pattern as Analysis KPI cards but driven by /current data
// (already fetched once at App level via useLiveCurrent).
import { formatCurrency, formatNumber, formatRate } from "../utils/formatters"
import { Activity, Bolt, DollarSign, Sun, Zap, Users, Gauge } from "lucide-react"
import { useRelativeTime } from "../hooks/useLiveCurrent"
import { STATE_TINT } from "../config/stateColors"

const TINT = {
  cyan:   { bg: "rgba(34, 211, 238, 0.10)",  fg: "#22d3ee" },
  purple: { bg: "rgba(167, 139, 250, 0.10)", fg: "#a78bfa" },
  amber:  { bg: "rgba(245, 158, 11, 0.10)",  fg: "#f59e0b" },
  green:  { bg: "rgba(34, 197, 94, 0.10)",   fg: "#22c55e" },
  blue:   { bg: "rgba(59, 130, 246, 0.10)",  fg: "#3b82f6" },
  gray:   { bg: "rgba(156, 163, 175, 0.10)", fg: "#9ca3af" },
}

function MiniCard({ label, value, unit, icon: Icon, tint, accent, subtitle }) {
  return (
    <div className="card card-hover p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-md shrink-0"
          style={{ backgroundColor: tint.bg }}
        >
          <Icon style={{ color: tint.fg, width: 14, height: 14 }} />
        </div>
        {/* Fixed two-line label box so single- and double-line labels keep the
            value row anchored at the same height across all cards. */}
        <span className="label flex items-center min-h-[2.4em] leading-tight">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={`num ${value && value.length > 8 ? "text-base" : "text-xl"} font-semibold tracking-tight`}
          style={accent ? { color: tint.fg } : { color: "#fff" }}
        >
          {value}
        </span>
        {unit && <span className="text-xs text-gray-500">{unit}</span>}
      </div>
      {/* Reserve the subtitle row on every card so cards without one don't sit
          shorter — keeps the row visually even. */}
      <div className="mt-auto pt-1 text-[10px] text-gray-500 num min-h-[1.2em]">{subtitle}</div>
    </div>
  )
}

export default function LiveKPIs({ current, lastFetch, error }) {
  const relativeUpdated = useRelativeTime(lastFetch)

  if (error && !current) {
    return <div className="card p-4 text-red-400">Error: {error}</div>
  }

  const stateName = current?.state ?? "—"
  // Shared colorblind-safe palette; its tints carry legible foregrounds (the
  // dark Shutdown slate would be unreadable as text if used raw).
  const stateTint = STATE_TINT[stateName] ?? STATE_TINT.Shutdown
  const isStale = current?.is_stale === true

  const amps = current?.amps != null ? formatNumber(current.amps) : "—"
  const kw = current?.kw != null ? formatNumber(current.kw) : "—"
  const dollarsHr = current?.cost_per_hour != null ? formatCurrency(current.cost_per_hour) : "—"
  const touPeriod = current?.tou_period ?? "—"
  const touRate = current?.tou_rate != null ? formatRate(current.tou_rate) : "—"
  const shift = current?.shift ?? "—"

  return (
    <div className="telemrow">
      <MiniCard
        label="Operating state"
        value={stateName}
        icon={Gauge}
        tint={stateTint}
        accent
        subtitle={isStale ? "stale" : `updated ${relativeUpdated}`}
      />
      <MiniCard label="Amps"       value={amps}       icon={Activity}    tint={TINT.gray} />
      <MiniCard label="kW"         value={kw}         icon={Bolt}        tint={TINT.purple} />
      <MiniCard label="$/hr"       value={dollarsHr}  icon={DollarSign}  tint={TINT.cyan}   accent />
      <MiniCard label="TOU period" value={touPeriod}  icon={Sun}         tint={TINT.amber} />
      <MiniCard label="TOU rate"   value={touRate}    icon={Zap}         tint={TINT.green} />
      <MiniCard label="Shift"      value={shift}      icon={Users}       tint={TINT.blue} />
    </div>
  )
}
