import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Info, X } from 'lucide-react'

export default function InfoTooltip({ title, lines }) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef(null)
  const panelRef = useRef(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const panelWidth = 320
    let left = rect.right - panelWidth
    if (left < 8) left = 8
    if (left + panelWidth > window.innerWidth - 8) left = window.innerWidth - panelWidth - 8
    setPos({ top: rect.bottom + 6, left })
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target) &&
        panelRef.current && !panelRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded"
        aria-label="Show methodology"
      >
        <Info className="w-4 h-4" />
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          className="fixed w-80 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-4 text-sm"
          style={{ top: pos.top, left: pos.left, zIndex: 9999 }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-200 font-medium">{title}</span>
            <button type="button" onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-300">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-2 text-slate-400">
            {lines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
