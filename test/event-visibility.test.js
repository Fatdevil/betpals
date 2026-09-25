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

test('Anonymous viewers can open a standalone match but never see Swish numbers or user ids', async () => {
  const host = await registerUser('visH');
  const ev = (await call('POST', '/api/events', { name: 'Öppen match', players: ['A', 'B'], swishNumber: '0701112233' }, host.token)).body;
  await call('POST', `/api/events/${ev.id}/bets`, { playerId: ev.players[0].id, amount: 50 }, host.token);

  const anon = await call('GET', `/api/events/${ev.shareCode}`);
  assert.equal(anon.status, 200);
  assert.equal(anon.body.swishNumber, undefined);
  assert.ok(anon.body.bets.length === 1 && anon.body.bets[0].userId === undefined);

  const loggedIn = await call('GET', `/api/events/${ev.shareCode}`, null, host.token);
  assert.equal(loggedIn.body.swishNumber, '0701112233');
});

test('Rounds of a friends-only tournament are hidden from anonymous users and non-friends', async () => {
  const host = await registerUser('visT');
  const stranger = await registerUser('visS');
  const tour = (await call('POST', '/api/tournaments', { name: 'Privat golfresa', visibility: 'friends' }, host.token)).body;
  const withRound = (await call('POST', `/api/tournaments/${tour.id}/rounds`, { name: 'Rond 1', players: ['A', 'B'] }, host.token)).body;
  const roundCode = withRound.rounds[0].shareCode;

  assert.equal((await call('GET', `/api/events/${roundCode}`)).status, 401);
  assert.equal((await call('GET', `/api/events/${roundCode}`, null, stranger.token)).status, 403);
  assert.equal((await call('GET', `/api/events/${roundCode}`, null, host.token)).status, 200);

  const anonList = (await call('GET', '/api/events?all=1')).body;
  assert.ok(!anonList.some(e => e.shareCode === roundCode), 'private round must not be listed publicly');
  const hostList = (await call('GET', '/api/events?all=1', null, host.token)).body;
  assert.ok(hostList.some(e => e.shareCode === roundCode));
});

test('The default match list shows standalone matches only (rounds live under their tournament)', async () => {
  const host = await registerUser('visL');
  const tour = (await call('POST', '/api/tournaments', { name: 'Lista', visibility: 'friends' }, host.token)).body;
  const withRound = (await call('POST', `/api/tournaments/${tour.id}/rounds`, { name: 'Rond 1', players: ['A', 'B'] }, host.token)).body;
  const list = (await call('GET', '/api/events', null, host.token)).body;
  assert.ok(!list.some(e => e.shareCode === withRound.rounds[0].shareCode));
  assert.ok(list.every(e => !e.tournamentId));
});
