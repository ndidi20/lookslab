// lib/vision/quality.js
import { clamp, dist, smooth } from './geometry.js';
import { IDX } from './indices.js';

export function posePenalty(lm) {
  // Roll from inter-ocular line; Yaw from nose offset vs mid-eye
  const L_in = lm[IDX.L_EYE_IN], R_in = lm[IDX.R_EYE_IN];
  const eyeDX = L_in.x - R_in.x, eyeDY = L_in.y - R_in.y;
  const rollDeg = Math.abs(Math.atan2(eyeDY, eyeDX) * 180 / Math.PI);

  const midEye = { x: (L_in.x + R_in.x) / 2, y: (L_in.y + R_in.y) / 2 };
  const nose = lm[IDX.NOSE_TIP];
  const eyeDist = dist(L_in, R_in) || 1;
  const yawDeg = Math.abs((nose.x - midEye.x) / eyeDist) * 60;

  return clamp((smooth(rollDeg, 5, 22) + smooth(yawDeg, 8, 26)) / 2, 0, 1);
}

export function blurPenaltyFromPatch(canvas, cx, cy, sizePx = 48) {
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const x = Math.max(0, Math.round(cx - sizePx/2));
    const y = Math.max(0, Math.round(cy - sizePx/2));
    const w = Math.min(sizePx, canvas.width  - x);
    const h = Math.min(sizePx, canvas.height - y);
    const img = ctx.getImageData(x, y, w, h);

    // crude focus proxy: local intensity variance
    let sum = 0, sumSq = 0, n = w*h;
    for (let i=0; i<img.data.length; i+=4) {
      const r=img.data[i], g=img.data[i+1], b=img.data[i+2];
      const L = 0.2126*r + 0.7152*g + 0.0722*b;
      sum += L; sumSq += L*L;
    }
    const mean = sum / n;
    const variance = Math.max(0, sumSq / n - mean*mean);

    // Map variance → 0..1 penalty (low variance => blur => bigger penalty)
    const t = 1 - clamp((variance - 60) / (600 - 60), 0, 1);
    return clamp(t * 0.8, 0, 0.8);
  } catch {
    return 0;
  }
}

export function illumPenalty(canvas) {
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0, n = img.width * img.height;
    for (let i=0; i<img.data.length; i+=4) {
      const r=img.data[i], g=img.data[i+1], b=img.data[i+2];
      const L = 0.2126*r + 0.7152*g + 0.0722*b;
      sum += L;
    }
    const mean = sum / n; // 0..255
    // target comfy range ~[60..200]
    let p = 0;
    if (mean < 60)  p = (60 - mean)  / 60;
    if (mean > 200) p = (mean - 200) / 55;
    return clamp(p * 0.6, 0, 0.6);
  } catch {
    return 0;
  }
}
