'use client';

import { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';

export default function ScanPage() {
  const [ready, setReady]   = useState(false);
  const [busy, setBusy]     = useState(false);
  const [consent, setConsent] = useState(true);

  const [imgURL, setImgURL] = useState('');
  const [res, setRes]       = useState(null);

  const canRef = useRef(null);

  // one-time TF backend + model load
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await ensureVisionReady();
        if (mounted) setReady(true);
      } catch (e) {
        console.error(e);
      }
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
    if (!ready || !imgURL || !consent || busy) return;
    setBusy(true);
    try {
      // draw image into fixed canvas without stretching
      const img = await loadImg(imgURL);
      const c = canRef.current;
      const W = 640, H = 800; // tuned for speed + accuracy
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      ctx.fillStyle = 'black'; ctx.fillRect(0,0,W,H);
      const fit = fitContain(img.width, img.height, W, H);
      ctx.drawImage(img, (W-fit.w)/2, (H-fit.h)/2, fit.w, fit.h);

      // permissive + fast detection
      const det = await faceapi
        .detectSingleFace(c, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.1 }))
        .withFaceLandmarks();

      setRes(det?.landmarks ? scoreFromLandmarks(det.landmarks, c) : null);
    } catch (e) {
      console.error(e);
      setRes(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24">
      <h1 className="text-3xl font-bold mt-10 mb-2">Face Scan</h1>
      <p className="text-sm text-neutral-400 mb-6">All analysis runs in your browser. Images aren’t uploaded.</p>

      <div className="rounded-xl border border-neutral-800 bg-black/40 p-4">
        {/* Preview box (no stretch) */}
        <div className="aspect-[4/5] w-full rounded-md overflow-hidden bg-black/30 border border-neutral-900 flex items-center justify-center">
          {imgURL ? (
            <img src={imgURL} alt="" className="w-full h-full object-contain" />
          ) : (
            <p className="text-neutral-500 text-sm">No image</p>
          )}
          <canvas ref={canRef} className="hidden" />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
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

        {!ready && (
          <p className="mt-2 text-xs text-amber-400">
            Loading face models… Make sure the files are in <code>/public/models</code>
          </p>
        )}
      </div>

      {res && (
        <div className="mt-6 grid md:grid-cols-2 gap-4">
          <Card label="Overall"   value={res.overall} big />
          <Card label="Symmetry"  value={res.breakdown.symmetry} />
          <Card label="Jawline"   value={res.breakdown.jawline} />
          <Card label="Eyes"      value={res.breakdown.eyes} />
          <Card label="Skin"      value={res.breakdown.skin} />
          <Card label="Balance"   value={res.breakdown.balance} />
          <Card label="Potential" value={res.potential} />
        </div>
      )}
    </main>
  );
}

/* ---------- shared init (single TF instance, single model load) ---------- */

let __visionReady = false;
async function ensureVisionReady() {
  if (__visionReady) return true;
  try { await tf.setBackend('webgl'); } catch { await tf.setBackend('cpu'); }
  await tf.ready();

  const URL = '/models';
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(URL),
  ]);

  __visionReady = true;
  return true;
}

/* ---------- UI bits ---------- */

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

/* ---------- scoring (6 metrics + potential) ---------- */

function scoreFromLandmarks(landmarks, canvas) {
  const lm = landmarks.positions;
  const faceW = Math.hypot(lm[16].x - lm[0].x, lm[16].y - lm[0].y) || 1;

  // symmetry (paired distances around midline)
  const midX = lm[27].x;
  const pairs = [[36,45],[39,42],[31,35],[48,54],[3,13]];
  let symErr = 0;
  for (const [a,b] of pairs) {
    const da = Math.abs(midX - lm[a].x);
    const db = Math.abs(lm[b].x - midX);
    symErr += Math.abs(da - db);
  }
  const symmetry = clamp(10 - (symErr/faceW) * 40, 0, 10);

  // jawline: angle at chin between jaw corners
  const jawDeg = angleAt(lm[8], lm[4], lm[12]) * 180/Math.PI;
  let jawline;
  if (jawDeg < 60)       jawline = 6 + (jawDeg - 60) * 0.02;
  else if (jawDeg > 115) jawline = 6 - (jawDeg - 115) * 0.06;
  else                   jawline = 8 + (1 - Math.abs(jawDeg - 90)/20) * 2;
  jawline = clamp(jawline, 0, 10);

  // eyes: openness + left/right match
  const eyeOpen = (eye) => {
    const [t1,t2,b1,b2,L,R] = eye;
    const vertical = (dist(t1,b1) + dist(t2,b2)) / 2;
    const width    = dist(L,R) || 1;
    return vertical / width;
  };
  const LE=[lm[37],lm[38],lm[41],lm[40],lm[36],lm[39]];
  const RE=[lm[43],lm[44],lm[47],lm[46],lm[42],lm[45]];
  const lo = eyeOpen(LE), ro = eyeOpen(RE);
  const openScore  = clamp(10 * smooth01((lo+ro)/2, 0.18, 0.35), 0, 10);
  const matchScore = clamp(10 - Math.abs(lo - ro) * 80, 0, 10);
  const eyes = 0.65*openScore + 0.35*matchScore;

  // skin: luminance variance around nose region (lower variance → smoother)
  const skin = (() => {
    try {
      const ctx = canvas.getContext('2d');
      const cx = lm[33].x, cy = lm[33].y;
      const w = Math.max(20, faceW*0.35), h = Math.max(20, faceW*0.25);
      const x = Math.round(cx - w/2), y = Math.round(cy - h/3);
      const rx = clamp(Math.max(x, 0), 0, canvas.width - 1);
      const ry = clamp(Math.max(y, 0), 0, canvas.height - 1);
      const rw = Math.min(w, canvas.width - rx);
      const rh = Math.min(h, canvas.height - ry);
      const img = ctx.getImageData(rx, ry, rw, rh);
      const L = new Float32Array(img.width * img.height);
      for (let i=0,j=0; i<img.data.length; i+=4, j++) {
        const r=img.data[i], g=img.data[i+1], b=img.data[i+2];
        L[j] = 0.2126*r + 0.7152*g + 0.0722*b; // luminance
      }
      const mean = L.reduce((a,b)=>a+b,0) / L.length || 1;
      let varSum = 0; for (const v of L) varSum += (v-mean)*(v-mean);
      const variance = varSum / L.length;
      return clamp(10 - smoothMap(variance, 120, 950) * 10, 0, 10);
    } catch { return 5.5; }
  })();

  // balance: three lightweight ratios
  const noseW = dist(lm[31],lm[35]);
  const mouthW = dist(lm[48],lm[54]);
  const eyeW = dist(lm[36],lm[39]);
  const interEye = dist(lm[39],lm[42]);
  const lower = dist(lm[33],lm[8]);
  const mid   = dist(lm[27],lm[33]);

  const r1 = mouthW / (noseW || 1);     // mouth vs nose
  const r2 = interEye / (eyeW || 1);    // inter-eye vs eye width
  const r3 = (lower / (mid || 1));      // lower vs mid face

  const s1 = 10 - Math.min(10, Math.abs(r1 - 1.6) * 8);
  const s2 = 10 - Math.min(10, Math.abs(r2 - 1.0) * 10);
  const s3 = 10 - Math.min(10, Math.abs(r3 - 1.05) * 12);
  const balance = clamp(0.4*s1 + 0.35*s2 + 0.25*s3, 0, 10);

  // pose penalty (gentle)
  const pose = posePenalty(lm);

  // overall + potential
  const overallBase = 0.28*symmetry + 0.22*jawline + 0.18*eyes + 0.17*skin + 0.15*balance;
  const overall = clamp(overallBase - pose * 0.9, 0, 10);
  const potential = clamp(overall + ((10 - overall) * 0.35) - pose * 0.3, 0, 10);

  return { overall, potential, breakdown: { symmetry, jawline, eyes, skin, balance } };
}

/* ---------- math/utils ---------- */

function angleAt(p, a, b) {
  const v1={x:a.x-p.x,y:a.y-p.y}, v2={x:b.x-p.x,y:b.y-p.y};
  const dot=v1.x*v2.x+v1.y*v2.y;
  const m1=Math.hypot(v1.x,v1.y), m2=Math.hypot(v2.x,v2.y);
  return Math.acos(clamp(dot/((m1*m2)||1),-1,1));
}
function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
function posePenalty(lm){
  const L=lm[36], R=lm[45];
  const eyeDX=R.x-L.x, eyeDY=R.y-L.y;
  const rollDeg=Math.abs(Math.atan2(eyeDY,eyeDX)*180/Math.PI);
  const nose=lm[33], midEye={x:(L.x+R.x)/2, y:(L.y+R.y)/2};
  const eyeDist=Math.hypot(eyeDX,eyeDY)||1;
  const yawDeg=Math.abs((nose.x-midEye.x)/eyeDist)*60;
  return clamp((smooth(rollDeg,5,22)+smooth(yawDeg,8,26))/2, 0, 1);
}
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function smooth(v, ok, bad){ if (v<=ok) return 0; if (v>=bad) return 1; const t=(v-ok)/(bad-ok); return t*t*(3-2*t); }
function smooth01(v, a, b){ if (v<=a) return 0; if (v>=b) return 1; const t=(v-a)/(b-a); return t*t*(3-2*t); }
function smoothMap(v, a, b){ if (v<=a) return 0; if (v>=b) return 1; const t=(v-a)/(b-a); return t*t*(3-2*t); }
function fitContain(iw, ih, ow, oh){ const s=Math.min(ow/iw, oh/ih); return { w:Math.round(iw*s), h:Math.round(ih*s) }; }
function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=src; }); }
