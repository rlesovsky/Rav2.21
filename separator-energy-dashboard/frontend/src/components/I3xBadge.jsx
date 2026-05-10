// Tiny "data via i3X" chip linking to the spec home page.
// Small enough to live in a footer without dominating; turns cyan on hover
// to signal that it is a real link, not just a label.
export default function I3xBadge() {
  return (
    <a
      href="https://www.i3x.dev"
      target="_blank"
      rel="noopener noreferrer"
      title="Data sourced via the CESMII i3X spec — click for details"
      className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] px-1.5 py-0.5 text-[10px] tracking-tight text-gray-500 hover:border-cyan-500/30 hover:text-cyan-300 transition-colors"
    >
      <span className="opacity-70">data via</span>
      <span className="font-semibold">i3X</span>
    </a>
  )
}
