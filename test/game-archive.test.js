process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
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
    name: nickname + ' Testsson', nickname,
    swishNumber: '07' + String(crypto.randomInt(0, 100000000)).padStart(8, '0'), pin: '1111'
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}

const uid = () => crypto.randomUUID();
async function gameInEvent({ withBets }) {
  const host = await registerUser('gh');
  const friend = await registerUser('gf');
  const tId = uid();
  db.createTournament(tId, 'Hockeykväll', crypto.randomBytes(4).toString('hex').toUpperCase(), host.id, 'friends',
    [host, friend].map(u => ({ name: u.nickname, userId: u.id })));
  const ev = uid(), p1 = uid(), p2 = uid();
  db.createEvent({ id: ev, name: 'FBK – Löven', tournamentId: tId, creatorId: host.id }, [{ id: p1, name: '1' }, { id: p2, name: '2' }]);
  if (withBets) {
    db.addBet(uid(), ev, host.nickname, p1, 50, host.id);
    db.addBet(uid(), ev, friend.nickname, p2, 50, friend.id);
  }
  return { host, friend, ev, p1, p2 };
}

test('a decided game cannot be removed or cancelled: its wins and debts stay on The Tab', async () => {
  const { host, friend, ev, p2 } = await gameInEvent({ withBets: true });
  db.finishEvent(ev, p2);
  const del = await call('DELETE', `/api/events/${ev}`, {}, host.token);
  assert.equal(del.status, 400);
  const cancel = await call('POST', `/api/events/${ev}/cancel`, {}, host.token);
  assert.equal(cancel.status, 400);
  assert.ok(db.getEventById(ev));
  assert.equal(db.getUnifiedSettlementOverview(host.id).friends.find(f => f.friendId === friend.id)?.totalNet, -50);
});

test('a game with bets is cancelled (stakes back), not removed', async () => {
  const { host, ev } = await gameInEvent({ withBets: true });
  assert.equal((await call('DELETE', `/api/events/${ev}`, {}, host.token)).status, 400);
  assert.equal((await call('POST', `/api/events/${ev}/cancel`, {}, host.token)).status, 200);
  assert.equal(db.getEventById(ev).status, 'cancelled');
  // A cancelled game can be tidied away
  assert.equal((await call('DELETE', `/api/events/${ev}`, {}, host.token)).status, 200);
});

test('a game nobody has bet on can still be removed', async () => {
  const { host, ev } = await gameInEvent({ withBets: false });
  assert.equal((await call('DELETE', `/api/events/${ev}`, {}, host.token)).status, 200);
  assert.equal(db.getEventById(ev), undefined);
});

test('the event page folds decided games away and offers the right action per game', () => {
  const page = readFileSync(new URL('../src/pages/tournament.js', import.meta.url), 'utf8');
  assert.match(page, /<details class="game-done">/);
  assert.match(page, /✅ Avgjorda spel \(\$\{doneCount\}\)/);
  assert.match(page, /const activeGroups = groups\.filter\(gr => !gr\.every\(isDone\)\);/);
  assert.match(page, /\$\{isCreator && g\.status !== 'finished' \? `<button type="button" class="game-card-menu"/);
  assert.match(page, /btn\.dataset\.hasBets \? \['cancel', '🛑 Avbryt spelet – insatserna går tillbaka'\] : \['remove', '🗑️ Ta bort spelet'\]/);
});
