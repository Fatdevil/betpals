import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as db from '../server/db.js';

const uid = () => crypto.randomUUID();

const host = {
  id: 'test-audit-host-' + uid(),
  nickname: 'AuditHost',
  real_name: 'Audit Host',
  swish_number: '0701112233'
};

const friend1 = {
  id: 'test-audit-f1-' + uid(),
  nickname: 'FriendOne',
  real_name: 'Friend One',
  swish_number: '0701112234'
};

const stranger = {
  id: 'test-audit-stranger-' + uid(),
  nickname: 'Stranger',
  real_name: 'Stranger User',
  swish_number: '0701112235'
};

const admin = {
  id: 'test-audit-admin-' + uid(),
  nickname: 'AdminUser',
  real_name: 'Admin User',
  swish_number: '0701112236'
};

db.createUser(host.id, host.nickname, 'token-' + host.id, '🏌️', host.real_name, host.swish_number);
db.createUser(friend1.id, friend1.nickname, 'token-' + friend1.id, '⛳', friend1.real_name, friend1.swish_number);
db.createUser(stranger.id, stranger.nickname, 'token-' + stranger.id, '🎯', stranger.real_name, stranger.swish_number);
db.createUser(admin.id, admin.nickname, 'token-' + admin.id, '👑', admin.real_name, admin.swish_number);

test('Audit Finding 4: Cancelled FlashBet is terminal — settleFlashBet rejects cancelled bet', () => {
  const fbId = 'fb_audit_cancel_' + uid();
  const expiresAt = new Date(Date.now() + 60000).toISOString();
  db.createFlashBet(fbId, host.id, null, 'Gör han par på 18:e?', 60, expiresAt, 20);

  // Friend votes YES
  db.placeFlashBetEntry('entry_' + uid(), fbId, friend1.id, 'yes', 20);

  // Cancel bet
  const cancelled = db.cancelFlashBet(fbId, host.id);
  assert.equal(cancelled.status, 'cancelled');

  // Attempt to settle cancelled bet must be rejected!
  assert.throws(
    () => db.settleFlashBet(fbId, 'yes', host.id),
    /avbrutits och kan inte avgöras/,
    'settleFlashBet must reject cancelled bets'
  );

  const after = db.getFlashBet(fbId, host.id);
  assert.equal(after.status, 'cancelled', 'Bet status must remain cancelled');
  assert.equal(after.winningChoice, null, 'Winning choice must not be recorded');
});

test('Audit Finding 9: Admin can cancel FlashBet when terminating stream', () => {
  const fbId = 'fb_audit_admin_' + uid();
  const expiresAt = new Date(Date.now() + 60000).toISOString();
  db.createFlashBet(fbId, host.id, null, 'Träffar han fairway?', 60, expiresAt, 20);

  // Non-creator non-admin cannot cancel
  assert.throws(
    () => db.cancelFlashBet(fbId, stranger.id, false),
    /Endast skaparen kan avbryta vadet/
  );

  // Admin CAN cancel using admin flag
  const cancelled = db.cancelFlashBet(fbId, admin.id, true);
  assert.equal(cancelled.status, 'cancelled', 'Admin successfully cancels bet');
});

test('Audit Finding 8: updateFlashLiveStreamBet persists question in database', () => {
  const liveId = 'live_audit_q_' + uid();
  const fbId = 'fb_audit_q_' + uid();
  const expiresAt = new Date(Date.now() + 60000).toISOString();

  // Create pure stream first
  db.createFlashLiveStream({
    id: liveId,
    hostId: host.id,
    hostName: host.nickname,
    hostAvatar: '🏌️',
    question: '18:e hålet – Spännande match!',
    hasBet: false,
    stakeAmount: 0,
    durationSeconds: 0,
    expiresAt: null,
    targetUserIds: [friend1.id],
    flashBetId: null,
    status: 'active'
  });

  const before = db.getFlashLiveStream(liveId);
  assert.equal(before.question, '18:e hålet – Spännande match!');

  // Now attach bet with new question
  const newQuestion = 'Sätter han putten för birdie?';
  db.createFlashBet(fbId, host.id, null, newQuestion, 60, expiresAt, 25);
  db.updateFlashLiveStreamBet(liveId, fbId, 25, 60, expiresAt, newQuestion);

  // Verify database row has updated question
  const after = db.getFlashLiveStream(liveId);
  assert.equal(after.question, newQuestion, 'Question in SQLite is updated to the bet question');
  assert.equal(after.flashBetId, fbId);
  assert.equal(after.stakeAmount, 25);
});

test('Audit Finding 3: Target audience restriction protects bet participation', () => {
  const fbId = 'fb_audit_audience_' + uid();
  const expiresAt = new Date(Date.now() + 60000).toISOString();

  // Stream created with only friend1 in targetUserIds
  const targetUserIds = [friend1.id];
  db.createFlashBet(fbId, host.id, null, 'Klarar han bunker-slaget?', 60, expiresAt, 20, targetUserIds);

  // Friend1 is invited -> can place bet
  const entryF1 = db.placeFlashBetEntry('entry_' + uid(), fbId, friend1.id, 'yes', 20);
  assert.ok(entryF1, 'Invited friend can place bet');

  // Stranger is NOT invited -> must be rejected with 403 error
  assert.throws(
    () => db.placeFlashBetEntry('entry_' + uid(), fbId, stranger.id, 'no', 20),
    /inte inbjuden till detta BlixtBet/,
    'Uninvited stranger cannot bet in restricted Live Bet'
  );
});

test('Audit Finding 4: Settled bet cannot be cancelled', () => {
  const fbId = 'fb_audit_settled_cancel_' + uid();
  const expiresAt = new Date(Date.now() + 60000).toISOString();
  db.createFlashBet(fbId, host.id, null, 'Går bollen i vattnet?', 60, expiresAt, 20);
  db.placeFlashBetEntry('entry_' + uid(), fbId, friend1.id, 'yes', 20);

  // Settle bet
  db.settleFlashBet(fbId, 'yes', host.id);

  // Cancel after settled must be rejected!
  assert.throws(
    () => db.cancelFlashBet(fbId, host.id),
    /Vadet är redan avgjort/,
    'Cannot cancel already settled bet'
  );
});
