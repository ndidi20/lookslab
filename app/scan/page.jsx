'use client';

import { useEffect, useRef, useState } from 'react';
import { getFaceLandmarker } from '@/lib/vision/landmarker';
import { scoreOne } from '@/lib/vision/score';

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
        await getFaceLandmarker();            // warm the WASM + model (from CDN)
        if (mounted) setReady(true);
      } catch (e) { console.error(e); }
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

      const lm = await detectSingleFace(c);
      if (!lm) { setRes(null); return; }

      const out = await scoreOne(lm, c);
      setRes(out);
    } catch (e) { console.error(e); }
    finally { setBusy(false); }
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

        {!ready && (
          <p className="mt-2 text-xs text-amber-400">Loading on‑device model… first run can take a moment.</p>
        )}
      </div>

      {res && (
        <div className="mt-6 grid md:grid-cols-2 gap-4">
          <Card label="Overall" value={res.overall} big />
          <Card label="Potential" value={res.potential} />
          <Card label="Symmetry" value={res.breakdown.symmetry} />
          <Card label="Jawline" value={res.breakdown.jawline} />
          <Card label="Eyes" value={res.breakdown.eyes} />
          <Card label="Skin" value={res.breakdown.skin} />
          <Card label="Balance" value={res.breakdown.balance} />
        </div>
      )}
    </main>
  );
}

/* ---------- helpers ---------- */

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

async function detectSingleFace(canvas) {
  const lm = await (await getFaceLandmarker()).detect(canvas);
  if (!lm || !lm.faceLandmarks || lm.faceLandmarks.length === 0) return null;
  const pts = lm.faceLandmarks[0].map(p => ({ x: p.x * canvas.width, y: p.y * canvas.height }));
  return { positions: pts };
}

function fitContain(iw, ih, ow, oh){ const s=Math.min(ow/iw, oh/ih); return { w:Math.round(iw*s), h:Math.round(ih*s) }; }
function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=src; }); }
