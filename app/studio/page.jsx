'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

export default function FaceOffStudio() {
  const [me, setMe] = useState({ loggedIn: false, pro: false, checking: true });
  const [fa, setFA] = useState(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');

  const [left, setLeft]   = useState({ url: '', res: null });
  const [right, setRight] = useState({ url: '', res: null });

  const canvasRef = useRef(null);

  // auth + models
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/me', { cache: 'no-store' });
        const j = r.ok ? await r.json() : { loggedIn: false, pro: false };
        if (!alive) return;
        setMe({ ...j, checking: false });
      } catch { if (alive) setMe({ loggedIn: false, pro: false, checking: false }); }

      try {
        const faceapi = (await import('face-api.js')).default ?? (await import('face-api.js'));
        const MODEL_URL = '/models';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          
        ]);
        if (!alive) return;
        setFA(faceapi);
        setReady(true);
      } catch (e) { console.error(e); setNote('Failed to initialize models from /public/models'); }
    })();
    return () => { alive = false; };
  }, []);

  const pick = (side) => (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const url = URL.createObjectURL(f);
    (side === 'left' ? setLeft : setRight)(s => ({ ...s, url, res: null }));
    setNote('');
  };

  const detectScore = async (url) => {
    const img = await loadImg(url);
    const W = 640, H = 800;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'black'; ctx.fillRect(0,0,W,H);
    const fit = fitContain(img.width, img.height, W, H);
    ctx.drawImage(img, (W-fit.w)/2, (H-fit.h)/2, fit.w, fit.h);

    const opt = [416, 320, 224];
    let det = null;
    for (const s of opt) {
      det = await fa
        .detectSingleFace(c, new fa.TinyFaceDetectorOptions({ inputSize: s, scoreThreshold: 0.2 }))
        .withFaceLandmarks();
      if (det?.landmarks) break;
    }
    if (!det?.landmarks) {
      for (const s of opt) {
        const d = await fa.detectSingleFace(c, new fa.TinyFaceDetectorOptions({ inputSize: s, scoreThreshold: 0.15 }));
        if (d) {
          const lm = await fa.detectLandmarksTiny(c, d.box);
          if (lm) det = { ...d, landmarks: lm };
          break;
        }
      }
    }
    if (det?.landmarks) return scoreFromLandmarks(det.landmarks);

    const d = await fa.detectSingleFace(c, new fa.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.15 }));
    if (d?.box) return scoreFromBox(d.box, { W, H });
    return null;
  };

  const analyze = async () => {
    if (!fa || !ready) return;
    setLoading(true);
    setNote('');
    try {
      const out = await Promise.all([
        left.url  ? detectScore(left.url)  : null,
        right.url ? detectScore(right.url) : null,
      ]);
      setLeft(s => ({ ...s, res: out[0] }));
      setRight(s => ({ ...s, res: out[1] }));
      if (!out[0] && !out[1]) setNote('Couldn’t detect faces. Try brighter/straighter photos.');
      if ((out[0] && !out[0].breakdown?.symmetry) || (out[1] && !out[1].breakdown?.symmetry)) {
        setNote('Low‑confidence on one image: estimated from box only.');
      }
    } catch (e) { console.error(e); setNote('Analysis failed.'); }
    finally { setLoading(false); }
  };

  const exportCard = async () => {
    const W = 1080, H = 1920, pad = 36;
    const c = canvasRef.current; c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b0b12'); g.addColorStop(1, '#111016');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#eee'; ctx.font = 'bold 64px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('LooksLab Face‑Off', W/2, 110);

    const boxW = (W - pad * 3) / 2;
    const boxH = Math.round(boxW * 1.25);
    const drawSlot = async (slot, x) => {
      if (!slot?.url) return;
      const img = await loadImg(slot.url);
      const fit = fitContain(img.width, img.height, boxW, boxH);
      const y = 200;

      roundRect(ctx, x, y, boxW, boxH, 22); ctx.fillStyle = '#1c1b22'; ctx.fill();
      ctx.save(); clipRoundRect(ctx, x, y, boxW, boxH, 22);
      ctx.drawImage(img, x + (boxW - fit.w)/2, y + (boxH - fit.h)/2, fit.w, fit.h);
      ctx.restore();

      const r = slot.res; if (!r) return;
      const sY = y + boxH + 40;
      ctx.textAlign = 'left'; ctx.font = '600 40px system-ui'; ctx.fillStyle = '#cfcfe8';
      ctx.fillText(`Overall ${r.overall.toFixed(1)} / 10`, x, sY);

      const bars = [
        ['Potential', r.potential],
        ['Symmetry', r.breakdown.symmetry],
        ['Proportions', r.breakdown.proportions],
        ['Jawline', r.breakdown.jawline],
        ['Features', r.breakdown.features],
      ];
      let yy = sY + 28;
      for (const [label, val] of bars) {
        yy += 44;
        ctx.fillStyle = '#8b8a9c'; ctx.font = '400 28px system-ui'; ctx.fillText(label, x, yy);
        const bw = boxW, bh = 14; yy += 10;
        ctx.fillStyle = '#2a2933'; roundRect(ctx, x, yy, bw, bh, 8); ctx.fill();
        ctx.fillStyle = '#9b7dff'; roundRect(ctx, x, yy, (val/10)*bw, bh, 8); ctx.fill();
        yy += 12; ctx.textAlign = 'right'; ctx.fillStyle = '#cfcfe8'; ctx.font = '500 26px system-ui';
        ctx.fillText(`${val.toFixed(1)}/10`, x + bw, yy); ctx.textAlign = 'left';
      }
    };

    await drawSlot(left, pad);
    await drawSlot(right, pad*2 + boxW);

    if (me.pro) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '700 34px system-ui'; ctx.textAlign = 'right';
      ctx.fillText('LooksLab • PRO', W - 28, H - 28);
    } else {
      ctx.save(); ctx.translate(W/2, H - 120); ctx.rotate(-Math.PI/180 * 8);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.font = '900 110px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('looksLab.app', 0, 0); ctx.restore();
    }

    const url = c.toDataURL('image/jpeg', 0.92);
    const a = document.createElement('a'); a.href = url; a.download = 'lookslab-faceoff.jpg'; a.click();
  };

  // gating
  if (me.checking) return <Shell><p className="text-neutral-400">Checking access…</p></Shell>;
  if (!me.loggedIn) return <Gate title="Face‑Off Studio" body="Sign in to use Face‑Off Studio and export cards." primary={{href:'/login',label:'Log in'}} secondary={{href:'/',label:'Back home'}} />;
  if (!me.pro)      return <Gate title="Face‑Off Studio (Pro)" body="This feature is for Pro members. Upgrade to unlock Face‑Off cards and watermark‑light exports." primary={{href:'/pro',label:'Go Pro'}} secondary={{href:'/',label:'Back home'}} />;

  return (
    <Shell>
      <h1 className="text-3xl font-bold mt-10 mb-2">Face‑Off Studio</h1>
      <p className="text-sm text-neutral-400 mb-6">Upload two pics → auto scores → export a 9:16 card.</p>

      {!ready && <p className="text-sm text-neutral-400 mb-4">Loading models…</p>}

      <div className="grid md:grid-cols-2 gap-5">
        <Slot label="Left"  url={left.url}  res={left.res}  onPick={pick('left')}  clear={() => setLeft({ url:'', res:null })} />
        <Slot label="Right" url={right.url} res={right.res} onPick={pick('right')} clear={() => setRight({ url:'', res:null })} />
      </div>

      <div className="mt-6 flex gap-3">
        <button
          onClick={analyze}
          disabled={!ready || (!left.url && !right.url) || loading}
          className="px-4 py-2 rounded bg-violet-600 hover:bg-violet-500 text-black font-semibold disabled:opacity-50"
        >
          {loading ? 'Analyzing…' : 'Analyze Both'}
        </button>

      <button
        onClick={exportCard}
        disabled={!left.res && !right.res}
        className="px-4 py-2 rounded border border-neutral-700 hover:bg-neutral-900"
      >
        Export Card {me.pro ? '(subtle tag)' : '(watermark)'}
      </button>
      </div>

      {note && <p className="mt-3 text-sm text-amber-300">{note}</p>}
      <canvas ref={canvasRef} className="hidden" />
    </Shell>
  );
}

/* shells & small bits */
function Shell({ children }) { return <main className="mx-auto max-w-5xl px-4 pb-28">{children}</main>; }
function Gate({ title, body, primary, secondary }) {
  return (
    <Shell>
      <div className="rounded-xl border border-neutral-800 bg-black/40 p-6">
        <div className="flex items-center gap-2 mb-2">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-neutral-400"><path fill="currentColor" d="M12 1a5 5 0 00-5 5v3H5a1 1 0 00-1 1v10a1 1 0 001 1h14a1 1 0 001-1V10a1 1 0 00-1-1h-2V6a5 5 0 00-5-5zm-3 5a3 3 0 116 0v3H9V6z"/></svg>
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
        <p className="text-neutral-400 mb-6">{body}</p>
        <div className="flex gap-3">
          <Link href={primary.href} className="px-4 py-2 rounded bg-violet-600 text-black font-semibold hover:bg-violet-500">{primary.label}</Link>
          <Link href={secondary.href} className="px-4 py-2 rounded border border-neutral-700 hover:bg-neutral-900">{secondary.label}</Link>
        </div>
      </div>
    </Shell>
  );
}
function Slot({ label, url, res, onPick, clear }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-black/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">{label}</h3>
        <div className="flex gap-2">
          <label className="px-3 py-1.5 rounded border border-neutral-700 hover:bg-neutral-900 cursor-pointer text-sm">
            <input type="file" accept="image/*" className="hidden" onChange={onPick} />
            Choose file
          </label>
          {url && (
            <button onClick={clear} className="px-3 py-1.5 rounded border border-neutral-700 hover:bg-neutral-900 text-sm">
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="aspect-[3/4] w-full rounded-md overflow-hidden bg-black/30 border border-neutral-900 flex items-center justify-center">
        {url ? <img src={url} alt="" className="max-w-full max-h-full object-contain" /> : <p className="text-neutral-500 text-sm">No image</p>}
      </div>

      {res && (
        <div className="mt-3 text-sm grid grid-cols-2 gap-1">
          <Row label="Overall" value={res.overall} />
          <Row label="Potential" value={res.potential} />
          <Row label="Symmetry" value={res.breakdown.symmetry} />
          <Row label="Proportions" value={res.breakdown.proportions} />
          <Row label="Jawline" value={res.breakdown.jawline} />
          <Row label="Features" value={res.breakdown.features} />
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

/* shared scoring + utils */
function scoreFromLandmarks(landmarks) {
  const lm = landmarks.positions;
  const faceW = Math.hypot(lm[16].x - lm[0].x, lm[16].y - lm[0].y) || 1;
  const midX = lm[27].x;
  const pairs = [[36,45],[39,42],[31,35],[48,54],[3,13]];
  let symErr = 0;
  for (const [a,b] of pairs) { const da=Math.abs(midX-lm[a].x), db=Math.abs(lm[b].x-midX); symErr += Math.abs(da-db); }
  symErr/=pairs.length; const symmetry = clamp(10 - (symErr / faceW) * 40, 0, 10);

  const brow = lm[27], chin = lm[8];
  const faceH = Math.hypot(chin.x - brow.x, chin.y - brow.y) || 1;
  const ratio = faceH / faceW;
  const proportions = clamp(10 - Math.abs(ratio - 1.45)*22, 0, 10);

  const left = lm[4], right = lm[12];
  const jawDeg = rad2deg(angleAt(chin, left, right));
  let jawline;
  if (jawDeg < 60) jawline = 6 + (jawDeg - 60) * 0.02;
  else if (jawDeg > 115) jawline = 6 - (jawDeg - 115) * 0.06;
  else jawline = 8 + (1 - Math.abs(jawDeg - 90)/20) * 2;
  jawline = clamp(jawline, 0, 10);

  const eyeL = lm[39], eyeR = lm[42], eyeMid = { x:(lm[36].x+lm[45].x)/2, y:(lm[36].y+lm[45].y)/2 };
  const eyeW = Math.hypot(lm[45].x-lm[36].x, lm[45].y-lm[36].y) || 1;
  const eyeBal = 1 - Math.abs(dist(eyeL, eyeMid) - dist(eyeR, eyeMid)) / eyeW;
  const lipFull = dist(lm[66], lm[62]) / (faceH||1);
  const lipScore = clamp(10 - Math.abs(lipFull - 0.055)*180, 0, 10);
  const features = clamp( (eyeBal*10*0.55) + (lipScore*0.45), 0, 10);

  const pose = posePenalty(lm);
  const base = 0.38*symmetry + 0.30*proportions + 0.22*jawline + 0.10*features;
  const overall = clamp(base - pose*2, 0, 10);
  const quality = clamp(10 - pose*7, 0, 10);
  const maxReach = clamp(overall + (quality/10)*2.2, 0, 9.2);
  const potential = Math.max(overall, maxReach);
  return { overall, potential, breakdown: { symmetry, proportions, jawline, features } };
}
function scoreFromBox(box, dims) {
  const { width: bw, height: bh } = box; const { W, H } = dims;
  const size = clamp((bw*bh)/(W*H) * 16, 0, 10);
  const aspect = clamp(10 - Math.abs((bh/bw) - 1.35)*18, 0, 10);
  const rough = clamp(0.6*aspect + 0.4*size, 0, 9);
  const potential = clamp(rough + 1.2, 0, 9.2);
  return { overall: rough, potential, breakdown: { symmetry: 5.0, proportions: aspect, jawline: 5.0, features: 5.0 } };
}
function fitContain(iw, ih, ow, oh){ const s=Math.min(ow/iw, oh/ih); return { w: Math.round(iw*s), h: Math.round(ih*s) }; }
function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=src; }); }
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function clipRoundRect(ctx,x,y,w,h,r){ roundRect(ctx,x,y,w,h,r); ctx.clip(); }
function angleAt(p, a, b){ const v1={x:a.x-p.x,y:a.y-p.y}, v2={x:b.x-p.x,y:b.y-p.y}; const dot=v1.x*v2.x+v1.y*v2.y; const m1=Math.hypot(v1.x,v1.y), m2=Math.hypot(v2.x,v2.y); return Math.acos(clamp(dot/((m1*m2)||1),-1,1)); }
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
function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
function rad2deg(r){ return r*180/Math.PI; }
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function smooth(v, ok, bad){ if (v<=ok) return 0; if (v>=bad) return 1; const t=(v-ok)/(bad-ok); return t*t*(3-2*t); }
