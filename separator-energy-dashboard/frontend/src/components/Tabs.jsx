// Tabs — small segmented control with an animated underline indicator.
// Pure presentational; consumer manages selected value via onChange.
import { useEffect, useRef, useState } from "react"

export default function Tabs({ value, onChange, items }) {
  const containerRef = useRef(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const active = container.querySelector(`[data-value="${value}"]`)
    if (!active) return
    const containerRect = container.getBoundingClientRect()
    const rect = active.getBoundingClientRect()
    setIndicator({ left: rect.left - containerRect.left, width: rect.width })
  }, [value, items])

  return (
    <div
      ref={containerRef}
      role="tablist"
      className="card relative inline-flex p-1 gap-0.5"
    >
      <span
        aria-hidden
        className="absolute top-1 bottom-1 rounded-md bg-cyan-500/10 ring-1 ring-cyan-500/30 transition-all duration-200 ease-out"
        style={{ left: indicator.left, width: indicator.width }}
      />
      {items.map((item) => {
        const active = value === item.value
        return (
          <button
            key={item.value}
            data-value={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={`relative z-10 px-3 py-1 text-sm rounded-md transition-colors ${
              active ? "text-cyan-300" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
