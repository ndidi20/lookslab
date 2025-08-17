// lib/vision.js
import * as faceapi from 'face-api.js';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';

let __ready = false;

export async function ensureVisionReady() {
  if (__ready) return true;
  try { await tf.setBackend('webgl'); } catch { await tf.setBackend('cpu'); }
  await tf.ready();

  const URL = '/models';
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(URL),
  ]);

  __ready = true;
  return true;
}

/** Draw an image into a canvas at contain-fit without stretching */
export function drawContainToCanvas(img, canvas, W = 640, H = 800) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'black'; ctx.fillRect(0, 0, W, H);
  const s = Math.min(W / img.width, H / img.height);
  const w = Math.round(img.width * s), h = Math.round(img.height * s);
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

/** Detect a single face and landmarks from a canvas */
export async function detectLandmarksFromCanvas(canvas) {
  return await faceapi
    .detectSingleFace(
      canvas,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.1 })
    )
    .withFaceLandmarks();
}
