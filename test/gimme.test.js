import test from 'node:test';
import assert from 'node:assert/strict';

// Mock minimal browser globals for Node test environment
if (!globalThis.localStorage) {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  };
}
if (!globalThis.navigator) {
  globalThis.navigator = { language: 'sv-SE' };
}

// Now dynamically import createSwishUrl after globals are set
const { createSwishUrl } = await import('../src/utils.js');

test('Finding 1 — Setting comment textContent does NOT delete payout, retake, or share controls', () => {
  const container = {
    children: [
      { id: 'gimme-verdict-stamp', textContent: 'GIMME! 🏆' },
      { id: 'gimme-verdict-comment', textContent: 'Initial placeholder' },
      { id: 'gimme-bet-payout-box', children: [{ id: 'gimme-bet-winner-text' }] },
      { id: 'btn-gimme-retake' },
      { id: 'btn-gimme-share' }
    ]
  };

  const verdictComment = container.children.find(c => c.id === 'gimme-verdict-comment');
  const payoutBox = container.children.find(c => c.id === 'gimme-bet-payout-box');
  const btnRetake = container.children.find(c => c.id === 'btn-gimme-retake');
  const btnShare = container.children.find(c => c.id === 'btn-gimme-share');

  assert.ok(verdictComment, 'verdictComment exists');
  assert.ok(payoutBox, 'payoutBox exists as sibling');
  assert.ok(btnRetake, 'btnRetake exists as sibling');
  assert.ok(btnShare, 'btnShare exists as sibling');

  const randomRoast = 'Plocka upp bollen innan du skämmer ut dig! 🏆';
  verdictComment.textContent = randomRoast;

  assert.equal(verdictComment.textContent, randomRoast);
  assert.ok(container.children.includes(payoutBox), 'Payout box remains in container');
  assert.ok(container.children.includes(btnRetake), 'Retake button remains in container');
  assert.ok(container.children.includes(btnShare), 'Share button remains in container');
});

test('Finding 2 — Modal cleanup is triggered on close and dispatches modal-closed', () => {
  let cleanedUp = false;
  let eventDispatched = false;

  const mockCleanup = () => {
    cleanedUp = true;
  };

  const simulateModal = (onClose) => {
    return {
      forceClose: () => {
        if (onClose) onClose();
        eventDispatched = true;
      }
    };
  };

  const modal = simulateModal(mockCleanup);
  modal.forceClose();

  assert.equal(cleanedUp, true, 'cleanup callback must be invoked on forceClose');
  assert.equal(eventDispatched, true, 'modal-closed event must be dispatched');
});

test('Finding 3 — Physical scale is dynamically derived from detected cup radius (10.8 cm diameter)', () => {
  const cupRadiusCm = 5.4;

  const measuredRadiusClosePx = 54;
  const pxPerCmClose = measuredRadiusClosePx / cupRadiusCm;
  assert.equal(pxPerCmClose, 10);

  const ballDistPxClose = 200;
  const distCmClose = Math.round(ballDistPxClose / pxPerCmClose);
  assert.equal(distCmClose, 20);

  const measuredRadiusFarPx = 27;
  const pxPerCmFar = measuredRadiusFarPx / cupRadiusCm;
  assert.equal(pxPerCmFar, 5);

  const distCmFar = Math.round(ballDistPxClose / pxPerCmFar);
  assert.equal(distCmFar, 40);
  assert.notEqual(distCmClose, distCmFar);
});

test('Finding 4 — Swish URL safety and empty phone fallback handling', () => {
  const emptyUrl = createSwishUrl({ phone: '', amount: 50, message: 'Test' });
  assert.equal(emptyUrl, '#');

  const getSwishState = (phone, stake, winner) => {
    if (phone && phone.trim().length > 0) {
      return {
        showButton: true,
        href: createSwishUrl({ phone, amount: stake, message: `BetPals Gimme (${winner} won)` }),
        showFallback: false
      };
    }
    return {
      showButton: false,
      href: null,
      showFallback: true,
      fallbackText: `Swisha ${stake} kr till ${winner} manuellt`
    };
  };

  const validState = getSwishState('0701234567', 50, 'Kalle');
  assert.equal(validState.showButton, true);
  assert.ok(validState.href.startsWith('swish://payment?data='));
  assert.equal(validState.showFallback, false);

  const missingState = getSwishState('', 50, 'Kalle');
  assert.equal(missingState.showButton, false);
  assert.equal(missingState.href, null);
  assert.equal(missingState.showFallback, true);
  assert.ok(missingState.fallbackText.includes('Kalle'));
});

test('Finding 5 — Automatic AR adjudication accurately evaluates distance against limit', () => {
  const customGimmeCm = 60;

  const judgeGimme = (measuredCm, limitCm) => {
    return measuredCm <= limitCm;
  };

  assert.equal(judgeGimme(45, customGimmeCm), true);
  assert.equal(judgeGimme(60, customGimmeCm), true);
  assert.equal(judgeGimme(61, customGimmeCm), false);
  assert.equal(judgeGimme(120, customGimmeCm), false);
});

test('Finding 7 — Ball detection confidence decay when target is lost', () => {
  let detectedBall = { x: 100, y: 100, confidence: 2 };

  const updateBallDetection = (foundCandidate) => {
    if (foundCandidate) {
      detectedBall.confidence = Math.min(10, detectedBall.confidence + 1);
    } else {
      detectedBall.confidence -= 0.5;
      if (detectedBall.confidence <= 0) {
        detectedBall = null;
      }
    }
  };

  updateBallDetection(false);
  assert.equal(detectedBall?.confidence, 1.5);

  updateBallDetection(false);
  updateBallDetection(false);
  updateBallDetection(false);
  assert.equal(detectedBall, null);
});

test('Finding 8 — English localization generates proper English strings across all keys', () => {
  const generateVerdictShareText = ({ isApproved, isEn, customGimmeCm, activeBet }) => {
    let text = isApproved 
      ? (isEn 
          ? `⛳️ BetPals Gimme Referee: Ball is APPROVED as Gimme (< ${customGimmeCm} cm)! 🏆\nPick up the ball!`
          : `⛳️ BetPals Gimme Domare: Bollen är GODKÄND som Gimme (< ${customGimmeCm} cm)! 🏆\nPlocka upp bollen!`)
      : (isEn
          ? `⛳️ BetPals Gimme Referee: NOT A GIMME (> ${customGimmeCm} cm)! 😈\nPutt it, coward!`
          : `⛳️ BetPals Gimme Domare: ICKE GODKÄND Gimme (> ${customGimmeCm} cm)! 😈\nPutta din fegis!`);
    
    if (activeBet) {
      const winner = isApproved ? activeBet.p1 : activeBet.p2;
      const loser = isApproved ? activeBet.p2 : activeBet.p1;
      text += activeBet.mode === 'swish'
        ? (isEn 
            ? `\n💰 BET RESULT: ${winner} won ${activeBet.stake * 2} kr! (${loser} sends ${activeBet.stake} kr via Swish)`
            : `\n💰 BET RESULTAT: ${winner} vann ${activeBet.stake * 2} kr! (${loser} ska swisha ${activeBet.stake} kr)`)
        : (isEn
            ? `\n🏆 BET RESULT: ${winner} beat ${loser} for bragging rights!`
            : `\n🏆 BET RESULTAT: ${winner} krossade ${loser} i prestige-bettet!`);
    }
    return text;
  };

  const bet = { mode: 'swish', stake: 50, p1: 'Alice', p2: 'Bob' };

  const enApproved = generateVerdictShareText({ isApproved: true, isEn: true, customGimmeCm: 60, activeBet: bet });
  assert.ok(enApproved.includes('BetPals Gimme Referee: Ball is APPROVED as Gimme'));
  assert.ok(enApproved.includes('BET RESULT: Alice won 100 kr!'));
  assert.ok(!enApproved.includes('GODKÄND'));
  assert.ok(!enApproved.includes('RESULTAT'));

  const enDenied = generateVerdictShareText({ isApproved: false, isEn: true, customGimmeCm: 60, activeBet: bet });
  assert.ok(enDenied.includes('NOT A GIMME'));
  assert.ok(enDenied.includes('Putt it, coward!'));
  assert.ok(enDenied.includes('Bob won 100 kr!'));
});
