/* DriftView identity (spec §6.3).
 * DvMark  — the inline SVG monogram: navy "D" + teal checkmark forming the "V".
 * DvWordmark — the two-tone Drift / View lockup with the "Process Insight" tagline.
 * Kept as inline SVG/markup so it stays crisp at any size and recolors via tokens.
 */

export function DvMark({ size = 32, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role="img"
      aria-label="DriftView"
    >
      <rect width="32" height="32" rx="7" fill="var(--dv-navy)" />
      {/* The "D" */}
      <path
        d="M9 8h6.2c4.3 0 7.3 3.1 7.3 8s-3 8-7.3 8H9V8zm4 3.4v9.2h2c2.3 0 3.7-1.8 3.7-4.6S17.3 11.4 15 11.4h-2z"
        fill="var(--dv-ink)"
      />
      {/* The teal checkmark / "V" accent */}
      <path
        d="M19.5 18.5l2.4 3 4.6-7"
        stroke="var(--dv-teal)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function DvWordmark({ tagline = true }) {
  return (
    <div className="leading-none">
      <div
        style={{ fontFamily: 'var(--dv-font-display)' }}
        className="text-[1.35rem] tracking-tight"
      >
        <span style={{ color: 'var(--dv-ink)' }}>Drift</span>
        <span style={{ color: 'var(--dv-blue)' }}>View</span>
      </div>
      {tagline && (
        <div
          className="mt-1 text-[0.6rem] font-semibold uppercase"
          style={{ color: 'var(--dv-faint)', letterSpacing: '0.22em' }}
        >
          Process Insight
        </div>
      )}
    </div>
  )
}
