// lib/scoring.js
import { angleAt, clamp, dist, eyeMetrics, posePenalty, skinEvennessScore } from './quality';

/** Core 6-feature scoring. Safe against NaNs and weird crops. */
export function scoreFromLandmarks(landmarks, canvas) {
  const lm = landmarks.positions;
  const faceW = Math.max(1, dist(lm[0], lm[16])); // ear-to-ear width proxy

  // Symmetry (eye/nose/mouth mirrored around mid-line)
  const midX = lm[27].x;
  const pairs = [[36, 45], [39, 42], [31, 35], [48, 54], [3, 13]];
  let symErr = 0;
  for (const [a, b] of pairs) {
    const da = Math.abs(midX - lm[a].x);
    const db = Math.abs(lm[b].x - midX);
    symErr += Math.abs(da - db);
  }
  symErr /= pairs.length;
  const symmetry = clamp(10 - (symErr / faceW) * 40, 0, 10);

  // Jawline (angle at chin between jaw sides)
  const chin = lm[8], left = lm[4], right = lm[12];
  const jawDeg = angleAt(chin, left, right) * 180 / Math.PI;
  let jawline;
  if (jawDeg < 60)      jawline = 6 + (jawDeg - 60) * 0.02;
  else if (jawDeg > 115) jawline = 6 - (jawDeg - 115) * 0.06;
  else                   jawline = 8 + (1 - Math.abs(jawDeg - 90) / 20) * 2;
  jawline = clamp(jawline, 0, 10);

  // Eyes (openness + matching)
  const { eyesScore } = eyeMetrics(lm);

  // Skin (simple evenness proxy)
  const skin = skinEvennessScore(lm, canvas, faceW);

  // Balance (soft proportional checks that are tolerant)
  const noseW = dist(lm[31], lm[35]) || 1;
  const mouthW = dist(lm[48], lm[54]) || 1;
  const eyeW = dist(lm[36], lm[39]) || 1;
  const midEyeDist = dist(lm[39], lm[42]) || 1;
  const lowerFace = dist(lm[33], lm[8]) || 1;
  const midFace = dist(lm[27], lm[33]) || 1;

  const r1 = mouthW / noseW;                   // ideal ~1.5–1.7
  const r2 = midEyeDist / eyeW;                // ideal ~0.95–1.05
  const r3 = lowerFace / midFace;              // ideal ~1.0–1.1

  const s1 = 10 - Math.min(10, Math.abs(r1 - 1.6) * 8);
  const s2 = 10 - Math.min(10, Math.abs(r2 - 1.0) * 12);
  const s3 = 10 - Math.min(10, Math.abs(r3 - 1.05) * 14);
  const balance = clamp(0.4 * s1 + 0.35 * s2 + 0.25 * s3, 0, 10);

  // Pose penalty (slightly dampen, not block)
  const pose = posePenalty(lm);

  // Overall (weights chosen to feel natural; tweak to taste)
  const overallBase = 0.28 * symmetry + 0.22 * jawline + 0.18 * eyesScore + 0.17 * skin + 0.15 * balance;
  const overall = clamp(overallBase - pose * 0.9, 0, 10);

  // Potential (ceiling with reasonable improvements)
  const potential = clamp(overall + ((10 - overall) * 0.35) - pose * 0.3, 0, 10);

  return { overall, potential, breakdown: { symmetry, jawline, eyes: eyesScore, skin, balance } };
}
