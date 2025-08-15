'use client';

import { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';

export default function ScanPage() {
  const [ready, setReady]   = useState(false);
  const [busy, setBusy]     = useState(false);
  const [imgURL, setImgURL] = useState('');
  const [result, setResult] = useState(null);

  const canRef = useRef(null);

  // Load models (robust, no tf.ready calls)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // pick backend if available (don’t call tf.ready)
        if (faceapi?.tf?.setBackend) {
          try { await faceapi.tf.setBackend('webgl'); }
          catch { await faceapi.tf.setBackend('cpu'); }
        }

        const MODEL_URL = '/models';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        ]);
        if (alive) setReady(true);
      } catch (e) {
        console.error(e);
        alert('Failed to initialize models from /public/models');
      }
    })();
    return () => { alive = false; };
  }, []);

  const onPick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setResult(null);
    setImgURL(URL.createObjectURL(f));
  };

  const analyze = async () => {
    if (!ready || !imgURL) return;
    setBusy(true);
    try {
      const img = await loadImg(imgURL);
      const frame = drawToCanvas(img, canRef.current, 640, 800);

      const det = await faceapi
        .detectSingleFace(frame, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
        .withFaceLandmarks();

      if (!det?.landmarks) { alert('No clear, forward‑facing face found.'); setResult(null); return; }

      const res = scoreFromLandmarks(det.landmarks);
      drawLandmarks(frame, det.landmarks);
      setResult(res);
    } catch (e) {
      console.error(e);
      alert('Analysis failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24">
      <h1 className="text-3xl font-bold mt-10 mb-2">Face Scan</h1>
      <p className="text-sm text-neutral-400 mb-6">
        All analysis runs in your browser. Images aren’t uploaded.
      </p>

      {!ready && <p className="text-sm text-neutral-400 mb-4">Loading face models…</p>}

      <div className="rounded-xl border border-neutral-800 bg-black/40 p-4">
        <div className="aspect-[3/4] w-full rounded-md overflow-hidden bg-black/30 border border-neutral-900 flex items-center justify-center">
          {imgURL ? (
            <img src={imgURL} alt="" className="absolute opacity-0 pointer-events-none" />
          ) : (
            <p className="text-neutral-500 text-sm">No image</p>
          )}
          <canvas ref={canRef} className="w-full h-full" />
        </div>

        <div className="mt-4 flex flex-wrap gap-3 items-center">
          <label className="px-4 py-2 rounded border border-neutral-700 hover:bg-neutral-900 cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={onPick} />
            Upload a photo
          </label>

          <button
            onClick={analyze}
            disabled={!ready || !imgURL || busy}
            className="px-4 py-2 rounded bg-violet-600 hover:bg-violet-500 text-black font-semibold disabled:opacity-50"
          >
            {busy ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>
      </div>

      {result && (
        <div className="mt-6 grid md:grid-cols-2 gap-4">
          <CardRow label="Overall"   value={result.overall} big />
          <CardRow label="Potential" value={result.potential} big />
          <CardRow label="Symmetry"      value={result.breakdown.symmetry} />
          <CardRow label="Proportions"   value={result.breakdown.proportions} />
          <CardRow label="Jawline"       value={result.breakdown.jawline} />
          <CardRow label="Eye spacing"   value={result.breakdown.eyeSpacing} />
          <CardRow label="Mouth width"   value={result.breakdown.mouth} />
          <CardRow label="Nose width"    value={result.breakdown.nose} />
        </div>
      )}
    </main>
  );
}

/* ---------- UI bits ---------- */

function CardRow({ label, value, big=false }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-black/40 p-3">
      <div className={`flex items-center justify-between ${big ? 'text-xl font-semibold' : ''}`}>
        <span className="text-neutral-300">{label}</span>
        <span className="font-mono">{value.toFixed(1)}/10</span>
      </div>
    </div>
  );
}

/* ---------- Canvas helpers ---------- */

function drawToCanvas(img, canvas, W, H) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'black'; ctx.fillRect(0,0,W,H);
  const fit = fitContain(img.width, img.height, W, H);
  ctx.drawImage(img, (W-fit.w)/2, (H-fit.h)/2, fit.w, fit.h);
  return canvas;
}

function drawLandmarks(canvas, landmarks) {
  const ctx = canvas.getContext('2d');
  const pts = landmarks.positions;
  ctx.save();
  ctx.strokeStyle = '#9b7dff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  ctx.restore();
}

/* ---------- Scoring (with realistic Potential) ---------- */

function scoreFromLandmarks(landmarks) {
  const lm = landmarks.positions;
  const faceW = dist(lm[0], lm[16]);
  const faceH = dist(lm[8], lm[27]);
  const midX  = lm[27].x;

  // Symmetry
  const pairs = [[36,45],[39,42],[31,35],[48,54],[3,13]];
  let symErr = 0;
  for (const [a,b] of pairs) {
    const da = Math.abs(midX - lm[a].x);
    const db = Math.abs(lm[b].x - midX);
    symErr += Math.abs(da - db);
  }
  symErr /= pairs.length;
  const symmetry = clamp(10 - (symErr / (faceW || 1)) * 40, 0, 10);

  // Proportions (H/W ~ 1.45)
  const ratio = faceH / (faceW || 1);
  const proportions = clamp(10 - Math.abs(ratio - 1.45) * 22, 0, 10);

  // Jawline (angle at chin)
  const jawAngleDeg = angleAt(lm[8], lm[4], lm[12]) * 180/Math.PI;
  let jawline;
  if (jawAngleDeg < 60)       jawline = 6 + (jawAngleDeg - 60) * 0.02;
  else if (jawAngleDeg > 115) jawline = 6 - (jawAngleDeg - 115) * 0.06;
  else                        jawline = 8 + (1 - Math.abs(jawAngleDeg - 90)/20) * 2;
  jawline = clamp(jawline, 0, 10);

  // Eye spacing (ideal inner gap ≈ 1× eye width)
  const eyeW = dist(lm[39], lm[36]);
  const innerGap = dist(lm[39], lm[42]);
  const eyeSpacing = scoreTo10(innerGap / (eyeW || 1), 1.0, 0.25);

  // Mouth width vs inner-eye gap (ideal ~1.6×)
  const mouthW = dist(lm[48], lm[54]);
  const mouthIdeal = 1.6 * (innerGap || 1);
  const mouth = scoreTo10(mouthW / (mouthIdeal || 1), 1.0, 0.25);

  // Nose width vs face width (ideal ~0.28× face width)
  const noseW = dist(lm[31], lm[35]);
  const noseIdeal = 0.28 * (faceW || 1);
  const nose = scoreTo10(noseW / (noseIdeal || 1), 1.0, 0.28);

  // Pose penalty (0..1)
  const pose = posePenalty(lm);

  // Base structural score
  const base =
    0.30 * symmetry   +
    0.22 * proportions+
    0.18 * jawline    +
    0.14 * eyeSpacing +
    0.08 * mouth      +
    0.08 * nose;

  const overall = clamp(base - pose * 2.0, 0, 10);

  // Potential: reclaim pose + modest improvables + cap
  const poseBoost = pose * 2.0;
  const deficit = (s) => (10 - s);
  const improvBoostWeighted =
      0.35 * deficit(jawline)     +
      0.25 * deficit(proportions) +
      0.30 * deficit(mouth)       +
      0.15 * deficit(symmetry)    +
      0.08 * deficit(nose)        +
      0.05 * deficit(eyeSpacing);
  const softGain = 0.12 * improvBoostWeighted;
  const hardCap  = Math.min(base + (10 - base) * 0.50, 9.2);
  const potential = clamp(Math.max(overall, overall + poseBoost + softGain), 0, hardCap);

  return {
    overall,
    potential,
    breakdown: { symmetry, proportions, jawline, eyeSpacing, mouth, nose }
  };
}

/* ---------- Math / utils ---------- */

function posePenalty(lm) {
  const L = lm[36], R = lm[45];
  const eyeDX = R.x - L.x, eyeDY = R.y - L.y;
  const rollDeg = Math.abs(Math.atan2(eyeDY, eyeDX) * 180/Math.PI);

  const nose = lm[33];
  const midEye = { x:(L.x+R.x)/2, y:(L.y+R.y)/2 };
  const eyeDist = Math.hypot(eyeDX, eyeDY) || 1;
  const yawDeg = Math.abs((nose.x - midEye.x)/eyeDist) * 60;

  return clamp((smooth(rollDeg,5,18)+smooth(yawDeg,7,22))/2, 0, 1);
}

function angleAt(p, a, b) {
  const v1 = { x: a.x - p.x, y: a.y - p.y };
  const v2 = { x: b.x - p.x, y: b.y - p.y };
  const dot = v1.x*v2.x + v1.y*v2.y;
  const m1 = Math.hypot(v1.x, v1.y), m2 = Math.hypot(v2.x, v2.y);
  return Math.acos(clamp(dot / ((m1*m2)||1), -1, 1));
}

function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function smooth(v, ok, bad){ if (v<=ok) return 0; if (v>=bad) return 1; const t=(v-ok)/(bad-ok); return t*t*(3-2*t); }
function fitContain(iw, ih, ow, oh){ const s=Math.min(ow/iw, oh/ih); return { w: Math.round(iw*s), h: Math.round(ih*s) }; }
function scoreTo10(ratio, ideal, tol){
  const d = Math.abs(ratio - ideal) / (tol || 1);
  return clamp(10 - d * 10, 0, 10);
}
function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=src; }); }
