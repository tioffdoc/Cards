// charts.js — small hand-rolled SVG line charts. No charting library.
// Trend color rule: last value >= first value -> green (up), else red (down).

export function lineChartSVG(points, { width = 320, height = 120, pad = 24 } = {}) {
  if (!points.length) {
    return `<svg viewBox="0 0 ${width} ${height}"><text x="50%" y="50%" text-anchor="middle" fill="var(--ink-faint)" font-size="12">No data yet</text></svg>`;
  }
  const values = points.map((p) => p.value);
  const max = Math.max(...values, 1);
  const min = 0;
  const innerW = width - pad * 2;
  const innerH = height - pad * 1.6;

  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
  const x = (i) => pad + i * stepX;
  const y = (v) => pad * 0.6 + innerH - ((v - min) / (max - min || 1)) * innerH;

  const trendUp = values[values.length - 1] >= values[0];
  const color = trendUp ? "var(--up)" : "var(--down)";

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${x(points.length - 1).toFixed(1)},${(pad * 0.6 + innerH).toFixed(1)} L${x(0).toFixed(1)},${(pad * 0.6 + innerH).toFixed(1)} Z`;

  const dots = points.map((p, i) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3" fill="${color}" />`
  ).join("");

  const labels = points.map((p, i) =>
    `<text x="${x(i).toFixed(1)}" y="${height - 4}" text-anchor="middle" font-size="9" fill="var(--ink-faint)">${p.label}</text>`
  ).join("");

  return `
  <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
    <path d="${areaPath}" fill="${color}" opacity="0.10" stroke="none" />
    <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" />
    ${dots}
    ${labels}
  </svg>`;
}

// Small inline sparkline used as the "vitals" signature divider under headers.
export function vitalsRule(width = 300, height = 14) {
  const pts = [0, 3, -2, 6, -4, 8, -1, 4, 0];
  const stepX = width / (pts.length - 1);
  const mid = height / 2;
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${(mid - p).toFixed(1)}`).join(" ");
  return `<svg class="vitals-rule" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><path d="${path}" /></svg>`;
}
