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
      const W = 640, H = 800;
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      ctx.fillStyle = 'black'; ctx.fillRect(0,0,W,H);
      const fit = fitContain(img.width, img.height, W, H);
      ctx.drawImage(img, (W-fit.w)/2, (H-fit.h)/2, fit.w, fit.h);

      // fast + permissive detector
      const det = await faceapi
        .detectSingleFace(c, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.1 }))
        .withFaceLandmarks();

      setRes(det?.landmarks ? scoreFromLandmarks(det.landmarks) : null);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24">
      <h1 className="text-3xl font-bold mt-10 mb-2">Face Scan</h1>
      <p className="text-sm text-neutral-400 mb-6">All analysis runs in your browser. Images aren’t uploaded.</p>

      <div className="rounded-xl border border-neutral-800 bg-black/40 p-4">
        {/* preview box — never stretches */}
        <div className="aspect-[4/5] w-full rounded-md overflow-hidden bg-black/30 border border-neutral-900 flex items-center justify-center">
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
            <input type="checkbox" checked={consent} onChange={(e)=>setConsent(e.target.checked)} />
            I consent to analyze this image on‑device
          </label>
        </div>

        {!ready && <p className="mt-2 text-xs text-amber-400">Failed to initialize models from /public/models</p>}
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

/* ---------- one-time TFJS + model init ---------- */

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

/* ---------- scoring (robust proportions) ---------- */
function scoreFromLandmarks(landmarks) {
  const lm = landmarks.positions;

  // robust face width from multiple cues → median
  const d = (a, b) => Math.hypot(lm[b].x - lm[a].x, lm[b].y - lm[a].y);
  const minX = Math.min(...lm.map(p => p.x)), maxX = Math.max(...lm.map(p => p.x));
  const widths = [
    d(0,16),         // jaw edges
    d(3,13),         // cheekbones
    d(4,12),         // lower cheeks
    d(36,45) * 2.1,  // eye distance scaled to head width
    (maxX - minX) * 0.90, // bbox width (shrunk)
  ].filter(v => Number.isFinite(v) && v > 0);

  const median = (arr) => { const a=[...arr].sort((x,y)=>x-y); const m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2; };
  const faceW = Math.max(1, median(widths));

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

  // proportions (brow→chin vs width)
  const brow = lm[27], chin = lm[8];
  const faceH = Math.hypot(chin.x - brow.x, chin.y - brow.y);
  const ratio = faceH / faceW;          // normal ~1.35–1.55
  const IDEAL = 1.45, TOL = 0.18;       // full score inside [ideal ± tol]
  const excess = Math.max(0, Math.abs(ratio - IDEAL) - TOL);
  const proportions = clamp(10 - excess * 35, 0, 10);

  // jawline
  const jawDeg = angleAt(lm[8], lm[4], lm[12]) * 180/Math.PI;
  let jawline;
  if (jawDeg < 60)       jawline = 6 + (jawDeg - 60) * 0.02;
  else if (jawDeg > 115) jawline = 6 - (jawDeg - 115) * 0.06;
  else                   jawline = 8 + (1 - Math.abs(jawDeg - 90)/20) * 2;
  jawline = clamp(jawline, 0, 10);

  // pose penalty (forgiving)
  const pose = posePenalty(lm);

  const overall = clamp(0.46*symmetry + 0.34*proportions + 0.20*jawline - pose*1.25, 0, 10);
  const potential = clamp(overall + ((10 - overall) * 0.35) - pose * 0.5, 0, 10);

  return { overall, potential, breakdown: { symmetry, proportions, jawline } };
}

function posePenalty(lm) {
  const L = lm[36], R = lm[45];
  const eyeDX = R.x - L.x, eyeDY = R.y - L.y;
  const rollDeg = Math.abs(Math.atan2(eyeDY, eyeDX) * 180/Math.PI);
  const nose = lm[33];
  const midEye = { x:(L.x+R.x)/2, y:(L.y+R.y)/2 };
  const eyeDist = Math.hypot(eyeDX, eyeDY) || 1;
  const yawDeg = Math.abs((nose.x - midEye.x)/eyeDist) * 60;
  return clamp((smooth(rollDeg,5,22)+smooth(yawDeg,8,26))/2, 0, 1);
}

/* ---------- tiny utils ---------- */
function angleAt(p,a,b){ const v1={x:a.x-p.x,y:a.y-p.y}, v2={x:b.x-p.x,y:b.y-p.y}; const dot=v1.x*v2.x+v1.y*v2.y; const m1=Math.hypot(v1.x,v1.y), m2=Math.hypot(v2.x,v2.y); return Math.acos(clamp(dot/((m1*m2)||1),-1,1)); }
function clamp(v,lo,hi){ return Math.max(lo, Math.min(hi, v)); }
function smooth(v,ok,bad){ if(v<=ok)return 0; if(v>=bad)return 1; const t=(v-ok)/(bad-ok); return t*t*(3-2*t); }
function fitContain(iw,ih,ow,oh){ const s=Math.min(ow/iw, oh/ih); return { w:Math.round(iw*s), h:Math.round(ih*s) }; }
function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=src; }); }
