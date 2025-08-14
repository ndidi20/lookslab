// lib/scoring.js
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const round1 = (x) => Math.round(x * 10) / 10;
const dist = (i, j, pts) => {
  const A = pts[i], B = pts[j];
  return Math.hypot(A.x - B.x, A.y - B.y);
};

export function symmetryScore(pts){
  const mid = pts[1]; let s=0,n=0;
  const pairs = [[234,454],[93,323],[226,446],[159,386],[145,374],[133,362],[61,291]];
  const L=pts[234],R=pts[454]; const w=Math.hypot(L.x-R.x,L.y-R.y)||1;
  for (const [a,b] of pairs) { const A=pts[a],B=pts[b]; s+=Math.abs(Math.abs(A.x-mid.x)-Math.abs(B.x-mid.x)); n++; }
  const diff=(s/n)/w; return clamp(10 - diff*58, 1, 10);
}
export function thirdsScore(pts){
  const hair=pts[10], brow=pts[105], base=pts[2], chin=pts[152];
  const t1=Math.hypot(hair.y-brow.y,hair.x-brow.x);
  const t2=Math.hypot(brow.y-base.y,brow.x-base.x);
  const t3=Math.hypot(base.y-chin.y,base.x-chin.x);
  const mu=(t1+t2+t3)/3, r=(Math.abs(t1-mu)+Math.abs(t2-mu)+Math.abs(t3-mu))/(3*(mu||1));
  return clamp(10 - r*43, 1, 10);
}
export function eyesScore(pts){
  const lw=dist(33,133,pts), rw=dist(362,263,pts), la=dist(159,145,pts), ra=dist(386,374,pts);
  const aw=(la/lw + ra/rw)/2;
  const L=pts[33], R=pts[263]; const tilt=Math.atan2(R.y-L.y, R.x-L.x);
  const awS=10 - Math.abs(aw - 0.40)*48; const tiltS=10 - Math.abs(tilt - 0.02)*330;
  return clamp(awS*0.6 + tiltS*0.4, 1, 10);
}
export function jawScore(pts){
  const A=pts[234], B=pts[152], C=pts[454];
  const v1={x:A.x-B.x,y:A.y-B.y}, v2={x:C.x-B.x,y:C.y-B.y};
  const dot=v1.x*v2.x+v1.y*v2.y, m1=Math.hypot(v1.x,v1.y), m2=Math.hypot(v2.x,v2.y);
  const deg=Math.acos(Math.max(-1,Math.min(1,dot/(m1*m2))))*180/Math.PI;
  return clamp(10 - ((deg-40)/(120-40))*9, 1, 10);
}
export function hairlineScore(pts){
  const hair=pts[10], brow=pts[105], chin=pts[152];
  const f=Math.hypot(hair.y-brow.y,hair.x-brow.x), face=Math.hypot(hair.y-chin.y,hair.x-chin.x);
  const ratio=f/(face||1);
  return clamp(10 - Math.abs(ratio - 0.30)*115, 1, 10);
}

export function computeScores(pts){
  if (!pts || pts.length < 468) throw new Error('NO_FACE');
  const categories={
    eyes: eyesScore(pts),
    jaw: jawScore(pts),
    symmetry: symmetryScore(pts),
    skin: 7.8, // placeholder until we add a real skin metric
    proportions: thirdsScore(pts),
    hairline: hairlineScore(pts),
  };
  const w={eyes:.22,jaw:.20,symmetry:.18,skin:.18,proportions:.18,hairline:.04};
  let overall=0; for(const k in categories) overall += categories[k]*(w[k]||0);
  const potential = clamp(
    overall +
      ((10-categories.skin)/10)*0.8 +
      ((10-categories.jaw)/10)*0.8 +
      ((10-categories.eyes)/10)*0.24 +
      ((10-categories.hairline)/10)*0.4,
    1, 10
  );
  return { categories, overall: round1(overall), potential: round1(potential) };
}

export function tipsFrom(res){
  const x=res.categories, tips=[];
  if(x.skin<8) tips.push('SPF daily + gentle cleanser + retinoid 3x/week.');
  if(x.jaw<8) tips.push('Small deficit, protein ≥0.7g/lb, posture work.');
  if(x.eyes<8) tips.push('Groom brows, fix sleep, reduce blue light pre‑bed.');
  if(x.hairline<8) tips.push('Mid/low fade + textured top for balance.');
  if(x.proportions<8) tips.push('Add hair volume; light stubble to balance thirds.');
  if(x.symmetry<8) tips.push('Mobility/posture; avoid always sleeping on one side.');
  if(!tips.length) tips.push('Dialed. Maintain skincare + sleep + trims every 3–4 weeks.');
  return tips;
}
