'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ensureVisionReady, drawContainToCanvas, detectLandmarksFromCanvas } from '@/lib/vision';
import { computeScores } from '@/lib/scoring';

export default function FaceOffStudio() {
  const [me, setMe] = useState({ loggedIn:false, pro:false, checking:true });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(true);
  const [left,  setLeft]  = useState({ url:'', res:null });
  const [right, setRight] = useState({ url:'', res:null });

  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const exportRef = useRef(null);

  useEffect(() => {
    (async () => {
      // fake me endpoint; keep your existing /api/me if you use auth
      try {
        const r = await fetch('/api/me', { cache:'no-store' });
        const j = r.ok ? await r.json() : { loggedIn:false, pro:false };
        setMe({ ...j, checking:false });
      } catch { setMe({ loggedIn:false, pro:false, checking:false }); }

      try { await ensureVisionReady(); setReady(true); } catch (e) { console.error(e); }
    })();
  }, []);

  const pick = (side) => async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const url = URL.createObjectURL(f);
    (side==='left' ? setLeft : setRight)(s => ({ ...s, url, res:null }));
    const img = await loadImg(url);
    drawContainToCanvas(img, side==='left' ? leftRef.current : rightRef.current, 640, 800);
  };

  const analyze = async () => {
    if (!ready || !consent) return;
    setBusy(true);
    try {
      const [dl, dr] = await Promise.all([
        left.url  ? detectLandmarksFromCanvas(leftRef.current)  : null,
        right.url ? detectLandmarksFromCanvas(rightRef.current) : null,
      ]);
      setLeft(s => ({ ...s, res: dl?.landmarks ? computeScores(dl.landmarks, leftRef.current) : null }));
      setRight(s => ({ ...s, res: dr?.landmarks ? computeScores(dr.landmarks, rightRef.current) : null }));
    } catch (e) {
      console.error(e);
    } finally { setBusy(false); }
  };

  const exportCard = async () => {
    const W=1080, H=1920, pad=36;
    const c=exportRef.current; c.width=W; c.height=H;
    const ctx=c.getContext('2d');

    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#0b0b12'); g.addColorStop(1,'#111016');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

    ctx.fillStyle='#eee'; ctx.font='bold 64px system-ui'; ctx.textAlign='center';
    ctx.fillText('LooksLab Face-Off', W/2, 110);

    const boxW=(W-pad*3)/2, boxH=Math.round(boxW*1.25);

    const draw = async (slot, srcCanvas, x) => {
      if (!slot?.url) return;
      const y = 200;
      ctx.fillStyle='#1c1b22'; roundRect(ctx,x,y,boxW,boxH,22); ctx.fill();
      ctx.save(); clipRoundRect(ctx,x,y,boxW,boxH,22);
      ctx.drawImage(srcCanvas, x, y, boxW, boxH);
      ctx.restore();

      if (slot.res) {
        const sY = y+boxH+40;
        ctx.textAlign='left'; ctx.font='600 40px system-ui'; ctx.fillStyle='#cfcfe8';
        ctx.fillText(`Overall ${slot.res.overall.toFixed(1)}/10`, x, sY);

        const bars = [
          ['Symmetry', slot.res.breakdown.symmetry],
          ['Jawline',  slot.res.breakdown.jawline],
          ['Eyes',     slot.res.breakdown.eyes],
          ['Skin',     slot.res.breakdown.skin],
          ['Balance',  slot.res.breakdown.balance],
          ['Potential',slot.res.potential],
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

    await draw(left, leftRef.current, pad);
    await draw(right, rightRef.current, pad*2+boxW);

    if (me.pro) {
      ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.font='700 34px system-ui';
      ctx.textAlign='right'; ctx.fillText('LooksLab • PRO', W-28, H-28);
    } else {
      ctx.save(); ctx.translate(W/2, H-120); ctx.rotate(-Math.PI/180*8);
      ctx.fillStyle='rgba(255,255,255,0.10)'; ctx.font='900 110px system-ui';
      ctx.textAlign='center'; ctx.fillText('looksLab.app', 0, 0); ctx.restore();
    }

    const url=c.toDataURL('image/jpeg',0.92);
    const a=document.createElement('a'); a.href=url; a.download='lookslab-faceoff.jpg'; a.click();
  };

  if (me.checking) return <Shell><p className="text-neutral-400">Checking access…</p></Shell>;
  if (!me.loggedIn) return <Gate title="Face-Off Studio" body="Sign in to use Face-Off Studio and export cards." primary={{href:'/login',label:'Log in'}} secondary={{href:'/',label:'Back home'}} />;
  if (!me.pro)      return <Gate title="Face-Off Studio (Pro)" body="This feature is for Pro members. Upgrade to unlock Face-Off cards and watermark-light exports." primary={{href:'/pro',label:'Go Pro'}} secondary={{href:'/',label:'Back home'}} />;

  return (
    <Shell>
      <h1 className="text-3xl font-bold mt-10 mb-2">Face-Off Studio</h1>
      <p className="text-sm text-neutral-400 mb-6">Upload two pics → auto scores → export a 9:16 card.</p>

      {!ready && <p className="text-xs text-amber-400">Failed to initialize models from /public/models</p>}

      <div className="grid md:grid-cols-2 gap-5">
        <Slot
          label="Left"
          url={left.url}
          res={left.res}
          onPick={pick('left')}
          clear={()=>setLeft({url:'',res:null})}
          canvasRef={leftRef}
        />
        <Slot
          label="Right"
          url={right.url}
          res={right.res}
          onPick={pick('right')}
          clear={()=>setRight({url:'',res:null})}
          canvasRef={rightRef}
        />
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

      <canvas ref={exportRef} className="hidden" />
    </Shell>
  );
}

/* UI bits */
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
function Slot({ label, url, res, onPick, clear, canvasRef }) {
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

      <div className="aspect-[3/4] w-full rounded-md overflow-hidden bg-black/30 border border-neutral-900">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      {res && (
        <div className="mt-3 text-sm grid grid-cols-2 gap-1">
          <Row label="Overall"   value={res.overall} />
          <Row label="Symmetry"  value={res.breakdown.symmetry} />
          <Row label="Jawline"   value={res.breakdown.jawline} />
          <Row label="Eyes"      value={res.breakdown.eyes} />
          <Row label="Skin"      value={res.breakdown.skin} />
          <Row label="Balance"   value={res.breakdown.balance} />
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

/* tiny utils for export shapes */
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function clipRoundRect(ctx,x,y,w,h,r){ roundRect(ctx,x,y,w,h,r); ctx.clip(); }
function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=src; }); }
