process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as db from '../server/db.js';

const { server } = await import('../server/server.js');

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

test('P1 — Unified Settlements: GET /api/settlements/overview requires authentication', async () => {
  const res = await call('GET', '/api/settlements/overview');
  assert.equal(res.status, 401);
});

test('P1 — Unified Settlements: combines duel debts into totalNet overview', async () => {
  const u1 = await registerUser('unif1');
  const u2 = await registerUser('unif2');

  // Create a duel: u1 vs u2, stake 100 kr
  const duel = db.createDuel({
    gameType: 'dice',
    creatorId: u1.id,
    opponentId: u2.id,
    stakeAmount: 100,
    mode: 'table'
  });
  assert.ok(duel);

  // u2 wins against u1 -> u1 owes u2 100 kr
  db.submitDuelResult({
    duelId: duel.id,
    creatorScore: 2,
    opponentScore: 6,
    winnerId: u2.id
  });

  // u1's overview: totalNet should be -100, totalOwed 100, totalDue 0
  const res1 = await call('GET', '/api/settlements/overview', null, u1.token);
  assert.equal(res1.status, 200);
  assert.equal(res1.body.totalNet, -100);
  assert.equal(res1.body.totalOwed, 100);
  assert.equal(res1.body.totalDue, 0);
  assert.equal(res1.body.friends.length, 1);
  assert.equal(res1.body.friends[0].friendId, u2.id);
  assert.equal(res1.body.friends[0].totalNet, -100);

  // u2's overview: totalNet should be +100, totalOwed 0, totalDue 100
  const res2 = await call('GET', '/api/settlements/overview', null, u2.token);
  assert.equal(res2.status, 200);
  assert.equal(res2.body.totalNet, 100);
  assert.equal(res2.body.totalOwed, 0);
  assert.equal(res2.body.totalDue, 100);
  assert.equal(res2.body.friends.length, 1);
  assert.equal(res2.body.friends[0].friendId, u1.id);
  assert.equal(res2.body.friends[0].totalNet, 100);
});
