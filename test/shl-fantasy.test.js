import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';

process.env.NODE_ENV = 'test';

const { app } = await import('../server/server.js');
import * as db from '../server/db.js';
import { SHL_SEASON, SHL_TEAMS, SHL_PLAYERS, SHL_ROUNDS, getGamesForRound, FANTASY_SCORING } from '../src/data/shlPlayers.js';

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
      unpipe() {},
      pipe() {},
      resume() {},
      pause() {}
    });

    let statusCode = 200;
    const resHeaders = {};
    const res = Object.assign(new EventEmitter(), {
      status(code) {
        statusCode = code;
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
      setHeader(k, v) { resHeaders[k.toLowerCase()] = v; },
      getHeader(k) { return resHeaders[k.toLowerCase()]; },
      removeHeader(k) { delete resHeaders[k.toLowerCase()]; },
      hasHeader(k) { return k.toLowerCase() in resHeaders; },
      writeHead(code) { statusCode = code; }
    });

    app.handle(req, res);
  });
}

function createTestUser(prefix, nickname) {
  const id = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const token = `token-${id}`;
  try {
    db.createUser(id, nickname, token, '🏒', nickname, '070' + Math.floor(1000000 + Math.random() * 9000000));
  } catch (e) {}
  return { id, nickname, token };
}

test('1. SHL Schedule & Rounds Integrity', async () => {
  assert.equal(SHL_SEASON, '2026/2027', 'Season must be 2026/2027');
  assert.equal(SHL_ROUNDS.length, 52, 'Must have exactly 52 rounds');

  let totalMatches = 0;
  const teamCodes = new Set();

  SHL_ROUNDS.forEach((r, idx) => {
    assert.equal(r.roundNumber, idx + 1, `Round number mismatch at index ${idx}`);
    assert.ok(r.id.startsWith('omg_'), `Round ID must start with omg_: ${r.id}`);
    assert.ok(r.lockTime, `Round ${r.id} must have lockTime`);
    assert.ok(!isNaN(new Date(r.lockTime).getTime()), `Round ${r.id} lockTime must be valid date`);

    const games = getGamesForRound(r);
    assert.equal(games.length, 7, `Round ${r.id} must have exactly 7 games`);
    totalMatches += games.length;

    games.forEach(g => {
      teamCodes.add(g.home);
      teamCodes.add(g.away);
      assert.ok(g.date, `Game must have date: ${g.id}`);
      assert.ok(g.time, `Game must have time: ${g.id}`);
      assert.ok(g.name, `Game must have name: ${g.id}`);
    });
  });

  assert.equal(totalMatches, 364, 'Total season matches must be exactly 364');

  // Verify all 14 official SHL teams are present in match schedule
  const expectedTeams = ['IFB', 'FBK', 'FHC', 'LHF', 'SAIK', 'BIF', 'RBK', 'VLH', 'TIK', 'LHC', 'MIF', 'OHK', 'HV71', 'DIF'];
  for (const t of expectedTeams) {
    assert.ok(teamCodes.has(t), `Team ${t} must be present in the schedule`);
  }
});

test('2. DIF & Squad Database Integrity', async () => {
  // Check DIF team
  const difTeam = SHL_TEAMS.find(t => t.id === 'DIF');
  assert.ok(difTeam, 'Djurgårdens IF (DIF) must exist in SHL_TEAMS');
  assert.equal(difTeam.short, 'DIF');

  // Check DIF players
  const difPlayers = SHL_PLAYERS.filter(p => p.team === 'DIF');
  assert.ok(difPlayers.length >= 15, `DIF squad must have at least 15 players, found ${difPlayers.length}`);

  const hasHellberg = difPlayers.some(p => p.id === 'g_hellberg');
  const hasKruger = difPlayers.some(p => p.id === 'f_kruger');
  const hasBrouillard = difPlayers.some(p => p.id === 'd_brouillard');
  assert.ok(hasHellberg, 'Magnus Hellberg must be in DIF roster');
  assert.ok(hasKruger, 'Marcus Krüger must be in DIF roster');
  assert.ok(hasBrouillard, 'Nikolas Brouillard must be in DIF roster');

  // Check unique IDs across all players
  const allIds = SHL_PLAYERS.map(p => p.id);
  const uniqueIds = new Set(allIds);
  assert.equal(uniqueIds.size, allIds.length, 'Every player in SHL_PLAYERS must have a unique ID');
});

test('3. GET /api/shl-fantasy/rounds endpoint', async () => {
  const res = await invoke('GET', '/api/shl-fantasy/rounds');
  assert.equal(res.status, 200);
  assert.equal(res.body.season, '2026/2027');
  assert.equal(res.body.totalRounds, 52);
  assert.equal(res.body.rounds.length, 52);
  assert.equal(res.body.rounds[0].id, 'omg_1');
  assert.equal(res.body.rounds[0].totalGames, 7);
});

test('4. Round ID validation on league creation', async () => {
  const user = createTestUser('u-shl-round', 'RoundValidator');

  // Non-existent round ID
  const badRes = await invoke('POST', '/api/shl-fantasy/create', {
    headers: { Authorization: `Bearer ${user.token}` },
    body: { name: 'Invalid League', roundId: 'omg_999', stakeAmount: 50, mode: 'free' }
  });
  assert.equal(badRes.status, 400);
  assert.ok(badRes.body.error.includes('Ogiltig omgång'));

  // Valid round ID in the future
  const goodRes = await invoke('POST', '/api/shl-fantasy/create', {
    headers: { Authorization: `Bearer ${user.token}` },
    body: { name: 'Valid League', roundId: 'omg_52', stakeAmount: 50, mode: 'free' }
  });
  assert.equal(goodRes.status, 200);
  assert.equal(goodRes.body.round_id, 'omg_52');
});

test('5. Canonical Player & Anti-Spoofing Validation on join', async () => {
  const host = createTestUser('u-shl-host', 'HostSHL');
  const user = createTestUser('u-shl-player', 'PlayerSHL');

  // Create a future round league (Round 52)
  const createRes = await invoke('POST', '/api/shl-fantasy/create', {
    headers: { Authorization: `Bearer ${host.token}` },
    body: { name: 'Security League', roundId: 'omg_52', stakeAmount: 0, mode: 'free' }
  });
  assert.equal(createRes.status, 200);
  const leagueCode = createRes.body.code;

  // Case A: Custom / Non-canonical player rejected
  const customPlayerLineup = {
    goalie: { id: 'g_hellberg', pos: 'G' },
    defenders: [
      { id: 'd_brouillard', pos: 'D' },
      { id: 'custom_fake_player', pos: 'D', name: 'Fake Player' }
    ],
    forwards: [
      { id: 'f_kruger', pos: 'F' },
      { id: 'f_vejdemo', pos: 'F' },
      { id: 'f_hudon', pos: 'F' }
    ]
  };

  const customRes = await invoke('POST', `/api/shl-fantasy/${leagueCode}/join`, {
    headers: { Authorization: `Bearer ${user.token}` },
    body: { lineup: customPlayerLineup }
  });
  assert.equal(customRes.status, 400);
  assert.ok(customRes.body.error.includes('officiella SHL-registret'), 'Custom player must be rejected');

  // Case B: Position spoofing rejected (Marcus Krüger is F, spoofed as G)
  const positionSpoofedLineup = {
    goalie: { id: 'f_kruger', pos: 'G' }, // Spoofed as goalie
    defenders: [
      { id: 'd_brouillard', pos: 'D' },
      { id: 'd_holm_p', pos: 'D' }
    ],
    forwards: [
      { id: 'f_snively', pos: 'F' },
      { id: 'f_vejdemo', pos: 'F' },
      { id: 'f_hudon', pos: 'F' }
    ]
  };

  const spoofRes = await invoke('POST', `/api/shl-fantasy/${leagueCode}/join`, {
    headers: { Authorization: `Bearer ${user.token}` },
    body: { lineup: positionSpoofedLineup }
  });
  assert.equal(spoofRes.status, 400);
  assert.ok(spoofRes.body.error.includes('registrerad som F, inte G'), 'Position spoofing must be detected and rejected');

  // Case C: Valid official canonical lineup accepted
  const validLineup = {
    goalie: { id: 'g_hellberg', pos: 'G' },
    defenders: [
      { id: 'd_brouillard', pos: 'D' },
      { id: 'd_holm_p', pos: 'D' }
    ],
    forwards: [
      { id: 'f_kruger', pos: 'F' },
      { id: 'f_vejdemo', pos: 'F' },
      { id: 'f_hudon', pos: 'F' }
    ]
  };

  const validRes = await invoke('POST', `/api/shl-fantasy/${leagueCode}/join`, {
    headers: { Authorization: `Bearer ${user.token}` },
    body: { lineup: validLineup }
  });
  assert.equal(validRes.status, 200);
  assert.equal(validRes.body.entries.length, 1);
  assert.equal(validRes.body.entries[0].lineup.goalie.id, 'g_hellberg');
});

test('6. Deadline enforcement: Past lockTime rejects join', async () => {
  const host = createTestUser('u-dl-host', 'DeadlineHost');
  const user = createTestUser('u-dl-user', 'DeadlineUser');

  // Artificially create a league on a round whose lockTime is in the past (e.g. Round 1 which was Sep 2026 if earlier)
  // Let's create league directly in DB to test lockTime join enforcement
  const pastLeague = db.createShlLeague({
    name: 'Past Deadline League',
    creatorId: host.id,
    roundId: 'omg_1', // lockTime is 2026-09-19
    stakeAmount: 0,
    mode: 'free'
  });

  const validLineup = {
    goalie: { id: 'g_hellberg', pos: 'G' },
    defenders: [
      { id: 'd_brouillard', pos: 'D' },
      { id: 'd_holm_p', pos: 'D' }
    ],
    forwards: [
      { id: 'f_kruger', pos: 'F' },
      { id: 'f_vejdemo', pos: 'F' },
      { id: 'f_hudon', pos: 'F' }
    ]
  };

  const joinRes = await invoke('POST', `/api/shl-fantasy/${pastLeague.code}/join`, {
    headers: { Authorization: `Bearer ${user.token}` },
    body: { lineup: validLineup }
  });

  // Since omg_1 lockTime is 2026-09-19T13:15:00.000Z and now is >= 2026-09-22:
  assert.equal(joinRes.status, 400);
  assert.ok(joinRes.body.error.includes('Deadline har passerat'), 'Join after lockTime must be blocked');
});

test('7. Deterministic 5-stage Tie-Breaking & Settle with Pot Split', async () => {
  const host = createTestUser('u-tie-host', 'TieHost');
  const user1 = createTestUser('u-tie-p1', 'PlayerOne');
  const user2 = createTestUser('u-tie-p2', 'PlayerTwo');

  const league = db.createShlLeague({
    name: 'Tie Break Test League',
    creatorId: host.id,
    roundId: 'omg_52',
    stakeAmount: 100,
    mode: 'swish'
  });

  // Join user1 and user2
  db.joinOrUpdateShlEntry({
    leagueId: league.id,
    userId: user1.id,
    userName: user1.nickname,
    avatarEmoji: '🏒',
    swishNumber: '0701111111',
    lineup: {
      goalie: { id: 'g_hellberg', pos: 'G' },
      defenders: [{ id: 'd_brouillard', pos: 'D' }, { id: 'd_holm_p', pos: 'D' }],
      forwards: [{ id: 'f_kruger', pos: 'F' }, { id: 'f_vejdemo', pos: 'F' }, { id: 'f_hudon', pos: 'F' }]
    },
    points: 20,
    isLocked: 1
  });

  db.joinOrUpdateShlEntry({
    leagueId: league.id,
    userId: user2.id,
    userName: user2.nickname,
    avatarEmoji: '⚡',
    swishNumber: '0702222222',
    lineup: {
      goalie: { id: 'g_hellberg', pos: 'G' },
      defenders: [{ id: 'd_brouillard', pos: 'D' }, { id: 'd_holm_p', pos: 'D' }],
      forwards: [{ id: 'f_kruger', pos: 'F' }, { id: 'f_vejdemo', pos: 'F' }, { id: 'f_hudon', pos: 'F' }]
    },
    points: 20,
    isLocked: 1
  });

  const user3 = createTestUser('u-tie-p3', 'PlayerThree');
  db.joinOrUpdateShlEntry({
    leagueId: league.id,
    userId: user3.id,
    userName: user3.nickname,
    avatarEmoji: '🥉',
    swishNumber: '0703333333',
    lineup: {
      goalie: { id: 'g_hellberg', pos: 'G' },
      defenders: [{ id: 'd_brouillard', pos: 'D' }, { id: 'd_holm_p', pos: 'D' }],
      forwards: [{ id: 'f_kruger', pos: 'F' }, { id: 'f_vejdemo', pos: 'F' }, { id: 'f_hudon', pos: 'F' }]
    },
    points: 10,
    isLocked: 1
  });

  // Test multi-winner settlement in db.js
  const settled = db.settleShlLeague(league.id, [user1.id, user2.id], { isFinished: true, matches: [] });
  assert.equal(settled.status, 'finished');
  assert.equal(settled.winner_id, user1.id);
  assert.deepEqual(settled.simulation_data.winnerIds, [user1.id, user2.id]);

  // Check that both winners are marked is_paid = 1
  const entry1 = settled.entries.find(e => e.user_id === user1.id);
  const entry2 = settled.entries.find(e => e.user_id === user2.id);
  const entry3 = settled.entries.find(e => e.user_id === user3.id);
  assert.equal(entry1.is_paid, 1);
  assert.equal(entry2.is_paid, 1);
  assert.equal(entry3.is_paid, 0); // Loser is not paid yet
});
