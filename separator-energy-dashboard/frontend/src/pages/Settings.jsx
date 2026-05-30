/* =============================================================================
 * Settings — Operations › Settings (spec §4.6).
 *
 * Phase 2: a routable placeholder host. Phase 4 relocates RateConfigPanel here
 * (rate & electrical config, backed by /api/config) and removes it from the
 * Separator body. For now this is a thin landing page so the route + rail entry
 * are complete and consistent.
 * ============================================================================= */

export default function Settings() {
  return (
    <div className="mx-auto max-w-[1000px]">
      <div
        className="rounded-xl border p-8"
        style={{ background: 'var(--dv-panel)', borderColor: 'var(--dv-line)' }}
      >
        <h1 className="text-xl" style={{ fontFamily: 'var(--dv-font-display)', color: 'var(--dv-ink)' }}>
          Settings
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--dv-dim)' }}>
          Rate &amp; electrical configuration moves here in Phase 4 (voltage, power factor, $/kWh —
          backed by <code>/api/config</code>).
        </p>
      </div>
    </div>
  )
}
