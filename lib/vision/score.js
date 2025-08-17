// Geometry → raw metrics → normalized with anchors → Overall & Potential
// Uses MediaPipe FaceMesh (468 landmarks) indices.

let _anchorsCache = null;
async function getAnchors(){
  if (_anchorsCache) return _anchorsCache;
  const res = await fetch('/anchors.json', { cache: 'no-store' });
  _anchorsCache = await res.json();
  return _anchorsCache;
}

// Handy index map (MediaPipe FaceMesh)
const MP = {
  chin: 152,
  jawL: 172, jawR: 397,         // mandibular angles
  faceL: 234, faceR: 454,       // widest cheek points
  noseTip: 4, glabella: 168,    // nose tip / between eyebrows
  noseL: 97, noseR: 326,        // alar wings (nose width)
  mouthL: 61, mouthR: 291,      // mouth corners

  // Right eye (subject’s right): outer=33, inner=133, top=159, bottom=145
  rEyeOuter: 33, rEyeInner: 133, rEyeTop: 159, rEyeBot: 145,
  // Left eye: outer=263, inner=362, top=386, bottom=374
  lEyeOuter: 263, lEyeInner: 362, lEyeTop: 386, lEyeBot: 374,
};

export async function scoreOne(landmarks, canvas){
  const raw = computeRawMetrics(landmarks, canvas);
  const anchors = await getAnchors();
  const norm  = normalizeWithAnchors(raw, anchors);

  // Blend to overall
  const pose = posePenalty(landmarks.positions);
  const base =
    0.28 * norm.symmetry +
    0.22 * norm.jawline +
    0.18 * norm.eyes +
    0.17 * norm.skin +
    0.15 * norm.balance;

  const overall   = clamp(base - 0.9*pose, 0, 10);
  const potential = clamp(overall + (10 - overall)*0.35 - 0.3*pose, 0, 10);

  return {
    overall, potential,
    breakdown: {
      symmetry: norm.symmetry,
      jawline : norm.jawline,
      eyes    : norm.eyes,
      skin    : norm.skin,
      balance : norm.balance,
    }
  };
}

/* ---------- raw metrics (from MP468) ---------- */
function computeRawMetrics(landmarks, canvas){
  const p = landmarks.positions;
  const faceW = dist(p[MP.faceL], p[MP.faceR]) || 1;

  // Midline X through inner eye centers (stable even with hair/hats)
  const midX = (p[MP.rEyeInner].x + p[MP.lEyeInner].x) / 2;

  // Symmetry: mirrored distances of several bilateral pairs
  const pairs = [
    [MP.rEyeOuter, MP.lEyeOuter],
    [MP.rEyeInner, MP.lEyeInner],
    [MP.noseL, MP.noseR],
    [MP.mouthL, MP.mouthR],
    [MP.jawL, MP.jawR],
  ];
  let symErr = 0;
  for (const [L,R] of pairs){
    const dL = Math.abs(midX - p[L].x);
    const dR = Math.abs(p[R].x - midX);
    symErr += Math.abs(dL - dR);
  }
  const symmetry = clamp(10 - (symErr/faceW) * 40, 0, 10);

  // Jawline: angle at the chin between jaw angles (sharper ≈ higher)
  const jawDeg = angleAt(p[MP.chin], p[MP.jawL], p[MP.jawR]) * 180/Math.PI;
  let jawline;
  if (jawDeg < 60)      jawline = 6 + (jawDeg - 60) * 0.02;
  else if (jawDeg >115) jawline = 6 - (jawDeg - 115)* 0.06;
  else                  jawline = 8 + (1 - Math.abs(jawDeg - 90)/20) * 2;
  jawline = clamp(jawline, 0, 10);

  // Eyes: openness + bilateral match (EAR-style)
  const eyeOpen = (top, bot, out, inn) => (dist(p[top], p[bot])) / (dist(p[out], p[inn]) || 1);
  const rOpen = eyeOpen(MP.rEyeTop, MP.rEyeBot, MP.rEyeOuter, MP.rEyeInner);
  const lOpen = eyeOpen(MP.lEyeTop, MP.lEyeBot, MP.lEyeOuter, MP.lEyeInner);
  const openScore  = clamp(10 * smooth01((rOpen + lOpen)/2, 0.18, 0.35), 0, 10);
  const matchScore = clamp(10 - Math.abs(rOpen - lOpen) * 80, 0, 10);
  const eyes = 0.65 * openScore + 0.35 * matchScore;

  // Skin: luma variance near the nose tip (low variance => smoother)
  let skin = 5.5;
  try {
    const ctx = canvas.getContext('2d');
    const cx = p[MP.noseTip].x, cy = p[MP.noseTip].y;
    const w = Math.max(20, faceW*0.30), h = Math.max(20, faceW*0.22);
    const x = Math.round(cx - w/2), y = Math.round(cy - h/2);
    const img = ctx.getImageData(
      clamp(x,0,canvas.width-1),
      clamp(y,0,canvas.height-1),
      Math.min(w, canvas.width - x),
      Math.min(h, canvas.height - y)
    );
    const L = new Float32Array(img.width * img.height);
    for (let i=0,j=0; i<img.data.length; i+=4, j++){
      const r=img.data[i], g=img.data[i+1], b=img.data[i+2];
      L[j] = 0.2126*r + 0.7152*g + 0.0722*b;
    }
    const mean = L.reduce((a,b)=>a+b,0)/L.length || 1;
    let varSum = 0; for (let v of L) varSum += (v-mean)*(v-mean);
    const variance = varSum/L.length;
    skin = clamp(10 - smoothMap(variance, 120, 950)*10, 0, 10);
  } catch {}

  // Balance: three easy harmony ratios
  const noseW  = dist(p[MP.noseL],  p[MP.noseR])  || 1;
  const mouthW = dist(p[MP.mouthL], p[MP.mouthR]) || 1;

  const rEyeW = dist(p[MP.rEyeOuter], p[MP.rEyeInner]) || 1;
  const lEyeW = dist(p[MP.lEyeOuter], p[MP.lEyeInner]) || 1;
  const eyeW  = (rEyeW + lEyeW) / 2;

  const inter = dist(p[MP.rEyeInner], p[MP.lEyeInner]) || 1;

  const lower = dist(p[MP.noseTip], p[MP.chin])      || 1;
  const mid   = dist(p[MP.glabella], p[MP.noseTip])  || 1;

  const r1 = mouthW / noseW;    // target ~1.6
  const r2 = inter  / eyeW;     // target ~1.0
  const r3 = lower  / mid;      // target ~1.15 (MP scale)

  const s1 = 10 - Math.min(10, Math.abs(r1 - 1.6)  * 8);
  const s2 = 10 - Math.min(10, Math.abs(r2 - 1.0) *10);
  const s3 = 10 - Math.min(10, Math.abs(r3 - 1.15)*12);

  const balance = clamp(0.4*s1 + 0.35*s2 + 0.25*s3, 0, 10);

  return { symmetry, jawline, eyes, skin, balance };
}

/* ---------- normalization with anchors ---------- */
function normalizeWithAnchors(raw, anchors){
  const toZ   = (v, mean, std) => (v - mean) / (std || 1);
  const toPct = (z) => clamp( 0.5 * (1 + erf(z/Math.SQRT2)) * 10, 0, 10 );
  const out = {};
  for (const k of ['symmetry','jawline','eyes','skin','balance']){
    const a = anchors[k] || { mean:6, std:1.4 };
    out[k] = toPct(toZ(raw[k], a.mean, a.std));
  }
  return out;
}

/* ---------- pose penalty (roll + yaw) ---------- */
function posePenalty(lm){
  const L = lm[MP.rEyeOuter], R = lm[MP.lEyeOuter];
  const eyeDX = R.x - L.x, eyeDY = R.y - L.y;
  const roll = Math.abs(Math.atan2(eyeDY, eyeDX) * 180/Math.PI);

  const midEye = { x:(lm[MP.rEyeInner].x + lm[MP.lEyeInner].x)/2,
                   y:(lm[MP.rEyeInner].y + lm[MP.lEyeInner].y)/2 };
  const eyeDist = Math.hypot(eyeDX, eyeDY) || 1;
  const yaw = Math.abs((lm[MP.noseTip].x - midEye.x)/eyeDist) * 60;

  return clamp((smooth(roll,5,22) + smooth(yaw,8,26))/2, 0, 1);
}

/* ---------- small math ---------- */
function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
function angleAt(p,a,b){ const v1={x:a.x-p.x,y:a.y-p.y}, v2={x:b.x-p.x,y:b.y-p.y};
  const dot=v1.x*v2.x+v1.y*v2.y, m1=Math.hypot(v1.x,v1.y), m2=Math.hypot(v2.x,v2.y);
  return Math.acos(clamp(dot/((m1*m2)||1),-1,1)); }
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function smooth(v, ok, bad){ if (v<=ok) return 0; if (v>=bad) return 1; const t=(v-ok)/(bad-ok); return t*t*(3-2*t); }
function smooth01(v,a,b){ if (v<=a) return 0; if (v>=b) return 1; const t=(v-a)/(b-a); return t*t*(3-2*t); }
function smoothMap(v,a,b){ if (v<=a) return 0; if (v>=b) return 1; const t=(v-a)/(b-a); return t*t*(3-2*t); }
function erf(x){ const s=Math.sign(x); x=Math.abs(x);
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const t=1/(1+p*x); const y=1-((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t*Math.exp(-x*x); return s*y; }
