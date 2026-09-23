/**
 * Golf Slow-Motion Scaler & Real-World Kinematic Estimator
 * 
 * Accurately translates frame indices and video playback timestamps into real-world
 * physical time (seconds) and real-world kinematic velocities (km/h, mph).
 * 
 * Handles high-speed camera capture:
 * - 240 fps (e.g. iPhone 8x slow-motion)
 * - 120 fps (e.g. 4x slow-motion)
 * - 60 fps (smooth high-frame capture)
 * - 30 fps (standard broadcast / mobile)
 */

/**
 * Detects the slow-motion capture profile based on frame count, video duration,
 * and swing timing characteristics.
 * 
 * @param {number} totalFrames - Total number of analyzed frames
 * @param {number} containerDurationSec - Total playback duration in video container
 * @param {Object} options - User overrides (e.g. { recordingFps: 240 })
 * @returns {Object} Slow-motion profile
 */
export function detectSlowmoProfile(totalFrames, containerDurationSec = 0, options = {}) {
  const containerFps = containerDurationSec > 0
    ? (totalFrames / containerDurationSec)
    : (options.fps || 30);

  // If user explicitly specifies capture FPS
  if (options.recordingFps) {
    const recFps = Number(options.recordingFps);
    const slowmoFactor = recFps / Math.max(1, containerFps);
    return {
      isSlowmo: slowmoFactor > 1.25,
      recordingFps: recFps,
      containerFps: Number(containerFps.toFixed(2)),
      slowmoFactor: Number(slowmoFactor.toFixed(2)),
      confidence: 1.0,
      detectionMode: 'MANUAL_OVERRIDE'
    };
  }

  // Automatic heuristic detection:
  // Standard golf swing takes ~1.05s to 1.25s in real life (address to finish).
  // If video container has > 150 frames or lasts > 4.0 seconds for a single swing:
  let detectedRecFps = 30;
  let slowmoFactor = 1.0;
  let isSlowmo = false;
  let confidence = 0.85;

  if (totalFrames >= 280 || containerDurationSec >= 7.0) {
    // Highly characteristic of 240 fps slomo (or 120 fps stretched over > 10s)
    if (totalFrames >= 200 && containerDurationSec >= 15.0) {
      detectedRecFps = 240;
    } else {
      detectedRecFps = 120;
    }
    isSlowmo = true;
    slowmoFactor = detectedRecFps / (containerFps > 0 ? containerFps : 30);
  } else if (totalFrames >= 110 || containerDurationSec >= 3.5) {
    detectedRecFps = 120;
    isSlowmo = true;
    slowmoFactor = detectedRecFps / (containerFps > 0 ? containerFps : 30);
  } else if (totalFrames >= 55) {
    detectedRecFps = 60;
    isSlowmo = containerFps < 50;
    slowmoFactor = detectedRecFps / (containerFps > 0 ? containerFps : 30);
  }

  return {
    isSlowmo,
    recordingFps: detectedRecFps,
    containerFps: Number(containerFps.toFixed(2)),
    slowmoFactor: Number(slowmoFactor.toFixed(2)),
    confidence,
    detectionMode: 'AUTOMATIC_KINEMATIC'
  };
}

/**
 * Scales event timestamps into both container playback time and physical real-world seconds.
 * 
 * @param {Object} eventResult - Output from detectSwingEvents
 * @param {Object} profile - Output from detectSlowmoProfile
 * @returns {Object} Events enhanced with real-world time
 */
export function scaleEventTimestamps(eventResult, profile) {
  if (!eventResult || !eventResult.events) return eventResult;

  const { containerFps, recordingFps, slowmoFactor } = profile;
  const scaledList = [];
  const scaledEvents = {};

  for (const [key, ev] of Object.entries(eventResult.events)) {
    if (!ev || typeof ev.frameIndex !== 'number') continue;

    const fIdx = ev.frameIndex;
    const containerTimeSec = Number((fIdx / containerFps).toFixed(3));
    const realWorldTimeSec = Number((fIdx / recordingFps).toFixed(3));

    const enhanced = {
      ...ev,
      containerTimeSec,
      realWorldTimeSec,
      slowmoFactor
    };

    scaledEvents[key] = enhanced;
    if (ev.code && key === ev.code) {
      scaledList.push(enhanced);
    }
  }

  return {
    ...eventResult,
    events: scaledEvents,
    list: scaledList
  };
}

/**
 * Calculates physical speeds (km/h and mph) for hands and estimated clubhead at impact.
 * 
 * @param {Object} signals - Kinematic curves from extractKinematicSignals
 * @param {Object} keyFrames - Detected key swing frames
 * @param {Object} profile - Output from detectSlowmoProfile
 * @param {number} golferHeightMeters - Estimated or input golfer height
 * @returns {Object} Real-world speed estimations
 */
export function estimatePhysicalSpeeds(signals, keyFrames, profile, golferHeightMeters = 1.78) {
  const { wristSpeed, torsoHeight } = signals;
  const p7 = keyFrames ? keyFrames.impact : null;

  if (!wristSpeed || p7 === null || p7 === undefined || !wristSpeed[p7]) {
    return {
      handSpeedKmh: 0,
      handSpeedMph: 0,
      clubSpeedKmh: 0,
      clubSpeedMph: 0
    };
  }

  // Torso height is roughly 28-30% of total human standing height
  const estimatedTorsoRealMeters = golferHeightMeters * 0.29;
  const metersPerNormalizedUnit = torsoHeight > 0
    ? (estimatedTorsoRealMeters / torsoHeight)
    : 2.2;

  // Normalized displacement per frame at impact
  const deltaPerFrame = wristSpeed[p7];

  // Meters per second = (normalized units / frame) * (recording frames / sec) * (meters / unit)
  const handSpeedMs = deltaPerFrame * profile.recordingFps * metersPerNormalizedUnit;
  const handSpeedKmh = Number((handSpeedMs * 3.6).toFixed(1));
  const handSpeedMph = Number((handSpeedKmh * 0.621371).toFixed(1));

  // In a golf downswing, clubhead moves ~3.0 - 3.4x faster than the hands at impact due to shaft length and wrist uncocking
  const clubLeverRatio = 3.2;
  const clubSpeedKmh = Number((handSpeedKmh * clubLeverRatio).toFixed(1));
  const clubSpeedMph = Number((handSpeedMph * clubLeverRatio).toFixed(1));

  return {
    handSpeedMs: Number(handSpeedMs.toFixed(1)),
    handSpeedKmh,
    handSpeedMph,
    clubSpeedKmh,
    clubSpeedMph
  };
}
