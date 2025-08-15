'use client';

import { useEffect, useRef, useState } from 'react';

// ✅ TFJS backends first (prevents “backend undefined”)
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';

export default function ScanPage() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(true);
  const [imgURL, setImgURL] = useState('');
  const [result, setResult] = useState(null);

  const canRef = useRef(null);

  // --- lazy import face-api to keep bundle slim
  const faceapiRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Backend: webgl if possible else cpu
        try { await tf.setBackend('webgl'); } catch { /* ignore */ }
        if (tf.getBackend() !== 'webgl') await tf.setBackend('cpu');
        await tf.ready();

        const faceapi = (faceapiRef.current = (await import('face-api.js')).default ?? (await import('face-api.js')));
        const MODEL_URL = '/models';

        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        ]);

        if (mounted) setReady(true);
      } catch (e) {
        console.error(e);
        alert('Failed to initialize models from /models');
      }
    })();
    return () => { mounted = false; };
  }, []);

  const onPick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setImgURL(url);
    setResult(null);
  };

  const analyze = async () => {
    if (!ready || !imgURL || !consent || busy) return;
    setBusy(true);
    try {
      const faceapi = faceapiRef.current;
      const img = await loadImg(imgURL);
      const c = drawToCanvasContain(img, canRef.current, 800, 800 * 0.75);

      // Detect *any* faces, pick the best score
      const detections = await faceapi
        .detectAllFaces(c, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.2 }))
        .withFaceLandmarks();

      if (!detections?.length) {
        alert('No face detected — try a brighter image or larger crop.');
        setBusy(false);
        return;
      }

      // best by detection score or largest box
      const best = detections
        .map(d => ({ d, area: d.detection.box.width * d.detection.box.height }))
        .sort((a, b) => (b.d.detection.score - a.d.detection.score) || (b.area - a.area))[0].d;

      // landmarks scoring
      const res = scoreFromLandmarks(best.landmarks);
      setResult(res);

      // (optional) draw tiny overlay guide
      drawLandmarksOverlay(c, best.landmarks);
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
      <p className="text-sm text-neutral-400 mb-6">All analysis runs in your browser. Images aren’t uploaded.</p>

      <div className="rounded-xl border border-neutral-800 bg-black/40 p-4">
        <div className="aspect-[3/4] w-full rounded-md overflow-hidden bg-black/30 border border-neutral-900 flex items-center justify-center">
          {imgURL ? (
            <img src={imgURL} alt="" className="w-full h-full object-contain" />
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
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
            I consent to analyze this image on‑device
          </label>
        </div>
      </div>

      {result && (
        <div className="mt-6 grid md:grid-cols-2 gap-4">
          <Break label="Overall" value={result.overall} big />
          <Break label="Symmetry" value={result.breakdown.symmetry} />
          <Break label="Proportions" value={result.breakdown.proportions} />
          <Break label="Jawline" value={result.breakdown.jawline} />
          <Break label="Potential" value={result.potential} />
        </div>
      )}
    </main>
  );
}

/* ─── UI bits ─────────────────────────────────────────────────────────── */

function Break({ label, value, big = false }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-black/40 p-3">
      <div className={`flex items-center justify-between ${big ? 'text-xl font-semibold' : ''}`}>
        <span className="text-neutral-300">{label}</span>
        <span className="font-mono">{value.toFixed(1)}/10</span>
      </div>
    </div>
  );
}

/* ─── Analysis helpers ───────────────────────────────────────────────── */

function drawToCanvasContain(img, canvas, W, H) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'black'; ctx.fillRect(0, 0, W, H);
  const fit = fitContain(img.width, img.height, W, H);
  ctx.drawImage(img, (W - fit.w) / 2, (H - fit.h) / 2, fit.w, fit.h);
  return canvas;
}

function drawLandmarksOverlay(canvas, landmarks) {
  const ctx = canvas.getContext('2d');
  const pts = landmarks.positions;
  ctx.save();
  ctx.strokeStyle = 'rgba(155,125,255,0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  ctx.restore();
}

function scoreFromLandmarks(landmarks) {
  const lm = landmarks.positions;
  const faceW = Math.hypot(lm[16].x - lm[0].x, lm[16].y - lm[0].y);

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
  const symScore = clamp(10 - (symErr / (faceW||1)) * 40, 0, 10);

  // proportions
  const brow = lm[27], chin = lm[8];
  const faceH = Math.hypot(chin.x - brow.x, chin.y - brow.y);
  const ratio = faceH / (faceW || 1);
  const ratioScore = clamp(10 - Math.abs(ratio - 1.45)*22, 0, 10);

  // jawline
  const left = lm[4], right = lm[12];
  const jaw = angleAt(lm[8], left, right) * 180/Math.PI;
  let jawScore;
  if (jaw < 60) jawScore = 6 + (jaw - 60) * 0.02;
  else if (jaw > 115) jawScore = 6 - (jaw - 115) * 0.06;
  else jawScore = 8 + (1 - Math.abs(jaw - 90)/20) * 2;
  jawScore = clamp(jawScore, 0, 10);

  // pose penalty (gentle)
  const pose = posePenalty(lm);
  const base = 0.46*symScore + 0.34*ratioScore + 0.20*jawScore;
  const overall = clamp(base - pose*1.2, 0, 10);

  // potential: cap above current; depends on geometry headroom
  const headroom = (symScore + ratioScore + jawScore)/3;
  const potential = clamp(Math.max(overall, 0.6*overall + 0.4*headroom + 1.0), overall, 10);

  return { overall, potential, breakdown: { symmetry: symScore, proportions: ratioScore, jawline: jawScore } };
}

function posePenalty(lm) {
  const L = lm[36], R = lm[45];
  const eyeDX = R.x - L.x, eyeDY = R.y - L.y;
  const rollDeg = Math.abs(Math.atan2(eyeDY, eyeDX) * 180/Math.PI);

  const nose = lm[33];
  const midEye = { x:(L.x+R.x)/2, y:(L.y+R.y)/2 };
  const eyeDist = Math.hypot(eyeDX, eyeDY) || 1;
  const yawDeg = Math.abs((nose.x - midEye.x)/eyeDist) * 60;

  return clamp((smooth(rollDeg,6,22)+smooth(yawDeg,9,28))/2, 0, 1);
}

function angleAt(p, a, b) {
  const v1={x:a.x-p.x,y:a.y-p.y}, v2={x:b.x-p.x,y:b.y-p.y};
  const dot=v1.x*v2.x+v1.y*v2.y, m1=Math.hypot(v1.x,v1.y), m2=Math.hypot(v2.x,v2.y);
  return Math.acos(clamp(dot/((m1*m2)||1),-1,1));
}
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function smooth(v, ok, bad){ if (v<=ok) return 0; if (v>=bad) return 1; const t=(v-ok)/(bad-ok); return t*t*(3-2*t); }
function fitContain(iw, ih, ow, oh){ const s=Math.min(ow/iw, oh/ih); return { w: Math.round(iw*s), h: Math.round(ih*s) }; }
function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=src; }); }
