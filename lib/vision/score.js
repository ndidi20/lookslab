// Geometry → raw metrics → normalized (anchors) → final Overall/Potential
// As requested: Skin & Balance floored to 8 to avoid odd lows from lighting/cropping noise.

let _anchorsCache = null;
async function getAnchors(){
  if (_anchorsCache) return _anchorsCache;
  const res = await fetch('/anchors.json', { cache: 'no-store' });
  _anchorsCache = await res.json();
  return _anchorsCache;
}

export async function scoreOne(landmarks, canvas){
  const raw = computeRawMetrics(landmarks, canvas);
  const anchors = await getAnchors();
  const norm  = normalizeWithAnchors(raw, anchors);

  const base =
      0.28 * norm.symmetry +
      0.22 * norm.jawline +
      0.18 * norm.eyes +
      0.17 * norm.skin +
      0.15 * norm.balance;

  const pose = posePenalty(landmarks.positions);
  const overall   = clamp(base - pose * 0.9, 0, 10);
  const potential = clamp(overall + ((10 - overall) * 0.35) - pose * 0.3, 0, 10);

  return {
    overall,
    potential,
    breakdown: {
      symmetry: norm.symmetry,
      jawline : norm.jawline,
      eyes    : norm.eyes,
      skin    : norm.skin,
      balance : norm.balance,
    }
  };
}

/* ---------- raw metrics (0..10-ish) ---------- */
function computeRawMetrics(landmarks, canvas){
  const lm = landmarks.positions;
  const faceW = dist(lm[16], lm[0]) || 1;

  // Symmetry
  const midX = lm[27].x;
  const pairs = [[36,45],[39,42],[31,35],[48,54],[3,13]];
  let symErr = 0;
  for (const [a,b] of pairs){
    const da = Math.abs(midX - lm[a].x);
    const db = Math.abs(lm[b].x - midX);
    symErr += Math.abs(da - db);
  }
  const symmetry = clamp(10 - (symErr/faceW) * 40, 0, 10);

  // Jawline: angle at chin
  const chin = lm[8], left = lm[4], right = lm[12];
  const jawDeg = angleAt(chin, left, right) * 180/Math.PI;
  let jawline;
  if (jawDeg < 60) jawline = 6 + (jawDeg-60)*0.02;
  else if (jawDeg > 115) jawline = 6 - (jawDeg-115)*0.06;
  else jawline = 8 + (1 - Math.abs(jawDeg - 90)/20) * 2;
  jawline = clamp(jawline, 0, 10);

  // Eyes: openness + match
  const eyeOpen = (eye) => {
    const [t1,t2,b1,b2,L,R] = eye;
    const vertical = (dist(t1,b1)+dist(t2,b2))/2;
    const width = dist(L,R) || 1;
    return vertical/width;
  };
  const LE=[lm[37],lm[38],lm[41],lm[40],lm[36],lm[39]];
  const RE=[lm[43],lm[44],lm[47],lm[46],lm[42],lm[45]];
  const lo=eyeOpen(LE), ro=eyeOpen(RE);
  const openScore  = clamp(10 * smooth01((lo+ro)/2, 0.18, 0.35), 0, 10);
  const matchScore = clamp(10 - Math.abs(lo-ro)*80, 0, 10);
  const eyes = 0.65 * openScore + 0.35 * matchScore;

  // Skin: luma variance near nose
  let skin = 5.5;
  try {
    const ctx = canvas.getContext('2d');
    const cx = lm[33].x, cy = lm[33].y;
    const w = Math.max(20, faceW*0.35), h = Math.max(20, faceW*0.25);
    const x = Math.round(cx - w/2), y = Math.round(cy - h/3);
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
    let varSum=0; for (let v of L) varSum += (v-mean)*(v-mean);
    const variance = varSum/L.length;
    skin = clamp(10 - smoothMap(variance, 120, 950)*10, 0, 10);
  } catch {}

  // Balance: multi-ratio harmony
  const noseW  = dist(lm[31], lm[35]) || 1;
  const mouthW = dist(lm[48], lm[54]) || 1;
  const eyeW   = dist(lm[36], lm[39]) || 1;
  const inter  = dist(lm[39], lm[42]) || 1;
  const lower  = dist(lm[33], lm[8])  || 1;
  const mid    = dist(lm[27], lm[33]) || 1;

  const r1 = mouthW / noseW;     // sweet ~1.6
  const r2 = inter  / eyeW;      // sweet ~1.0
  const r3 = lower  / mid;       // sweet ~1.05

  const s1 = 10 - Math.min(10, Math.abs(r1 - 1.6) * 8);
  const s2 = 10 - Math.min(10, Math.abs(r2 - 1.0) *10);
  const s3 = 10 - Math.min(10, Math.abs(r3 - 1.05)*12);

  let balance = clamp(0.4*s1 + 0.35*s2 + 0.25*s3, 0, 10);

  return { symmetry, jawline, eyes, skin, balance };
}

/* ---------- normalization with anchors ---------- */
function normalizeWithAnchors(raw, anchors){
  const toZ = (v, mean, std) => (v - mean) / (std || 1);
  const toPct = (z) => clamp(0.5 * (1 + erf(z/Math.SQRT2)) * 10, 0, 10);

  const n = {};
  for (const k of ['symmetry','jawline','eyes','skin','balance']){
    const a = anchors[k] || { mean:5, std:1.5 };
    n[k] = toPct(toZ(raw[k], a.mean, a.std));
  }

  // floors requested
  n.skin    = Math.max(n.skin, 8.0);
  n.balance = Math.max(n.balance, 8.0);

  return n;
}

/* ---------- pose penalty ---------- */
function posePenalty(lm){
  const L=lm[36], R=lm[45];
  const eyeDX=R.x-L.x, eyeDY=R.y-L.y;
  const roll=Math.abs(Math.atan2(eyeDY,eyeDX)*180/Math.PI);
  const midEye={x:(L.x+R.x)/2,y:(L.y+R.y)/2};
  const nose=lm[33];
  const eyeDist=Math.hypot(eyeDX,eyeDY)||1;
  const yaw=Math.abs((nose.x-midEye.x)/eyeDist)*60;
  return clamp((smooth(roll,5,22)+smooth(yaw,8,26))/2,0,1);
}

/* ---------- math utils ---------- */
function angleAt(p,a,b){ const v1={x:a.x-p.x,y:a.y-p.y}, v2={x:b.x-p.x,y:b.y-p.y}; const dot=v1.x*v2.x+v1.y*v2.y; const m1=Math.hypot(v1.x,v1.y), m2=Math.hypot(v2.x,v2.y); return Math.acos(clamp(dot/((m1*m2)||1),-1,1)); }
function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function smooth(v, ok, bad){ if (v<=ok) return 0; if (v>=bad) return 1; const t=(v-ok)/(bad-ok); return t*t*(3-2*t); }
function smooth01(v, a, b){ if (v<=a) return 0; if (v>=b) return 1; const t=(v-a)/(b-a); return t*t*(3-2*t); }
function smoothMap(v,a,b){ if (v<=a) return 0; if (v>=b) return 1; const t=(v-a)/(b-a); return t*t*(3-2*t); }
function erf(x){ const sgn=Math.sign(x); x=Math.abs(x); const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911; const t=1/(1+p*x); const y=1-((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t*Math.exp(-x*x); return sgn*y; }
