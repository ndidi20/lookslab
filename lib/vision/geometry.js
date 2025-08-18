// lib/vision/geometry.js

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function angleAt(p, a, b) {
  const v1 = { x: a.x - p.x, y: a.y - p.y };
  const v2 = { x: b.x - p.x, y: b.y - p.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const m1 = Math.hypot(v1.x, v1.y);
  const m2 = Math.hypot(v2.x, v2.y);
  return Math.acos(clamp(dot / ((m1 * m2) || 1), -1, 1));
}

export function smooth(v, ok, bad) {
  if (v <= ok) return 0;
  if (v >= bad) return 1;
  const t = (v - ok) / (bad - ok);
  return t * t * (3 - 2 * t); // smoothstep
}

export function cdfFromZ(z) {
  // fast erf approximation → normal CDF
  const erf = (x) => {
    const sgn = Math.sign(x);
    x = Math.abs(x);
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
          a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x));
    return sgn * y;
  };
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** scale-preserving contain fit */
export function fitContain(iw, ih, ow, oh) {
  const s = Math.min(ow / iw, oh / ih);
  return { w: Math.round(iw * s), h: Math.round(ih * s) };
}
