// lib/vision/scoring.js
import { IDX } from './indices.js';
import { clamp, dist, angleAt, cdfFromZ } from './geometry.js';
import { posePenalty, blurPenaltyFromPatch, illumPenalty } from './quality.js';

let _anchors = null;
async function getAnchors() {
  if (_anchors) return _anchors;
  const r = await fetch('/anchors.json', { cache: 'no-store' });
  _anchors = await r.json();
  return _anchors;
}

export async function scoreOne(landmarks, canvas) {
  const raw  = computeRaw(landmarks, canvas);
  const norm = await normalizeWithAnchors(raw);

  const lm   = landmarks.positions;
  const pose = posePenalty(lm);

  // Light quality penalty (don’t crush scores)
  const blur   = blurPenaltyFromPatch(canvas, lm[IDX.NOSE_TIP].x, lm[IDX.NOSE_TIP].y, 64);
  const illum  = illumPenalty(canvas);
  const qPen   = clamp(blur * 0.6 + illum * 0.4, 0, 1);

  const base =
      0.28 * norm.symmetry +
      0.22 * norm.jawline  +
      0.18 * norm.eyes     +
      0.17 * norm.skin     +
      0.15 * norm.balance;

  const overall   = clamp(base - pose * 0.9 - qPen * 0.5, 0, 10);
  const potential = clamp(overall + ((10 - overall) * 0.35) - pose * 0.3, 0, 10);

  return {
    overall,
    potential,
    breakdown: {
      symmetry: norm.symmetry,
      jawline : norm.jawline,
      eyes    : norm.eyes,
      skin    : norm.skin,
      balance : norm.balance,
    }
  };
}

/* ---------- raw metrics (scale invariant) ---------- */
function computeRaw(landmarks, canvas) {
  const lm = landmarks.positions;

  // Reference scales
  const faceW   = Math.max(1, Math.abs(lm[IDX.JAW_R].x - lm[IDX.JAW_L].x));
  const interIn = dist(lm[IDX.R_EYE_IN], lm[IDX.L_EYE_IN]) || 1;

  // SYMMETRY: mirror distances across midline
  const midX = lm[IDX.MID_BRIDGE]?.x ?? ((lm[IDX.JAW_L].x + lm[IDX.JAW_R].x) / 2);
  const pairs = [
    [IDX.R_EYE_OUT, IDX.L_EYE_OUT],
    [IDX.R_EYE_IN , IDX.L_EYE_IN ],
    [IDX.MOUTH_L  , IDX.MOUTH_R  ],
    [IDX.NOSE_LEFT, IDX.NOSE_RIGHT],
    [IDX.JAW_L    , IDX.JAW_R    ],
  ];
  let symErr = 0;
  for (const [a, b] of pairs) {
    const da = Math.abs(midX - lm[a].x);
    const db = Math.abs(lm[b].x - midX);
    symErr += Math.abs(da - db);
  }
  const symmetry = clamp(10 - (symErr / faceW) * 36, 0, 10);

  // JAWLINE: angle at chin between left/right mandible corners
  const jawDeg = angleAt(lm[IDX.CHIN], lm[IDX.JAW_L], lm[IDX.JAW_R]) * 180 / Math.PI;
  let jawline;
  if (jawDeg < 60)      jawline = 6 + (jawDeg - 60) * 0.02;
  else if (jawDeg >115) jawline = 6 - (jawDeg - 115) * 0.06;
  else                  jawline = 8 + (1 - Math.abs(jawDeg - 90)/20) * 2;
  jawline = clamp(jawline, 0, 10);

  // EYES: openness + bilateral match (width-normalized)
  const eyeOpen = (top, bot, out, inn) => {
    const vertical = Math.abs(lm[top].y - lm[bot].y);
    const width    = dist(lm[out], lm[inn]) || 1;
    return vertical / width;
  };
  const oR = eyeOpen(IDX.R_EYE_TOP, IDX.R_EYE_BOT, IDX.R_EYE_OUT, IDX.R_EYE_IN);
  const oL = eyeOpen(IDX.L_EYE_TOP, IDX.L_EYE_BOT, IDX.L_EYE_OUT, IDX.L_EYE_IN);
  const open = (oR + oL) / 2;
  const openScore  = clamp(10 * smooth01(open, 0.18, 0.35), 0, 10);
  const matchScore = clamp(10 - Math.abs(oR - oL) * 75, 0, 10);
  const eyes = 0.65 * openScore + 0.35 * matchScore;

  // SKIN: texture proxy (luma variance) near nose/cheek
  let skin = 5.5; // safe fallback
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const cx  = lm[IDX.NOSE_TIP].x, cy = lm[IDX.NOSE_TIP].y;
    const w   = Math.max(22, faceW * 0.34), h = Math.max(22, faceW * 0.22);
    const x   = Math.round(cx - w/2), y = Math.round(cy - h/3);
    const img = ctx.getImageData(
      clamp(x, 0, canvas.width  - 1),
      clamp(y, 0, canvas.height - 1),
      Math.min(w, canvas.width  - x),
      Math.min(h, canvas.height - y)
    );
    let sum = 0, sumSq = 0, n = img.width * img.height;
    for (let i = 0; i < img.data.length; i += 4) {
      const r = img.data[i], g = img.data[i+1], b = img.data[i+2];
      const L = 0.2126*r + 0.7152*g + 0.0722*b;
      sum += L; sumSq += L*L;
    }
    const mean     = sum / n;
    const variance = Math.max(0, sumSq / n - mean * mean);
    skin = clamp(10 - smoothMap(variance, 120, 950) * 10, 0, 10);
  } catch {}

  // BALANCE: three simple ratios
  const noseW  = dist(lm[IDX.NOSE_LEFT], lm[IDX.NOSE_RIGHT]) || 1;
  const mouthW = dist(lm[IDX.MOUTH_L], lm[IDX.MOUTH_R]) || 1;
  const r1 = mouthW / noseW;               // sweet ~1.6

  const Rw = dist(lm[IDX.R_EYE_OUT], lm[IDX.R_EYE_IN]) || 1;
  const Lw = dist(lm[IDX.L_EYE_OUT], lm[IDX.L_EYE_IN]) || 1;
  const eyeW = (Rw + Lw) / 2;
  const r2 = interIn / eyeW;               // sweet ~1.0

  const lower = dist(lm[IDX.CHIN], lm[IDX.NOSE_TIP]) || 1;
  const mid   = dist(lm[IDX.MID_BRIDGE], lm[IDX.NOSE_TIP]) || 1;
  const r3 = lower / mid;                  // sweet ~1.05

  const s1 = 10 - Math.min(10, Math.abs(r1 - 1.6)  * 8);
  const s2 = 10 - Math.min(10, Math.abs(r2 - 1.0) *10);
  const s3 = 10 - Math.min(10, Math.abs(r3 - 1.05)*12);
  const balance = clamp(0.4*s1 + 0.35*s2 + 0.25*s3, 0, 10);

  return { symmetry, jawline, eyes, skin, balance };
}

/* ---------- normalization + curved-easing floors ---------- */
async function normalizeWithAnchors(raw) {
  const A = await getAnchors();
  const out = {};
  const toZ = (v, mean, std) => (v - mean) / (std || 1);

  for (const k of ['symmetry','jawline','eyes','skin','balance']) {
    const a   = A[k] || { mean: 5, std: 1.5 };
    const z   = toZ(raw[k], a.mean, a.std);
    let pct   = clamp(cdfFromZ(z) * 10, 0, 10); // 0..10 baseline

    // Curved easing floors you requested:
    //   - Skin    : 7.1 → 9.1 band
    //   - Balance : 7.5 → 9.8 band
    if (k === 'skin') {
      const min = 7.1, max = 9.1;
      if (pct < max) {
        const t = smooth01(pct / max, 0, 1);   // 0..1 as pct goes 0..max
        pct = min + t * (max - min);
      }
    } else if (k === 'balance') {
      const min = 7.5, max = 9.8;
      if (pct < max) {
        const t = smooth01(pct / max, 0, 1);
        pct = min + t * (max - min);
      }
    }

    out[k] = pct;
  }
  return out;
}

/* ---------- easing helpers ---------- */
function smooth01(v, a, b) {
  // If a/b omitted, treat as 0..1 easing input
  if (b === undefined) { const t = clamp(v, 0, 1); return t*t*(3 - 2*t); }
  if (v <= a) return 0;
  if (v >= b) return 1;
  const t = (v - a) / (b - a);
  return t*t*(3 - 2*t);
}
function smoothMap(v, a, b) {
  if (v <= a) return 0; if (v >= b) return 1;
  const t = (v - a) / (b - a);
  return t*t*(3 - 2*t);
}
