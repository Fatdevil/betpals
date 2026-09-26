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
const code = () => crypto.randomBytes(4).toString('hex').toUpperCase();
const todoKeys = (userId) => db.getInboxTodos(userId).map(t => t.key.split(':')[0]);

async function eventWithGame(closesAt = null) {
  const host = await registerUser('ho'), guest = await registerUser('gu');
  db.addFriend(host.id, guest.id);
  const tId = uid();
  db.createTournament(tId, 'Hockeykväll', code(), host.id, 'friends', [host, guest].map(u => ({ name: u.nickname, userId: u.id })));
  const ev = uid(), p1 = uid(), p2 = uid();
  db.createEvent({ id: ev, name: 'FBK – Löven', tournamentId: tId, creatorId: host.id, closesAt }, [{ id: p1, name: '1 FBK' }, { id: p2, name: '2 Löven' }]);
  return { host, guest, tId, ev, p1, p2 };
}

test('deciding a game tells each bettor their own result in the bell', async () => {
  const { host, guest, ev, p1, p2 } = await eventWithGame();
  db.addBet(uid(), ev, host.nickname, p1, 50, host.id);
  db.addBet(uid(), ev, guest.nickname, p2, 50, guest.id);
  assert.equal((await call('POST', `/api/events/${ev}/finish`, { winnerId: p1 }, host.token)).status, 200);

  const hostItem = db.getInbox(host.id).items.find(n => n.type === 'game_result');
  const guestItem = db.getInbox(guest.id).items.find(n => n.type === 'game_result');
  assert.equal(hostItem.detail, 'Du vann 50 kr');
  assert.equal(guestItem.detail, 'Du förlorade 50 kr');
  assert.match(guestItem.text, /FBK – Löven: 1 FBK vann/);
});

test('the host is asked to decide a closed game, then to end the event', async () => {
  const { host, guest, ev, p1, p2 } = await eventWithGame(new Date(Date.now() - 60000).toISOString());
  db.addBet(uid(), ev, host.nickname, p1, 50, host.id);
  db.addBet(uid(), ev, guest.nickname, p2, 50, guest.id);
  assert.ok(todoKeys(host.id).includes('decide'));
  assert.ok(!todoKeys(guest.id).includes('decide'));

  db.finishEvent(ev, p2);
  assert.ok(!todoKeys(host.id).includes('decide'));
  assert.ok(todoKeys(host.id).includes('end-event'));
});

test('money that is ready to swish is a to-do; money in a running event is not', async () => {
  const { host, guest, tId, ev, p1, p2 } = await eventWithGame();
  db.addBet(uid(), ev, host.nickname, p1, 50, host.id);
  db.addBet(uid(), ev, guest.nickname, p2, 50, guest.id);
  db.finishEvent(ev, p1);
  assert.ok(!todoKeys(guest.id).includes('swish'));
  db.settleTournament(tId);
  const swish = db.getInboxTodos(guest.id).find(t => t.key === 'swish');
  assert.equal(swish.title, 'Du ska swisha 50 kr');
});

test('an unanswered BlixtBet sent to you is a to-do until you answer', async () => {
  const a = await registerUser('fa'), b = await registerUser('fb');
  const fb = uid();
  db.createFlashBet(fb, a.id, null, 'Regnar det?', 300, new Date(Date.now() + 300000).toISOString(), 20, [b.id]);
  assert.ok(todoKeys(b.id).includes('flashbet'));
  assert.ok(!todoKeys(a.id).includes('flashbet'));
  db.placeFlashBetEntry(uid(), fb, b.id, 'yes', 20);
  assert.ok(!todoKeys(b.id).includes('flashbet'));
});

test('AnyBet invitations and judging show up for the right person', async () => {
  const judge = await registerUser('ju'), a = await registerUser('aa'), b = await registerUser('bb');
  const bet = db.createAnyBet({ title: 'Vem vinner?', creatorId: judge.id, judgeId: judge.id, stakeAmount: 20, betType: 'winner_takes_all', participantIds: [a.id, b.id], creatorPlays: false });
  assert.ok(todoKeys(a.id).includes('anybet-invite'));
  for (const u of [a, b]) db.acceptAnyBet(bet.id, u.id);
  assert.ok(!todoKeys(a.id).includes('anybet-invite'));
  assert.ok(todoKeys(judge.id).includes('anybet-judge'));
});

test('every push also lands in the bell (except friend requests, shown as actions)', async () => {
  const { host, guest, tId } = await eventWithGame();
  const other = await registerUser('ot');
  db.addFriend(host.id, other.id);
  assert.equal((await call('POST', `/api/tournaments/${tId}/invite`, { friendIds: [other.id] }, host.token)).status, 200);
  const item = db.getInbox(other.id).items[0];
  assert.equal(item.icon, '🏆');
  assert.equal(item.text, 'Inbjudan till event!');
  assert.match(item.detail, /Hockeykväll/);

  await call('POST', '/api/friends', { friendId: guest.id }, other.token);
  assert.equal(db.getInbox(guest.id).items.some(n => /vänförfrågan/i.test(n.text)), false);
  assert.equal(db.getInbox(guest.id).friendRequests.length, 1);
});

test('the bell and home share one list; game-page chatter is gone from the bell', () => {
  const bell = readFileSync(new URL('../src/components/notifications.js', import.meta.url), 'utf8');
  assert.match(bell, /\$\{todos\.map\(t => `/);
  assert.doesNotMatch(bell, /På spelsidan/);
  assert.match(bell, /export function handleWebSocketNotification\(\) \{\}/);
  const home = readFileSync(new URL('../src/pages/home.js', import.meta.url), 'utf8');
  assert.match(home, /for \(const t of inbox\?\.todos \|\| \[\]\)/);
});
