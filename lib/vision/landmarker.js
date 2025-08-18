// lib/vision/landmarker.js
let _singleton = null;
let _vision = null;

function basePath() {
  // Works with Next.js basePath/assetPrefix and Netlify subpaths
  if (typeof window === 'undefined') return '';
  const el = document.querySelector('base[href]');
  if (el?.href) try { return new URL(el.href).pathname.replace(/\/$/, ''); } catch {}
  return (window.__NEXT_DATA__?.assetPrefix || '').replace(/\/$/, '');
}

async function resolveFileset(vision) {
  // WASM lives under /public/mediapipe/wasm
  const wasmRoot = `${basePath()}/mediapipe/wasm`;
  return await vision.FilesetResolver.forVisionTasks(wasmRoot);
}

async function tryCreate(FaceLandmarker, fileset, opts) {
  try {
    return await FaceLandmarker.createFromOptions(fileset, opts);
  } catch {
    return null;
  }
}

async function fetchAsBuffer(url) {
  const r = await fetch(url, { cache: 'force-cache' });
  if (!r.ok) throw new Error(`fetch failed ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

export async function getFaceLandmarker() {
  if (_singleton) return _singleton;
  if (!_vision) _vision = await import('@mediapipe/tasks-vision');
  const { FaceLandmarker } = _vision;

  const fileset = await resolveFileset(_vision);

  // Candidate model URLs (local → Google CDN → jsDelivr)
  const local = `${basePath()}/mediapipe/face_landmarker.task`;
  const gcdn  = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  const jsd   = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.10/wasm/face_landmarker.task';

  // 1) Try local modelAssetPath (if you later add the file)
  _singleton = await tryCreate(FaceLandmarker, fileset, {
    baseOptions: { modelAssetPath: local },
    runningMode: 'IMAGE',
    numFaces: 1,
    outputFaceBlendshapes: false,
  });
  if (_singleton) return _singleton;

  // 2) Try Google CDN
  _singleton = await tryCreate(FaceLandmarker, fileset, {
    baseOptions: { modelAssetPath: gcdn },
    runningMode: 'IMAGE',
    numFaces: 1,
    outputFaceBlendshapes: false,
  });
  if (_singleton) return _singleton;

  // 3) Try jsDelivr
  _singleton = await tryCreate(FaceLandmarker, fileset, {
    baseOptions: { modelAssetPath: jsd },
    runningMode: 'IMAGE',
    numFaces: 1,
    outputFaceBlendshapes: false,
  });
  if (_singleton) return _singleton;

  // 4) Last resort: fetch as ArrayBuffer and pass buffer directly
  const buf = await fetchAsBuffer(gcdn).catch(() => fetchAsBuffer(jsd));
  _singleton = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetBuffer: buf },
    runningMode: 'IMAGE',
    numFaces: 1,
    outputFaceBlendshapes: false,
  });
  return _singleton;
}

/** Return first face as { positions:[{x,y}…] } in pixel coords of the element */
export async function detectSingleFace(element) {
  const lm = await (await getFaceLandmarker()).detect(element);
  if (!lm?.faceLandmarks?.length) return null;

  const w = element.width ?? element.naturalWidth ?? element.videoWidth;
  const h = element.height ?? element.naturalHeight ?? element.videoHeight;
  const pts = lm.faceLandmarks[0].map(p => ({ x: p.x * w, y: p.y * h }));
  return { positions: pts };
}
