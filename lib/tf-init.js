// lib/tf-init.js
export async function ensureTfReady() {
  if (typeof window === 'undefined') return;

  // Load the exact same TFJS instance face-api.js will use
  const tf = await import('@tensorflow/tfjs-core');
  await import('@tensorflow/tfjs-backend-webgl');
  await import('@tensorflow/tfjs-backend-cpu');

  // Choose backend: try WebGL, fall back to CPU
  try { await tf.setBackend('webgl'); } catch {}
  try { await tf.ready(); } catch {}
  if (tf.getBackend?.() !== 'webgl') {
    try { await tf.setBackend('cpu'); await tf.ready(); } catch {}
  }
}
