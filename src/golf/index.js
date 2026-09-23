/**
 * Golf Swing Analysis Pipeline (Entry Point)
 * 
 * Provides an end-to-end robust pipeline for analyzing golf swings from MediaPipe BlazePose
 * landmark sequences, with full native support for:
 * - Slow-motion video recordings (120 fps / 240 fps)
 * - Left-handed golfers (automatic mirroring & joint normalization)
 * - Frame-based topological P1–P10 event detection
 * - Scale-invariant biomechanics (tempo, head stability, lead arm angle, X-factor)
 */

import { normalizeVideoFrames } from './golfLeftieNormalizer.js';
import { extractKinematicSignals } from './golfSignalFilter.js';
import { detectSwingEvents, SWING_EVENTS } from './golfSwingEventDetector.js';
import { calculateBiomechanics } from './golfBiomechanicsMetrics.js';
import { detectSlowmoProfile, scaleEventTimestamps, estimatePhysicalSpeeds } from './golfSlowmoScaler.js';

export * from './golfLeftieNormalizer.js';
export * from './golfSignalFilter.js';
export * from './golfSwingEventDetector.js';
export * from './golfBiomechanicsMetrics.js';
export * from './golfSlowmoScaler.js';

/**
 * Runs the complete Golf Swing Analysis Pipeline.
 * 
 * @param {Array} rawFrames - Array of frame landmark outputs (MediaPipe BlazePose 33 joints)
 * @param {Object} options - Analysis options:
 *   - isLeftie: boolean (true if golfer is left-handed)
 *   - fps: number (container playback fps, default 30)
 *   - recordingFps: number (camera capture rate, e.g. 120 or 240)
 *   - videoDurationSec: number (total container video duration)
 *   - golferHeightMeters: number (height for velocity scaling, default 1.78)
 * @returns {Object} Complete swing analysis report
 */
export function runGolfSwingPipeline(rawFrames, options = {}) {
  const n = Array.isArray(rawFrames) ? rawFrames.length : 0;
  if (n === 0) {
    return {
      success: false,
      error: 'NO_FRAMES_PROVIDED',
      message: 'Inga bildrutor mottogs för svinganalys.'
    };
  }

  const isLeftie = Boolean(options.isLeftie);
  const videoDurationSec = options.videoDurationSec || (options.fps ? n / options.fps : 0);

  // 1. Handedness Normalization
  // Standardize left-handers to canonical right-hand model
  const normalizedFrames = normalizeVideoFrames(rawFrames, isLeftie);

  // 2. Kinematic Signal Extraction & Adaptive Smoothing
  const signals = extractKinematicSignals(normalizedFrames);

  // 3. Slow-Motion Profile Detection
  const slowmoProfile = detectSlowmoProfile(n, videoDurationSec, options);

  // 4. Swing Event Detection (P1 to P10)
  const rawEvents = detectSwingEvents(signals, {
    fps: slowmoProfile.containerFps,
    recordingFps: slowmoProfile.recordingFps
  });

  if (!rawEvents.success) {
    return {
      success: false,
      error: 'EVENT_DETECTION_FAILED',
      message: rawEvents.reason || 'Kunde inte identifiera svingens nyckelfaser.',
      slowmo: slowmoProfile,
      signals: { n: signals.n }
    };
  }

  // 5. Timestamp & Slowmo Scaling
  const scaledEvents = scaleEventTimestamps(rawEvents, slowmoProfile);

  // 6. Biomechanics Metrics Computation
  const biomechanics = calculateBiomechanics(normalizedFrames, scaledEvents, signals, options);

  // 7. Physical Speed Estimation
  const speeds = estimatePhysicalSpeeds(signals, scaledEvents.keyFrames, slowmoProfile, options.golferHeightMeters);

  // 8. Generate Summary & Diagnostics
  const keyFrames = scaledEvents.keyFrames;
  const p1 = keyFrames.address;
  const p4 = keyFrames.top;
  const p7 = keyFrames.impact;
  const p10 = keyFrames.finish;

  const realSwingDuration = Number(((p10 - p1) / slowmoProfile.recordingFps).toFixed(2));
  const containerSwingDuration = Number(((p10 - p1) / slowmoProfile.containerFps).toFixed(2));

  const summary = {
    handedness: isLeftie ? 'LEFT_HANDED' : 'RIGHT_HANDED',
    isSlowmo: slowmoProfile.isSlowmo,
    recordingFps: slowmoProfile.recordingFps,
    containerFps: slowmoProfile.containerFps,
    totalFrames: n,
    realSwingDurationSec: realSwingDuration,
    containerSwingDurationSec: containerSwingDuration,
    tempo: biomechanics.tempo ? biomechanics.tempo.ratio : 'N/A',
    tempoRating: biomechanics.tempo ? biomechanics.tempo.evaluation : 'N/A',
    estimatedHandSpeedKmh: speeds.handSpeedKmh,
    estimatedClubSpeedKmh: speeds.clubSpeedKmh
  };

  return {
    success: true,
    summary,
    keyFrames,
    events: scaledEvents.events,
    eventList: scaledEvents.list,
    biomechanics,
    speeds,
    slowmo: slowmoProfile,
    signals: {
      n: signals.n,
      shoulderDist: signals.shoulderDist,
      torsoHeight: signals.torsoHeight
    }
  };
}
