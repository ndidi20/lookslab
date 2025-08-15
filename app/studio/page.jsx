'use client';

import { useEffect, useRef, useState } from 'react';

export default function FaceOffStudio() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(true);

  const [left, setLeft] = useState({ url: '', res: null });
  const [right, setRight] = useState({ url: '', res: null });

  const faceapiRef = useRef(null);

  // client-only TF + model init
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const tf = (await import('@tensorflow/tfjs-core')).default;
        await import('@tensorflow/tfjs-backend-webgl');
        await import('@tensorflow/tfjs-backend-cpu');
        try { await tf.setBackend('webgl'); } catch { await tf.setBackend('cpu'); }
        await tf.ready();

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

  const pick = (side) => (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    (side === 'left' ? setLeft : setRight)((s) => ({ ...s, url, res: null }));
  };

  const analyze = async () => {
    if (!ready || !consent) return;
    setBusy(true);
    try {
      const out = await Promise.all([
        left.url ? analyzeOne(left.url, faceapiRef.current) : null,
        right.url ? analyzeOne(right.url, faceapiRef.current) : null,
      ]);
      const [l, r] = out;
      setLeft((s) => ({ ...s, res: l }));
      setRight((s) => ({ ...s, res: r }));
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 pb-28">
      <h1 className="text-3xl font-bold mt-10 mb-2">Face‑Off Studio</h1>
      <p className="text-sm text-neutral-400 mb-6">
        Upload two pics → auto scores → compare.
      </p>

      {!ready && <p className="text-sm text-neutral-400 mb-4">Loading models…</p>}

      <div className="grid md:grid-cols-2 gap-5">
        <Slot
          label="Left"
          slot={left}
          onPick={pick('left')}
          clear={() => setLeft({ url: '', res: null })}
        />
        <Slot
          label="Right"
          slot={right}
          onPick={pick('right')}
          clear={() => setRight({ url: '', res: null })}
        />
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={analyze}
          disabled={!ready || (!left.url && !right.url) || !consent || busy}
          className="px-4 py-2 rounded bg-violet-600 hover:bg-violet-500 text-black font-semibold disabled:opacity-50"
        >
          {busy ? 'Analyzing…' : 'Analyze'}
        </button>

        <label className="ml-auto flex items-center gap-2 text-sm text-neutral-400">
          <input type="checkbox" checked={consent} onChange={(e)=>setConsent(e.target.checked)} />
          I consent to analyze these images on‑device
        </label>
      </div>
    </main>
  );
}

/* ---------- slot UI ---------- */
function Slot({ label, slot, onPick, clear }) {
  const s = slot || {};
  const res = s.res;

  return (
    <div className="rounded-lg border border-neutral-800 bg-black/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">{label}</h3>
        <div className="flex gap-2">
          <label className="px-3 py-1.5 rounded border border-neutral-700 hover:bg-neutral-900 cursor-pointer text-sm">
            <input type="file" accept="image/*" className="hidden" onChange={onPick} />
            Choose file
          </label>
          {s.url && (
            <button onClick={clear} className="px-3 py-1.5 rounded border border-neutral-700 hover:bg-neutral-900 text-sm">
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="aspect-[3/4] w-full rounded-md overflow-hidden bg-black/30 border border-neutral-900 flex items-center justify-center">
        {s.url ? (
          <img src={s.url} alt="" className="w-full h-full object-contain" />
        ) : (
          <p className="text-neutral-500 text-sm">No image</p>
        )}
      </div>

      {res && (
        <div className="mt-3 text-sm grid grid-cols-2 gap-1">
          <Row label="Overall" value={res.overall} />
          <Row label="Symmetry" value={res.breakdown.symmetry} />
          <Row label="Proportions" value={res.breakdown.proportions} />
          <Row label="Jawline" value={res.breakdown.jawline} />
          <Row label="Potential" value={res.potential} />
        </div>
      )}
    </div>
  );
}
function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-neutral-300">{label}</span>
      <span className="font-mono">{value?.toFixed ? value.toFixed(1) : '—'}/10</span>
    </div>
  );
}

/* ---------- shared analysis ---------- */
async function analyzeOne(url, faceapi) {
  const img = await loadImg(url);
  const W = 640, H = 800;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'black'; ctx.fillRect(0, 0, W, H);
  const fit = fitContain(img.width, img.height, W, H);
  ctx.drawImage(img, (W - fit.w) / 2, (H - fit.h) / 2, fit.w, fit.h);

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

  const s = scoreFromLandmarks(det.landmarks);
  s.potential = computePotential(s);
  return s;
}

/* same scoring + utils as Scan page */
function scoreFromLandmarks(landmarks) {
  const lm = landmarks.positions;
  const faceW = Math.hypot(lm[16].x - lm[0].x, lm[16].y - lm[0].y) || 1;
  const midX = lm[27].x;
  const pairs = [[36,45],[39,42],[31,35],[48,54],[3,13]];
  let symErr = 0;
  for (const [a,b] of pairs) { const da=Math.abs(midX-lm[a].x), db=Math.abs(lm[b].x-midX); symErr += Math.abs(da-db); }
  symErr /= pairs.length;
  const symmetry = clamp(10 - (symErr/faceW)*40, 0, 10);

  const brow=lm[27], chin=lm[8];
  const faceH = Math.hypot(chin.x-brow.x, chin.y-brow.y) || 1;
  const proportions = clamp(10 - Math.abs(faceH/faceW - 1.45)*22, 0, 10);

  const jawDeg = angleAt(lm[8], lm[4], lm[12]) * 180/Math.PI;
  let jawline; if (jawDeg<60) jawline=6+(jawDeg-60)*0.02;
  else if (jawDeg>115) jawline=6-(jawDeg-115)*0.06;
  else jawline=8+(1-Math.abs(jawDeg-90)/20)*2;
  jawline = clamp(jawline, 0, 10);

  const L=lm[36], R=lm[45]; const eyeDX=R.x-L.x, eyeDY=R.y-L.y;
  const rollDeg = Math.abs(Math.atan2(eyeDY, eyeDX)*180/Math.PI);
  const nose=lm[33], midEye={x:(L.x+R.x)/2,y:(L.y+R.y)/2};
  const eyeDist=Math.hypot(eyeDX, eyeDY)||1; const yawDeg=Math.abs((nose.x-midEye.x)/eyeDist)*60;
  const pose = clamp((smooth(rollDeg,5,18)+smooth(yawDeg,7,22))/2, 0, 1);

  const base = 0.46*symmetry + 0.34*proportions + 0.20*jawline;
  const overall = clamp(base - pose*2, 0, 10);
  return { overall, breakdown: { symmetry, proportions, jawline } };
}
function computePotential(s){
  const { symmetry, jawline, proportions } = s.breakdown;
  const headroom = (10-symmetry)*0.35 + (10-jawline)*0.35 + (10-proportions)*0.15;
  const capped = clamp(s.overall + Math.min(2.2, headroom*0.6), 0, 10);
  const ceiling = s.overall < 6 ? 8.0 : s.overall < 7 ? 8.6 : 9.0;
  return Math.min(capped, ceiling);
}

function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=src; }); }
function fitContain(iw, ih, ow, oh){ const s=Math.min(ow/iw, oh/ih); return { w: Math.round(iw*s), h: Math.round(ih*s) }; }
function angleAt(p,a,b){ const v1={x:a.x-p.x,y:a.y-p.y}, v2={x:b.x-p.x,y:b.y-p.y}; const dot=v1.x*v2.x+v1.y*v2.y; const m1=Math.hypot(v1.x,v1.y), m2=Math.hypot(v2.x,v2.y); return Math.acos(clamp(dot/((m1*m2)||1),-1,1)); }
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function smooth(v, ok, bad){ if(v<=ok) return 0; if(v>=bad) return 1; const t=(v-ok)/(bad-ok); return t*t*(3-2*t); }
function area(b){ return Math.max(0,b.width)*Math.max(0,b.height); }
