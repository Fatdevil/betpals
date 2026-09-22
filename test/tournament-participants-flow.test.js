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

test('Tournament Creation Flow: No automatic Rond 1, stores participants & allows adding games later', async () => {
  const host = createTestUser('u-flow-host', 'HostFlow');
  const friends = ['Alex', 'Johan', 'Sara', 'Micke', 'Lisa', 'Tobbe'];

  // 1. Create tournament via API
  const resCreate = await invoke('POST', '/api/tournaments', {
    headers: { Authorization: `Bearer ${host.token}` },
    body: {
      name: 'Handbolls Afton',
      players: friends,
      visibility: 'friends'
    }
  });

  assert.equal(resCreate.status, 200, 'Tournament creation should succeed');
  const tour = resCreate.body;
  assert.equal(tour.name, 'Handbolls Afton');
  assert.equal(tour.rounds.length, 0, 'Should NOT create Rond 1 automatically');
  assert.equal(tour.sideBets.length, 0, 'Should NOT create any side bets automatically');
  assert.ok(tour.players.length >= 6, 'Should have all 6 friend participants in players');
  friends.forEach(f => {
    assert.ok(tour.players.includes(f), `Participant ${f} should be present in players list`);
  });

  // 2. Add an additional participant via API
  const resAddPart = await invoke('POST', `/api/tournaments/${tour.id}/participants`, {
    headers: { Authorization: `Bearer ${host.token}` },
    body: {
      name: 'Gustav'
    }
  });
  assert.equal(resAddPart.status, 200, 'Adding participant should succeed');
  assert.ok(resAddPart.body.players.includes('Gustav'), 'New participant Gustav should be in players list');

  // 3. Add game to tournament later
  const resAddGame = await invoke('POST', `/api/tournaments/${tour.id}/rounds`, {
    headers: { Authorization: `Bearer ${host.token}` },
    body: {
      name: '1X2 Sverige vs Danmark',
      players: ['1 (Sverige)', 'X (Oavgjort)', '2 (Danmark)'],
      betMode: 'open'
    }
  });
  assert.equal(resAddGame.status, 200, 'Adding game should succeed');
  assert.equal(resAddGame.body.rounds.length, 1, 'Should now have exactly 1 round');
  assert.equal(resAddGame.body.rounds[0].name, '1X2 Sverige vs Danmark');
});
