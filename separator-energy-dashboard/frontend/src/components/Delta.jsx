// Inline delta indicator for KPI cards.
// Computes prev->current relative change, colors by goodDirection:
//   "down" — cost-like; green when value falls
//   "up"   — utilization-like; green when value rises
//   "neutral" — gray, no value judgment
import { ArrowDown, ArrowUp, Minus } from "lucide-react"

export default function Delta({ current, previous, goodDirection = "down", suffix = "vs prev" }) {
  if (previous == null || current == null || previous === 0) {
    return <span className="text-[10px] text-gray-600">— {suffix}</span>
  }
  const diff = current - previous
  const pct = (diff / Math.abs(previous)) * 100
  const isUp = diff > 0
  const isDown = diff < 0
  const flat = Math.abs(pct) < 0.1

  if (flat) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
        <Minus className="h-2.5 w-2.5" />
        flat {suffix}
      </span>
    )
  }

  const Icon = isUp ? ArrowUp : ArrowDown
  // "down" goodDirection: green when isDown, red when isUp.
  // "up"   goodDirection: green when isUp, red when isDown.
  // "neutral": always gray.
  let color = "text-gray-500"
  if (goodDirection === "down") color = isDown ? "text-emerald-400" : "text-red-400"
  if (goodDirection === "up")   color = isUp ? "text-emerald-400" : "text-red-400"

  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] num ${color}`}>
      <Icon className="h-2.5 w-2.5" />
      {Math.abs(pct).toFixed(1)}% <span className="opacity-70 ml-0.5">{suffix}</span>
    </span>
  )
}
