// Small decorative sparkline rendered in the bottom-right of a KPI card.
// Normalizes a series of numbers into the mockup's .spark viewBox (0 0 120 36).
const W = 120;
const H = 44;
const PAD = 3;

export default function Sparkline({ points = [], stroke = "#06DCF2" }) {
  if (!Array.isArray(points) || points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const stepX = W / (points.length - 1);

  const coords = points
    .map((v, i) => {
      const x = i * stepX;
      // Invert Y so larger values sit higher; keep within padded band.
      const y = PAD + (1 - (v - min) / span) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <polyline fill="none" stroke={stroke} strokeWidth="2" points={coords} />
    </svg>
  );
}
