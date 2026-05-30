// assetIcons.jsx — the mockup's inline SVG glyphs as small components, kept in
// their own file so assetRegistry can stay plain data (and so Fast Refresh's
// "only export components" rule is satisfied on both sides).

// Sidebar nav icons (mockup .navitem svg).
export function SeparatorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 4v3M12 17v3M4 12h3M17 12h3" />
    </svg>
  )
}

export function GlycolIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 2v14M9 19a3 3 0 1 0 6 0c0-2-3-5-3-5s-3 3-3 5z" />
      <path d="M8 6h8M8 10h8" />
    </svg>
  )
}

export function PasteurizerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 12h14M5 12a7 7 0 0 1 14 0M9 12v6M15 12v6M7 18h10" />
    </svg>
  )
}

// Larger fleet-tile glyphs (mockup .aico variants).
export function SeparatorTileIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  )
}

export function GlycolTileIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 2v14M9 19a3 3 0 1 0 6 0c0-2-3-5-3-5s-3 3-3 5z" />
    </svg>
  )
}

export function PasteurizerTileIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 12a7 7 0 0 1 14 0M9 12v6M15 12v6" />
    </svg>
  )
}
