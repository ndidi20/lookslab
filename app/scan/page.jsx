'use client';

import { useEffect, useRef, useState } from 'react';
import { ensureVisionReady, drawContainToCanvas, detectLandmarksFromCanvas } from '@/lib/vision';
import { computeScores } from '@/lib/scoring';

export default function ScanPage() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(true);
  const [imgURL, setImgURL] = useState('');
  const [scores, setScores] = useState(null);

  const viewRef = useRef(null);  // visible canvas (for drawing & skin sampling)

  useEffect(() => {
    (async () => { try { await ensureVisionReady(); setReady(true); } catch (e) { console.error(e); } })();
  }, []);

  const onPick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImgURL(URL.createObjectURL(f));
    setScores(null);
  };

  const analyze = async () => {
    if (!ready || !imgURL || !consent) return;
    setBusy(true);
    try {
      const img = await loadImg(imgURL);
      drawContainToCanvas(img, viewRef.current, 640, 800);
      const det = await detectLandmarksFromCanvas(viewRef.current);
      if (!det?.landmarks) { setScores(null); return; }
      setScores(computeScores(det.landmarks, viewRef.current));
    } catch (e) {
      console.error(e);
    } finally { setBusy(false); }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24">
      <h1 className="text-3xl font-bold mt-10 mb-2">Face Scan</h1>
      <p className="text-sm text-neutral-400 mb-6">All analysis runs on-device. Images aren’t uploaded.</p>

      <div className="rounded-xl border border-neutral-800 bg-black/40 p-4">
        <div className="aspect-[4/5] w-full rounded-md overflow-hidden bg-black/30 border border-neutral-900">
          <canvas ref={viewRef} className="w-full h-full" />
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

        {!ready && <p className="mt-2 text-xs text-amber-400">Failed to initialize models from /public/models</p>}
      </div>

      {scores && (
        <div className="mt-6 grid md:grid-cols-2 gap-4">
          <Card label="Overall" value={scores.overall} big />
          <Card label="Symmetry" value={scores.breakdown.symmetry} />
          <Card label="Jawline" value={scores.breakdown.jawline} />
          <Card label="Eyes" value={scores.breakdown.eyes} />
          <Card label="Skin" value={scores.breakdown.skin} />
          <Card label="Balance" value={scores.breakdown.balance} />
          <Card label="Potential" value={scores.potential} />
        </div>
      )}
    </main>
  );
}

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

function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=src; }); }
