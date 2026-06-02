// Process-state palette — colorblind-safe (CVD-reviewed). Single source of truth
// for the four operating-state colors used across every state chart, timeline,
// and status chip.
//
// Rationale:
//  - Processing keeps the DriftView brand teal (the "running" state / anchor).
//  - CIP moves to amber, off the green–blue axis entirely, so it never merges
//    with Processing on any axis (under tritanopia the old teal/blue collapsed
//    into nearly the same cyan).
//  - Idle vs Shutdown separate by LIGHTNESS (light vs dark slate) rather than
//    hue, which is universally distinguishable for every vision type.
export const STATE_COLORS = {
  Processing: "#2DD4BF",
  CIP: "#F59E0B",
  Idle: "#CBD5E1",
  Shutdown: "#475569",
}

// Status-chip tints: subtle background + a foreground that stays legible on the
// dark theme. Shutdown's fill (#475569) is too dark to read as text, so its chip
// uses a light-slate foreground instead of the raw fill color.
export const STATE_TINT = {
  Processing: { bg: "rgba(45,212,191,.14)", fg: "#5fe3cf", dot: STATE_COLORS.Processing },
  CIP: { bg: "rgba(245,158,11,.14)", fg: "#fbbf24", dot: STATE_COLORS.CIP },
  Idle: { bg: "rgba(203,213,225,.16)", fg: "#dbe3ee", dot: STATE_COLORS.Idle },
  Shutdown: { bg: "rgba(71,85,105,.30)", fg: "#9fb4d2", dot: STATE_COLORS.Shutdown },
}
