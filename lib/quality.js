// lib/quality.js

// Simple Laplacian variance for blur (higher = sharper)
export function laplacianVar(imgData) {
  const { data, width, height } = imgData;
  const get = (x, y) => {
    const i = (y * width + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // luminance
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const kernel = [0, 1, 0, 1, -4, 1, 0, 1, 0];
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p =
        kernel[0] * get(x - 1, y - 1) + kernel[1] * get(x, y - 1) + kernel[2] * get(x + 1, y - 1) +
        kernel[3] * get(x - 1, y) + kernel[4] * get(x, y) + kernel[5] * get(x + 1, y) +
        kernel[6] * get(x - 1, y + 1) + kernel[7] * get(x, y + 1) + kernel[8] * get(x + 1, y + 1);
      sum += p; sumSq += p * p; n++;
    }
  }
  const mean = sum / (n || 1);
  return sumSq / (n || 1) - mean * mean;
}

// Average luminance 0..1
export function meanLuma(imgData) {
  const { data } = imgData;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  return (sum / ((data.length / 4) || 1)) / 255;
}

// Pose & sizing from landmarks
export function poseAndSize(pts, canvasW) {
  // eye centers
  const L = pts[33], R = pts[263];
  const mid = { x: (L.x + R.x) / 2, y: (L.y + R.y) / 2 };
  const nose = pts[1];
  const chin = pts[152];
  const mouth = pts[13];
  const ipd = Math.hypot(R.x - L.x, R.y - L.y) || 1;

  // roll = tilt of eye line (deg)
  const roll = Math.atan2(R.y - L.y, R.x - L.x) * 180 / Math.PI;

  // yaw ≈ horizontal nose offset from mid‑eyes normalized by IPD
  const yaw = (Math.abs(nose.x - mid.x) / ipd) * 100; // arbitrary scale -> gate by threshold

  // pitch ≈ eyes↔mouth vs mouth↔chin vertical balance
  const pitch = Math.abs(((mouth.y - mid.y) - (chin.y - mouth.y))) / (ipd || 1) * 100;

  // face width vs image width
  const cheekL = pts[234], cheekR = pts[454];
  const faceW = Math.hypot(cheekR.x - cheekL.x, cheekR.y - cheekL.y);
  const facePct = (faceW / (canvasW || 1)) * 100;

  return { roll: Math.abs(roll), yaw, pitch, facePct };
}

// Quality decision + confidence
export function qualityReport({ yaw, pitch, roll, facePct, luma, lapVar }) {
  const fails = [];

  // thresholds tuned for selfie cams
  if (yaw > 12) fails.push('Turn more straight-on (reduce yaw).');
  if (pitch > 12) fails.push('Level your head (reduce pitch).');
  if (roll > 12) fails.push('Keep eyes level (reduce roll).');

  if (luma < 0.25) fails.push('Increase lighting (image is too dark).');
  if (luma > 0.85) fails.push('Reduce exposure (image is too bright).');
  if (lapVar < 90) fails.push('Hold steady / clean lens (image is blurry).');

  if (facePct < 30) fails.push('Move closer (face too small).');
  if (facePct > 80) fails.push('Move back a bit (face too large).');

  // confidence from soft scoring of each factor (0..100)
  const sYaw = Math.max(0, 100 - (yaw / 12) * 100);
  const sPitch = Math.max(0, 100 - (pitch / 12) * 100);
  const sRoll = Math.max(0, 100 - (roll / 12) * 100);
  const sLuma = 100 - (Math.min(Math.abs(luma - 0.55), 0.55) / 0.55) * 100;
  const sBlur = Math.min(100, (lapVar / 150) * 100); // 150≈very sharp
  const sSize = 100 - (Math.min(Math.abs(facePct - 55), 55) / 55) * 100;

  const confidence = Math.round(0.2 * sYaw + 0.2 * sPitch + 0.2 * sRoll + 0.15 * sLuma + 0.15 * sBlur + 0.1 * sSize);

  return { passes: fails.length === 0, fails, confidence };
}
