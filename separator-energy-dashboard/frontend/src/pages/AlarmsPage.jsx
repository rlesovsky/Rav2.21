// AlarmsPage — site-wide alarms. There is no real alarm source in the backend,
// so we render an honest empty state rather than fabricating live alarm rows.
export default function AlarmsPage() {
  return (
    <div className="scroll">
      <div className="panel">
        <h3>Site-wide alarms</h3>
        <div className="sub">All assets · last 24 h</div>
        <div className="placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          <h3 style={{ justifyContent: "center", color: "var(--ink)" }}>No alarm source connected yet</h3>
          <p style={{ marginTop: 8, maxWidth: 520, marginInline: "auto" }}>
            The platform does not yet ingest alarms from the process assets. When an alarm
            source is wired in, site-wide severity/asset/message/time/status rows will appear
            here. (The mockup's sample rows were illustrative only and are intentionally not
            shown as if they were live.)
          </p>
        </div>
      </div>
    </div>
  )
}
