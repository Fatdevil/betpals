process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as db from '../server/db.js';

const {
  server,
  partyRooms,
  spaceBlitzImplausibilityReason,
  finalizePartyRound,
  recordUserRtt,
  getLatencyCompensationMs
} = await import('../server/server.js');

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

async function call(method, path, body, token) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { 'x-user-token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

async function registerUser(prefix) {
  const nickname = prefix + crypto.randomBytes(3).toString('hex');
  const res = await call('POST', '/api/users/register', {
    name: nickname + ' Testsson',
    nickname,
    swishNumber: '07' + String(crypto.randomInt(0, 100000000)).padStart(8, '0'),
    pin: '1111'
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}

async function createStartedRoom(gameType, stakeAmount = 50, playerCount = 2) {
  const host = await registerUser('ph');
  const others = [];
  for (let i = 1; i < playerCount; i++) others.push(await registerUser('pp'));
  const room = (await call('POST', '/api/minigames/party/create', { gameType, stakeAmount }, host.token)).body.room;
  for (const o of others) {
    await call('POST', '/api/minigames/party/join', { roomId: room.id }, o.token);
  }
  const start = await call('POST', `/api/minigames/party/${room.id}/start`, {}, host.token);
  assert.equal(start.status, 200);
  return { host, others, roomId: room.id, room: partyRooms.get(room.id) };
}

test('Space Blitz plausibility: accepts results that follow the game rules', () => {
  // Wave 1, 5 top-row kills
  assert.equal(spaceBlitzImplausibilityReason({ score: 150, aliensKilled: 5, wave: 1, elapsedMs: 20000 }), null);
  // 2 cleared waves (1120) + 4 kills (80) + 1 UFO (200)
  assert.equal(spaceBlitzImplausibilityReason({ score: 1400, aliensKilled: 60, wave: 3, elapsedMs: 60000 }), null);
  // Zero score is always fine
  assert.equal(spaceBlitzImplausibilityReason({ score: 0, aliensKilled: 0, wave: 1, elapsedMs: 3000 }), null);
});

test('Space Blitz plausibility: rejects impossible results', () => {
  assert.ok(spaceBlitzImplausibilityReason({ score: 5000, aliensKilled: 20, wave: 1, elapsedMs: 60000 }), 'score too high for kills');
  assert.ok(spaceBlitzImplausibilityReason({ score: 600, aliensKilled: 30, wave: 1, elapsedMs: 60000 }), 'more kills than aliens in wave');
  assert.ok(spaceBlitzImplausibilityReason({ score: 1120, aliensKilled: 56, wave: 3, elapsedMs: 5000 }), 'faster than fire rate');
  assert.ok(spaceBlitzImplausibilityReason({ score: 350, aliensKilled: 5, wave: 1, elapsedMs: 5000 }), 'UFO before it can appear');
  assert.ok(spaceBlitzImplausibilityReason({ score: 155, aliensKilled: 5, wave: 1, elapsedMs: 20000 }), 'not a multiple of 10');
  assert.ok(spaceBlitzImplausibilityReason({ score: -10, aliensKilled: 0, wave: 1, elapsedMs: 20000 }), 'negative');
});

test('Blind 10: the server measures the time and ignores the client-reported value', async () => {
  const { host, roomId, room } = await createStartedRoom('blind10');
  room.startTime = Date.now() - 7000;

  const res = await call('POST', `/api/minigames/party/${roomId}/submit`, { stoppedTime: 10.0 }, host.token);
  assert.equal(res.status, 200);
  assert.ok(Math.abs(res.body.stoppedTime - 7.0) < 0.5, `expected ~7s, got ${res.body.stoppedTime}`);
  assert.ok(res.body.diff > 2.5);
});

test('Blind 10: network latency compensation is server-measured and capped', () => {
  const userId = 'rtt-user-' + crypto.randomUUID();
  assert.equal(getLatencyCompensationMs(userId), 0);
  recordUserRtt(userId, 80);
  recordUserRtt(userId, 120);
  recordUserRtt(userId, 100);
  assert.equal(getLatencyCompensationMs(userId), 100);
  for (let i = 0; i < 5; i++) recordUserRtt(userId, 5000);
  assert.equal(getLatencyCompensationMs(userId), 400);
});

test('Blind 10: submitting before the start is rejected', async () => {
  const { host, roomId, room } = await createStartedRoom('blind10');
  room.startTime = Date.now() + 5000;
  const res = await call('POST', `/api/minigames/party/${roomId}/submit`, { stoppedTime: 10 }, host.token);
  assert.equal(res.status, 400);
});

test('Party: the host cannot restart a round in progress', async () => {
  const { host, roomId } = await createStartedRoom('blind10');
  const restart = await call('POST', `/api/minigames/party/${roomId}/start`, {}, host.token);
  assert.equal(restart.status, 400);
});

test('Party: nobody can join mid-round, but existing players can rejoin', async () => {
  const { others, roomId } = await createStartedRoom('blind10');
  const newcomer = await registerUser('pn');
  const join = await call('POST', '/api/minigames/party/join', { roomId }, newcomer.token);
  assert.equal(join.status, 400);
  const rejoin = await call('POST', '/api/minigames/party/join', { roomId }, others[0].token);
  assert.equal(rejoin.status, 200);
});

test('Party: players carry their real Swish number and avatar', async () => {
  const { host, room } = await createStartedRoom('blind10');
  const hostPlayer = room.players.find(p => p.id === host.id);
  assert.equal(hostPlayer.swishNumber, host.swishNumber);
});

test('Party: a player who never finishes loses on timeout (DNF)', async () => {
  const { host, others, roomId, room } = await createStartedRoom('blind10', 40);
  room.startTime = Date.now() - 9900;
  const sub = await call('POST', `/api/minigames/party/${roomId}/submit`, {}, host.token);
  assert.equal(sub.status, 200);
  assert.equal(room.status, 'running', 'waits for the other player');

  finalizePartyRound(room, { timedOut: true });
  assert.equal(room.status, 'completed');
  const straggler = room.results.find(r => r.id === others[0].id);
  assert.equal(straggler.dnf, true);
  assert.equal(room.results[0].id, host.id);

  const summary = db.getDuelSettlementSummary(others[0].id);
  assert.equal(summary.friends.find(f => f.friendId === host.id)?.netAmount, -40);
});

test('Party: when nobody finishes there is no winner and no debt', async () => {
  const { host, others, room } = await createStartedRoom('space_invaders', 40);
  finalizePartyRound(room, { timedOut: true });
  assert.equal(room.status, 'completed');
  assert.ok(room.results.every(r => r.dnf));
  const summary = db.getDuelSettlementSummary(others[0].id);
  assert.ok(!summary.friends.some(f => f.friendId === host.id));
});

test('Party: resolve-tie is only allowed when the round is actually tied', async () => {
  const { host, roomId } = await createStartedRoom('blind10');
  const res = await call('POST', `/api/minigames/party/${roomId}/resolve-tie`, { decision: 'split' }, host.token);
  assert.equal(res.status, 400);
});

test('Space Blitz: an impossible score counts as 0 and loses', async () => {
  const { host, others, roomId, room } = await createStartedRoom('space_invaders', 25);
  room.startTime = Date.now() - 60000;
  await call('POST', `/api/minigames/party/${roomId}/submit`, { score: 280, aliensKilled: 14, waveReached: 1 }, host.token);
  const cheat = await call('POST', `/api/minigames/party/${roomId}/submit`, { score: 5000, aliensKilled: 150, waveReached: 10 }, others[0].token);
  assert.equal(cheat.body.invalidated, true);
  assert.equal(room.status, 'completed');
  assert.equal(room.results[0].id, host.id);
  const summary = db.getDuelSettlementSummary(others[0].id);
  assert.equal(summary.friends.find(f => f.friendId === host.id)?.netAmount, -25);
});

test('Blind 10: if nobody finishes a sudden death, the tied players split the pot', async () => {
  const { host, others, roomId, room } = await createStartedRoom('blind10', 30, 3);
  const [p2, p3] = others;
  // Host and p2 tie, p3 is further off
  for (const p of room.players) {
    p.diff = p.id === p3.id ? 2 : 0.5;
    p.stoppedTime = 9.5;
    p.dnf = false;
  }
  room.status = 'running';
  room.tiedPlayerIds = [];
  finalizePartyRound(room, { timedOut: true });
  assert.equal(room.status, 'tie');

  const sd = await call('POST', `/api/minigames/party/${roomId}/resolve-tie`, { decision: 'sudden_death' }, host.token);
  assert.equal(sd.status, 200);
  finalizePartyRound(room, { timedOut: true });
  assert.equal(room.status, 'completed');

  const summary = db.getDuelSettlementSummary(p3.id);
  const owedToHost = summary.friends.find(f => f.friendId === host.id)?.netAmount;
  const owedToP2 = summary.friends.find(f => f.friendId === p2.id)?.netAmount;
  assert.equal(owedToHost, -15);
  assert.equal(owedToP2, -15);
});
