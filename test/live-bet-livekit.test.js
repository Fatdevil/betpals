import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../server/db.js';
import { AccessToken } from 'livekit-server-sdk';

const hostUser = {
  id: 'test-host-' + Date.now(),
  nickname: 'LiveHost',
  real_name: 'Live Host',
  swish_number: '0709999991'
};

const viewerUser1 = {
  id: 'test-viewer1-' + Date.now(),
  nickname: 'ViewerOne',
  real_name: 'Viewer One',
  swish_number: '0709999992'
};

const viewerUser2 = {
  id: 'test-viewer2-' + Date.now(),
  nickname: 'ViewerTwo',
  real_name: 'Viewer Two',
  swish_number: '0709999993'
};

db.createUser(hostUser.id, hostUser.nickname, 'token-' + hostUser.id, '🏌️', hostUser.real_name, hostUser.swish_number);
db.createUser(viewerUser1.id, viewerUser1.nickname, 'token-' + viewerUser1.id, '⛳', viewerUser1.real_name, viewerUser1.swish_number);
db.createUser(viewerUser2.id, viewerUser2.nickname, 'token-' + viewerUser2.id, '🎯', viewerUser2.real_name, viewerUser2.swish_number);

test('LiveKit Token Generation — Generates signed JWTs with correct grants for publisher and subscriber', async () => {
  const apiKey = 'test-api-key-123';
  const apiSecret = 'test-api-secret-456-very-secure-secret-key-at-least-32-chars';
  const roomName = 'live_test_room_1';

  // Publisher (Host)
  const hostTokenObj = new AccessToken(apiKey, apiSecret, {
    identity: hostUser.id,
    name: hostUser.nickname
  });
  hostTokenObj.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true
  });
  const hostJwt = await hostTokenObj.toJwt();
  assert.ok(typeof hostJwt === 'string' && hostJwt.split('.').length === 3, 'Publisher token is valid JWT format');

  // Subscriber (Viewer)
  const viewerTokenObj = new AccessToken(apiKey, apiSecret, {
    identity: viewerUser1.id,
    name: viewerUser1.nickname
  });
  viewerTokenObj.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: false,
    canSubscribe: true,
    canPublishData: true
  });
  const viewerJwt = await viewerTokenObj.toJwt();
  assert.ok(typeof viewerJwt === 'string' && viewerJwt.split('.').length === 3, 'Subscriber token is valid JWT format');
  assert.notEqual(hostJwt, viewerJwt, 'Publisher and subscriber tokens are distinct');
});

test('Flash Live Stream — Database persistence, status updates and retrieval', () => {
  const liveId = 'live_test_' + Date.now();
  const session = {
    id: liveId,
    hostId: hostUser.id,
    hostName: hostUser.nickname,
    hostAvatar: '🏌️',
    question: 'Sätter Johan putten på hål 18?',
    hasBet: true,
    stakeAmount: 20,
    durationSeconds: 60,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    targetUserIds: [viewerUser1.id, viewerUser2.id],
    flashBetId: null,
    status: 'active'
  };

  db.createFlashLiveStream(session);

  const fetched = db.getFlashLiveStream(liveId);
  assert.ok(fetched, 'Stream exists in database');
  assert.equal(fetched.id, liveId);
  assert.equal(fetched.hostId, hostUser.id);
  assert.equal(fetched.question, session.question);
  assert.equal(fetched.status, 'active');

  // Update status to ended
  db.updateFlashLiveStreamStatus(liveId, 'ended');
  const ended = db.getFlashLiveStream(liveId);
  assert.equal(ended.status, 'ended', 'Status is updated to ended');
});

test('Flash Live Bet Lifecycle — Placement, Settlement and Swish Duel generation', () => {
  const liveId = 'live_bet_' + Date.now();
  const flashBetId = 'fb_live_' + Date.now();
  const stake = 25;
  const duration = 60;
  const expiresAt = new Date(Date.now() + 60000).toISOString();

  // Create flash bet
  db.createFlashBet(flashBetId, hostUser.id, null, 'Träffar bollen greenen?', duration, expiresAt, stake);

  const session = {
    id: liveId,
    hostId: hostUser.id,
    hostName: hostUser.nickname,
    hostAvatar: '🏌️',
    question: 'Träffar bollen greenen?',
    hasBet: true,
    stakeAmount: stake,
    durationSeconds: duration,
    expiresAt,
    targetUserIds: [viewerUser1.id, viewerUser2.id],
    flashBetId,
    status: 'active'
  };
  db.createFlashLiveStream(session);

  // Viewer 1 bets YES
  db.placeFlashBetEntry('entry-v1-' + Date.now(), flashBetId, viewerUser1.id, 'yes', stake);
  // Viewer 2 bets NO
  db.placeFlashBetEntry('entry-v2-' + Date.now(), flashBetId, viewerUser2.id, 'no', stake);

  const betBefore = db.getFlashBet(flashBetId, hostUser.id);
  assert.equal(betBefore.entries.length, 2, 'Both viewers placed their bets');

  // Host settles bet: 'yes' won!
  const settled = db.settleFlashBet(flashBetId, 'yes', hostUser.id);
  assert.equal(settled.status, 'settled');
  assert.equal(settled.winningChoice, 'yes');

  // Verify debt generation: Viewer 2 owes Viewer 1 25 kr
  const viewer1Bet = db.getFlashBet(flashBetId, viewerUser1.id);
  assert.equal(viewer1Bet.myEntry.choice, 'yes');
  assert.equal(viewer1Bet.myChoice, 'yes');

  const viewer2Bet = db.getFlashBet(flashBetId, viewerUser2.id);
  assert.equal(viewer2Bet.myEntry.choice, 'no');
  assert.equal(viewer2Bet.settlementSummary.debts.length, 1);
  assert.equal(viewer2Bet.settlementSummary.debts[0].winnerName, viewerUser1.nickname);
  assert.equal(viewer2Bet.settlementSummary.debts[0].amount, 25);
  assert.equal(viewer2Bet.settlementSummary.debts[0].winnerSwish, viewerUser1.swish_number);
});

test('Stop Flash Live Stream — Terminates stream, updates status to ended and cancels open flash bet', () => {
  const liveId = 'live_stop_test_' + Date.now();
  const flashBetId = 'fb_live_stop_' + Date.now();
  const stake = 20;
  const duration = 60;
  const expiresAt = new Date(Date.now() + 60000).toISOString();

  // Create flash bet
  db.createFlashBet(flashBetId, hostUser.id, null, 'Slår Peter i vattnet?', duration, expiresAt, stake);

  const session = {
    id: liveId,
    hostId: hostUser.id,
    hostName: hostUser.nickname,
    hostAvatar: '🏌️',
    question: 'Slår Peter i vattnet?',
    hasBet: true,
    stakeAmount: stake,
    durationSeconds: duration,
    expiresAt,
    targetUserIds: [viewerUser1.id],
    flashBetId,
    status: 'active'
  };
  db.createFlashLiveStream(session);

  // Viewer 1 places bet
  db.placeFlashBetEntry('entry-stop-' + Date.now(), flashBetId, viewerUser1.id, 'yes', stake);

  // Ensure bet is open
  const betBefore = db.getFlashBet(flashBetId);
  assert.equal(betBefore.status, 'open', 'Bet is open before stop');

  // Stop stream & cancel underlying open bet (mimicking POST /api/flashlive/:id/stop)
  db.updateFlashLiveStreamStatus(liveId, 'ended');
  const fb = db.getFlashBet(session.flashBetId);
  if (fb && (fb.status === 'open' || fb.status === 'locked')) {
    db.cancelFlashBet(session.flashBetId, hostUser.id);
  }

  // Verify stream is ended
  const endedStream = db.getFlashLiveStream(liveId);
  assert.ok(endedStream, 'Stream exists in database');
  assert.equal(endedStream.status, 'ended', 'Stream status updated to ended');

  // Verify flash bet was cancelled
  const betAfter = db.getFlashBet(flashBetId);
  assert.equal(betAfter.status, 'cancelled', 'Unsettled bet cancelled when stream ended');
});

