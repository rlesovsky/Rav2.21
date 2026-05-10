// Segmented control for the analysis-tab time window.
// Same visual vocabulary as the top-level Tabs component.
import { useEffect, useRef, useState } from "react"

const OPTIONS = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
]

export default function WindowSelector({ value, onChange }) {
  const containerRef = useRef(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const active = container.querySelector(`[data-value="${value}"]`)
    if (!active) return
    const cRect = container.getBoundingClientRect()
    const aRect = active.getBoundingClientRect()
    setIndicator({ left: aRect.left - cRect.left, width: aRect.width })
  }, [value])

  return (
    <div className="flex items-center gap-2">
      <span className="label">Window</span>
      <div
        ref={containerRef}
        className="relative inline-flex rounded-md border border-white/[0.06] p-1 gap-0.5"
      >
        <span
          aria-hidden
          className="absolute top-1 bottom-1 rounded bg-white/[0.06] transition-all duration-200 ease-out"
          style={{ left: indicator.left, width: indicator.width }}
        />
        {OPTIONS.map((opt) => {
          const active = value === opt.value
          return (
            <button
              key={opt.value}
              data-value={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`relative z-10 rounded px-2.5 py-0.5 text-xs transition-colors ${
                active ? "text-white" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
