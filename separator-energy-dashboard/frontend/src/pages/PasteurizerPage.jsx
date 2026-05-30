// PasteurizerPage — placeholder, ported from the mockup #page-pasteurizer.
export default function PasteurizerPage() {
  return (
    <div className="scroll">
      <div className="panel">
        <div className="placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M5 12a7 7 0 0 1 14 0M9 12v6M15 12v6M7 18h10" />
          </svg>
          <h3 style={{ justifyContent: "center", color: "var(--ink)" }}>Pasteurizer dashboard — ready to build</h3>
          <p style={{ marginTop: 8, maxWidth: 520, marginInline: "auto" }}>
            This is where the HTST line would slot in: hold-tube temperature, divert events,
            flow rate, regeneration efficiency, and CIP cost — same card + tab pattern, new
            tags. Adding an asset is just a new entry in the rail.
          </p>
        </div>
      </div>
    </div>
  )
}
