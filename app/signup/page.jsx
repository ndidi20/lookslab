'use client';

import { useEffect, useRef, useState } from 'react';

export default function ScanPage() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(true);
  const [imgUrl, setImgUrl] = useState('');
  const [res, setRes] = useState(null);

  const faceapiRef = useRef(null);
  const tfRef = useRef(null);
  const canRef = useRef(null);

  // --- one-time TF + models init (client-only)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const tf = (await import('@tensorflow/tfjs-core')).default;
        await import('@tensorflow/tfjs-backend-webgl');
        await import('@tensorflow/tfjs-backend-cpu');
        // choose backend then wait
        try { await tf.setBackend('webgl'); } catch { await tf.setBackend('cpu'); }
        await tf.ready();
        tfRef.current = tf;

        const faceapi = await import('face-api.js');
        faceapiRef.current = faceapi;

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

  const pick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setImgUrl(url);
    setRes(null);
  };

  const analyze = async () => {
    if (!ready || !imgUrl || !consent) return;
    setBusy(true);
    try {
      const out = await analyzeOne(imgUrl, faceapiRef.current);
      setRes(out);
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
      <p className="text-sm text-neutral-400 mb-6">
        All analysis runs in your browser. Images aren’t uploaded.
      </p>

      <div className="rounded-xl border border-neutral-800 bg-black/40 p-4">
        {/* image area (no stretch) */}
        <div className="aspect-[3/4] w-full rounded-md overflow-hidden bg-black/30 border border-neutral-900 flex items-center justify-center">
          {imgUrl ? (
            <img src={imgUrl} alt="" className="w-full h-full object-contain" />
          ) : (
            <p className="text-neutral-500 text-sm">No image</p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="px-4 py-2 rounded border border-neutral-700 hover:bg-neutral-900 cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={pick} />
            Upload a photo
          </label>

          <button
            onClick={analyze}
            disabled={!ready || !imgUrl || !consent || busy}
            className="px-4 py-2 rounded bg-violet-600 hover:bg-violet-500 text-black font-semibold disabled:opacity-50"
          >
            {busy ? 'Analyzing…' : 'Analyze'}
          </button>

          <label className="ml-auto flex items-center gap-2 text-sm text-neutral-400">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I consent to analyze this image on‑device
          </label>
        </div>

        {/* note zone for model init errors */}
        {!ready && (
          <p className="mt-3 text-xs text-amber-300">
            Loading face models…
          </p>
        )}
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

      <canvas ref={canRef} className="hidden" />
    </main>
  );

  /* ---------- helpers ---------- */

  async function analyzeOne(url, faceapi) {
    // draw into a canvas with letterboxing (no stretch) for consistent inference
    const img = await loadImg(url);
    const W = 640, H = 800;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'black'; ctx.fillRect(0, 0, W, H);
    const fit = fitContain(img.width, img.height, W, H);
    ctx.drawImage(img, (W - fit.w) / 2, (H - fit.h) / 2, fit.w, fit.h);

    // try single-face first; fall back to "best" face from many
    let det = await faceapi
      .detectSingleFace(c, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
      .withFaceLandmarks();

    if (!det?.landmarks) {
      const many = await faceapi
        .detectAllFaces(c, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
        .withFaceLandmarks();
      if (many && many.length) {
        det = many.sort((a, b) => area(b.detection.box) - area(a.detection.box))[0];
      }
    }
    if (!det?.landmarks) return null;

    const scored = scoreFromLandmarks(det.landmarks);
    // compute a "Potential" that is bounded by current geom
    scored.potential = computePotential(scored);
    return scored;
  }
}

/* ---------- small UI piece ---------- */
function Card({ label, value, big = false }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-black/40 p-3">
      <div className={`flex items-center justify-between ${big ? 'text-xl font-semibold' : ''}`}>
        <span className="text-neutral-300">{label}</span>
        <span className="font-mono">{value?.toFixed ? value.toFixed(1) : '—'}/10</span>
      </div>
    </div>
  );
}

/* ---------- geometry scoring (same core used in Studio) ---------- */
function scoreFromLandmarks(landmarks) {
  const lm = landmarks.positions;
  const faceW = Math.hypot(lm[16].x - lm[0].x, lm[16].y - lm[0].y) || 1;

  // symmetry
  const midX = lm[27].x;
  const pairs = [[36,45],[39,42],[31,35],[48,54],[3,13]];
  let symErr = 0;
  for (const [a, b] of pairs) {
    const da = Math.abs(midX - lm[a].x);
    const db = Math.abs(lm[b].x - midX);
    symErr += Math.abs(da - db);
  }
  symErr /= pairs.length;
  const symmetry = clamp(10 - (symErr / faceW) * 40, 0, 10);

  // proportions (height/width)
  const brow = lm[27], chin = lm[8];
  const faceH = Math.hypot(chin.x - brow.x, chin.y - brow.y) || 1;
  const ratio = faceH / faceW;
  const proportions = clamp(10 - Math.abs(ratio - 1.45) * 22, 0, 10);

  // jawline angle at chin
  const left = lm[4], right = lm[12];
  const jawDeg = angleAt(lm[8], left, right) * 180 / Math.PI;
  let jawline;
  if (jawDeg < 60) jawline = 6 + (jawDeg - 60) * 0.02;
  else if (jawDeg > 115) jawline = 6 - (jawDeg - 115) * 0.06;
  else jawline = 8 + (1 - Math.abs(jawDeg - 90) / 20) * 2;
  jawline = clamp(jawline, 0, 10);

  // pose penalty (roll + yaw approximations)
  const L = lm[36], R = lm[45];
  const eyeDX = R.x - L.x, eyeDY = R.y - L.y;
  const rollDeg = Math.abs(Math.atan2(eyeDY, eyeDX) * 180 / Math.PI);
  const nose = lm[33], midEye = { x: (L.x + R.x) / 2, y: (L.y + R.y) / 2 };
  const eyeDist = Math.hypot(eyeDX, eyeDY) || 1;
  const yawDeg = Math.abs((nose.x - midEye.x) / eyeDist) * 60;
  const pose = clamp((smooth(rollDeg, 5, 18) + smooth(yawDeg, 7, 22)) / 2, 0, 1);

  const base = 0.46 * symmetry + 0.34 * proportions + 0.20 * jawline;
  const overall = clamp(base - pose * 2, 0, 10);

  return { overall, breakdown: { symmetry, proportions, jawline } };
}

function computePotential(s) {
  if (!s) return 0;
  // “Potential” = current overall plus room from symmetry & jawline, capped.
  // People with already-strong geometry have less headroom.
  const { symmetry, jawline, proportions } = s.breakdown;
  const headroom =
    (10 - symmetry) * 0.35 +
    (10 - jawline) * 0.35 +
    (10 - proportions) * 0.15;
  const capped = clamp(s.overall + Math.min(2.2, headroom * 0.6), 0, 10);
  // Soft cap by current overall (not everyone reaches 9+)
  const ceiling = s.overall < 6 ? 8.0 : s.overall < 7 ? 8.6 : 9.0;
  return Math.min(capped, ceiling);
}

/* ---------- math/canvas utils ---------- */
function loadImg(src) { return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = src; }); }
function fitContain(iw, ih, ow, oh){ const s=Math.min(ow/iw, oh/ih); return { w: Math.round(iw*s), h: Math.round(ih*s) }; }
function angleAt(p, a, b){ const v1={x:a.x-p.x,y:a.y-p.y}, v2={x:b.x-p.x,y:b.y-p.y}; const dot=v1.x*v2.x+v1.y*v2.y; const m1=Math.hypot(v1.x,v1.y), m2=Math.hypot(v2.x,v2.y); return Math.acos(clamp(dot/((m1*m2)||1),-1,1)); }
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function smooth(v, ok, bad){ if(v<=ok) return 0; if(v>=bad) return 1; const t=(v-ok)/(bad-ok); return t*t*(3-2*t); }
function area(b){ return Math.max(0, b.width) * Math.max(0, b.height); }
