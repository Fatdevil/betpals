import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';

process.env.NODE_ENV = 'test';

const { app } = await import('../server/server.js');
import * as db from '../server/db.js';

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

test('Event Deadline & Locking: Expired deadline blocks betting, lock/reopen works', async () => {
  const creator = createTestUser('u-dl-creator', 'GameHost');
  const bettor = createTestUser('u-dl-bettor', 'BettorOne');

  // 1. Create event with deadline in future (1 hour from now)
  const futureDeadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const resEvent = await invoke('POST', '/api/events', {
    headers: { Authorization: `Bearer ${creator.token}` },
    body: {
      name: 'Masters Hål 18',
      players: ['Tiger', 'Rory'],
      minBet: 50,
      maxBet: 500,
      closesAt: futureDeadline
    }
  });

  assert.equal(resEvent.status, 200, 'Event created');
  const event = resEvent.body;
  assert.equal(event.closesAt, futureDeadline);

  // 2. Bettor places bet while open and before deadline
  const resBet1 = await invoke('POST', `/api/events/${event.shareCode}/bets`, {
    headers: { Authorization: `Bearer ${bettor.token}` },
    body: {
      playerId: event.players[0].id,
      amount: 100
    }
  });
  assert.equal(resBet1.status, 200, 'Bet accepted before deadline');

  // 3. Creator updates deadline to past
  const pastDeadline = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const resUpdateDl = await invoke('PUT', `/api/events/${event.id}/deadline`, {
    headers: { Authorization: `Bearer ${creator.token}` },
    body: { closesAt: pastDeadline }
  });
  assert.equal(resUpdateDl.status, 200, 'Deadline updated to past');

  // 4. Placing bet now must fail with 400 (deadline expired)
  const resBetPast = await invoke('POST', `/api/events/${event.shareCode}/bets`, {
    headers: { Authorization: `Bearer ${bettor.token}` },
    body: {
      playerId: event.players[1].id,
      amount: 100
    }
  });
  assert.equal(resBetPast.status, 400, 'Bet rejected when deadline expired');
  assert.match(resBetPast.body.error, /gått ut|stängd|passerat/i);

  // 5. Creator reopens event -> clears closesAt and allows betting again
  const resReopen = await invoke('POST', `/api/events/${event.id}/reopen`, {
    headers: { Authorization: `Bearer ${creator.token}` }
  });
  assert.equal(resReopen.status, 200, 'Event reopened');

  const resBetAfterReopen = await invoke('POST', `/api/events/${event.shareCode}/bets`, {
    headers: { Authorization: `Bearer ${bettor.token}` },
    body: {
      playerId: event.players[1].id,
      amount: 100
    }
  });
  assert.equal(resBetAfterReopen.status, 200, 'Bet accepted after reopen');

  // 6. Creator manually locks event
  const resLock = await invoke('POST', `/api/events/${event.id}/lock`, {
    headers: { Authorization: `Bearer ${creator.token}` }
  });
  assert.equal(resLock.status, 200, 'Event manually locked');

  const resBetLocked = await invoke('POST', `/api/events/${event.shareCode}/bets`, {
    headers: { Authorization: `Bearer ${bettor.token}` },
    body: {
      playerId: event.players[0].id,
      amount: 50
    }
  });
  assert.equal(resBetLocked.status, 400, 'Bet rejected when event is locked');
});

test('Event Boost: Creator can boost open event; enforces 10 min cooldown', async () => {
  const creator = createTestUser('u-boost-host', 'BoostMaster');
  const stranger = createTestUser('u-boost-stranger', 'Stranger');

  // 1. Create tournament and sidebet
  const resTour = await invoke('POST', '/api/tournaments', {
    headers: { Authorization: `Bearer ${creator.token}` },
    body: {
      name: 'Fredagsgolfen med gänget',
      players: ['Lisa', 'Kalle', 'Micke'],
      visibility: 'friends'
    }
  });
  const tour = resTour.body;

  const resSideBet = await invoke('POST', `/api/tournaments/${tour.id}/sidebets`, {
    headers: { Authorization: `Bearer ${creator.token}` },
    body: {
      name: 'Flest birdies',
      players: ['Lisa', 'Kalle', 'Micke'],
      betMode: 'open',
      betAmount: 50,
      closesAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
    }
  });
  assert.equal(resSideBet.status, 200, 'Sidebet created');
  const sideBet = resSideBet.body.sideBets[0];

  // 2. Stranger cannot boost (403)
  const resStrangerBoost = await invoke('POST', `/api/events/${sideBet.id}/boost`, {
    headers: { Authorization: `Bearer ${stranger.token}` }
  });
  assert.equal(resStrangerBoost.status, 403, 'Unauthorized user cannot boost');

  // 3. Creator boosts the game (200)
  const resBoost1 = await invoke('POST', `/api/events/${sideBet.id}/boost`, {
    headers: { Authorization: `Bearer ${creator.token}` }
  });
  assert.equal(resBoost1.status, 200, 'Creator boost succeeded');
  assert.equal(resBoost1.body.ok, true);

  // 4. Immediate second boost triggers cooldown (429)
  const resBoost2 = await invoke('POST', `/api/events/${sideBet.id}/boost`, {
    headers: { Authorization: `Bearer ${creator.token}` }
  });
  assert.equal(resBoost2.status, 429, 'Second boost within 10 min rejected with 429');
  assert.match(resBoost2.body.error, /nyligen/i);
});
