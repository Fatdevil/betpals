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

async function eventWith(extraGuest = null) {
  const host = await registerUser('eh'), a = await registerUser('ea'), b = await registerUser('eb');
  const tId = uid();
  const people = [host, a, b].map(u => ({ name: u.nickname, userId: u.id }));
  if (extraGuest) people.push({ name: extraGuest, userId: null });
  db.createTournament(tId, 'Golfhelg', crypto.randomBytes(4).toString('hex').toUpperCase(), host.id, 'friends', people);
  const part = (userId) => db.getTournamentParticipants(tId).find(p => p.user_id === userId);
  return { host, a, b, tId, part };
}
function betIn(tId, user, amount = 50) {
  const ev = uid(), p1 = uid(), p2 = uid();
  db.createEvent({ id: ev, name: 'Match', tournamentId: tId, creatorId: user.id }, [{ id: p1, name: '1' }, { id: p2, name: '2' }]);
  db.addBet(uid(), ev, user.nickname, p1, amount, user.id);
  return ev;
}

test('the host can remove someone without money in the event', async () => {
  const { host, a, tId, part } = await eventWith();
  const res = await call('DELETE', `/api/tournaments/${tId}/participants/${part(a.id).id}`, {}, host.token);
  assert.equal(res.status, 200);
  assert.equal(part(a.id), undefined);
});

test('someone with bets cannot be removed (their money would vanish), until the game is cancelled', async () => {
  const { host, a, tId, part } = await eventWith();
  const ev = betIn(tId, a);
  const res = await call('DELETE', `/api/tournaments/${tId}/participants/${part(a.id).id}`, {}, host.token);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /har spel i eventet/);
  db.cancelEvent(ev);
  assert.equal((await call('DELETE', `/api/tournaments/${tId}/participants/${part(a.id).id}`, {}, host.token)).status, 200);
});

test('others cannot remove people; you can leave yourself; the host cannot be removed', async () => {
  const { host, a, b, tId, part } = await eventWith();
  assert.equal((await call('DELETE', `/api/tournaments/${tId}/participants/${part(b.id).id}`, {}, a.token)).status, 403);
  assert.equal((await call('DELETE', `/api/tournaments/${tId}/participants/${part(a.id).id}`, {}, a.token)).status, 200);
  const hostRow = part(host.id);
  if (hostRow) assert.equal((await call('DELETE', `/api/tournaments/${tId}/participants/${hostRow.id}`, {}, host.token)).status, 400);
});

test('a guest (no account) can be removed by the host', async () => {
  const { host, tId } = await eventWith('Kusin Kalle');
  const guest = db.getTournamentParticipants(tId).find(p => p.name === 'Kusin Kalle');
  assert.equal((await call('DELETE', `/api/tournaments/${tId}/participants/${guest.id}`, {}, host.token)).status, 200);
});

test('deleting an account removes it from events without money and marks it where it played', async () => {
  const one = await eventWith();
  const two = await eventWith();
  db.addTournamentParticipant(two.tId, one.a.nickname, one.a.id);
  betIn(two.tId, one.a);
  db.deleteUser(one.a.id);

  assert.equal(db.getTournamentParticipants(one.tId).some(p => p.name === one.a.nickname), false);
  const kept = db.getFullTournament(two.tId).participants.find(p => p.name === one.a.nickname);
  assert.ok(kept, 'kept where their results are part of the settlement');
  assert.equal(kept.accountDeleted, true);
  assert.equal(kept.userId, null);
});

test('the people list shows remove / leave buttons and the deleted-account label', () => {
  const page = readFileSync(new URL('../src/pages/tournament.js', import.meta.url), 'utf8');
  assert.match(page, /class="event-people-remove" data-remove=/);
  assert.match(page, /id="event-leave-btn">🚪 Lämna eventet/);
  assert.match(page, /\(konto borttaget\)/);
});

test('a removed (or leaving) person is not added back by opening the event; the host inviting them is', async () => {
  const { host, a, tId, part } = await eventWith();
  db.addFriend(host.id, a.id);
  const t = db.getTournamentById(tId);
  await call('DELETE', `/api/tournaments/${tId}/participants/${part(a.id).id}`, {}, host.token);
  assert.equal((await call('GET', `/api/tournaments/${t.share_code}`, null, a.token)).status, 200);
  assert.equal(part(a.id), undefined, 'opening the event does not re-add');
  assert.equal((await call('POST', `/api/tournaments/${tId}/invite`, { friendIds: [a.id] }, host.token)).status, 200);
  assert.ok(part(a.id), 'invited again by the host');
});

test('a kept deleted-account row that gets an account again loses the deleted label', async () => {
  const { a, tId } = await eventWith();
  betIn(tId, a);
  db.deleteUser(a.id);
  const kept = db.getFullTournament(tId).participants.find(p => p.name === a.nickname);
  assert.equal(kept.accountDeleted, true);
  // Someone registers again with the now free nickname and joins the event
  const again = crypto.randomUUID();
  db.createUser(again, a.nickname, crypto.randomUUID(), '🙂', a.nickname, '0700000001', '1111');
  db.addTournamentParticipant(tId, a.nickname, again);
  const after = db.getFullTournament(tId).participants.find(p => p.id === kept.id);
  assert.equal(after.userId, again);
  assert.equal(after.accountDeleted, false);
});
