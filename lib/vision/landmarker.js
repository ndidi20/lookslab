// Singleton loader for MediaPipe Face Landmarker (WASM + WebGL)
// Assets live under /public/mediapipe/*

let singleton;

export async function getFaceLandmarker() {
  if (singleton) return singleton;

  const vision = await import('@mediapipe/tasks-vision');
  const { FaceLandmarker, FilesetResolver } = vision;

  const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');

  singleton = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: '/mediapipe/face_landmarker.task' },
    runningMode: 'IMAGE',
    numFaces: 1,
    // loose but sane thresholds so we don't reject valid selfies
    minFaceDetectionConfidence: 0.2,
    minFacePresenceConfidence: 0.2,
    minTrackingConfidence: 0.2,
    // we don't need blendshapes — keeps everything lighter/faster
    outputFaceBlendshapes: false,
  });

  return singleton;
}
