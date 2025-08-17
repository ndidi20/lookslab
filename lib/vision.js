// lib/vision.js
import * as faceapi from 'face-api.js';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';

let ready = false;

/** One-time init of TF backend + models */
export async function ensureVisionReady() {
  if (ready) return true;

  try {
    // Try fast WebGL, fall back to CPU
    try { await tf.setBackend('webgl'); } catch { await tf.setBackend('cpu'); }
    await tf.ready();

    const URL = '/models';
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(URL),
    ]);

    ready = true;
    return true;
  } catch (err) {
    console.error('Vision init failed:', err);
    ready = false;
    throw err;
  }
}

/** Detect a single face + landmarks from a canvas (or image/vid/canvas) */
export async function detectSingleLandmarks(inputCanvas) {
  const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.15 });
  const det = await faceapi.detectSingleFace(inputCanvas, opts).withFaceLandmarks();
  return det?.landmarks ?? null;
}

/** Draw an element to a canvas with contain fit (no stretch) */
export function drawContainToCanvas(sourceEl, W = 640, H = 800) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, W, H);

  const iw = sourceEl.naturalWidth || sourceEl.videoWidth || sourceEl.width || W;
  const ih = sourceEl.naturalHeight || sourceEl.videoHeight || sourceEl.height || H;
  const scale = Math.min(W / iw, H / ih);
  const w = Math.round(iw * scale);
  const h = Math.round(ih * scale);
  const dx = Math.round((W - w) / 2);
  const dy = Math.round((H - h) / 2);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceEl, dx, dy, w, h);

  return c;
}
