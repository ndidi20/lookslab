// One TFJS/face-api init shared by Scan + Studio
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';
import * as faceapi from 'face-api.js';

let ready = false;
let initError = null;

/** Load TF backend once + the two face-api models from /public/models */
export async function ensureVisionReady() {
  if (ready) return true;
  try {
    try { await tf.setBackend('webgl'); } catch { await tf.setBackend('cpu'); }
    await tf.ready();

    const URL = '/models';
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(URL),
    ]);

    ready = true;
    return true;
  } catch (e) {
    initError = e?.message || 'Model init failed';
    throw e;
  }
}

export function getVisionError() {
  return initError;
}
