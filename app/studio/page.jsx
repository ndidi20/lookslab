'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import * as faceapi from 'face-api.js';
import { ensureVisionReady, getVisionError } from '@/lib/vision';

export default function FaceOffStudio() {
  const [me, setMe] = useState({ loggedIn:false, pro:false, checking:true });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(true);

  const [left,  setLeft]  = useState({ url:'', res:null });
  const [right, setRight] = useState({ url:'', res:null });
  const canvasRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      // auth
      try {
        const r = await fetch('/api/me', { cache: 'no-store' });
        const j = r.ok ? await r.json() : { loggedIn:false, pro:false };
        if (mounted) setMe({ ...j, checking:false });
      } catch { if (mounted) setMe({ loggedIn:false, pro:false, checking:false }); }

      // vision
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

  const pick = (side) => (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const url = URL.createObjectURL(f);
    (side==='left' ? setLeft : setRight)(s => ({ ...s, url, res:null }));
  };

  const analyze = async () => {
    if (!ready || !consent) return;
    setBusy(true);
    try {
      const [l, r] = await Promise.all([
        left.url  ? analyzeOne(left.url)  : null,
        right.url ? analyzeOne(right.url) : null,
      ]);
      setLeft(s => ({ ...s, res:l }));
      setRight(s => ({ ...s, res:r }));
    } catch (e) { console.error(e); }
    finally { setBusy(false); }
  };

  const exportCard = async () => {
    const W=1080, H=1920, pad=36;
    const c=canvasRef.current; c.width=W; c.height=H;
    const ctx=c.getContext('2d');

    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#0b0b12'); g.addColorStop(1,'#111016');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

    ctx.fillStyle='#eee'; ctx.font='bold 64px system-ui'; ctx.textAlign='center';
    ctx.fillText('LooksLab Face‑Off', W/2, 110);

    const boxW=(W-pad*3)/2, boxH=Math.round(boxW*1.25);

    const draw = async (slot, x) => {
      if (!slot?.url) return;
      const img = await loadImg(slot.url);
      const fit = fitContain(img.width, img.height, boxW, boxH);
      const y = 200;

      ctx.fillStyle='#1c1b22'; roundRect(ctx,x,y,boxW,boxH,22); ctx.fill();
      ctx.save(); clipRoundRect(ctx,x,y,boxW,boxH,22);
      ctx.drawImage(img, x+(boxW-fit.w)/2, y+(boxH-fit.h)/2, fit.w, fit.h);
      ctx.restore();

      if (slot.res) {
        const sY = y+boxH+40;
        ctx.textAlign='left'; ctx.font='600 40px system-ui'; ctx.fillStyle='#cfcfe8';
        ctx.fillText(`Overall ${slot.res.overall.toFixed(1)}/10`, x, sY);

        const bars = [
          ['Symmetry', slot.res.breakdown.symmetry],
          ['Proportions', slot.res.breakdown.proportions],
          ['Jawline', slot.res.breakdown.jawline],
          ['Potential', slot.res.potential],
        ];
        let yy = sY+30;
        for (const [label, val] of bars) {
          yy += 46;
          ctx.fillStyle='#8b8a9c'; ctx.font='400 28px system-ui';
          ctx.fillText(label, x, yy);

          const bw=boxW, bh=14; yy+=10;
          ctx.fillStyle='#2a2933'; roundRect(ctx,x,yy,bw,bh,8); ctx.fill();
          ctx.fillStyle='#9b7dff'; roundRect(ctx,x,yy,(val/10)*bw,bh,8); ctx.fill();

          yy+=12; ctx.textAlign='right'; ctx.fillStyle='#cfcfe8'; ctx.font='500 26px system-ui';
          ctx.fillText(`${val.toFixed(1)}/10`, x+bw, yy);
          ctx.textAlign='left';
        }
      }
    };

    await draw(left, pad);
    await draw(right, pad*2+boxW);

    if (me.pro) {
      ctx.fillStyle='rgba(255,255,255,0.35)';
      ctx.font='700 34px system-ui';
      ctx.textAlign='right';
      ctx.fillText('LooksLab • PRO', W-28, H-28);
    } else {
      ctx.save(); ctx.translate(W/2,H-120); ctx.rotate(-Math.PI/180*8);
      ctx.fillStyle='rgba(255,255,255,0.10)'; ctx.font='900 110px system-ui'; ctx.textAlign='center';
      ctx.fillText('looksLab.app', 0, 0); ctx.restore();
    }

    const url=c.toDataURL('image/jpeg',0.92);
    const a=document.createElement('a'); a.href=url; a.download='lookslab-faceoff.jpg'; a.click();
  };

  // PRO gating
  if (me.checking) return <Shell><p className="text-neutral-400">Checking access…</p></Shell>;
  if (!me.loggedIn) return <Gate title="Face‑Off Studio" body="Sign in to use Face‑Off Studio and export cards." primary={{href:'/login',label:'Log in'}} secondary={{href:'/',label:'Back home'}} />;
  if (!me.pro) return <Gate title="Face‑Off Studio (Pro)" body="This feature is for Pro members. Upgrade to unlock Face‑Off cards and watermark‑light exports." primary={{href:'/pro',label:'Go Pro'}} secondary={{href:'/',label:'Back home'}} />;

  return (
    <Shell>
      <h1 className="text-3xl font-bold mt-10 mb-2">Face‑Off Studio</h1>
      <p className="text-sm text-neutral-400 mb-6">Upload two pics → auto scores → export a 9:16 mog card.</p>

      {!ready && !getVisionError() && <p className="text-xs text-neutral-400">Loading face models…</p>}
      {!ready && getVisionError() && <p className="text-xs text-amber-400">Failed to initialize models from /public/models</p>}

      <div className="grid md:grid-cols-2 gap-5">
        <Slot label="Left"  url={left.url}  res={left.res}  onPick={pick('left')}  clear={()=>setLeft({url:'',res:null})} />
        <Slot label="Right" url={right.url} res={right.res} onPick={pick('right')} clear={()=>setRight({url:'',res:null})} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={analyze}
          disabled={!ready || (!left.url && !right.url) || !consent || busy}
          className="px-4 py-2 rounded bg-violet-600 hover:bg-violet-500 text-black font-semibold disabled:opacity-50"
        >
          {busy ? 'Analyzing…' : 'Analyze'}
        </button>

        <button
          onClick={exportCard}
          disabled={!left.res && !right.res}
          className="px-4 py-2 rounded border border-neutral-700 hover:bg-neutral-900"
        >
          Export Mog Card {me.pro ? '(subtle tag)' : '(watermark)'}
        </button>

        <label className="ml-auto flex items-center gap-2 text-sm text-neutral-400">
          <input type="checkbox" checked={consent} onChange={(e)=>setConsent(e.target.checked)} />
          I consent to analyze this image on‑device
        </label>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </Shell>
  );
}

/* components */
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
          {url && <button onClick={clear} className="px-3 py-1.5 rounded border border-neutral-700 hover:bg-neutral-900 text-sm">Clear</button>}
        </div>
      </div>

      <div className="aspect-[3/4] w-full rounded-md overflow-hidden bg-black/30 border border-neutral-900 flex items-center justify-center">
        {url ? <img src={url} alt="" className="w-full h-full object-contain" /> : <p className="text-neutral-500 text-sm">No image</p>}
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
      <span className="font-mono">{value.toFixed(1)}/10</span>
    </div>
  );
}

/* analysis (shared scoring) */
async function analyzeOne(url) {
  const img = await loadImg(url);
  const W=640, H=800;
  const c = document.createElement('canvas'); c.width=W; c.height=H;
  const ctx = c.getContext('2d');
  ctx.fillStyle='black'; ctx.fillRect(0,0,W,H);
  const fit = fitContain(img.width, img.height, W, H);
  ctx.drawImage(img, (W-fit.w)/2, (H-fit.h)/2, fit.w, fit.h);

  const det = await faceapi
    .detectSingleFace(c, new faceapi.TinyFaceDetectorOptions({ inputSize: 256, scoreThreshold: 0.08 }))
    .withFaceLandmarks();

  if (!det?.landmarks) return null;
  return scoreFromLandmarks(det.landmarks);
}

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

function posePenalty(lm){
  const L=lm[36], R=lm[45];
  const eyeDX=R.x-L.x, eyeDY=R.y-L.y;
  const rollDeg=Math.abs(Math.atan2(eyeDY,eyeDX)*180/Math.PI);
  const nose=lm[33]; const midEye={x:(L.x+R.x)/2,y:(L.y+R.y)/2};
  const eyeDist=Math.hypot(eyeDX,eyeDY)||1;
  const yawDeg=Math.abs((nose.x-midEye.x)/eyeDist)*60;
  return clamp((smooth(rollDeg,5,22)+smooth(yawDeg,8,26))/2,0,1);
}

/* utils */
function angleAt(p,a,b){ const v1={x:a.x-p.x,y:a.y-p.y}, v2={x:b.x-p.x,y:b.y-p.y}; const dot=v1.x*v2.x+v1.y*v2.y; const m1=Math.hypot(v1.x,v1.y), m2=Math.hypot(v2.x,v2.y); return Math.acos(clamp(dot/((m1*m2)||1),-1,1)); }
function clamp(v,lo,hi){ return Math.max(lo,Math.min(hi,v)); }
function smooth(v,ok,bad){ if(v<=ok)return 0; if(v>=bad)return 1; const t=(v-ok)/(bad-ok); return t*t*(3-2*t); }
function fitContain(iw,ih,ow,oh){ const s=Math.min(ow/iw,oh/ih); return { w:Math.round(iw*s), h:Math.round(ih*s) }; }
function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.src=src; }); }
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function clipRoundRect(ctx,x,y,w,h,r){ roundRect(ctx,x,y,w,h,r); ctx.clip(); }
