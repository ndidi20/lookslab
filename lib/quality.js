// lib/quality.js

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
export function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
export function angleAt(p, a, b) {
  const v1 = { x: a.x - p.x, y: a.y - p.y };
  const v2 = { x: b.x - p.x, y: b.y - p.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const m1 = Math.hypot(v1.x, v1.y), m2 = Math.hypot(v2.x, v2.y);
  return Math.acos(clamp(dot / ((m1 * m2) || 1), -1, 1));
}
export function smooth(v, ok, bad) {
  if (v <= ok) return 0; if (v >= bad) return 1;
  const t = (v - ok) / (bad - ok); return t * t * (3 - 2 * t);
}

/** basic “pose” penalty (forgives light tilt) */
export function posePenalty(lm) {
  const L = lm[36], R = lm[45];
  const eyeDX = R.x - L.x, eyeDY = R.y - L.y;
  const rollDeg = Math.abs(Math.atan2(eyeDY, eyeDX) * 180 / Math.PI);

  const nose = lm[33];
  const midEye = { x: (L.x + R.x) / 2, y: (L.y + R.y) / 2 };
  const eyeDist = Math.hypot(eyeDX, eyeDY) || 1;
  const yawDeg = Math.abs((nose.x - midEye.x) / eyeDist) * 60;

  return clamp((smooth(rollDeg, 5, 22) + smooth(yawDeg, 8, 26)) / 2, 0, 1);
}

/** quick eye “openness” and matching */
export function eyeMetrics(lm) {
  const LE = [lm[37], lm[38], lm[41], lm[40], lm[36], lm[39]];
  const RE = [lm[43], lm[44], lm[47], lm[46], lm[42], lm[45]];
  const open = (eye) => {
    const [t1, t2, b1, b2, L, R] = eye;
    const v = (dist(t1, b1) + dist(t2, b2)) / 2;
    const w = dist(L, R) || 1;
    return v / w;
  };
  const lo = open(LE), ro = open(RE);
  const openness = clamp(10 * _smooth01((lo + ro) / 2, 0.18, 0.35), 0, 10);
  const match = clamp(10 - Math.abs(lo - ro) * 80, 0, 10);
  return { openness, match, eyesScore: 0.65 * openness + 0.35 * match };
}

function _smooth01(v, a, b) {
  if (v <= a) return 0; if (v >= b) return 1;
  const t = (v - a) / (b - a); return t * t * (3 - 2 * t);
}

/** sample a small patch near the nose to guesstimate skin evenness */
export function skinEvennessScore(lm, canvas, faceW) {
  try {
    const cx = lm[33].x, cy = lm[33].y;
    const w = Math.max(20, faceW * 0.35), h = Math.max(20, faceW * 0.25);
    const x = Math.round(cx - w / 2), y = Math.round(cy - h / 3);

    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(
      clamp(x, 0, canvas.width - 1),
      clamp(y, 0, canvas.height - 1),
      Math.min(w, canvas.width - x),
      Math.min(h, canvas.height - y)
    );

    const L = new Float32Array(img.width * img.height);
    for (let i = 0, j = 0; i < img.data.length; i += 4, j++) {
      const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
      L[j] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    const mean = L.reduce((a, b) => a + b, 0) / (L.length || 1);
    let varSum = 0; for (let v of L) varSum += (v - mean) * (v - mean);
    const variance = varSum / (L.length || 1);

    // lower variance → smoother skin → higher score
    const t = _smooth01(variance, 120, 950);
    return clamp(10 - t * 10, 0, 10);
  } catch {
    return 6.0; // safe default
  }
}
