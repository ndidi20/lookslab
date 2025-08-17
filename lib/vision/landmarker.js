// Singleton loader for MediaPipe Face Landmarker via CDN (no /public assets required)

let singleton;

export async function getFaceLandmarker() {
  if (singleton) return singleton;

  // Pin to a known-good version
  const VISION_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm';
  const MODEL_URL  = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';

  const vision = await import('@mediapipe/tasks-vision');
  const { FaceLandmarker, FilesetResolver } = vision;

  const fileset = await FilesetResolver.forVisionTasks(VISION_CDN);

  singleton = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL },
    runningMode: 'IMAGE',
    numFaces: 1,
    minFaceDetectionConfidence: 0.3,
    minFacePresenceConfidence: 0.3,
    minTrackingConfidence: 0.3,
    outputFaceBlendshapes: false,
  });

  return singleton;
}
