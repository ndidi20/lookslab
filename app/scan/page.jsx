'use client';

import { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { ensureVisionReady, getVisionError } from '@/lib/vision';

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
        if (mounted) setReady(false);
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

      const det = await faceapi
        .detectSingleFace(c, new faceapi.TinyFaceDetectorOptions({ inputSize: 256, scoreThreshold: 0.08 }))
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

        {!ready && !getVisionError() && (
          <p className="mt-2 text-xs text-neutral-400">Loading face models…</p>
        )}
        {!ready && getVisionError() && (
          <p className="mt-2 text-xs text-amber-400">Failed to initialize models from /public/models</p>
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
    </main>
  );
}

/* UI bits */
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

/* scoring */
function scoreFromLandmarks(landmarks) {
  const lm = landmarks.positions;
  const faceW = Math.hypot(lm[16].x - lm[0].x, lm[16].y - lm[0].y);

  const midX = lm[27].x;
  const pairs = [[36,45],[39,42],[31,35],[48,54],[3,13]];
  let symErr = 0;
  for (const [a,b] of pairs) {
    const da = Math.abs(midX - lm[a].x);
    const db = Math.abs(lm[b].x - midX);
    symErr += Math.abs(da - db);
  }
  symErr /= pairs.length;
  const symmetry = clamp(10 - (symErr / (faceW||1)) * 40, 0, 10);

  const brow = lm[27], chin = lm[8];
  const faceH = Math.hypot(chin.x - brow.x, chin.y - brow.y);
  const ratio = faceH / (faceW || 1);
  const proportions = clamp(10 - Math.abs(ratio - 1.45)*22, 0, 10);

  const left = lm[4], right = lm[12];
  const jaw = angleAt(lm[8], left, right) * 180/Math.PI;
  let jawline;
  if (jaw < 60) jawline = 6 + (jaw - 60) * 0.02;
  else if (jaw > 115) jawline = 6 - (jaw - 115) * 0.06;
  else jawline = 8 + (1 - Math.abs(jaw - 90)/20) * 2;
  jawline = clamp(jawline, 0, 10);

  const pose = posePenalty(lm);
  const base = 0.46*symmetry + 0.34*proportions + 0.20*jawline;
  const overall = clamp(base - pose*1.25, 0, 10);

  const headroom = 10 - overall;
  const potential = clamp(overall + 0.30 * Math.pow(headroom, 0.9) - pose*0.5, 0, 10);

  return { overall, potential, breakdown: { symmetry, proportions, jawline } };
}

function posePenalty(lm) {
  const L = lm[36], R = lm[45];
  const eyeDX = R.x - L.x, eyeDY = R.y - L.y;
  const rollDeg = Math.abs(Math.atan2(eyeDY, eyeDX) * 180/Math.PI);
  const nose = lm[33], midEye = { x:(L.x+R.x)/2, y:(L.y+R.y)/2 };
  const eyeDist = Math.hypot(eyeDX, eyeDY) || 1;
  const yawDeg = Math.abs((nose.x - midEye.x)/eyeDist) * 60;
  return clamp((smooth(rollDeg,5,22)+smooth(yawDeg,8,26))/2, 0, 1);
}

/* tiny utils */
function angleAt(p, a, b){ const v1={x:a.x-p.x,y:a.y-p.y}, v2={x:b.x-p.x,y:b.y-p.y}; const dot=v1.x*v2.x+v1.y*v2.y; const m1=Math.hypot(v1.x,v1.y), m2=Math.hypot(v2.x,v2.y); return Math.acos(clamp(dot/((m1*m2)||1),-1,1)); }
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function smooth(v, ok, bad){ if (v<=ok) return 0; if (v>=bad) return 1; const t=(v-ok)/(bad-ok); return t*t*(3-2*t); }
function fitContain(iw, ih, ow, oh){ const s=Math.min(ow/iw, oh/ih); return { w: Math.round(iw*s), h: Math.round(ih*s) }; }
function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.src=src; }); }
