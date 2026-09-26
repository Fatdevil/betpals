import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';

process.env.NODE_ENV = 'test';

// Import server helpers
const {
  app,
  partyRooms,
  partyCodeToId
} = await import('../server/server.js');
import * as db from '../server/db.js';

// In-memory route invocation without binding TCP sockets
function invoke(method, url, { body = {}, headers = {} } = {}) {
  return new Promise((resolve) => {
    const normalizedHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
      normalizedHeaders[k.toLowerCase()] = v;
    }
    if (!normalizedHeaders['content-type']) {
      normalizedHeaders['content-type'] = 'application/json';
    }

    const req = Object.assign(new EventEmitter(), {
      method: method.toUpperCase(),
      url,
      headers: normalizedHeaders,
      body,
      query: {},
      params: {},
      _readableState: { pipes: [] },
      unpipe() {},
      resume() {},
      pause() {},
      socket: { remoteAddress: '127.0.0.1' },
      connection: { remoteAddress: '127.0.0.1' }
    });

    let statusCode = 200;
    const resHeaders = {};
    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
      headersSent: false,
      _header: null,
      status(code) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(data) {
        resolve({ status: statusCode, body: data });
      },
      send(data) {
        resolve({ status: statusCode, body: data });
      },
      end(data) {
        resolve({ status: statusCode, body: data });
      },
      setHeader(name, value) { resHeaders[name.toLowerCase()] = value; },
      getHeader(name) { return resHeaders[name.toLowerCase()]; },
      removeHeader(name) { delete resHeaders[name.toLowerCase()]; },
      writeHead(code) { statusCode = code; this.statusCode = code; }
    });

    app.handle(req, res);
  });
}

function createTestUser(prefix, nickname) {
  const id = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const token = `token-${id}`;
  try {
    db.createUser(id, nickname, token, '👤', nickname, '0700000000');
  } catch (e) {}
  return { id, nickname, token };
}

test('Space Blitz — SB-06: Party Room Creation & Stake Validation', async () => {
  const host = createTestUser('sb-host-1', 'BlitzHost');

  // Test 1: Create room with space_invaders
  const res1 = await invoke('POST', '/api/minigames/party/create', {
    body: { gameType: 'space_invaders', stakeAmount: 20 },
    headers: { Authorization: `Bearer ${host.token}` }
  });
  assert.equal(res1.status, 200);
  assert.equal(res1.body.room.gameType, 'space_invaders');
  assert.equal(res1.body.room.stakeAmount, 20);

  // Test 2: Clamp excessive stake amount
  const res2 = await invoke('POST', '/api/minigames/party/create', {
    body: { gameType: 'space_invaders', stakeAmount: 999999 },
    headers: { Authorization: `Bearer ${host.token}` }
  });
  assert.equal(res2.status, 200);
  assert.equal(res2.body.room.stakeAmount, 500);

  // Test 3: Reject negative or non-finite stake
  const res3 = await invoke('POST', '/api/minigames/party/create', {
    body: { gameType: 'space_invaders', stakeAmount: -50 },
    headers: { Authorization: `Bearer ${host.token}` }
  });
  assert.equal(res3.status, 200);
  assert.equal(res3.body.room.stakeAmount, 0);
});

test('Space Blitz — SB-06: Party Invite Authorization Guard', async () => {
  const host = createTestUser('sb-host-inv', 'HostInviter');
  const friend = createTestUser('sb-friend-inv', 'FriendUser');
  const outsider = createTestUser('sb-outsider', 'OutsiderUser');

  const createRes = await invoke('POST', '/api/minigames/party/create', {
    body: { gameType: 'space_invaders', stakeAmount: 10 },
    headers: { Authorization: `Bearer ${host.token}` }
  });
  const roomId = createRes.body.room.id;

  // Outsider tries to invite — should be rejected with 403
  const outsiderRes = await invoke('POST', `/api/minigames/party/${roomId}/invite`, {
    body: { friendIds: [friend.id] },
    headers: { Authorization: `Bearer ${outsider.token}` }
  });
  assert.equal(outsiderRes.status, 403);

  // Host invites friend — should succeed with 200
  const hostRes = await invoke('POST', `/api/minigames/party/${roomId}/invite`, {
    body: { friendIds: [friend.id] },
    headers: { Authorization: `Bearer ${host.token}` }
  });
  assert.equal(hostRes.status, 200);
});

test('Space Blitz — SB-04 & SB-06: Party Start Rules (Host only & Minimum 2 players for stakes)', async () => {
  const host = createTestUser('sb-host-start', 'HostStarter');
  const p2 = createTestUser('sb-p2-start', 'PlayerTwo');

  const createRes = await invoke('POST', '/api/minigames/party/create', {
    body: { gameType: 'space_invaders', stakeAmount: 20 },
    headers: { Authorization: `Bearer ${host.token}` }
  });
  const room = createRes.body.room;

  // 1. Host tries to start with only 1 player in stake room — rejected with 400
  const soloStart = await invoke('POST', `/api/minigames/party/${room.id}/start`, {
    headers: { Authorization: `Bearer ${host.token}` }
  });
  assert.equal(soloStart.status, 400);
  assert.match(soloStart.body.error, /Minst 2 deltagare krävs/);

  // 2. Player 2 joins
  await invoke('POST', '/api/minigames/party/join', {
    body: { roomId: room.id },
    headers: { Authorization: `Bearer ${p2.token}` }
  });

  // 3. Player 2 (non-host) tries to start — rejected with 403
  const nonHostStart = await invoke('POST', `/api/minigames/party/${room.id}/start`, {
    headers: { Authorization: `Bearer ${p2.token}` }
  });
  assert.equal(nonHostStart.status, 403);

  // 4. Host starts with 2 players — succeeds
  const hostStart = await invoke('POST', `/api/minigames/party/${room.id}/start`, {
    headers: { Authorization: `Bearer ${host.token}` }
  });
  assert.equal(hostStart.status, 200);
  assert.equal(hostStart.body.room.status, 'running');
});

test('Space Blitz — SB-04: Cannot submit score when room is not running', async () => {
  const host = createTestUser('sb-sub-lobby', 'LobbySubmitter');

  const createRes = await invoke('POST', '/api/minigames/party/create', {
    body: { gameType: 'space_invaders', stakeAmount: 0 },
    headers: { Authorization: `Bearer ${host.token}` }
  });
  const roomId = createRes.body.room.id;

  // Submit directly in lobby before start — must be rejected with 400
  const submitRes = await invoke('POST', `/api/minigames/party/${roomId}/submit`, {
    body: { score: 1500, aliensKilled: 25, waveReached: 3 },
    headers: { Authorization: `Bearer ${host.token}` }
  });
  assert.equal(submitRes.status, 400);
  assert.match(submitRes.body.error, /Spelet pågår inte just nu/);
});

test('Space Blitz — SB-02 & SB-03: Score Submission, Anti-Cheat Clamping & Duplicate Guard', async () => {
  const host = createTestUser('sb-score-host', 'ScoreHost');
  const p2 = createTestUser('sb-score-p2', 'ScoreP2');

  const createRes = await invoke('POST', '/api/minigames/party/create', {
    body: { gameType: 'space_invaders', stakeAmount: 10 },
    headers: { Authorization: `Bearer ${host.token}` }
  });
  const roomId = createRes.body.room.id;

  await invoke('POST', '/api/minigames/party/join', {
    body: { roomId },
    headers: { Authorization: `Bearer ${p2.token}` }
  });

  // Start game and fast forward past countdown
  await invoke('POST', `/api/minigames/party/${roomId}/start`, {
    headers: { Authorization: `Bearer ${host.token}` }
  });
  const room = partyRooms.get(roomId);
  room.startTime = Date.now() - 60000; // full 60s round played

  // 1. Submit a plausible score for host: 2 cleared waves (2 × (560 + 300 bonus)) + 4 kills (80) + 1 UFO (200)
  const hostSub = await invoke('POST', `/api/minigames/party/${roomId}/submit`, {
    body: { score: 2000, aliensKilled: 60, waveReached: 3 },
    headers: { Authorization: `Bearer ${host.token}` }
  });
  assert.equal(hostSub.status, 200);
  assert.equal(hostSub.body.score, 2000);
  assert.equal(hostSub.body.invalidated, false);

  // 2. Host tries to submit again — duplicate prevented
  const hostSub2 = await invoke('POST', `/api/minigames/party/${roomId}/submit`, {
    body: { score: 2000, aliensKilled: 60, waveReached: 3 },
    headers: { Authorization: `Bearer ${host.token}` }
  });
  assert.equal(hostSub2.status, 400);
  assert.match(hostSub2.body.error, /redan/);

  // 3. P2 submits an impossible cheat score — invalidated to 0 points (and loses)
  const cheatSub = await invoke('POST', `/api/minigames/party/${roomId}/submit`, {
    body: { score: 999999, aliensKilled: 9000, waveReached: 99 },
    headers: { Authorization: `Bearer ${p2.token}` }
  });
  assert.equal(cheatSub.status, 200);
  assert.equal(cheatSub.body.invalidated, true);
  const player2 = room.players.find(p => p.id === p2.id);
  assert.equal(player2.score, 0);
  assert.equal(player2.invalidated, true);
  assert.equal(room.status, 'completed');
});

test('Space Blitz — SB-05: Tie Game Handling (No Debt Created on Ties)', async () => {
  const host = createTestUser('sb-tie-h', 'TieHost');
  const p2 = createTestUser('sb-tie-p2', 'TieP2');

  const createRes = await invoke('POST', '/api/minigames/party/create', {
    body: { gameType: 'space_invaders', stakeAmount: 20 },
    headers: { Authorization: `Bearer ${host.token}` }
  });
  const roomId = createRes.body.room.id;

  await invoke('POST', '/api/minigames/party/join', {
    body: { roomId },
    headers: { Authorization: `Bearer ${p2.token}` }
  });

  await invoke('POST', `/api/minigames/party/${roomId}/start`, {
    headers: { Authorization: `Bearer ${host.token}` }
  });
  const room = partyRooms.get(roomId);
  room.startTime = Date.now() - 60000;

  // Both submit identical (plausible) scores: 1 cleared wave (560 + 300 bonus) + 2 kills (40)
  await invoke('POST', `/api/minigames/party/${roomId}/submit`, {
    body: { score: 900, aliensKilled: 30, waveReached: 2 },
    headers: { Authorization: `Bearer ${host.token}` }
  });
  await invoke('POST', `/api/minigames/party/${roomId}/submit`, {
    body: { score: 900, aliensKilled: 30, waveReached: 2 },
    headers: { Authorization: `Bearer ${p2.token}` }
  });

  assert.equal(room.status, 'tie');
  assert.equal(room.tiedPlayerIds.length, 2);

  // Verify no debt settlement is created for either player
  const hostSummary = db.getDuelSettlementSummary(host.id);
  const p2Summary = db.getDuelSettlementSummary(p2.id);
  assert.equal(hostSummary.totalNet, 0);
  assert.equal(p2Summary.totalNet, 0);
});

test('Space Blitz — Single Winner Debt Settlement on Stake Room', async () => {
  const winner = createTestUser('sb-win-1', 'WinnerPilot');
  const loser = createTestUser('sb-lose-1', 'LoserPilot');

  const createRes = await invoke('POST', '/api/minigames/party/create', {
    body: { gameType: 'space_invaders', stakeAmount: 30 },
    headers: { Authorization: `Bearer ${winner.token}` }
  });
  const roomId = createRes.body.room.id;

  await invoke('POST', '/api/minigames/party/join', {
    body: { roomId },
    headers: { Authorization: `Bearer ${loser.token}` }
  });

  await invoke('POST', `/api/minigames/party/${roomId}/start`, {
    headers: { Authorization: `Bearer ${winner.token}` }
  });
  const room = partyRooms.get(roomId);
  room.startTime = Date.now() - 60000;

  // Winner: 3 cleared waves (3 × 860) + 10 kills (200) = 2780; loser: 14 kills in wave 1 = 280
  await invoke('POST', `/api/minigames/party/${roomId}/submit`, {
    body: { score: 2780, aliensKilled: 94, waveReached: 4 },
    headers: { Authorization: `Bearer ${winner.token}` }
  });
  await invoke('POST', `/api/minigames/party/${roomId}/submit`, {
    body: { score: 280, aliensKilled: 14, waveReached: 1 },
    headers: { Authorization: `Bearer ${loser.token}` }
  });

  assert.equal(room.status, 'completed');

  // Verify debt created in The Tab: Loser owes Winner 30 kr
  const winnerSummary = db.getDuelSettlementSummary(winner.id);
  const loserSummary = db.getDuelSettlementSummary(loser.id);

  assert.equal(winnerSummary.totalNet, 30);
  assert.equal(loserSummary.totalNet, -30);
});
