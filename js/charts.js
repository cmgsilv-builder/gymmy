/* Gymmy — tiny dependency-free SVG line chart (works fully offline). */

function lineChart(points, opts = {}) {
  // points: [{x:Date|number, y:number}] ; returns an <svg> string
  const w = opts.width || 320, h = opts.height || 140, pad = 28;
  if (!points.length) return '<p class="muted small">No data yet.</p>';
  const xs = points.map(p => +new Date(p.x));
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  if (minY === maxY) { minY -= 1; maxY += 1; }
  const sx = (x) => pad + ((+new Date(x) - minX) / (maxX - minX || 1)) * (w - pad * 2);
  const sy = (y) => h - pad - ((y - minY) / (maxY - minY || 1)) * (h - pad * 2);
  const d = points.map((p, i) => (i ? 'L' : 'M') + sx(p.x).toFixed(1) + ' ' + sy(p.y).toFixed(1)).join(' ');
  const dots = points.map(p => `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="2.5" fill="var(--accent)"/>`).join('');
  const last = points[points.length - 1];
  const yTicks = [minY, (minY + maxY) / 2, maxY].map(v => {
    const y = sy(v);
    return `<line x1="${pad}" y1="${y.toFixed(1)}" x2="${w - pad}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="1"/>
            <text x="4" y="${(y + 3).toFixed(1)}" class="axis">${Math.round(v * 10) / 10}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${opts.label || 'chart'}">
    ${yTicks}
    <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    <text x="${w - pad}" y="${(sy(last.y) - 6).toFixed(1)}" text-anchor="end" class="axis strong">${last.y}${opts.unit || ''}</text>
  </svg>`;
}
