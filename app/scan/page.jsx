'use client';

import { useEffect, useMemo, useState } from 'react';

export default function ScanPage() {
  const [fa, setFA] = useState(null);            // face-api.js (loaded client-side)
  const [modelsReady, setModelsReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imgURL, setImgURL] = useState('');
  const [result, setResult] = useState(null);

  // load face-api.js only in the browser + models from /public/models
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const faceapi = (await import('face-api.js')).default ?? (await import('face-api.js'));
        if (!alive) return;

        const MODEL_URL = '/models';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        ]);

        if (!alive) return;
        setFA(faceapi);
        setModelsReady(true);
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
    const url = URL.createObjectURL(f);
    setImgURL(url);
    setResult(null);
  };

  const analyze = async () => {
    if (!fa || !modelsReady || !imgURL) return;
    setBusy(true);
    try {
      const img = await loadImg(imgURL);

      // draw to temp canvas at small, fixed size for speed (contain)
      const W = 640, H = 800;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      ctx.fillStyle = 'black'; ctx.fillRect(0,0,W,H);
      const fit = fitContain(img.width, img.height, W, H);
      ctx.drawImage(img, (W-fit.w)/2, (H-fit.h)/2, fit.w, fit.h);

      const det = await fa
        .detectSingleFace(c, new fa.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
        .withFaceLandmarks();

      if (!det?.landmarks) {
        setResult(null);
        alert('No clear, forward‑facing face found.');
        return;
      }

      const r = scoreFromLandmarks(det.landmarks);
      setResult(r);
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

      {!modelsReady && (
        <p className="text-sm text-neutral-400 mb-4">Loading face models…</p>
      )}

      <div className="rounded-xl border border-neutral-800 bg-black/40 p-4">
        <div className="w-full rounded-md overflow-hidden bg-black/30 border border-neutral-900 aspect-[3/4] flex items-center justify-center">
          {imgURL ? (
            <img src={imgURL} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <p className="text-neutral-500 text-sm">No image</p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-3 items-center">
          <label className="px-4 py-2 rounded border border-neutral-700 hover:bg-neutral-900 cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={onPick} />
            Upload a photo
          </label>

          <button
            onClick={analyze}
            disabled={!modelsReady || !imgURL || busy}
            className="px-4 py-2 rounded bg-violet-600 hover:bg-violet-500 text-black font-semibold disabled:opacity-50"
          >
            {busy ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>
      </div>

      {result && (
        <div className="mt-6 grid md:grid-cols-2 gap-4">
          <ScoreRow label="Overall" value={result.overall} big />
          <ScoreRow label="Potential" value={result.potential} />
          <ScoreRow label="Symmetry" value={result.breakdown.symmetry} />
          <ScoreRow label="Proportions" value={result.breakdown.proportions} />
          <ScoreRow label="Jawline" value={result.breakdown.jawline} />
          <ScoreRow label="Features" value={result.breakdown.features} />
        </div>
      )}
    </main>
  );
}

/* ---------- little UI bits ---------- */
function ScoreRow({ label, value, big=false }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-black/40 p-3">
      <div className={`flex items-center justify-between ${big ? 'text-xl font-semibold' : ''}`}>
        <span className="text-neutral-300">{label}</span>
        <span className="font-mono">{value.toFixed(1)}/10</span>
      </div>
    </div>
  );
}

/* ---------- scoring core (same used by Studio) ---------- */
function scoreFromLandmarks(landmarks) {
  const lm = landmarks.positions;
  const faceW = Math.hypot(lm[16].x - lm[0].x, lm[16].y - lm[0].y) || 1;

  // symmetry: compare mirrored distances about nose bridge x (~pt 27)
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

  // proportions: face height / width near 1.45 (works decently on straight faces)
  const brow = lm[27], chin = lm[8];
  const faceH = Math.hypot(chin.x - brow.x, chin.y - brow.y) || 1;
  const ratio = faceH / faceW;
  const proportions = clamp(10 - Math.abs(ratio - 1.45)*22, 0, 10);

  // jawline sharpness: angle at chin from jaw corners
  const left = lm[4], right = lm[12];
  const jawDeg = rad2deg(angleAt(chin, left, right));
  let jawline;
  if (jawDeg < 60) jawline = 6 + (jawDeg - 60) * 0.02;
  else if (jawDeg > 115) jawline = 6 - (jawDeg - 115) * 0.06;
  else jawline = 8 + (1 - Math.abs(jawDeg - 90)/20) * 2;
  jawline = clamp(jawline, 0, 10);

  // “features” crude aesthetic: eye size balance + lip:chin fullness
  const eyeL = lm[39], eyeR = lm[42], eyeMid = { x:(lm[36].x+lm[45].x)/2, y:(lm[36].y+lm[45].y)/2 };
  const eyeW = Math.hypot(lm[45].x-lm[36].x, lm[45].y-lm[36].y) || 1;
  const eyeBal = 1 - Math.abs(dist(eyeL, eyeMid) - dist(eyeR, eyeMid)) / eyeW; // [0..1]
  const lipFull = dist(lm[66], lm[62]) / (faceH||1);                              // lower vs upper lip
  const lipScore = clamp(10 - Math.abs(lipFull - 0.055)*180, 0, 10);
  const features = clamp( (eyeBal*10*0.55) + (lipScore*0.45), 0, 10);

  // pose penalty (roll + yaw from eyes + nose)
  const pose = posePenalty(lm);
  const base = 0.38*symmetry + 0.30*proportions + 0.22*jawline + 0.10*features;
  const overall = clamp(base - pose*2, 0, 10);

  // potential: headroom scaled by quality (don’t give everyone 9+)
  const quality = clamp(10 - pose*7, 0, 10);                 // 10 == stable, 0 == bad pose/blur proxy
  const maxReach = clamp( overall + (quality/10)*2.2, 0, 9.2);
  const potential = Math.max(overall, maxReach);

  return {
    overall, potential,
    breakdown: { symmetry, proportions, jawline, features }
  };
}

/* ---------- helpers ---------- */
function angleAt(p, a, b) {
  const v1 = { x: a.x - p.x, y: a.y - p.y };
  const v2 = { x: b.x - p.x, y: b.y - p.y };
  const dot = v1.x*v2.x + v1.y*v2.y;
  const m1 = Math.hypot(v1.x, v1.y), m2 = Math.hypot(v2.x, v2.y);
  return Math.acos(clamp(dot/((m1*m2)||1), -1, 1));
}
function posePenalty(lm) {
  const L = lm[36], R = lm[45];
  const eyeDX = R.x - L.x, eyeDY = R.y - L.y;
  const roll = Math.abs(rad2deg(Math.atan2(eyeDY, eyeDX)));

  const nose = lm[33];
  const midEye = { x:(L.x+R.x)/2, y:(L.y+R.y)/2 };
  const eyeDist = Math.hypot(eyeDX, eyeDY) || 1;
  const yaw = Math.abs((nose.x - midEye.x)/eyeDist) * 60;

  return clamp((smooth(roll,5,18)+smooth(yaw,7,22))/2, 0, 1);
}
function fitContain(iw, ih, ow, oh){ const s=Math.min(ow/iw, oh/ih); return { w: Math.round(iw*s), h: Math.round(ih*s) }; }
function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=src; }); }
function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
function rad2deg(r){ return r*180/Math.PI; }
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function smooth(v, ok, bad){ if (v<=ok) return 0; if (v>=bad) return 1; const t=(v-ok)/(bad-ok); return t*t*(3-2*t); }
