process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import * as db from '../server/db.js';
const { app } = await import('../server/server.js');

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
    db.createUser(id, nickname, token, '👤', nickname, '070' + Math.floor(1000000 + Math.random() * 9000000));
  } catch (e) {}
  return { id, nickname, token };
}

function uid(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

test('Security & Integrity 1 — POST /api/tab/expenses tournament validation', async () => {
  const host = createTestUser('u-host', 'HostUser');
  const part1 = createTestUser('u-part1', 'PartUser1');
  const outsider = createTestUser('u-out', 'OutsiderUser');

  // Host is friends with Part1
  db.addFriend(host.id, part1.id);
  // Part1 is friends with Outsider (so Part1 could share regular expenses with Outsider)
  db.addFriend(part1.id, outsider.id);

  const tourId = uid('tour');
  const shareCode = 'T' + Math.random().toString(36).substring(2, 6).toUpperCase();
  db.createTournament(tourId, 'Active Tournament', shareCode, host.id, 'friends');
  db.addTournamentParticipant(tourId, part1.nickname, part1.id);

  // 1. Non-existent tournament
  const resNotFound = await invoke('POST', '/api/tab/expenses', {
    headers: { Authorization: `Bearer ${host.token}` },
    body: {
      title: 'Bar Bill',
      totalAmount: 200,
      participantIds: [part1.id],
      tournamentId: 'completely-bogus-tour-id'
    }
  });
  assert.equal(resNotFound.status, 404);
  assert.match(resNotFound.body.error, /Turneringen hittades inte/);

  // 2. Settled tournament
  const settledTourId = uid('settled-tour');
  const settledCode = 'S' + Math.random().toString(36).substring(2, 6).toUpperCase();
  db.createTournament(settledTourId, 'Settled Tour', settledCode, host.id, 'friends');
  db.settleTournament(settledTourId);

  const resSettled = await invoke('POST', '/api/tab/expenses', {
    headers: { Authorization: `Bearer ${host.token}` },
    body: {
      title: 'Old Bill',
      totalAmount: 200,
      participantIds: [part1.id],
      tournamentId: settledTourId
    }
  });
  assert.equal(resSettled.status, 400);
  assert.match(resSettled.body.error, /Turneringen är avslutad/);

  // 3. User who does NOT participate in tournament attempts to inject expense
  const resOutsider = await invoke('POST', '/api/tab/expenses', {
    headers: { Authorization: `Bearer ${outsider.token}` },
    body: {
      title: 'Injected Bill',
      totalAmount: 150,
      participantIds: [part1.id],
      tournamentId: tourId
    }
  });
  assert.equal(resOutsider.status, 403);

  // 4. Participant on expense does NOT belong to tournament
  // Part1 tries to include Outsider (who is friend of Part1, but not in tournament)
  const resNonPart = await invoke('POST', '/api/tab/expenses', {
    headers: { Authorization: `Bearer ${part1.token}` },
    body: {
      title: 'Mixed Bill',
      totalAmount: 300,
      participantIds: [outsider.id],
      tournamentId: tourId
    }
  });
  assert.equal(resNonPart.status, 400);
  assert.match(resNonPart.body.error, /Alla deltagare på ett turneringsutlägg måste delta i turneringen/);

  // 5. Valid tournament expense succeeds
  const resValid = await invoke('POST', '/api/tab/expenses', {
    headers: { Authorization: `Bearer ${host.token}` },
    body: {
      title: 'Valid Dinner',
      totalAmount: 200,
      participantIds: [part1.id],
      tournamentId: tourId
    }
  });
  assert.equal(resValid.status, 200);
  assert.equal(resValid.body.tournament_id, tourId);
});

test('Security & Integrity 2 — POST /api/duels tournament validation', async () => {
  const host = createTestUser('u-dhost', 'DuelHost');
  const part1 = createTestUser('u-dpart', 'DuelPart');
  const outsider = createTestUser('u-dout', 'DuelOut');

  db.addFriend(host.id, part1.id);
  db.addFriend(part1.id, outsider.id);

  const tourId = uid('dtour');
  const shareCode = 'D' + Math.random().toString(36).substring(2, 6).toUpperCase();
  db.createTournament(tourId, 'Duel Tournament', shareCode, host.id, 'friends');
  db.addTournamentParticipant(tourId, part1.nickname, part1.id);

  // 1. Outsider cannot create tournament duel
  const resOutsider = await invoke('POST', '/api/duels', {
    headers: { Authorization: `Bearer ${outsider.token}` },
    body: {
      gameType: 'dice',
      opponentId: part1.id,
      stakeAmount: 50,
      tournamentId: tourId
    }
  });
  assert.equal(resOutsider.status, 403);

  // 2. Opponent outside tournament is rejected
  const resBadOpponent = await invoke('POST', '/api/duels', {
    headers: { Authorization: `Bearer ${part1.token}` },
    body: {
      gameType: 'dice',
      opponentId: outsider.id,
      stakeAmount: 50,
      tournamentId: tourId
    }
  });
  assert.equal(resBadOpponent.status, 400);
  assert.match(resBadOpponent.body.error, /Motståndaren måste delta i turneringen/);

  // 3. Valid tournament duel succeeds
  const resValid = await invoke('POST', '/api/duels', {
    headers: { Authorization: `Bearer ${host.token}` },
    body: {
      gameType: 'dice',
      opponentId: part1.id,
      stakeAmount: 50,
      tournamentId: tourId
    }
  });
  assert.equal(resValid.status, 200);
  assert.equal(resValid.body.duel.tournament_id, tourId);
});

test('Security & Integrity 3 — Tournament duel cannot be individually settled via /api/duels/:id/settle', async () => {
  const host = createTestUser('u-shost', 'SettleHost');
  const part1 = createTestUser('u-spart', 'SettlePart');

  const tourId = uid('stour');
  const shareCode = 'S' + Math.random().toString(36).substring(2, 6).toUpperCase();
  db.createTournament(tourId, 'Settle Tournament', shareCode, host.id, 'friends');
  db.addTournamentParticipant(tourId, part1.nickname, part1.id);

  const tourDuel = db.createDuel({
    gameType: 'dice',
    creatorId: host.id,
    opponentId: part1.id,
    stakeAmount: 50,
    mode: 'table',
    tournamentId: tourId
  });

  db.submitDuelResult({
    duelId: tourDuel.id,
    creatorScore: 6,
    opponentScore: 2,
    winnerId: host.id
  });

  const resSettle = await invoke('POST', `/api/duels/${tourDuel.id}/settle`, {
    headers: { Authorization: `Bearer ${host.token}` }
  });
  assert.equal(resSettle.status, 400);
  assert.match(resSettle.body.error, /Denna duell ingår i en turnering och avräknas samlat under THE TAB/);

  const checkDuel = db.getDuelById(tourDuel.id);
  assert.equal(checkDuel.is_settled, 0);
});

test('Security & Integrity 4 — Swishlistan bulk settlement isolates tournament duels & rejects debtor', async () => {
  const creditor = createTestUser('u-cred', 'Creditor');
  const debtor = createTestUser('u-deb', 'Debtor');

  db.addFriend(creditor.id, debtor.id);

  const tourId = uid('itour');
  const shareCode = 'I' + Math.random().toString(36).substring(2, 6).toUpperCase();
  db.createTournament(tourId, 'Isolation Tournament', shareCode, creditor.id, 'friends');
  db.addTournamentParticipant(tourId, debtor.nickname, debtor.id);

  // Create a tournament duel where debtor owes creditor 100 kr
  const tourDuel = db.createDuel({
    gameType: 'dice',
    creatorId: creditor.id,
    opponentId: debtor.id,
    stakeAmount: 100,
    mode: 'table',
    tournamentId: tourId
  });
  db.submitDuelResult({
    duelId: tourDuel.id,
    creatorScore: 5,
    opponentScore: 1,
    winnerId: creditor.id
  });

  // Debtor attempts to settle-with creditor when NO standalone duels exist
  const resDebtorAttempt = await invoke('POST', `/api/duels/settle-with/${creditor.id}`, {
    headers: { Authorization: `Bearer ${debtor.token}` }
  });
  // Must reject (no standalone unsettled duels in Swishlistan)
  assert.equal(resDebtorAttempt.status, 400);
  assert.match(resDebtorAttempt.body.error, /Det finns inga okvitterade dueller att kvittera med denna vän/);

  // Tournament duel MUST still be is_settled = 0
  assert.equal(db.getDuelById(tourDuel.id).is_settled, 0);

  // Now create a standalone duel between them where debtor owes creditor 50 kr
  const standaloneDuel = db.createDuel({
    gameType: 'dice',
    creatorId: creditor.id,
    opponentId: debtor.id,
    stakeAmount: 50,
    mode: 'table'
  });
  db.submitDuelResult({
    duelId: standaloneDuel.id,
    creatorScore: 4,
    opponentScore: 2,
    winnerId: creditor.id
  });

  // Debtor attempts to settle the standalone debt (netAmount < 0)
  const resDebtorAttempt2 = await invoke('POST', `/api/duels/settle-with/${creditor.id}`, {
    headers: { Authorization: `Bearer ${debtor.token}` }
  });
  assert.equal(resDebtorAttempt2.status, 403);
  assert.match(resDebtorAttempt2.body.error, /Endast mottagaren\/borgenären kan kvittera denna skuld/);

  // Creditor settles the standalone debt in Swishlistan
  const resCreditorSettle = await invoke('POST', `/api/duels/settle-with/${debtor.id}`, {
    headers: { Authorization: `Bearer ${creditor.token}` }
  });
  assert.equal(resCreditorSettle.status, 200);

  // Standalone duel is settled:
  assert.equal(db.getDuelById(standaloneDuel.id).is_settled, 1);

  // CRITICAL INVARIANT: Tournament duel MUST REMAIN is_settled = 0!
  assert.equal(db.getDuelById(tourDuel.id).is_settled, 0);
});
