// Reports — placeholder, ported from the mockup #page-reports.
export default function Reports() {
  return (
    <div className="scroll">
      <div className="panel">
        <div className="placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
          <h3 style={{ justifyContent: "center", color: "var(--ink)" }}>Scheduled reports</h3>
          <p style={{ marginTop: 8, maxWidth: 520, marginInline: "auto" }}>
            Weekly energy-cost PDFs per asset, emailed to ops — this is where the light
            “Heritage” theme earns its keep as the print/export skin.
          </p>
        </div>
      </div>
    </div>
  )
}
