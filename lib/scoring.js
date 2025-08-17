// lib/scoring.js
import { clamp, dist, smooth01, scoreSkinFromCanvas } from './quality';

/** angles */
function angleAt(p, a, b) {
  const v1 = { x: a.x - p.x, y: a.y - p.y };
  const v2 = { x: b.x - p.x, y: b.y - p.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const m1 = Math.hypot(v1.x, v1.y), m2 = Math.hypot(v2.x, v2.y);
  return Math.acos(clamp(dot / ((m1 * m2) || 1), -1, 1));
}

/** pose penalty: roll + yaw */
function posePenalty(lm) {
  const L = lm[36], R = lm[45];
  const eyeDX = R.x - L.x, eyeDY = R.y - L.y;
  const roll = Math.abs(Math.atan2(eyeDY, eyeDX) * 180 / Math.PI);
  const midEye = { x: (L.x + R.x) / 2, y: (L.y + R.y) / 2 };
  const nose = lm[33];
  const eyeDist = Math.hypot(eyeDX, eyeDY) || 1;
  const yaw = Math.abs((nose.x - midEye.x) / eyeDist) * 60;
  return clamp((smooth01(roll, 5, 22) + smooth01(yaw, 8, 26)) / 2, 0, 1);
}

/** feature scores */
export function scoreSymmetry(lm) {
  const midX = lm[27].x;
  const pairs = [[36,45],[39,42],[31,35],[48,54],[3,13]];
  const faceW = dist(lm[0], lm[16]) || 1;
  let err = 0;
  for (const [a, b] of pairs) {
    const da = Math.abs(midX - lm[a].x);
    const db = Math.abs(lm[b].x - midX);
    err += Math.abs(da - db);
  }
  err /= pairs.length;
  return clamp(10 - (err / faceW) * 40, 0, 10);
}

export function scoreJawline(lm) {
  const chin = lm[8], L = lm[4], R = lm[12];
  const deg = angleAt(chin, L, R) * 180 / Math.PI;
  let s;
  if (deg < 60) s = 6 + (deg - 60) * 0.02;
  else if (deg > 115) s = 6 - (deg - 115) * 0.06;
  else s = 8 + (1 - Math.abs(deg - 90) / 20) * 2;
  return clamp(s, 0, 10);
}

export function scoreEyes(lm) {
  const open = (E) => {
    const [t1, t2, b1, b2, L, R] = E;
    const v = (dist(t1, b1) + dist(t2, b2)) / 2;
    return v / (dist(L, R) || 1);
  };
  const LE = [lm[37], lm[38], lm[41], lm[40], lm[36], lm[39]];
  const RE = [lm[43], lm[44], lm[47], lm[46], lm[42], lm[45]];
  const lo = open(LE), ro = open(RE);
  const openness = clamp(10 * smooth01((lo + ro) / 2, 0.18, 0.35), 0, 10);
  const match = clamp(10 - Math.abs(lo - ro) * 80, 0, 10);
  return 0.65 * openness + 0.35 * match;
}

export function scoreBalance(lm) {
  const noseW = dist(lm[31], lm[35]);
  const mouthW = dist(lm[48], lm[54]);
  const eyeW = dist(lm[36], lm[39]);
  const midEye = dist(lm[39], lm[42]);
  const lower = dist(lm[33], lm[8]);
  const mid = dist(lm[27], lm[33]);

  const r1 = mouthW / (noseW || 1);            // ideal ~1.6
  const r2 = midEye / (eyeW || 1);             // ideal ~1.0
  const r3 = (lower) / (mid || 1);             // ideal ~1.05

  const s1 = 10 - Math.min(10, Math.abs(r1 - 1.6) * 8);
  const s2 = 10 - Math.min(10, Math.abs(r2 - 1.0) * 10);
  const s3 = 10 - Math.min(10, Math.abs(r3 - 1.05) * 12);
  return clamp(0.4 * s1 + 0.35 * s2 + 0.25 * s3, 0, 10);
}

/** master: compute all scores + overall */
export function computeScores(landmarks, canvas) {
  const lm = landmarks.positions;

  const symmetry = scoreSymmetry(lm);
  const jawline  = scoreJawline(lm);
  const eyes     = scoreEyes(lm);
  const skin     = scoreSkinFromCanvas(canvas, landmarks);
  const balance  = scoreBalance(lm);
  const pose     = posePenalty(lm);

  const overallBase = 0.28*symmetry + 0.22*jawline + 0.18*eyes + 0.17*skin + 0.15*balance;
  const overall     = clamp(overallBase - pose*0.9, 0, 10);
  const potential   = clamp(overall + ((10-overall)*0.35) - pose*0.3, 0, 10);

  return {
    overall, potential,
    breakdown: { symmetry, jawline, eyes, skin, balance }
  };
}
