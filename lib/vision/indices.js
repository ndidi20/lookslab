// lib/vision/indices.js
// MediaPipe Face Mesh landmark indices we need (468-point topology).

export const IDX = {
  // Eye corners (horizontal width)
  R_EYE_OUT: 33,  // subject's right eye outer corner (viewer left)
  R_EYE_IN : 133, // subject's right eye inner corner
  L_EYE_IN : 362, // subject's left eye inner corner
  L_EYE_OUT: 263, // subject's left eye outer corner

  // Lids (one top + one bottom for each eye) for openness
  R_EYE_TOP: 159,
  R_EYE_BOT: 145,
  L_EYE_TOP: 386,
  L_EYE_BOT: 374,

  // Nose (tip + alar left/right)
  NOSE_TIP: 1,
  NOSE_LEFT: 98,   // alar left
  NOSE_RIGHT: 327, // alar right

  // Mouth corners
  MOUTH_L: 61,
  MOUTH_R: 291,

  // Chin bottom + jaw corners (mandible angles)
  CHIN: 152,
  JAW_L: 234,
  JAW_R: 454,

  // A midline helper near glabella (bridge)
  MID_BRIDGE: 168,
};
