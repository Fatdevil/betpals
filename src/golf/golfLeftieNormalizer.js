/**
 * Golf Leftie Normalizer
 * 
 * Transforms left-handed golfer landmarks into a canonical right-handed model by:
 * 1. Mirroring the horizontal coordinate (x' = 1.0 - x)
 * 2. Swapping symmetrical left/right anatomical joints
 * 
 * This ensures all downstream swing detection, kinematics, and biomechanics
 * operate on an identical reference frame without duplicating logic.
 */

// Symmetrical landmark pairs in MediaPipe BlazePose (33 landmarks)
export const MEDIAPIPE_SYMMETRIC_PAIRS = [
  [1, 4],   // inner eye
  [2, 5],   // eye
  [3, 6],   // outer eye
  [7, 8],   // ear
  [9, 10],  // mouth
  [11, 12], // shoulder
  [13, 14], // elbow
  [15, 16], // wrist
  [17, 18], // pinky
  [19, 20], // index
  [21, 22], // thumb
  [23, 24], // hip
  [25, 26], // knee
  [27, 28], // ankle
  [29, 30], // heel
  [31, 32]  // foot index
];

const SWAP_MAP = new Map();
for (const [left, right] of MEDIAPIPE_SYMMETRIC_PAIRS) {
  SWAP_MAP.set(left, right);
  SWAP_MAP.set(right, left);
}

/**
 * Normalizes a single frame of landmarks.
 * @param {Array<Object>|Object} frameLandmarks - 33 MediaPipe landmarks or object map
 * @param {boolean} isLeftie - true if golfer is left-handed
 * @returns {Array<Object>|Object} Normalized landmarks
 */
export function normalizeFrame(frameLandmarks, isLeftie) {
  if (!isLeftie || !frameLandmarks) {
    return frameLandmarks;
  }

  // Handle standard array of 33 landmarks
  if (Array.isArray(frameLandmarks)) {
    const len = frameLandmarks.length;
    const mirrored = new Array(len);

    for (let i = 0; i < len; i++) {
      const targetIndex = SWAP_MAP.has(i) ? SWAP_MAP.get(i) : i;
      const source = frameLandmarks[targetIndex] || frameLandmarks[i];
      if (!source) {
        mirrored[i] = null;
        continue;
      }

      mirrored[i] = {
        ...source,
        x: typeof source.x === 'number' ? Number((1.0 - source.x).toFixed(6)) : source.x,
        y: source.y,
        z: source.z,
        visibility: source.visibility ?? source.score ?? 1.0
      };
    }
    return mirrored;
  }

  // Handle object-based landmark dictionary (e.g. { nose: {x,y}, leftWrist: {x,y}, ... })
  if (typeof frameLandmarks === 'object') {
    const mirrored = {};
    for (const [key, pt] of Object.entries(frameLandmarks)) {
      if (!pt || typeof pt !== 'object') continue;
      let targetKey = key;
      if (key.startsWith('left')) {
        targetKey = 'right' + key.slice(4);
      } else if (key.startsWith('right')) {
        targetKey = 'left' + key.slice(5);
      }
      const sourcePt = frameLandmarks[targetKey] || pt;
      mirrored[key] = {
        ...sourcePt,
        x: typeof sourcePt.x === 'number' ? Number((1.0 - sourcePt.x).toFixed(6)) : sourcePt.x,
        y: sourcePt.y,
        z: sourcePt.z,
        visibility: sourcePt.visibility ?? 1.0
      };
    }
    return mirrored;
  }

  return frameLandmarks;
}

/**
 * Normalizes an entire video sequence of frames.
 * @param {Array} frames - Array of frames
 * @param {boolean} isLeftie - Golfer handedness flag
 * @returns {Array} Normalized frames
 */
export function normalizeVideoFrames(frames, isLeftie) {
  if (!isLeftie || !Array.isArray(frames)) {
    return frames;
  }
  return frames.map(frame => normalizeFrame(frame, true));
}

/**
 * Maps a coordinate back to original video space for lefties (for drawing overlays).
 */
export function unmirrorX(x, isLeftie) {
  if (!isLeftie || typeof x !== 'number') return x;
  return Number((1.0 - x).toFixed(6));
}
