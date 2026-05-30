/* =============================================================================
 * Reports — Operations › Reports (spec §4.7).
 *
 * Forward-looking placeholder (scheduled per-asset energy-cost exports). No
 * report generation in this scope — it exists so the rail structure is complete
 * and consistent.
 * ============================================================================= */

import { FileBarChart } from 'lucide-react'

export default function Reports() {
  return (
    <div className="mx-auto max-w-[1000px]">
      <div
        className="flex flex-col items-center rounded-xl border p-12 text-center"
        style={{ background: 'var(--dv-panel)', borderColor: 'var(--dv-line)' }}
      >
        <FileBarChart size={40} style={{ color: 'var(--dv-faint)' }} />
        <h1 className="mt-4 text-xl" style={{ fontFamily: 'var(--dv-font-display)', color: 'var(--dv-ink)' }}>
          Reports
        </h1>
        <p className="mt-2 max-w-md text-sm" style={{ color: 'var(--dv-dim)' }}>
          Scheduled per-asset energy-cost exports are coming soon.
        </p>
      </div>
    </div>
  )
}
