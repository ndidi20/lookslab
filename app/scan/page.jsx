'use client';

import { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';

export default function ScanPage() {
  const vidRef = useRef(null);
  const stageRef = useRef(null); // canvas draw stage for preview/alignment
  const hiddenRef = useRef(null); // hidden canvas for export
  const imgRef = useRef(null);

  const [ready, setReady] = useState(false);
  const [me, setMe] = useState({ pro: false });
  const [usingCam, setUsingCam] = useState(false);
  const [showCam, setShowCam] = useState(false);
  const [uploadURL, setUploadURL] = useState('');
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState('');
  const [res, setRes] = useState(null);
  const [consent, setConsent] = useState(true);

  // load models + me
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const MODEL_URL = '/models';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        ]);
        if (mounted) setReady(true);
      } catch (e) {
        console.error(e);
        alert('Failed to load models from /public/models');
      }
      try {
        const r = await fetch('/api/me', { cache: 'no-store' });
        if (r.ok && mounted) setMe(await r.json());
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  // camera modal lifecycle
  useEffect(() => {
    if (!showCam) return;
    let stream, loop;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        vidRef.current.srcObject = stream;
        await vidRef.current.play();
        setUsingCam(true);

        // live pose hints
        const tick = async () => {
          try {
            const det = await faceapi
              .detectSingleFace(vidRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 }))
              .withFaceLandmarks();
            if (!det?.landmarks) setHint('No face: center & move closer');
            else setHint(poseHint(det.landmarks.positions));
          } catch {}
          loop = setTimeout(tick, 220);
        };
        tick();
      } catch (e) {
        console.error(e);
        alert('Camera unavailable.');
        setShowCam(false);
      }
    })();

    return () => {
      if (loop) clearTimeout(loop);
      if (vidRef.current?.srcObject) {
        vidRef.current.srcObject.getTracks().forEach(t => t.stop());
        vidRef.current.srcObject = null;
      }
      setUsingCam(false);
    };
  }, [showCam]);

  const onPick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setUploadURL(url);
    setRes(null);
  };

  const snapFromCamera = () => {
    // grab a frame into an image URL
    const v = vidRef.current;
    const c = document.createElement('canvas');
    const W = 720;
    const H = Math.round((v.videoHeight / v.videoWidth) * W) || 960;
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(v, 0, 0, W, H);
    const url = c.toDataURL('image/jpeg', 0.92);
    setUploadURL(url);
    setShowCam(false);
    setRes(null);
  };

  const analyze = async () => {
    if (!ready || !consent) return;
    setLoading(true);
    setRes(null);
    try {
      const src = await loadImg(uploadURL);
      // initial detect
      const init = await faceapi
        .detectSingleFace(src, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
        .withFaceLandmarks();
      if (!init?.landmarks) { alert('No face detected. Use a straight‑on, well‑lit photo.'); setLoading(false); return; }

      // auto-align + crop
      const aligned = alignToEyes(src, init.landmarks);
      // draw aligned to preview stage
      const stage = stageRef.current;
      stage.width = 720; stage.height = 900;
      const sctx = stage.getContext('2d');
      sctx.clearRect(0,0,stage.width,stage.height);
      sctx.drawImage(aligned.canvas, 0, 0, stage.width, stage.height);

      // re-detect on aligned
      const aImg = await canvasToImage(aligned.canvas);
      const det = await faceapi
        .detectSingleFace(aImg, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
        .withFaceLandmarks();
      if (!det?.landmarks) { alert('Could not analyze face after alignment.'); setLoading(false); return; }

      const scored = scoreFromLandmarks(det.landmarks);
      // eye rects (for optional future eye blur on single export if you want)
      const lm = det.landmarks.positions;
      const eyeRect = (ids, pad=6) => {
        const xs = ids.map(i=>lm[i].x), ys = ids.map(i=>lm[i].y);
        const x = Math.min(...xs)-pad, y = Math.min(...ys)-pad;
        const w = Math.max(...xs)-Math.min(...xs)+pad*2;
        const h = Math.max(...ys)-Math.min(...ys)+pad*2;
        return { x, y, w, h, iw: aligned.canvas.width, ih: aligned.canvas.height };
      };

      setRes({
        overall: scored.overall,
        breakdown: scored.breakdown,
        alignedSrc: aligned.canvas.toDataURL('image/jpeg', 0.92),
        eyes: {
          leftEye: eyeRect([36,37,38,39,40,41]),
          rightEye: eyeRect([42,43,44,45,46,47]),
        }
      });
    } catch (e) {
      console.error(e);
      alert('Analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  const exportCard = async () => {
    if (!res?.alignedSrc) return;
    const PRO = !!me.pro;
    const W = PRO ? 1200 : 960;
    const H = PRO ? 1500 : 1200;
    const pad = 28;

    const c = hiddenRef.current; c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // bg
    const g = ctx.createRadialGradient(W*0.2, H*0.05, 50, W*0.8, H*0.95, W);
    g.addColorStop(0, '#181822'); g.addColorStop(1, '#0b0b0c');
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);

    // title
    ctx.fillStyle = '#e9e9ff';
    ctx.font = '800 48px system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillText('LooksLab Score', pad, 70);

    // portrait
    const img = await loadImg(res.alignedSrc);
    const boxX = pad, boxY = 92, boxW = W - pad*2, boxH = Math.round(W * 1.05);
    roundRect(ctx, boxX, boxY, boxW, boxH, 24); ctx.save(); ctx.clip();
    const fit = fitCover(img.width, img.height, boxW, boxH);
    ctx.drawImage(img, boxX + fit.dx, boxY + fit.dy, fit.dw, fit.dh);
    ctx.restore();

    // numbers
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 42px system-ui';
    ctx.fillText(`Overall ${res.overall.toFixed(1)}/10`, pad, boxY + boxH + 56);
    ctx.fillStyle = '#cfcfe9';
    ctx.font = '600 28px system-ui';
    ctx.fillText(`Symmetry ${res.breakdown.symmetry.toFixed(1)}  ·  Proportions ${res.breakdown.proportions.toFixed(1)}  ·  Jaw ${res.breakdown.jawline.toFixed(1)}`, pad, boxY + boxH + 95);

    // non-pro watermark
    if (!me.pro) {
      ctx.save();
      ctx.translate(W/2, H - 100);
      ctx.rotate(-Math.PI/180 * 8);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.font = '900 110px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('looksLab.app', 0, 0);
      ctx.restore();
    }

    const url = c.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `lookslab-scan-${Date.now()}.png`;
    a.click();
  };

  return (
    <main className="mx-auto max-w-4xl px-4 pb-24">
      <h1 className="text-3xl font-bold mt-10 mb-2 text-center">Try Your Score</h1>
      <p className="text-sm text-neutral-400 text-center mb-6">Private, on‑device analysis. Nothing is uploaded.</p>

      <div className="rounded-lg border border-neutral-800 bg-black/40 p-4">
        {/* preview stage */}
        <div className="aspect-[4/5] w-full rounded-md overflow-hidden bg-black/30 border border-neutral-900 flex items-center justify-center">
          {uploadURL ? (
            <img ref={imgRef} src={uploadURL} alt="" className="hidden" />
          ) : (
            <p className="text-neutral-500 text-sm">Upload or use your camera to begin.</p>
          )}
          <canvas ref={stageRef} className="w-full h-full" />
        </div>

        {/* controls */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="px-4 py-2 rounded border border-neutral-700 hover:bg-neutral-900 cursor-pointer">
            Upload Photo
            <input type="file" accept="image/*" onChange={onPick} className="hidden" />
          </label>

          <button
            onClick={()=>setShowCam(true)}
            className="px-4 py-2 rounded border border-neutral-700 hover:bg-neutral-900"
          >
            Use Camera
          </button>

          <button
            onClick={analyze}
            disabled={!ready || !uploadURL || !consent || loading}
            className="px-4 py-2 rounded bg-violet-600 hover:bg-violet-500 text-black font-semibold disabled:opacity-50"
          >
            {loading ? 'Analyzing…' : 'Analyze'}
          </button>

          <button
            onClick={exportCard}
            disabled={!res}
            className="px-4 py-2 rounded border border-neutral-700 hover:bg-neutral-900"
          >
            Export {me.pro ? 'HD' : '(watermark)'}
          </button>

          <label className="ml-auto text-sm inline-flex items-center gap-2 select-none">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
            I have consent to analyze this image
          </label>
        </div>
      </div>

      {/* camera modal */}
      {showCam && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="w-[min(92vw,720px)] rounded-xl border border-neutral-800 bg-[#0B0B12] p-4">
            <div className="aspect-[3/4] w-full overflow-hidden rounded-lg border border-neutral-800 relative">
              <video ref={vidRef} playsInline muted className="w-full h-full object-cover" />
              <div className="absolute bottom-2 left-2 right-2 text-center">
                <span className="inline-block text-xs px-2 py-1 rounded bg-black/60 border border-neutral-700 text-neutral-200">
                  {hint || 'Center your face • neutral expression • even light'}
                </span>
              </div>
            </div>
            <div className="mt-3 flex justify-between">
              <button onClick={()=>setShowCam(false)} className="px-3 py-2 rounded border border-neutral-700 hover:bg-neutral-900">Cancel</button>
              <button onClick={snapFromCamera} className="px-4 py-2 rounded bg-violet-600 text-black font-semibold">
                Take photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* hidden export canvas */}
      <canvas ref={hiddenRef} className="hidden" />
    </main>
  );
}

/* ======================== Scoring / helpers ======================== */

function scoreFromLandmarks(landmarks) {
  const lm = landmarks.positions;
  const faceW = Math.hypot(lm[16].x - lm[0].x, lm[16].y - lm[0].y);

  // symmetry
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

  // proportions (face height / width ~1.45 sweet spot)
  const brow = lm[27], chin = lm[8];
  const faceH = Math.hypot(chin.x - brow.x, chin.y - brow.y);
  const ratio = faceH / (faceW || 1);
  const proportions = clamp(10 - Math.abs(ratio - 1.45)*22, 0, 10);

  // jawline (angle at chin)
  const left = lm[4], right = lm[12];
  const jawDeg = angleAt(chin, left, right) * 180/Math.PI;
  let jawline;
  if (jawDeg < 60) jawline = 6 + (jawDeg - 60) * 0.02;
  else if (jawDeg > 115) jawline = 6 - (jawDeg - 115) * 0.06;
  else jawline = 8 + (1 - Math.abs(jawDeg - 90)/20) * 2;
  jawline = clamp(jawline, 0, 10);

  // pose penalty (post-align should be small; keep mild)
  const pose = posePenalty(lm);
  const base = 0.46*symmetry + 0.34*proportions + 0.20*jawline;
  const overall = clamp(base - pose*1.2, 0, 10);

  return { overall, breakdown: { symmetry, proportions, jawline } };
}

function posePenalty(lm) {
  const L = lm[36], R = lm[45];
  const eyeDX = R.x - L.x, eyeDY = R.y - L.y;
  const rollDeg = Math.abs(Math.atan2(eyeDY, eyeDX) * 180/Math.PI);
  const nose = lm[33];
  const midEye = { x:(L.x+R.x)/2, y:(L.y+R.y)/2 };
  const eyeDist = Math.hypot(eyeDX, eyeDY) || 1;
  const yawDeg = Math.abs((nose.x - midEye.x)/eyeDist) * 60;
  return clamp((smooth(rollDeg,4,14)+smooth(yawDeg,6,18))/2, 0, 1);
}

function poseHint(lm) {
  const L = lm[36], R = lm[45];
  const eyeDX = R.x - L.x, eyeDY = R.y - L.y;
  const roll = Math.atan2(eyeDY, eyeDX) * 180/Math.PI;
  const nose = lm[33];
  const midEye = { x:(L.x+R.x)/2, y:(L.y+R.y)/2 };
  const eyeDist = Math.hypot(eyeDX, eyeDY) || 1;
  const yaw = ((nose.x - midEye.x)/eyeDist) * 60;

  const rollA = Math.abs(roll), yawA = Math.abs(yaw);
  if (rollA > 12) return roll > 0 ? 'Head tilted right — straighten a bit' : 'Head tilted left — straighten a bit';
  if (yawA > 14) return yaw > 0 ? 'Turn slightly left (face camera)' : 'Turn slightly right (face camera)';
  return 'Looks good • hold steady • neutral face';
}

/* ======================== Auto-align ======================== */

function alignToEyes(img, landmarks) {
  const lm = landmarks.positions;
  const L = lm[36], R = lm[45];
  const eyeDX = R.x - L.x, eyeDY = R.y - L.y;
  const angle = Math.atan2(eyeDY, eyeDX);

  // face bbox + margin
  const xs = lm.map(p=>p.x), ys = lm.map(p=>p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const cx = (minX + maxX)/2, cy = (minY + maxY)/2;
  const w = (maxX - minX), h = (maxY - minY);
  const margin = 0.7; // 70% padding
  const boxW = w * (1 + margin), boxH = h * (1 + margin);

  // rotate whole image to level eyes
  const diag = Math.hypot(img.width, img.height);
  const C = document.createElement('canvas');
  C.width = C.height = Math.ceil(diag);
  const ctx = C.getContext('2d');
  ctx.translate(C.width/2, C.height/2);
  ctx.rotate(-angle);
  ctx.drawImage(img, -img.width/2, -img.height/2);

  // map face center to rotated coords
  const rc = rotPoint({ x: cx, y: cy }, { x: img.width/2, y: img.height/2 }, -angle);
  const crop = {
    x: Math.round(rc.x - boxW/2),
    y: Math.round(rc.y - boxH/2),
    w: Math.round(boxW),
    h: Math.round(boxH),
  };
  crop.x = Math.max(0, Math.min(crop.x, C.width - crop.w));
  crop.y = Math.max(0, Math.min(crop.y, C.height - crop.h));

  // tidy target ~720x900
  const T = document.createElement('canvas');
  const targetW = 720, targetH = Math.round(targetW * 1.25);
  T.width = targetW; T.height = targetH;
  const tctx = T.getContext('2d');
  tctx.drawImage(C, crop.x, crop.y, crop.w, crop.h, 0, 0, targetW, targetH);

  return { canvas: T };
}

/* ======================== utils ======================== */

function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.src=src; }); }
function canvasToImage(canvas){ return new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src = canvas.toDataURL('image/jpeg', 0.92); }); }
function fitCover(iw, ih, ow, oh){
  const s = Math.max(ow/iw, oh/ih);
  const dw = Math.round(iw*s), dh = Math.round(ih*s);
  return { dw, dh, dx: Math.round((ow - dw)/2), dy: Math.round((oh - dh)/2) };
}
function roundRect(ctx, x, y, w, h, r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function rotPoint(p, c, ang){ const s=Math.sin(ang), q=Math.cos(ang); const x=p.x-c.x, y=p.y-c.y; return { x: x*q - y*s + c.x, y: x*s + y*q + c.y }; }
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function smooth(v, ok, bad){ if (v<=ok) return 0; if (v>=bad) return 1; const t=(v-ok)/(bad-ok); return t*t*(3-2*t); }
function angleAt(p, a, b){ const v1={x:a.x-p.x,y:a.y-p.y}, v2={x:b.x-p.x,y:b.y-p.y}; const dot=v1.x*v2.x+v1.y*v2.y; const m1=Math.hypot(v1.x,v1.y), m2=Math.hypot(v2.x,v2.y); return Math.acos(clamp(dot/((m1*m2)||1),-1,1)); }
