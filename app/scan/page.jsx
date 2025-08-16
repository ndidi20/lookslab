'use client';

import { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';

export default function ScanPage() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(true);
  const [imgURL, setImgURL] = useState('');
  const [res, setRes] = useState(null);
  const canRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await ensureVisionReady();
        if (mounted) setReady(true);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const onPick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImgURL(URL.createObjectURL(f));
    setRes(null);
  };

  const analyze = async () => {
    if (!ready || !imgURL || !consent) return;
    setBusy(true);
    try {
      const img = await loadImg(imgURL);
      const c = canRef.current;
      drawToCanvasCrisp(img, 640, 800, c);

      const det = await faceapi
        .detectSingleFace(c, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.1 }))
        .withFaceLandmarks();

      setRes(det?.landmarks ? scoreFromLandmarks(det.landmarks) : null);
    } catch (e) {
      console.error(e);
      setRes(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24">
      <h1 className="text-3xl font-bold mt-10 mb-2">Face Scan</h1>
      <p className="text-sm text-neutral-400 mb-6">All analysis runs in your browser. Images aren’t uploaded.</p>

      <div className="rounded-xl border border-neutral-800 bg-black/40 p-4">
        <div className="aspect-[4/5] w-full rounded-md overflow-hidden bg-black/30 border border-neutral-900 flex items-center justify-center">
          {imgURL ? (
            <img src={imgURL} alt="" className="analyze-preview w-full h-auto object-contain" />
          ) : (
            <p className="text-neutral-500 text-sm">No image</p>
          )}
          <canvas ref={canRef} className="hidden" />
        </div>

        <div className="mt-4 flex flex-wrap gap-3 items-center">
          <label className="px-4 py-2 rounded border border-neutral-700 hover:bg-neutral-900 cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={onPick} />
            Upload a photo
          </label>

          <button
            onClick={analyze}
            disabled={!ready || !imgURL || !consent || busy}
            className="px-4 py-2 rounded bg-violet-600 hover:bg-violet-500 text-black font-semibold disabled:opacity-50"
          >
            {busy ? 'Analyzing…' : 'Analyze'}
          </button>

          <label className="ml-auto flex items-center gap-2 text-sm text-neutral-400">
            <input type="checkbox" checked={consent} onChange={(e)=>setConsent(e.target.checked)} />
            I consent to analyze this image on-device
          </label>
        </div>
      </div>

      {res && (
        <div className="mt-6 grid md:grid-cols-2 gap-4">
          <Card label="Overall" value={res.overall} big />
          <Card label="Symmetry" value={res.breakdown.symmetry} />
          <Card label="Proportions" value={res.breakdown.proportions} />
          <Card label="Jawline" value={res.breakdown.jawline} />
          <Card label="Potential" value={res.potential} />
        </div>
      )}
    </main>
  );
}

/* ---------- one-time TF + models ---------- */
let __visionReady = false;
async function ensureVisionReady() {
  if (__visionReady) return true;
  try { await tf.setBackend('webgl'); } catch { await tf.setBackend('cpu'); }
  await tf.ready();
  const URL = '/models';
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(URL),
  ]);
  __visionReady = true;
  return true;
}

/* ---------- UI bits ---------- */
function Card({ label, value, big=false }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-black/40 p-3">
      <div className={`flex items-center justify-between ${big ? 'text-xl font-semibold' : ''}`}>
        <span className="text-neutral-300">{label}</span>
        <span className="font-mono">{value.toFixed(1)}/10</span>
      </div>
    </div>
  );
}

/* ---------- drawing ---------- */
function drawToCanvasCrisp(img, W, H, canvas) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  canvas.style.width  = `${W}px`;
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const fit = fitContain(img.width, img.height, W, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, (W-fit.w)/2, (H-fit.h)/2, fit.w, fit.h);
}

/* ---------- robust scoring ---------- */
function scoreFromLandmarks(landmarks) {
  const lm = landmarks.positions;
  const dist = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
  const safe = (v, fb = 1) => (Number.isFinite(v) && v > 0 ? v : fb);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const closeness10 = (ratio, ideal, k) => clamp(10 - Math.abs(ratio - ideal) * k, 0, 10);

  const faceW = safe(dist(0, 16), 120);
  const faceH = safe(dist(27, 8), 160);

  const eyeL_w = safe(dist(36, 39), 30);
  const eyeR_w = safe(dist(42, 45), 30);
  const eye_w = (eyeL_w + eyeR_w) / 2;
  const interocular = safe(dist(39, 42), 35);
  const interpupillary = safe(dist(36, 45), 60);
  const nose_w = safe(dist(31, 35), 40);
  const mouth_w = safe(dist(48, 54), 65);

  const upper2 = safe(dist(27, 33), faceH * 0.45);
  const lower   = safe(dist(33, 8), faceH * 0.55);

  // symmetry
  const midX = lm[27].x;
  const pairs = [[36,45],[39,42],[31,35],[48,54],[3,13]];
  let symErr = 0;
  for (const [a,b] of pairs) {
    const da = Math.abs(midX - lm[a].x);
    const db = Math.abs(lm[b].x - midX);
    symErr += Math.abs(da - db);
  }
  symErr /= pairs.length;
  const symmetry = clamp(10 - (symErr / faceW) * 40, 0, 10);

  // proportions (blend)
  const faceRatio     = closeness10(faceH / faceW, 1.45, 22);
  const thirds        = closeness10(upper2 / lower, 1.0, 20);
  const eyeSpacing    = closeness10(interocular / eye_w, 1.0, 18);
  const noseBalance   = closeness10(nose_w / interocular, 1.0, 18);
  const mouthBalance  = closeness10(mouth_w / interpupillary, 1.05, 25);
  const proportions = clamp(
    0.28*faceRatio + 0.22*thirds + 0.18*eyeSpacing + 0.16*noseBalance + 0.16*mouthBalance, 0, 10
  );

  // jawline
  const angleAt = (p, a, b) => {
    const v1 = { x: lm[a].x - lm[p].x, y: lm[a].y - lm[p].y };
    const v2 = { x: lm[b].x - lm[p].x, y: lm[b].y - lm[p].y };
    const dot = v1.x*v2.x + v1.y*v2.y;
    const m1 = Math.hypot(v1.x, v1.y), m2 = Math.hypot(v2.x, v2.y);
    const cos = clamp(dot / (m1*m2 || 1), -1, 1);
    return Math.acos(cos);
  };
  const jawDeg = angleAt(8, 4, 12) * 180/Math.PI;
  let jawline;
  if (jawDeg < 60)      jawline = 6 + (jawDeg - 60) * 0.02;
  else if (jawDeg > 115) jawline = 6 - (jawDeg - 115) * 0.06;
  else                   jawline = 8 + (1 - Math.abs(jawDeg - 90)/20) * 2;
  jawline = clamp(jawline, 0, 10);

  // pose penalty (gentle)
  const posePenalty = (() => {
    const L = lm[36], R = lm[45], nose = lm[33];
    const eyeDX = R.x - L.x, eyeDY = R.y - L.y;
    const roll = Math.abs(Math.atan2(eyeDY, eyeDX) * 180/Math.PI);
    const midEye = { x:(L.x+R.x)/2, y:(L.y+R.y)/2 };
    const eyeDist = Math.hypot(eyeDX, eyeDY) || 1;
    const yaw = Math.abs((nose.x - midEye.x)/eyeDist) * 60;
    const smooth = (v, ok, bad) => (v<=ok?0 : v>=bad?1 : ((t=(v-ok)/(bad-ok)), t*t*(3-2*t)));
    return clamp((smooth(roll,5,22)+smooth(yaw,8,26))/2, 0, 1);
  })();

  const overall   = clamp(0.46*symmetry + 0.34*proportions + 0.20*jawline - posePenalty*1.0, 0, 10);
  const potential = clamp(overall + (10-overall)*0.35 - posePenalty*0.4, 0, 10);
  return { overall, potential, breakdown: { symmetry, proportions, jawline } };
}

/* ---------- misc utils ---------- */
function fitContain(iw, ih, ow, oh){ const s=Math.min(ow/iw, oh/ih); return { w: Math.round(iw*s), h: Math.round(ih*s) }; }
function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=src; }); }
