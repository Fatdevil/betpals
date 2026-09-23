import test from 'node:test';
import assert from 'node:assert/strict';

import {
  runGolfSwingPipeline,
  normalizeFrame,
  normalizeVideoFrames,
  unmirrorX,
  smooth1D,
  extractKinematicSignals,
  detectSwingEvents,
  calculateBiomechanics,
  detectSlowmoProfile,
  scaleEventTimestamps,
  estimatePhysicalSpeeds,
  JOINTS
} from '../src/golf/index.js';

/**
 * Helper to generate a synthetic full-body BlazePose frame (33 landmarks).
 */
function createSyntheticFrame({ wristX = 0.5, wristY = 0.65, noseX = 0.5, noseY = 0.25, isLeftie = false } = {}) {
  const frame = new Array(33);
  for (let i = 0; i < 33; i++) {
    frame[i] = { x: 0.5, y: 0.5, z: 0, visibility: 0.99 };
  }

  // Head
  frame[JOINTS.NOSE] = { x: noseX, y: noseY, z: 0, visibility: 1.0 };

  // Shoulders (width = 0.16)
  const shoulderY = 0.35;
  frame[JOINTS.LEFT_SHOULDER] = { x: 0.58, y: shoulderY, z: -0.05, visibility: 1.0 };
  frame[JOINTS.RIGHT_SHOULDER] = { x: 0.42, y: shoulderY, z: 0.05, visibility: 1.0 };

  // Hips
  const hipY = 0.55;
  frame[JOINTS.LEFT_HIP] = { x: 0.55, y: hipY, z: -0.03, visibility: 1.0 };
  frame[JOINTS.RIGHT_HIP] = { x: 0.45, y: hipY, z: 0.03, visibility: 1.0 };

  // Knees
  frame[JOINTS.LEFT_KNEE] = { x: 0.56, y: 0.72, z: 0, visibility: 0.95 };
  frame[JOINTS.RIGHT_KNEE] = { x: 0.44, y: 0.72, z: 0, visibility: 0.95 };

  // Ankles
  frame[JOINTS.LEFT_ANKLE] = { x: 0.57, y: 0.88, z: 0, visibility: 0.95 };
  frame[JOINTS.RIGHT_ANKLE] = { x: 0.43, y: 0.88, z: 0, visibility: 0.95 };

  // Arms & Wrists
  // Left arm (lead arm for rightie)
  frame[JOINTS.LEFT_ELBOW] = { x: (0.58 + wristX) / 2, y: (shoulderY + wristY) / 2, z: 0, visibility: 0.95 };
  frame[JOINTS.LEFT_WRIST] = { x: wristX, y: wristY, z: 0, visibility: 0.95 };

  // Right arm (trail arm for rightie)
  frame[JOINTS.RIGHT_ELBOW] = { x: (0.42 + wristX) / 2, y: (shoulderY + wristY) / 2, z: 0, visibility: 0.95 };
  frame[JOINTS.RIGHT_WRIST] = { x: wristX - 0.02, y: wristY + 0.01, z: 0, visibility: 0.95 };

  return frame;
}

/**
 * Generates a synthetic swing sequence across N frames.
 * Follows classic golf kinematic arc:
 * - Address: ~15% of frames
 * - Backswing: ~45% of frames
 * - Top (P4): Global minimum of wrist Y (~60% mark)
 * - Downswing: ~15% of frames
 * - Impact (P7): Lowest point / speed peak (~75% mark)
 * - Follow-through & Finish: remaining 25%
 */
function generateSyntheticSwingSequence(totalFrames = 100, isLeftie = false) {
  const frames = [];

  const p4Target = Math.floor(totalFrames * 0.60);
  const p7Target = Math.floor(totalFrames * 0.75);

  for (let f = 0; f < totalFrames; f++) {
    let wristX = 0.50;
    let wristY = 0.68; // Address height

    if (f < totalFrames * 0.15) {
      // Address - stationary with tiny noise
      wristX = 0.50 + Math.sin(f) * 0.002;
      wristY = 0.68 + Math.cos(f) * 0.002;
    } else if (f <= p4Target) {
      // Backswing: hands rise from 0.68 up to 0.22 at Top
      const progress = (f - totalFrames * 0.15) / (p4Target - totalFrames * 0.15);
      wristY = 0.68 - progress * 0.46; // drops from 0.68 to 0.22 (upward in image)
      wristX = 0.50 - progress * 0.25; // moves to right/away
    } else if (f <= p7Target) {
      // Downswing: hands drop rapidly from 0.22 down to 0.70 at Impact
      const progress = (f - p4Target) / (p7Target - p4Target);
      wristY = 0.22 + progress * 0.48; // down to 0.70 (lowest point near ball)
      wristX = 0.25 + progress * 0.26; // back to center
    } else {
      // Follow-through & finish: hands rise again up to 0.28
      const progress = (f - p7Target) / (totalFrames - 1 - p7Target);
      wristY = 0.70 - progress * 0.42; // up to 0.28
      wristX = 0.51 + progress * 0.24; // through to lead side
    }

    if (isLeftie) {
      // For lefties, mirror X in raw synthetic video
      wristX = 1.0 - wristX;
    }

    frames.push(createSyntheticFrame({ wristX, wristY }));
  }

  return { frames, p4Expected: p4Target, p7Expected: p7Target };
}

test('Leftie Normalizer: mirrors X coordinates and swaps symmetrical joint pairs', () => {
  const rawRightie = createSyntheticFrame({ wristX: 0.35, wristY: 0.40 });
  
  // Create a Leftie frame where left and right wrists are swapped
  const rawLeftie = rawRightie.map(pt => ({ ...pt, x: 1.0 - pt.x }));
  // Leftie's lead arm is right arm
  const origLeftWristX = rawLeftie[JOINTS.LEFT_WRIST].x;
  const origRightWristX = rawLeftie[JOINTS.RIGHT_WRIST].x;

  const normalized = normalizeFrame(rawLeftie, true);

  // X coordinate must be mirrored back: 1.0 - x
  // AND the joints 15 and 16 must be swapped
  assert.equal(normalized[JOINTS.LEFT_WRIST].x, Number((1.0 - origRightWristX).toFixed(6)));
  assert.equal(normalized[JOINTS.RIGHT_WRIST].x, Number((1.0 - origLeftWristX).toFixed(6)));

  // Test unmirrorX
  assert.equal(unmirrorX(0.2, true), 0.8);
  assert.equal(unmirrorX(0.2, false), 0.2);
});

test('Signal Filter: smooths noise and calculates kinematic velocity', () => {
  const noisy = [0.1, 0.12, 0.50, 0.11, 0.13, 0.12, 0.14]; // 0.50 is an isolated spike
  const smoothed = smooth1D(noisy, 2);

  assert.equal(smoothed.length, noisy.length);
  // Spike at index 2 should be dampened significantly
  assert.ok(smoothed[2] < 0.40, 'Spike at index 2 should be smoothed down');

  const { frames } = generateSyntheticSwingSequence(80, false);
  const signals = extractKinematicSignals(frames);

  assert.equal(signals.n, 80);
  assert.equal(signals.wristY.length, 80);
  assert.equal(signals.wristSpeed.length, 80);
  assert.ok(signals.shoulderDist > 0.10, 'Shoulder distance should be positive');
  assert.ok(signals.torsoHeight > 0.15, 'Torso height should be positive');
});

test('Slowmo Scaler: detects 240 fps and 120 fps high-speed profiles', () => {
  // 365 frames over 24.4s (matching user's video exactly)
  const profile365 = detectSlowmoProfile(365, 24.4);
  assert.equal(profile365.isSlowmo, true);
  assert.equal(profile365.recordingFps, 240);
  assert.ok(profile365.slowmoFactor > 5.0, 'Slowmo factor should be ~8x or greater');

  // Explicit user override
  const manualProfile = detectSlowmoProfile(120, 4.0, { recordingFps: 120 });
  assert.equal(manualProfile.recordingFps, 120);
  assert.equal(manualProfile.detectionMode, 'MANUAL_OVERRIDE');

  // Normal 30 fps video
  const normalProfile = detectSlowmoProfile(45, 1.5);
  assert.equal(normalProfile.isSlowmo, false);
});

test('Swing Event Detector: identifies all 10 swing phases (P1–P10) in chronological order', () => {
  const { frames, p4Expected, p7Expected } = generateSyntheticSwingSequence(100, false);
  const signals = extractKinematicSignals(frames);
  const eventResult = detectSwingEvents(signals, { fps: 30, recordingFps: 30 });

  assert.equal(eventResult.success, true);
  const { P1, P2, P3, P4, P5, P6, P7, P8, P9, P10 } = eventResult.events;

  assert.ok(P1 && P2 && P3 && P4 && P5 && P6 && P7 && P8 && P9 && P10, 'All 10 phases must exist');

  // Verify chronological ordering
  assert.ok(P1.frameIndex <= P2.frameIndex, 'P1 <= P2');
  assert.ok(P2.frameIndex < P3.frameIndex, 'P2 < P3');
  assert.ok(P3.frameIndex <= P4.frameIndex, 'P3 <= P4');
  assert.ok(P4.frameIndex < P5.frameIndex, 'P4 < P5');
  assert.ok(P5.frameIndex <= P6.frameIndex, 'P5 <= P6');
  assert.ok(P6.frameIndex <= P7.frameIndex, 'P6 <= P7');
  assert.ok(P7.frameIndex < P8.frameIndex, 'P7 < P8');
  assert.ok(P8.frameIndex <= P9.frameIndex, 'P8 <= P9');
  assert.ok(P9.frameIndex <= P10.frameIndex, 'P9 <= P10');

  // Verify detected Top (P4) and Impact (P7) match synthetic expected targets within tight tolerance
  assert.ok(Math.abs(P4.frameIndex - p4Expected) <= 2, `P4 frame ${P4.frameIndex} should match expected ${p4Expected}`);
  assert.ok(Math.abs(P7.frameIndex - p7Expected) <= 3, `P7 frame ${P7.frameIndex} should match expected ${p7Expected}`);
});

test('Biomechanics: calculates tempo, lead arm angle, and head stability without nulls', () => {
  const { frames } = generateSyntheticSwingSequence(100, false);
  const signals = extractKinematicSignals(frames);
  const eventResult = detectSwingEvents(signals, { fps: 30, recordingFps: 30 });
  const bio = calculateBiomechanics(frames, eventResult, signals);

  assert.equal(bio.success, true);
  assert.ok(bio.tempo, 'Tempo must exist');
  assert.ok(bio.tempo.ratioValue > 0, 'Tempo ratio must be positive');
  assert.ok(typeof bio.leadArm.angleTopDeg === 'number', 'Lead arm angle at top must be a number');
  assert.ok(typeof bio.leadArm.angleImpactDeg === 'number', 'Lead arm angle at impact must be a number');
  assert.ok(typeof bio.headStability.maxDisplacementRatio === 'number', 'Head displacement must be a number');
  assert.ok(typeof bio.xFactor.xFactorDeg === 'number', 'X-Factor must be a number');
  assert.ok(typeof bio.finishBalance.score === 'number', 'Finish balance score must be a number');
});

test('End-to-End Pipeline: seamlessly handles 365-frame Left-handed Slow-Motion Video', () => {
  // Simulates the user's exact scenario from the debug console:
  // 365 frames, 24.4 seconds duration, left-handed golfer
  const { frames } = generateSyntheticSwingSequence(365, true);

  const report = runGolfSwingPipeline(frames, {
    isLeftie: true,
    fps: 15,
    recordingFps: 240,
    videoDurationSec: 24.4,
    golferHeightMeters: 1.82
  });

  assert.equal(report.success, true);
  assert.equal(report.summary.handedness, 'LEFT_HANDED');
  assert.equal(report.summary.isSlowmo, true);
  assert.equal(report.summary.totalFrames, 365);
  assert.equal(report.summary.recordingFps, 240);

  // Keyframes verification
  const { address, top, impact, finish } = report.keyFrames;
  assert.ok(address < top, 'Address must precede Top');
  assert.ok(top < impact, 'Top must precede Impact');
  assert.ok(impact < finish, 'Impact must precede Finish');

  // Verify all 10 events exist in eventList
  assert.equal(report.eventList.length, 10);

  // Verify real-world timestamps vs container timestamps
  const impactEvent = report.events['IMPACT_PROXY'];
  assert.ok(impactEvent, 'IMPACT_PROXY event must exist');
  assert.ok(impactEvent.containerTimeSec > 10.0, 'In 24.4s video, impact happens after 10s');
  assert.ok(impactEvent.realWorldTimeSec < 2.0, 'In physical real time (240fps), impact happens within 1.5s');

  // Verify physical speeds
  assert.ok(report.speeds.handSpeedKmh > 10, 'Hand speed at impact should be realistic');
  assert.ok(report.speeds.clubSpeedKmh > report.speeds.handSpeedKmh, 'Club speed should exceed hand speed');

  // Verify biomechanics is fully populated
  assert.ok(report.biomechanics.tempo.ratioValue > 0);
  assert.ok(report.biomechanics.leadArm.angleTopDeg >= 120);
  assert.ok(report.biomechanics.headStability.rating.length > 0);
  assert.ok(report.biomechanics.finishBalance.score > 0);
});
