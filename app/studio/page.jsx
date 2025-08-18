// app/studio/page.jsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { detectSingleFace, getFaceLandmarker } from '@/lib/vision/landmarker';
import { scoreOne } from '@/lib/vision/scoring';
import { fitContain } from '@/lib/vision/geometry';

export default function FaceOffStudio() {
  const [ready, setReady]   = useState(false);
  const [busy, setBusy]     = useState(false);
  const [consent, setConsent] = useState(true);

  const [left,  setLeft]  = useState({ url:'', res:null });
  const [right, setRight] = useState({ url:'', res:null });

  const canvasRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await getFaceLandmarker();
        mounted && setReady(true);
      } catch (e) { console.error(e); }
    })();
    return () => { mounted = false; };
  }, []);

  const pick = (side) => (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const url = URL.createObjectURL(f);
    (side === 'left' ? setLeft : setRight)(s => ({ ...s, url, res:null }));
  };

  const analyze = async () => {
    if (!ready || !consent || busy) return;
    setBusy(true);
    try {
      const c = canvasRef.current; const W=640, H=800; c.width=W; c.height=H;
      const ctx = c.getContext('2d');

      async function run(slot) {
        if (!slot.url) return null;
        const img = await loadImg(slot.url);
        ctx.fillStyle='black'; ctx.fillRect(0,0,W,H);
        const fit = fitContain(img.width, img.height, W, H);
        ctx.drawImage(img, (W-fit.w)/2, (H-fit.h)/2, fit.w, fit.h);
        const lm = await detectSingleFace(c);
        if (!lm) return null;
        return await scoreOne(lm, c);
      }

      const [l, r] = await Promise.all([run(left), run(right)]);
      setLeft(s => ({ ...s, res: l }));
      setRight(s => ({ ...s, res: r }));
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24">
      <h1 className="text-3xl font-bold mt-10 mb-2">Face-Off Studio</h1>
      <p className="text-sm text-neutral-400 mb-6">Upload two pics → analyze side-by-side.</p>

      {!ready && <p className="text-xs text-amber-400">Loading on-device model… first run can take a moment.</p>}

      <div className="grid md:grid-cols-2 gap-5">
        <Slot label="Left"  data={left}  onPick={pick('left')}  onClear={()=>setLeft({url:'',res:null})} />
        <Slot label="Right" data={right} onPick={pick('right')} onClear={()=>setRight({url:'',res:null})} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={analyze}
          disabled={!ready || (!left.url && !right.url) || !consent || busy}
          className="px-4 py-2 rounded bg-violet-600 hover:bg-violet-500 text-black font-semibold disabled:opacity-50"
        >
          {busy ? 'Analyzing…' : 'Analyze'}
        </button>

        <label className="ml-auto flex items-center gap-2 text-sm text-neutral-400">
          <input type="checkbox" checked={consent} onChange={(e)=>setConsent(e.target.checked)} />
          I consent to analyze these images on-device
        </label>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </main>
  );
}

function Slot({ label, data, onPick, onClear }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-black/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">{label}</h3>
        <div className="flex gap-2">
          <label className="px-3 py-1.5 rounded border border-neutral-700 hover:bg-neutral-900 cursor-pointer text-sm">
            <input type="file" accept="image/*" className="hidden" onChange={onPick} />
            Choose file
          </label>
          {data.url && (
            <button onClick={onClear} className="px-3 py-1.5 rounded border border-neutral-700 hover:bg-neutral-900 text-sm">
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="aspect-[3/4] w-full rounded-md overflow-hidden bg-black/30 border border-neutral-900 flex items-center justify-center">
        {data.url ? <img src={data.url} alt="" className="w-full h-full object-contain" /> :
          <p className="text-neutral-500 text-sm">No image</p>}
      </div>

      {data.res && (
        <div className="mt-3 text-sm grid grid-cols-2 gap-1">
          <Row label="Overall"   value={data.res.overall} />
          <Row label="Potential" value={data.res.potential} />
          <Row label="Symmetry"  value={data.res.breakdown.symmetry} />
          <Row label="Jawline"   value={data.res.breakdown.jawline} />
          <Row label="Eyes"      value={data.res.breakdown.eyes} />
          <Row label="Skin"      value={data.res.breakdown.skin} />
          <Row label="Balance"   value={data.res.breakdown.balance} />
        </div>
      )}
    </div>
  );
}
function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-neutral-300">{label}</span>
      <span className="font-mono">{value.toFixed(1)}/10</span>
    </div>
  );
}

function loadImg(src) {
  return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = src; });
}
