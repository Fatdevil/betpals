import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';

process.env.NODE_ENV = 'test';

// Import server helpers
const {
  app,
  assignMafiaRoles,
  sanitizeMafiaRoomForBroadcast,
  evaluateMafiaWinner,
  resolveMafiaDebts,
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
      // Stream compatibility for helmet/finalhandler
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

// Helper to seed users and get tokens
function createTestUser(prefix, nickname) {
  const id = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const token = `token-${id}`;
  try {
    db.createUser(id, nickname, token, '👤', nickname, '0700000000');
  } catch (e) {}
  return { id, nickname, token };
}

test('Finding 1 — Data Sanitization: Roles & Night Actions never leaked publicly', async () => {
  const host = createTestUser('u-host-1', 'HostPlayer');
  const p2 = createTestUser('u-p2-1', 'MafiaPlayer');
  const p3 = createTestUser('u-p3-1', 'DetPlayer');
  const p4 = createTestUser('u-p4-1', 'DocPlayer');

  const roomId = 'room-audit-1';
  const roomCode = 'MA01';
  const room = {
    id: roomId,
    code: roomCode,
    gameType: 'mafia',
    hostId: host.id,
    status: 'mafia_running',
    stakeAmount: 50,
    players: [
      { id: host.id, nickname: host.nickname, isHost: true },
      { id: p2.id, nickname: p2.nickname, isHost: false },
      { id: p3.id, nickname: p3.nickname, isHost: false },
      { id: p4.id, nickname: p4.nickname, isHost: false }
    ],
    mafiaState: {
      narratorMode: 'ai',
      phase: 'night',
      roundNumber: 1,
      subPhase: 'mafia',
      roles: {
        [host.id]: { role: 'villager', isAlive: true, nickname: host.nickname, avatarEmoji: '👤' },
        [p2.id]: { role: 'mafia', isAlive: true, nickname: p2.nickname, avatarEmoji: '👤' },
        [p3.id]: { role: 'detective', isAlive: true, nickname: p3.nickname, avatarEmoji: '👤' },
        [p4.id]: { role: 'doctor', isAlive: false, nickname: p4.nickname, avatarEmoji: '👤' }
      },
      nightActions: {
        mafiaTargetId: host.id,
        mafiaVotes: { [p2.id]: host.id },
        detectiveCheckedId: p2.id,
        detectiveResult: 'mafia',
        doctorProtectedId: host.id
      },
      dayVotes: {},
      voteCounts: {},
      winner: null
    }
  };

  partyRooms.set(roomId, room);
  partyCodeToId.set(roomCode, roomId);

  // 1. Direct unit test of sanitizeMafiaRoomForBroadcast
  const sanitized = sanitizeMafiaRoomForBroadcast(room);
  assert.equal(sanitized.mafiaState.nightActions, undefined, 'nightActions must not be in broadcast');
  assert.equal(sanitized.mafiaState.roles[host.id].role, null, 'Living player role must be null');
  assert.equal(sanitized.mafiaState.roles[p2.id].role, null, 'Living mafia role must be null');
  assert.equal(sanitized.mafiaState.roles[p3.id].role, null, 'Living detective role must be null');
  assert.equal(sanitized.mafiaState.roles[p4.id].role, 'doctor', 'Dead player role is revealed');

  // 2. HTTP test of GET /api/minigames/party/:query
  const res = await invoke('GET', `/api/minigames/party/${roomCode}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.room, 'Room returned');
  assert.equal(res.body.room.mafiaState.nightActions, undefined, 'Public party endpoint must NOT leak nightActions');
  assert.equal(res.body.room.mafiaState.roles[host.id].role, null, 'Public endpoint must NOT leak living roles');
  assert.equal(res.body.room.mafiaState.roles[p4.id].role, 'doctor', 'Dead role is public');
});

test('Finding 10 & 6 — Role Distribution & Minimum Player Validation', () => {
  // 4 active players (AI mode): 1 mafia, 1 detective, 0 doctor, 2 villagers
  const p4 = [
    { id: '1', nickname: 'P1' },
    { id: '2', nickname: 'P2' },
    { id: '3', nickname: 'P3' },
    { id: '4', nickname: 'P4' }
  ];
  const r4 = assignMafiaRoles(p4, 'ai', null);
  const roles4 = Object.values(r4).map(p => p.role);
  assert.equal(roles4.filter(r => r === 'mafia').length, 1, '4 players: 1 mafia');
  assert.equal(roles4.filter(r => r === 'detective').length, 1, '4 players: 1 detective');
  assert.equal(roles4.filter(r => r === 'doctor').length, 0, '4 players: 0 doctor');
  assert.equal(roles4.filter(r => r === 'villager').length, 2, '4 players: 2 villagers');

  // 5 active players (AI mode): 1 mafia, 1 detective, 1 doctor, 2 villagers
  const p5 = [...p4, { id: '5', nickname: 'P5' }];
  const r5 = assignMafiaRoles(p5, 'ai', null);
  const roles5 = Object.values(r5).map(p => p.role);
  assert.equal(roles5.filter(r => r === 'doctor').length, 1, '5 players: 1 doctor');

  // 7 active players: 2 mafia
  const p7 = [...p5, { id: '6', nickname: 'P6' }, { id: '7', nickname: 'P7' }];
  const r7 = assignMafiaRoles(p7, 'ai', null);
  const roles7 = Object.values(r7).map(p => p.role);
  assert.equal(roles7.filter(r => r === 'mafia').length, 2, '7 players: 2 mafia');

  // 10 active players: 3 mafia
  const p10 = [...p7, { id: '8', nickname: 'P8' }, { id: '9', nickname: 'P9' }, { id: '10', nickname: 'P10' }];
  const r10 = assignMafiaRoles(p10, 'ai', null);
  const roles10 = Object.values(r10).map(p => p.role);
  assert.equal(roles10.filter(r => r === 'mafia').length, 3, '10 players: 3 mafia');

  // 15 active players: 4 mafia
  const p15 = [...p10, { id: '11', nickname: 'P11' }, { id: '12', nickname: 'P12' }, { id: '13', nickname: 'P13' }, { id: '14', nickname: 'P14' }, { id: '15', nickname: 'P15' }];
  const r15 = assignMafiaRoles(p15, 'ai', null);
  const roles15 = Object.values(r15).map(p => p.role);
  assert.equal(roles15.filter(r => r === 'mafia').length, 4, '15 players: 4 mafia');

  // Human Narrator Mode: Host is assigned 'narrator', excluded from active roles
  const rHuman = assignMafiaRoles(p5, 'human', '1');
  assert.equal(rHuman['1'].role, 'narrator', 'Host is assigned narrator');
  const activeRolesHuman = Object.entries(rHuman).filter(([id]) => id !== '1').map(([, p]) => p.role);
  assert.equal(activeRolesHuman.length, 4, '4 active players remain');
});

test('Finding 5 & 6 — Start Validation (gameType, status, player counts for narrator modes)', async () => {
  const host = createTestUser('u-host-start', 'HostStart');
  const p2 = createTestUser('u-p2-start', 'P2');
  const p3 = createTestUser('u-p3-start', 'P3');
  const p4 = createTestUser('u-p4-start', 'P4');

  const roomId = 'room-start-test';
  partyRooms.set(roomId, {
    id: roomId,
    gameType: 'blind10', // Wrong game type
    hostId: host.id,
    status: 'lobby',
    players: [host, p2, p3, p4]
  });

  // Reject wrong gameType
  let res = await invoke('POST', `/api/minigames/mafia/${roomId}/start`, {
    headers: { Authorization: `Bearer ${host.token}` },
    body: { narratorMode: 'ai' }
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /inte ett Maffiaspel/);

  // Correct gameType, but test human narrator with only 4 players (needs 5)
  partyRooms.get(roomId).gameType = 'mafia';
  res = await invoke('POST', `/api/minigames/mafia/${roomId}/start`, {
    headers: { Authorization: `Bearer ${host.token}` },
    body: { narratorMode: 'human' }
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /5 spelare krävs/);

  // Successfully start with 4 players in AI mode
  res = await invoke('POST', `/api/minigames/mafia/${roomId}/start`, {
    headers: { Authorization: `Bearer ${host.token}` },
    body: { narratorMode: 'ai' }
  });
  assert.equal(res.status, 200);

  // Attempting to start again should fail because status is no longer 'lobby'
  res = await invoke('POST', `/api/minigames/mafia/${roomId}/start`, {
    headers: { Authorization: `Bearer ${host.token}` },
    body: { narratorMode: 'ai' }
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /redan startat/);
});

test('Finding 2 & 11 — Night Action Validation & Friendly Fire Prevention', async () => {
  const host = createTestUser('u-host-night', 'HostNight');
  const m1 = createTestUser('u-m1-night', 'Mafia1');
  const m2 = createTestUser('u-m2-night', 'Mafia2');
  const v1 = createTestUser('u-v1-night', 'Villager1');
  const deadV = createTestUser('u-dead-night', 'DeadGuy');

  const roomId = 'room-night-test';
  partyRooms.set(roomId, {
    id: roomId,
    gameType: 'mafia',
    hostId: host.id,
    status: 'mafia_running',
    players: [host, m1, m2, v1, deadV],
    mafiaState: {
      narratorMode: 'ai',
      phase: 'night',
      roundNumber: 1,
      subPhase: 'mafia',
      roles: {
        [host.id]: { role: 'villager', isAlive: true, nickname: host.nickname },
        [m1.id]: { role: 'mafia', isAlive: true, nickname: m1.nickname },
        [m2.id]: { role: 'mafia', isAlive: true, nickname: m2.nickname },
        [v1.id]: { role: 'villager', isAlive: true, nickname: v1.nickname },
        [deadV.id]: { role: 'villager', isAlive: false, nickname: deadV.nickname }
      },
      nightActions: {
        mafiaTargetId: null,
        mafiaVotes: {},
        detectiveCheckedId: null,
        detectiveResult: null,
        doctorProtectedId: null
      },
      dayVotes: {},
      voteCounts: {}
    }
  });

  // 1. Mafia cannot target fellow mafia member (friendly fire)
  let res = await invoke('POST', `/api/minigames/mafia/${roomId}/night-action`, {
    headers: { Authorization: `Bearer ${m1.token}` },
    body: { actionType: 'mafia_kill', targetId: m2.id }
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /inte mörda sina egna medlemmar/);

  // 2. Mafia cannot target a dead player
  res = await invoke('POST', `/api/minigames/mafia/${roomId}/night-action`, {
    headers: { Authorization: `Bearer ${m1.token}` },
    body: { actionType: 'mafia_kill', targetId: deadV.id }
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /redan utslagen/);

  // 3. Night action rejected if phase is not 'night'
  partyRooms.get(roomId).mafiaState.phase = 'day';
  res = await invoke('POST', `/api/minigames/mafia/${roomId}/night-action`, {
    headers: { Authorization: `Bearer ${m1.token}` },
    body: { actionType: 'mafia_kill', targetId: v1.id }
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /endast utföras under natten/);
});

test('Finding 4 — Multi-Mafia Majority Voting (not last-writer-wins)', async () => {
  const host = createTestUser('u-host-vote', 'HostVote');
  const m1 = createTestUser('u-m1-vote', 'MafiaOne');
  const m2 = createTestUser('u-m2-vote', 'MafiaTwo');
  const m3 = createTestUser('u-m3-vote', 'MafiaThree');
  const targetA = createTestUser('u-tA-vote', 'TargetA');
  const targetB = createTestUser('u-tB-vote', 'TargetB');

  const roomId = 'room-multi-mafia';
  partyRooms.set(roomId, {
    id: roomId,
    gameType: 'mafia',
    hostId: host.id,
    status: 'mafia_running',
    players: [host, m1, m2, m3, targetA, targetB],
    mafiaState: {
      narratorMode: 'ai',
      phase: 'night',
      roundNumber: 1,
      subPhase: 'mafia',
      roles: {
        [host.id]: { role: 'villager', isAlive: true, nickname: host.nickname },
        [m1.id]: { role: 'mafia', isAlive: true, nickname: m1.nickname },
        [m2.id]: { role: 'mafia', isAlive: true, nickname: m2.nickname },
        [m3.id]: { role: 'mafia', isAlive: true, nickname: m3.nickname },
        [targetA.id]: { role: 'villager', isAlive: true, nickname: targetA.nickname },
        [targetB.id]: { role: 'villager', isAlive: true, nickname: targetB.nickname }
      },
      nightActions: {
        mafiaTargetId: null,
        mafiaVotes: {},
        detectiveCheckedId: null,
        detectiveResult: null,
        doctorProtectedId: null
      },
      dayVotes: {},
      voteCounts: {}
    }
  });

  // M1 votes for Target A
  await invoke('POST', `/api/minigames/mafia/${roomId}/night-action`, {
    headers: { Authorization: `Bearer ${m1.token}` },
    body: { actionType: 'mafia_kill', targetId: targetA.id }
  });

  // M2 votes for Target A
  await invoke('POST', `/api/minigames/mafia/${roomId}/night-action`, {
    headers: { Authorization: `Bearer ${m2.token}` },
    body: { actionType: 'mafia_kill', targetId: targetA.id }
  });

  // M3 votes last for Target B
  await invoke('POST', `/api/minigames/mafia/${roomId}/night-action`, {
    headers: { Authorization: `Bearer ${m3.token}` },
    body: { actionType: 'mafia_kill', targetId: targetB.id }
  });

  // Target A has 2 votes, Target B has 1 vote.
  // Prior bug: last writer M3 set mafiaTargetId to Target B.
  // Fixed logic: majority target is Target A.
  const state = partyRooms.get(roomId).mafiaState;
  assert.equal(state.nightActions.mafiaTargetId, targetA.id, 'Majority vote (2 vs 1) must decide mafia kill target');

  // Advance to morning
  await invoke('POST', `/api/minigames/mafia/${roomId}/advance-phase`, {
    headers: { Authorization: `Bearer ${host.token}` },
    body: { expectedPhase: 'night' }
  });

  assert.equal(state.roles[targetA.id].isAlive, false, 'Target A was eliminated by majority vote');
  assert.equal(state.roles[targetB.id].isAlive, true, 'Target B survived');
});

test('Finding 8 — Day Voting Validation & Synchronized Vote Counts', async () => {
  const host = createTestUser('u-host-day', 'HostDay');
  const p1 = createTestUser('u-p1-day', 'Player1');
  const p2 = createTestUser('u-p2-day', 'Player2');
  const deadP = createTestUser('u-dead-day', 'DeadPlayer');

  const roomId = 'room-day-vote';
  partyRooms.set(roomId, {
    id: roomId,
    gameType: 'mafia',
    hostId: host.id,
    status: 'mafia_running',
    players: [host, p1, p2, deadP],
    mafiaState: {
      narratorMode: 'ai',
      phase: 'day',
      roles: {
        [host.id]: { role: 'villager', isAlive: true, nickname: host.nickname },
        [p1.id]: { role: 'villager', isAlive: true, nickname: p1.nickname },
        [p2.id]: { role: 'villager', isAlive: true, nickname: p2.nickname },
        [deadP.id]: { role: 'villager', isAlive: false, nickname: deadP.nickname }
      },
      dayVotes: {},
      voteCounts: {}
    }
  });

  // 1. Dead player cannot vote
  let res = await invoke('POST', `/api/minigames/mafia/${roomId}/vote`, {
    headers: { Authorization: `Bearer ${deadP.token}` },
    body: { targetId: p1.id }
  });
  assert.equal(res.status, 403);
  assert.match(res.body.error, /Döda spelare har inte rösträtt/);

  // 2. Cannot vote for a dead player
  res = await invoke('POST', `/api/minigames/mafia/${roomId}/vote`, {
    headers: { Authorization: `Bearer ${p1.token}` },
    body: { targetId: deadP.id }
  });
  assert.equal(res.status, 400);

  // 3. Valid vote returns updated voteCounts map
  res = await invoke('POST', `/api/minigames/mafia/${roomId}/vote`, {
    headers: { Authorization: `Bearer ${p1.token}` },
    body: { targetId: p2.id }
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.voteCounts[p2.id], 1, 'voteCounts map accurately reflects target count');
});

test('Finding 12 & 9 — Idempotent Advance Phase & Lynch Result Persistence', async () => {
  const host = createTestUser('u-host-adv', 'HostAdv');
  const p1 = createTestUser('u-p1-adv', 'P1');
  const p2 = createTestUser('u-p2-adv', 'P2');
  const p3 = createTestUser('u-p3-adv', 'P3');

  const roomId = 'room-adv-test';
  partyRooms.set(roomId, {
    id: roomId,
    gameType: 'mafia',
    hostId: host.id,
    status: 'mafia_running',
    players: [host, p1, p2, p3],
    mafiaState: {
      narratorMode: 'ai',
      phase: 'day',
      roles: {
        [host.id]: { role: 'villager', isAlive: true, nickname: host.nickname },
        [p1.id]: { role: 'mafia', isAlive: true, nickname: p1.nickname },
        [p2.id]: { role: 'villager', isAlive: true, nickname: p2.nickname },
        [p3.id]: { role: 'villager', isAlive: true, nickname: p3.nickname }
      },
      dayVotes: {
        [host.id]: p1.id,
        [p2.id]: p1.id
      },
      voteCounts: { [p1.id]: 2 },
      lastLynched: null,
      lastLynchTie: false
    }
  });

  // Advance from day to lynch_result with correct expectedPhase
  let res = await invoke('POST', `/api/minigames/mafia/${roomId}/advance-phase`, {
    headers: { Authorization: `Bearer ${host.token}` },
    body: { expectedPhase: 'day' }
  });
  assert.equal(res.status, 200);

  const state = partyRooms.get(roomId).mafiaState;
  assert.equal(state.lastLynched?.id, p1.id, 'lastLynched player is persisted on mafiaState');
  assert.equal(state.lastLynchTie, false);

  // Duplicate / race condition call sending expectedPhase: 'day' again should be rejected
  res = await invoke('POST', `/api/minigames/mafia/${roomId}/advance-phase`, {
    headers: { Authorization: `Bearer ${host.token}` },
    body: { expectedPhase: 'day' }
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Fasfel/);
});

test('Finding 3 — Win Condition & Victory State Progression (No Client Lockup)', () => {
  // Villagers win when all mafia are dead
  const rolesV = {
    '1': { role: 'mafia', isAlive: false },
    '2': { role: 'villager', isAlive: true },
    '3': { role: 'detective', isAlive: true }
  };
  assert.equal(evaluateMafiaWinner(rolesV), 'villagers');

  // Mafia wins when alive mafia >= alive villagers
  const rolesM = {
    '1': { role: 'mafia', isAlive: true },
    '2': { role: 'villager', isAlive: true },
    '3': { role: 'villager', isAlive: false }
  };
  assert.equal(evaluateMafiaWinner(rolesM), 'mafia');

  // No winner when villagers outnumber mafia and at least one mafia lives
  const rolesOngoing = {
    '1': { role: 'mafia', isAlive: true },
    '2': { role: 'villager', isAlive: true },
    '3': { role: 'villager', isAlive: true }
  };
  assert.equal(evaluateMafiaWinner(rolesOngoing), null);
});
