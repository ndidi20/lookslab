'use client';

import { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';

export default function ScanPage() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [consent, setConsent] = useState(true);

  const videoRef = useRef(null);
  const canRef = useRef(null);

  // init TF backend + load models
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await faceapi.tf.ready();
        try { await faceapi.tf.setBackend('webgl'); } catch { await faceapi.tf.setBackend('cpu'); }
        await faceapi.tf.ready();

        const MODEL_URL = '/models';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        ]);

        if (mounted) setReady(true);
      } catch (e) {
        console.error(e);
        alert('Failed to initialize models from /public/models');
      }
    })();
    return () => { mounted = false; };
  }, []);

  const startCamera = async () => {
    const v = videoRef.current;
    if (!v) return;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    v.srcObject = stream;
    await v.play();
  };

  const stopCamera = () => {
    const v = videoRef.current;
    v?.srcObject && v.srcObject.getTracks().forEach(t => t.stop());
  };

  const analyzeFromVideo = async () => {
    if (!ready || !videoRef.current) return;
    setBusy(true);
    try {
      const frame = grabFrame(videoRef.current, 640, 800);
      const det = await faceapi
        .detectSingleFace(frame, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
        .withFaceLandmarks();

      if (!det?.landmarks) { setResult(null); alert('No clear, forward-facing face found.'); return; }

      const res = scoreFromLandmarks(det.landmarks);
      drawOverlay(frame, det.landmarks);
      setResult(res);
    } catch (e) {
      console.error(e); alert('Analysis failed');
    } finally {
      setBusy(false);
    }
  };

  const onPick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const img = await loadImg(URL.createObjectURL(f));
      const frame = drawToCanvas(img, 640, 800);
      const det = await faceapi
        .detectSingleFace(frame, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
        .withFaceLandmarks();

      if (!det?.landmarks) { setResult(null); alert('No clear, forward-facing face found.'); return; }

      const res = scoreFromLandmarks(det.landmarks);
      drawOverlay(frame, det.landmarks);
      setResult(res);
    } catch (e) {
      console.error(e); alert('Analysis failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24">
      <h1 className="text-3xl font-bold mt-10 mb-2">Face Scan</h1>
      <p className="text-sm text-neutral-400 mb-6">All analysis runs in your browser. Images aren’t uploaded.</p>

      {!ready && <p className="text-sm text-neutral-400 mb-4">Loading face models…</p>}

      <div className="rounded-xl border border-neutral-800 bg-black/40 p-4">
        <div className="aspect-[4/3] w-full rounded-md overflow-hidden bg-black/30 border border-neutral-900 flex items-center justify-center">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          <canvas ref={canRef} className="hidden" />
        </div>

        <div className="mt-4 flex flex-wrap gap-3 items-center">
          <button
            onClick={startCamera}
            disabled={!ready}
            className="px-4 py-2 rounded bg-violet-600 hover:bg-violet-500 text-black font-semibold disabled:opacity-50"
          >
            Start camera
          </button>
          <button
            onClick={stopCamera}
            className="px-4 py-2 rounded border border-neutral-700 hover:bg-neutral-900"
          >
            Stop
          </button>

          <label className="px-4 py-2 rounded border border-neutral-700 hover:bg-neutral-900 cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={onPick} />
            Upload a photo
          </label>

          <button
            onClick={analyzeFromVideo}
            disabled={!ready || busy}
            className="px-4 py-2 rounded border border-neutral-700 hover:bg-neutral-900 disabled:opacity-50"
          >
            {busy ? 'Analyzing…' : 'Analyze current frame'}
          </button>

          <label className="ml-auto flex items-center gap-2 text-sm text-neutral-400">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
            I consent to analyze this image on-device
          </label>
        </div>
      </div>

      {result && (
        <div className="mt-6 grid md:grid-cols-2 gap-4">
          <Break label="Overall" value={result.overall} big />
          <Break label="Symmetry" value={result.breakdown.symmetry} />
          <Break label="Proportions" value={result.breakdown.proportions} />
          <Break label="Jawline" value={result.breakdown.jawline} />
        </div>
      )}
    </main>
  );

  /* helpers for the scan page */

  function grabFrame(video, W, H) {
    const c = canRef.current;
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'black'; ctx.fillRect(0,0,W,H);
    const fit = fitContain(video.videoWidth || W, video.videoHeight || H, W, H);
    ctx.drawImage(video, (W-fit.w)/2, (H-fit.h)/2, fit.w, fit.h);
    return c;
  }

  function drawToCanvas(img, W, H) {
    const c = canRef.current;
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'black'; ctx.fillRect(0,0,W,H);
    const fit = fitContain(img.width, img.height, W, H);
    ctx.drawImage(img, (W-fit.w)/2, (H-fit.h)/2, fit.w, fit.h);
    return c;
  }

  function drawOverlay(c, landmarks) {
    const ctx = c.getContext('2d');
    ctx.strokeStyle = '#9b7dff';
    ctx.lineWidth = 2;
    const pts = landmarks.positions;
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();
  }
}

function Break({ label, value, big = false }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-black/40 p-3">
      <div className={`flex items-center justify-between ${big ? 'text-xl font-semibold' : ''}`}>
        <span className="text-neutral-300">{label}</span>
        <span className="font-mono">{value.toFixed(1)}/10</span>
      </div>
    </div>
  );
}

/* ---------- scoring core ---------- */
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
  const symScore = clamp(10 - (symErr / (faceW||1)) * 40, 0, 10);

  // proportions
  const brow = lm[27], chin = lm[8];
  const faceH = Math.hypot(chin.x - brow.x, chin.y - brow.y);
  const ratio = faceH / (faceW || 1);
  const ratioScore = clamp(10 - Math.abs(ratio - 1.45)*22, 0, 10);

  // jaw
  const left = lm[4], right = lm[12];
  const jaw = angleAt(chin, left, right) * 180/Math.PI;
  let jawScore;
  if (jaw < 60) jawScore = 6 + (jaw - 60) * 0.02;
  else if (jaw > 115) jawScore = 6 - (jaw - 115) * 0.06;
  else jawScore = 8 + (1 - Math.abs(jaw - 90)/20) * 2;
  jawScore = clamp(jawScore, 0, 10);

  // pose penalty
  const pose = posePenalty(lm);
  const base = 0.46*symScore + 0.34*ratioScore + 0.20*jawScore;
  const overall = clamp(base - pose*2, 0, 10);

  return { overall, breakdown: { symmetry: symScore, proportions: ratioScore, jawline: jawScore } };
}

function posePenalty(lm) {
  const L = lm[36], R = lm[45];
  const eyeDX = R.x - L.x, eyeDY = R.y - L.y;
  const rollDeg = Math.abs(Math.atan2(eyeDY, eyeDX) * 180/Math.PI);

  const nose = lm[33];
  const midEye = { x:(L.x+R.x)/2, y:(L.y+R.y)/2 };
  const eyeDist = Math.hypot(eyeDX, eyeDY) || 1;
  const yawDeg = Math.abs((nose.x - midEye.x)/eyeDist) * 60;

  return clamp((smooth(rollDeg,5,18)+smooth(yawDeg,7,22))/2, 0, 1);
}

function angleAt(p, a, b) {
  const v1 = { x: a.x - p.x, y: a.y - p.y };
  const v2 = { x: b.x - p.x, y: b.y - p.y };
  const dot = v1.x*v2.x + v1.y*v2.y;
  const m1 = Math.hypot(v1.x, v1.y), m2 = Math.hypot(v2.x, v2.y);
  return Math.acos(clamp(dot / ((m1*m2)||1), -1, 1));
}
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function smooth(v, ok, bad){ if (v<=ok) return 0; if (v>=bad) return 1; const t=(v-ok)/(bad-ok); return t*t*(3-2*t); }
function fitContain(iw, ih, ow, oh){ const s=Math.min(ow/iw, oh/ih); return { w: Math.round(iw*s), h: Math.round(ih*s) }; }
function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=src; }); }
