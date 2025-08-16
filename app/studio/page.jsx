'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import * as faceapi from 'face-api.js';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';

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
      try {
        const r = await fetch('/api/me', { cache: 'no-store' });
        const j = r.ok ? await r.json() : { loggedIn:false, pro:false };
        if (mounted) setMe({ ...j, checking:false });
      } catch { if (mounted) setMe({ loggedIn:false, pro:false, checking:false }); }

      try { await ensureVisionReady(); if (mounted) setReady(true); } catch(e){ console.error(e); }
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
    } catch (e) { console.error(e); } finally { setBusy(false); }
  };

  const exportCard = async () => {
    const W=1080, H=1920, pad=36;
    const c=canvasRef.current; c.width=W; c.height=H;
    const ctx=c.getContext('2d');

    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#0b0b12'); g.addColorStop(1,'#111016');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

    ctx.fillStyle='#eee'; ctx.font='bold 64px system-ui'; ctx.textAlign='center';
    ctx.fillText('LooksLab Face-Off', W/2, 110);

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
          ctx.fillStyle='#2a2933'; roundRect(ctx, x, yy, bw, bh, 8); ctx.fill();
          ctx.fillStyle='#9b7dff'; roundRect(ctx, x, yy, (val/10)*bw, bh, 8); ctx.fill();

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

  // gating
  if (me.checking) return <Shell><p className="text-neutral-400">Checking access…</p></Shell>;
  if (!me.loggedIn) return <Gate title="Face-Off Studio" body="Sign in to use Face-Off Studio and export cards." primary={{href:'/login',label:'Log in'}} secondary={{href:'/',label:'Back home'}} />;
  if (!me.pro) return <Gate title="Face-Off Studio (Pro)" body="This feature is for Pro members. Upgrade to unlock Face-Off cards and watermark-light exports." primary={{href:'/pro',label:'Go Pro'}} secondary={{href:'/',label:'Back home'}} />;

  return (
    <Shell>
      <h1 className="text-3xl font-bold mt-10 mb-2">Face-Off Studio</h1>
      <p className="text-sm text-neutral-400 mb-6">Upload two pics → auto scores → export a 9:16 mog card.</p>

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
          I consent to analyze these images on-device
        </label>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </Shell>
  );
}

/* ---------- shared init ---------- */
let __studioVisionReady = false;
async function ensureVisionReady(){
  if (__studioVisionReady) return true;
  try { await tf.setBackend('webgl'); } catch { await tf.setBackend('cpu'); }
  await tf.ready();
  const URL='/models';
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(URL),
  ]);
  __studioVisionReady = true;
  return true;
}

/* ---------- components ---------- */
function Shell({ children }) {
  return <main className="mx-auto max-w-5xl px-4 pb-28">{children}</main>;
}
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
        {url ? <img src={url} alt="" className="analyze-preview w-full h-auto object-contain" /> : <p className="text-neutral-500 text-sm">No image</p>}
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

/* ---------- analyze helpers ---------- */
async function analyzeOne(url) {
  const img = await loadImg(url);
  const off = document.createElement('canvas');
  drawToCanvasCrisp(img, 640, 800, off);

  const det = await faceapi
    .detectSingleFace(off, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.1 }))
    .withFaceLandmarks();

  return det?.landmarks ? scoreFromLandmarks(det.landmarks) : null;
}

/* ---------- same scoring & drawing as Scan ---------- */
function drawToCanvasCrisp(img, W, H, canvas) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  canvas.style.width  = `${W}px`;
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const fit = fitContain(img.width, img.height, W, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, (W-fit.w)/2, (H-fit.h)/2, fit.w, fit.h);
}

/* --- paste the same scoreFromLandmarks from Scan to keep parity --- */
function scoreFromLandmarks(landmarks) {
  const lm = landmarks.positions;
  const dist = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
  const safe = (v, fb = 1) => (Number.isFinite(v) && v > 0 ? v : fb);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const closeness10 = (ratio, ideal, k) => clamp(10 - Math.abs(ratio - ideal) * k, 0, 10);

  const faceW = safe(dist(0, 16), 120);
  const faceH = safe(dist(27, 8), 160);

  const eyeL_w = safe(dist(36, 39), 30);
  const eyeR_w = safe(dist(42, 45), 30);
  const eye_w = (eyeL_w + eyeR_w) / 2;
  const interocular = safe(dist(39, 42), 35);
  const interpupillary = safe(dist(36, 45), 60);
  const nose_w = safe(dist(31, 35), 40);
  const mouth_w = safe(dist(48, 54), 65);

  const upper2 = safe(dist(27, 33), faceH * 0.45);
  const lower   = safe(dist(33, 8), faceH * 0.55);

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

  const faceRatio     = closeness10(faceH / faceW, 1.45, 22);
  const thirds        = closeness10(upper2 / lower, 1.0, 20);
  const eyeSpacing    = closeness10(interocular / eye_w, 1.0, 18);
  const noseBalance   = closeness10(nose_w / interocular, 1.0, 18);
  const mouthBalance  = closeness10(mouth_w / interpupillary, 1.05, 25);
  const proportions = clamp(
    0.28*faceRatio + 0.22*thirds + 0.18*eyeSpacing + 0.16*noseBalance + 0.16*mouthBalance, 0, 10
  );

  const angleAt = (p, a, b) => {
    const v1 = { x: lm[a].x - lm[p].x, y: lm[a].y - lm[p].y };
    const v2 = { x: lm[b].x - lm[p].x, y: lm[b].y - lm[p].y };
    const dot = v1.x*v2.x + v1.y*v2.y;
    const m1 = Math.hypot(v1.x, v1.y), m2 = Math.hypot(v2.x, v2.y);
    const cos = clamp(dot / (m1*m2 || 1), -1, 1);
    return Math.acos(cos);
  };
  const jawDeg = angleAt(8, 4, 12) * 180/Math.PI;
  let jawline;
  if (jawDeg < 60)      jawline = 6 + (jawDeg - 60) * 0.02;
  else if (jawDeg > 115) jawline = 6 - (jawDeg - 115) * 0.06;
  else                   jawline = 8 + (1 - Math.abs(jawDeg - 90)/20) * 2;
  jawline = clamp(jawline, 0, 10);

  const posePenalty = (() => {
    const L = lm[36], R = lm[45], nose = lm[33];
    const eyeDX = R.x - L.x, eyeDY = R.y - L.y;
    const roll = Math.abs(Math.atan2(eyeDY, eyeDX) * 180/Math.PI);
    const midEye = { x:(L.x+R.x)/2, y:(L.y+R.y)/2 };
    const eyeDist = Math.hypot(eyeDX, eyeDY) || 1;
    const yaw = Math.abs((nose.x - midEye.x)/eyeDist) * 60;
    const smooth = (v, ok, bad) => (v<=ok?0 : v>=bad?1 : ((t=(v-ok)/(bad-ok)), t*t*(3-2*t)));
    return clamp((smooth(roll,5,22)+smooth(yaw,8,26))/2, 0, 1);
  })();

  const overall   = clamp(0.46*symmetry + 0.34*proportions + 0.20*jawline - posePenalty*1.0, 0, 10);
  const potential = clamp(overall + (10-overall)*0.35 - posePenalty*0.4, 0, 10);
  return { overall, potential, breakdown: { symmetry, proportions, jawline } };
}

/* ---------- utils ---------- */
function fitContain(iw, ih, ow, oh){ const s=Math.min(ow/iw, oh/ih); return { w: Math.round(iw*s), h: Math.round(ih*s) }; }
function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=src; }); }
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function clipRoundRect(ctx,x,y,w,h,r){ roundRect(ctx,x,y,w,h,r); ctx.clip(); }
