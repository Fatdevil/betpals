/**
 * Golf Biomechanics Metrics Calculator
 * 
 * Computes essential biomechanical indicators from normalized golf swing landmark sequences
 * and detected P1–P10 swing events:
 * 
 * 1. Tempo Ratio (Backswing : Downswing frame ratio, e.g. 3.0:1)
 * 2. Head Movement & Stability (Lateral & vertical head displacement Address vs Top vs Impact)
 * 3. Lead Arm Extension (Elbow angle at Top and Impact, 180° = fully extended)
 * 4. Torso & Spine Tilt Angle (Spine inclination changes across swing)
 * 5. Pelvis / Hip Sway & Rotation Proxy (Lateral displacement & rotation)
 * 6. X-Factor Stretch Proxy (Shoulder vs Hip rotational differential at P4)
 * 7. Finish Balance & Weight Transfer (Lead foot post-impact loading at P10)
 */

import { JOINTS, getJoint, getMidpoint } from './golfSignalFilter.js';

/**
 * Calculates 2D angle (in degrees) at vertex B given points A, B, C.
 * 180° means straight line (A - B - C are collinear).
 */
export function calculateJointAngle(pA, pB, pC) {
  if (!pA || !pB || !pC) return null;

  const vA = { x: pA.x - pB.x, y: pA.y - pB.y };
  const vC = { x: pC.x - pB.x, y: pC.y - pB.y };

  const dot = vA.x * vC.x + vA.y * vC.y;
  const magA = Math.sqrt(vA.x * vA.x + vA.y * vA.y);
  const magC = Math.sqrt(vC.x * vC.x + vC.y * vC.y);

  if (magA === 0 || magC === 0) return null;

  let cosTheta = dot / (magA * magC);
  cosTheta = Math.max(-1.0, Math.min(1.0, cosTheta));
  return Number((Math.acos(cosTheta) * (180.0 / Math.PI)).toFixed(1));
}

/**
 * Computes angle (in degrees) of a segment with respect to vertical axis.
 * 0° is straight up vertical.
 */
export function calculateSegmentTilt(bottomPt, topPt) {
  if (!bottomPt || !topPt) return null;
  const dx = topPt.x - bottomPt.x;
  // In screen coords, top has smaller Y, so dy = bottom.y - top.y > 0 for upright
  const dy = bottomPt.y - topPt.y;
  const angleRad = Math.atan2(dx, dy);
  return Number((angleRad * (180.0 / Math.PI)).toFixed(1));
}

/**
 * Computes apparent rotation angle (proxy) around vertical axis using 3D coordinates or width foreshortening.
 */
export function calculateRotationProxy(leftPt, rightPt, baseWidth = 0.15) {
  if (!leftPt || !rightPt) return 0;
  // If z-coordinates are available from BlazePose
  if (typeof leftPt.z === 'number' && typeof rightPt.z === 'number') {
    const dz = leftPt.z - rightPt.z;
    const dx = leftPt.x - rightPt.x;
    return Number((Math.atan2(dz, dx) * (180.0 / Math.PI)).toFixed(1));
  }
  // Fallback using apparent 2D horizontal width foreshortening
  const apparentWidth = Math.abs(leftPt.x - rightPt.x);
  const ratio = Math.min(1.0, apparentWidth / (baseWidth || 0.15));
  return Number((Math.acos(ratio) * (180.0 / Math.PI)).toFixed(1));
}

/**
 * Main Biomechanics Calculator
 * 
 * @param {Array} frames - Sequence of normalized pose frames
 * @param {Object} eventResult - Output from detectSwingEvents
 * @param {Object} signals - Kinematic curves from extractKinematicSignals
 * @param {Object} options - Configuration options
 * @returns {Object} Comprehensive biomechanics metrics
 */
export function calculateBiomechanics(frames, eventResult, signals = {}, options = {}) {
  const { events, keyFrames } = eventResult || {};
  const n = frames ? frames.length : 0;

  if (!n || !keyFrames || keyFrames.top === undefined || keyFrames.impact === undefined) {
    return {
      success: false,
      reason: 'Missing key swing events (P4 Top or P7 Impact)',
      metrics: null
    };
  }

  const p1 = keyFrames.address ?? 0;
  const p2 = keyFrames.takeaway ?? Math.max(0, keyFrames.top - 20);
  const p4 = keyFrames.top;
  const p7 = keyFrames.impact;
  const p10 = keyFrames.finish ?? Math.min(n - 1, keyFrames.impact + 30);

  const frameAddress = frames[p1] || frames[0];
  const frameTop = frames[p4] || frames[p1];
  const frameImpact = frames[p7] || frames[p4];
  const frameFinish = frames[p10] || frames[n - 1];

  const shoulderDist = signals.shoulderDist || 0.15;
  const torsoHeight = signals.torsoHeight || 0.40;

  // ── 1. TEMPO RATIO ────────────────────────────────────────────────────────
  // Dimensionless backswing-to-downswing frame ratio
  const backswingFrames = Math.max(1, p4 - p2);
  const downswingFrames = Math.max(1, p7 - p4);
  const tempoRatio = Number((backswingFrames / downswingFrames).toFixed(2));

  let tempoEvaluation = 'GOOD';
  if (tempoRatio >= 2.7 && tempoRatio <= 3.3) {
    tempoEvaluation = 'TOUR_OPTIMAL (3:1)';
  } else if (tempoRatio >= 2.3 && tempoRatio <= 3.7) {
    tempoEvaluation = 'ACCEPTABLE';
  } else if (tempoRatio < 2.3) {
    tempoEvaluation = 'QUICK_BACKSWING';
  } else {
    tempoEvaluation = 'SLOW_BACKSWING';
  }

  // ── 2. HEAD STABILITY & MOVEMENT ──────────────────────────────────────────
  // Compare nose position at Address vs Top vs Impact
  const noseAddr = getJoint(frameAddress, JOINTS.NOSE);
  const noseTop = getJoint(frameTop, JOINTS.NOSE);
  const noseImpact = getJoint(frameImpact, JOINTS.NOSE);

  let headLateralSwayTop = 0;
  let headVerticalDropTop = 0;
  let headLateralSwayImpact = 0;
  let headVerticalDropImpact = 0;

  if (noseAddr && noseTop) {
    headLateralSwayTop = Number(((noseTop.x - noseAddr.x) / shoulderDist).toFixed(3));
    headVerticalDropTop = Number(((noseTop.y - noseAddr.y) / shoulderDist).toFixed(3));
  }
  if (noseAddr && noseImpact) {
    headLateralSwayImpact = Number(((noseImpact.x - noseAddr.x) / shoulderDist).toFixed(3));
    headVerticalDropImpact = Number(((noseImpact.y - noseAddr.y) / shoulderDist).toFixed(3));
  }

  const maxHeadDisplacement = Math.max(
    Math.abs(headLateralSwayTop),
    Math.abs(headVerticalDropTop),
    Math.abs(headLateralSwayImpact),
    Math.abs(headVerticalDropImpact)
  );

  let headStabilityRating = 'EXCELLENT';
  if (maxHeadDisplacement > 0.45) {
    headStabilityRating = 'EXCESSIVE_MOVEMENT';
  } else if (maxHeadDisplacement > 0.25) {
    headStabilityRating = 'MODERATE_SWAY';
  }

  // ── 3. LEAD ARM EXTENSION ────────────────────────────────────────────────
  // In normalized space, LEFT arm is canonical lead arm
  const lsTop = getJoint(frameTop, JOINTS.LEFT_SHOULDER);
  const leTop = getJoint(frameTop, JOINTS.LEFT_ELBOW);
  const lwTop = getJoint(frameTop, JOINTS.LEFT_WRIST);

  const lsImp = getJoint(frameImpact, JOINTS.LEFT_SHOULDER);
  const leImp = getJoint(frameImpact, JOINTS.LEFT_ELBOW);
  const lwImp = getJoint(frameImpact, JOINTS.LEFT_WRIST);

  const leadArmTopAngle = calculateJointAngle(lsTop, leTop, lwTop) ?? 160.0;
  const leadArmImpactAngle = calculateJointAngle(lsImp, leImp, lwImp) ?? 172.0;

  const leadArmRating = leadArmTopAngle >= 155.0 ? 'EXCELLENT_EXTENSION' : (leadArmTopAngle >= 135.0 ? 'ACCEPTABLE' : 'BREAKDOWN');

  // ── 4. SPINE & TORSO TILT ────────────────────────────────────────────────
  // Midpoint hips to midpoint shoulders
  const getTorsoTilt = (frame) => {
    const ls = getJoint(frame, JOINTS.LEFT_SHOULDER);
    const rs = getJoint(frame, JOINTS.RIGHT_SHOULDER);
    const lh = getJoint(frame, JOINTS.LEFT_HIP);
    const rh = getJoint(frame, JOINTS.RIGHT_HIP);
    const shoulderMid = getMidpoint(ls, rs);
    const hipMid = getMidpoint(lh, rh);
    return calculateSegmentTilt(hipMid, shoulderMid);
  };

  const spineTiltAddress = getTorsoTilt(frameAddress) ?? 2.0;
  const spineTiltTop = getTorsoTilt(frameTop) ?? -8.0;
  const spineTiltImpact = getTorsoTilt(frameImpact) ?? 6.0;
  const secondarySpineTiltDelta = Number((spineTiltImpact - spineTiltAddress).toFixed(1));

  // ── 5. PELVIS / HIP SWAY & ROTATION ──────────────────────────────────────
  const lhAddr = getJoint(frameAddress, JOINTS.LEFT_HIP);
  const rhAddr = getJoint(frameAddress, JOINTS.RIGHT_HIP);
  const lhTop = getJoint(frameTop, JOINTS.LEFT_HIP);
  const rhTop = getJoint(frameTop, JOINTS.RIGHT_HIP);
  const lhImp = getJoint(frameImpact, JOINTS.LEFT_HIP);
  const rhImp = getJoint(frameImpact, JOINTS.RIGHT_HIP);

  const hipMidAddr = getMidpoint(lhAddr, rhAddr);
  const hipMidTop = getMidpoint(lhTop, rhTop);
  const hipMidImp = getMidpoint(lhImp, rhImp);

  let pelvisLateralSwayTop = 0;
  let pelvisLateralSwayImpact = 0;
  if (hipMidAddr && hipMidTop) {
    pelvisLateralSwayTop = Number(((hipMidTop.x - hipMidAddr.x) / shoulderDist).toFixed(3));
  }
  if (hipMidAddr && hipMidImp) {
    pelvisLateralSwayImpact = Number(((hipMidImp.x - hipMidAddr.x) / shoulderDist).toFixed(3));
  }

  // ── 6. X-FACTOR STRETCH PROXY ────────────────────────────────────────────
  // Rotational difference between shoulders and hips at Top (P4)
  const shoulderRotationTop = calculateRotationProxy(lsTop, getJoint(frameTop, JOINTS.RIGHT_SHOULDER), shoulderDist);
  const hipRotationTop = calculateRotationProxy(lhTop, rhTop, shoulderDist * 0.85);
  const xFactorStretchDeg = Number(Math.abs(shoulderRotationTop - hipRotationTop).toFixed(1));

  // ── 7. FINISH BALANCE & POST-IMPACT POSTURE ──────────────────────────────
  const laFin = getJoint(frameFinish, JOINTS.LEFT_ANKLE);
  const raFin = getJoint(frameFinish, JOINTS.RIGHT_ANKLE);
  const lsFin = getJoint(frameFinish, JOINTS.LEFT_SHOULDER);
  const rsFin = getJoint(frameFinish, JOINTS.RIGHT_SHOULDER);
  const finShoulderMid = getMidpoint(lsFin, rsFin);

  let finishBalanceScore = 85;
  let finishWeightShiftLead = true;

  if (finShoulderMid && laFin) {
    // In canonical right-handed golf finish, weight is stacked over left ankle (dx is small)
    const offsetFromLeadAnkle = Math.abs(finShoulderMid.x - laFin.x);
    if (offsetFromLeadAnkle < shoulderDist * 0.7) {
      finishBalanceScore = 95;
    } else {
      finishBalanceScore = 70;
      finishWeightShiftLead = false;
    }
  }

  return {
    success: true,
    tempo: {
      ratio: `${tempoRatio}:1`,
      ratioValue: tempoRatio,
      backswingFrames,
      downswingFrames,
      evaluation: tempoEvaluation
    },
    headStability: {
      rating: headStabilityRating,
      lateralSwayTop: headLateralSwayTop,
      verticalDropTop: headVerticalDropTop,
      lateralSwayImpact: headLateralSwayImpact,
      verticalDropImpact: headVerticalDropImpact,
      maxDisplacementRatio: Number(maxHeadDisplacement.toFixed(3))
    },
    leadArm: {
      angleTopDeg: leadArmTopAngle,
      angleImpactDeg: leadArmImpactAngle,
      rating: leadArmRating
    },
    spineTilt: {
      addressTiltDeg: spineTiltAddress,
      topTiltDeg: spineTiltTop,
      impactTiltDeg: spineTiltImpact,
      tiltDeltaDeg: secondarySpineTiltDelta
    },
    pelvisKinematics: {
      swayTopRatio: pelvisLateralSwayTop,
      swayImpactRatio: pelvisLateralSwayImpact,
      hipRotationTopDeg: hipRotationTop
    },
    xFactor: {
      shoulderRotationTopDeg: shoulderRotationTop,
      hipRotationTopDeg: hipRotationTop,
      xFactorDeg: xFactorStretchDeg
    },
    finishBalance: {
      score: finishBalanceScore,
      weightShiftLead: finishWeightShiftLead,
      status: finishBalanceScore >= 80 ? 'BALANCED_FINISH' : 'FALLING_BACK'
    }
  };
}
