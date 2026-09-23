/**
 * Golf Signal Filter & Feature Extractor
 * 
 * Extracts 1D kinematic trajectories from MediaPipe pose sequences and applies
 * noise-filtering and scale normalization.
 */

// Landmark constants
export const JOINTS = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28
};

/**
 * Safely extracts joint coordinates from either array format or named object format.
 */
export function getJoint(frame, indexOrName) {
  if (!frame) return null;
  if (Array.isArray(frame)) {
    const idx = typeof indexOrName === 'number' ? indexOrName : JOINTS[indexOrName];
    return frame[idx] || null;
  }
  if (typeof frame === 'object') {
    if (typeof indexOrName === 'string') {
      return frame[indexOrName] || null;
    }
    // Search by key
    for (const [key, val] of Object.entries(JOINTS)) {
      if (val === indexOrName && frame[key]) return frame[key];
    }
  }
  return null;
}

/**
 * Midpoint between two joints.
 */
export function getMidpoint(pt1, pt2) {
  if (!pt1 && !pt2) return null;
  if (!pt1) return pt2;
  if (!pt2) return pt1;
  return {
    x: (pt1.x + pt2.x) / 2,
    y: (pt1.y + pt2.y) / 2,
    z: ((pt1.z || 0) + (pt2.z || 0)) / 2,
    visibility: Math.min(pt1.visibility ?? 1, pt2.visibility ?? 1)
  };
}

/**
 * Applies a Gaussian / triangular weighted smoothing filter to a 1D number array.
 * @param {Array<number>} series - Raw 1D sequence
 * @param {number} radius - Half-window size (e.g. 2 for 5-tap kernel)
 * @returns {Array<number>} Smoothed sequence
 */
export function smooth1D(series, radius = 2) {
  const n = series.length;
  if (n <= radius * 2) return series.slice();

  const out = new Array(n);
  // Triangular weights, e.g. radius 2 -> [1, 2, 3, 2, 1]
  const kernel = [];
  let weightSum = 0;
  for (let i = -radius; i <= radius; i++) {
    const w = radius + 1 - Math.abs(i);
    kernel.push({ offset: i, weight: w });
    weightSum += w;
  }

  for (let i = 0; i < n; i++) {
    let acc = 0;
    let currentWeight = 0;
    for (const { offset, weight } of kernel) {
      const idx = i + offset;
      if (idx >= 0 && idx < n) {
        acc += series[idx] * weight;
        currentWeight += weight;
      }
    }
    out[i] = acc / (currentWeight > 0 ? currentWeight : 1);
  }
  return out;
}

/**
 * Extracts and smooths kinematic trajectory series across all frames.
 * @param {Array} frames - Sequence of normalized pose frames
 * @returns {Object} Kinematic signals (X, Y, Velocity, Scale)
 */
export function extractKinematicSignals(frames) {
  const n = frames.length;
  if (n === 0) {
    return {
      n: 0,
      wristY: [],
      wristX: [],
      wristSpeed: [],
      shoulderDist: 0.15,
      torsoHeight: 0.4
    };
  }

  const rawWristX = new Array(n);
  const rawWristY = new Array(n);
  const rawShoulderY = new Array(n);
  const rawHipX = new Array(n);
  const rawHipY = new Array(n);

  let totalShoulderDist = 0;
  let shoulderSamples = 0;
  let totalTorsoHeight = 0;
  let torsoSamples = 0;

  for (let f = 0; f < n; f++) {
    const frame = frames[f];
    const lw = getJoint(frame, JOINTS.LEFT_WRIST);
    const rw = getJoint(frame, JOINTS.RIGHT_WRIST);
    const ls = getJoint(frame, JOINTS.LEFT_SHOULDER);
    const rs = getJoint(frame, JOINTS.RIGHT_SHOULDER);
    const lh = getJoint(frame, JOINTS.LEFT_HIP);
    const rh = getJoint(frame, JOINTS.RIGHT_HIP);

    const wrist = getMidpoint(lw, rw) || lw || rw || { x: 0.5, y: 0.5 };
    const shoulder = getMidpoint(ls, rs) || ls || rs || { x: 0.5, y: 0.3 };
    const hip = getMidpoint(lh, rh) || lh || rh || { x: 0.5, y: 0.6 };

    rawWristX[f] = wrist.x;
    rawWristY[f] = wrist.y;
    rawShoulderY[f] = shoulder.y;
    rawHipX[f] = hip.x;
    rawHipY[f] = hip.y;

    if (ls && rs) {
      const dx = ls.x - rs.x;
      const dy = ls.y - rs.y;
      totalShoulderDist += Math.sqrt(dx * dx + dy * dy);
      shoulderSamples++;
    }
    if (shoulder && hip) {
      const dy = Math.abs(hip.y - shoulder.y);
      totalTorsoHeight += dy;
      torsoSamples++;
    }
  }

  const shoulderDist = shoulderSamples > 0 ? (totalShoulderDist / shoulderSamples) : 0.15;
  const torsoHeight = torsoSamples > 0 ? (totalTorsoHeight / torsoSamples) : 0.4;

  // Adaptive smoothing window depending on total frame count:
  // For 365 frames slomo, radius 3-4 (7-9 tap filter) prevents false micro-peaks.
  const smoothRadius = n > 180 ? 4 : (n > 60 ? 3 : 2);

  const wristX = smooth1D(rawWristX, smoothRadius);
  const wristY = smooth1D(rawWristY, smoothRadius);
  const shoulderY = smooth1D(rawShoulderY, smoothRadius);
  const hipX = smooth1D(rawHipX, smoothRadius);
  const hipY = smooth1D(rawHipY, smoothRadius);

  // Compute frame-by-frame velocity: V = sqrt(dx^2 + dy^2)
  const rawSpeed = new Array(n);
  rawSpeed[0] = 0;
  for (let f = 1; f < n; f++) {
    const dx = wristX[f] - wristX[f - 1];
    const dy = wristY[f] - wristY[f - 1];
    rawSpeed[f] = Math.sqrt(dx * dx + dy * dy);
  }
  const wristSpeed = smooth1D(rawSpeed, smoothRadius);

  return {
    n,
    wristX,
    wristY,
    wristSpeed,
    shoulderY,
    hipX,
    hipY,
    shoulderDist,
    torsoHeight
  };
}
