// lib/quality.js

/** tiny helpers */
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const smooth01 = (v, a, b) => {
  if (v <= a) return 0; if (v >= b) return 1;
  const t = (v - a) / (b - a); return t * t * (3 - 2 * t);
};

/** sample a small rectangular patch from the canvas around a point */
export function samplePatch(canvas, cx, cy, w, h) {
  const ctx = canvas.getContext('2d');
  const x = clamp(Math.round(cx - w / 2), 0, canvas.width - 1);
  const y = clamp(Math.round(cy - h / 2), 0, canvas.height - 1);
  const W = Math.min(w, canvas.width - x);
  const H = Math.min(h, canvas.height - y);
  return ctx.getImageData(x, y, W, H);
}

/** compute luma variance and mean */
export function statsLuma(imgData) {
  const { data, width, height } = imgData;
  const N = width * height;
  const L = new Float32Array(N);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    L[j] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const mean = L.reduce((a, b) => a + b, 0) / Math.max(1, N);
  let varSum = 0; for (let k = 0; k < N; k++) { const d = L[k] - mean; varSum += d * d; }
  const variance = varSum / Math.max(1, N);
  return { mean, variance };
}

/** Skin quality heuristic: mid-face patch brightness + texture */
export function scoreSkinFromCanvas(canvas, landmarks) {
  try {
    const lm = landmarks.positions;
    const faceW = dist(lm[0], lm[16]);
    const nose = lm[33];
    const patch = samplePatch(canvas, nose.x, nose.y, Math.max(24, faceW * 0.35), Math.max(24, faceW * 0.25));
    const { mean, variance } = statsLuma(patch);

    // brightness penalty (too dark <60 or washed >210)
    let score = 10;
    if (mean < 60)  score -= smooth01(60 - mean, 0, 40) * 4.5;
    if (mean > 210) score -= smooth01(mean - 210, 0, 40) * 3.5;

    // texture penalty (higher variance ~ more visible noise/pores)
    const textiness = smooth01(variance, 120, 900); // 0..1
    score -= textiness * 4.0;

    return clamp(score, 0, 10);
  } catch { return 5.5; }
}
