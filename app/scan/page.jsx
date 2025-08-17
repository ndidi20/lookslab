'use client';

import { useEffect, useRef, useState } from 'react';
import { ensureVisionReady, detectSingleLandmarks, drawContainToCanvas } from '@/lib/vision';
import { scoreFromLandmarks } from '@/lib/scoring';

export default function ScanPage() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(true);
  const [imgURL, setImgURL] = useState('');
  const [res, setRes] = useState(null);
  const viewRef = useRef(null); // preview image (not stretched)

  useEffect(() => {
    let mounted = true;
    (async () => {
      try { await ensureVisionReady(); if (mounted) setReady(true); }
      catch { if (mounted) setReady(false); }
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
    if (!ready || !imgURL || !consent || !viewRef.current) return;
    setBusy(true);
    try {
      // render to analysis canvas (no stretch, smoothing high)
      const canvas = drawContainToCanvas(viewRef.current, 640, 800);
      const landmarks = await detectSingleLandmarks(canvas);
      if (!landmarks) { setRes(null); return; }
      setRes(scoreFromLandmarks(landmarks, canvas));
    } catch (e) { console.error(e); }
    finally { setBusy(false); }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24">
      <h1 className="text-3xl font-bold mt-10 mb-2">Face Scan</h1>
      <p className="text-sm text-neutral-400 mb-6">All analysis runs in your browser. Images aren’t uploaded.</p>

      <div className="rounded-xl border border-neutral-800 bg-black/40 p-4">
        <div className="aspect-[4/5] w-full rounded-md overflow-hidden bg-black/30 border border-neutral-900 flex items-center justify-center">
          {imgURL
            ? <img ref={viewRef} src={imgURL} alt="" className="w-full h-full object-contain" />
            : <p className="text-neutral-500 text-sm">No image</p>}
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

      {res && (
        <div className="mt-6 grid md:grid-cols-2 gap-4">
          <ScoreRow big label="Overall" value={res.overall} />
          <ScoreRow label="Symmetry" value={res.breakdown.symmetry} />
          <ScoreRow label="Jawline" value={res.breakdown.jawline} />
          <ScoreRow label="Eyes" value={res.breakdown.eyes} />
          <ScoreRow label="Skin" value={res.breakdown.skin} />
          <ScoreRow label="Balance" value={res.breakdown.balance} />
          <ScoreRow label="Potential" value={res.potential} />
        </div>
      )}
    </main>
  );
}

function ScoreRow({ label, value, big = false }) {
  const v = Number.isFinite(value) ? value : 0;
  return (
    <div className="rounded-lg border border-neutral-800 bg-black/40 p-3">
      <div className={`flex items-center justify-between ${big ? 'text-xl font-semibold' : ''}`}>
        <span className="text-neutral-300">{label}</span>
        <span className="font-mono">{v.toFixed(1)}/10</span>
      </div>
    </div>
  );
}
