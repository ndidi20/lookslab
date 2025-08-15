'use client';

import { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';

export default function ScanPage() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imgURL, setImgURL] = useState('');
  const [result, setResult] = useState(null);

  const canRef = useRef(null);

  // ---- init TF + models ----
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await faceapi.tf.ready();
        try { await faceapi.tf.setBackend('webgl'); } catch { await faceapi.tf.setBackend('cpu'); }
        await faceapi.tf.ready();
        const MODEL_URL = '/models';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        ]);
        if (mounted) setReady(true);
      } catch (e) {
        console.error(e);
        alert('Failed to initialize models from /public/models');
      }
    })();
    return () => { mounted = false; };
  }, []);

  const onPick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImgURL(URL.createObjectURL(f));
    setResult(null);
  };

  // ---- analysis (fast path) ----
  const TARGET_W = 480;                           // work at ~480 px
  const TARGET_H = Math.round(TARGET_W * 4/3);    // our 3:4 box
  const detectorOpts = new faceapi.TinyFaceDetectorOptions({
    inputSize: 320,
    scoreThreshold: 0.6,
  });

  const analyze = async () => {
    if (!ready || !imgURL) return;
    setBusy(true);
    try {
      const img = await loadImg(imgURL);
      const frame = await drawToCanvas(img, canRef.current, TARGET_W, TARGET_H);

      const det = await faceapi
        .detectSingleFace(frame, detectorOpts)
        .withFaceLandmarks();

      if (!det?.landmarks) {
        setResult(null);
        alert('No clear, forward‑facing face found.');
        return;
      }

      const scored = scoreFromLandmarks(det.landmarks);
      drawLandmarks(frame, det.landmarks);
      setResult(scored);
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
            <img src={imgURL} alt="" className="block max-h-[70vh] w-auto" />
          ) : (
            <p className="text-neutral-500 text-sm py-24">Upload a photo to begin</p>
          )}
          {/* analysis canvas (keeps aspect; no stretch) */}
          <canvas ref={canRef} className="w-full h-auto hidden" />
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
          <Card label="Overall"    value={result.overall} big />
          <Card label="Potential"  value={result.potential} />
          <Card label="Symmetry"   value={result.breakdown.symmetry} />
          <Card label="Proportions" value={result.breakdown.proportions} />
          <Card label="Jawline"    value={result.breakdown.jawline} />
        </div>
      )}
    </main>
  );
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

/* ---------- canvas + math helpers ---------- */
async function drawToCanvas(img, canvas, W, H) {
  const fit = fitContain(img.width, img.height, W, H);
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = 'black'; ctx.fillRect(0,0,W,H);

  if ('createImageBitmap' in window) {
    const bmp = await createImageBitmap(img, {
      resizeWidth: fit.w,
      resizeHeight: fit.h,
      resizeQuality: 'high',
    });
    ctx.drawImage(bmp, (W-fit.w)/2, (H-fit.h)/2);
  } else {
    ctx.drawImage(img, (W-fit.w)/2, (H-fit.h)/2, fit.w, fit.h);
  }
  return canvas;
}

function drawLandmarks(c, landmarks) {
  const ctx = c.getContext('2d');
  const pts = landmarks.positions;
  ctx.save();
  ctx.strokeStyle = '#9b7dff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((p,i)=> i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
  ctx.stroke();
  ctx.restore();
}

function fitContain(iw, ih, ow, oh) {
  const s = Math.min(ow/iw, oh/ih);
  return { w: Math.round(iw*s), h: Math.round(ih*s) };
}
function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=src; }); }

/* ---------- scoring (overall + potential) ---------- */
function scoreFromLandmarks(landmarks) {
  const lm = landmarks.positions;
  const faceW = Math.hypot(lm[16].x - lm[0].x, lm[16].y - lm[0].y) || 1;

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
  const symScore = clamp(10 - (symErr / faceW) * 40, 0, 10);

  // proportions
  const brow = lm[27], chin = lm[8];
  const faceH = Math.hypot(chin.x - brow.x, chin.y - brow.y) || 1;
  const ratio = faceH / faceW;
  const ratioScore = clamp(10 - Math.abs(ratio - 1.45)*22, 0, 10);

  // jaw
  const left = lm[4], right = lm[12];
  const jawDeg = angleAt(chin, left, right) * 180/Math.PI;
  let jawScore;
  if (jawDeg < 60)      jawScore = 6 + (jawDeg - 60) * 0.02;
  else if (jawDeg >115) jawScore = 6 - (jawDeg - 115) * 0.06;
  else                  jawScore = 8 + (1 - Math.abs(jawDeg - 90)/20) * 2;
  jawScore = clamp(jawScore, 0, 10);

  // pose penalty
  const pose = posePenalty(lm);
  const base = 0.46*symScore + 0.34*ratioScore + 0.20*jawScore;
  const overall = clamp(base - pose*2, 0, 10);

  // potential (how much you can gain with symmetry/posture/grooming)
  const symDef  = (10 - symScore) / 10;       // 0..1
  const poseDef = pose;                        // 0..1
  const jawDef  = Math.min(Math.abs(jawDeg - 90)/30, 1); // 0..1
  const gain    = 1.1*symDef + 0.9*poseDef + 0.6*jawDef; // weighted
  const potential = clamp(Math.min(9.2, overall + 0.4 + gain), overall + 0.2, 9.2);

  return {
    overall,
    potential,
    breakdown: { symmetry: symScore, proportions: ratioScore, jawline: jawScore },
  };
}

function posePenalty(lm) {
  const L = lm[36], R = lm[45];
  const dx = R.x - L.x, dy = R.y - L.y;
  const rollDeg = Math.abs(Math.atan2(dy, dx) * 180/Math.PI);

  const nose = lm[33];
  const midEye = { x:(L.x+R.x)/2, y:(L.y+R.y)/2 };
  const eyeDist = Math.hypot(dx, dy) || 1;
  const yawDeg = Math.abs((nose.x - midEye.x)/eyeDist) * 60;

  // 0 (perfect) -> 1 (bad)
  return clamp((smooth(rollDeg,5,18)+smooth(yawDeg,7,22))/2, 0, 1);
}
function angleAt(p, a, b){
  const v1={x:a.x-p.x,y:a.y-p.y}, v2={x:b.x-p.x,y:b.y-p.y};
  const dot=v1.x*v2.x+v1.y*v2.y, m1=Math.hypot(v1.x,v1.y), m2=Math.hypot(v2.x,v2.y);
  return Math.acos(clamp(dot/((m1*m2)||1),-1,1));
}
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function smooth(v, ok, bad){ if (v<=ok) return 0; if (v>=bad) return 1; const t=(v-ok)/(bad-ok); return t*t*(3-2*t); }
